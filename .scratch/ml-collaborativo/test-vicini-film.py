"""
.scratch/ml-collaborativo/test-vicini-film.py

IL TEST DEI VICINI SUI FILM — l'ultimo numero prima della matrice sparsa.

Protocollo (split-half pulito, nessun circolo):
  - gli utenti si dividono in A e B (seme fisso);
  - il TEACHER (SVD 64) si addestra SOLO su A  -> le coordinate codificano il comportamento di A;
  - lo STUDENTE (Ridge, metadati -> coordinate) impara le coordinate di A sui film;
  - la VERITA' e' il co-watch di B: due film sono "vicini veri" se molti utenti di B li hanno
    visti entrambi. B non ha toccato ne' il teacher ne' lo studente.
  - SOFFITTO = lo stesso test fatto con le coordinate VERE del teacher: quanta parte del co-watch di B
    e' anche solo rappresentabile nello spazio di A.
  - CONTROLLO = k film a caso.

Domanda: lo spazio dello studente mette vicini i film che si guardano insieme?
Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/test-vicini-film.py
"""
import json
import pathlib
from collections import Counter

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack
from scipy.sparse.linalg import svds
from sklearn.linear_model import Ridge

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
ML = ROOT / ".cache" / "movielens"
EMB_DIM, ALPHA, SEED = 64, 30.0, 20261008
KS = (10, 20, 50)
N_SAMPLE, MIN_USERS, MIN_CO = 1500, 8, 2
rng = np.random.default_rng(SEED)


def log(m): print(m, flush=True)


TV2MOVIE = {10759: [28, 12], 10765: [878, 14], 10768: [10752, 36], 10766: [18],
            10762: [10751, 16], 10763: [99], 10764: [99], 10767: [99]}


def json_ids(s, key="id"):
    if not isinstance(s, str) or not s:
        return []
    try:
        v = json.loads(s)
    except Exception:
        return []
    return [x[key] for x in (v if isinstance(v, list) else []) if isinstance(x, dict) and x.get(key) is not None]


# ---------------------------------------------------------------- 1. voti, split A/B, teacher su A
log("=== voti e split A/B ===")
links = pd.read_csv(ML / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
tmdb2mid = dict(zip(links["tmdbId"], links["movieId"]))
mid2tmdb = dict(zip(links["movieId"], links["tmdbId"]))
ratings = pd.read_csv(ML / "ml-32m" / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
users = ratings["userId"].unique()
perm = rng.permutation(len(users))
half = len(users) // 2
A_users, B_users = set(users[perm[:half]].tolist()), set(users[perm[half:]].tolist())
mids = np.array(sorted(set(ratings["movieId"].unique()) & set(mid2tmdb.keys())))
mid_pos = {int(m): i for i, m in enumerate(mids)}
log(f"  {len(users):,} utenti -> A {len(A_users):,} · B {len(B_users):,} · {len(mids):,} film")

ratings["i"] = ratings["movieId"].map(mid_pos)
r = ratings.dropna(subset=["i"])
r["i"] = r["i"].astype("int32")
inA = r["userId"].isin(A_users).to_numpy()
XA = csr_matrix((np.ones(int(inA.sum()), dtype=np.float32), (r.loc[inA, "userId"].to_numpy("int32"), r.loc[inA, "i"].to_numpy("int32"))),
                shape=(int(r["userId"].max()) + 1, len(mids)))
XB = csr_matrix((np.ones(int((~inA).sum()), dtype=np.float32), (r.loc[~inA, "userId"].to_numpy("int32"), r.loc[~inA, "i"].to_numpy("int32"))),
                shape=(int(r["userId"].max()) + 1, len(mids)))
XA.sum_duplicates(); XA.data[:] = 1.0
XB.sum_duplicates(); XB.data[:] = 1.0
log(f"  voti: A {XA.nnz:,} · B {XB.nnz:,}")

n_item = np.asarray(XA.sum(axis=0)).ravel()
Xw = XA.multiply((1.0 / np.log1p(np.maximum(n_item, 1)))[None, :]).tocsr()
_cf = ML / "teacher-A-half.npz"
if _cf.exists():
    ZA = np.load(_cf)["ZA"]
    assert ZA.shape == (len(mids), EMB_DIM), ZA.shape
    log("  teacher A: dalla cache (nessun ricalcolo)")
else:
    log("  SVD del teacher su A...")
    U, S, Vt = svds(Xw, k=EMB_DIM)
    ZA = Vt.T
    ZA = ZA / (np.linalg.norm(ZA, axis=1, keepdims=True) + 1e-9)
    np.savez_compressed(_cf, ZA=ZA)
    log(f"  teacher A: {ZA.shape} (salvato)")

# ---------------------------------------------------------------- 2. feature dei film + studente
log("\n=== studente (metadati -> coordinate di A) ===")
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "keywords", "genres", "release_date", "vote_count",
                                                     "vote_average", "runtime", "original_language", "production_countries",
                                                     "cast", "directors", "collection_id", "content_rating", "popularity"])
