"""
.scratch/ml-collaborativo/fix-puntuali.py

DUE FIX PUNTUALI, dopo le feature estese.

 1. RISOLUZIONE DI LEIDEN: col grafo nuovo i cluster sono cresciuti (mediana 4.118
    a res 16, che non e' piu' un micro-genere). Sweep su risoluzioni piu' alte.

 2. FEATURE AD ALTA CARDINALITA': il gap in-sample e' +0,128. Si prova
    la normalizzazione L2 delle righe di feature (cosi' un film con 8 attori e uno
    con 1 pesano uguale) e uno sweep di alpha. Metrica: coseno held-out SEMPRE
    accanto al controllo del vettore medio.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/fix-puntuali.py
"""
import json
import pathlib
from collections import Counter

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.sparse.linalg import svds
from sklearn.linear_model import Ridge

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / ".cache" / "movielens" / "ml-32m"
PQ = ROOT / ".cache" / "tmdb"
GRAPH = ROOT / ".cache" / "movielens" / "film-graph.npz"
EMB_DIM = 64
SEED = 20261008

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)
cos = lambda A, B: np.asarray((A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9) *
                               (B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9))).sum(axis=1)).ravel()

# ============================================================ 1. Leiden
log("=== 1. RISOLUZIONE DI LEIDEN sul grafo nuovo ===")
import igraph as ig
import leidenalg as la
g = np.load(GRAPH, allow_pickle=True)
member, edges, P = g["member"], g["edges"], g["embeddings"]
log(f"  nodi {len(member):,} · archi {len(edges):,} · cluster attuali {len(set(member.tolist()))}")
gr = ig.Graph(n=len(member), edges=[tuple(e) for e in edges], directed=False)
gr.simplify()
best = None
log("  | res | cluster | mediana | max | modularità | coerenza media |")
log("  |---|---|---|---|---|---|")
for res in [16, 32, 64, 128, 256]:
    part = la.find_partition(gr, la.RBConfigurationVertexPartition, resolution_parameter=res, seed=SEED)
    sizes = sorted((len(c) for c in part), reverse=True)
    # coerenza: coseno medio fra membri campionati dello stesso cluster
    cosines = []
    for c in part:
        if len(c) < 2:
            continue
        idx = np.array(c)[:40]
        sub = P[idx]
        sub = sub / (np.linalg.norm(sub, axis=1, keepdims=True) + 1e-9)
        M = sub @ sub.T
        cosines.append(float((M.sum() - len(idx)) / (len(idx) * (len(idx) - 1))))
    log(f"  | {res} | {len(part)} | {sizes[len(sizes)//2]} | {sizes[0]} | {part.modularity:.3f} | {np.mean(cosines):.3f} |")
    if best is None or abs(len(part) - 300) < abs(best[1] - 300):
        best = (res, len(part), part)
log(f"  -> risoluzione scelta per ~300 cluster: {best[0]} ({best[1]} cluster)")

# ============================================================ 2. feature: normalizzazione e alpha
log("\n=== 2. FEATURE AD ALTA CARDINALITA': normalizzazione e alpha ===")
links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
links["tmdbId"] = links["tmdbId"].astype("int64"); links["movieId"] = links["movieId"].astype("int64")
movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))

cols = ["id", "title", "keywords", "genres", "vote_count", "vote_average", "runtime",
        "original_language", "production_countries", "popularity", "cast", "directors", "collection_id",
        "budget", "content_rating"]
mv = pd.read_parquet(PQ / "movies.parquet", columns=cols + ["release_date"])
mv["type"] = "movie"; mv["date"] = mv["release_date"]; mv["number_of_seasons"] = np.nan
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "keywords", "genres", "first_air_date", "vote_count",
                                                 "vote_average", "runtime", "original_language", "production_countries",
                                                 "popularity", "cast", "created_by", "content_rating", "number_of_seasons"])
tv["type"] = "tv"; tv["title"] = tv["name"]; tv["date"] = tv["first_air_date"]; tv["directors"] = tv["created_by"]
tv["collection_id"] = np.nan; tv["budget"] = np.nan
cat = pd.concat([mv[cols + ["release_date", "type", "date", "number_of_seasons"]], tv[cols + ["first_air_date", "type", "date", "number_of_seasons"]]], ignore_index=True)
cat = cat.dropna(subset=["keywords"]).reset_index(drop=True)
cat = cat[cat["keywords"].map(lambda s: len(json.loads(s)) > 0)].reset_index(drop=True)
cat["year"] = pd.to_numeric(cat["date"].astype(str).str[:4], errors="coerce")
C_VOTES = 250.0
m_global = float((cat["vote_average"] * cat["vote_count"]).sum() / max(1, cat["vote_count"].sum()))
cat["bayes"] = (cat["vote_count"] * cat["vote_average"] + C_VOTES * m_global) / (cat["vote_count"] + C_VOTES)

