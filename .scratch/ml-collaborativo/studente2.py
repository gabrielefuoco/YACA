"""
.scratch/ml-collaborativo/studente2.py

ALZARE L'ASTICELLA. Quattro leve, misurate una per volta con lo STESSO metro (Trakt, 79 film,
controllo casuale, mediana del rango), sullo stesso insieme di addestramento:

  A  baseline            teacher = SVD della matrice dei voti (ottimizzato per la VARIANZA)
  B  + teacher PPMI      teacher = SPPMI + SVD della co-occorrenza (ottimizzato per i VICINI)
  C  + keyword one-hot   le keyword specifiche entrano nelle feature (prima solo la gerarchia L1/L2/L3)
  D  + metrica appresa   obiettivo pairwise: una regressione logistica impara i pesi per dimensione
                         ("il vicino vero piu' vicino di uno a caso"), invece della ricostruzione
  E  + pesi affidabilita + 256 dimensioni

Perche' queste: la diagnosi dice mediana del rango 170 (le correlate ci sono tutte, ma non salgono),
top-10 fatta per il 50% da keyword condivise, 35% da vicinanza d'anno, e solo 6% da saga.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/studente2.py
"""
import json
import pathlib
from collections import Counter

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack
from scipy.sparse.linalg import svds
from sklearn.linear_model import LogisticRegression, Ridge

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
ML = ROOT / ".cache" / "movielens"
SEED = 20261008
ALPHA = 30.0
MIN_A = 5           # voti minimi in A (basta poco: la copertura del teacher e' anche il set di addestramento)
MIN_CO = 5          # co-occorrenze minime per contare un arco
KS = (10, 20, 50)
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


