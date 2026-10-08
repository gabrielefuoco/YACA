"""
.scratch/ml-collaborativo/probe-teacher-student.py

DUE ASSUNTI DEL PIANO, misurati su un campione — se cadono qui, il piano cade:

  A) IL TEACHER E' INFORMATIVO E DIVERSO DALLE KEYWORD
     - i suoi vicini sono «adiacenza culturale» (chi ha amato X ha amato Y) o solo film
       con le stesse keyword?
     - correlazione di rango fra similarita' collaborativa e similarita' delle keyword
       (alta = il teacher non porta niente di nuovo);
     - sovrapposizione dei top-10 vicini fra i due spazi.

  B) LO STUDENT E' IMPARABILE DAI METADATI
     - si predice «sono vicini nel teacher?» dalle sole feature di metadati?
     - e soprattutto: il modello COMPLETO batte la BASELINE che ha solo la similarita'
       delle keyword? Se no, lo student non aggiunge nulla a cio' che abbiamo.

Lo split e' per ITEM (non per coppia): altrimenti si misura la memoria del modello.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/probe-teacher-student.py
"""
import json
import pathlib
from collections import Counter

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.stats import spearmanr
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / ".cache" / "movielens" / "ml-32m"
PQ = ROOT / ".cache" / "tmdb" / "movies.parquet"

MIN_RATINGS = 20
SAMPLE_ITEMS = 3000
SAMPLE_PAIRS = 200_000
N_POS, N_NEG = 20, 40
SEED = 20261008
KNOWN = {78: "Blade Runner", 335984: "Blade Runner 2049", 152601: "Her", 829: "Chinatown",
         27205: "Inception", 496243: "Parasite", 348: "Alien", 106: "Predator",
         129: "La citta' incantata", 238: "Il padrino", 194: "Amelie", 157336: "Interstellar"}


def log(msg):
    print(msg, flush=True)


# ------------------------------------------------------------------ dati
log("carico links.csv e il nostro parquet...")
links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
links["tmdbId"] = links["tmdbId"].astype("int64")
links["movieId"] = links["movieId"].astype("int64")
movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
tmdb_by_movieid = {v: k for k, v in movieid_by_tmdb.items()}

movies = pd.read_parquet(PQ, columns=["id", "title", "keywords", "genres", "release_date",
                                      "vote_count", "runtime", "original_language"])
movies = movies.dropna(subset=["keywords"]).copy()
movies["id"] = movies["id"].astype("int64")
movies["kw_ids"] = movies["keywords"].map(
    lambda s: [int(k["id"]) for k in json.loads(s) if isinstance(k, dict) and k.get("id")])
movies["genres_set"] = movies["genres"].map(
    lambda s: {int(g["id"]) for g in json.loads(s)} if s else set())
movies["year"] = pd.to_numeric(movies["release_date"].astype(str).str[:4], errors="coerce")
movies = movies[movies["kw_ids"].map(len) > 0]
title_of_tmdb = dict(zip(movies["id"], movies["title"]))
log(f"  film nostri con keyword: {len(movies)} · mappati su MovieLens: {sum(t in movieid_by_tmdb for t in movies['id'])}")

log("carico i voti (32M righe)...")
ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
ratings = ratings[ratings["movieId"].isin(tmdb_by_movieid.keys())]
log(f"  voti sui nostri film: {len(ratings):,}")

counts = ratings.groupby("movieId").size()
pool = counts[counts >= MIN_RATINGS].index.to_numpy()
log(f"  film del campione possibile (>= {MIN_RATINGS} voti): {len(pool):,}")

rng = np.random.default_rng(SEED)
sample = rng.choice(pool, size=min(SAMPLE_ITEMS, len(pool)), replace=False)
known_mids = np.array([int(movieid_by_tmdb[t]) for t in KNOWN if t in movieid_by_tmdb], dtype="int64")
sample = np.unique(np.concatenate([sample, known_mids]))
idx = {int(m): i for i, m in enumerate(sample)}
log(f"  campione: {len(sample):,} film (inclusi {len(known_mids)} noti da guardare)")

