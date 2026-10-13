"""albero.py — L'ALBERO GERARCHICO COMPLETO.

Split ricorsivo: ogni nodo sopra la soglia viene riaperto con Leiden sul suo sottografo, scegliendo
la risoluzione che da' 2-6 figli con modularita' decente. Se non c'e' struttura, e' una foglia.

Verifica:
  - copertura: ogni titolo finisce in una foglia?
  - dimensioni: le foglie sono 5-40 titoli?
  - profondita' e numero di nodi
  - campione di foglie da leggere
"""
import json, os, pathlib, time
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

zt = np.load(ML / "temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n:
    T = T.T
TEMA = [str(x) for x in zt["keys"]]
tema_arg = np.argmax(T, axis=1) if T.shape[0] == n else np.zeros(n, int)

zz2 = np.load(ML / "leiden-graph.npz")
M = csr_matrix((zz2["data"], zz2["indices"], zz2["indptr"]), shape=(n, n))
M = M.tocsr()

SOGLIA = int(os.environ.get("YACA_SOGLIA_ALBERO", "40"))   # sopra questa dimensione provo ad aprire
MIN_FIGLIO = 5       # sotto questa dimensione il nodo e' troppo piccolo: lo tengo cosi'
t0 = time.time()

MIN_MOD = float(os.environ.get("YACA_MIN_MOD", "0.15"))   # sotto questa modularita' il nodo resta foglia

nodi = []            # (id, genitore, indici, livello)
foglie = []


def sottografo(mem):
    sub = M[mem][:, mem].tocoo()
    msk = sub.row < sub.col
    if int(msk.sum()) < 5:
        return None, None
    gs = ig.Graph(n=len(mem), edges=list(zip(sub.row[msk].tolist(), sub.col[msk].tolist())), directed=False)
    gs.es["weight"] = sub.data[msk].tolist()
    return gs, int(msk.sum())


def prova_split(gs):
    """Cerca la risoluzione che da' 2-6 figli con la modularita' migliore."""
    best = None
    for res in (0.3, 0.5, 0.8, 1.2, 2.0, 3.0, 5.0, 8.0):
        try:
            p = la.find_partition(gs, la.RBConfigurationVertexPartition, weights="weight",
                                  resolution_parameter=res, seed=42)
        except Exception:
            continue
        sz = np.bincount(p.membership)
        k = len(sz)
        if not (2 <= k <= 25):      # il tetto di 6 scartava la radice (18 figli, mod 0.529)
            continue
        if sz.min() < 3:            # figli minuscoli: scarto
            continue
        score = p.modularity
        if best is None or score > best[0]:
            best = (score, res, np.array(p.membership))
    return best


def ricorsione(mem, genitore, livello):
    nid = len(nodi)
    nodi.append(dict(id=nid, parent=genitore, size=len(mem), level=livello))
    if len(mem) <= SOGLIA:
        foglie.append((nid, mem))
        return nid
    gs, narchi = sottografo(mem)
    if gs is None:
        foglie.append((nid, mem))
        return nid
    sp = prova_split(gs)
    if sp is None or sp[0] < MIN_MOD:      # nessuna struttura decente: foglia
        foglie.append((nid, mem))
        return nid
    _, res, sublab = sp
    for c in range(sublab.max() + 1):
        figli = mem[sublab == c]
        if len(figli) == 0:
            continue
        ricorsione(figli, nid, livello + 1)
    return nid


# radice: tutti i titoli
ricorsione(np.arange(n), -1, 0)

print(f"ALBERO COSTRUITO in {time.time()-t0:.0f}s")
print(f"  nodi totali {len(nodi):,} · foglie {len(foglie):,}")
prof = Counter(nd["level"] for nd in nodi)
print(f"  nodi per livello: " + " · ".join(f"L{k}:{v}" for k, v in sorted(prof.items())))
fog_prof = Counter(nodi[nid]["level"] for nid, _ in foglie)
print(f"  foglie per livello: " + " · ".join(f"L{k}:{v}" for k, v in sorted(fog_prof.items())))

# copertura
coperti = np.zeros(n, bool)
for nid, mem in foglie:
    coperti[mem] = True
print(f"\nCOPERTURA: {coperti.sum():,}/{n:,} titoli in una foglia ({100*coperti.mean():.1f}%)")
if not coperti.all():
    fuori = np.where(~coperti)[0]
    print(f"  NON coperti: {len(fuori)} · esempi: {[TIT.get(keys[i],'?') for i in fuori[:5]]}")

sizes = np.array([len(mem) for _, mem in foglie])
print(f"DIMENSIONI DELLE FOGLIE: mediana {int(np.median(sizes))} · min {sizes.min()} · max {sizes.max()}")
print(f"  foglie 5-40 titoli: {int(((sizes>=5)&(sizes<=40)).sum())} ({100*((sizes>=5)&(sizes<=40)).mean():.0f}%)")
print(f"  foglie <5: {int((sizes<5).sum())} · foglie >40: {int((sizes>40).sum())}")

# campione di foglie da leggere
print("")
print("=" * 110)
print("CAMPIONE DI 20 FOGLIE (ordinate per dimensione, una ogni tanto)")
print("=" * 110)
idx = np.argsort(sizes)
scelti = [idx[int(i)] for i in np.linspace(0, len(idx) - 1, 20).astype(int)]
for i, si in enumerate(scelti, 1):
    nid, mem = foglie[si]
    temi = Counter(TEMA[tema_arg[j]] for j in mem)
    print(f"\n{i:>2}. {len(mem):>3} titoli · livello {nodi[nid]['level']} · tema {temi.most_common(1)[0][0]}")
    print(f"    " + " | ".join(TIT.get(keys[j], "?") for j in mem[:12]))

# salva l'albero
out = {"nodi": nodi,
       "foglie": [{"id": nid, "size": len(mem), "members": [keys[j] for j in mem]} for nid, mem in foglie]}
p = ML / os.environ.get("YACA_OUT_ALBERO", "albero.json")
p.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
print(f"\nsalvato: {p} ({p.stat().st_size//1024} KB)")
print(f"({time.time()-t0:.0f}s)")
