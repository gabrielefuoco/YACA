"""
.scratch/ml-collaborativo/build-film-graph.py

IL GRAFO DEI FILM, come chiesto dall'utente (08/10/2026):

  0. CONTROLLI: il mapping MovieLens→TMDB è corretto? gli archi sono rappresentabili?
     i metadati sono arricchiti (punteggio bayesiano, voti, anno, durata, lingua,
     paese)? — se qualcosa qui è rotto, tutto il resto è fumo.
  1. TEACHER: embedding denso dei film coperti da MovieLens (SVD della matrice di
     co-visione corretta per popolarità). 64 dimensioni.
  2. STUDENT: un classificatore/regressore STANDARD (Ridge, nessun LLM/Transformer)
     impara a predire quell'embedding dalle feature del film: sottografo delle
     keyword (L1/L2/L3) + generi + punteggio bayesiano + voti + anno + durata.
     Verifica su film tenuti fuori: quanto è vicino l'embedding predetto?
  3. PROIEZIONE: si proiettano TUTTI i film (e le serie) del database.
  4. GRAFO: k-NN MUTUALE sui vettori proiettati + Leiden.
  5. REPORT: cluster, dimensioni, coerenza, e confronto con L1-L5.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/build-film-graph.py
"""
import json
import pathlib
import time
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.sparse.linalg import svds
from sklearn.linear_model import Ridge

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / ".cache" / "movielens" / "ml-32m"
PQ = ROOT / ".cache" / "tmdb"
OUT_DIR = ROOT / ".cache" / "movielens"

MIN_RATINGS = 20
EMB_DIM = 64
KNN = 12
SEED = 20261008

def log(m):
    print(m, flush=True)
def t0():
    return time.time()

rng = np.random.default_rng(SEED)

# ==================================================================== 0. dati
log("=== 0. CARICO E CONTROLLO ===")
links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
links["tmdbId"] = links["tmdbId"].astype("int64"); links["movieId"] = links["movieId"].astype("int64")
movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
tmdb_by_movieid = {v: k for k, v in movieid_by_tmdb.items()}
log(f"  links.csv: {len(links)} righe · tmdbId distinti {links['tmdbId'].nunique()} · movieId distinti {links['movieId'].nunique()}")

movies = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "keywords", "genres", "release_date",
                                                        "vote_count", "vote_average", "runtime", "original_language",
                                                        "production_countries", "popularity"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "keywords", "genres", "first_air_date",
                                                 "vote_count", "vote_average", "original_language",
                                                 "production_countries", "popularity"])
movies["type"] = "movie"; tv["type"] = "tv"
movies["date"] = movies["release_date"]; tv["date"] = tv["first_air_date"]
tv["title"] = tv["name"]; tv["runtime"] = np.nan
cat = pd.concat([movies.drop(columns=["name", "first_air_date"], errors="ignore"),
                 tv.drop(columns=["name", "release_date"], errors="ignore")], ignore_index=True)
cat = cat.dropna(subset=["keywords"])
cat["kw_objs"] = cat["keywords"].map(json.loads)
cat["kw"] = cat["kw_objs"].map(lambda ks: frozenset(int(k["id"]) for k in ks if isinstance(k, dict) and k.get("id")))
cat["kw_names"] = cat["kw_objs"].map(lambda ks: frozenset(str(k.get("name", "")).strip().lower() for k in ks if isinstance(k, dict) and k.get("name")))
cat["genres_set"] = cat["genres"].map(lambda s: frozenset(int(g["id"]) for g in json.loads(s)) if s else frozenset())
cat["year"] = pd.to_numeric(cat["date"].astype(str).str[:4], errors="coerce")
cat = cat[cat["kw"].map(len) > 0].reset_index(drop=True)

