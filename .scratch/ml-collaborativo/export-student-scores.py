"""
.scratch/ml-collaborativo/export-student-scores.py

Genera i TRIAL del test di trasferimento e calcola SOLO i punteggi dei modelli
appresi (student, controllo popolarità, teacher oracolo). Il baseline keyword NON
si calcola qui: lo calcola Node con lo scorer di produzione (gerarchia L1-L5
inclusa), che è il pezzo che il proxy Python sbagliava.

Output: .cache/movielens/transfer-trials.json
  [{ setting, ctx, draw, seeds: [[type,id],...], candidates: [[type,id],...],
     student: [...], pop: [...], teacher: [...] }, ...]

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/export-student-scores.py
"""
import json
import pathlib
import sys
from collections import Counter

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / ".cache" / "movielens" / "ml-32m"
PQ = ROOT / ".cache" / "tmdb"
CACHE = ROOT / ".cache" / "movielens" / "probe-cache.npz"
HIST = ROOT / ".cache" / "movielens" / "histories.json"
OUT = ROOT / ".cache" / "movielens" / "transfer-trials.json"

MIN_RATINGS = 20
FILM_POOL, TV_POOL = 2000, 1200
K_SEEDS = 3
DRAWS = 5
SEED = 20261008
POP_COLS = [5, 8, 9, 10, 11]

def log(m):
    print(m, flush=True)

rng = np.random.default_rng(SEED)

log("carico i cataloghi...")
movies = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "keywords", "genres", "release_date", "vote_count", "vote_average", "runtime", "original_language", "popularity"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "keywords", "genres", "first_air_date", "vote_count", "vote_average", "original_language", "popularity"])
movies["type"] = "movie"; tv["type"] = "tv"
tv["title"] = tv["name"]; tv["release_date"] = tv["first_air_date"]; tv["runtime"] = np.nan
catalog = pd.concat([movies.drop(columns=["name", "first_air_date"], errors="ignore"),
                     tv.drop(columns=["name", "first_air_date"], errors="ignore")], ignore_index=True)
catalog = catalog.dropna(subset=["keywords"])
catalog["kw"] = catalog["keywords"].map(lambda s: frozenset(int(k["id"]) for k in json.loads(s) if isinstance(k, dict) and k.get("id")))
catalog["genres_set"] = catalog["genres"].map(lambda s: frozenset(int(g["id"]) for g in json.loads(s)) if s else frozenset())
catalog["year"] = pd.to_numeric(catalog["release_date"].astype(str).str[:4], errors="coerce")
catalog = catalog[catalog["kw"].map(len) > 0]

df_counter = Counter()
for kws in catalog["kw"]:
    df_counter.update(kws)
N_DOCS = len(catalog)
idf = lambda k: float(np.log(1.0 + N_DOCS / (1.0 + df_counter.get(k, 1))))

# ---------------------------------------------------------------- il SOTTOGRAFO
# Le feature dello student devono includere il grafo delle keyword, non le keyword
# grezze: si risale la catena keyword(nome) -> L1 -> L2 -> L3 e si costruiscono i
# set di topoi di ogni titolo. E' lo strato che fa generalizzare (e il ponte
# film<->serie). Senza, si chiede di estendere il grafo senza dargli il grafo.
GRAPH_PATH = ROOT / "src" / "data" / "hierarchical_graph.json"
G = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
CHAIN = {}
for name, c in G["kw_to_L1"].items():
    t = (G["L1"].get(c) or {}).get("parent")
    v = (G["L2"].get(t) or {}).get("parent") if t else None
    CHAIN[name] = (c, t, v)
log(f"  catene keyword->L1->L2->L3: {len(CHAIN)}")

def topos_sets(keyword_objs):
    l1, l2, l3 = set(), set(), set()
    for k in keyword_objs:
        name = str(k.get("name", "")).strip().lower() if isinstance(k, dict) else str(k).strip().lower()
        ch = CHAIN.get(name)
        if not ch:
            continue
        if ch[0]: l1.add(ch[0])
        if ch[1]: l2.add(ch[1])
        if ch[2]: l3.add(ch[2])
    return l1, l2, l3

meta = {}
for row in catalog.itertuples():
    l1, l2, l3 = topos_sets(json.loads(row.keywords))
    meta[(row.type, int(row.id))] = dict(kw=row.kw, genres=row.genres_set,
                                         year=float(row.year) if pd.notna(row.year) else np.nan,
                                         votes=float(row.vote_count or 0),
                                         runtime=float(row.runtime) if pd.notna(row.runtime) else np.nan,
                                         lang=row.original_language, pop=float(row.popularity or 0),
                                         l1=l1, l2=l2, l3=l3)
