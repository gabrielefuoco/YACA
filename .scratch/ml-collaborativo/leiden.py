"""leiden.py — GRAFO COMPLETO + LEIDEN + VALUTAZIONE DEI CLUSTER.

Quattro tipi di arco, sparsificati in modo EQUO (top-k per nodo per tipo): il contenuto ha 993k
archi e la curatela 3.5k, senza sparsificazione la seconda annega (l'ablation lo ha dimostrato).
Poi Leiden e valutazione: modularita', purezza su generi/temi/tipo/decennio/lingua, quanti cluster
mescolano film e serie, e soprattutto quanti legami curati cadono nello stesso cluster.
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
import igraph as ig
import leidenalg as la
import pandas as pd

ROOT = pathlib.Path(".").resolve()
ML, PQ = ROOT / ".cache" / "movielens", ROOT / ".cache" / "tmdb"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")


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
TEMA_NOMI = [str(x) for x in zt["keys"]]
tema_arg = np.argmax(T, axis=1) if T.shape[0] == n else None

src = d["sources"]
train = [s for i, s in enumerate(src) if i % 2 == 0]


def topk_edges(V, k, min_sim=0.05):
    """top-k per nodo, simmetrizzato: ogni nodo ha lo stesso numero di archi per tipo."""
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


def trakt_edges():
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


def curatela_edges():
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


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


t0 = time.time()
K = 15
EC = topk_edges(Pc2, K)
EB = trakt_edges()
ET = topk_edges(T, K)
EK = curatela_edges()
print(f"archi grezzi: contenuto {EC.nnz:,} · co-visione {EB.nnz:,} · temi {ET.nnz:,} · curatela {EK.nnz:,}  ({time.time()-t0:.0f}s)")

PESI = {"contenuto": 1.0, "co-visione": 1.0, "temi": 1.0, "curatela": 6.0}
M = (PESI["contenuto"] * normalizza(EC) + PESI["co-visione"] * normalizza(EB) +
     PESI["temi"] * normalizza(ET) + PESI["curatela"] * normalizza(EK)).tocsr()
M.sum_duplicates()
M = (M + M.T) * 0.5
print(f"grafo unito: {M.nnz:,} archi · grado medio {M.nnz/n:.1f}")

coo = M.tocoo()
mask = coo.row < coo.col
edges = list(zip(coo.row[mask].tolist(), coo.col[mask].tolist()))
wts = coo.data[mask].tolist()
g = ig.Graph(n=n, edges=edges, directed=False)
g.es["weight"] = wts
print(f"igraph: {g.vcount():,} nodi · {g.ecount():,} archi ({time.time()-t0:.0f}s)")

# --- etichette note, per la valutazione ---
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "genres", "original_language", "release_date"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "genres", "original_language", "first_air_date"])
GEN, LANG, DEC = {}, {}, {}
for typ, df, dc in (("movie", mv, "release_date"), ("tv", tv, "first_air_date")):
    for i, gn, lg, dt in zip(df["id"], df["genres"], df["original_language"], df[dc]):
        k = f"{typ}:{int(i)}"
        try:
            g0 = json.loads(gn) if isinstance(gn, str) else gn
        except Exception:
            g0 = []
        if g0 and isinstance(g0[0], dict):
            g1 = g0[0].get("name", "?")
        elif g0:
            g1 = str(g0[0])
        else:
            g1 = "?"
        GEN[k] = g1
        LANG[k] = str(lg)
        y = str(dt)[:4]
        DEC[k] = (int(y) // 10 * 10) if y.isdigit() else 0

ETICHETTE = {
    "generi": np.array([GEN.get(k, "?") for k in keys]),
    "temi": np.array([TEMA_NOMI[t] for t in tema_arg]) if tema_arg is not None else None,
    "tipo": np.where(is_tv, "serie", "film"),
    "decennio": np.array([str(DEC.get(k, 0)) for k in keys]),
    "lingua": np.array([LANG.get(k, "?") for k in keys]),
}


def purezza(lab, glob):
    per = {}
    for i in range(len(lab)):
        per.setdefault(lab[i], Counter())[glob[i]] += 1
    tot = sum(sum(c.values()) for c in per.values())
    return sum(max(c.values()) for c in per.values()) / max(1, tot)


print("")
RIS = {}
for res in (0.3, 1.0, 3.0):
    part = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                             resolution_parameter=res, seed=42)
    lab = np.array(part.membership)
    sizes = np.bincount(lab)
    ncl = len(sizes)
    print(f"=== Leiden resolution {res}: {ncl} cluster · modularita' {part.modularity:.3f} · "
          f"mediana {int(np.median(sizes))} · max {sizes.max()} · singleton {(sizes==1).sum()} ===")
    for nome, glob in ETICHETTE.items():
        if glob is None:
            continue
        p = purezza(lab, glob)
        base = max(Counter(glob).values()) / len(glob)
        print(f"   {nome:<10} purezza {100*p:5.1f}%  (baseline {100*base:5.1f}% · guadagno {100*(p-base):+5.1f})")
    mix = np.mean([len(set(is_tv[lab == c])) == 2 for c in range(ncl)])
    print(f"   cluster misti film+serie: {100*mix:.0f}%")
    stesso = tot = 0
    for s in src:
        a = row_of.get(s["id"])
        if a is None:
            continue
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None:
                continue
            tot += 1
            stesso += int(lab[a] == lab[b])
    base = float(np.sum(sizes * (sizes - 1))) / (n * (n - 1))
    print(f"   LEGAMI CURATI nello stesso cluster: {100*stesso/tot:.1f}%  "
          f"(a caso {100*base:.2f}% · {stesso/tot/base:.0f}x)")
    RIS[res] = (lab, ncl, part.modularity, stesso / tot, (stesso / tot) / base)
print(f"\n({time.time()-t0:.0f}s)")

# --- esempi: cosa c'e' dentro i cluster piu' grandi alla risoluzione migliore ---
res_mig = max(RIS, key=lambda r: RIS[r][4])   # LIFT, non frazione grezza
lab, ncl, mod, co, lift = RIS[res_mig]
sizes = np.bincount(lab)
print(f"\n=== I 6 CLUSTER PIU' GRANDI (resolution {res_mig}) ===")
for c in np.argsort(-sizes)[:6]:
    membri = np.where(lab == c)[0]
    temi_c = Counter(TEMA_NOMI[tema_arg[i]] for i in membri if tema_arg is not None)
    gen_c = Counter(GEN.get(keys[i], "?") for i in membri)
    print(f"\ncluster {c}: {len(membri)} titoli · {int(is_tv[membri].sum())} serie / {int((~is_tv[membri]).sum())} film")
    print(f"   temi:   {', '.join(f'{t}({v})' for t, v in temi_c.most_common(4))}")
    print(f"   generi: {', '.join(f'{g}({v})' for g, v in gen_c.most_common(4))}")
    esempi = [keys[i] for i in membri[:6]]
    print(f"   esempi: {', '.join(esempi)}")