# ------------------------------------------------------------------ teacher (item-item)
r = ratings[ratings["movieId"].isin(idx)].copy()
r["i"] = r["movieId"].map(idx).astype("int32")
X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                      shape=(int(r["userId"].max()) + 1, len(sample)))
X.sum_duplicates()
X.data[:] = 1.0
n_i = np.asarray(X.sum(axis=0)).ravel()
C = (X.T @ X).tocoo()
den = np.sqrt(n_i[C.row] * n_i[C.col])
vals = np.zeros(len(C.row), dtype=np.float32)
np.divide(C.data, den, out=vals, where=den > 0)
T = sparse.csr_matrix((vals, (C.row, C.col)), shape=(len(sample), len(sample)))
log(f"  matrice teacher: {len(sample)}x{len(sample)} · coppie non nulle {C.nnz:,}")

# ------------------------------------------------------------------ similarita' keyword (IDF)
log("costruisco la similarita' keyword (multi-hot pesata IDF su tutto il catalogo)...")
df_counter = Counter()
for ks in movies["kw_ids"]:
    df_counter.update(set(ks))
N_DOCS = len(movies)


def idf(k):
    return float(np.log(1.0 + N_DOCS / (1.0 + df_counter.get(k, 1))))


kw_of_tmdb = dict(zip(movies["id"], movies["kw_ids"]))
kw_vocab, rows_k, cols_k, vals_k = {}, [], [], []
for mid in sample:
    tmdb = tmdb_by_movieid.get(int(mid))
    for k in set(kw_of_tmdb.get(tmdb, [])):
        if k not in kw_vocab:
            kw_vocab[k] = len(kw_vocab)
        rows_k.append(idx[int(mid)])
        cols_k.append(kw_vocab[k])
        vals_k.append(idf(k))
K = sparse.csr_matrix((vals_k, (rows_k, cols_k)), shape=(len(sample), max(1, len(kw_vocab))))
norm = np.sqrt(np.asarray(K.multiply(K).sum(axis=1)).ravel())
norm[norm == 0] = 1.0
K = sparse.diags(1.0 / norm) @ K
S_kw = np.asarray((K @ K.T).todense())
log(f"  matrice keyword: {len(sample)}x{len(kw_vocab)} · densita' {100*(S_kw > 0).mean():.1f}%")


def title_of(j):
    tmdb = tmdb_by_movieid.get(int(sample[j]))
    return title_of_tmdb.get(tmdb, f"(tmdb {tmdb})")


# ------------------------------------------------------------------ A) vicini a confronto
log("\n================ A) I VICINI: teacher vs keyword ================\n")
for tmdb, name in KNOWN.items():
    mid = movieid_by_tmdb.get(tmdb)
    if mid is None or int(mid) not in idx:
        log(f"### {name}: non nel campione")
        continue
    i = idx[int(mid)]
    t_row = np.asarray(T.getrow(i).todense()).ravel()
    t_top = [j for j in np.argsort(-t_row)[:6] if t_row[j] > 0]
    k_row = S_kw[i].copy()
    k_row[i] = -1
    k_top = [j for j in np.argsort(-k_row)[:6] if k_row[j] > 0]
    log(f"### {name}")
    log("  teacher : " + " · ".join(f"{title_of(j)} ({t_row[j]:.2f})" for j in t_top))
    log("  keyword : " + " · ".join(f"{title_of(j)} ({k_row[j]:.2f})" for j in k_top))

# ------------------------------------------------------------------ A) correlazione
log("\n================ A) QUANTO SONO DIVERSI I DUE SPAZI ================\n")
ii = rng.integers(0, len(sample), SAMPLE_PAIRS)
jj = rng.integers(0, len(sample), SAMPLE_PAIRS)
keep = ii != jj
ii, jj = ii[keep], jj[keep]
s_t = np.asarray(T[ii, jj]).ravel()
s_k = S_kw[ii, jj]
log(f"coppie: {len(ii):,}")
log(f"Spearman(teacher, keyword) = {spearmanr(s_t, s_k).statistic:.3f}")
log(f"teacher: media {s_t.mean():.4f}, non nulla nel {100*(s_t > 0).mean():.1f}% delle coppie")
log(f"keyword: media {s_k.mean():.4f}, non nulla nel {100*(s_k > 0).mean():.1f}% delle coppie")


def top10(i, M, sparse_mat):
    row = np.asarray(M.getrow(i).todense()).ravel() if sparse_mat else M[i].copy()
    row[i] = -1
    return set(np.argsort(-row)[:10].tolist())


ov = [len(top10(i, T, True) & top10(i, S_kw, False)) for i in range(len(sample)) if n_i[i] >= MIN_RATINGS]
log(f"sovrapposizione top-10 (teacher vs keyword): media {np.mean(ov):.1f}/10 su {len(ov)} film")

