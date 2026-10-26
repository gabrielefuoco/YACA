"""Trap set con rrfstudent + rerank Yc + cap 1/collection."""
import json, numpy as np
from services.graph_dense import config as C, data as D
B = D.basic(); N = B["N"]; ro = B["row_of"]; is_tv = B["is_tv"]; coll = B["COLL"].astype(np.int64)
date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32)
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32); Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
def top(i, mode, k=10):
    cos = Z @ Z[i]; cos[i] = -1e9
    if mode == "base":
        return np.argsort(-cos)[:k]
    beh = Yc[i] @ Yc.T; beh[i] = -1e9
    if not is_tv[i] and date[i] > 0:
        near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120); beh[near] *= 0.2
    s = cos + 0.3 * beh
    o = np.argsort(-s)[:60]
    if mode == "rr": return o[:k]
    out, seen = [], set()
    for x in o:
        c = coll[x]
        if c > 0 and c in seen: continue
        out.append(x); seen.add(c)
        if len(out) == k: break
    return np.array(out)
t = json.load(open(C.DATA / "trap-set.json", encoding="utf-8"))
print(f"{'categoria':16s} {'modo':6s} {'cont@5':>7s} {'cont@10':>7s} {'hit@10':>7s}")
for cat, items in t["categorie"].items():
    for mode in ("base", "rr", "cap"):
        c5 = c10 = h10 = 0.0; n = 0
        for it in items:
            if it["key"] not in ro: continue
            i = int(ro[it["key"]])
            bad = {int(ro[x]) for x in it.get("bad", []) if x in ro}
            good = {int(ro[x]) for x in it.get("good", []) if x in ro}
            if not bad and not good: continue
            tp = top(i, mode)
            c5 += len(set(tp[:5]) & bad); c10 += len(set(tp) & bad)
            h10 += len(set(tp) & good) / max(len(good), 1); n += 1
        if n: print(f"{cat:16s} {mode:6s} {c5/n:7.2f} {c10/n:7.2f} {h10/n:7.2f}")
