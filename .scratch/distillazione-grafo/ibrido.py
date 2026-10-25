"""Ibrido: bolla dal collocatore V1, ranking dentro la bolla con lo spazio denso.

Misura il recall@20 della sola bolla oracolo (gia' fatto), della bolla predetta dal
collocatore, e il recall del ranking denso globale come controllo.
"""
from __future__ import annotations

import sys

import numpy as np

from services.graph_dense import config as C
from services.graph_dense import data as D
from services.graph_dense import eval as E


def predizioni(B, split):
    p = C.DATA / "collocatore-pred.npz"
    if p.exists():
        z = np.load(p)
        return z["pred"], z["test_idx"]
    sys.path.insert(0, str(C.ROOT / "services"))
    from graph import canon as K
    K.DATA = C.SRC
    from graph import collocator as CO

    keys = B["keys"]; test = split["test_idx"]; is_tv = B["is_tv"]
    dd = D.parquet_rows(keys)
    S3 = CO.carica(v3=True); S1 = CO.carica(v3=False)
    pred = np.full(len(test), -1, np.int64)
    for k, i in enumerate(test):
        d = dd.get(keys[int(i)])
        if d is None:
            continue
        try:
            b, conf, n, fuori = CO.colloca(d, "tv" if is_tv[int(i)] else "movie", S3, S_macro=S1)
        except Exception as e:
            print("  errore", keys[int(i)], e)
            continue
        if b is not None:
            pred[k] = int(b)
    np.savez(C.DATA / "collocatore-pred.npz", pred=pred, test_idx=test)
    return pred, test


def main():
    B = D.basic(); S = D.triangle()
    sp_ = np.load(C.DATA / "split.npz")
    split = {k: sp_[k] for k in sp_.files}
    mem, test, hold, strata = B["mem"], split["test_idx"], split["holdout"], split["strata"]
    pred, _ = predizioni(B, split)
    ok = pred >= 0
    print(f"collocatore: predette {ok.sum()}/{len(pred)} · own {(pred[ok] == mem[test][ok]).mean():.3f}")
    members = {int(b): np.where((mem == b) & (~hold))[0] for b in np.unique(mem)}

    # veri = top-20 del grafo
    veri = []
    for i in test:
        row = S.getrow(int(i))
        o = np.argsort(-row.data)[:20]
        veri.append(set(int(row.indices[x]) for x in o))

    for nome in ("a1", "a5-b1", "a6"):
        f = C.DATA / f"{nome}.npz"
        if not f.exists():
            continue
        Z = np.load(f)["Z"].astype(np.float32)
        for modo in ("oracolo", "collocatore"):
            rec = np.full(len(test), np.nan, np.float32)
            for t, i in enumerate(test):
                i = int(i)
                b = int(mem[i]) if modo == "oracolo" else int(pred[t])
                if b < 0:
                    continue
                cand = members.get(b, np.array([], np.int64))
                if len(cand):
                    cos = Z[i] @ Z[cand].T
                    top = cand[np.argsort(-cos)[:20]]
                else:
                    top = np.array([], np.int64)
                if len(top) < 20:
                    glob = np.argsort(-(Z[i] @ Z.T))[:60]
                    presi = set(int(x) for x in top)
                    extra = [int(x) for x in glob if int(x) not in presi][:20 - len(top)]
                    top = np.concatenate([top, np.array(extra, np.int64)])
                if veri[t]:
                    rec[t] = len(veri[t] & set(int(x) for x in top)) / len(veri[t])
            print(f"{nome:8s} {modo:11s} recall@20 {np.nanmean(rec):.4f}")
            if modo == "collocatore":
                for s, n in E.STRATI.items():
                    m = (strata == s) & ~np.isnan(rec)
                    print(f"    {n:20s} {np.nanmean(rec[m]):.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
