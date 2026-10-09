"""
test-due-teacher.py — TEST RAPIDO: i due teacher della divisione per gusto si specializzano?

Si costruiscono i due teacher (SPPMI + SVD) dai due dataset della divisione per gusto:
  MAINSTREAM = utenti che guardano film popolari
  NICCHIA    = utenti che guardano film classici/vecchi
e si valutano DIRETTAMENTE sul metro curato (senza studenti: solo le coordinate degli item).
Se la divisione vale la pena, il teacher mainstream deve vincere sui collegamenti 'mainstream' e
quello di nicchia sui 'niche'. Se uno vince su tutto, la divisione non aggiunge niente.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/test-due-teacher.py
"""
import json, pathlib, re, unicodedata, difflib
import numpy as np, pandas as pd
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import svds
from scipy.stats import spearmanr

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ, ML = ROOT / ".cache" / "tmdb", ROOT / ".cache" / "movielens"
MIN_A, MIN_CO, K_NN, DIM = 5, 5, 200, 256
W_K = {3: 10, 2: 20, 1: 50}


def log(m): print(m, flush=True)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(il|lo|la|i|gli|le|un|uno|una|the|a|an|of|and|der|die|das|les|el|los)\b", " ", s)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", s).split())


def yr(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0


# ---------------------------------------------------------------- catalogo e aggancio del gold
links = pd.read_csv(ML / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
mid2tmdb = dict(zip(links["movieId"], links["tmdbId"]))
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "title_en", "release_date"])
NORM = {}
for i, t, te, d in zip(mv["id"], mv["title"], mv["title_en"], mv["release_date"]):
    for s in (norm(t), norm(te)):
        if s:
            NORM.setdefault((s, yr(d)), int(i))
by_first = {}
for (s, y), i in NORM.items():
    by_first.setdefault(s.split()[0], []).append((s, y, i))


def find(title, year):
    nn = norm(title)
    for dy in (0, 1, -1, 2, -2, 3, -3):
        if (nn, year + dy) in NORM:
            return NORM[(nn, year + dy)]
    best, bs = None, 0.0
    for s, y, i in by_first.get(nn.split()[0], []):
        r = difflib.SequenceMatcher(None, nn, s).ratio()
        if r > bs:
            bs, best = r, i
    return best if bs >= 0.82 else None


gold = json.loads((ROOT / ".scratch" / "ml-collaborativo" / "gold" / "link-manuali.json").read_text(encoding="utf-8"))
srcs = []
for s in gold["sources"]:
    i = find(s["source"]["title"], s["source"]["year"])
    if i is None:
        continue
    ls = [(find(l["title"], l["year"]), l["type"], l["w"]) for l in s["links"]]
    ls = [(j, t, w) for j, t, w in ls if j is not None]
    ff = [find(f["title"], f["year"]) for f in s.get("false_friends", [])]
    srcs.append(dict(i=i, links=ls, ffs=[j for j in ff if j is not None]))
log(f"gold agganciato: {len(srcs)} sorgenti · {sum(len(s['links']) for s in srcs)} collegamenti")

# ---------------------------------------------------------------- i due teacher
spaces = {}
for nome, f in (("mainstream", "ratings-mainstream.parquet"), ("nicchia", "ratings-nicchia.parquet")):
    d = pd.read_parquet(ML / f, columns=["userId", "movieId"])
    d = d[d["movieId"].map(lambda m: int(m) in mid2tmdb)]
    mids = np.array(sorted(d["movieId"].unique()))
    pos = {int(m): i for i, m in enumerate(mids)}
    d = d.assign(i=d["movieId"].map(pos).astype("int32"))
    X = csr_matrix((np.ones(len(d), np.float32), (d["userId"].to_numpy("int32"), d["i"].to_numpy("int32"))),
                   shape=(int(d["userId"].max()) + 1, len(mids)))
    X.sum_duplicates(); X.data[:] = 1.0
    c_i = np.asarray(X.sum(0)).ravel()
    keep = np.flatnonzero(c_i >= MIN_A)
    XK = X[:, keep].tocsr(); cK = c_i[keep]; N = float(XK.nnz)
    C = (XK.T @ XK).tocsr(); C.setdiag(0); C.eliminate_zeros()
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
    C = csr_matrix((np.asarray(kv, np.float32), (kr, kc)), shape=C.shape); C.eliminate_zeros()
    coo = C.tocoo()
    val = np.maximum(np.log((coo.data * N) / (cK[coo.row] * cK[coo.col])), 0.0)
    P = csr_matrix((val, (coo.row, coo.col)), shape=C.shape); P.eliminate_zeros()
    U, S, Vt = svds(P, k=DIM)
    Z = Vt.T / (np.linalg.norm(Vt.T, axis=1, keepdims=True) + 1e-9)
    Z = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
    tmdb = np.array([int(mid2tmdb[int(m)]) for m in mids[keep]])
    spaces[nome] = dict(Z=Z, tmdb=tmdb)
    log(f"  teacher {nome:<11}: {len(mids):,} film nel dataset · {len(keep):,} con teacher · {Z.shape} · archi {C.nnz:,}")

