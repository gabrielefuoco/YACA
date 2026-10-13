"""diag-radice.py — PERCHE' LA FOGLIA DA 36.337 TITOLI NON SI E' APERTA?
Provo Leiden su quel sottografo a molte risoluzioni e guardo cosa esce davvero."""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import csr_matrix
import igraph as ig, leidenalg as la
import pandas as pd

ROOT = pathlib.Path(".").resolve(); ML, PQ = ROOT/".cache"/"movielens", ROOT/".cache"/"tmdb"
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
n = len(keys)
TIT = {}
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","title","genres"])
tv = pd.read_parquet(PQ/"tv.parquet", columns=["id","name","genres"])
GEN = {}
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t, gn in zip(df["id"], df[col], df["genres"]):
        k = f"{typ}:{int(i)}"; TIT[k] = str(t)
        try: g0 = json.loads(gn) if isinstance(gn, str) else gn
        except Exception: g0 = []
        GEN[k] = (g0[0].get("name","?") if g0 and isinstance(g0[0], dict) else (str(g0[0]) if g0 else "?"))

al = json.loads((ML/"albero.json").read_text(encoding="utf-8"))
grande = max(al["foglie"], key=lambda f: f["size"])
mem = np.array([keys.index(k) for k in grande["members"] if k in keys])
print(f"foglia da aprire: {len(mem):,} titoli")
gen = Counter(GEN.get(keys[i],"?") for i in mem)
print(f"generi: {', '.join(f'{g}({v})' for g,v in gen.most_common(6))}")

zz = np.load(ML/"leiden-graph.npz")
M = csr_matrix((zz["data"], zz["indices"], zz["indptr"]), shape=(n,n))
sub = M[mem][:, mem].tocoo()
msk = sub.row < sub.col
print(f"sottografo: {int(msk.sum()):,} archi · grado medio {2*int(msk.sum())/len(mem):.1f}")
g = ig.Graph(n=len(mem), edges=list(zip(sub.row[msk].tolist(), sub.col[msk].tolist())), directed=False)
g.es["weight"] = sub.data[msk].tolist()

print("")
print(f"{'res':>7} {'cluster':>9} {'mediana':>8} {'modularita':>11}  esempi del cluster piu' grande")
t0 = time.time()
for res in (0.02, 0.05, 0.1, 0.3, 1.0, 3.0):
    p = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                          resolution_parameter=res, seed=42)
    lab = np.array(p.membership); sz = np.bincount(lab)
    big = np.argmax(sz)
    esempi = [TIT.get(keys[mem[j]],"?") for j in np.where(lab==big)[0][:6]]
    print(f"{res:>7} {len(sz):>9} {int(np.median(sz)):>8} {p.modularity:>11.3f}  {', '.join(esempi)}")
print(f"({time.time()-t0:.0f}s)")

print("")
print("=== a risoluzione 1.0, i 10 cluster piu' grandi: cosa sono? ===")
p = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight", resolution_parameter=1.0, seed=42)
lab = np.array(p.membership); sz = np.bincount(lab)
for c in np.argsort(-sz)[:10]:
    mm = np.where(lab==c)[0]
    gc = Counter(GEN.get(keys[mem[j]],"?") for j in mm)
    print(f"\n  {len(mm):>5} titoli · generi: {', '.join(f'{a}({b})' for a,b in gc.most_common(3))}")
    print(f"        " + " | ".join(TIT.get(keys[mem[j]],"?") for j in mm[:10]))
