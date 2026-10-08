"""
.scratch/ml-collaborativo/audit-adjacency.py

L'AUDIT ESTERNO DEL GRAFO DI ADIACENZA.

Oggi il grafo e' promosso da solo: modularita' 0,696, coerenza 0,618, ARI contro se stesso.
Manca il giudice fuori dal grafo. Il teacher MovieLens (32M di voti di 200.948 utenti) E' quel
giudice: dice se due micro-cluster sono vicini per le PERSONE, non per la co-occorrenza di parole.

La domanda: i pesi dell'adiacenza (PPMI) ordinano la vicinanza collaborativa?
Se si', il grafo ha un criterio esterno e si puo' MIGLIORARE contro di esso (adiacenza appresa).
Se no, l'adiacenza e' decorazione e va rifatta.

Metriche (sempre col controllo dentro):
  1. AUC: P(coseno collaborativo di una coppia con arco > di una coppia senza arco)
  2. Spearman fra PESO dell'arco e vicinanza collaborativa (il peso ordina?)
  3. decile alto vs decile basso (il peso ha gradiente?)
  4. bacino di validita': quanti cluster hanno abbastanza film col teacher

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/audit-adjacency.py
"""
import json
import pathlib

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.sparse.linalg import svds
from scipy.stats import spearmanr

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / ".cache" / "movielens" / "ml-32m"
PQ = ROOT / ".cache" / "tmdb"
ADJ = ROOT / ".cache" / "movielens" / "l1-adjacency.json"
TEACHER = ROOT / ".cache" / "movielens" / "teacher-Z.npz"
GRAPH = ROOT / "src" / "data" / "hierarchical_graph.json"
EMB_DIM = 64
SEED = 20261008

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)

# ---------------------------------------------------------------- 1. il teacher (cache su disco)
if TEACHER.exists():
    z = np.load(TEACHER)
    Z, mids = z["Z"], z["mids"]
    log(f"teacher dalla cache: {Z.shape[0]:,} film x {Z.shape[1]} dimensioni")
else:
    links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
    links["tmdbId"] = links["tmdbId"].astype("int64"); links["movieId"] = links["movieId"].astype("int64")
    movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
    mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "keywords"])
    mv = mv[mv["keywords"].map(lambda s: isinstance(s, str) and len(json.loads(s)) > 0)]
    covered = sorted(set(movieid_by_tmdb[int(x)] for x in mv["id"] if int(x) in movieid_by_tmdb))
    mid_pos = {m: i for i, m in enumerate(covered)}
    ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
    ratings = ratings[ratings["movieId"].isin(mid_pos)]
    r = ratings.copy(); r["i"] = r["movieId"].map(mid_pos).astype("int32")
    X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                          shape=(int(r["userId"].max()) + 1, len(covered)))
    X.sum_duplicates(); X.data[:] = 1.0
    n_item = np.asarray(X.sum(axis=0)).ravel()
    Xw = X.multiply((1.0 / np.log1p(np.maximum(n_item, 1)))[None, :]).tocsr()
    U, S, Vt = svds(Xw, k=EMB_DIM)
    Z = Vt.T; Z = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
    mids = np.array(covered)
    np.savez_compressed(TEACHER, Z=Z, mids=mids)
    log(f"teacher calcolato e messo in cache: {Z.shape[0]:,} film · 1a componente {100*(S[-1]**2)/(S**2).sum():.1f}% di varianza")
movieid_by_tmdb = {int(t): int(m) for t, m in pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])[["tmdbId", "movieId"]].astype("int64").values}
teacher_row = {int(m): i for i, m in enumerate(mids)}

# ---------------------------------------------------------------- 2. film -> cluster L1
g = json.loads(GRAPH.read_text(encoding="utf-8"))
kw_to_l1 = g["kw_to_L1"]
l1_medoid = {k: (v.get("medoid") or "") for k, v in g["L1"].items()}
vocab = {n: i for i, n in enumerate(kw_to_l1)}
cluster_ids = sorted({int(c[2:]) for c in l1_medoid})              # indice cluster -> posizione
cpos = {c: i for i, c in enumerate(cluster_ids)}

mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "keywords"])
per_cluster = [[] for _ in cluster_ids]                            # posizione cluster -> righe del teacher
no_teacher = 0
for tid, raw in zip(mv["id"], mv["keywords"]):
    if not isinstance(raw, str):
        continue
    rows = teacher_row.get(movieid_by_tmdb.get(int(tid), -1))
    if rows is None:
        no_teacher += 1
        continue
    cl = set()
    for k in json.loads(raw):
        n = str(k.get("name", "")).strip().lower() if isinstance(k, dict) else ""
        if n in vocab:
            cl.add(cpos[int(kw_to_l1[n][2:])])
    for c in cl:
        per_cluster[c].append(rows)