# ------------------------------------------------------------------ B) student
log("\n================ B) LO STUDENT: i metadati predicono il teacher? ================\n")
meta_by_tmdb = {t: (float(y) if pd.notna(y) else np.nan, float(v or 0), float(r or 0), l, g)
                for t, y, v, r, l, g in zip(movies["id"], movies["year"], movies["vote_count"],
                                            movies["runtime"], movies["original_language"], movies["genres_set"])}


def feature_vector(i, j):
    ti, tj = tmdb_by_movieid.get(int(sample[i])), tmdb_by_movieid.get(int(sample[j]))
    if ti is None or tj is None:
        return None
    ki, kj = set(kw_of_tmdb.get(ti, [])), set(kw_of_tmdb.get(tj, []))
    inter = ki & kj
    idf_inter = sum(idf(k) for k in inter)
    idf_union = sum(idf(k) for k in (ki | kj)) or 1.0
    mi, mj = meta_by_tmdb.get(ti), meta_by_tmdb.get(tj)
    if mi is None or mj is None:
        return None
    genre_j = len(mi[4] & mj[4]) / (len(mi[4] | mj[4]) or 1)
    return [idf_inter,
            idf_inter / idf_union,
            float(len(inter)),
            float(genre_j),
            abs((mi[0] if pd.notna(mi[0]) else 0) - (mj[0] if pd.notna(mj[0]) else 0)),
            abs(np.log1p(mi[1]) - np.log1p(mj[1])),
            abs(mi[2] - mj[2]),
            1.0 if mi[3] == mj[3] else 0.0]


pos_pairs, neg_pairs = [], []
for i in range(len(sample)):
    if n_i[i] < MIN_RATINGS:
        continue
    row = T.getrow(i)
    order = np.argsort(-row.data)
    neigh = [int(row.indices[o]) for o in order if row.data[o] > 0.05][:N_POS]
    for j in neigh:
        if j != i:
            pos_pairs.append((i, j))
    for j in rng.integers(0, len(sample), N_NEG):
        j = int(j)
        if j != i and T[i, j] == 0:
            neg_pairs.append((i, j))
log(f"coppie: {len(pos_pairs):,} positive (top-{N_POS} del teacher, sim > 0,05) · {len(neg_pairs):,} negative")

items_with_pairs = sorted({i for i, _ in pos_pairs + neg_pairs})
train_items = set(int(x) for x in rng.choice(items_with_pairs, size=int(len(items_with_pairs) * 0.7), replace=False))


def build(pairs, keep_in, label):
    X_, y_ = [], []
    for i, j in pairs:
        if (i in keep_in) != (j in keep_in):
            continue
        f = feature_vector(i, j)
        if f is None:
            continue
        X_.append(f)
        y_.append(label)
    return X_, y_


test_items = {i for i in items_with_pairs if i not in train_items}
Xtr = np.array(build(pos_pairs, train_items, 1)[0] + build(neg_pairs, train_items, 0)[0])
ytr = np.array(build(pos_pairs, train_items, 1)[1] + build(neg_pairs, train_items, 0)[1])
Xte = np.array(build(pos_pairs, test_items, 1)[0] + build(neg_pairs, test_items, 0)[0])
yte = np.array(build(pos_pairs, test_items, 1)[1] + build(neg_pairs, test_items, 0)[1])
log(f"train {len(ytr):,} coppie (positivi {100*ytr.mean():.1f}%) · test {len(yte):,} coppie (positivi {100*yte.mean():.1f}%)")
log(f"controllo: la coppia positiva media ha similarita' keyword {Xtr[ytr == 1, 1].mean():.3f}, la negativa {Xtr[ytr == 0, 1].mean():.3f}")

scaler = StandardScaler().fit(Xtr)
for name, cols in [("solo keyword (baseline)", [0, 1, 2]),
                   ("keyword + generi", [0, 1, 2, 3]),
                   ("TUTTO (8 metadati)", list(range(8)))]:
    model = LogisticRegression(max_iter=2000, class_weight="balanced")
    model.fit(scaler.transform(Xtr[:, cols]), ytr)
    auc = roc_auc_score(yte, model.predict_proba(scaler.transform(Xte[:, cols]))[:, 1])
    log(f"  AUC {name:<22} = {auc:.3f}")

log("\nlettura: AUC della baseline vicina a 1 = il teacher insegna cio' che le keyword gia' dicono;")
log("baseline bassa e «TUTTO» molto piu' alta = i metadati contengono segnale collaborativo nuovo.")
