"""V11: cold start (1-hop contenuto -> 2-hop comportamento) + trap set."""
import json, numpy as np, torch, torch.nn.functional as F, scipy.sparse as sp
from services.graph_dense import config as C, data as D
from services.graph_dense.train_b3 import BlockStudentG
from services.graph_dense.train_b1 import _batch_meta

B = D.basic(); N = B["N"]; ro = B["row_of"]; is_tv = B["is_tv"]; coll = B["COLL"].astype(np.int64)
date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32)
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32); Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
S10 = D.triangle().tocsr()
VOT = B["VOT"]
TOPK = 20; W_RRF = 0.6
# --- V11: stessi archi rrf del test precedente, ma non serve tutto: per il trap uso S10+S11
rows, cols, vals = [], [], []
for st in range(0, N, 1024):
    blk = np.arange(st, min(st + 1024, N)); cos = Z[blk] @ Z.T
    for q, i in enumerate(blk):
        c = cos[q].copy(); c[i] = -1e9
        o = np.argsort(-c)[:TOPK * 2]; out, seen = [], []
        for x in o:
            cc = coll[x]
            if cc > 0 and cc in seen: continue
            out.append(x); seen.append(cc)
            if len(out) == TOPK: break
        rows += [i] * len(out); cols += out; vals += (W_RRF * c[out]).tolist()
R = sp.csr_matrix((vals, (rows, cols)), shape=(N, N), dtype=np.float32)
S11 = (S10 + R).tocsr(); S11.setdiag(0); S11.eliminate_zeros(); S11 = (S11 + S11.T).tocsr()

# --- TRAP sul V11
t = json.load(open(C.DATA / "trap-set.json", encoding="utf-8"))
def top(S, i, k=10):
    r = S.getrow(i)
    if r.nnz == 0: return np.array([], int)
    g = np.zeros(N, np.float32); g[r.indices] = r.data; g[i] = -1e9
    return np.argsort(-g)[:k]
print("=== TRAP V11 ===")
for cat, items in t["categorie"].items():
    c5 = c10 = h10 = 0.0; n = 0
    for it in items:
        if it["key"] not in ro: continue
        i = int(ro[it["key"]])
        bad = {int(ro[x]) for x in it.get("bad", []) if x in ro}
        good = {int(ro[x]) for x in it.get("good", []) if x in ro}
        if not bad and not good: continue
        tp_ = top(S11, i)
        c5 += len(set(tp_[:5]) & bad); c10 += len(set(tp_) & bad)
        h10 += len(set(tp_) & good) / max(len(good), 1); n += 1
    if n: print(f"{cat:16s} cont@5 {c5/n:.2f} · cont@10 {c10/n:.2f} · hit@10 {h10/n:.2f}")

# --- COLD sul V11: embedding nuovo -> 1-hop (contenuto) -> 2-hop (comportamento V10)
keep = np.load(C.DATA / "blocks.npz")["keep"]
X = D.features(B, extra=True).tocsr()[:, keep]
Bp = np.load(C.DATA / "trama-qwen3b.npy").astype(np.float32); Bp /= (np.linalg.norm(Bp, axis=1, keepdims=True) + 1e-9)
m = BlockStudentG(X.shape[1], 512, 4); m.load_state_dict(torch.load(C.DATA / "rrfstudent-model.pt", map_location="cpu")); m.eval()
Zcan = np.zeros((N, 2560), np.float32)
with torch.no_grad():
    for st in range(0, N, 2048):
        rr = np.arange(st, min(st + 2048, N))
        idx, off, val = _batch_meta(X, rr, np.random.default_rng(0), drop=False)
        z, _ = m(idx, off, val, torch.from_numpy(Bp[rr]), torch.from_numpy(np.load(C.DATA / "blocks.npz")["Bk"][rr]),
                 torch.from_numpy(np.load(C.DATA / "lc150.npz")["Z"][rr]))
        Zcan[rr] = z.numpy()
Zcan /= (np.linalg.norm(Zcan, axis=1, keepdims=True) + 1e-9)
pl = np.load(C.DATA / "cold-plot.npz"); tids = [int(x) for x in pl["tids"]]
BPn = pl["emb"].astype(np.float32); BPn /= (np.linalg.norm(BPn, axis=1, keepdims=True) + 1e-9)
X0 = sp.load_npz(C.DATA / "cold-feats.npz").tocsr()[:, keep]
idx, off, val = _batch_meta(X0, np.arange(X0.shape[0]), np.random.default_rng(0), drop=False)
with torch.no_grad():
    z, _ = m(idx, off, val, torch.from_numpy(BPn), torch.from_numpy(np.zeros((2, 512), np.float32)),
             torch.from_numpy(np.zeros((2, 512), np.float32)))
Zn = F.normalize(z, dim=1).numpy()
meta = json.load(open(C.DATA / "cold-meta.json", encoding="utf-8"))
print("\n=== COLD V11 (1-hop contenuto -> 2-hop comportamento) ===")
for q, tid in enumerate(tids):
    cos = Zcan @ Zn[q]
    hop1 = np.argsort(-cos)[:TOPK]
    sc = np.zeros(N, np.float32)
    for h in hop1:
        r = S10.getrow(int(h))
        if r.nnz:
            sc[r.indices] += W_RRF * cos[h] * r.data
    sc[hop1] = -1e9
    top2 = np.argsort(-sc)[:8]
    print(f"\n**{meta.get(str(tid),{}).get('title', tid)}**")
    print("  1-hop: " + " · ".join(B["titoli"][int(x)] for x in hop1[:5]))
    print("  2-hop: " + " · ".join(B["titoli"][int(x)] for x in top2))
