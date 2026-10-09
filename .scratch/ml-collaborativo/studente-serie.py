"""
.scratch/ml-collaborativo/studente-serie.py

LO STUDENTE SULLE SERIE, DA SOLO. Tre cose:

1. PARITA' DEI METADATI (richiesta): i generi TV sono mappati a quelli dei film, e i campi che
   identificano il medium (budget, incassi, numero di stagioni) sono RIMOSSI. Senza questo, le
   colonne dei generi TV non hanno alcun film in addestramento -> coefficiente zero -> il segnale
   dei generi per le serie e' ASSENTE (era il difetto: probe4 le costruiva ma non le mappava).
   I campi che restano sono gli stessi per film e serie: keyword/topoi, generi, anno, voti, runtime,
   popolarita', lingua, paesi, persone, franchise (vuoti per le serie), content_rating.

2. LO STUDENTE: Ridge addestrato sui FILM col teacher (alpha=30, la configurazione finale).
   Nessuna propagazione: le coordinate di una serie vengono dai suoi METADATI, non dai vicini.
   (E' il "vettore -> vettore" : non passa dai film.)

3. IL TEST: le serie del campione Trakt (tenute fuori da tutto) hanno come vicini, nel nostro
   spazio, le serie che Trakt dice correlate? Con controllo casuale e raggiungibilita' dichiarata.
   Confronto con la propagazione (positions.json) che aveva dato 1,5% @50.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/studente-serie.py
"""
import json
import pathlib
from collections import Counter

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack
from sklearn.linear_model import Ridge

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
ML = ROOT / ".cache" / "movielens"
CACHE = ML
EMB_DIM = 64
ALPHA = 30.0
KS = (10, 20, 50)
SEED = 20261008
rng = np.random.default_rng(SEED)


def log(m): print(m, flush=True)


# ---------------------------------------------------------------- mappatura dei generi TV -> film
TV2MOVIE = {
    10759: [28, 12],      # Action & Adventure  -> Action + Adventure
    10765: [878, 14],     # Sci-Fi & Fantasy     -> Science Fiction + Fantasy
    10768: [10752, 36],   # War & Politics       -> War + History
    10766: [18],          # Soap                 -> Drama
    10762: [10751, 16],   # Kids                 -> Family + Animation
    10763: [99],          # News                 -> Documentary
    10764: [99],          # Reality              -> Documentary
    10767: [99],          # Talk                 -> Documentary
}
# generi con lo STESSO id nei due vocabolari: passano invariati
# (Romance, Family, Animation, Drama, Comedy, History, Western, Crime, Mystery, Documentary)

def map_genres(s, is_tv):
    out = []
    for g in json.loads(s or "[]"):
        gid = int(g["id"])
        if is_tv and gid in TV2MOVIE:
            out += TV2MOVIE[gid]
        elif is_tv and gid in (10759, 10765, 10768, 10762, 10763, 10764, 10766, 10767):
            pass
        else:
            out.append(gid)
    return out