withtopos = sum(1 for m in meta.values() if m["l1"])
log(f"  titoli con topoi risolti: {withtopos}/{len(meta)}")


def fv(a, b):
    ma, mb = meta[a], meta[b]
    inter = ma["kw"] & mb["kw"]
    iv = sum(idf(k) for k in inter)
    iu = sum(idf(k) for k in (ma["kw"] | mb["kw"])) or 1.0
    gj = len(ma["genres"] & mb["genres"]) / (len(ma["genres"] | mb["genres"]) or 1)
    ya = ma["year"] if pd.notna(ma["year"]) else 0.0
    yb = mb["year"] if pd.notna(mb["year"]) else 0.0
    ra = ma["runtime"] if pd.notna(ma["runtime"]) else 0.0
    rb = mb["runtime"] if pd.notna(mb["runtime"]) else 0.0
    lj = lambda s: len(ma[s] & mb[s]) / (len(ma[s] | mb[s]) or 1)
    return [iv, iv / iu, float(len(inter)), float(gj), abs(ya - yb),
            abs(np.log1p(ma["votes"]) - np.log1p(mb["votes"])), abs(ra - rb),
            1.0 if ma["lang"] == mb["lang"] else 0.0,
            np.log1p(ma["votes"]), np.log1p(mb["votes"]), np.log1p(ma["pop"]), np.log1p(mb["pop"]),
            float(lj("l1")), float(lj("l2")), float(lj("l3"))]


# ------------------------------------------------------------------ student (target npmi, film)
log("addestro lo student (target npmi sui film MovieLens)...")
Xs = sparse.load_npz(CACHE)
sample = np.array(json.loads((ROOT / ".cache" / "movielens" / "probe-cache.json").read_text())["sample"], dtype="int64")
links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
links["tmdbId"] = links["tmdbId"].astype("int64"); links["movieId"] = links["movieId"].astype("int64")
movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
tmdb_by_movieid = {v: k for k, v in movieid_by_tmdb.items()}
pos_of = {}
for pos, mid in enumerate(sample):
    t = tmdb_by_movieid.get(int(mid))
    if t is not None and ("movie", t) in meta:
        pos_of[pos] = ("movie", t)

n_s = np.asarray(Xs.sum(axis=0)).ravel()
Cs = (Xs.T @ Xs).tocoo()
N_Us = Xs.shape[0]
q_ij = Cs.data / N_Us; q_i = n_s[Cs.row] / N_Us; q_j = n_s[Cs.col] / N_Us
with np.errstate(divide="ignore", invalid="ignore"):
    npmis = np.log(q_ij / (q_i * q_j)) / (-np.log(q_ij))
npmis = np.nan_to_num(npmis, nan=0.0, posinf=0.0, neginf=0.0)
Ts = sparse.csr_matrix((np.maximum(npmis, 0.0), (Cs.row, Cs.col)), shape=(len(sample), len(sample)))

# split per ITEM (onesto): il modello si valuta su item mai visti in addestramento
items = sorted(pos_of.keys())
train_items = set(int(x) for x in rng.choice(items, size=int(len(items) * 0.7), replace=False))
pos_pairs, neg_pairs = [], []
low = np.quantile(np.asarray(Ts[Cs.row, Cs.col]).ravel(), 0.05)
for i in items:
    row = Ts.getrow(i)
    order = np.argsort(-row.data)[:10]
    for o in order:
        j = int(row.indices[o])
        if j != i and j in pos_of and row.data[o] >= 0.15:
            pos_pairs.append((pos_of[i], pos_of[j], i, j))
for _ in range(len(pos_pairs)):
    a, b = int(rng.integers(0, len(sample))), int(rng.integers(0, len(sample)))
    if a in pos_of and b in pos_of and a != b and Ts[a, b] <= low:
        neg_pairs.append((pos_of[a], pos_of[b], a, b))

def slice_pairs(pairs, keep):
    return [(x, y) for x, y, i, j in pairs if (i in keep) and (j in keep)]

Xtr = np.array([fv(a, b) for a, b in slice_pairs(pos_pairs, train_items) + slice_pairs(neg_pairs, train_items)])
ytr = np.array([1] * len(slice_pairs(pos_pairs, train_items)) + [0] * len(slice_pairs(neg_pairs, train_items)))
Xte = np.array([fv(a, b) for a, b in slice_pairs(pos_pairs, set(items) - train_items) + slice_pairs(neg_pairs, set(items) - train_items)])
yte = np.array([1] * len(slice_pairs(pos_pairs, set(items) - train_items)) + [0] * len(slice_pairs(neg_pairs, set(items) - train_items)))
clf = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1, random_state=SEED).fit(Xtr, ytr)
clf_pop = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1, random_state=SEED).fit(Xtr[:, POP_COLS], ytr)
log(f"  AUC student (item tenuti fuori): {roc_auc_score(yte, clf.predict_proba(Xte)[:, 1]):.3f}"
    f" · controllo popolarità: {roc_auc_score(yte, clf_pop.predict_proba(Xte[:, POP_COLS])[:, 1]):.3f}"
    f" · coppie train {len(ytr):,} test {len(yte):,}")

