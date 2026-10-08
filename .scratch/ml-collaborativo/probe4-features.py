"""
.scratch/ml-collaborativo/probe4-features.py

DUE TEST A BASSO COSTO, decisi con l'utente prima di toccare il modello:

 A) DOVE SBAGLIA IL RIDGE (e serve un modello non lineare?)
    - coseno IN-SAMPLE (addestrando anche sui film di prova)
      · se ≈ held-out  -> il modello NON sotto-adatta: la leva sono le FEATURE
      · se >> held-out -> sotto-adattamento: allora una testa non lineare ha senso
    - errore per fascia: numero di keyword, tipo (film/serie), epoca, popolarità

 B) QUANTO VALGONO LE FEATURE CHE ABBIAMO E NON USIAMO
    lingua · paesi di produzione · franchise (collection_id) · cast · registi ·
    creatori (serie) · budget/incassi · network · content_rating
    (le persone erano state tolte dal DNA per scelta di prodotto: qui sono
     feature del TITOLO, legittime, e non entrano nel profilo utente)

Misura: coseno(predetto, vero) su film TENUTI FUORI.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/probe4-features.py
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
SEED = 20261008
MIN_RATINGS = 20
EMB_DIM = 64

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)

log("=== dati ===")
links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
links["tmdbId"] = links["tmdbId"].astype("int64"); links["movieId"] = links["movieId"].astype("int64")
movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))

cols_m = ["id", "title", "keywords", "genres", "release_date", "vote_count", "vote_average", "runtime",
          "original_language", "production_countries", "cast", "directors", "writers",
          "collection_id", "collection_name", "budget", "revenue", "content_rating", "popularity"]
cols_t = ["id", "name", "keywords", "genres", "first_air_date", "vote_count", "vote_average", "runtime",
          "original_language", "production_countries", "cast", "created_by", "networks",
          "content_rating", "number_of_seasons", "popularity"]
mv = pd.read_parquet(PQ / "movies.parquet", columns=cols_m)
tv = pd.read_parquet(PQ / "tv.parquet", columns=cols_t)
mv["type"] = "movie"; tv["type"] = "tv"
mv["date"] = mv["release_date"]; tv["date"] = tv["first_air_date"]
tv["title"] = tv["name"]; tv["directors"] = tv["created_by"]; tv["collection_id"] = np.nan
tv["budget"] = np.nan; tv["revenue"] = np.nan; tv["collection_name"] = None
mv["number_of_seasons"] = np.nan
cat = pd.concat([mv[["id", "title", "type", "date", "keywords", "genres", "vote_count", "vote_average", "runtime",
                     "original_language", "production_countries", "cast", "directors", "collection_id",
                     "budget", "revenue", "content_rating", "number_of_seasons"]],
                 tv[["id", "title", "type", "date", "keywords", "genres", "vote_count", "vote_average", "runtime",
                     "original_language", "production_countries", "cast", "directors", "collection_id",
                     "budget", "revenue", "content_rating", "number_of_seasons"]]], ignore_index=True)
cat = cat.dropna(subset=["keywords"]).reset_index(drop=True)
# come nel build: fuori i titoli con keyword VUOTE ("[]"), che nessuna feature puo rappresentare
cat = cat[cat["keywords"].map(lambda s: len(json.loads(s)) > 0)].reset_index(drop=True)
cat["year"] = pd.to_numeric(cat["date"].astype(str).str[:4], errors="coerce")
C_VOTES = 250.0
m_global = float((cat["vote_average"] * cat["vote_count"]).sum() / max(1, cat["vote_count"].sum()))
cat["bayes"] = (cat["vote_count"] * cat["vote_average"] + C_VOTES * m_global) / (cat["vote_count"] + C_VOTES)
log(f"  catalogo: {len(cat):,} titoli ({int((cat['type']=='movie').sum()):,} film, {int((cat['type']=='tv').sum()):,} serie)")


def json_ids(s, key="id"):
    if not isinstance(s, str) or not s:
        return []
    try:
        v = json.loads(s)
    except Exception:
        return []
    out = []
    for x in v if isinstance(v, list) else []:
        if isinstance(x, dict) and x.get(key) is not None:
            out.append(x[key])
        elif isinstance(x, (int, float)) and not isinstance(x, bool):
            out.append(int(x))
    return out


log("  parsing keyword/paesi/cast/registi...")
cat["kw_names"] = cat["keywords"].map(lambda s: [str(k.get("name", "")).strip().lower() for k in json.loads(s) if isinstance(k, dict)])
cat["countries"] = cat["production_countries"].map(lambda x: json_ids(x, "iso_3166_1"))
cat["people"] = cat.apply(lambda r: json_ids(r["cast"], "id")[:8] + json_ids(r["directors"], "id"), axis=1)
cat["collections"] = cat["collection_id"].map(lambda x: [] if pd.isna(x) else [int(x)])
log(f"  lingua: {cat['original_language'].notna().mean()*100:.0f}% · paesi: {(cat['countries'].map(len)>0).mean()*100:.0f}% "
    f"· persone: {(cat['people'].map(len)>0).mean()*100:.0f}% · franchise: {(cat['collections'].map(len)>0).mean()*100:.0f}% "
    f"· budget>0: {(cat['budget'].fillna(0)>0).mean()*100:.0f}% · content_rating: {cat['content_rating'].notna().mean()*100:.0f}%")

# ---------------------------------------------------------------- teacher
log("\n=== teacher (SVD 64, corretta per popolarità) ===")
covered_mids = set(int(x) for x in cat.loc[cat["type"] == "movie", "id"] if int(x) in movieid_by_tmdb)
ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
ratings = ratings[ratings["movieId"].isin(covered_mids)]
mids = sorted(covered_mids); mid_pos = {m: i for i, m in enumerate(mids)}
r = ratings.copy(); r["i"] = r["movieId"].map(mid_pos).astype("int32")
X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                      shape=(int(r["userId"].max()) + 1, len(mids)))
X.sum_duplicates(); X.data[:] = 1.0
n_item = np.asarray(X.sum(axis=0)).ravel()
Xw = X.multiply((1.0 / np.log1p(np.maximum(n_item, 1)))[None, :]).tocsr()
U, S, Vt = svds(Xw, k=EMB_DIM)
Z = Vt.T
Z = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
row_of_teacher = {int(m): j for j, m in enumerate(mids)}
cov = np.array([(t == "movie" and int(i) in row_of_teacher) for t, i in zip(cat["type"], cat["id"])], dtype=bool)
log(f"  film con teacher: {int(cov.sum()):,} su {int((cat['type']=='movie').sum()):,}")

# ---------------------------------------------------------------- feature
log("\n=== costruzione delle feature ===")
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

BASE_EXTRA = 5
rows_b, cols_b, vals_b = [], [], []
for i in range(len(cat)):
    for n in cat["kw_names"].iloc[i]:
        ch = CHAIN.get(n)
        if not ch:
            continue
        if ch[0]: rows_b.append(i); cols_b.append(l1_ids[ch[0]]); vals_b.append(1.0)
        if ch[1]: rows_b.append(i); cols_b.append(len(l1_ids) + l2_ids[ch[1]]); vals_b.append(1.0)
        if ch[2]: rows_b.append(i); cols_b.append(len(l1_ids) + len(l2_ids) + l3_ids[ch[2]]); vals_b.append(1.0)

genres_vocab = {}
for i in range(len(cat)):
    for g in json.loads(cat["genres"].iloc[i] or "[]"):
        gid = int(g["id"])
        if gid not in genres_vocab:
            genres_vocab[gid] = N_TOPO + len(genres_vocab)
        rows_b.append(i); cols_b.append(genres_vocab[gid]); vals_b.append(1.0)
N_GENRES = len(genres_vocab)

base_extra = np.zeros((len(cat), BASE_EXTRA), dtype=np.float32)
for i in range(len(cat)):
    y = cat["year"].iloc[i]
    base_extra[i] = [0.0 if pd.isna(y) else (y - 1990) / 30.0, np.log1p(cat["vote_count"].iloc[i]),
                     cat["bayes"].iloc[i], 0.0 if pd.isna(cat["runtime"].iloc[i]) else cat["runtime"].iloc[i] / 120.0,
                     np.log1p(cat["popularity"].iloc[i]) if "popularity" in cat else 0.0]
FB = sparse.hstack([sparse.csr_matrix((vals_b, (rows_b, cols_b)), shape=(len(cat), N_TOPO + N_GENRES)),
                    sparse.csr_matrix(base_extra)]).tocsr()

# --- feature NUOVE
lang_vocab = {}
for l in cat["original_language"].dropna().value_counts().head(25).index:
    lang_vocab[l] = len(lang_vocab)
country_counts = Counter(c for lst in cat["countries"] for c in lst)
country_vocab = {c: i for i, (c, _) in enumerate(country_counts.most_common(40))}
people_counts = Counter(p for lst in cat["people"] for p in lst)
people_vocab = {p: i for i, (p, _) in enumerate(people_counts.most_common(3000))}
coll_counts = Counter(c for lst in cat["collections"] for c in lst)
coll_vocab = {c: i for i, (c, _) in enumerate(coll_counts.most_common(800))}
log(f"  vocabolari nuovi: lingua {len(lang_vocab)} · paesi {len(country_vocab)} · persone {len(people_vocab)} (top 3000 su {len(people_counts):,}) · franchise {len(coll_vocab)}")

rows_x, cols_x, vals_x = [], [], []
OFF = N_TOPO + N_GENRES + BASE_EXTRA
for i in range(len(cat)):
    lang = cat["original_language"].iloc[i]
    if lang in lang_vocab:
        rows_x.append(i); cols_x.append(lang_vocab[lang]); vals_x.append(1.0)
    for c in cat["countries"].iloc[i]:
        if c in country_vocab:
            rows_x.append(i); cols_x.append(len(lang_vocab) + country_vocab[c]); vals_x.append(1.0)
    for p in cat["people"].iloc[i]:
        if p in people_vocab:
            rows_x.append(i); cols_x.append(len(lang_vocab) + len(country_vocab) + people_vocab[p]); vals_x.append(1.0)
    for c in cat["collections"].iloc[i]:
        if c in coll_vocab:
            rows_x.append(i); cols_x.append(len(lang_vocab) + len(country_vocab) + len(people_vocab) + coll_vocab[c]); vals_x.append(1.0)
extra2 = np.zeros((len(cat), 4), dtype=np.float32)
for i in range(len(cat)):
    extra2[i] = [np.log1p(cat["budget"].iloc[i] or 0), np.log1p(cat["revenue"].iloc[i] or 0),
                 0.0 if pd.isna(cat["number_of_seasons"].iloc[i]) else cat["number_of_seasons"].iloc[i] / 5.0,
                 1.0 if str(cat["content_rating"].iloc[i] or "").upper() in ("R", "NC-17", "TV-MA") else 0.0]
FX = sparse.hstack([FB,
                    sparse.csr_matrix((vals_x, (rows_x, cols_x)),
                                      shape=(len(cat), len(lang_vocab) + len(country_vocab) + len(people_vocab) + len(coll_vocab))),
                    sparse.csr_matrix(extra2)]).tocsr()
log(f"  feature: base {FB.shape[1]} colonne · estese {FX.shape[1]} colonne (+{FX.shape[1]-FB.shape[1]:,})")

# ---------------------------------------------------------------- A) in-sample vs held-out
log("\n=== A) IL RIDGE SOTTO-ADATTA? ===")
Y = np.zeros((len(cat), EMB_DIM), dtype=np.float32)
for i in np.where(cov)[0]:
    Y[i] = Z[row_of_teacher[int(cat['id'].iloc[i])]]
idx = np.where(cov)[0]
perm = rng.permutation(idx)
n_test = int(0.2 * len(perm))
test_idx, train_idx = perm[:n_test], perm[n_test:]
cos = lambda A, B: np.asarray((A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9) *
                               B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9)).sum(axis=1)).ravel()

mean_vec = Y[test_idx].mean(axis=0)
log(f"  controllo — coseno del vettore MEDIO con i bersagli: {cos(np.tile(mean_vec,(len(test_idx),1)), Y[test_idx]).mean():.3f}")
for name, F in [("BASE (topoi+generi+5 numeriche)", FB), ("ESTESE (+lingua, paesi, persone, franchise, budget…)", FX)]:
    m = Ridge(alpha=1.0, solver="lsqr", max_iter=800).fit(F[train_idx], Y[train_idx])
    te = cos(m.predict(F[test_idx]), Y[test_idx])
    ins = cos(m.predict(F[train_idx]), Y[train_idx])
    log(f"  {name:<52} held-out {te.mean():.3f} · in-sample {ins.mean():.3f} · gap {ins.mean()-te.mean():+.3f}")

# --- B) dove sbaglia (modello base)
log("\n=== A2) DOVE SBAGLIA IL MODELLO BASE (held-out) ===")
mbase = Ridge(alpha=1.0, solver="lsqr", max_iter=800).fit(FB[train_idx], Y[train_idx])
pred = mbase.predict(FB[test_idx])
c = cos(pred, Y[test_idx])
sub = cat.iloc[test_idx].copy(); sub["cos"] = c
sub["n_kw"] = sub["kw_names"].map(len)
buckets = [("0-3 keyword", sub["n_kw"] <= 3), ("4-8", sub["n_kw"].between(4, 8)), ("9-15", sub["n_kw"].between(9, 15)), ("16+", sub["n_kw"] >= 16)]
log("  per numero di keyword: " + " · ".join(f"{n}: {sub.loc[msk, 'cos'].mean():.3f} ({msk.sum()})" for n, msk in buckets))
log("  per tipo: " + " · ".join(f"{t}: {sub.loc[sub['type']==t, 'cos'].mean():.3f}" for t in ["movie", "tv"]))
era = [("pre-1980", sub["year"] < 1980), ("1980-1999", sub["year"].between(1980, 1999)), ("2000-2014", sub["year"].between(2000, 2014)), ("2015+", sub["year"] >= 2015)]
log("  per epoca: " + " · ".join(f"{n}: {sub.loc[msk, 'cos'].mean():.3f}" for n, msk in era))
q = sub["vote_count"].quantile([0.25, 0.5, 0.75]).tolist()
pop = [("poveri di voti", sub["vote_count"] <= q[0]), ("medi", sub["vote_count"].between(q[0], q[2])), ("molto votati", sub["vote_count"] > q[2])]
log("  per popolarità: " + " · ".join(f"{n}: {sub.loc[msk, 'cos'].mean():.3f}" for n, msk in pop))
