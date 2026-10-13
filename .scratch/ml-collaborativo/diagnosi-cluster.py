"""diagnosi-cluster.py — PERCHE' I CLUSTER CATTIVI SONO CATTIVI.

Per ogni cluster a risoluzione 100 calcolo la qualita' (coerenza) e le proprieta' locali del grafo:
  densita'   = archi interni / coppie possibili
  peso       = peso medio degli archi interni
  grado      = grado medio dei nodi (nel grafo intero) + quota di nodi a basso grado
  quota      = quanta parte degli archi interni viene da ciascun tipo (C/B/T/K)
  accordo    = il MINIMO fra i lift dei quattro tipi: se un tipo dice "sono simili" e un altro
               dice "no", il minimo e' basso. E' l'accordo fra le fonti.
Poi correlazione (Spearman) fra coerenza e ciascuna proprieta'. E i cattivi tipici.
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
from scipy.stats import spearmanr
import igraph as ig
import leidenalg as la
import pandas as pd

ROOT = pathlib.Path(".").resolve()
ML, PQ = ROOT / ".cache" / "movielens", ROOT / ".cache" / "tmdb"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
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


def nome(k):
    return f"{TIT.get(k,'?')} ({'S' if k.startswith('tv:') else 'F'})"


def centra(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


Pc2 = centra(Pc)
zt = np.load(ML / "temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n:
    T = T.T
TEMA = [str(x) for x in zt["keys"]]
tema_arg = np.argmax(T, axis=1) if T.shape[0] == n else np.zeros(n, int)

# --- ricostruisco i QUATTRO grafi separati (per l'accordo fra tipi) ---
d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
src = d["sources"]


def topk(V, k, min_sim=0.05):
    Vn = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
    rows, cols, vals = [], [], []
    B = 4000
    for i in range(0, n, B):
        sim = Vn[i:i + B] @ Vn.T
        for r in range(sim.shape[0]):
            sim[r, i + r] = -9
        idx = np.argpartition(-sim, k, axis=1)[:, :k]
        w = np.take_along_axis(sim, idx, 1)
        for r in range(sim.shape[0]):
            pos = w[r] >= min_sim
            rows += [i + r] * int(pos.sum())
            cols += list(idx[r][pos])
            vals += list(w[r][pos])
    A = coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr()
    return (A + A.T) * 0.5


def trakt():
    rows, cols = [], []
    base = pathlib.Path(ROOT / ".cache" / "trakt")
    for f in list(base.glob("rel-movie-*.json")) + list(base.glob("rel-tv-*.json")):
        try:
            rel = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(rel, list):
            continue
        m = f.name.split("-")[1]
        tids = [int(t) for t in ((v.get("ids") or {}).get("tmdb") for v in rel) if t]
        for t in tids:
            r = row_of.get(f"{m}:{t}")
            if r is None:
                continue
            for t2 in tids:
                if t2 == t:
                    continue
                r2 = row_of.get(f"{m}:{t2}")
                if r2 is not None:
                    rows.append(r)
                    cols.append(r2)
    A = coo_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(n, n)).tocsr()
    return (A + A.T) * 0.5


def curatela():
    rows, cols, vals = [], [], []
    for s in src:
        a = row_of.get(s["id"])
        if a is None:
            continue
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None:
                continue
            rows += [a, b]
            cols += [b, a]
            vals += [float(l.get("w", 1))] * 2
    return coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr()


CACHE = pathlib.Path(ML / "diagnosi-grafi.npz")
if CACHE.exists():
    zz = np.load(CACHE)
    EC = csr_matrix((zz["dc"], zz["ic"], zz["pc"]), shape=(n, n))
    EB = csr_matrix((zz["db"], zz["ib"], zz["pb"]), shape=(n, n))
    ET = csr_matrix((zz["dt"], zz["it"], zz["pt"]), shape=(n, n))
    EK = csr_matrix((zz["dk"], zz["ik"], zz["pk"]), shape=(n, n))
    print("grafi separati da cache")
else:
    t0 = time.time()
    EC, EB, ET, EK = topk(Pc2, 15), trakt(), topk(T, 15), curatela()
    np.savez_compressed(CACHE, dc=EC.data, ic=EC.indices, pc=EC.indptr,
                        db=EB.data, ib=EB.indices, pb=EB.indptr,
                        dt=ET.data, it=ET.indices, pt=ET.indptr,
                        dk=EK.data, ik=EK.indices, pk=EK.indptr)
    print(f"grafi separati costruiti ({time.time()-t0:.0f}s)")

TIPI = {"C": EC, "B": EB, "T": ET, "K": EK}
print("archi: " + " · ".join(f"{k} {v.nnz:,}" for k, v in TIPI.items()))

# grafo unito (quello su cui gira Leiden), dalla cache
zz = np.load(ML / "leiden-graph.npz")
M = csr_matrix((zz["data"], zz["indices"], zz["indptr"]), shape=(n, n))
coo = M.tocoo()
mask = coo.row < coo.col
g = ig.Graph(n=n, edges=list(zip(coo.row[mask].tolist(), coo.col[mask].tolist())), directed=False)
g.es["weight"] = coo.data[mask].tolist()
grado = np.array(g.degree())

part = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                         resolution_parameter=100.0, seed=42)
lab = np.array(part.membership)
sizes = np.bincount(lab)
print(f"risoluzione 100: {len(sizes):,} cluster")

rng = np.random.default_rng(0)
samp = rng.choice(n, 4000, replace=False)
GLOB = float((Pc2[samp] @ Pc2[samp].T).mean())

righe = []
for c in range(len(sizes)):
    mem = np.where(lab == c)[0]
    if len(mem) < 5:
        continue
    sub = M[mem][:, mem].tocoo()
    m_in = sub.row < sub.col
    n_in = int(m_in.sum())
    if n_in == 0:
        continue
    w_in = float(sub.data[m_in].mean())
    dens = n_in / (len(mem) * (len(mem) - 1) / 2)
    # accordo fra tipi: per ciascun tipo, lift degli archi interni
    lift_tipi = {}
    for nome_t, A in TIPI.items():
        sA = A[mem][:, mem].tocoo()
        msk = sA.row < sA.col
        dentro = int(msk.sum())
        atteso = A.nnz * (len(mem) / n) ** 2 / 2
        lift_tipi[nome_t] = dentro / max(1e-9, atteso)
    accordo = min(lift_tipi.values())
    # coerenza (campione)
    mm = rng.choice(mem, min(300, len(mem)), replace=False)
    coh = float((Pc2[mm] @ Pc2[mm].T).mean()) / GLOB
    righe.append(dict(c=c, size=len(mem), coh=coh, dens=dens, w=w_in,
                      deg=float(grado[mem].mean()), lowdeg=float((grado[mem] < 5).mean()),
                      accordo=accordo, lift=lift_tipi,
                      tema=TEMA[tema_arg[mem[0]]], mem=mem))
print(f"cluster valutabili (>=5 titoli): {len(righe):,}")

print("")
print("=== CORRELAZIONE CON LA COERENZA (Spearman) ===")
print(f"{'proprieta':<26} {'rho':>7} {'p':>9}  lettura")
for prop, descr in (("dens", "densita' interna"), ("w", "peso medio archi"),
                    ("deg", "grado medio"), ("lowdeg", "quota nodi a basso grado"),
                    ("accordo", "accordo fra i 4 tipi"), ("size", "dimensione")):
    rho, p = spearmanr([r["coh"] for r in righe], [r[prop] for r in righe])
    verso = "piu' alto = migliore" if rho > 0 else "piu' alto = peggiore"
    print(f"{descr:<26} {rho:>7.3f} {p:>9.1e}  {verso}")

print("")
print("=== I 5 PEGGIORI per coerenza, con le loro proprieta' ===")
righe.sort(key=lambda r: r["coh"])
for r in righe[:5]:
    print(f"\n  coerenza {r['coh']:.1f}x · {r['size']} titoli · densita' {r['dens']:.4f} · "
          f"peso {r['w']:.3f} · grado {r['deg']:.1f} · basso grado {100*r['lowdeg']:.0f}%")
    print(f"     accordo fra tipi {r['accordo']:.2f}x  " +
          " ".join(f"{k}:{v:.1f}" for k, v in r["lift"].items()))
    print(f"     {', '.join(nome(keys[i]) for i in r['mem'][:8])}")

print("")
print("=== I 5 MIGLIORI per coerenza ===")
for r in righe[-5:]:
    print(f"\n  coerenza {r['coh']:.1f}x · {r['size']} titoli · densita' {r['dens']:.4f} · "
          f"peso {r['w']:.3f} · grado {r['deg']:.1f} · basso grado {100*r['lowdeg']:.0f}%")
    print(f"     accordo fra tipi {r['accordo']:.2f}x  " +
          " ".join(f"{k}:{v:.1f}" for k, v in r["lift"].items()))
    print(f"     {', '.join(nome(keys[i]) for i in r['mem'][:8])}")

print("")
print("=== e i peggiori di dimensione >=30 (i grandi che fanno schifo) ===")
grandi = [r for r in righe if r["size"] >= 30]
for r in sorted(grandi, key=lambda r: r["coh"])[:3]:
    print(f"\n  coerenza {r['coh']:.1f}x · {r['size']} titoli · densita' {r['dens']:.4f} · "
          f"peso {r['w']:.3f} · grado {r['deg']:.1f}")
    print(f"     accordo fra tipi {r['accordo']:.2f}x  " +
          " ".join(f"{k}:{v:.1f}" for k, v in r["lift"].items()))
    print(f"     {', '.join(nome(keys[i]) for i in r['mem'][:8])}")