# ------------------------------------------------------------------ teacher di inferenza (film)
log("costruisco il teacher di inferenza (film del pool + visti)...")
hist = json.loads(HIST.read_text())
profiles = []
for ctx, by_type in hist.items():
    films = [("movie", int(f)) for f in by_type.get("movie", []) if ("movie", int(f)) in meta]
    series = [("tv", int(s)) for s in by_type.get("tv", []) if ("tv", int(s)) in meta]
    profiles.append((ctx, films, series))
film_pool = [(int(i), t) for i, t in catalog[catalog["type"] == "movie"].nlargest(FILM_POOL, "popularity")[["id", "type"]].to_records(index=False)]
tv_pool = [(int(i), t) for i, t in catalog[catalog["type"] == "tv"].nlargest(TV_POOL, "popularity")[["id", "type"]].to_records(index=False)]
pool = [(t, i) for i, t in film_pool + tv_pool]

teacher_items = sorted({tmdb_by_movieid[i] for t, i in pool if t == "movie" and i in tmdb_by_movieid} |
                       {tmdb_by_movieid[i] for _, w, _ in profiles for _, i in w if i in tmdb_by_movieid})
tidx = {m: k for k, m in enumerate(teacher_items)}
ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
ratings = ratings[ratings["movieId"].isin(tidx)]
r = ratings.copy(); r["i"] = r["movieId"].map(tidx).astype("int32")
X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                      shape=(int(r["userId"].max()) + 1, len(teacher_items)))
X.sum_duplicates(); X.data[:] = 1.0
N_U = X.shape[0]; n_i = np.asarray(X.sum(axis=0)).ravel()
C = (X.T @ X).tocoo()
p_ij = C.data / N_U; p_i = n_i[C.row] / N_U; p_j = n_i[C.col] / N_U
with np.errstate(divide="ignore", invalid="ignore"):
    npmi = np.log(p_ij / (p_i * p_j)) / (-np.log(p_ij))
npmi = np.nan_to_num(npmi, nan=0.0, posinf=0.0, neginf=0.0)
T = sparse.csr_matrix((np.maximum(npmi, 0.0), (C.row, C.col)), shape=(len(teacher_items), len(teacher_items)))
log(f"  teacher {T.shape}")

# ------------------------------------------------------------------ i trial
log("genero i trial (punteggi dei modelli appresi)...")
trials = []
for ctx, films, series in profiles:
    watched = films + series
    for setting, seed_items in [("semi_film", films), ("semi_misti", watched)]:
        if len(seed_items) < K_SEEDS + 2:
            continue
        for draw in range(DRAWS):
            perm = rng.permutation(len(seed_items))
            seeds = [seed_items[i] for i in perm[:K_SEEDS]]
            cands = [p for p in (pool + watched) if p not in seeds and p in meta]
            stud, pop, teach = [], [], []
            for cand in cands:
                Xc = np.array([fv(s, cand) for s in seeds])
                stud.append(float(clf.predict_proba(Xc)[:, 1].mean()))
                pop.append(float(clf_pop.predict_proba(Xc[:, POP_COLS])[:, 1].mean()))
                tot = 0.0
                if cand[0] == "movie" and cand[1] in tmdb_by_movieid:
                    j = tidx.get(tmdb_by_movieid[cand[1]])
                    if j is not None:
                        for s in seeds:
                            if s[0] == "movie" and s[1] in tmdb_by_movieid:
                                i = tidx.get(tmdb_by_movieid[s[1]])
                                if i is not None:
                                    tot += float(T[i, j])
                teach.append(tot)
            trials.append({"setting": setting, "ctx": ctx, "draw": draw,
                           "seeds": [list(s) for s in seeds],
                           "candidates": [list(c) for c in cands],
                           "student": [round(v, 6) for v in stud],
                           "pop": [round(v, 6) for v in pop],
                           "teacher": [round(v, 6) for v in teach]})
OUT.write_text(json.dumps(trials))
log(f"  trial: {len(trials)} · scritto {OUT} ({OUT.stat().st_size/1e6:.1f} MB)")
