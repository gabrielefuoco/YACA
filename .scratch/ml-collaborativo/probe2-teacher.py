"""
.scratch/ml-collaborativo/probe2-teacher.py

ITERAZIONE 2, dopo la prima sonda. Tre cose in più:

 1. CACHE: il campione (id + matrice utenti×item) si salva, così le iterazioni sono veloci.

 2. DUE TEACHER A CONFRONTO — la sonda 1 ha mostrato che il cosine sui co-voti mette
    «Matrix» fra i vicini del Padrino: è popolarità, non gusto. Confronto:
      - cos    : cosine sui co-voti (quello della sonda 1)
      - npmi   : co-occorrenza corretta per popolarità (Normalized PMI), che declassa
                 le coppie di film universalmente visti e premia le coppie specifiche.
    Se npmi riporta vicini tematici e resta indipendente dalle keyword, allora il teacher
    porta gusto; se resta un elenco di film famosi, porta popolarità e va corretto.

 3. STUDENT CON CONTROLLI:
    - negativi = similarità BASSA (non == 0: l'84,8% delle coppie è non nulla);
    - baseline keyword, baseline POPOLARITÀ (solo voti/anno: quanto spiega la fama),
      e modello completo. Il valore aggiunto è «TUTTO − migliore baseline».

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/probe2-teacher.py
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
CACHE = ROOT / ".cache" / "movielens" / "probe-cache.npz"
META = ROOT / ".cache" / "movielens" / "probe-cache.json"

MIN_RATINGS = 20
SAMPLE_ITEMS = 3000
SAMPLE_PAIRS = 200_000
N_POS, N_NEG = 10, 20
SEED = 20261008
KNOWN = {78: "Blade Runner", 335984: "Blade Runner 2049", 152601: "Her", 829: "Chinatown",
         27205: "Inception", 496243: "Parasite", 348: "Alien", 106: "Predator",
         129: "La citta' incantata", 238: "Il padrino", 194: "Amelie", 157336: "Interstellar",
         680: "Pulp Fiction", 550: "Fight Club", 603: "Matrix", 13: "Forrest Gump"}


def log(m):
    print(m, flush=True)


# ------------------------------------------------------------------ dati (con cache)
if CACHE.exists() and META.exists():
    log("uso la cache del campione...")
    meta = json.loads(META.read_text())
    sample = np.array(meta["sample"], dtype="int64")
    X = sparse.load_npz(CACHE)
    n_users = X.shape[0]
else:
    log("costruisco il campione (una volta sola)...")
    links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
    links["tmdbId"] = links["tmdbId"].astype("int64")
    links["movieId"] = links["movieId"].astype("int64")
    movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
    tmdb_by_movieid = {v: k for k, v in movieid_by_tmdb.items()}

    ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
    ratings = ratings[ratings["movieId"].isin(tmdb_by_movieid.keys())]
    counts = ratings.groupby("movieId").size()
    pool = counts[counts >= MIN_RATINGS].index.to_numpy()
    rng0 = np.random.default_rng(SEED)
    sample = rng0.choice(pool, size=min(SAMPLE_ITEMS, len(pool)), replace=False)
    known_mids = np.array([int(movieid_by_tmdb[t]) for t in KNOWN if t in movieid_by_tmdb], dtype="int64")
    sample = np.unique(np.concatenate([sample, known_mids]))
    idx0 = {int(m): i for i, m in enumerate(sample)}
    r = ratings[ratings["movieId"].isin(idx0)].copy()
    r["i"] = r["movieId"].map(idx0).astype("int32")
    X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                          shape=(int(r["userId"].max()) + 1, len(sample)))
    X.sum_duplicates()
    X.data[:] = 1.0
    sparse.save_npz(CACHE, X)
    META.write_text(json.dumps({"sample": [int(s) for s in sample]}))
    log(f"  campione salvato: {len(sample)} film, matrice {X.shape}")

rng = np.random.default_rng(SEED)
links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
links["tmdbId"] = links["tmdbId"].astype("int64")
links["movieId"] = links["movieId"].astype("int64")
movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
tmdb_by_movieid = {v: k for k, v in movieid_by_tmdb.items()}
movies = pd.read_parquet(PQ, columns=["id", "title", "keywords", "genres", "release_date",
                                      "vote_count", "runtime", "original_language"])
movies = movies.dropna(subset=["keywords"]).copy()
movies["id"] = movies["id"].astype("int64")
movies["kw_ids"] = movies["keywords"].map(lambda s: [int(k["id"]) for k in json.loads(s) if isinstance(k, dict) and k.get("id")])
movies["genres_set"] = movies["genres"].map(lambda s: {int(g["id"]) for g in json.loads(s)} if s else set())
movies["year"] = pd.to_numeric(movies["release_date"].astype(str).str[:4], errors="coerce")
movies = movies[movies["kw_ids"].map(len) > 0]
title_of_tmdb = dict(zip(movies["id"], movies["title"]))
kw_of_tmdb = dict(zip(movies["id"], movies["kw_ids"]))
meta_tmdb = {t: (float(y) if pd.notna(y) else np.nan, float(v or 0), float(rr or 0), l, g)
             for t, y, v, rr, l, g in zip(movies["id"], movies["year"], movies["vote_count"],
                                          movies["runtime"], movies["original_language"], movies["genres_set"])}
idx = {int(m): i for i, m in enumerate(sample)}
n_i = np.asarray(X.sum(axis=0)).ravel()
N_USERS = X.shape[0]

# ------------------------------------------------------------------ i due teacher
log("\ncalcolo i due teacher sul campione...")
C = (X.T @ X).tocoo()                    # co-voti
co = C.data.astype(np.float64)

# cos: cosine sui co-voti
with np.errstate(divide="ignore", invalid="ignore"):
    cos_vals = co / np.sqrt(n_i[C.row] * n_i[C.col])

# npmi: co-occorrenza corretta per popolarità
p_ij = co / N_USERS
p_i = n_i[C.row] / N_USERS
p_j = n_i[C.col] / N_USERS
with np.errstate(divide="ignore", invalid="ignore"):
    pmi = np.log(p_ij / (p_i * p_j))
    npmi = pmi / (-np.log(p_ij))
npmi = np.nan_to_num(npmi, nan=0.0, posinf=0.0, neginf=0.0)
T_cos = sparse.csr_matrix((cos_vals, (C.row, C.col)), shape=(len(sample), len(sample)))
T_npmi = sparse.csr_matrix((np.maximum(npmi, 0.0), (C.row, C.col)), shape=(len(sample), len(sample)))

# ------------------------------------------------------------------ keyword (IDF)
df_counter = Counter()
for ks in movies["kw_ids"]:
    df_counter.update(set(ks))
N_DOCS = len(movies)
idf = lambda k: float(np.log(1.0 + N_DOCS / (1.0 + df_counter.get(k, 1))))
kw_vocab, rk, ck, vk = {}, [], [], []
for mid in sample:
    tmdb = tmdb_by_movieid.get(int(mid))
    for k in set(kw_of_tmdb.get(tmdb, [])):
        if k not in kw_vocab:
            kw_vocab[k] = len(kw_vocab)
        rk.append(idx[int(mid)]); ck.append(kw_vocab[k]); vk.append(idf(k))
K = sparse.csr_matrix((vk, (rk, ck)), shape=(len(sample), max(1, len(kw_vocab))))
norm = np.sqrt(np.asarray(K.multiply(K).sum(axis=1)).ravel()); norm[norm == 0] = 1.0
K = sparse.diags(1.0 / norm) @ K
S_kw = np.asarray((K @ K.T).todense())


def title_of(j):
    return title_of_tmdb.get(tmdb_by_movieid.get(int(sample[j])), f"(tmdb {tmdb_by_movieid.get(int(sample[j]))})")


def top(M, i, n=6, sparse_mat=True, floor=0.0):
    row = np.asarray(M.getrow(i).todense()).ravel() if sparse_mat else M[i].copy()
    row[i] = -1
    return [(j, row[j]) for j in np.argsort(-row)[:n] if row[j] > floor]


log("\n================ A) I VICINI: cos vs npmi vs keyword ================\n")
for tmdb, name in KNOWN.items():
    mid = movieid_by_tmdb.get(tmdb)
    if mid is None or int(mid) not in idx:
        continue
    i = idx[int(mid)]
    log(f"### {name}")
    log("  cos    : " + " · ".join(f"{title_of(j)} ({v:.2f})" for j, v in top(T_cos, i)))
    log("  npmi   : " + " · ".join(f"{title_of(j)} ({v:.2f})" for j, v in top(T_npmi, i)))
    log("  keyword: " + " · ".join(f"{title_of(j)} ({v:.2f})" for j, v in top(S_kw, i, sparse_mat=False)))

log("\n================ A) INDIPENDENZA DAI DUE SPAZI ================\n")
ii = rng.integers(0, len(sample), SAMPLE_PAIRS); jj = rng.integers(0, len(sample), SAMPLE_PAIRS)
keep = ii != jj; ii, jj = ii[keep], jj[keep]
s_cos = np.asarray(T_cos[ii, jj]).ravel(); s_npmi = np.asarray(T_npmi[ii, jj]).ravel(); s_kw = S_kw[ii, jj]
log(f"coppie: {len(ii):,}")
log(f"Spearman(cos , keyword) = {spearmanr(s_cos, s_kw).statistic:+.3f}")
log(f"Spearman(npmi, keyword) = {spearmanr(s_npmi, s_kw).statistic:+.3f}")
log(f"Spearman(cos , npmi)    = {spearmanr(s_cos, s_npmi).statistic:+.3f}")


def top10(M, i, sparse_mat=True):
    row = np.asarray(M.getrow(i).todense()).ravel() if sparse_mat else M[i].copy()
    row[i] = -1
    return set(np.argsort(-row)[:10].tolist())


for label, M, sp in [("cos ", T_cos, True), ("npmi", T_npmi, True)]:
    ov = [len(top10(M, i, sp) & top10(S_kw, i, False)) for i in range(len(sample)) if n_i[i] >= MIN_RATINGS]
    log(f"sovrapposizione top-10 {label} vs keyword: media {np.mean(ov):.1f}/10")

# ------------------------------------------------------------------ B) student
log("\n================ B) STUDENT: metadati → teacher ================\n")
for label, T, thresh in [("cos", T_cos, 0.30), ("npmi", T_npmi, 0.15)]:
    pos_pairs = []
    for i in range(len(sample)):
        if n_i[i] < MIN_RATINGS:
            continue
        row = T.getrow(i)
        order = np.argsort(-row.data)
        pos_pairs += [(i, int(row.indices[o])) for o in order[:N_POS] if row.data[o] >= thresh]
    low = np.quantile(np.asarray(T[ii, jj]).ravel(), 0.05)
    neg_pairs = [(int(i), int(j)) for i, j in zip(ii, jj) if T[i, j] <= low][:N_NEG * len(pos_pairs) // N_POS]
    log(f"### teacher {label}: {len(pos_pairs):,} positivi (>= {thresh}) · {len(neg_pairs):,} negativi (<= {low:.3f})")

    def fv(i, j):
        ti, tj = tmdb_by_movieid.get(int(sample[i])), tmdb_by_movieid.get(int(sample[j]))
        if ti is None or tj is None:
            return None
        ki, kj = set(kw_of_tmdb.get(ti, [])), set(kw_of_tmdb.get(tj, []))
        inter = ki & kj
        iv = sum(idf(k) for k in inter)
        iu = sum(idf(k) for k in (ki | kj)) or 1.0
        mi, mj = meta_tmdb.get(ti), meta_tmdb.get(tj)
        if mi is None or mj is None:
            return None
        gj = len(mi[4] & mj[4]) / (len(mi[4] | mj[4]) or 1)
        return [iv, iv / iu, float(len(inter)), float(gj),
                abs((mi[0] if pd.notna(mi[0]) else 0) - (mj[0] if pd.notna(mj[0]) else 0)),
                abs(np.log1p(mi[1]) - np.log1p(mj[1])), abs(mi[2] - mj[2]),
                1.0 if mi[3] == mj[3] else 0.0,
                np.log1p(mi[1]), np.log1p(mj[1])]      # 8-9: popolarità dei due item (controllo)

    items_with = sorted({i for i, _ in pos_pairs + neg_pairs})
    train_items = set(int(x) for x in rng.choice(items_with, size=int(len(items_with) * 0.7), replace=False))
    test_items = set(items_with) - train_items

    def build(pairs, keep_in, label_y):
        Xa, ya = [], []
        for i, j in pairs:
            if (i in keep_in) != (j in keep_in):
                continue
            f = fv(i, j)
            if f is None:
                continue
            Xa.append(f); ya.append(label_y)
        return Xa, ya

    Xp, yp = build(pos_pairs, train_items, 1); Xn, yn = build(neg_pairs, train_items, 0)
    Xte_p, yte_p = build(pos_pairs, test_items, 1); Xte_n, yte_n = build(neg_pairs, test_items, 0)
    Xtr = np.array(Xp + Xn); ytr = np.array(yp + yn)
    Xte = np.array(Xte_p + Xte_n); yte = np.array(yte_p + yte_n)
    log(f"    train {len(ytr):,} · test {len(yte):,} · positivi {100*yte.mean():.1f}%")
    for name, cols in [("solo keyword", [0, 1, 2]), ("solo POPOLARITÀ (controllo)", [5, 8, 9]),
                       ("keyword + popolarità", [0, 1, 2, 5, 8, 9]), ("TUTTO (10 feature)", list(range(10)))]:
        sc = StandardScaler().fit(Xtr[:, cols])
        model = LogisticRegression(max_iter=3000, class_weight="balanced").fit(sc.transform(Xtr[:, cols]), ytr)
        auc = roc_auc_score(yte, model.predict_proba(sc.transform(Xte[:, cols]))[:, 1])
        log(f"    AUC {name:<26} = {auc:.3f}")