# ---------------------------------------------------------------- catalogo (schema unificato)
log("=== catalogo ===")
links = pd.read_csv(ML / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
tmdb2mid = dict(zip(links["tmdbId"], links["movieId"]))
z = np.load(CACHE / "teacher-Z-heldout.npz")
Z, mids = z["Z"], z["mids"]
row_of_teacher = {int(m): j for j, m in enumerate(mids)}
log(f"teacher: {Z.shape[0]:,} film x {Z.shape[1]} dimensioni")

cols = ["id", "keywords", "genres", "vote_count", "vote_average", "runtime", "original_language",
        "production_countries", "cast", "content_rating", "popularity"]
mv = pd.read_parquet(PQ / "movies.parquet", columns=cols + ["title", "release_date", "directors", "collection_id"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=cols + ["name", "first_air_date", "created_by"])
# solo i film che hanno un teacher: gli altri non servono all'addestramento
mv = mv[mv["id"].map(lambda x: int(x) in tmdb2mid and int(tmdb2mid[int(x)]) in row_of_teacher)]
mv["type"] = "movie"; tv["type"] = "tv"
mv["title"] = mv["title"]; tv["title"] = tv["name"]
mv["date"] = mv["release_date"]; tv["date"] = tv["first_air_date"]
tv["directors"] = tv["created_by"]
tv["collection_id"] = np.nan
cat = pd.concat([mv[["id", "title", "type", "date", "keywords", "genres", "vote_count", "vote_average", "runtime",
                     "original_language", "production_countries", "cast", "directors", "collection_id", "content_rating", "popularity"]],
                 tv[["id", "title", "type", "date", "keywords", "genres", "vote_count", "vote_average", "runtime",
                     "original_language", "production_countries", "cast", "directors", "collection_id", "content_rating", "popularity"]]],
                ignore_index=True)
cat = cat[cat["keywords"].map(lambda s: len(json.loads(s)) > 0)].reset_index(drop=True)
cat["year"] = pd.to_numeric(cat["date"].astype(str).str[:4], errors="coerce")
m_global = float((cat["vote_average"] * cat["vote_count"]).sum() / max(1, cat["vote_count"].sum()))
cat["bayes"] = (cat["vote_count"] * cat["vote_average"] + 250.0 * m_global) / (cat["vote_count"] + 250.0)
is_tv = (cat["type"] == "tv").to_numpy()
log(f"  {len(cat):,} titoli ({int((~is_tv).sum()):,} film con teacher · {int(is_tv.sum()):,} serie)")


def json_ids(s, key="id"):
    if not isinstance(s, str) or not s:
        return []
    try:
        v = json.loads(s)
    except Exception:
        return []
    return [x[key] for x in (v if isinstance(v, list) else []) if isinstance(x, dict) and x.get(key) is not None]


cat["kw_names"] = cat["keywords"].map(lambda s: [str(k.get("name", "")).strip().lower() for k in json.loads(s) if isinstance(k, dict)])
cat["countries"] = cat["production_countries"].map(lambda x: json_ids(x, "iso_3166_1"))
cat["people"] = cat.apply(lambda r: json_ids(r["cast"], "id")[:8] + json_ids(r["directors"], "id"), axis=1)
cat["collections"] = cat["collection_id"].map(lambda x: [] if pd.isna(x) else [int(x)])
cat["genres_mapped"] = [map_genres(s, t) for s, t in zip(cat["genres"], is_tv)]
n_map = int(np.mean([len(a) for a, t in zip(cat["genres_mapped"], is_tv) if t]) )
log(f"  generi mappati: le serie hanno in media {n_map:.1f} generi-film (prima erano id TV)")

# ---------------------------------------------------------------- feature (stesse per film e serie)
log("=== feature ===")
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
rows_b, cols_b, vals_b = [], [], []
for i in range(len(cat)):
    for n in cat["kw_names"].iloc[i]:
        ch = CHAIN.get(n)
        if not ch:
            continue
        for pos, col in ((0, l1_ids), (1, l2_ids), (2, l3_ids)):
            if ch[pos]:
                off = (0, len(l1_ids), len(l1_ids) + len(l2_ids))[pos]
                rows_b.append(i); cols_b.append(off + col[ch[pos]]); vals_b.append(1.0)
genres_vocab = {}
for i in range(len(cat)):
    for gid in cat["genres_mapped"].iloc[i]:
        if gid not in genres_vocab:
            genres_vocab[gid] = N_TOPO + len(genres_vocab)
        rows_b.append(i); cols_b.append(genres_vocab[gid]); vals_b.append(1.0)
N_GENRES = len(genres_vocab)
base_extra = np.zeros((len(cat), 5), dtype=np.float32)
for i in range(len(cat)):
    y = cat["year"].iloc[i]
    base_extra[i] = [0.0 if pd.isna(y) else (y - 1990) / 30.0, np.log1p(cat["vote_count"].iloc[i]), cat["bayes"].iloc[i],
                     0.0 if pd.isna(cat["runtime"].iloc[i]) else cat["runtime"].iloc[i] / 120.0,
                     np.log1p(cat["popularity"].iloc[i])]
FB = hstack([csr_matrix((vals_b, (rows_b, cols_b)), shape=(len(cat), N_TOPO + N_GENRES)), csr_matrix(base_extra)]).tocsr()
lang_vocab = {l: i for i, l in enumerate(cat["original_language"].dropna().value_counts().head(25).index)}
country_vocab = {c: i for i, (c, _) in enumerate(Counter(c for l in cat["countries"] for c in l).most_common(40))}
people_vocab = {p: i for i, (p, _) in enumerate(Counter(p for l in cat["people"] for p in l).most_common(3000))}
coll_vocab = {c: i for i, (c, _) in enumerate(Counter(c for l in cat["collections"] for c in l).most_common(800))}
rows_x, cols_x, vals_x = [], [], []
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
extra2 = np.array([[1.0 if str(c or "").upper() in ("R", "NC-17", "TV-MA") else 0.0] for c in cat["content_rating"]], dtype=np.float32)
FX = hstack([FB, csr_matrix((vals_x, (rows_x, cols_x)),
                            shape=(len(cat), len(lang_vocab) + len(country_vocab) + len(people_vocab) + len(coll_vocab))),
             csr_matrix(extra2)]).tocsr()
log(f"  base {FB.shape[1]} colonne · estese {FX.shape[1]} (generi-film nel vocabolario: {N_GENRES})")

# ---------------------------------------------------------------- addestramento (solo film) + previsione
log("=== studente ===")
Y = np.zeros((len(cat), EMB_DIM), dtype=np.float32)
for i in np.where(~is_tv)[0]:
    mid = tmdb2mid.get(int(cat["id"].iloc[i]))
    if mid is not None and int(mid) in row_of_teacher:
        Y[i] = Z[row_of_teacher[int(mid)]]
train_idx = np.where(~is_tv)[0]
tv_idx = np.where(is_tv)[0]
cos = lambda A, B: np.asarray((A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9) *
                               B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9)).sum(axis=1)).ravel()
