"""
spazi.py — COSTRUISCE I DUE SPAZI (contenuto e comportamento) per film E serie, e li salva.
  Pc = studente addestrato sul teacher SVD (contenuto/nicchia)  -> e' quello che coincide con Trakt
  Pb = studente addestrato sul teacher PPMI (comportamento/co-visione) -> solo film (le serie non hanno co-visione)
Uso: python .scratch/ml-collaborativo/spazi.py
"""
import json, pathlib
from collections import Counter
import numpy as np, pandas as pd
from scipy.sparse import csr_matrix, hstack
from sklearn.linear_model import Ridge
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.preprocessing import normalize
from scipy import sparse as sp
ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ, ML = ROOT/".cache"/"tmdb", ROOT/".cache"/"movielens"
ALPHA, SEED = 30.0, 20261008
rng = np.random.default_rng(SEED)
TV2MOVIE = {10759: [28,12], 10765: [878,14], 10768: [10752,36], 10766: [18], 10762: [10751,16], 10763: [99], 10764: [99], 10767: [99]}
def log(m): print(m, flush=True)
def json_ids(s, key="id"):
    if not isinstance(s, str) or not s: return []
    try: v = json.loads(s)
    except Exception: return []
    return [x[key] for x in (v if isinstance(v, list) else []) if isinstance(x, dict) and x.get(key) is not None]
def map_genres(s, is_tv):
    out = []
    for g in json.loads(s or "[]"):
        gid = int(g["id"])
        if is_tv and gid in TV2MOVIE: out += TV2MOVIE[gid]
        elif is_tv and gid in TV2MOVIE.keys(): pass
        else: out.append(gid)
    return out

links = pd.read_csv(ML/"ml-32m"/"links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId":"int64","movieId":"int64"})
tmdb2mid = dict(zip(links["tmdbId"], links["movieId"]))
mid2tmdb = dict(zip(links["movieId"], links["tmdbId"]))
z = np.load(ML/"teacher-A-half.npz"); ZSVD, mids_svd = z["ZA"], None
_m = pd.read_csv(ML/"ml-32m"/"ratings.csv", usecols=["movieId"], dtype="int32")
mids = np.array(sorted(set(_m["movieId"].unique().tolist()) & set(mid2tmdb.keys())))   # movieId con movieId (5o namespace della giornata)
assert len(mids) == ZSVD.shape[0]
row_svd = {int(mids[i]): i for i in range(len(mids))}
zp = np.load(ML/"teacher-ppmi.npz"); ZPPMI, keep_ppmi = zp["Z"], zp["keep"]
row_ppmi = {int(mids[int(k)]): j for j, k in enumerate(keep_ppmi)}

cols = ["id","keywords","genres","vote_count","vote_average","runtime","original_language","production_countries","cast","content_rating","popularity"]
mv = pd.read_parquet(PQ/"movies.parquet", columns=cols+["title","release_date","directors","collection_id"])
tv = pd.read_parquet(PQ/"tv.parquet", columns=cols+["name","first_air_date","created_by"])
mv = mv[mv["id"].map(lambda x: int(x) in tmdb2mid)].copy()
mv["type"], tv["type"] = "movie", "tv"
mv["title"], tv["title"] = mv["title"], tv["name"]
mv["date"], tv["date"] = mv["release_date"], tv["first_air_date"]
tv["directors"], tv["collection_id"] = tv["created_by"], np.nan
cat = pd.concat([mv, tv], ignore_index=True)
cat = cat[cat["keywords"].map(lambda s: len(json.loads(s)) > 0)].reset_index(drop=True)
cat["year"] = pd.to_numeric(cat["date"].astype(str).str[:4], errors="coerce")
m_glob = float((cat["vote_average"]*cat["vote_count"]).sum()/max(1, cat["vote_count"].sum()))
cat["bayes"] = (cat["vote_count"]*cat["vote_average"]+250.0*m_glob)/(cat["vote_count"]+250.0)
is_tv = (cat["type"]=="tv").to_numpy()
cat["kw_names"] = cat["keywords"].map(lambda s: [str(k.get("name","")).strip().lower() for k in json.loads(s) if isinstance(k, dict)])
cat["countries"] = cat["production_countries"].map(lambda x: json_ids(x, "iso_3166_1"))
cat["people"] = cat.apply(lambda r: json_ids(r["cast"],"id")[:8]+json_ids(r["directors"],"id"), axis=1)
cat["collections"] = cat["collection_id"].map(lambda x: [] if pd.isna(x) else [int(x)])
cat["genres_mapped"] = [map_genres(s, t) for s, t in zip(cat["genres"], is_tv)]
log(f"catalogo: {len(cat):,} ({int((~is_tv).sum()):,} film · {int(is_tv.sum()):,} serie)")

G = json.loads((ROOT/"src"/"data"/"hierarchical_graph.json").read_text(encoding="utf-8"))
CHAIN = {}
for nm, c in G["kw_to_L1"].items():
    t_ = (G["L1"].get(c) or {}).get("parent"); v_ = (G["L2"].get(t_) or {}).get("parent") if t_ else None
    CHAIN[nm] = (c, t_, v_)
