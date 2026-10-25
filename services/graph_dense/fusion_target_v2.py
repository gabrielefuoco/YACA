"""fusion-target-v2: pool allargato + filtro medium a due regole + fusione per confidenza.

Pool U_i = top40(b10) ∪ top40(m1) ∪ top25(beh_puro)
  beh_puro(i,j) = 0.5*graph(i,j) + 0.5*Yc_full(i,j)   (normalizzati separatamente, penalità 120gg)
Score per ramo:  s_b = cos_b10 + 0.3*beh    s_m = cos_m1 + 0.3*beh
Filtro medium (query non-animazione, candidato animazione):
  R1 brand/kids : rating in {G,PG,TV-Y,TV-G} o assente  AND  stessa collection  -> x0.15
  R2 deriva     : nessuna collection in comune AND beh < max(q85(U_i), 0.05)     -> x0.25
Fusione: p = softmax(s/T), T=0.02, conf = s[0]-s[1], w = conf_b/(conf_b+conf_m),
         score = w*p_b + (1-w)*p_m  -> top-50, pesi normalizzati a 1.

Uso: py -m services.graph_dense.fusion_target_v2 [--epoche ...]   (checkpoint ogni chunk)
Output: data/fusion-target-v2.npz (idx (N,50) int32, w (N,50) fp16, conf_b (N,), conf_m (N,))
        data/fusion-v2-done.json
"""
from __future__ import annotations

import json
import time

import numpy as np
import pandas as pd
import torch

from . import config as C
from . import data as D

LAM = 0.3
T = 0.02
TOPK = 50
CH = 256
OUT = C.DATA / "fusion-target-v2.npz"
DONE = C.DATA / "fusion-v2-done.json"


def load_meta(B):
    """genere (set), rating, collection per riga del canone."""
    row_of = B["row_of"]
    gen = [set() for _ in range(B["N"])]
    rating = [""] * B["N"]
    coll = B["COLL"].astype(np.int64).copy()
    for tipo, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
        cols = ["id", "genres", "content_rating"]
        d = pd.read_parquet(C.TMDB / f, columns=cols)
        for r in d.itertuples(index=False):
            i = row_of.get(f"{tipo}:{int(r.id)}")
            if i is None:
                continue
            if isinstance(r.genres, str):
                try:
                    gen[i] = {g["name"].lower() for g in json.loads(r.genres) if isinstance(g, dict)}
                except Exception:
                    gen[i] = set()
            cr = r.content_rating
            rating[i] = cr.strip().upper() if isinstance(cr, str) else ""
    return gen, rating, coll


def beh_block(rows, Yc, S, date, is_tv, keep):
    cov = Yc[rows] @ Yc.T
    cov[np.arange(len(rows)), rows] = -1e4
    near = (date[rows][:, None] > 0) & (np.abs(date[None, :] - date[rows][:, None]) < 120)
    near &= (~is_tv[rows])[:, None] & (~is_tv)[None, :]
    cov[near] *= 0.2
    g = S[rows].toarray().astype(np.float32)
    gm = np.maximum(g.max(1, keepdims=True), 1e-9)
    cm = np.maximum(cov.max(1, keepdims=True), 1e-9)
    out = 0.5 * (g / gm) + 0.5 * (cov / cm)
    out[~keep[rows]] = 0.0          # righe sporche: fuori dal pool
    return out


