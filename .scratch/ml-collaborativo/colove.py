"""
dehub.py — IL TEST DELL'ACCORPAMENTO DEI VOTI SUI FILM SUPER-POPOLARI.

Ipotesi: il rumore NON sono i film di nicchia, sono i film super-popolari che hanno monopolizzato i
voti. Un film con 100.000 voti co-occorre con tutto -> il suo vettore non discrimina, e domina le
coppie positive e i primi componenti del teacher.

Test: si tengono AL MASSIMO CAP voti per film (campione CASUALE, non i primi: un campione non
introduce distorsione di recenza), si ricostruiscono i DUE teacher, si riaddestrano i due studenti,
e si misura sul METRO CURATO. Confronto con lo spazio costruito su tutti i voti.

Uso: CAP=2000 python .scratch/ml-collaborativo/dehub.py
"""
import json, os, pathlib
from collections import Counter
import numpy as np, pandas as pd
from scipy.sparse import csr_matrix, hstack
from scipy.sparse.linalg import svds
from sklearn.linear_model import Ridge
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.preprocessing import normalize
from scipy import sparse as sp

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ, ML = ROOT / ".cache" / "tmdb", ROOT / ".cache" / "movielens"
CAP = int(os.environ.get("CAP", "2000"))
ALPHA, SEED, MIN_U, MIN_I, MIN_A, MIN_CO, K_NN = 30.0, 20261008, 20, 10, 5, 5, 200
rng = np.random.default_rng(SEED)


def log(m): print(m, flush=True)


TV2MOVIE = {10759: [28, 12], 10765: [878, 14], 10768: [10752, 36], 10766: [18],
            10762: [10751, 16], 10763: [99], 10764: [99], 10767: [99]}


def jids(s, key="id"):
    if not isinstance(s, str) or not s:
        return []
    try:
        v = json.loads(s)
    except Exception:
        return []
    return [x[key] for x in (v if isinstance(v, list) else []) if isinstance(x, dict) and x.get(key) is not None]


def mapg(s, is_tv):
    out = []
    for g in json.loads(s or "[]"):
        gid = int(g["id"])
        if is_tv and gid in TV2MOVIE:
            out += TV2MOVIE[gid]
        else:
            out.append(gid)
    return out


log(f"=== VOTI (tetto {CAP} per film) ===")
r = pd.read_csv(ML / "ml-32m" / "ratings.csv", usecols=["userId", "movieId", "timestamp"],
                dtype={"userId": "int32", "movieId": "int32", "timestamp": "int64"})
links = pd.read_csv(ML / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
tmdb2mid = dict(zip(links["tmdbId"], links["movieId"]))
mid2tmdb = dict(zip(links["movieId"], links["tmdbId"]))
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "keywords", "genres", "vote_count", "vote_average", "runtime",
                                                     "original_language", "production_countries", "cast", "directors",
                                                     "collection_id", "content_rating", "popularity", "release_date"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "keywords", "genres", "vote_count", "vote_average", "runtime",
                                                 "original_language", "production_countries", "cast", "created_by",
                                                 "content_rating", "popularity", "first_air_date"])
kw_ok = set(int(i) for i, k in zip(mv["id"], mv["keywords"]) if isinstance(k, str) and k not in ("[]", ""))
r = r[r["movieId"].map(lambda m: int(m) in mid2tmdb)]
r["tmdb"] = r["movieId"].map(lambda m: int(mid2tmdb[int(m)]))
r = r[r["tmdb"].map(lambda t: t in kw_ok)]
nu = r.groupby("userId").size()
r = r[r["userId"].isin(set(nu[nu >= MIN_U].index))]
# NB: la soglia sui film NON si applica al catalogo. I film con pochi voti restano come ITEM (la loro
# coordinata la predice lo studente dai metadati): la soglia vale solo per il TEACHER, dove serve la
# co-occorrenza (MIN_A). Applicarla al catalogo aveva tolto 22.000 film e falsato il confronto.
r = r.sort_values("timestamp")
r = r.groupby("userId").tail(1000)
if CAP:
    before = len(r)
    # campione casuale per film: mescolo tutto e prendo i primi CAP di ogni film (groupby().head()
    # non perde le colonne, apply() si')
    r = r.sample(frac=1.0, random_state=SEED).groupby("movieId").head(CAP)
    log(f"  accorpamento: {before:,} -> {len(r):,} voti ({100*len(r)/before:.0f}%)")
r = r[r["rating"] >= 4.0]      # CO-AMATO: solo i voti alti. Il valore del voto non era mai stato usato.
log(f"  voti ALTI (>=4): {len(r):,} · utenti {r['userId'].nunique():,} · film {r['movieId'].nunique():,}")
mids = np.array(sorted(r["movieId"].unique()))
mid_pos = {int(m): i for i, m in enumerate(mids)}
rr = r.copy()
rr["i"] = rr["movieId"].map(mid_pos).astype("int32")
X = csr_matrix((np.ones(len(rr), np.float32), (rr["userId"].to_numpy("int32"), rr["i"].to_numpy("int32"))),
               shape=(int(rr["userId"].max()) + 1, len(mids)))
