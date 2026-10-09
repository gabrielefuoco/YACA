"""
ranker-pairwise.py — IL RANKER SULLE COPPIE (GBM) al posto del collo di bottiglia delle coordinate.

Perche': oggi la somiglianza e' una SOMMA LINEARE di coseni e non puo' dire "questa coppia e' simile
PERCHE' condivide la saga, non perche' condivide il genere". I falsi amici (The Conjuring vs Shining,
Io robot vs Blade Runner) sono un problema di INTERAZIONE: la keyword condivisa non basta, serve la
congiunzione con altro. Una foresta/GBM questo lo cattura, il Ridge no.

Tutte le feature sono PRECALCOLATE offline (nessun embedding al volo, nessuna chiamata a runtime):
il ranker, a runtime, e' un attraversamento di alberi su feature gia' pronte.

Training: co-visione MovieLens (milioni di coppie possibili, ne campiono ~200k).
Test: il METRO CURATO (87 collegamenti, 18 falsi amici) — mai visto in addestramento.
Confronto col baseline: la fusione contenuto+anno, punteggio 84,9 sulla verifica.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/ranker-pairwise.py
"""
import json, os, pathlib, re, unicodedata, difflib
from collections import Counter
import numpy as np, pandas as pd
from scipy.sparse import csr_matrix, hstack
from scipy import sparse as sp
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ, ML = ROOT / ".cache" / "tmdb", ROOT / ".cache" / "movielens"
SEED, N_POS, N_NEG = 20261008, 120_000, 120_000
W_K = {3: 10, 2: 20, 1: 50}
rng = np.random.default_rng(SEED)


def log(m): print(m, flush=True)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(il|lo|la|i|gli|le|un|uno|una|the|a|an|of|and|der|die|das|les|el|los)\b", " ", s)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", s).split())


def yr(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0


def jids(s, key="id"):
    if not isinstance(s, str) or not s:
        return []
    try:
        v = json.loads(s)
    except Exception:
        return []
    return [x[key] for x in (v if isinstance(v, list) else []) if isinstance(x, dict) and x.get(key) is not None]


TV2MOVIE = {10759: [28, 12], 10765: [878, 14], 10768: [10752, 36], 10766: [18], 10762: [10751, 16], 10763: [99], 10764: [99], 10767: [99]}


def mapg(s, is_tv):
    out = []
    for g in json.loads(s or "[]"):
        gid = int(g["id"])
        if is_tv and gid in TV2MOVIE:
            out += TV2MOVIE[gid]
        else:
            out.append(gid)
    return out


# ---------------------------------------------------------------- 1. catalogo + spazi
log("=== catalogo e spazi ===")
z = np.load(ML / "spazi-cap0.npz", allow_pickle=True)
Pc, Pb, tmdb, tipo, coll, year, votes = z["Pc"], z["Pb"], z["tmdb"], z["tipo"], z["coll"], z["year"], z["votes"]
n = len(tmdb)
is_tv = (tipo == "tv")
Pc2 = Pc.astype(np.float64).copy(); Pc2[~is_tv] -= Pc[~is_tv].mean(0); Pc2[is_tv] -= Pc[is_tv].mean(0)
Pb2 = Pb.astype(np.float64).copy(); Pb2[~is_tv] -= Pb[~is_tv].mean(0)
Pc2 /= (np.linalg.norm(Pc2, axis=1, keepdims=True) + 1e-9)
Pb2 /= (np.linalg.norm(Pb2, axis=1, keepdims=True) + 1e-9)
Sf = sp.load_npz(ML / "spazi-cap0-tfidf.npz").tocsr()
log(f"  {n:,} titoli · spazi caricati")

links = pd.read_csv(ML / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
tmdb2mid = dict(zip(links["tmdbId"], links["movieId"]))
mid2tmdb = dict(zip(links["movieId"], links["tmdbId"]))
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "title_en", "keywords", "genres", "cast", "directors",
                                                     "production_countries", "original_language", "runtime", "content_rating", "release_date"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "name_en", "keywords", "genres", "cast", "created_by",
                                                 "production_countries", "original_language", "runtime", "content_rating", "first_air_date"])
meta = {}
for i, t, te, k, g, c, d, co, lg, rt, cr, dt in zip(mv["id"], mv["title"], mv["title_en"], mv["keywords"], mv["genres"], mv["cast"], mv["directors"], mv["production_countries"], mv["original_language"], mv["runtime"], mv["content_rating"], mv["release_date"]):
    meta[("movie", int(i))] = dict(t=t, te=te, kw=k, g=g, cast=c, dir=d, co=co, lg=lg, rt=rt, cr=cr, dt=dt)