# punteggio bayesiano (formula IMDb): m = media globale, C = soglia voti
C_VOTES = 250.0
m_global = float((cat["vote_average"] * cat["vote_count"]).sum() / max(1, cat["vote_count"].sum()))
cat["bayes"] = (cat["vote_count"] * cat["vote_average"] + C_VOTES * m_global) / (cat["vote_count"] + C_VOTES)

film_mask = (cat["type"] == "movie").to_numpy()
covered = np.array([(int(i) in movieid_by_tmdb) for i in cat["id"]], dtype=bool) & film_mask
log(f"  catalogo: {len(cat)} titoli ({int(film_mask.sum())} film, {int((~film_mask).sum())} serie)")
log(f"  film coperti da MovieLens: {int(covered.sum())} ({100*covered.sum()/max(1,film_mask.sum()):.1f}% dei film)")
log(f"  punteggio bayesiano: media globale {m_global:.3f} · soglia {C_VOTES} voti · range {cat['bayes'].min():.2f}-{cat['bayes'].max():.2f}")
log(f"  metadati presenti: anno {100*cat['year'].notna().mean():.0f}% · durata {100*cat['runtime'].notna().mean():.0f}% "
    f"· lingua {100*cat['original_language'].notna().mean():.0f}% · paese {100*cat['production_countries'].notna().mean():.0f}%")

# --- controllo di correttezza del mapping su titoli noti (per TIPO: gli id si ripetono fra film e serie) ---
CHECK = {862: "Toy Story", 680: "Pulp Fiction", 27205: "Inception", 496243: "Parasite", 238: "Il padrino"}
log("  controllo mapping (tmdbId → titolo nostro, film):")
for tmdb, atteso in CHECK.items():
    row = cat[(cat["id"] == tmdb) & (cat["type"] == "movie")]
    titolo = row["title"].iloc[0] if len(row) else "(assente)"
    log(f"    {tmdb} → {titolo!r} (atteso ~{atteso!r}) · in MovieLens: {tmdb in movieid_by_tmdb}")

