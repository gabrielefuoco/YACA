"""gerarchia.py — I CLUSTER GRANDI SI POSSONO APRIRE?

L'utente: dobbiamo raggiungere TUTTO il db, non solo la parte di qualita'. Il tier 1 di DuckDB e'
gia' il filtro di qualita'. Quindi il cluster grande non va saltato: va SCOMPOSTO.

Test: prendo i cluster piu' grandi (quelli che nella lettura avevo bollito come "brutti") e li
ri-clusterizzo DENTRO, con Leiden sul sottografo. Se si aprono in sotto-cluster coerenti, allora
la "bruttezza" era solo risoluzione insufficiente, e la copertura totale e' raggiungibile.
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import csr_matrix
import igraph as ig
import leidenalg as la
import pandas as pd

ROOT = pathlib.Path(".").resolve()
ML, PQ = ROOT / ".cache" / "movielens", ROOT / ".cache" / "tmdb"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
n = len(keys)
is_tv = (tipo == "tv")

TIT = {}
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name"])
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t in zip(df["id"], df[col]):
        TIT[f"{typ}:{int(i)}"] = str(t)


def nome(k):
    return f"{TIT.get(k,'?')}"


zt = np.load(ML / "temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n:
    T = T.T
TEMA = [str(x) for x in zt["keys"]]
tema_arg = np.argmax(T, axis=1) if T.shape[0] == n else np.zeros(n, int)

lab = np.load(ML / "cluster-lab.npz")["lab"]
sizes = np.bincount(lab)

zz2 = np.load(ML / "leiden-graph.npz")
M = csr_matrix((zz2["data"], zz2["indices"], zz2["indptr"]), shape=(n, n))

# i 8 cluster piu' grandi
grandi = np.argsort(-sizes)[:8]
print(f"grafo: {M.nnz:,} archi · cluster totali {len(sizes):,}")
print("")
print("=" * 110)
print("APRO I CLUSTER PIU' GRANDI: Leiden sul sottografo interno")
print("=" * 110)

for c in grandi:
    mem = np.where(lab == c)[0]
    if len(mem) < 40:
        continue
    sub = M[mem][:, mem].tocoo()
    msk = sub.row < sub.col
    if msk.sum() < 20:
        print(f"\ncluster {c} ({len(mem)} titoli): sottografo troppo rado ({int(msk.sum())} archi)")
        continue
    gs = ig.Graph(n=len(mem), edges=list(zip(sub.row[msk].tolist(), sub.col[msk].tolist())), directed=False)
    gs.es["weight"] = sub.data[msk].tolist()
    # risoluzione interna: cerco quella che da' sotto-cluster di ~10-40 titoli
    migliore = None
    for res in (0.5, 1.0, 2.0, 4.0, 8.0):
        p = la.find_partition(gs, la.RBConfigurationVertexPartition, weights="weight",
                              resolution_parameter=res, seed=42)
        sub_sizes = np.bincount(p.membership)
        sub_n = len(sub_sizes)
        med = int(np.median(sub_sizes))
        # voglio: 5-40 sotto-cluster, mediana 8-40
        score = (5 <= sub_n <= 60) * (1 if 8 <= med <= 40 else 0)
        if score and (migliore is None or score > migliore[0]):
            migliore = (score, res, np.array(p.membership), sub_sizes, p.modularity)
    if migliore is None:
        res = 2.0
        p = la.find_partition(gs, la.RBConfigurationVertexPartition, weights="weight",
                              resolution_parameter=res, seed=42)
        migliore = (0, res, np.array(p.membership), np.bincount(p.membership), p.modularity)
    _, res, sublab, sub_sizes, mod = migliore
    print(f"\n{'='*110}")
    print(f"CLUSTER {c}: {len(mem)} titoli · genere dominante {Counter(TIT.get(keys[j],'?') and '?' for j in mem[:0]) or ''}")
    print(f"  apro a risoluzione {res}: {len(sub_sizes)} sotto-cluster · mediana {int(np.median(sub_sizes))} · modularita' {mod:.3f}")
    print(f"  (era: {len(mem)} titoli, 1/4 tipi o 2/4 — bollito 'brutto' o 'debole' nella lettura)")
    ordine = np.argsort(-sub_sizes)
    for rank, sc in enumerate(ordine[:6], 1):
        smem = mem[sublab == sc]
        temi = Counter(TEMA[tema_arg[j]] for j in smem)
        titoli = [nome(keys[j]) for j in smem[:10]]
        print(f"\n    {rank}) {len(smem)} titoli · tema {temi.most_common(1)[0][0]}({temi.most_common(1)[0][1]})")
        print(f"       " + " | ".join(titoli))
    if len(ordine) > 6:
        restanti = sum(sub_sizes[o] for o in ordine[6:])
        print(f"\n    + altri {len(ordine)-6} sotto-cluster ({restanti} titoli)")
print(f"\n({time.time()-0:.0f}s)")
