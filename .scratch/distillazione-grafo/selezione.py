"""Selezione onesta dell'ensemble: val/test, Jaccard, greedy con pesi.

1. divide i 1.600 test in 800 validation + 800 test (stratificato);
2. per ogni modello calcola i top-150 su tutti; Jaccard dei top-20 in validation;
3. greedy forward: aggiunge il membro (e il peso) che massimizza il recall in validation;
4. riporta l'ensemble selezionato sul test (mai usato per scegliere).
"""
from __future__ import annotations
import json
import numpy as np
from services.graph_dense import config as C, data as D

MODELLI = ["lc150", "lc150s", "lc150t", "lc100", "lc", "m1", "t1", "lcmeta",
           "lctop25", "a10", "a12", "a8", "a7", "f3", "f4", "f5"]
TOPK = 150
PESI = (0.5, 1.0, 2.0, 3.0, 4.0)


def main():
    B = D.basic(); S = D.triangle()
    sp = np.load(C.DATA / "split.npz"); split = {k: sp[k] for k in sp.files}
    test, strata = split["test_idx"], split["strata"]
    rng = np.random.default_rng(11)
    val = np.zeros(len(test), bool)
    for s in np.unique(strata):
        idx = np.where(strata == s)[0]
        rng.shuffle(idx)
        val[idx[:len(idx) // 2]] = True
    print(f"validation {val.sum()} · test {(~val).sum()}", flush=True)

    veri = []
    for i in test:
        row = S.getrow(int(i)); o = np.argsort(-row.data)[:20]
        veri.append(set(int(row.indices[x]) for x in o))

    Zs, tops = {}, {}
    for n in MODELLI:
        f = C.DATA / f"{n}.npz"
        if not f.exists():
            continue
        Z = np.load(f)["Z"].astype(np.float32); Zs[n] = Z
        T = np.zeros((len(test), TOPK), np.int64)
        for t, i in enumerate(test):
            i = int(i); cos = Z[i] @ Z.T; cos[i] = -np.inf
            T[t] = np.argpartition(-cos, TOPK)[:TOPK]
        tops[n] = T
        print("pronto", n, flush=True)
    nomi = list(tops)

    def jacc(a, b, maschera):
        v = 0.0
        for t in np.where(maschera)[0]:
            A, Bs = set(tops[a][t][:20].tolist()), set(tops[b][t][:20].tolist())
            v += len(A & Bs) / max(len(A | Bs), 1)
        return v / maschera.sum()

    print("\nJaccard top-20 (validation):")
    print("        " + " ".join(f"{n:>7s}" for n in nomi))
    for a in nomi:
        print(f"{a:>7s} " + " ".join(f"{jacc(a,b,val):7.2f}" for b in nomi))

    def recall(combo, pesi, maschera):
        rec = np.zeros(len(test), np.float32)
        for t in np.where(maschera)[0]:
            i = int(test[t])
            cand = np.unique(np.concatenate([tops[n][t] for n in combo]))
            s = np.zeros(len(cand), np.float32)
            for n, w in zip(combo, pesi):
                s += w * (Zs[n][i] @ Zs[n][cand].T)
            top = cand[np.argsort(-s)[:20]]
            rec[t] = len(veri[t] & set(int(x) for x in top)) / max(len(veri[t]), 1)
        return rec[maschera].mean()

    print("\nda soli (val):", {n: round(float(recall([n], [1.0], val)), 4) for n in nomi})
    combo, pesi = [], []
    migliore = 0.0
    for passo in range(6):
        cand_m = None; cand_w = None; cand_r = migliore
        for n in nomi:
            if n in combo:
                continue
            for w in PESI:
                r = recall(combo + [n], pesi + [w], val)
                if r > cand_r + 0.0005:
                    cand_r, cand_m, cand_w = r, n, w
        if cand_m is None:
            break
        combo.append(cand_m); pesi.append(cand_w); migliore = cand_r
        print(f"  + {cand_m:8s} peso {cand_w:3.1f} -> val {cand_r:.4f}", flush=True)
    print(f"\nensemble selezionato: {list(zip(combo, pesi))}")
    print(f"validation {migliore:.4f} · TEST {recall(combo, pesi, ~val):.4f}", flush=True)
    for n in nomi:
        print(f"  {n:8s} test da solo {recall([n],[1.0],~val):.4f}", flush=True)
    (C.DATA / "ensemble-selezione.json").write_text(json.dumps(
        {"membri": [[m, float(w)] for m, w in zip(combo, pesi)], "val": float(migliore),
         "test": float(recall(combo, pesi, ~val))}, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