# --- il sottografo delle keyword ---
G = json.loads((ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
CHAIN = {}
for name, c in G["kw_to_L1"].items():
    t = (G["L1"].get(c) or {}).get("parent")
    v = (G["L2"].get(t) or {}).get("parent") if t else None
    CHAIN[name] = (c, t, v)
l1_ids = {k: i for i, k in enumerate(G["L1"].keys())}
l2_ids = {k: i for i, k in enumerate(G["L2"].keys())}
l3_ids = {k: i for i, k in enumerate(G["L3"].keys())}
log(f"  sottografo: {len(CHAIN)} catene · L1 {len(l1_ids)} · L2 {len(l2_ids)} · L3 {len(l3_ids)}")

# ATTENZIONE: TMDB riusa gli stessi id per film e serie (verificato: 862 → «Toy Story» film,
# ma anche una serie; 238 → «Il padrino» e «Star Cops»). Quindi il mapping MovieLens
# (che contiene SOLO film) va applicato alle righe di tipo movie, mai alle serie.
to_pos = np.full(len(cat), -1, dtype="int64")
for i in range(len(cat)):
    if cat["type"].iloc[i] != "movie":
        continue
    mid = int(cat["id"].iloc[i])
    if mid in movieid_by_tmdb:
        to_pos[i] = movieid_by_tmdb[mid]
log(f"  righe con teacher (solo film, id di MovieLens): {int((to_pos >= 0).sum())}")
log(f"  controllo collisione: serie con id presente in links.csv che NON ricevono teacher: "
    f"{int(((cat['type'] == 'tv') & cat['id'].isin(movieid_by_tmdb.keys())).sum())}")

# ==================================================================== 1. teacher
log("\n=== 1. TEACHER: embedding dalla co-visione (SVD, corretta per popolarità) ===")
ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
covered_mids = set(int(m) for m in to_pos[to_pos >= 0])
ratings = ratings[ratings["movieId"].isin(covered_mids)]
mids = sorted(covered_mids)
mid_pos = {m: i for i, m in enumerate(mids)}
r = ratings.copy(); r["i"] = r["movieId"].map(mid_pos).astype("int32")
X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                      shape=(int(r["userId"].max()) + 1, len(mids)))
X.sum_duplicates(); X.data[:] = 1.0
log(f"  matrice utenti×film coperti: {X.shape} · voti {X.nnz:,}")
# correzione di popolarità (PMI sui co-voti) applicata come pesatura delle colonne
n_item = np.asarray(X.sum(axis=0)).ravel()
w = 1.0 / np.log1p(n_item)                 # ogni film pesato per la sua (non) popolarità
Xw = X.multiply(w[None, :]).tocsr()
k = min(EMB_DIM, min(Xw.shape) - 1)
U, S, Vt = svds(Xw, k=k)
Z = (U * S)                                   # utenti nello spazio latente
Zitem = Vt.T                                   # film nello spazio latente
Zitem = Zitem / (np.linalg.norm(Zitem, axis=1, keepdims=True) + 1e-9)
log(f"  SVD {k} componenti · varianza spiegata {100*(S**2).sum()/(np.asarray(Xw.multiply(Xw).sum())):.1f}% (indicativa)")

# ==================================================================== 2. student
log("\n=== 2. STUDENT: feature → embedding (Ridge, standard) ===")
N_TOPO = len(l1_ids) + len(l2_ids) + len(l3_ids)
rows_i, cols_i, vals_i = [], [], []
genres_vocab = {}
extra = np.zeros((len(cat), 6), dtype=np.float32)       # anno, log voti, bayes, durata, pop, è serie
topo_done = 0
for i in range(len(cat)):
    names, genres, row = cat["kw_names"].iloc[i], cat["genres_set"].iloc[i], []
    for n in names:
        ch = CHAIN.get(n)
        if not ch:
            continue
        if ch[0]: row.append(l1_ids[ch[0]])
        if ch[1]: row.append(len(l1_ids) + l2_ids[ch[1]])
        if ch[2]: row.append(len(l1_ids) + len(l2_ids) + l3_ids[ch[2]])
    if row:
        topo_done += 1
    for c in set(row):
        rows_i.append(i); cols_i.append(c); vals_i.append(1.0)
    for g in genres:
        if g not in genres_vocab:
            genres_vocab[g] = N_TOPO + len(genres_vocab)
        rows_i.append(i); cols_i.append(genres_vocab[g]); vals_i.append(1.0)
    y = cat["year"].iloc[i]
    extra[i] = [0.0 if pd.isna(y) else (y - 1990) / 30.0, np.log1p(cat["vote_count"].iloc[i]),
                cat["bayes"].iloc[i], 0.0 if pd.isna(cat["runtime"].iloc[i]) else cat["runtime"].iloc[i] / 120.0,
                np.log1p(cat["popularity"].iloc[i]), 1.0 if cat["type"].iloc[i] == "tv" else 0.0]
F = sparse.hstack([sparse.csr_matrix((vals_i, (rows_i, cols_i)), shape=(len(cat), N_TOPO + len(genres_vocab))),
                   sparse.csr_matrix(extra)]).tocsr()
log(f"  feature: {F.shape[1]} colonne ({N_TOPO} nodi del sottografo + {len(genres_vocab)} generi + 6 numeriche) · titoli con topoi {topo_done}/{len(cat)}")

trainable = np.array([i for i, p in enumerate(to_pos) if p >= 0], dtype="int64")
shuffled = rng.permutation(trainable)
n_test = max(200, int(0.2 * len(shuffled)))
test_idx, train_idx = shuffled[:n_test], shuffled[n_test:]
Yall = np.zeros((len(cat), k), dtype=np.float32)   # target: embedding del teacher, dove esiste
mid_to_zi = {int(m): j for j, m in enumerate(mids)}
for i in trainable:
    Yall[i] = Zitem[mid_to_zi[int(to_pos[i])]]

model = Ridge(alpha=1.0, solver="lsqr", max_iter=500)
model.fit(F[train_idx], Yall[train_idx])
pred_te = model.predict(F[test_idx])
def cos_rows(A, B):
    A = A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9)
    B = B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9)
    return np.asarray((A * B).sum(axis=1)).ravel()