mv = mv[mv["id"].map(lambda x: int(x) in tmdb2mid and int(tmdb2mid[int(x)]) in mid_pos)]
mv = mv[mv["keywords"].map(lambda s: len(json.loads(s)) > 0)].reset_index(drop=True)
mv["year"] = pd.to_numeric(mv["release_date"].astype(str).str[:4], errors="coerce")
m_glob = float((mv["vote_average"] * mv["vote_count"]).sum() / max(1, mv["vote_count"].sum()))
mv["bayes"] = (mv["vote_count"] * mv["vote_average"] + 250.0 * m_glob) / (mv["vote_count"] + 250.0)
mv["kw_names"] = mv["keywords"].map(lambda s: [str(k.get("name", "")).strip().lower() for k in json.loads(s) if isinstance(k, dict)])
mv["countries"] = mv["production_countries"].map(lambda x: json_ids(x, "iso_3166_1"))
mv["people"] = mv.apply(lambda r: json_ids(r["cast"], "id")[:8] + json_ids(r["directors"], "id"), axis=1)
mv["collections"] = mv["collection_id"].map(lambda x: [] if pd.isna(x) else [int(x)])
mv["genres_mapped"] = mv["genres"].map(lambda s: [int(g["id"]) for g in json.loads(s or "[]")])
log(f"  {len(mv):,} film con metadati e teacher")

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
for i in range(len(mv)):
    for n in mv["kw_names"].iloc[i]:
        ch = CHAIN.get(n)
        if not ch:
            continue
        for pos, col, off in ((0, l1_ids, 0), (1, l2_ids, len(l1_ids)), (2, l3_ids, len(l1_ids) + len(l2_ids))):
            if ch[pos]:
                rows_b.append(i); cols_b.append(off + col[ch[pos]]); vals_b.append(1.0)
gv = {}
for i in range(len(mv)):
    for gid in mv["genres_mapped"].iloc[i]:
        if gid not in gv:
            gv[gid] = N_TOPO + len(gv)
        rows_b.append(i); cols_b.append(gv[gid]); vals_b.append(1.0)
base_extra = np.zeros((len(mv), 5), dtype=np.float32)
for i in range(len(mv)):
    y = mv["year"].iloc[i]
    base_extra[i] = [0.0 if pd.isna(y) else (y - 1990) / 30.0, np.log1p(mv["vote_count"].iloc[i]), mv["bayes"].iloc[i],
                     0.0 if pd.isna(mv["runtime"].iloc[i]) else mv["runtime"].iloc[i] / 120.0, np.log1p(mv["popularity"].iloc[i])]
FB = hstack([csr_matrix((vals_b, (rows_b, cols_b)), shape=(len(mv), N_TOPO + len(gv))), csr_matrix(base_extra)]).tocsr()
lv = {l: i for i, l in enumerate(mv["original_language"].dropna().value_counts().head(25).index)}
cv = {c: i for i, (c, _) in enumerate(Counter(c for l in mv["countries"] for c in l).most_common(40))}
pv = {p: i for i, (p, _) in enumerate(Counter(p for l in mv["people"] for p in l).most_common(3000))}
clv = {c: i for i, (c, _) in enumerate(Counter(c for l in mv["collections"] for c in l).most_common(800))}
rows_x, cols_x, vals_x = [], [], []
for i in range(len(mv)):
    lang = mv["original_language"].iloc[i]
    if lang in lv:
        rows_x.append(i); cols_x.append(lv[lang]); vals_x.append(1.0)
    for c in mv["countries"].iloc[i]:
        if c in cv:
            rows_x.append(i); cols_x.append(len(lv) + cv[c]); vals_x.append(1.0)
    for p in mv["people"].iloc[i]:
        if p in pv:
            rows_x.append(i); cols_x.append(len(lv) + len(cv) + pv[p]); vals_x.append(1.0)
    for c in mv["collections"].iloc[i]:
        if c in clv:
            rows_x.append(i); cols_x.append(len(lv) + len(cv) + len(pv) + clv[c]); vals_x.append(1.0)
extra2 = np.array([[1.0 if str(c or "").upper() in ("R", "NC-17", "TV-MA") else 0.0] for c in mv["content_rating"]], dtype=np.float32)
FX = hstack([FB, csr_matrix((vals_x, (rows_x, cols_x)), shape=(len(mv), len(lv) + len(cv) + len(pv) + len(clv))), csr_matrix(extra2)]).tocsr()
pos_in_mids = np.array([mid_pos[int(tmdb2mid[int(x)])] for x in mv["id"]], dtype=np.int64)
Y = ZA[pos_in_mids]
cos = lambda A, B: np.asarray((A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9) *
                               B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9)).sum(axis=1)).ravel()
