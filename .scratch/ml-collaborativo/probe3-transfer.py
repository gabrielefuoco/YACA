"""
.scratch/ml-collaborativo/probe3-transfer.py

IL TEST DECISIVO (decisioni dell'utente dell'08/10/2026):
  - controllo di POPOLARITA' nel target (npmi, non cosine) e nella misura;
  - test del TRASFERIMENTO film → serie (MovieLens copre 0 serie, l'80% delle
    cronologie reali sono serie);
  - obiettivo: i SUGGERIMENTI, misurati sul banco leave-out (recupero della
    cronologia vera), non la struttura.

Domanda: uno studente addestrato sulla affinita' collaborativa dei FILM, applicato
ai metadati, ritrova la cronologia reale — SERIE INCLUSE — meglio del grafo delle
keyword che usiamo oggi?

Concorrenti, sugli stessi seeds e sullo stesso pool:
  base    : profilo keyword+generi (proxy fedele dello score tematico di produzione)
  student : affinita' appresa dai metadati, addestrata sui film MovieLens
  pop     : STUDENTE DI CONTROLLO addestrato solo sulla popolarita' (se vince lui,
            il "gusto" non c'e')
  blend   : base + student (miscela 50/50 dei punteggi normalizzati)

Metrica: recall@50 e @200 dei titoli NASCOSTI (film e serie separati), pool ~3.200.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/probe3-transfer.py
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

MIN_RATINGS = 20
FILM_POOL, TV_POOL = 2000, 1200
K_SEEDS = 3
DRAWS = 8
SEED = 20261008

def log(m):
    print(m, flush=True)

rng = np.random.default_rng(SEED)

# ------------------------------------------------------------------ cataloghi
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
log(f"  film {int((catalog['type'] == 'movie').sum())} · serie {int((catalog['type'] == 'tv').sum())}")

# IDF sulle keyword dell'intero catalogo
df_counter = Counter()
for kws in catalog["kw"]:
    df_counter.update(kws)
N_DOCS = len(catalog)
idf = lambda k: float(np.log(1.0 + N_DOCS / (1.0 + df_counter.get(k, 1))))
log(f"  vocabolario keyword: {len(df_counter)}")

meta = {}
for row in catalog.itertuples():
    meta[(row.type, int(row.id))] = dict(kw=row.kw, genres=row.genres_set,
                                         year=float(row.year) if pd.notna(row.year) else np.nan,
                                         votes=float(row.vote_count or 0), rating=float(row.vote_average or 0),
                                         runtime=float(row.runtime) if pd.notna(row.runtime) else np.nan,
                                         lang=row.original_language, pop=float(row.popularity or 0),
                                         title=row.title)

# ------------------------------------------------------------------ pool e cronologie
hist = json.loads(HIST.read_text())
film_pool = catalog[catalog["type"] == "movie"].nlargest(FILM_POOL, "popularity")[["id", "type"]].to_records(index=False).tolist()
tv_pool = catalog[catalog["type"] == "tv"].nlargest(TV_POOL, "popularity")[["id", "type"]].to_records(index=False).tolist()
pool = [(t, int(i)) for i, t in film_pool + tv_pool]
log(f"  pool: {len(pool)} titoli ({FILM_POOL} film + {TV_POOL} serie)")

profiles = []
for ctx, by_type in hist.items():
    films = [("movie", int(f)) for f in by_type.get("movie", []) if ("movie", int(f)) in meta]
    series = [("tv", int(s)) for s in by_type.get("tv", []) if ("tv", int(s)) in meta]
    profiles.append((ctx, films, series))
    log(f"  {ctx}: {len(films)} film e {len(series)} serie in cronologia (con metadati)")

# ------------------------------------------------------------------ teacher (npmi) sui film
log("\ncostruisco il teacher npmi sui film del pool + quelli visti...")
links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
links["tmdbId"] = links["tmdbId"].astype("int64"); links["movieId"] = links["movieId"].astype("int64")
movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
tmdb_by_movieid = {v: k for k, v in movieid_by_tmdb.items()}

teacher_items = sorted({tmdb_by_movieid[i] for t, i in pool if t == "movie" and i in tmdb_by_movieid} |
                       {tmdb_by_movieid[i] for _, w, _ in profiles for _, i in w if i in tmdb_by_movieid})
tidx = {m: k for k, m in enumerate(teacher_items)}
log(f"  item del teacher: {len(teacher_items)}")
ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
ratings = ratings[ratings["movieId"].isin(tidx)]
r = ratings.copy(); r["i"] = r["movieId"].map(tidx).astype("int32")
X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                      shape=(int(r["userId"].max()) + 1, len(teacher_items)))
X.sum_duplicates(); X.data[:] = 1.0
N_U = X.shape[0]
n_i = np.asarray(X.sum(axis=0)).ravel()
C = (X.T @ X).tocoo()
p_ij = C.data / N_U; p_i = n_i[C.row] / N_U; p_j = n_i[C.col] / N_U
with np.errstate(divide="ignore", invalid="ignore"):
    npmi = np.log(p_ij / (p_i * p_j)) / (-np.log(p_ij))
npmi = np.nan_to_num(npmi, nan=0.0, posinf=0.0, neginf=0.0)
T = sparse.csr_matrix((np.maximum(npmi, 0.0), (C.row, C.col)), shape=(len(teacher_items), len(teacher_items)))
log(f"  matrice teacher {T.shape} · coppie {C.nnz:,}")

# ------------------------------------------------------------------ student (film → metadati)
log("\naddestro lo student sui film MovieLens (campione in cache)...")
if not CACHE.exists():
    log("  cache del campione assente: esegui prima probe2-teacher.py"); sys.exit(1)
Xs = sparse.load_npz(CACHE)
meta_cache = json.loads((ROOT / ".cache" / "movielens" / "probe-cache.json").read_text())
sample = np.array(meta_cache["sample"], dtype="int64")
n_s = np.asarray(Xs.sum(axis=0)).ravel()
Cs = (Xs.T @ Xs).tocoo()
N_Us = Xs.shape[0]
q_ij = Cs.data / N_Us; q_i = n_s[Cs.row] / N_Us; q_j = n_s[Cs.col] / N_Us
with np.errstate(divide="ignore", invalid="ignore"):
    npmis = np.log(q_ij / (q_i * q_j)) / (-np.log(q_ij))
npmis = np.nan_to_num(npmis, nan=0.0, posinf=0.0, neginf=0.0)
Ts = sparse.csr_matrix((np.maximum(npmis, 0.0), (Cs.row, Cs.col)), shape=(len(sample), len(sample)))

meta_cache_by_mid = {}
for pos, mid in enumerate(sample):
    tmdb = tmdb_by_movieid.get(int(mid))
    if tmdb is not None and ("movie", tmdb) in meta:
        meta_cache_by_mid[pos] = ("movie", tmdb)


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
    return [iv, iv / iu, float(len(inter)), float(gj), abs(ya - yb),
            abs(np.log1p(ma["votes"]) - np.log1p(mb["votes"])), abs(ra - rb),
            1.0 if ma["lang"] == mb["lang"] else 0.0,
            np.log1p(ma["votes"]), np.log1p(mb["votes"]), np.log1p(ma["pop"]), np.log1p(mb["pop"])]


pos_pairs, neg_pairs = [], []
for i in range(len(sample)):
    if i not in meta_cache_by_mid or n_s[i] < MIN_RATINGS:
        continue
    row = Ts.getrow(i)
    order = np.argsort(-row.data)[:10]
    for o in order:
        j = int(row.indices[o])
        if j != i and j in meta_cache_by_mid and row.data[o] >= 0.15:
            pos_pairs.append((meta_cache_by_mid[i], meta_cache_by_mid[j]))
low = np.quantile(np.asarray(Ts[Cs.row, Cs.col]).ravel(), 0.05)
cand_neg = rng.integers(0, len(sample), len(pos_pairs) * 2)
neg_pairs = [(meta_cache_by_mid[int(a)], meta_cache_by_mid[int(b)])
             for a, b in zip(cand_neg[::2], cand_neg[1::2])
             if int(a) in meta_cache_by_mid and int(b) in meta_cache_by_mid and Ts[int(a), int(b)] <= low]
log(f"  coppie: {len(pos_pairs):,} positive · {len(neg_pairs):,} negative")

Xtr = np.array([fv(a, b) for a, b in pos_pairs + neg_pairs])
ytr = np.array([1] * len(pos_pairs) + [0] * len(neg_pairs))
clf = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1, random_state=SEED).fit(Xtr, ytr)
log(f"  student addestrato · AUC su training {roc_auc_score(ytr, clf.predict_proba(Xtr)[:, 1]):.3f}")
POP_COLS = [5, 8, 9, 10, 11]
clf_pop = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1, random_state=SEED).fit(Xtr[:, POP_COLS], ytr)

# ------------------------------------------------------------------ il banco leave-out
log("\n================ BANCO LEAVE-OUT: il TRASFERIMENTO film → serie ================\n")

scored_cache = {}


def scores_for(seeds, cands):
    """Punteggi dei tre concorrenti per le stesse coppie (seeds × candidati)."""
    seeds_meta = [s for s in seeds if s in meta]
    rows = []
    for cand in cands:
        # base: keyword pesate IDF, massimo sui semi
        wc = sum(idf(k) for k in meta[cand]["kw"]) or 1.0
        best = 0.0
        for s in seeds_meta:
            ms = meta[s]
            inter = ms["kw"] & meta[cand]["kw"]
            if inter:
                v = sum(idf(k) for k in inter) / ((sum(idf(k) for k in ms["kw"]) or 1.0) ** 0.5 * wc ** 0.5)
                best = max(best, v)
            gj = len(ms["genres"] & meta[cand]["genres"]) / (len(ms["genres"] | meta[cand]["genres"]) or 1)
            best = max(best, 0.15 * gj)          # i generi entrano come nello score tematico
        # student e controllo popolarità
        if seeds_meta:
            Xc = np.array([fv(s, cand) for s in seeds_meta])
            stud = float(clf.predict_proba(Xc)[:, 1].mean())
            pop = float(clf_pop.predict_proba(Xc[:, POP_COLS])[:, 1].mean())
        else:
            stud = pop = 0.0
        # teacher (oracolo, solo film coperti)
        teach = 0.0
        if cand[0] == "movie" and cand[1] in tmdb_by_movieid:
            j = tidx.get(tmdb_by_movieid[cand[1]])
            if j is not None:
                for s in seeds:
                    if s[0] == "movie" and s[1] in tmdb_by_movieid:
                        i = tidx.get(tmdb_by_movieid[s[1]])
                        if i is not None:
                            teach += float(T[i, j])
        rows.append({"cand": cand, "kw": best, "stud": stud, "pop": pop, "teach": teach})
    return rows


def evaluate(rows, gold_films, gold_tv):
    out = {}
    def norm(key):
        vals = [r[key] for r in rows]
        lo, hi = min(vals), max(vals)
        span = (hi - lo) or 1.0
        return {r["cand"]: (r[key] - lo) / span for r in rows}
    n_kw, n_st = norm("kw"), norm("stud")
    blend = {r["cand"]: (n_kw[r["cand"]] + n_st[r["cand"]]) / 2 for r in rows}
    orders = {
        "base (keyword)": [r["cand"] for r in sorted(rows, key=lambda r: -r["kw"])],
        "student": [r["cand"] for r in sorted(rows, key=lambda r: -r["stud"])],
        "pop (controllo)": [r["cand"] for r in sorted(rows, key=lambda r: -r["pop"])],
        "teacher (oracolo film)": [r["cand"] for r in sorted(rows, key=lambda r: -r["teach"])],
        "blend base+student": [r["cand"] for r in sorted(rows, key=lambda r: -blend[r["cand"]])],
    }
    for name, order in orders.items():
        t50, t200 = set(order[:50]), set(order[:200])
        out[name] = {
            "film@50": len([g for g in gold_films if g in t50]) / max(1, len(gold_films)),
            "serie@50": len([g for g in gold_tv if g in t50]) / max(1, len(gold_tv)),
            "serie@200": len([g for g in gold_tv if g in t200]) / max(1, len(gold_tv)),
        }
    return out


results = []
for ctx, films, series in profiles:
    watched = films + series
    for setting, seed_items, gold_films, gold_tv in [
        ("semi = FILM (trasferimento puro)", films, [], series),
        ("semi = misti (realistico)", watched, None, None),
    ]:
        if len(seed_items) < K_SEEDS + 2:
            continue
        for draw in range(DRAWS):
            perm = rng.permutation(len(seed_items))
            seeds = [seed_items[i] for i in perm[:K_SEEDS]]
            if gold_tv is None:
                rest = [seed_items[i] for i in perm[K_SEEDS:]]
                g_films = [r for r in rest if r[0] == "movie"]
                g_tv = [r for r in rest if r[0] == "tv"]
            else:
                g_films, g_tv = gold_films, gold_tv
            cands = [p for p in (pool + watched) if p not in seeds]
            rows = scores_for(seeds, cands)
            for name, m in evaluate(rows, g_films, g_tv).items():
                results.append({"ctx": ctx, "setting": setting, "model": name, **m})

df = pd.DataFrame(results)
for setting, grp in df.groupby("setting"):
    log(f"\n### {setting}  ({grp['ctx'].nunique()} profili × {DRAWS} estrazioni)")
    log("| modello | film nascosti @50 | **serie nascoste @50** | serie @200 |")
    log("|---|---|---|---|")
    for name, g in grp.groupby("model"):
        log(f"| {name} | {100*g['film@50'].mean():.1f}% | **{100*g['serie@50'].mean():.1f}%** | {100*g['serie@200'].mean():.1f}% |")
log(f"\n(caso casuale @50 ≈ {100*50/len(pool):.1f}% · @200 ≈ {100*200/len(pool):.1f}%)")