G = json.loads((ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
CHAIN = {}
for nm, c in G["kw_to_L1"].items():
    t_ = (G["L1"].get(c) or {}).get("parent")
    v_ = (G["L2"].get(t_) or {}).get("parent") if t_ else None
    CHAIN[nm] = (c, t_, v_)
l1_ids = {k: i for i, k in enumerate(G["L1"])}
l2_ids = {k: i for i, k in enumerate(G["L2"])}
l3_ids = {k: i for i, k in enumerate(G["L3"])}
N_TOPO = len(l1_ids) + len(l2_ids) + len(l3_ids)

def json_list(s, key):
    if not isinstance(s, str) or not s:
        return []
    try:
        v = json.loads(s)
    except Exception:
        return []
    return [x[key] for x in v if isinstance(x, dict) and x.get(key) is not None] if isinstance(v, list) else []

kw_names = cat["keywords"].map(lambda s: [str(k.get("name", "")).strip().lower() for k in json.loads(s) if isinstance(k, dict)])
countries = cat["production_countries"].map(lambda x: json_list(x, "iso_3166_1"))
people = cat.apply(lambda r: json_list(r["cast"], "id")[:8] + json_list(r["directors"], "id"), axis=1)
collections = cat["collection_id"].map(lambda x: [] if pd.isna(x) else [int(x)])
lang_vocab = {l: i for i, l in enumerate(cat["original_language"].dropna().value_counts().head(25).index)}
country_vocab = {c: i for i, (c, _) in enumerate(Counter(c for L in countries for c in L).most_common(40))}
people_vocab = {p: i for i, (p, _) in enumerate(Counter(p for L in people for p in L).most_common(3000))}
coll_vocab = {c: i for i, (c, _) in enumerate(Counter(c for L in collections for c in L).most_common(800))}
genres_vocab = {}
rows_i, cols_i, vals_i = [], [], []
for i in range(len(cat)):
    row = []
    for n in kw_names.iloc[i]:
        ch = CHAIN.get(n)
        if not ch:
            continue
        if ch[0]: row.append(l1_ids[ch[0]])
        if ch[1]: row.append(len(l1_ids) + l2_ids[ch[1]])
        if ch[2]: row.append(len(l1_ids) + len(l2_ids) + l3_ids[ch[2]])
    for c in set(row):
        rows_i.append(i); cols_i.append(c); vals_i.append(1.0)
    for gg in json.loads(cat["genres"].iloc[i] or "[]"):
        gid = int(gg["id"])
        if gid not in genres_vocab:
            genres_vocab[gid] = N_TOPO + len(genres_vocab)
        rows_i.append(i); cols_i.append(genres_vocab[gid]); vals_i.append(1.0)
OFF = N_TOPO + len(genres_vocab)
for i in range(len(cat)):
    lang = cat["original_language"].iloc[i]
    if lang in lang_vocab:
        rows_i.append(i); cols_i.append(OFF + lang_vocab[lang]); vals_i.append(1.0)
    for c in countries.iloc[i]:
        if c in country_vocab:
            rows_i.append(i); cols_i.append(OFF + len(lang_vocab) + country_vocab[c]); vals_i.append(1.0)
    for p in people.iloc[i]:
        if p in people_vocab:
            rows_i.append(i); cols_i.append(OFF + len(lang_vocab) + len(country_vocab) + people_vocab[p]); vals_i.append(1.0)
    for c in collections.iloc[i]:
        if c in coll_vocab:
            rows_i.append(i); cols_i.append(OFF + len(lang_vocab) + len(country_vocab) + len(people_vocab) + coll_vocab[c]); vals_i.append(1.0)
N_BIN = OFF + len(lang_vocab) + len(country_vocab) + len(people_vocab) + len(coll_vocab)
extra = np.zeros((len(cat), 8), dtype=np.float32)
for i in range(len(cat)):
    y = cat["year"].iloc[i]; bud = cat["budget"].iloc[i]
    extra[i] = [0.0 if pd.isna(y) else (y - 1990) / 30.0, np.log1p(cat["vote_count"].iloc[i]), cat["bayes"].iloc[i],
                0.0 if pd.isna(cat["runtime"].iloc[i]) else cat["runtime"].iloc[i] / 120.0,
                np.log1p(cat["popularity"].iloc[i]),
                0.0 if pd.isna(bud) else np.log1p(float(bud)),
                0.0 if pd.isna(cat["number_of_seasons"].iloc[i]) else float(cat["number_of_seasons"].iloc[i]) / 5.0,
                1.0 if str(cat["content_rating"].iloc[i] or "").upper() in ("R", "NC-17", "TV-MA") else 0.0]
F = sparse.hstack([sparse.csr_matrix((vals_i, (rows_i, cols_i)), shape=(len(cat), N_BIN)), sparse.csr_matrix(extra)]).tocsr()
log(f"  feature: {F.shape[1]:,} colonne ({N_BIN:,} binarie + 8 numeriche)")

# teacher
covered = sorted(set(movieid_by_tmdb[int(x)] for x in cat.loc[cat["type"] == "movie", "id"] if int(x) in movieid_by_tmdb))
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
row_of = {m: j for j, m in enumerate(covered)}
cov = np.array([(t == "movie" and int(i) in movieid_by_tmdb and movieid_by_tmdb[int(i)] in row_of)
                for t, i in zip(cat["type"], cat["id"])], dtype=bool)
Y = np.zeros((len(cat), EMB_DIM), dtype=np.float32)
idx = np.where(cov)[0]
for i in idx:
    Y[i] = Z[row_of[movieid_by_tmdb[int(cat["id"].iloc[i])]]]
perm = rng.permutation(idx); n_test = int(0.2 * len(perm))
test_idx, train_idx = perm[:n_test], perm[n_test:]
log(f"  film con teacher {int(cov.sum()):,} · train {len(train_idx):,} · test {len(test_idx):,}")
mean_vec = Y[test_idx].mean(axis=0)
log(f"  controllo (vettore medio): {cos(np.tile(mean_vec, (len(test_idx), 1)), Y[test_idx]).mean():.3f}")

# normalizzo SOLO il blocco binario (le numeriche restano sulla loro scala)
Fbin = F[:, :N_BIN].astype(np.float32)
row_norm = np.sqrt(np.asarray(Fbin.multiply(Fbin).sum(axis=1)).ravel()); row_norm[row_norm == 0] = 1.0
Fnorm = sparse.hstack([sparse.diags(1.0 / row_norm) @ Fbin, sparse.csr_matrix(F[:, N_BIN:])]).tocsr()

log("\n  | feature | alpha | held-out | in-sample | gap |")
log("  |---|---|---|---|---|")
for label, M in [("grezze", F), ("righe normalizzate (solo binarie)", Fnorm)]:
    for alpha in [1.0, 30.0]:
        m = Ridge(alpha=alpha, solver="lsqr", max_iter=1000).fit(M[train_idx], Y[train_idx])
        te = cos(m.predict(M[test_idx]), Y[test_idx]).mean()
        ins = cos(m.predict(M[train_idx]), Y[train_idx]).mean()
        log(f"  | {label} | {alpha} | {te:.3f} | {ins:.3f} | {ins-te:+.3f} |")

# ============================================================ 3. IL BERSAGLIO RUMOROSO
# Il soffitto (report 13) dice: stabilita' del bersaglio 0,270 sotto i 100 voti, 0,530 fra 100 e
# 1.000, 0,831 sopra. Oltre meta' del training set e' rumore e il modello lo sta imparando.
# Qui si pesa la perdita per l'affidabilita' MISURATA. Previsto, dichiarato prima: held-out migliore
# SUL SOTTOINSIEME AFFIDABILE, e l'aggregato lo nasconde -> si riporta per fascia.
votes = pd.to_numeric(cat["vote_count"], errors="coerce").fillna(0).to_numpy()
reliab = np.where(votes >= 1000, 0.831, np.where(votes >= 100, 0.530, 0.270))
band = np.where(votes >= 1000, 2, np.where(votes >= 100, 1, 0))
log("\n=== 3. IL BERSAGLIO RUMOROSO (peso per affidabilita' misurata) ===")
log("  fasce di verifica: " + " · ".join(f"{['<100','100-1k','1k+'][b]}: {int((band[test_idx]==b).sum())} film" for b in range(3)))
log("\n  | modello | held-out | <100 voti | 100-1k | 1k+ | in-sample |")
log("  |---|---|---|---|---|---|")
def evaluate(label, M, w=None, model="ridge", alpha=30.0):
    if model == "mlp":
        from sklearn.neural_network import MLPRegressor
        m = MLPRegressor(hidden_layer_sizes=(256,), alpha=1e-2, max_iter=60, early_stopping=True,
                         random_state=20261008, verbose=False)
    else:
        m = Ridge(alpha=alpha, solver="lsqr", max_iter=1000)
    if w is None:
        m.fit(M[train_idx], Y[train_idx])
    else:
        m.fit(M[train_idx], Y[train_idx], sample_weight=w[train_idx])
    p_te = m.predict(M[test_idx]); p_tr = m.predict(M[train_idx])
    per = [cos(p_te[band[test_idx] == b], Y[test_idx][band[test_idx] == b]).mean()
           if (band[test_idx] == b).sum() > 0 else float("nan") for b in range(3)]
    log(f"  | {label} | {cos(p_te, Y[test_idx]).mean():.3f} | {per[0]:.3f} | {per[1]:.3f} | {per[2]:.3f} | {cos(p_tr, Y[train_idx]).mean():.3f} |")
evaluate("Ridge alpha 30 (oggi)", F)
evaluate("+ peso per affidabilita'", F, w=reliab)
evaluate("+ peso, alpha 100", F, w=reliab, alpha=100.0)
evaluate("MLP 256 (capacita')", F, model="mlp")
log("\n  (previsione dichiarata prima: il peso aiuta SUL SOTTOINSIEME AFFIDABILE, l'MLP non batte il Ridge)")