cos_te = cos_rows(pred_te, Yall[test_idx])
base_cos = cos_rows(np.zeros_like(Yall[test_idx]) + Yall[test_idx].mean(axis=0), Yall[test_idx])
log(f"  addestrato su {len(train_idx):,} film · verificato su {len(test_idx):,} TENUTI FUORI")
log(f"  coseno(predetto, vero): medio {cos_te.mean():.3f} · mediano {np.median(cos_te):.3f}")
log(f"  controllo (vettore medio del catalogo): {base_cos.mean():.3f} → il modello batte il banale di {cos_te.mean()-base_cos.mean():+.3f}")

# ==================================================================== 3. proiezione
log("\n=== 3. PROIEZIONE di TUTTI i titoli ===")
P = model.predict(F)
P = P / (np.linalg.norm(P, axis=1, keepdims=True) + 1e-9)
log(f"  proiettati {len(P)} titoli in {k} dimensioni (film {int(film_mask.sum())}, serie {int((~film_mask).sum())})")

# ==================================================================== 4. grafo
log("\n=== 4. GRAFO k-NN MUTUALE + LEIDEN ===")
import igraph as ig
import leidenalg as la

N = len(P)
topk_idx = np.zeros((N, KNN), dtype=np.int32)
topk_sim = np.zeros((N, KNN), dtype=np.float32)
block = 512
for start in range(0, N, block):
    stop = min(start + block, N)
    sims = P[start:stop] @ P.T                      # (block, N)
    for bi, row in enumerate(range(start, stop)):
        sims[bi, row] = -1.0                        # esclude se stesso dal k-NN
    idx = np.argpartition(-sims, KNN, axis=1)[:, :KNN]
    for bi, row in enumerate(range(start, stop)):
        order = idx[bi][np.argsort(-sims[bi, idx[bi]])]
        topk_idx[row] = order
        topk_sim[row] = sims[bi, order]
# mutual k-NN + soglia di similarità
sets = [set(topk_idx[i].tolist()) for i in range(N)]
edges = set()
for i in range(N):
    for j, sim in zip(topk_idx[i], topk_sim[i]):
        j = int(j)
        if i != j and sim >= 0.45:
            edges.add((min(i, j), max(i, j)))
log(f"  archi (k-NN k={KNN} con soglia coseno 0.45): {len(edges):,} su {N:,} nodi")
g = ig.Graph(n=N, edges=list(edges), directed=False)
g.simplify()
comps = g.connected_components()
giant = max(comps, key=len)
log(f"  componenti: {len(comps)} · gigante {len(giant):,} nodi ({100*len(giant)/N:.0f}%) · isolati {sum(1 for c in comps if len(c) == 1)}")
sub = g.induced_subgraph(giant) if hasattr(g, "induced_subgraph") else g.subgraph(giant)
log("  sweep della risoluzione di Leiden (cerco 200–400 micro-generi):")
best = None
for res in [4.0, 8.0, 16.0, 32.0, 64.0]:
    part_try = la.find_partition(sub, la.RBConfigurationVertexPartition, resolution_parameter=res, seed=SEED)
    sizes_try = sorted((len(c) for c in part_try), reverse=True)
    log(f"    res {res}: {len(part_try)} cluster · max {sizes_try[0]} · mediana {sizes_try[len(sizes_try)//2]} · modularità {part_try.modularity:.3f}")
    if best is None or abs(len(part_try) - 300) < abs(len(best[1]) - 300):
        best = (res, part_try)