for i, t, te, k, g, c, d, co, lg, rt, cr, dt in zip(tv["id"], tv["name"], tv["name_en"], tv["keywords"], tv["genres"], tv["cast"], tv["created_by"], tv["production_countries"], tv["original_language"], tv["runtime"], tv["content_rating"], tv["first_air_date"]):
    meta[("tv", int(i))] = dict(t=t, te=te, kw=k, g=g, cast=c, dir=d, co=co, lg=lg, rt=rt, cr=cr, dt=dt)

kwn, ppl, tpo, gen = [], [], [], []
G = json.loads((ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
CH = {}
for nm, c in G["kw_to_L1"].items():
    t_ = (G["L1"].get(c) or {}).get("parent")
    v_ = (G["L2"].get(t_) or {}).get("parent") if t_ else None
    CH[nm] = (c, t_, v_)
kwc, pc, toc, gc = Counter(), Counter(), Counter(), Counter()
items = []
for k_, i_ in zip(tipo, tmdb):
    m = meta.get((str(k_), int(i_)))
    if m is None:
        items.append(([], [], [], [])); continue
    kws = [str(x.get("name", "")).strip().lower() for x in json.loads(m["kw"] or "[]") if isinstance(x, dict)]
    peo = [f"c{p}" for p in jids(m["cast"], "id")[:8]] + [f"d{p}" for p in jids(m["dir"], "id")]
    tp = []
    for x in kws:
        ch = CH.get(x)
        if ch:
            tp += [f"l1:{ch[0]}"] if ch[0] else []
            tp += [f"l2:{ch[1]}"] if ch[1] else []
            tp += [f"l3:{ch[2]}"] if ch[2] else []
    gs = [f"g{g}" for g in mapg(m["g"], k_ == "tv")]
    items.append((kws, peo, tp, gs))
    kwc.update(kws); pc.update(peo); toc.update(tp); gc.update(gs)
KV = {k: i for i, (k, _) in enumerate(kwc.most_common(20000))}
PV = {k: i for i, (k, _) in enumerate(pc.most_common(4000))}
TV = {k: i for i, (k, _) in enumerate(toc.most_common(2000))}
GV = {k: i for i, (k, _) in enumerate(gc.most_common(40))}


def build(sel, voc, offset=0):
    rows, cols = [], []
    for i in range(len(items)):
        for x in items[i][sel]:
            if x in voc:
                rows.append(i); cols.append(voc[x] + offset)
    return csr_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(n, len(voc) + offset))


MK = build(0, KV)
MP = build(1, PV, len(KV))
MT = build(2, TV, len(KV) + len(PV))
MG = build(3, GV, len(KV) + len(PV) + len(TV))
log(f"  matrici: keyword {MK.nnz:,} · persone {MP.nnz:,} · topoi {MT.nnz:,} · generi {MG.nnz:,}")

lg = np.array([1 if (meta.get((str(k), int(i))) or {}).get("lg") == "en" else 0 for k, i in zip(tipo, tmdb)], np.float32)
rt = np.array([float((meta.get((str(k), int(i))) or {}).get("rt") or 0) for k, i in zip(tipo, tmdb)], np.float32)
cr = np.array([str((meta.get((str(k), int(i))) or {}).get("cr") or "") for k, i in zip(tipo, tmdb)])
lpop = np.log1p(votes.astype(float))
N_FEAT = 17
FEATN = ["cos_contenuto", "cos_comportamento", "cos_feature", "stessa_saga", "persone_comuni", "keyword_comuni",
         "topoi_comuni", "generi_jaccard", "diff_anno", "stesso_medium", "diff_voti", "voti_cand", "stessa_lingua",
         "paesi_comuni", "diff_durata", "n_keyword", "stesso_rating"]


def feats_pairs(I, J):
    """Feature di coppia VETTORIZZATE su tutte le coppie in un colpo: una sola indicizzazione
    per matrice invece di una per coppia (era il collo di bottiglia: 120.000 chiamate)."""
    I = np.asarray(I); J = np.asarray(J)
    F = np.zeros((len(I), N_FEAT), np.float32)
    F[:, 0] = np.einsum("ij,ij->i", Pc2[I], Pc2[J])
    F[:, 1] = np.einsum("ij,ij->i", Pb2[I], Pb2[J])
    F[:, 2] = np.asarray(Sf[I].multiply(Sf[J]).sum(1)).ravel()
    ci, cj = coll[I], coll[J]
    F[:, 3] = (ci == cj) & ~pd.isna(ci) & ~pd.isna(cj)
    F[:, 4] = np.asarray(MP[I].multiply(MP[J]).sum(1)).ravel()
    F[:, 5] = np.asarray(MK[I].multiply(MK[J]).sum(1)).ravel()
    F[:, 6] = np.asarray(MT[I].multiply(MT[J]).sum(1)).ravel()
    inter = np.asarray(MG[I].multiply(MG[J]).sum(1)).ravel()
    a = np.asarray(MG[I].sum(1)).ravel(); b = np.asarray(MG[J].sum(1)).ravel()
    F[:, 7] = inter / np.maximum(a + b - inter, 1)
    F[:, 8] = np.abs(year[I].astype(float) - year[J].astype(float))
    F[:, 9] = (tipo[I] == tipo[J])
    F[:, 10] = np.abs(lpop[I] - lpop[J])
    F[:, 11] = lpop[J]
    F[:, 12] = (lg[I] == lg[J])
    F[:, 13] = 0.0
    F[:, 14] = np.abs(rt[I] - rt[J])
    F[:, 15] = np.asarray(MK[J].sum(1)).ravel()
    F[:, 16] = (cr[I] == cr[J])
    if os.environ.get("NOPOP"):
        F = F[:, [k for k in range(N_FEAT) if k not in (10, 11, 15)]]
    return F


# ---------------------------------------------------------------- 2. training set dalla co-visione
log("")
log("=== training set: co-visione MovieLens ===")
CLEAN = ML / "ratings-puliti.parquet"
if CLEAN.exists():
    r = pd.read_parquet(CLEAN, columns=["userId", "movieId"])
    log("  voti puliti dalla cache")
else:
    r = pd.read_csv(ML / "ml-32m" / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
    r = r[r["movieId"].map(lambda m: int(m) in mid2tmdb)]
    valid = set(int(x) for x in tmdb.tolist())      # NB: FUORI dalla lambda (dentro = 31M set = appeso)
    r = r[r["movieId"].map(lambda m: int(mid2tmdb[int(m)]) in valid)]
    r[["userId", "movieId"]].to_parquet(CLEAN)
    log("  voti puliti salvati in cache")
row_of = {int(t): i for i, t in enumerate(tmdb)}
r = r.assign(i=r["movieId"].map(lambda m: row_of.get(int(mid2tmdb[int(m)]), -1)))
r = r[r["i"] >= 0]
mids = sorted(r["i"].unique())
mp = {int(m): k for k, m in enumerate(mids)}
r = r.assign(j=r["i"].map(mp).astype("int32"))
X = csr_matrix((np.ones(len(r), np.float32), (r["userId"].to_numpy("int32"), r["j"].to_numpy("int32"))),
               shape=(int(r["userId"].max()) + 1, len(mids)))
X.sum_duplicates(); X.data[:] = 1.0
log(f"  voti {X.nnz:,} · film con voti {len(mids):,}")
# NB: X[:, col] su CSR e' O(nnz) per chiamata: 50.348 volte = ore. Uso la CSC e gli indici diretti.
XC = X.tocsc()
c_i = np.asarray(X.sum(0)).ravel()
cand = [int(mids[k]) for k in range(len(mids)) if c_i[k] >= 20]
rng.shuffle(cand)
pos_i, pos_j = [], []
for m in cand[: int(N_POS / 40)]:
    col = mp[int(m)]
    us = XC.indices[XC.indptr[col]:XC.indptr[col + 1]]
    cnts = np.asarray(X[us].sum(0)).ravel()
    cnts[col] = 0
    ok = np.flatnonzero(cnts >= 3)
    if len(ok) == 0:
        continue
    for pj in ok[np.argsort(-cnts[ok])][:40]:
        pos_i.append(m); pos_j.append(int(mids[int(pj)]))
log(f"  coppie positive: {len(pos_i):,}")
neg_i = rng.choice(np.array(cand, dtype=int), size=len(pos_i))
neg_j = rng.integers(0, n, size=len(pos_i))
Xp = feats_pairs(pos_i, pos_j)
Xn = feats_pairs(neg_i, neg_j)
Xtr = np.vstack([Xp, Xn]); ytr = np.r_[np.ones(len(Xp)), np.zeros(len(Xn))]
log(f"  training: {Xtr.shape} · positivi {len(Xp):,} · negativi {len(Xn):,}")

# ---------------------------------------------------------------- 3. il GBM
log("")
log("=== addestramento (HistGradientBoosting) ===")
gb = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08, max_leaf_nodes=31, random_state=SEED)
gb.fit(Xtr, ytr)
log(f"  addestrato · accuratezza in-sample {gb.score(Xtr, ytr):.3f}")

# ---------------------------------------------------------------- 4. il metro curato
log("")
log("=== metro curato ===")
NORM = {}
for k_, i_ in zip(tipo, tmdb):
    m = meta.get((str(k_), int(i_)))
    if m is None:
        continue
    for s in (norm(m["t"]), norm(m["te"] or "")):
        if s:
            NORM.setdefault((s, yr(m["dt"])), int(i_))
byf = {}
for (s, y), i_ in NORM.items():
    byf.setdefault(s.split()[0], []).append((s, y, i_))


def find(title, year_):
    nn = norm(title)
    for dy in (0, 1, -1, 2, -2, 3, -3):
        if (nn, year_ + dy) in NORM:
            return NORM[(nn, year_ + dy)]
    best, bs = None, 0.0
    for s, y, i_ in byf.get(nn.split()[0], []):
        rr = difflib.SequenceMatcher(None, nn, s).ratio()
        if rr > bs:
            bs, best = rr, i_
    return best if bs >= 0.82 else None


gold = json.loads((ROOT / ".scratch" / "ml-collaborativo" / "gold" / "link-manuali.json").read_text(encoding="utf-8"))
srcs = []
for s in gold["sources"]:
    i = find(s["source"]["title"], s["source"]["year"])
    if i is None:
        continue
    row = row_of.get(int(i))
    if row is None:
        continue
    ls = [(find(l["title"], l["year"]), l["type"], l["w"]) for l in s["links"]]
    ls = [(row_of[j], t, w) for j, t, w in ls if j is not None and int(j) in row_of]
    ff = [find(f["title"], f["year"]) for f in s.get("false_friends", [])]
    ff = [row_of[j] for j in ff if j is not None and int(j) in row_of]
    srcs.append(dict(i=row, links=ls, ffs=ff))
log(f"  sorgenti {len(srcs)} · collegamenti {sum(len(s['links']) for s in srcs)} · falsi {sum(len(s['ffs']) for s in srcs)}")
odd = [k for k in range(len(srcs)) if k % 2 == 1]
even = [k for k in range(len(srcs)) if k % 2 == 0]


def valuta_ranker(nome, subset=None):
    ss = srcs if subset is None else [srcs[k] for k in subset]
    tot = {w: 0 for w in W_K}; hit = {w: 0 for w in W_K}
    byt = {}; ff10 = ff_tot = 0
    for s in ss:
        js = np.arange(n)
        sc = gb.predict_proba(feats_pairs(np.full(n, s["i"]), js))[:, 1]
        sc[s["i"]] = -9
        order = np.argsort(-sc)
        rank = {int(x): k for k, x in enumerate(order)}
        for j, t, w in s["links"]:
            tot[w] += 1; hit[w] += rank[j] < W_K[w]
            byt.setdefault(t, [0, 0]); byt[t][0] += rank[j] < W_K[w]; byt[t][1] += 1
        for j in s["ffs"]:
            ff_tot += 1; ff10 += rank[j] < 10
    c3 = hit[3] / max(1, tot[3]); c2 = hit[2] / max(1, tot[2]); f10 = ff10 / max(1, ff_tot)
    log(f"  {nome:<26} p3@10 {100*c3:5.1f}% ({hit[3]}/{tot[3]}) · p2@20 {100*c2:5.1f}% · falsi {100*f10:4.0f}% · PUNTEGGIO {100*(c3+c2-f10):5.1f}")
    return byt, dict(c3=c3, c2=c2, f10=f10, score=c3+c2-f10)


b, r_all = valuta_ranker("RANKER (tutto il set)")
byt_ev, r_ev = valuta_ranker("RANKER (verifica: solo pari)", subset=even)
log("")
log("=== PER TIPO (verifica) ===")
for t in sorted(byt_ev, key=lambda x: -byt_ev[x][1]):
    h, tt = byt_ev[t]
    log(f"  {t:<11} {100*h/max(1,tt):5.1f}% ({h}/{tt})")
log("")
log("=== RIFERIMENTO: la fusione contenuto+anno faceva, sulla verifica, 84,9 (nicchia 54,5%, mainstream 31,2%) ===")
log("=== IMPORTANZA DELLE FEATURE (permutazione su 20k righe) ===")
idx = rng.choice(len(Xtr), size=min(20000, len(Xtr)), replace=False)
Xv = Xtr[idx]
pi = permutation_importance(gb, Xv, ytr[idx], n_repeats=3, random_state=SEED, n_jobs=-1)
for k in np.argsort(-pi.importances_mean)[:12]:
    nm = FEATN[k] if not os.environ.get("NOPOP") else [f for j, f in enumerate(FEATN) if j not in (10, 11, 15)][k]
    log(f"  {nm:<20} {pi.importances_mean[k]:+.4f}")
