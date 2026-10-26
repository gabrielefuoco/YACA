"""Cold start: RRF (bp + h) per i due film nuovi, vicini nel canone."""
import numpy as np, torch, torch.nn.functional as F
from services.graph_dense import config as C, data as D
from services.graph_dense.train_b3 import BlockStudentG
from services.graph_dense.train_b1 import _batch_meta

B = D.basic(); N = B["N"]; ro = B["row_of"]
keep = np.load(C.DATA / "blocks.npz")["keep"]
X = D.features(B, extra=True).tocsr()[:, keep]
Bp = np.load(C.DATA / "trama-qwen3b.npy").astype(np.float32)
Bp /= (np.linalg.norm(Bp, axis=1, keepdims=True) + 1e-9)
m = BlockStudentG(X.shape[1], 512, 4); m.load_state_dict(torch.load(C.DATA / "b11full-model.pt", map_location="cpu")); m.eval()
H = np.zeros((N, 512), np.float32)
with torch.no_grad():
    for st in range(0, N, 2048):
        rows = np.arange(st, min(st + 2048, N))
        idx, off, val = _batch_meta(X, rows, np.random.default_rng(0), drop=False)
        hh = F.gelu(m.ln(m.bag(idx, off, per_sample_weights=val)))
        H[rows] = F.normalize(m.proj(hh + m.res(hh)), dim=1).numpy()
H /= (np.linalg.norm(H, axis=1, keepdims=True) + 1e-9)

# film nuovi: trama dal cold-plot, meta dal cold-feats (X0)
pl = np.load(C.DATA / "cold-plot.npz")
tids = [int(t) for t in pl["tids"]]
BPn = pl["emb"].astype(np.float32); BPn /= (np.linalg.norm(BPn, axis=1, keepdims=True) + 1e-9)
import scipy.sparse as sp
X0 = sp.load_npz(C.DATA / "cold-feats.npz").tocsr()[:, keep]
idx, off, val = _batch_meta(X0, np.arange(X0.shape[0]), np.random.default_rng(0), drop=False)
with torch.no_grad():
    hh = F.gelu(m.ln(m.bag(idx, off, per_sample_weights=val)))
    Hn = F.normalize(m.proj(hh + m.res(hh)), dim=1).numpy()
Hn /= (np.linalg.norm(Hn, axis=1, keepdims=True) + 1e-9)

Z = {"bp": Bp, "h": H}; Zn = {"bp": BPn, "h": Hn}
TOPK = 100; K = 60
def rrf(q):
    sc = np.zeros(N, np.float32)
    for k in Z:
        c = Z[k] @ Zn[k][q]
        top = np.argsort(-c)[:TOPK]
        sc[top] += 1.0 / (K + np.arange(1, TOPK + 1))
    return np.argsort(-sc)[:8]
import json
meta = json.load(open(C.DATA / "cold-meta.json", encoding="utf-8"))
for q, tid in enumerate(tids):
    m_ = meta.get(str(tid), {})
    print(f"\n**{m_.get('title', tid)}** ({m_.get('release', '?')})")
    print("  RRF: " + " · ".join(B["titoli"][int(x)] for x in rrf(q)))
