"""leggi-100.py — 100 CLUSTER A CAMPIONE dal grafo CON le keyword (configurazione di produzione).
Formato compatto, una riga per cluster, per poterli leggere e giudicare a mano."""
import json, pathlib
from collections import Counter
import numpy as np
from scipy.sparse import csr_matrix
import pandas as pd

ROOT = pathlib.Path(".").resolve()
ML, PQ = ROOT / ".cache" / "movielens", ROOT / ".cache" / "tmdb"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
n = len(keys)
is_tv = (tipo == "tv")

TIT, GEN = {}, {}
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "genres"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "genres"])
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t, gn in zip(df["id"], df[col], df["genres"]):
        k = f"{typ}:{int(i)}"
        TIT[k] = str(t)
        try:
            g0 = json.loads(gn) if isinstance(gn, str) else gn
        except Exception:
            g0 = []
        GEN[k] = (g0[0].get("name", "?") if g0 and isinstance(g0[0], dict) else (str(g0[0]) if g0 else "?"))

zt = np.load(ML / "temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n:
    T = T.T
TEMA = [str(x) for x in zt["keys"]]
tema_arg = np.argmax(T, axis=1) if T.shape[0] == n else np.zeros(n, int)

# le etichette dei cluster: le ricalcolo? no, servono solo i cluster. Uso i cluster da un salvataggio
# se non c'e', li ricalcolo. Ma per non rifare Leiden, salvo prima.
CACHE = pathlib.Path(ML / "cluster-lab.npz")
if CACHE.exists():
    lab = np.load(CACHE)["lab"]
    print("cluster da cache")
else:
    import igraph as ig, leidenalg as la
    zz2 = np.load(ML / "leiden-graph.npz")
    M = csr_matrix((zz2["data"], zz2["indices"], zz2["indptr"]), shape=(n, n))
    coo = M.tocoo()
    mask = coo.row < coo.col
    g = ig.Graph(n=n, edges=list(zip(coo.row[mask].tolist(), coo.col[mask].tolist())), directed=False)
    g.es["weight"] = coo.data[mask].tolist()
    part = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                             resolution_parameter=100.0, seed=42)
    lab = np.array(part.membership)
    np.savez_compressed(CACHE, lab=lab)
    print("cluster ricalcolati e salvati")

sizes = np.bincount(lab)
cands = [c for c in range(len(sizes)) if 5 <= sizes[c] < 30]
print(f"cluster tra 5 e 29 titoli: {len(cands):,} (su {len(sizes):,} totali)")

zz = np.load(ML / "diagnosi-grafi.npz")
GR = {"C": csr_matrix((zz["dc"], zz["ic"], zz["pc"]), shape=(n, n)),
      "B": csr_matrix((zz["db"], zz["ib"], zz["pb"]), shape=(n, n)),
      "T": csr_matrix((zz["dt"], zz["it"], zz["pt"]), shape=(n, n)),
      "K": csr_matrix((zz["dk"], zz["ik"], zz["pk"]), shape=(n, n))}

rng = np.random.default_rng(777)
scelti = rng.choice(len(cands), 100, replace=False)
print("=" * 130)
print("100 CLUSTER A CAMPIONE — SOLO SOTTO I 30 TITOLI — grafo con keyword, risoluzione 100")
print("=" * 130)
for i, idx in enumerate(sorted(scelti.tolist()), 1):
    c = cands[idx]
    mem = np.where(lab == c)[0]
    lifts = {}
    for k, A in GR.items():
        sA = A[mem][:, mem].tocoo()
        msk = sA.row < sA.col
        atteso = A.nnz * (len(mem) / n) ** 2 / 2
        lifts[k] = int(msk.sum()) / max(1e-9, atteso)
    nt = sum(1 for v in lifts.values() if v > 1.0)
    temi = Counter(TEMA[tema_arg[j]] for j in mem).most_common(2)
    gen = Counter(GEN.get(keys[j], "?") for j in mem).most_common(2)
    titoli = [TIT.get(keys[j], "?") for j in mem[:min(len(mem), 16)]]
    print(f"\n{i:>3}. [{nt}/4] {len(mem):>3} tit · "
          f"tema {temi[0][0]}({temi[0][1]}) · gen {gen[0][0]}({gen[0][1]})")
    print(f"     " + " | ".join(titoli))