perm = rng.permutation(train_idx)
n_test = int(0.2 * len(perm)); te_idx, tr_idx = perm[:n_test], perm[n_test:]
for nm, F in (("BASE", FB), ("ESTESE", FX)):
    m = Ridge(alpha=ALPHA, solver="lsqr", max_iter=800).fit(F[tr_idx], Y[tr_idx])
    log(f"  {nm:<8} film held-out {cos(m.predict(F[te_idx]), Y[te_idx]).mean():.3f}")
m = Ridge(alpha=ALPHA, solver="lsqr", max_iter=800).fit(FX[train_idx], Y[train_idx])
P = m.predict(FX).astype(np.float32)
Pn = P / (np.linalg.norm(P, axis=1, keepdims=True) + 1e-9)
log(f"  previsioni: {len(tv_idx):,} serie + {len(train_idx):,} film")
# sanita': una serie con molti voti ha come vicini piu' serie o piu' film?
for probe in ("Breaking Bad", "Grey's Anatomy", "One Piece"):
    j = cat.index[cat["title"].astype(str).str.contains(probe, case=False, na=False)]
    if len(j):
        i = int(j[0]); s = Pn @ Pn[i]
        order = np.argsort(-s)[1:11]
        log(f"  vicini di {cat['title'].iloc[i]}: " + " · ".join(f"{cat['title'].iloc[k]} ({cat['type'].iloc[k]})" for k in order[:6]))

# ---------------------------------------------------------------- il test Trakt
log("\n=== IL TEST: le correlate di Trakt sono vicine? ===")
tvdf = pd.read_parquet(PQ / "tv.parquet", columns=["id", "imdb_id", "tvdb_id"])
key_of = {}
for i, im, tvd in zip(tvdf["id"], tvdf["imdb_id"], tvdf["tvdb_id"]):
    j = cat.index[(cat["type"] == "tv") & (cat["id"] == i)]
    if not len(j):
        continue
    pos = int(j[0])
    if im: key_of[f"imdb:{im}"] = pos
    if tvd: key_of[f"tvdb:{tvd}"] = pos
log(f"  serie del campione Trakt mappabili: {len(key_of):,}")
samples = json.loads((ROOT / ".cache" / "trakt" / "related-200.json").read_text(encoding="utf-8"))
agg = {k: dict(hit=0.0, ctrl=0.0, rel=0, tot=0) for k in KS}
agg_all = {k: dict(hit=0.0) for k in KS}
used = 0
for s in samples:
    src = key_of.get(f"imdb:{s['imdb']}")
    if src is None:
        continue
    rel = []
    for r in s["related"]:
        for f in ("imdb", "tvdb"):
            v = r["ids"].get(f)
            if v and f"{f}:{v}" in key_of and key_of[f"{f}:{v}"] != src:
                rel.append(key_of[f"{f}:{v}"]); break
    if not rel:
        continue
    used += 1
    relset = set(rel)
    for k in KS:
        # (a) fra le sole SERIE — "dato un vettore, a che serie corrisponde?"
        s_tv = Pn[tv_idx] @ Pn[src]
        order = [int(tv_idx[i]) for i in np.argsort(-s_tv) if int(tv_idx[i]) != src][:k]
        agg[k]["hit"] += sum(1 for x in order if x in relset) / len(relset)
        ctrl = rng.choice(len(tv_idx), size=k, replace=False)
        agg[k]["ctrl"] += sum(1 for i in ctrl if int(tv_idx[i]) in relset) / len(relset)
        agg[k]["rel"] += len(relset); agg[k]["tot"] += 1
        # (b) fra TUTTI i titoli (come la misura della propagazione)
        s_all = Pn @ Pn[src]
        order_all = [i for i in np.argsort(-s_all) if i != src][:k]
        agg_all[k]["hit"] += sum(1 for x in order_all if x in relset) / len(relset)
log(f"  serie usate: {used} · related per serie (mediana): {int(np.median([a['rel']/max(1,a['tot']) for a in agg.values()]))}")
print("\n| k | STUDENTE, fra le serie | STUDENTE, fra tutti i titoli | controllo | propagazione (positions.json) |")
print("|---|---|---|---|---|")
PROP = {10: 0.8, 20: 0.8, 50: 1.5}
for k in KS:
    a = agg[k]
    if not a["tot"]:
        continue
    print(f"| {k} | **{100*a['hit']/a['tot']:.1f}%** | {100*agg_all[k]['hit']/a['tot']:.1f}% | "
          f"{100*a['ctrl']/a['tot']:.1f}% | {PROP[k]:.1f}% |")
print("\n(raggiungibilita': 88% delle correlate e' nel nostro catalogo)")
