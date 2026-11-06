"""Valutazione f3: Trap Set anti-eco + Yc held-out (Set A induttivo, Set B edge-split).

Uso:
  py -m services.graph_dense.eval_f3 --modello f3 --trap
  py -m services.graph_dense.eval_f3 --modello f3 --yc
  py -m services.graph_dense.eval_f3 --build-splits       # crea yc-split.npz (una volta)

Trap Set: data/trap-set.json
  {"categorie": {"brand": [{"key": "movie:346698", "nome": "Barbie",
                             "bad": ["movie:...", ...], "good": ["movie:...", ...]}, ...], ...}}
  contamination@5/@10 = quota di "bad" nei primi 5/10; hit@10 = quota di "good" nei primi 10.

Yc held-out: GT = top-10 Yc grezza (penalità 120gg); 3 fasce per grado pesato del grafo;
  900 Set A (esclusi dalla loss e dai centroidi) + 900 Set B (5 dei 10 vicini mascherati
  a monte in Yc e nel grafo prima di costruire i target). Recall@20 calcolato sul canone.
"""
from __future__ import annotations

import argparse
import json

import numpy as np

from . import config as C
from . import data as D

TOPK = 50


def _top(Z, i, k, exclude=None):
    s = Z @ Z[i]
    s[i] = -1e9
    if exclude is not None:
        s[np.asarray(exclude, dtype=np.int64)] = -1e9
    return np.argsort(-s)[:k]


def trap(model="f3", rerank=False):
    B = D.basic(); ro = B["row_of"]
    z = np.load(C.DATA / f"{model}.npz"); Z = z["Z"].astype(np.float32)
    Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
    Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
    date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32); is_tv = B["is_tv"]
    t = json.load(open(C.DATA / "trap-set.json", encoding="utf-8"))
    rows = []
    for cat, items in t["categorie"].items():
        c5 = c10 = h10 = 0.0; n = 0
        for it in items:
            k = it["key"]
            if k not in ro:
                continue
            i = int(ro[k])
            if rerank:
                cos = Z @ Z[i]; cos[i] = -1e9
                beh = Yc[i] @ Yc.T; beh[i] = -1e9
                if not is_tv[i] and date[i] > 0:
                    near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120); beh[near] *= 0.2
                top = np.argsort(-(cos + 0.3 * beh))[:10]
            else:
                top = _top(Z, i, 10)
            bad = {int(ro[x]) for x in it.get("bad", []) if x in ro and x != k}
            good = {int(ro[x]) for x in it.get("good", []) if x in ro and x != k}
            if not bad and not good:
                continue
            c5 += len(set(top[:5]) & bad)
            c10 += len(set(top) & bad)
            h10 += len(set(top) & good) / max(len(good), 1)
            n += 1
        if n:
            rows.append((cat, c5 / n, c10 / n, h10 / n, n))
    print(f"{'categoria':14s} {'cont@5':>7s} {'cont@10':>7s} {'hit@10':>7s} {'n':>3s}")
    for r in rows:
        print(f"{r[0]:14s} {r[1]:7.2f} {r[2]:7.2f} {r[3]:7.2f} {r[4]:3d}")
    print("Gate1: cont@5=0 sui 5 bandiera · cont@10<=1 per categoria · hit@10 >= b10")


def _gt_yc(n=10):
    """Top-n Yc grezza con penalità 120 giorni (film-film)."""
    B = D.basic(); N = B["N"]; is_tv = B["is_tv"]
    date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32)
    Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
    nrm = np.linalg.norm(Yc, axis=1); raw = nrm > 1e-6; Yc[raw] /= nrm[raw, None]
    gt = np.full((N, n), -1, np.int32)
    for i in range(N):
        if not raw[i]:
            continue
        cov = Yc[i] @ Yc.T; cov[i] = -1e9
        if not is_tv[i] and date[i] > 0:
            near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120)
            cov[near] *= 0.2
        gt[i] = np.argsort(-cov)[:n]
    return gt, raw


def build_splits():
    """3 fasce per grado pesato del grafo; 300 Set A + 300 Set B per fascia."""
    B = D.basic(); N = B["N"]
    S = D.triangle().tocsr()
    deg = np.asarray(abs(S).sum(1)).ravel()
    raw = np.load(C.DATA / "ml-yc.npz")["Yc"]
    raw = np.linalg.norm(raw, axis=1) > 1e-6
    keep = np.load(C.DATA / "canon-clean.npz")["keep"] if (C.DATA / "canon-clean.npz").exists() else np.ones(N, bool)
    idx = np.where(raw & keep)[0]
    q1, q2 = np.quantile(deg[idx], [1 / 3, 2 / 3])
    strata = np.digitize(deg[idx], [q1, q2])
    rng = np.random.default_rng(20261025)
    A, Bs = [], []
    for s in range(3):
        pool = idx[strata == s]
        rng.shuffle(pool)
        A += pool[:300].tolist(); Bs += pool[300:600].tolist()
    A = np.array(A, np.int64); Bs = np.array(Bs, np.int64)
    gt, _ = _gt_yc(10)
    rng2 = np.random.default_rng(7)
    mask = np.full((N, 10), -1, np.int32)   # per Set B: 5 vicini mascherati (indici 0..9)
    for i in Bs:
        mask[i] = -1
        mask[i][:5] = rng2.choice(10, 5, replace=False)
    np.savez_compressed(C.DATA / "yc-split.npz", A=A, B_=Bs, mask=mask, gt=gt, deg=deg)
    print(f"Set A {len(A)} · Set B {len(Bs)} · fasce: {q1:.1f}/{q2:.1f}")


def yc_eval(model="f3"):
    B = D.basic(); ro = B["row_of"]; N = B["N"]
    z = np.load(C.DATA / f"{model}.npz")
    split = np.load(C.DATA / "yc-split.npz")
    A, Bs, mask, gt = split["A"], split["B_"], split["mask"], split["gt"]
    out = {}
    parts = [("concat", "Z")]
    for nome, key in (("sem", "Z_sem"), ("field", "Z_field"), ("beh", "Z_beh")):
        if key in z.files:
            parts.append((nome, key))
    for nome, key in parts:
        Z = z[key]
        Z = Z.astype(np.float32)
        rec = []
        for i in A:
            top = _top(Z, int(i), 20)
            rec.append(len(set(top) & set(int(x) for x in gt[i] if x >= 0)) / 10.0)
        out[f"A/{nome}"] = float(np.mean(rec)) if rec else float("nan")
        rec = []
        for i in Bs:
            held = [int(x) for x in gt[i][mask[i] >= 0]]
            seen = [int(x) for x in gt[i] if x >= 0 and x not in held]
            if not held:
                continue
            top = _top(Z, int(i), 20, exclude=seen)
            rec.append(len(set(top) & set(held)) / len(held))
        out[f"B/{nome}"] = float(np.mean(rec)) if rec else float("nan")
    for k, v in out.items():
        print(f"{k:12s} {v:.3f}")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--modello", default="f3")
    ap.add_argument("--trap", action="store_true")
    ap.add_argument("--rerank", action="store_true")
    ap.add_argument("--yc", action="store_true")
    ap.add_argument("--build-splits", action="store_true")
    a = ap.parse_args(argv)
    if a.build_splits:
        build_splits()
    if a.trap:
        trap(a.modello, rerank=a.rerank)
    if a.yc:
        yc_eval(a.modello)


if __name__ == "__main__":
    main()