# quanto i due spazi sono diversi?
com = set(spaces["mainstream"]["tmdb"].tolist()) & set(spaces["nicchia"]["tmdb"].tolist())
log(f"\nfilm in comune fra i due teacher: {len(com):,}")
if len(com) > 100:
    ia = {int(t): i for i, t in enumerate(spaces["mainstream"]["tmdb"])}
    ib = {int(t): i for i, t in enumerate(spaces["nicchia"]["tmdb"])}
    common = sorted(com)
    A = spaces["mainstream"]["Z"][[ia[t] for t in common]]
    B = spaces["nicchia"]["Z"][[ib[t] for t in common]]
    # similarita' interna dei due spazi sugli stessi film
    sa = A @ A.T; sb = B @ B.T
    iu = np.triu_indices(len(common), 1)
    rho = spearmanr(sa[iu], sb[iu]).correlation
    log(f"correlazione fra le due matrici di similarita' sugli stessi film: rho = {rho:+.3f}")

# ---------------------------------------------------------------- valutazione
def valuta(nome, pool="proprio"):
    sp = spaces[nome]
    row_of = {int(t): i for i, t in enumerate(sp["tmdb"])}
    Z = sp["Z"]
    if pool == "comune":
        sel = [int(t) for t in sp["tmdb"] if int(t) in com]
        row_of = {t: i for i, t in enumerate(sel)}
        Z = sp["Z"][[i for i, t in enumerate(sp["tmdb"]) if int(t) in com]]
    tot = {w: 0 for w in W_K}; hit = {w: 0 for w in W_K}
    byt = {}; ff10 = ff_tot = 0
    for s in srcs:
        r = row_of.get(s["i"])
        if r is None:
            continue
        sims = Z @ Z[r]
        sims[r] = -9
        order = np.argsort(-sims)
        rank = {int(x): k for k, x in enumerate(order)}
        for j, t, w in s["links"]:
            jj = row_of.get(j)
            if jj is None:
                continue
            tot[w] += 1; hit[w] += rank[jj] < W_K[w]
            byt.setdefault(t, [0, 0]); byt[t][0] += rank[jj] < W_K[w]; byt[t][1] += 1
        for j in s["ffs"]:
            jj = row_of.get(j)
            if jj is None:
                continue
            ff_tot += 1; ff10 += rank[jj] < 10
    c3 = hit[3] / max(1, tot[3]); c2 = hit[2] / max(1, tot[2])
    f10 = ff10 / max(1, ff_tot)
    log(f"  {nome:<12} (pool {pool:<7}) p3@10 {100*c3:5.1f}% ({hit[3]}/{tot[3]}) · p2@20 {100*c2:5.1f}% · falsi {100*f10:4.0f}% · PUNTEGGIO {100*(c3+c2-f10):5.1f}")
    return byt, dict(c3=c3, c2=c2, f10=f10, score=c3+c2-f10)


log("")
log("=== I DUE TEACHER SUL METRO CURATO ===")
b_own = {}
for nome in ("mainstream", "nicchia"):
    b_own[nome], _ = valuta(nome, "proprio")
log("")
log("=== CONFRONTO A PARITA' DI POOL (solo i film in comune) ===")
b_com = {}
for nome in ("mainstream", "nicchia"):
    b_com[nome], _ = valuta(nome, "comune")
log("")
log("=== PER TIPO (pool proprio) — e' qui che si vede la specializzazione ===")
tipi = sorted(set(t for b in b_own.values() for t in b), key=lambda x: -max(b_own["mainstream"].get(x, [0, 0])[1], b_own["nicchia"].get(x, [0, 0])[1]))
log("| tipo | n | teacher MAINSTREAM | teacher NICCHIA | vince |")
log("|---|---|---|---|---|")
for t in tipi:
    a = b_own["mainstream"].get(t, [0, 0]); b = b_own["nicchia"].get(t, [0, 0])
    ra = a[0] / max(1, a[1]); rb = b[0] / max(1, b[1])
    vinc = "mainstream" if ra > rb else ("nicchia" if rb > ra else "pari")
    log(f"| {t} | {max(a[1], b[1])} | {100*ra:.0f}% ({a[0]}/{a[1]}) | {100*rb:.0f}% ({b[0]}/{b[1]}) | **{vinc}** |")