# ================================================================ dati
log("=== voti, split A/B ===")
links = pd.read_csv(ML / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
tmdb2mid = dict(zip(links["tmdbId"], links["movieId"]))
mid2tmdb = dict(zip(links["movieId"], links["tmdbId"]))
ratings = pd.read_csv(ML / "ml-32m" / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
users = ratings["userId"].unique()
perm = rng.permutation(len(users))
half = len(users) // 2
A_users = set(users[perm[:half]].tolist())
mids = np.array(sorted(set(ratings["movieId"].unique()) & set(mid2tmdb.keys())))
mid_pos = {int(m): i for i, m in enumerate(mids)}
ratings["i"] = ratings["movieId"].map(mid_pos)
r = ratings.dropna(subset=["i"]); r["i"] = r["i"].astype("int32")
inA = r["userId"].isin(A_users).to_numpy()
XA = csr_matrix((np.ones(int(inA.sum()), np.float32), (r.loc[inA, "userId"].to_numpy("int32"), r.loc[inA, "i"].to_numpy("int32"))),
                shape=(int(r["userId"].max()) + 1, len(mids)))
XA.sum_duplicates(); XA.data[:] = 1.0
log(f"  A: {XA.nnz:,} voti · {len(mids):,} film")

# ================================================================ teacher 1: SVD della varianza (baseline)
log("\n=== teacher A: SVD dei voti (baseline, 64) ===")
_cf = ML / "teacher-A-half.npz"
if _cf.exists():
    Z_svd = np.load(_cf)["ZA"]
    log("  dalla cache")
else:
    n_item = np.asarray(XA.sum(axis=0)).ravel()
    Xw = XA.multiply((1.0 / np.log1p(np.maximum(n_item, 1)))[None, :]).tocsr()
    U, S, Vt = svds(Xw, k=64)
    Z_svd = Vt.T / (np.linalg.norm(Vt.T, axis=1, keepdims=True) + 1e-9)
    np.savez_compressed(_cf, ZA=Z_svd)
log(f"  {Z_svd.shape}")

# ================================================================ teacher 2: SPPMI + SVD (vicini)
log("\n=== teacher B: SPPMI + SVD (ottimizzato per i vicini) ===")
cnt = np.asarray(XA.sum(axis=0)).ravel()
keep = np.flatnonzero(cnt >= MIN_A)
log(f"  film con >= {MIN_A} voti in A: {len(keep):,}")
XK = XA[:, keep].tocsr()
cK = cnt[keep]
N_tot = float(XK.nnz)
ppmi_cf = ML / "teacher-ppmi.npz"
DIM_BIG = 256
if ppmi_cf.exists():
    zz = np.load(ppmi_cf)
    Z_ppmi, keep_ppmi = zz["Z"], zz["keep"]
    log("  dalla cache")
else:
    C = (XK.T @ XK).tocsr()
    C.setdiag(0); C.eliminate_zeros()
    log(f"  co-occorrenza grezza: {C.nnz:,} archi")
    # SPARSIFICAZIONE k-NN: tieni solo i K_NN co-occorrenti piu' forti per film. Senza questo la
    # matrice e' quasi COMPLETA (soglia 10 su film con 1000+ voti -> tutto co-occorre con tutto),
    # il PPMI diventa una struttura di popolarita' e i vicini si perdono (rango mediano 4.603).
    K_NN = 200
    indptr, data, indices = C.indptr, C.data, C.indices
    kr, kc, kv = [], [], []
    for i in range(C.shape[0]):
        a, b = indptr[i], indptr[i + 1]
        if b == a:
            continue
        seg = data[a:b]
        if b - a > K_NN:
            top = np.argpartition(-seg, K_NN)[:K_NN]
            kr.extend([i] * K_NN); kc.extend(indices[a:b][top].tolist()); kv.extend(seg[top].tolist())
        else:
            kr.extend([i] * (b - a)); kc.extend(indices[a:b].tolist()); kv.extend(seg.tolist())
    C = csr_matrix((np.asarray(kv, np.float32), (kr, kc)), shape=C.shape)
    C.eliminate_zeros()
    log(f"  dopo la sparsificazione k-NN ({K_NN} per film): {C.nnz:,} archi")
    coo = C.tocoo()
    val = np.log((coo.data * N_tot) / (cK[coo.row] * cK[coo.col]))          # PMI
    val = np.maximum(val, 0.0)                                              # PPMI (shift 0)
    P = csr_matrix((val, (coo.row, coo.col)), shape=C.shape)
    P.eliminate_zeros()
    log(f"  PPMI: {P.nnz:,} valori positivi · SVD a {DIM_BIG}...")
    U, S, Vt = svds(P, k=DIM_BIG)
    Z_ppmi = Vt.T / (np.linalg.norm(Vt.T, axis=1, keepdims=True) + 1e-9)
    keep_ppmi = keep
    np.savez_compressed(ppmi_cf, Z=Z_ppmi, keep=keep_ppmi)
    log(f"  {Z_ppmi.shape} (salvato)")
row_ppmi = {int(mids[int(k)]): j for j, k in enumerate(keep_ppmi)}   # chiave = movieId (NON la posizione: era il bug)

# ================================================================ catalogo e feature
log("\n=== catalogo e feature ===")
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
mv["n_A"] = [int(cnt[mid_pos[int(tmdb2mid[int(x)])]]) if int(tmdb2mid[int(x)]) in mid_pos else 0 for x in mv["id"]]
# il teacher copre solo i film con >= MIN_A voti in A: stesso insieme per tutte le configurazioni
trainable = np.array([int(tmdb2mid[int(x)]) in row_ppmi for x in mv["id"]], dtype=bool)
log(f"  {len(mv):,} film con metadati · {int(trainable.sum()):,} addestrabili (teacher PPMI)")

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
# --- leva C: keyword specifiche (prima c'erano solo i topoi)
kw_counts = Counter(k for l in mv["kw_names"] for k in l)
kw_vocab = {k: i for i, (k, _) in enumerate(kw_counts.most_common(20000))}
rows_k, cols_k = [], []
for i in range(len(mv)):
    for k in mv["kw_names"].iloc[i]:
        if k in kw_vocab:
            rows_k.append(i); cols_k.append(kw_vocab[k])
FK = csr_matrix((np.ones(len(rows_k), np.float32), (rows_k, cols_k)), shape=(len(mv), len(kw_vocab)))
FXK = hstack([FX, FK]).tocsr()
log(f"  feature: base {FB.shape[1]} · estese {FX.shape[1]} · +keyword {FXK.shape[1]} (keyword nel vocabolario: {len(kw_vocab):,})")

# ================================================================ verita' Trakt (test)
samples = json.loads((ROOT / ".cache" / "trakt" / "related-movies-150.json").read_text(encoding="utf-8"))
imdb_of = {str(im): int(i) for i, im in zip(mv["id"], mv["imdb_id"])} if "imdb_id" in mv else None
imdb_all = pd.read_parquet(PQ / "movies.parquet", columns=["id", "imdb_id"])
imdb_of = {str(im): int(i) for i, im in zip(imdb_all["id"], imdb_all["imdb_id"]) if im}
row_of_tmdb = {int(t): i for i, t in enumerate(mv["id"])}
tests = []
for s in samples:
    src = row_of_tmdb.get(imdb_of.get(str(s["imdb"]), -1))
    if src is None:
        continue
    rel = set()
    for rr in s["related"]:
        t = rr["ids"].get("tmdb") or imdb_of.get(str(rr["ids"].get("imdb")))
        if t and int(t) in row_of_tmdb and row_of_tmdb[int(t)] != src:
            rel.add(row_of_tmdb[int(t)])
    if len(rel) >= 3:
        tests.append((src, rel))
log(f"  film di test: {len(tests)} · correlate totali: {sum(len(r) for _, r in tests)}")


def evaluate(P, name, extra=""):
    """recall@k + mediana del rango + controllo + composizione della top-10."""
    Pn = P / (np.linalg.norm(P, axis=1, keepdims=True) + 1e-9)
    hit = {k: 0.0 for k in KS}
    ranks, ctrl = [], 0.0
    coll_top = n_top = 0
    for src, rel in tests:
        sims = Pn @ Pn[src]; sims[src] = -9
        order = np.argsort(-sims)
        pos = {int(x): i for i, x in enumerate(order)}
        for x in rel:
            ranks.append(pos[x])
        for k in KS:
            hit[k] += sum(1 for x in order[:k] if x in rel) / len(rel)
        ctrl += sum(1 for x in rng.choice(len(mv), size=50, replace=False) if x in rel) / len(rel)
        c_src = mv["collection_id"].iloc[src]
        for x in order[:10]:
            n_top += 1
            c = mv["collection_id"].iloc[x]
            coll_top += (not pd.isna(c_src)) and (not pd.isna(c)) and c == c_src
    n = len(tests)
    r = np.array(ranks)
    log(f"  {name:<34} @10 {100*hit[10]/n:5.1f}% · @50 {100*hit[50]/n:5.1f}% · rango mediano {int(np.median(r)):>5,} · "
        f"controllo {100*ctrl/n:4.1f}% · saga in top-10 {100*coll_top/max(1,n_top):2.0f}% {extra}")
    return 100 * hit[50] / n


# ================================================================ le configurazioni
log("\n=== LE CONFIGURAZIONI (stesso metro: Trakt, controllo, mediana del rango) ===")
tr = np.flatnonzero(trainable)
perm2 = rng.permutation(len(tr))
te_idx, tr_idx = tr[perm2[: int(0.15 * len(tr))]], tr[perm2[int(0.15 * len(tr)):]]


def run(cfg):
    name, F, teacher, metric, weights, dims = cfg
    Y = np.zeros((len(mv), dims), np.float32)
    if teacher == "svd":
        for i in tr:
            Y[i] = Z_svd[mid_pos[int(tmdb2mid[int(mv["id"].iloc[i])])]]
    else:
        for i in tr:
            Y[i] = Z_ppmi[row_ppmi[int(tmdb2mid[int(mv["id"].iloc[i])])]]
    w = None
    if weights:
        w = (mv["n_A"].to_numpy(np.float32)[tr] / (mv["n_A"].to_numpy(np.float32)[tr] + 100.0))
    m = Ridge(alpha=ALPHA, solver="lsqr", max_iter=800)
    m.fit(F[tr], Y[tr], sample_weight=w)
    P = m.predict(F).astype(np.float32)
    if metric:
        # obiettivo pairwise: una logistica impara i pesi per dimensione su coppie positive/negative di A
        nz = np.flatnonzero((np.asarray(XA.sum(axis=0)).ravel() > 0))
        nz = np.array([j for j in nz if int(mids[j]) in tmdb2mid and int(tmdb2tmdb_ok(j)) in row_of_tmdb], dtype=int) if False else nz
        pos, neg = [], []
        cK_arr = np.asarray(XK.sum(axis=0)).ravel()
        for _ in range(4000):
            a = int(rng.choice(len(tr)))
            ia = tr[a]
            j = row_ppmi.get(int(tmdb2mid[int(mv["id"].iloc[ia])]))
            if j is None:
                continue
            users_a = XK[:, j].nonzero()[0]
            if len(users_a) == 0:
                continue
            cnts = np.asarray(XK[users_a].sum(axis=0)).ravel()
            cnts[j] = 0
            ok = np.flatnonzero(cnts >= MIN_CO)
            if len(ok) == 0:
                continue
            pj = int(ok[np.argmax(cnts[ok])])
            k_mid = int(mids[int(keep_ppmi[pj])])          # posizione -> movieId (namespace!)
            pk = row_of_tmdb.get(int(mid2tmdb.get(k_mid, -1)))
            if pk is None or pk == ia:
                continue
            pos.append((ia, pk))
            neg.append((ia, int(rng.choice(len(mv)))))
        Xp = np.array([P[i] * P[j] for i, j in pos], np.float32)
        Xn = np.array([P[i] * P[j] for i, j in neg], np.float32)
        if len(pos) > 200:
            Xl = np.vstack([Xp, Xn]); yl = np.r_[np.ones(len(Xp)), np.zeros(len(Xn))]
            lr = LogisticRegression(max_iter=1000, C=1.0).fit(Xl, yl)
            wd = np.clip(lr.coef_[0], 0, None)
            P = P * np.sqrt(wd + 1e-6)
    return evaluate(P, name)


cfgs = [
    ("A  baseline (SVD64, topoi)", FX, "svd", False, False, 64),
    ("B1 + keyword specifiche", FXK, "svd", False, False, 64),
    ("B2 + metrica appresa (pairwise)", FXK, "svd", True, False, 64),
    ("B3 + pesi affidabilita", FXK, "svd", True, True, 64),
    ("C1 teacher PPMI k-NN (256)", FXK, "ppmi", False, False, 256),
    ("C2 PPMI + metrica appresa", FXK, "ppmi", True, False, 256),
]
for cfg in cfgs:
    run(cfg)