def main():
    B = D.basic(); N = B["N"]; is_tv = B["is_tv"]
    date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32)
    Yc = np.load(C.DATA / "yc-full.npz")["Yc_full"].astype(np.float32)
    S = D.masked_yc_and_graph()
    Zb = np.load(C.DATA / "b10.npz")["Z"].astype(np.float32)
    Zm = np.load(C.DATA / "m1.npz")["Z"].astype(np.float32)
    keep = np.load(C.DATA / "canon-clean.npz")["keep"]
    gen, rating, coll = load_meta(B)
    tit_norm = [(str(t).strip().lower().split() or [""])[0] for t in B["titoli"]]
    anim = np.array(["animation" in g for g in gen])
    kids = np.array([r in ("G", "PG", "TV-Y", "TV-G", "TV-Y7") or r == "" for r in rating])
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    ZbT = torch.from_numpy(Zb).to(dev); ZmT = torch.from_numpy(Zm).to(dev)

    idx_all = np.full((N, TOPK), -1, np.int32)
    w_all = np.zeros((N, TOPK), np.float16)
    cbf = np.zeros(N, np.float32); cmf = np.zeros(N, np.float32)
    start = 0
    if DONE.exists():
        start = int(json.load(open(DONE))["done"])
        if OUT.exists():
            z = np.load(OUT)
            idx_all, w_all, cbf, cmf = z["idx"], z["w"], z["conf_b"], z["conf_m"]
        print("riprendo da", start, flush=True)

    t0 = time.time()
    for st in range(start, N, CH):
        rows = np.arange(st, min(st + CH, N))
        with torch.no_grad():
            Qb = ZbT[rows]; cb = Qb @ ZbT.T
            Qm = ZmT[rows]; cm = Qm @ ZmT.T
            vb, ib = torch.topk(cb, 40, dim=1)
            vm, im = torch.topk(cm, 40, dim=1)
        vb = vb.float().cpu().numpy(); ib = ib.cpu().numpy()
        vm = vm.float().cpu().numpy(); im = im.cpu().numpy()
        bh = beh_block(rows, Yc, S, date, is_tv, keep)
        for q, i in enumerate(rows):
            if not keep[i]:
                continue
            b = bh[q]
            top_beh = np.argsort(-b)[:25]
            U = np.unique(np.concatenate([ib[q], im[q], top_beh]))
            U = U[U != i]
            if len(U) < 2:
                continue
            s_b = (Zb[U] @ Zb[i]) + LAM * b[U]
            s_m = (Zm[U] @ Zm[i]) + LAM * b[U]
            # filtro medium
            if not anim[i]:
                thr = max(float(np.quantile(b[U], 0.85)), 0.05)
                for t_, j in enumerate(U):
                    if anim[j]:
                        same = ((coll[i] > 0 and coll[i] == coll[j]) or
                                (len(tit_norm[i]) >= 4 and tit_norm[i] in tit_norm[j]))
                        if kids[j] and same:
                            s_b[t_] *= 0.15; s_m[t_] *= 0.15
                        elif (not same) and b[j] < thr:
                            s_b[t_] *= 0.25; s_m[t_] *= 0.25
            ob = np.argsort(-s_b); sb = s_b[ob]
            om = np.argsort(-s_m); sm = s_m[om]
            pb = np.exp((sb - sb.max()) / T); pb /= pb.sum()
            pm = np.exp((sm - sm.max()) / T); pm /= pm.sum()
            gb = float(sb[0] - sb[1]); gm = float(sm[0] - sm[1])
            wb = gb / (gb + gm + 1e-9); wm = 1.0 - wb
            sc = {}
            for j, x in enumerate(U[ob]):
                sc[int(x)] = sc.get(int(x), 0.0) + wb * float(pb[j])
            for j, x in enumerate(U[om]):
                sc[int(x)] = sc.get(int(x), 0.0) + wm * float(pm[j])
            order = sorted(sc, key=lambda x: -sc[x])[:TOPK]
            val = np.array([sc[x] for x in order], np.float32)
            val /= (val.sum() + 1e-9)
            idx_all[i, :len(order)] = order
            w_all[i, :len(order)] = val.astype(np.float16)
            cbf[i] = wb; cmf[i] = wm
        if (st // CH) % 20 == 19 or st + CH >= N:
            np.savez_compressed(OUT, idx=idx_all, w=w_all, conf_b=cbf, conf_m=cmf)
            json.dump({"done": int(min(st + CH, N))}, open(DONE, "w"))
        print(f"{min(st + CH, N)}/{N} · {time.time() - t0:.0f}s", flush=True)
    print("fatto", OUT, "piene:", int((idx_all >= 0).any(1).sum()), "/", N)


if __name__ == "__main__":
    main()