perm2 = rng.permutation(len(mv))
n_te = int(0.2 * len(perm2))
te_idx, tr_idx = perm2[:n_te], perm2[n_te:]
m = Ridge(alpha=ALPHA, solver="lsqr", max_iter=800).fit(FX[tr_idx], Y[tr_idx])
log(f"  ESTESE film held-out (contro le coordinate di A): {cos(m.predict(FX[te_idx]), Y[te_idx]).mean():.3f}")
P = m.predict(FX).astype(np.float32)
Pn = P / (np.linalg.norm(P, axis=1, keepdims=True) + 1e-9)
log(f"  spazio studente: {Pn.shape}")
np.savez_compressed(ML / "studente-film-pos.npz", P=Pn, tmdb=mv["id"].to_numpy())
log("  coordinate dello studente salvate (studente-film-pos.npz)")

# ---------------------------------------------------------------- 3. la verita': co-watch di B
log("\n=== verita' (co-watch di B) ===")
nb = np.asarray(XB.sum(axis=0)).ravel()
cand = np.flatnonzero(nb >= MIN_USERS)
log(f"  film con >= {MIN_USERS} utenti di B: {len(cand):,}")
# campione stratificato per popolarita'
order = cand[np.argsort(-nb[cand])]
strata = np.array_split(order, 10)
sample = np.concatenate([s[rng.permutation(len(s))[: N_SAMPLE // 10]] for s in strata])
log(f"  campione: {len(sample):,} film (stratificato per popolarita')")
truth = {}
for j in sample:
    us = XB[:, j].nonzero()[0]
    counts = np.asarray(XB[us].sum(axis=0)).ravel()
    counts[j] = 0
    ok = np.flatnonzero(counts >= MIN_CO)
    if len(ok) < 3:
        continue
    top = ok[np.argsort(-counts[ok])][:20]
    truth[int(j)] = set(int(x) for x in top)
log(f"  film con verita' utilizzabile: {len(truth):,} · vicini veri per film: mediana {int(np.median([len(v) for v in truth.values()]))}")

# ---------------------------------------------------------------- 4. il test
# la verita' e' indicizzata sui film del teacher, lo studente su quelli con metadati: conversione UNA volta
row_of_mid = {int(pp): i for i, pp in enumerate(pos_in_mids)}
truth = {row_of_mid[j]: {row_of_mid[x] for x in tr if x in row_of_mid} for j, tr in truth.items() if j in row_of_mid}
truth = {j: tr - {j} for j, tr in truth.items() if len(tr - {j}) >= 3}
nb_mv = nb[pos_in_mids]
log(f"  dopo la conversione: {len(truth):,} film con verita' dentro lo spazio dello studente")

log("\n=== IL TEST: i vicini veri sono vicini nel nostro spazio? ===")
res = {k: dict(stu=0.0, ceil=0.0, ctrl=0.0, tot=0) for k in KS}
res_pop = {k: {"poveri": 0.0, "medi": 0.0, "ricchi": 0.0} for k in KS}
q1, q2 = np.quantile(nb_mv[list(truth)], [0.33, 0.66])
cnt_pop = {"poveri": 0, "medi": 0, "ricchi": 0}
for j, tr in truth.items():
    tr = tr - {j}
    if not tr:
        continue
    band = "poveri" if nb_mv[j] <= q1 else ("ricchi" if nb_mv[j] > q2 else "medi")
    cnt_pop[band] += 1
    for k in KS:
        o = [i for i in np.argsort(-(Pn @ Pn[j])) if i != j][:k]
        res[k]["stu"] += sum(1 for x in o if x in tr) / len(tr)
        oc = [i for i in np.argsort(-(ZA @ ZA[j])) if i != j][:k]
        res[k]["ceil"] += sum(1 for x in oc if x in tr) / len(tr)
        rc = rng.choice(len(mv), size=k, replace=False)
        res[k]["ctrl"] += sum(1 for x in rc if x in tr) / len(tr)
        res[k]["tot"] += 1
        res_pop[k][band] += sum(1 for x in o if x in tr) / len(tr)
print("\n| k | STUDENTE | SOFFITTO (coordinate vere) | controllo | quota del soffitto |")
print("|---|---|---|---|---|")
for k in KS:
    a = res[k]
    if not a["tot"]:
        continue
    s, c, ct = a["stu"] / a["tot"], a["ceil"] / a["tot"], a["ctrl"] / a["tot"]
    print(f"| {k} | **{100*s:.1f}%** | {100*c:.1f}% | {100*ct:.1f}% | {100*s/max(1e-9,c):.0f}% |")
print("\n| k | film poco visti | medi | molto visti |")
print("|---|---|---|---|")
for k in KS:
    p = res_pop[k]
    print(f"| {k} | {100*p['poveri']/max(1,cnt_pop['poveri']):.1f}% | {100*p['medi']/max(1,cnt_pop['medi']):.1f}% | {100*p['ricchi']/max(1,cnt_pop['ricchi']):.1f}% |")
print(f"\n(film per fascia: poveri {cnt_pop['poveri']} · medi {cnt_pop['medi']} · ricchi {cnt_pop['ricchi']})")