log(f"film con teacher: {Z.shape[0]:,} · film fuori dal teacher: {no_teacher:,}")
sizes = np.array([len(x) for x in per_cluster])
log(f"cluster: {len(cluster_ids):,} · con almeno 1 film col teacher: {int((sizes>0).sum()):,} · mediana film per cluster {int(np.median(sizes[sizes>0]))}")

# ---------------------------------------------------------------- 3. il centroide collaborativo di ogni cluster
cent = np.zeros((len(cluster_ids), Z.shape[1]), dtype=np.float32)
for c, rows in enumerate(per_cluster):
    if rows:
        v = Z[rows].mean(axis=0)
        cent[c] = v / (np.linalg.norm(v) + 1e-9)
    else:
        cent[c] = np.nan
ok = ~np.isnan(cent[:, 0])

# ---------------------------------------------------------------- 4. l'adiacenza
adj = json.loads(ADJ.read_text(encoding="utf-8"))
edges, weights = [], []
for a, nb in adj.items():
    ca = cpos[int(a[2:])]
    for b, w in nb.items():
        cb = cpos[int(b[2:])]
        edges.append((ca, cb)); weights.append(w)
edges = np.array(edges); weights = np.array(weights)
log(f"archi dell'adiacenza: {len(edges):,}")

# controllo: il grado c'e' sempre (cap 50), il PESO no: si ordina la vicinanza collaborativa?
edge_ok = ok[edges[:, 0]] & ok[edges[:, 1]] & (edges[:, 0] != edges[:, 1])
cos_edge = np.einsum("ij,ij->i", cent[edges[edge_ok, 0]], cent[edges[edge_ok, 1]])
w_edge = weights[edge_ok]
log(f"archi valutabili (entrambi i cluster hanno il teacher): {int(edge_ok.sum()):,} ({100*edge_ok.mean():.0f}%)")

# il controllo del banale: coppie di cluster a caso dalla stessa distribuzione di dimensione
deg = np.array([len(adj.get(f'c_{c}', {})) for c in cluster_ids])
same_deg = [i for i in range(len(cluster_ids)) if ok[i] and deg[i] > 0]
rnd_a = rng.choice(same_deg, size=int(edge_ok.sum()), replace=True)
rnd_b = rng.choice(same_deg, size=int(edge_ok.sum()), replace=True)
keep = rnd_a != rnd_b
cos_rand = np.einsum("ij,ij->i", cent[rnd_a[keep]], cent[rnd_b[keep]])

def auc(x, y):
    """P(x > y) + 0,5·P(x == y): quante volte una coppia CON arco batte una SENZA.
    (Prima versione SBAGLIATA: contava P(y > x), e stampava 0,371 dove il vero valore è 0,629.)"""
    x = np.sort(x)
    lt = np.searchsorted(x, y, side="left").sum()
    le = np.searchsorted(x, y, side="right").sum()
    eq = le - lt
    return float((len(x) * len(y) - le + 0.5 * eq) / (len(x) * len(y)))

log("\n=== L'AUDIT ESTERNO ===")
log(f"  coseno collaborativo medio — coppie CON arco:  {cos_edge.mean():+.3f}  (mediana {np.median(cos_edge):+.3f})")
log(f"  coseno collaborativo medio — coppie A CASO:    {cos_rand.mean():+.3f}  (mediana {np.median(cos_rand):+.3f})")
log(f"  ** AUC = P(con-arco batte a-caso) = {auc(cos_edge, cos_rand):.3f} **   (0,500 = inutile, 1,000 = perfetto)")
rho, p = spearmanr(w_edge, cos_edge)
log(f"  Spearman fra PESO dell'arco e vicinanza collaborativa: {rho:+.3f} (p={p:.1e})   <- il peso ORDINA?")
q = np.quantile(w_edge, [0.1, 0.5, 0.9])
for lbl, m in [("decile basso", w_edge <= q[0]), ("mediana", (w_edge > q[0]) & (w_edge < q[2])), ("decile alto", w_edge >= q[2])]:
    log(f"  {lbl:<14}: peso ~{w_edge[m].mean():8.2f} · vicinanza collaborativa {cos_edge[m].mean():+.3f}")
log("\n  Esempi: le 5 coppie con arco PIU' FORTE e le 5 piu' debole, con la vicinanza reale")
order = np.argsort(-w_edge)
for tag, idxs in [("FORTE", order[:5]), ("DEBOLE", order[-5:])]:
    for i in idxs:
        a, b = cluster_ids[edges[edge_ok][i][0]], cluster_ids[edges[edge_ok][i][1]]
        log(f"    {tag}  {l1_medoid[f'c_{a}']:<22} - {l1_medoid[f'c_{b}']:<22} peso {weights[edge_ok][i]:8.2f} · collaborativo {cos_edge[i]:+.3f}")