X.sum_duplicates()
X.data[:] = 1.0
c_i = np.asarray(X.sum(0)).ravel()
log(f"  hub residui: max voti/film {int(c_i.max()):,} (era 102.929) · film con >=10.000 voti {int((c_i >= 10000).sum()):,} (erano 771)")

log("")
log("=== TEACHER 1: SVD della varianza (64) ===")
Xw = X.multiply((1.0 / np.log1p(np.maximum(c_i, 1)))[None, :]).tocsr()
U, S, Vt = svds(Xw, k=64)
Zs = Vt.T / (np.linalg.norm(Vt.T, axis=1, keepdims=True) + 1e-9)
log(f"  {Zs.shape}")

log("=== TEACHER 2: SPPMI + SVD (256) ===")
keep = np.flatnonzero(c_i >= MIN_A)
XK = X[:, keep].tocsr()
cK = c_i[keep]
N = float(XK.nnz)
C = (XK.T @ XK).tocsr()
C.setdiag(0)
C.eliminate_zeros()
ip, dat, ind = C.indptr, C.data, C.indices
kr, kc, kv = [], [], []
for i in range(C.shape[0]):
    a, b = ip[i], ip[i + 1]
    if b == a:
        continue
    seg = dat[a:b]
    if b - a > K_NN:
        t = np.argpartition(-seg, K_NN)[:K_NN]
        kr.extend([i] * K_NN); kc.extend(ind[a:b][t].tolist()); kv.extend(seg[t].tolist())
    else:
        kr.extend([i] * (b - a)); kc.extend(ind[a:b].tolist()); kv.extend(seg.tolist())
C = csr_matrix((np.asarray(kv, np.float32), (kr, kc)), shape=C.shape)
C.eliminate_zeros()
coo = C.tocoo()
val = np.maximum(np.log((coo.data * N) / (cK[coo.row] * cK[coo.col])), 0.0)
P = csr_matrix((val, (coo.row, coo.col)), shape=C.shape)
P.eliminate_zeros()
U, S, Vt = svds(P, k=256)
Zp = Vt.T / (np.linalg.norm(Vt.T, axis=1, keepdims=True) + 1e-9)
log(f"  {Zp.shape} · archi {C.nnz:,}")
row_svd = {int(mids[i]): i for i in range(len(mids))}
row_ppmi = {int(mids[int(k)]): j for j, k in enumerate(keep)}

