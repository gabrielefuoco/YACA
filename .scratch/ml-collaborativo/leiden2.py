"""leiden2.py — GRANULARITA' FINE: sweep di risoluzione verso l'alto, e il CONFRONTO CON LA QUERY.

La domanda dell'utente: a granularita' grossa i cluster sono una query al DB travestita. Qui:
- sweep di risoluzione 3 -> 200 (cluster da ~2.000 a ~20 titoli)
- metriche comparabili fra risoluzioni: NMI (normalizzata) e purezza, non il lift grezzo
- IL CONFRONTO DECISIVO: i cluster come pool per la raccomandazione vs il GENERE TMDB come pool.
  Se i cluster non battono "filtra per genere", la query bastava.
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
import igraph as ig
import leidenalg as la
import pandas as pd
from sklearn.metrics import normalized_mutual_info_score as NMI

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
CACHE = pathlib.Path(ML / "leiden-graph.npz")
if CACHE.exists():
    zz = np.load(CACHE)
    M = csr_matrix((zz["data"], zz["indices"], zz["indptr"]), shape=(n, n))
    print(f"grafo da cache: {M.nnz:,} archi")
else:
    EC, EB = topk_edges(Pc2, 15), trakt_edges()
    ET, EK = topk_edges(T, 15), curatela_edges()
    print(f"archi: C {EC.nnz:,} · B {EB.nnz:,} · T {ET.nnz:,} · K {EK.nnz:,}")
    M = (normalizza(EC) + normalizza(EB) + normalizza(ET) + 6.0 * normalizza(EK)).tocsr()
    M.sum_duplicates()
    M = (M + M.T) * 0.5
    np.savez_compressed(CACHE, data=M.data, indices=M.indices, indptr=M.indptr)
    print(f"grafo unito: {M.nnz:,} archi (salvato)")

coo = M.tocoo()
mask = coo.row < coo.col
g = ig.Graph(n=n, edges=list(zip(coo.row[mask].tolist(), coo.col[mask].tolist())), directed=False)
g.es["weight"] = coo.data[mask].tolist()
print(f"igraph: {g.ecount():,} archi ({time.time()-t0:.0f}s)")

# --- etichette ---
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "genres", "original_language"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "genres", "original_language"])
GEN, LANG = {}, {}
for typ, df in (("movie", mv), ("tv", tv)):
    for i, gn, lg in zip(df["id"], df["genres"], df["original_language"]):
        k = f"{typ}:{int(i)}"
        try:
            g0 = json.loads(gn) if isinstance(gn, str) else gn
        except Exception:
            g0 = []
        GEN[k] = (g0[0].get("name", "?") if g0 and isinstance(g0[0], dict) else (str(g0[0]) if g0 else "?"))
        LANG[k] = str(lg)
gen_arr = np.array([GEN.get(k, "?") for k in keys])

# --- i legami curati come ground truth per il "pool test" ---
# per ogni sorgente con almeno 3 legami: i suoi legami sono i positivi
COPPIE = []
for s in src:
    a = row_of.get(s["id"])
    if a is None:
        continue
    pos = [row_of[l["id"]] for l in s["links"] if l["id"] in row_of]
    if len(pos) >= 3:
        COPPIE.append((a, np.array(pos)))
print(f"sorgenti con >=3 legami: {len(COPPIE)}")


def pool_test(lab, nome):
    """Per ogni sorgente: il pool e' il cluster/genere della sorgente. Quanti dei suoi legami
    stanno nel pool? E dentro il pool, la precisione (i legami sono una frazione piccola o grande)?"""
    dentro = tot = 0
    prec = []
    for a, pos in COPPIE:
        c = lab[a]
        m = (lab[pos] == c).sum()
        dentro += int(m)
        tot += len(pos)
        pool_size = int((lab == c).sum())
        prec.append(m / max(1, pool_size))
    return dentro / max(1, tot), float(np.mean(prec))


# --- sweep di risoluzione ---
print("")
print(f"{'res':>6} {'cluster':>8} {'mediana':>8} {'NMI gen':>8} {'NMI tema':>9} "
      f"{'curati in cluster':>18} {'pool/genere':>12}")
# baseline: il GENERE come pool
p_gen, prec_gen = pool_test(gen_arr, "genere")
print(f"{'GENERE':>6} {len(set(gen_arr)):>8} {'-':>8} {'-':>8} {'-':>9} "
      f"{100*p_gen:>17.1f}% {100*prec_gen:>11.2f}%")
RIS = {}
for res in (3.0, 10.0, 30.0, 100.0, 200.0):
    part = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                             resolution_parameter=res, seed=42)
    lab = np.array(part.membership)
    sizes = np.bincount(lab)
    nmi_g = NMI(lab, gen_arr)
    nmi_t = NMI(lab, tema_arg) if tema_arg is not None else 0.0
    p_cl, prec_cl = pool_test(lab, "cluster")
    print(f"{res:>6.0f} {len(sizes):>8} {int(np.median(sizes)):>8} {nmi_g:>8.3f} {nmi_t:>9.3f} "
          f"{100*p_cl:>17.1f}% {100*prec_cl:>11.2f}%")
    RIS[res] = (lab, sizes, nmi_g, p_cl, prec_cl)
print("")
print("LETTURA: 'curati in cluster' = quanti legami curati cadono nel pool della sorgente.")
print("'pool/genere' = la frazione del pool che sono legami curati (precisione del pool).")
print("Se i cluster non battono il genere su ENTRAMBE, la query al DB bastava.")

# --- i cluster fini piu' piccoli: cosa c'e' dentro ---
res_fine = max(RIS, key=lambda r: RIS[r][4])
lab, sizes, nmi_g, p_cl, prec_cl = RIS[res_fine]
print(f"\n=== RISOLUZIONE {res_fine}: {len(sizes)} cluster · {int(np.median(sizes))} titoli di mediana ===")
print("cluster piu' piccoli e specifici (dimensione 8-60):")
piccoli = [c for c in range(len(sizes)) if 8 <= sizes[c] <= 60]
for c in piccoli[:10]:
    membri = np.where(lab == c)[0]
    gen_c = Counter(gen_arr[i] for i in membri)
    temi_c = Counter(TEMA_NOMI[tema_arg[i]] for i in membri) if tema_arg is not None else Counter()
    tv_n = int(is_tv[membri].sum())
    esempi = [keys[i] for i in membri[:7]]
    print(f"\n  cluster {c}: {sizes[c]} titoli ({tv_n} serie / {sizes[c]-tv_n} film)")
    print(f"     generi: {', '.join(f'{g}({v})' for g, v in gen_c.most_common(3))}")
    if temi_c:
        print(f"     temi:   {', '.join(f'{t}({v})' for t, v in temi_c.most_common(3))}")
    print(f"     esempi: {', '.join(esempi)}")
print(f"\n({time.time()-t0:.0f}s)")