l1 = {k:i for i,k in enumerate(G["L1"])}; l2 = {k:i for i,k in enumerate(G["L2"])}; l3 = {k:i for i,k in enumerate(G["L3"])}
NT = len(l1)+len(l2)+len(l3)
rb, cb, vb = [], [], []
for i in range(len(cat)):
    for n in cat["kw_names"].iloc[i]:
        ch = CHAIN.get(n)
        if not ch: continue
        for pos, col, off in ((0,l1,0),(1,l2,len(l1)),(2,l3,len(l1)+len(l2))):
            if ch[pos]: rb.append(i); cb.append(off+col[ch[pos]]); vb.append(1.0)
gv = {}
for i in range(len(cat)):
    for gid in cat["genres_mapped"].iloc[i]:
        if gid not in gv: gv[gid] = NT+len(gv)
        rb.append(i); cb.append(gv[gid]); vb.append(1.0)
be = np.zeros((len(cat),5), np.float32)
for i in range(len(cat)):
    y = cat["year"].iloc[i]
    be[i] = [0.0 if pd.isna(y) else (y-1990)/30.0, np.log1p(cat["vote_count"].iloc[i]), cat["bayes"].iloc[i],
             0.0 if pd.isna(cat["runtime"].iloc[i]) else cat["runtime"].iloc[i]/120.0, np.log1p(cat["popularity"].iloc[i])]
FB = hstack([csr_matrix((vb,(rb,cb)), shape=(len(cat), NT+len(gv))), csr_matrix(be)]).tocsr()
lv = {l:i for i,l in enumerate(cat["original_language"].dropna().value_counts().head(25).index)}
cv = {c:i for i,(c,_) in enumerate(Counter(c for l in cat["countries"] for c in l).most_common(40))}
pv = {p:i for i,(p,_) in enumerate(Counter(p for l in cat["people"] for p in l).most_common(3000))}
clv = {c:i for i,(c,_) in enumerate(Counter(c for l in cat["collections"] for c in l).most_common(800))}
rx, cx, vx = [], [], []
for i in range(len(cat)):
    lang = cat["original_language"].iloc[i]
    if lang in lv: rx.append(i); cx.append(lv[lang]); vx.append(1.0)
    for c in cat["countries"].iloc[i]:
        if c in cv: rx.append(i); cx.append(len(lv)+cv[c]); vx.append(1.0)
    for p in cat["people"].iloc[i]:
        if p in pv: rx.append(i); cx.append(len(lv)+len(cv)+pv[p]); vx.append(1.0)
    for c in cat["collections"].iloc[i]:
        if c in clv: rx.append(i); cx.append(len(lv)+len(cv)+len(pv)+clv[c]); vx.append(1.0)
ex2 = np.array([[1.0 if str(c or "").upper() in ("R","NC-17","TV-MA") else 0.0] for c in cat["content_rating"]], np.float32)
FX = hstack([FB, csr_matrix((vx,(rx,cx)), shape=(len(cat), len(lv)+len(cv)+len(pv)+len(clv))), csr_matrix(ex2)]).tocsr()
log(f"feature: {FX.shape[1]:,} colonne")

tr = [i for i in range(len(cat)) if (not is_tv[i]) and int(tmdb2mid[int(cat['id'].iloc[i])]) in row_svd]
trp = [i for i in range(len(cat)) if (not is_tv[i]) and int(tmdb2mid[int(cat['id'].iloc[i])]) in row_ppmi]
Yc = np.zeros((len(cat), ZSVD.shape[1]), np.float32)
for i in tr: Yc[i] = ZSVD[row_svd[int(tmdb2mid[int(cat["id"].iloc[i])])]]
Yb = np.zeros((len(cat), ZPPMI.shape[1]), np.float32)
for i in trp: Yb[i] = ZPPMI[row_ppmi[int(tmdb2mid[int(cat["id"].iloc[i])])]]
mc = Ridge(alpha=ALPHA, solver="lsqr", max_iter=800).fit(FX[tr], Yc[tr])
mb = Ridge(alpha=ALPHA, solver="lsqr", max_iter=800).fit(FX[trp], Yb[trp])
Pc = mc.predict(FX).astype(np.float32)
Pb = mb.predict(FX).astype(np.float32)
for i in range(len(cat)):                 # le serie non hanno co-visione: comportamento = 0
    if is_tv[i]: Pb[i] = 0.0
Sf = normalize(TfidfTransformer().fit_transform(FX)).astype(np.float32)
sp.save_npz(ML/"spazi-tfidf.npz", Sf)
log(f"TF-IDF grezzo salvato: {Sf.shape} · {Sf.nnz:,} valori")
np.savez_compressed(ML/"spazi.npz", Pc=Pc, Pb=Pb, tmdb=cat["id"].to_numpy(), tipo=cat["type"].to_numpy(),
                    coll=cat["collection_id"].to_numpy(), year=cat["year"].to_numpy(), votes=cat["vote_count"].to_numpy())
log(f"salvati: Pc {Pc.shape} (contenuto, film+serie) · Pb {Pb.shape} (comportamento, solo film: {len(trp):,} addestrati)")