log("")
log("=== FEATURE (film + serie, schema unificato) ===")
mv2 = mv[mv["id"].map(lambda x: int(x) in tmdb2mid)].copy()
tv2 = tv.copy()
mv2["type"], tv2["type"] = "movie", "tv"
mv2["title"], tv2["title"] = mv2["title"], tv2["name"]
mv2["date"], tv2["date"] = mv2["release_date"], tv2["first_air_date"]
tv2["directors"], tv2["collection_id"] = tv2["created_by"], np.nan
cat = pd.concat([mv2, tv2], ignore_index=True)
cat = cat[cat["keywords"].map(lambda s: len(json.loads(s)) > 0)].reset_index(drop=True)
cat["year"] = pd.to_numeric(cat["date"].astype(str).str[:4], errors="coerce")
mg = float((cat["vote_average"] * cat["vote_count"]).sum() / max(1, cat["vote_count"].sum()))
cat["bayes"] = (cat["vote_count"] * cat["vote_average"] + 250.0 * mg) / (cat["vote_count"] + 250.0)
is_tv = (cat["type"] == "tv").to_numpy()
cat["kwn"] = cat["keywords"].map(lambda s: [str(k.get("name", "")).strip().lower() for k in json.loads(s) if isinstance(k, dict)])
cat["countries"] = cat["production_countries"].map(lambda x: jids(x, "iso_3166_1"))
cat["people"] = cat.apply(lambda x: jids(x["cast"], "id")[:8] + jids(x["directors"], "id"), axis=1)
cat["colls"] = cat["collection_id"].map(lambda x: [] if pd.isna(x) else [int(x)])
cat["gm"] = [mapg(s, t) for s, t in zip(cat["genres"], is_tv)]
G = json.loads((ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
CH = {}
for nm, c in G["kw_to_L1"].items():
    t_ = (G["L1"].get(c) or {}).get("parent")
    v_ = (G["L2"].get(t_) or {}).get("parent") if t_ else None
    CH[nm] = (c, t_, v_)
l1 = {k: i for i, k in enumerate(G["L1"])}
l2 = {k: i for i, k in enumerate(G["L2"])}
l3 = {k: i for i, k in enumerate(G["L3"])}
NT = len(l1) + len(l2) + len(l3)
rb, cb, vb = [], [], []
for i in range(len(cat)):
    for n in cat["kwn"].iloc[i]:
        ch = CH.get(n)
        if not ch:
            continue
        for pos, col, off in ((0, l1, 0), (1, l2, len(l1)), (2, l3, len(l1) + len(l2))):
            if ch[pos]:
                rb.append(i); cb.append(off + col[ch[pos]]); vb.append(1.0)
gv = {}
for i in range(len(cat)):
    for gid in cat["gm"].iloc[i]:
        if gid not in gv:
            gv[gid] = NT + len(gv)
        rb.append(i); cb.append(gv[gid]); vb.append(1.0)
be = np.zeros((len(cat), 5), np.float32)
for i in range(len(cat)):
    y = cat["year"].iloc[i]
    be[i] = [0.0 if pd.isna(y) else (y - 1990) / 30.0, np.log1p(cat["vote_count"].iloc[i]), cat["bayes"].iloc[i],
             0.0 if pd.isna(cat["runtime"].iloc[i]) else cat["runtime"].iloc[i] / 120.0, np.log1p(cat["popularity"].iloc[i])]
FB = hstack([csr_matrix((vb, (rb, cb)), shape=(len(cat), NT + len(gv))), csr_matrix(be)]).tocsr()
lv = {l: i for i, l in enumerate(cat["original_language"].dropna().value_counts().head(25).index)}
cv = {c: i for i, (c, _) in enumerate(Counter(c for l in cat["countries"] for c in l).most_common(40))}
pv = {p: i for i, (p, _) in enumerate(Counter(p for l in cat["people"] for p in l).most_common(3000))}
clv = {c: i for i, (c, _) in enumerate(Counter(c for l in cat["colls"] for c in l).most_common(800))}
rx, cx, vx = [], [], []
for i in range(len(cat)):
    lg = cat["original_language"].iloc[i]
    if lg in lv:
        rx.append(i); cx.append(lv[lg]); vx.append(1.0)
    for c in cat["countries"].iloc[i]:
        if c in cv:
            rx.append(i); cx.append(len(lv) + cv[c]); vx.append(1.0)
    for p in cat["people"].iloc[i]:
        if p in pv:
            rx.append(i); cx.append(len(lv) + len(cv) + pv[p]); vx.append(1.0)
    for c in cat["colls"].iloc[i]:
        if c in clv:
            rx.append(i); cx.append(len(lv) + len(cv) + len(pv) + clv[c]); vx.append(1.0)
ex2 = np.array([[1.0 if str(c or "").upper() in ("R", "NC-17", "TV-MA") else 0.0] for c in cat["content_rating"]], np.float32)
FX = hstack([FB, csr_matrix((vx, (rx, cx)), shape=(len(cat), len(lv) + len(cv) + len(pv) + len(clv))), csr_matrix(ex2)]).tocsr()
log(f"  {FX.shape[1]:,} colonne · catalogo {len(cat):,} ({int((~is_tv).sum()):,} film · {int(is_tv.sum()):,} serie)")
trs = [i for i in range(len(cat)) if (not is_tv[i]) and int(tmdb2mid[int(cat['id'].iloc[i])]) in row_svd]
trp = [i for i in range(len(cat)) if (not is_tv[i]) and int(tmdb2mid[int(cat['id'].iloc[i])]) in row_ppmi]
Yc = np.zeros((len(cat), 64), np.float32)
for i in trs:
    Yc[i] = Zs[row_svd[int(tmdb2mid[int(cat["id"].iloc[i])])]]
Yb = np.zeros((len(cat), 256), np.float32)
for i in trp:
    Yb[i] = Zp[row_ppmi[int(tmdb2mid[int(cat["id"].iloc[i])])]]
Pc = Ridge(alpha=ALPHA, solver="lsqr", max_iter=800).fit(FX[trs], Yc[trs]).predict(FX).astype(np.float32)
Pb = Ridge(alpha=ALPHA, solver="lsqr", max_iter=800).fit(FX[trp], Yb[trp]).predict(FX).astype(np.float32)
Pb[is_tv] = 0.0
log(f"  studenti: film col teacher SVD {len(trs):,} · col PPMI {len(trp):,}")
np.savez_compressed(ML / "spazi-colove.npz", Pc=Pc, Pb=Pb, tmdb=cat["id"].to_numpy(), tipo=cat["type"].to_numpy(),
                    coll=cat["collection_id"].to_numpy(), year=cat["year"].to_numpy(), votes=cat["vote_count"].to_numpy())
Sf = normalize(TfidfTransformer().fit_transform(FX)).astype(np.float32)
sp.save_npz(ML / "spazi-colove-tfidf.npz", Sf)
log("  salvati spazi-colove.npz")
