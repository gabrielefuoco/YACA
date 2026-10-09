"""
temi-scores.py — I TEMI COME COMPONENTE DELLA FUSIONE (non come sostituto).
Calcola, per ogni sorgente del set curato, la similarità a TUTTI i titoli dello spazio, con due
varianti del segnale a temi:
  bag  = sacco di macro-temi L1, overlap pesato con IDF (il migliore da solo: 11,3%)
  cen  = centroidi dei temi L1 nello spazio del teacher, aggregazione a somma
Salva le due matrici perche' la fusione le usi come componenti.
Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/temi-scores.py
"""
import json, pathlib, re, unicodedata, difflib
from collections import Counter, defaultdict
import numpy as np, pandas as pd
from scipy import sparse as sp

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ, ML = ROOT / ".cache" / "tmdb", ROOT / ".cache" / "movielens"


def log(m): print(m, flush=True)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(il|lo|la|i|gli|le|un|uno|una|the|a|an|of|and|der|die|das|les|el|los)\b", " ", s)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", s).split())


def yr(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0


log("=== gerarchia ===")
G = json.loads((ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
CH = {}
for nm, c in G["kw_to_L1"].items():
    t_ = (G["L1"].get(c) or {}).get("parent")
    v_ = (G["L2"].get(t_) or {}).get("parent") if t_ else None
    CH[nm] = (c, t_, v_)

# ---- catalogo ALLINEATO allo spazio (66.259): le chiavi dello spazio sono l'ordine di riferimento
z = np.load(ML / "spazi-cap0.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys_space = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of_space = {k: i for i, k in enumerate(keys_space)}
n = len(keys_space)
Pc2 = Pc.astype(np.float64).copy()
is_tv = (tipo == "tv")
Pc2[~is_tv] -= Pc[~is_tv].mean(0); Pc2[is_tv] -= Pc[is_tv].mean(0)
Pc2 /= (np.linalg.norm(Pc2, axis=1, keepdims=True) + 1e-9)
log(f"  spazio di riferimento: {n:,} titoli")

mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "title_en", "keywords", "release_date"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "name_en", "keywords", "first_air_date"])
temi = {}     # key -> Counter dei temi L1
NORM = {}
for typ, rows in (("movie", mv), ("tv", tv)):
    tn, ten, dn = ("title", "title_en", "release_date") if typ == "movie" else ("name", "name_en", "first_air_date")
    for i, t, te, dt, kw in zip(rows["id"], rows[tn], rows[ten], rows[dn], rows["keywords"]):
        k = f"{typ}:{int(i)}"
        for s in (norm(t), norm(te or "")):
            if s:
                NORM.setdefault((s, yr(dt)), k)
        try:
            ks = [str(x.get("name", "")).strip().lower() for x in json.loads(kw or "[]") if isinstance(x, dict)]
        except Exception:
            ks = []
        c = Counter()
        for x in ks:
            ch = CH.get(x)
            if ch and ch[0]:
                c[ch[0]] += 1
        temi[k] = c
byf = {}
for (s, y), k in NORM.items():
    byf.setdefault(s.split()[0], []).append((s, y, k))


def find(title, year):
    nn = norm(title)
    for dy in (0, 1, -1, 2, -2, 3, -3):
        if (nn, year + dy) in NORM:
            return NORM[(nn, year + dy)]
    best, bs = None, 0.0
    for s, y, k in byf.get(nn.split()[0], []):
        r = difflib.SequenceMatcher(None, nn, s).ratio()
        if r > bs:
            bs, best = r, k
    return best if bs >= 0.82 else None


# ---- temi: vocabolario, IDF, centroidi
cnt = Counter()
for k in keys_space:
    for t in temi.get(k, {}):
        cnt[t] += 1
tid = {t: i for i, (t, _) in enumerate(cnt.most_common()) if _ >= 3}
log(f"  temi L1 usati: {len(tid):,} (mediana film per tema {int(np.median(list(cnt.values()))):,})")
acc = defaultdict(lambda: np.zeros(Pc2.shape[1]))
for k, r in row_of_space.items():
    for t in temi.get(k, {}):
        if t in tid:
            acc[t] += Pc2[r]
T = np.zeros((len(tid), Pc2.shape[1]))
for t, j in tid.items():
    v = acc[t]
    T[j] = v / (np.linalg.norm(v) + 1e-9)
idf = np.array([np.log(n / (cnt[t] + 1.0)) for t in tid], np.float64)
# sacco: matrice sparsa titoli x temi pesata con IDF
rr, cc, vv = [], [], []
for k, r in row_of_space.items():
    for t, w in temi.get(k, {}).items():
        if t in tid:
            rr.append(r); cc.append(tid[t]); vv.append(float(idf[tid[t]]) * (1.0 + np.log(w)))
M = sp.csr_matrix((vv, (rr, cc)), shape=(n, len(tid)))
M = (sp.diags(1.0 / (np.sqrt(np.asarray(M.multiply(M).sum(1)).ravel()) + 1e-9)) @ M).tocsr()
log(f"  sacco di temi: {M.nnz:,} valori")

# ---- gold
gold = {"sources": []}
for f in ("link-manuali.json", "link-manuali-2.json", "link-manuali-3.json"):
    p = ROOT / ".scratch" / "ml-collaborativo" / "gold" / f
    if p.exists():
        gold["sources"] += json.loads(p.read_text(encoding="utf-8"))["sources"]
srcs = []
for s in gold["sources"]:
    i = find(s["source"]["title"], s["source"]["year"])
    if i is None or i not in row_of_space:
        continue
    srcs.append(i)
log(f"  sorgenti agganciate: {len(srcs)}")

# matrice dei temi per titolo (per l'aggregazione a somma sui temi del candidato)
K = 20
A = np.full((n, K), -1, np.int32)
for k, r in row_of_space.items():
    th = [tid[t] for t in temi.get(k, {}) if t in tid][:K]
    for j, t in enumerate(th):
        A[r, j] = t
Ac = np.where(A < 0, 0, A)
Wc = idf[Ac] * (A >= 0)
bag = np.zeros((len(srcs), n), np.float32)
cen = np.zeros((len(srcs), n), np.float32)
for a, k in enumerate(srcs):
    r = row_of_space[k]
    bag[a] = np.asarray((M @ M[r].T).todense()).ravel()
    th = [tid[t] for t in temi.get(k, {}) if t in tid]
    if th:
        acc_c = np.zeros(n)
        for t in th:                                  # per ogni tema della sorgente
            S = T @ T[t]                              # similarita' con TUTTI i temi
            acc_c += (S[Ac] * Wc).sum(1)              # SOMMA sui temi del candidato, pesata
        cen[a] = acc_c
    bag[a, r] = -9
    cen[a, r] = -9
np.savez_compressed(ML / "temi-scores.npz", bag=bag, cen=cen, keys=np.array(srcs))
log(f"  salvati temi-scores.npz · bag {bag.shape} · cen {cen.shape}")