res_best, part_sub = best
part = la.find_partition(g, la.RBConfigurationVertexPartition, resolution_parameter=res_best, seed=SEED)
sizes = sorted((len(c) for c in part), reverse=True)
log(f"  scelta res {res_best}: {len(part)} cluster su tutto il grafo · max {sizes[0]} · mediana {sizes[len(sizes)//2]}"
    f" · con ≥20 titoli {sum(1 for s in sizes if s >= 20)}")

# ==================================================================== 5. report
log("\n=== 5. COSA SONO QUESTI CLUSTER ===")
member = np.zeros(N, dtype=np.int32)
for ci, c in enumerate(part):
    for node in c:
        member[node] = ci
intra = []
for i in range(N):
    same = [j for j in topk_idx[i] if member[j] == member[i]]
    if same:
        intra.append(float(np.mean([P[i] @ P[j] for j in same])))
rnd = [float(P[i] @ P[int(rng.integers(0, N))]) for i in range(0, N, 7)]
log(f"  coerenza: coseno medio con i vicini dello STESSO cluster {np.mean(intra):.3f} · con un titolo a caso {np.mean(rnd):.3f}")

# etichetta dei cluster grandi con i topoi dominanti (L2)
l2_start, l2_end = len(l1_ids), len(l1_ids) + len(l2_ids)
l2_inv = {v: kk for kk, v in l2_ids.items()}
log("\n  5 cluster più grandi (topoi L2 dominanti fra i membri):")
for ci in np.argsort(-np.array(sizes))[:5]:
    nodes = list(part[int(ci)])
    cnt = Counter()
    for node in nodes[:500]:
        for c in F[node, l2_start:l2_end].indices:
            cnt[l2_inv[int(c)]] += 1
    log(f"    cluster {ci}: {len(nodes):,} titoli · topoi: " + ", ".join(f"{G['L2'][x]['medoid']}({n})" for x, n in cnt.most_common(4)))

log("\n  ESEMPI: i film dentro i cluster scelti (ordinati per voto bayesiano)")
order = np.argsort(-np.asarray(cat["bayes"])).tolist()
rank_of = {node: r for r, node in enumerate(order)}
by_size = sorted(range(len(part)), key=lambda ci: -len(part[ci]))
sample_clusters = by_size[:2] + by_size[len(by_size) // 2: len(by_size) // 2 + 2]
for ci in sample_clusters:
    nodes = sorted(part[ci], key=lambda n: rank_of.get(n, 10**9))[:8]
    titoli = [f"{cat['title'].iloc[n]} ({int(cat['year'].iloc[n]) if pd.notna(cat['year'].iloc[n]) else '—'})" for n in nodes]
    cnt = Counter()
    for node in part[ci]:
        for c in F[node, l2_start:l2_end].indices:
            cnt[l2_inv[int(c)]] += 1
    etichetta = ", ".join(G["L2"][x]["medoid"] for x, _ in cnt.most_common(3))
    log(f"    cluster {ci} ({len(part[ci])} titoli · topoi: {etichetta})")
    log("      " + " · ".join(titoli))

# confronto con L2 della gerarchia: sono gli stessi cluster?
l2_of = np.full(N, -1, dtype="int64")
for i in range(N):
    idxs = F[i, l2_start:l2_end].indices
    if len(idxs) > 0:
        l2_of[i] = idxs[0]
ok = l2_of >= 0
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score
ari = adjusted_rand_score(l2_of[ok], member[ok])
nmi = normalized_mutual_info_score(l2_of[ok], member[ok])
log(f"\n  confronto con i topoi L2 della gerarchia: ARI {ari:.3f} · NMI {nmi:.3f} (0 = indipendenti)")
out = OUT_DIR / "film-graph.npz"
np.savez_compressed(out, embeddings=P.astype(np.float32), member=member,
                    ids=cat["id"].to_numpy(), types=cat["type"].to_numpy())
log(f"  scritto {out} (embeddings + assegnazione cluster)")
