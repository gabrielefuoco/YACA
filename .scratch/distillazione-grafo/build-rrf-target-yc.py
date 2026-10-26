"""Target RRF: top-50 della fusione a 4 rami (bp, bk, yc, h), pesi 1/(60+rank).
Film: rami bp/bk/yc/h. Serie: rami bp/bk/beh/h (Yc e' vuoto)."""
import numpy as np, torch, torch.nn.functional as F
from services.graph_dense import config as C, data as D
from services.graph_dense.train_b3 import BlockStudentG
from services.graph_dense.train_b1 import _batch_meta

B = D.basic(); N = B["N"]; is_tv = B["is_tv"]
keep = np.load(C.DATA / "blocks.npz")["keep"]
X = D.features(B, extra=True).tocsr()[:, keep]
Bp = np.load(C.DATA / "trama-qwen3b.npy").astype(np.float32); Bp /= (np.linalg.norm(Bp, axis=1, keepdims=True) + 1e-9)
Bk = np.load(C.DATA / "blocks.npz")["Bk"].astype(np.float32)
Yc = np.load(C.DATA / "yc-full.npz")["Yc_full"].astype(np.float32); Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
beh = np.load(C.DATA / "lc150.npz")["Z"].astype(np.float32)
m = BlockStudentG(X.shape[1], 512, 4); m.load_state_dict(torch.load(C.DATA / "b11full-model.pt", map_location="cpu")); m.eval()
H = np.zeros((N, 512), np.float32)
with torch.no_grad():
    for st in range(0, N, 2048):
        rows = np.arange(st, min(st + 2048, N))
        idx, off, val = _batch_meta(X, rows, np.random.default_rng(0), drop=False)
        hh = F.gelu(m.ln(m.bag(idx, off, per_sample_weights=val)))
        H[rows] = F.normalize(m.proj(hh + m.res(hh)), dim=1).numpy()
H /= (np.linalg.norm(H, axis=1, keepdims=True) + 1e-9)
ZF = {"bp": Bp, "bk": Bk, "yc": Yc, "h": H}
ZS = {"bp": Bp, "bk": Bk, "beh": beh, "h": H}
TOPK = 50; K = 60; BATCH = 512
raw = np.linalg.norm(np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32), axis=1) > 1e-6
sel = np.where(raw & ~is_tv)[0]          # SOLO film con co-visione reale
print("film con Yc:", len(sel), flush=True)
idx_all = np.full((N, TOPK), -1, np.int32); w_all = np.zeros((N, TOPK), np.float16)
for st in range(0, len(sel), BATCH):
    rows = sel[st:st + BATCH]
    for q, i in enumerate(rows):
        Z = ZF
        sc = np.zeros(N, np.float32)
        for k in Z:
            c = Z[k] @ Z[k][i]; c[i] = -1e9
            top = np.argsort(-c)[:100]
            sc[top] += 1.0 / (K + np.arange(1, 101))
        sc[i] = -1e9
        o = np.argsort(-sc)[:TOPK]
        v = sc[o]; v = v / (v.sum() + 1e-9)
        idx_all[i] = o; w_all[i] = v.astype(np.float16)
    print(f"{min(st+BATCH,len(sel))}/{len(sel)}", flush=True)
np.savez_compressed(C.DATA / "rrf-target-yc.npz", idx=idx_all, w=w_all)
print("scritto rrf-target.npz", int((idx_all >= 0).any(1).sum()), "/", N)
