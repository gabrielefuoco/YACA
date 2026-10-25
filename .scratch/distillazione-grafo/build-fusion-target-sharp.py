"""Target fusione: top-50 b10 + top-50 m1, rerank lambda=0.3, confidenza, fusione. File separato."""
import json, os, sys, time
import numpy as np
import torch
from services.graph_dense import config as C, data as D

B = D.basic(); N = B["N"]; is_tv = B["is_tv"]; date = np.load(C.DATA / "uscite-ordinali.npy")
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
S = D.triangle()
Zb = np.load(C.DATA / "b10.npz")["Z"].astype(np.float32)
Zm = np.load(C.DATA / "m1.npz")["Z"].astype(np.float32)
OUT = C.DATA / "fusion-target-sharp.npz"
DONE = C.DATA / "fusion-done-sharp.json"
LAM = 0.3
TOPK = 50
CH = 256

dev = "cuda" if torch.cuda.is_available() else "cpu"
ZbT = torch.from_numpy(Zb).to(dev)
ZmT = torch.from_numpy(Zm).to(dev)

idx_all = np.full((N, TOPK), -1, np.int32)
w_all = np.zeros((N, TOPK), np.float16)
conf_b = np.zeros(N, np.float32); conf_m = np.zeros(N, np.float32)
start = 0
if DONE.exists():
    d = json.load(open(DONE)); start = int(d["done"])
    if OUT.exists():
        z = np.load(OUT)
        idx_all = z["idx"]; w_all = z["w"]
        conf_b = z["conf_b"]; conf_m = z["conf_m"]
    print("riprendo da", start, flush=True)


def beh_block(rows):
    """beh = 0.5*graph + 0.5*cov (con penalita' 120 giorni sui film), riga per riga."""
    cov = Yc[rows] @ Yc.T
    cov[np.arange(len(rows)), rows] = -1e4
    near = (date[rows][:, None] > 0) & ((np.abs(date[None, :] - date[rows][:, None])) < 120)
    near &= (~is_tv[rows])[:, None] & (~is_tv)[None, :]
    cov[near] *= 0.2
    g = S[rows].toarray().astype(np.float32)
    gm = g.max(1, keepdims=True)
    cm = cov.max(1, keepdims=True)
    return 0.5 * (g / (gm + 1e-9)) + 0.5 * (cov / (cm + 1e-9))


t0 = time.time()
for st in range(start, N, CH):
    rows = np.arange(st, min(st + CH, N))
    with torch.no_grad():
        Qb = ZbT[rows]; Sb = Qb @ ZbT.T
        Qm = ZmT[rows]; Sm = Qm @ ZmT.T
        vab, iab = torch.topk(Sb, TOPK, dim=1)
        vam, iam = torch.topk(Sm, TOPK, dim=1)
    vab = vab.float().cpu().numpy(); iab = iab.cpu().numpy()
    vam = vam.float().cpu().numpy(); iam = iam.cpu().numpy()
    bh = beh_block(rows)
    for q, i in enumerate(rows):
        cib = iab[q]; cim = iam[q]
        bb = bh[q]
        sb = vab[q] + LAM * bb[cib]
        sm = vam[q] + LAM * bb[cim]
        # ordine del rerank, poi softmax sharp e confidenza = gap assoluto 1-2
        ob = np.argsort(-sb); sb = sb[ob]; cib = cib[ob]
        om = np.argsort(-sm); sm = sm[om]; cim = cim[om]
        T = 0.02
        pb = np.exp((sb - sb.max()) / T); pb /= pb.sum()
        pm = np.exp((sm - sm.max()) / T); pm /= pm.sum()
        gb = float(sb[0] - sb[1]); gm2 = float(sm[0] - sm[1])
        wb = gb / (gb + gm2 + 1e-9); wm = 1.0 - wb
        sc = {}
        for j in range(TOPK):
            sc[int(cib[j])] = sc.get(int(cib[j]), 0.0) + wb * float(pb[j])
        for j in range(TOPK):
            sc[int(cim[j])] = sc.get(int(cim[j]), 0.0) + wm * float(pm[j])
        order = sorted(sc, key=lambda x: -sc[x])[:TOPK]
        vals = np.array([sc[x] for x in order], np.float32)
        vals /= (vals.sum() + 1e-9)
        idx_all[i, :len(order)] = order
        w_all[i, :len(order)] = vals.astype(np.float16)
        conf_b[i] = wb; conf_m[i] = wm
    if (st // CH) % 20 == 19 or st + CH >= N:
        np.savez_compressed(OUT, idx=idx_all, w=w_all, conf_b=conf_b, conf_m=conf_m)
        json.dump({"done": int(min(st + CH, N))}, open(DONE, "w"))
    print(f"{min(st+CH,N)}/{N} · {time.time()-t0:.0f}s", flush=True)

print("fatto", OUT, "copertura:", int((idx_all >= 0).any(1).sum()), "/", N, flush=True)
