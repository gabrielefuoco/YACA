"""Negativi hard per il training: top-k dei pool scartati da Mercury, peso (1-p_pool)(1-none),
protezione = top-3 del pool scelto. Output mercury-negatives.npz (idx/w) + jsonl checkpoint.
"""
import json, os, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np, pandas as pd
from services.graph_dense import config as C, data as D

B = D.basic(); ro = B["row_of"]; N = B["N"]; is_tv = B["is_tv"]
date = np.load(C.DATA / "uscite-ordinali.npy")
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
Bp = np.load(C.DATA / "trama-qwen3b.npy").astype(np.float32)
Bp /= (np.linalg.norm(Bp, axis=1, keepdims=True) + 1e-9)
Bk = np.load(C.DATA / "blocks.npz")["Bk"].astype(np.float32)
Bm = np.load(C.DATA / "meta-jl.npz")["Bm"].astype(np.float32)
CONT = np.concatenate([Bp, np.sqrt(0.5) * Bk, np.sqrt(0.5) * Bm], 1)
CONT /= (np.linalg.norm(CONT, axis=1, keepdims=True) + 1e-9)
S = D.triangle()
PROB = {}
for line in open(C.DATA / "mercury-target.jsonl", encoding="utf-8"):
    try:
        r = json.loads(line)
        if "prob" in r:
            PROB[r["key"]] = {"prob": r["prob"], "none": r.get("none", 0), "choice": r.get("choice")}
    except Exception:
        pass
OUT = C.DATA / "mercury-negatives.jsonl"
NPZ = C.DATA / "mercury-negatives.npz"


def scores(i):
    cov = Yc[i] @ Yc.T; cov[i] = -1e4
    if not is_tv[i] and date[i] > 0:
        near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120)
        cov[near] *= 0.2
    tr = Bp[i] @ Bp.T; tr[i] = -1e4
    kw = Bk[i] @ Bk.T; kw[i] = -1e4
    me = Bm[i] @ Bm.T; me[i] = -1e4
    co = CONT[i] @ CONT.T; co[i] = -1e4
    cb = 0.5 * (cov / (cov.max() + 1e-9)) + 0.5 * (co / (co.max() + 1e-9)); cb[i] = -1e4
    row = S.getrow(i); gs = np.zeros(N, np.float32); gs[row.indices] = row.data; gs[i] = -1e4
    return {"graph": gs, "cov": cov, "trama": tr, "kw": kw, "meta": me, "cont": co, "combo": cb}, \
        bool(np.linalg.norm(Yc[i]) > 1e-6)


def one(k):
    i = ro[k]; S7, has = scores(i)
    pr = PROB.get(k, {}).get("prob", {})
    none = PROB.get(k, {}).get("none", 0)
    valid = {x: v for x, v in pr.items() if x != "none" and (x != "cov" or has) and v > 0}
    if not valid:
        valid = {"cont": 1.0}
    chosen = max(valid, key=valid.get)
    protect = {int(j) for j in np.argsort(-S7[chosen])[:3]}
    neg = {}
    for x, v in valid.items():
        if x == chosen:
            continue
        w = (1.0 - v) * (1.0 - none)
        if w <= 0.01:
            continue
        for j in np.argsort(-S7[x])[:10]:
            j = int(j)
            if j == i or j in protect:
                continue
            if w > neg.get(j, 0.0):
                neg[j] = float(w)
    items = sorted(neg.items(), key=lambda kv: -kv[1])[:50]
    return {"key": k, "row": int(i), "idx": [j for j, _ in items], "w": [w for _, w in items]}


def snapshot(rows):
    idx = np.full((N, 50), -1, np.int32); w = np.zeros((N, 50), np.float16)
    for r in rows.values():
        if r["idx"]:
            idx[r["row"], :len(r["idx"])] = r["idx"]
            w[r["row"], :len(r["w"])] = r["w"]
    np.savez_compressed(NPZ, idx=idx, w=w)


def main():
    rows = {}
    if OUT.exists():
        for line in open(OUT, encoding="utf-8"):
            try:
                r = json.loads(line)
                if "idx" in r:
                    rows[r["key"]] = r
            except Exception:
                pass
    print(f"ripresa: {len(rows):,}", flush=True)
    todo = [k for k in ro if k not in rows]
    print(f"da fare: {len(todo):,} · 8 parallele", flush=True)
    f = open(OUT, "a", encoding="utf-8")
    n = 0; t0 = time.time()
    with ThreadPoolExecutor(max_workers=8) as ex:
        fut = {ex.submit(one, k): k for k in todo}
        for fu in as_completed(fut):
            try:
                r = fu.result()
            except Exception as e:
                continue
            rows[r["key"]] = r
            f.write(json.dumps(r) + "\n"); f.flush()
            n += 1
            if n % 2000 == 0:
                snapshot(rows)
                print(f"  {n:,}/{len(todo):,} · {n/(time.time()-t0):.1f}/s · snapshot", flush=True)
    f.close(); snapshot(rows)
    print(f"FINE {len(rows):,} · t {(time.time()-t0)/60:.0f}min", flush=True)


if __name__ == "__main__":
    main()
