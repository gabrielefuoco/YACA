"""Cold start con lo studente distillato dall'RRF (block, masse b11)."""
import json, numpy as np, torch, torch.nn.functional as F, scipy.sparse as sp
from services.graph_dense import config as C, data as D
from services.graph_dense.train_b3 import BlockStudentG
from services.graph_dense.train_b1 import _batch_meta

B = D.basic(); N = B["N"]
keep = np.load(C.DATA / "blocks.npz")["keep"]
X = D.features(B, extra=True).tocsr()[:, keep]
Bp = np.load(C.DATA / "trama-qwen3b.npy").astype(np.float32); Bp /= (np.linalg.norm(Bp, axis=1, keepdims=True) + 1e-9)
Bk = np.load(C.DATA / "blocks.npz")["Bk"].astype(np.float32)
beh = np.load(C.DATA / "lc150.npz")["Z"].astype(np.float32)
m = BlockStudentG(X.shape[1], 512, 4); m.load_state_dict(torch.load(C.DATA / "rrfstudent-model.pt", map_location="cpu")); m.eval()
def enc(Xm, bp, bk, bh):
    out = np.zeros((Xm.shape[0], 2560), np.float32)
    with torch.no_grad():
        for st in range(0, Xm.shape[0], 512):
            rows = np.arange(st, min(st + 512, Xm.shape[0]))
            idx, off, val = _batch_meta(Xm, rows, np.random.default_rng(0), drop=False)
            z, _ = m(idx, off, val, torch.from_numpy(bp[rows]), torch.from_numpy(bk[rows]),
                     torch.from_numpy(bh[rows]))
            out[rows] = z.numpy()
    return out / (np.linalg.norm(out, axis=1, keepdims=True) + 1e-9)
Z = enc(X, Bp, Bk, beh)
pl = np.load(C.DATA / "cold-plot.npz"); tids = [int(t) for t in pl["tids"]]
BPn = pl["emb"].astype(np.float32); BPn /= (np.linalg.norm(BPn, axis=1, keepdims=True) + 1e-9)
X0 = sp.load_npz(C.DATA / "cold-feats.npz").tocsr()[:, keep]
Bkn = np.zeros((X0.shape[0], 512), np.float32)   # keyword non ricostruibile per i nuovi
BHn = np.zeros((X0.shape[0], 512), np.float32)   # nessun comportamento
Zn = enc(X0, BPn, Bkn, BHn)
meta = json.load(open(C.DATA / "cold-meta.json", encoding="utf-8"))
for q, tid in enumerate(tids):
    c = Z @ Zn[q]; top = np.argsort(-c)[:8]
    mm = meta.get(str(tid), {})
    print(f"\n**{mm.get('title', tid)}** ({mm.get('release', '?')})")
    print("  " + " · ".join(B["titoli"][int(x)] for x in top))
