"""
.scratch/ml-collaborativo/learn-adjacency.py

L'ADIACENZA APPRESA: il peso di ogni arco L1-L1 smette di essere "somma di PPMI" e diventa la
PREDIZIONE della vicinanza collaborativa fra i due cluster (l'audit esterno, ticket 17).

Perche': l'audit dice che i pesi di oggi ordinano la realta' per rho = +0,087 — quasi nulla — e che
gli archi a peso 0 non sono sbagliati, sono NON MISURATI (northern england <-> sheep: peso 0,
vicinanza reale +0,740).

LE DUE ACCORTEZZE CHE IL NOSTRO CATALOGO DI ERRORI IMPONE:
 1. SPLIT SUGLI ITEM. Il bersaglio e' la vicinanza fra i CENTROIDI dei cluster: se si addestra e si
    valuta sugli stessi film, si misura la memoria del modello. Qui gli item di ogni cluster sono
    divisi a meta': il bersaglio di ADDESTRAMENTO viene dalla meta' A, la VALUTAZIONE dalla meta' B.
 2. IL SOFFITTO DI RUMORE, dichiarato accanto al risultato: rho(bersaglio A, bersaglio B) dice quanta
    parte del bersaglio e' stabile fra due campioni di item. Senza, un AUC basso sembra colpa del
    modello quando puo' essere rumore del bersaglio.

Le feature sono TUTTE ricavabili dal catalogo e dal grafo (niente teacher): l'adiacenza appresa resta
una proprieta' del grafo, quindi si applica anche alle serie — che nel teacher non esistono.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/learn-adjacency.py
"""
import json
import pathlib
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.stats import spearmanr
from sklearn.linear_model import Ridge

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
CACHE = ROOT / ".cache" / "movielens"
GRAPH = ROOT / "src" / "data" / "hierarchical_graph.json"
ADJ_PPMI = CACHE / "l1-adjacency.json"
ADJ_OUT = CACHE / "l1-adjacency-learned.json"
TEACHER = CACHE / "teacher-Z.npz"
TOP_K = 50
SEED = 20261008

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)

def auc(x, y):
    """P(x > y) + 0,5·P(x == y)."""
    x = np.sort(x)
    lt = np.searchsorted(x, y, side="left").sum(); le = np.searchsorted(x, y, side="right").sum()
    return float((len(x) * len(y) - le + 0.5 * (le - lt)) / (len(x) * len(y)))

# ---------------------------------------------------------------- 1. teacher, grafo, catalogo
z = np.load(TEACHER); Z, mids = z["Z"], z["mids"]
g = json.loads(GRAPH.read_text(encoding="utf-8"))
kw_to_l1 = g["kw_to_L1"]
l1_medoid = {k: (v.get("medoid") or "") for k, v in g["L1"].items()}
is_nsfw = {int(k[2:]): bool(v.get("is_nsfw") or v.get("nsfw")) for k, v in g["L1"].items()}   # chiave INT: le altre mappe qui sono per indice cluster
cluster_ids = sorted(int(c[2:]) for c in l1_medoid)
cpos = {c: i for i, c in enumerate(cluster_ids)}
NC = len(cluster_ids)
links = pd.read_csv(CACHE / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
mid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
trow = {int(m): i for i, m in enumerate(mids)}
vocab = {n: i for i, n in enumerate(kw_to_l1)}
log(f"teacher {Z.shape[0]:,} film · grafo {len(kw_to_l1):,} keyword / {NC:,} cluster")

# ---------------------------------------------------------------- 2. item -> cluster + metadati
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "keywords", "genres", "release_date", "vote_count", "original_language"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "keywords", "genres", "first_air_date", "vote_count", "original_language"])
mv["date"] = mv["release_date"]; tv["date"] = tv["first_air_date"]
cat = pd.concat([mv[["id", "keywords", "genres", "date", "vote_count", "original_language"]],
                 tv[["id", "keywords", "genres", "date", "vote_count", "original_language"]]], ignore_index=True)

cl_films = [[] for _ in range(NC)]          # cluster -> righe del teacher (per il bersaglio)
cl_genre = [Counter() for _ in range(NC)]
cl_year = []; cl_lang = []; cl_votes = []
cl_year = [[] for _ in range(NC)]; cl_lang = [Counter() for _ in range(NC)]; cl_votes = [[] for _ in range(NC)]
for tid, raw, gen, date, vc, lang in zip(cat["id"], cat["keywords"], cat["genres"], cat["date"], cat["vote_count"], cat["original_language"]):
    if not isinstance(raw, str):
        continue
    cl = set()
    for k in json.loads(raw):
        n = str(k.get("name", "")).strip().lower() if isinstance(k, dict) else ""
        if n in vocab:
            cl.add(cpos[int(kw_to_l1[n][2:])])
    if not cl:
        continue
    y = pd.to_numeric(str(date)[:4], errors="coerce")
    for c in cl:
        cl_genre[c].update(str(x.get("id")) for x in (json.loads(gen) if isinstance(gen, str) else []) if isinstance(x, dict))
        if pd.notna(y): cl_year[c].append(float(y))
        if isinstance(lang, str): cl_lang[c][lang] += 1
        cl_votes[c].append(float(vc or 0))
    r = trow.get(mid_by_tmdb.get(int(tid), -1))
    if r is not None:
        for c in cl:
            cl_films[c].append(r)
sizes = np.array([len(g["L1"][f"c_{c}"].get("keywords", [])) for c in cluster_ids])
n_teacher = np.array([len(x) for x in cl_films])
log(f"cluster con film col teacher: {int((n_teacher>0).sum()):,} · film per cluster: mediana {int(np.median(n_teacher[n_teacher>0]))}")

# ---------------------------------------------------------------- 3. le due meta' (split sugli ITEM)
halfA = np.zeros(Z.shape[0], dtype=bool)
halfA[rng.random(Z.shape[0]) < 0.5] = True
listA = [[r for r in rows if halfA[r]] for rows in cl_films]
listB = [[r for r in rows if not halfA[r]] for rows in cl_films]
centA = np.full((NC, Z.shape[1]), np.nan, dtype=np.float32)
centB = np.full((NC, Z.shape[1]), np.nan, dtype=np.float32)
for c in range(NC):
    for rows, out in ((listA[c], centA), (listB[c], centB)):
        if len(rows) >= 10:
            v = Z[rows].mean(axis=0); out[c] = v / (np.linalg.norm(v) + 1e-9)
ok = ~np.isnan(centA[:, 0]) & ~np.isnan(centB[:, 0])
log(f"cluster utilizzabili (>=10 film in entrambe le meta'): {int(ok.sum()):,}")

# ---------------------------------------------------------------- 4. le coppie candidate
adj = json.loads(ADJ_PPMI.read_text(encoding="utf-8"))
ppmi = defaultdict(float); ppmi_cnt = defaultdict(int)
for a, nb in adj.items():
    ca = cpos[int(a[2:])]
    for b, w in nb.items():
        cb = cpos[int(b[2:])]
        ppmi[(min(ca, cb), max(ca, cb))] = w
good = np.where(ok)[0]
pairs = [p for p in ppmi if ok[p[0]] and ok[p[1]]]
log(f"coppie con arco PPMI (utilizzabili): {len(pairs):,}")
# negative: coppie a caso fra cluster utilizzabili, con la stessa distribuzione di dimensione
neg = set()
while len(neg) < 60000:
    a, b = rng.choice(good), rng.choice(good)
    if a == b: continue
    p = (min(a, b), max(a, b))
    if p in ppmi: continue
    neg.add(p)
pairs = list(pairs) + list(neg)
log(f"coppie totali (arco + negative): {len(pairs):,}")

# ---------------------------------------------------------------- 5. le feature (tutte dal catalogo/grafo)
def jac(a, b):
    if not a or not b: return 0.0
    return len(a & b) / len(a | b)
def cos_count(a, b):
    ks = set(a) | set(b)
    if not ks: return 0.0
    va = np.array([a.get(k, 0) for k in ks], dtype=np.float32); vb = np.array([b.get(k, 0) for k in ks], dtype=np.float32)
    na, nb_ = np.linalg.norm(va), np.linalg.norm(vb)
    return float(va @ vb / (na * nb_)) if na > 0 and nb_ > 0 else 0.0
tokens = {c: set(w for k in g["L1"][f"c_{c}"].get("keywords", []) for w in str(k).lower().split()) for c in cluster_ids}
dist = {c: np.mean(np.exp(-np.abs(np.arange(1980, 2026) - y) / 6.0)) if (y := (np.mean(cl_year[c]) if cl_year[c] else np.nan)) == y else 0.0 for c in cluster_ids}
pop = {c: (np.log1p(np.mean(cl_votes[c])) if cl_votes[c] else 0.0) for c in cluster_ids}
X, Ytr, Yte, meta = [], [], [], []
for (a, b) in pairs:
    ca, cb = cluster_ids[a], cluster_ids[b]
    gd = cos_count(cl_genre[a], cl_genre[b])
    langov = (sum((cl_lang[a] & cl_lang[b]).values()) / max(1, sum(cl_lang[a].values()))) if cl_lang[a] else 0.0
    X.append([ppmi.get((a, b), 0.0),                                  # il segnale di oggi, come UNA feature
              1.0 if (a, b) in ppmi or (b, a) in ppmi else 0.0,        # esiste l'arco?
              np.log1p(sizes[a]) + np.log1p(sizes[b]),                 # dimensione (controllo)
              min(sizes[a], sizes[b]) / max(sizes[a], sizes[b]),
              gd, jac(tokens[ca], tokens[cb]), abs(dist[ca] - dist[cb]),
              langov, 1.0 if is_nsfw[ca] == is_nsfw[cb] else 0.0,
              pop[ca] + pop[cb]])
    Ytr.append(float(centA[a] @ centA[b])); Yte.append(float(centB[a] @ centB[b]))
    meta.append((a, b))
X = np.array(X, dtype=np.float32); Ytr = np.array(Ytr); Yte = np.array(Yte)
FEATS = ["ppmi", "esiste_arco", "log_dimensione", "rapporto_dim", "generi_coseno", "lessico_jaccard",
         "epoca_diff", "lingua_overlap", "nsfw_stesso", "popolarita"]
log(f"matrice delle feature: {X.shape[0]:,} coppie x {X.shape[1]} feature")

# ---------------------------------------------------------------- 6. il soffitto di rumore (dichiarato PRIMA)
rho_ceiling = spearmanr(Ytr, Yte).statistic
log(f"\n=== IL SOFFITTO DI RUMORE ===")
log(f"  rho(bersaglio meta' A, bersaglio meta' B) = {rho_ceiling:+.3f}  <- quanto del bersaglio e' stabile fra due campioni di film")

# ---------------------------------------------------------------- 7. addestramento e valutazione
idx = rng.permutation(len(X)); ntest = int(0.3 * len(X))
tr, te = idx[:ntest], idx[ntest:]
model = Ridge(alpha=30.0).fit(X[tr], Ytr[tr])
pred_te = model.predict(X[te])
log(f"\n=== CORRELAZIONE DI OGNI FEATURE COL BERSAGLIO (train) ===")
for j, f in enumerate(FEATS):
    log(f"  {f:<18} {spearmanr(X[tr, j], Ytr[tr]).statistic:+.3f}   peso nel modello {model.coef_[j]:+.4f}")

log(f"\n=== IL CONFRONTO, su coppie tenute fuori (30%) e bersaglio dalla meta' B ===")
log(f"  {'':<26}{'Spearman':>10}{'AUC':>8}")
log(f"  {'PPMI (oggi)':<26}{spearmanr(X[te,0], Yte[te]).statistic:>+10.3f}"
    f"{auc(X[te,0][X[te,2]>0], X[te,0][X[te,2]<=0]) if False else 0:>8.3f}".replace("+0.000",""))
rho_ppmi = spearmanr(X[te, 0], Yte[te]).statistic
rho_learned = spearmanr(pred_te, Yte[te]).statistic
log(f"  {'PPMI (oggi)':<26}{rho_ppmi:>+10.3f}")
log(f"  {'ADIACENZA APPRESA':<26}{rho_learned:>+10.3f}")

# il cancello dell'audit: la lista dei 50 vicini per cluster, ordinata dal peso apprendido
learned = np.full((NC, NC), -np.inf, dtype=np.float32)
for i, (a, b) in enumerate(meta):
    learned[a, b] = learned[b, a] = model.predict(X[i:i+1])[0]
audit_pairs = [(a, b) for (a, b) in meta if ok[a] and ok[b]]
# PPMI: le coppie CON arco; appresa: top-50 per cluster
top_learned = set()
for c in good:
    nb = np.argsort(-learned[c])[:TOP_K]
    for b in nb:
        if b != c and ok[b]:
            top_learned.add((min(int(c), int(b)), max(int(c), int(b))))
cos_l = np.array([float(centB[a] @ centB[b]) for a, b in top_learned])
cos_p = np.array([float(centB[a] @ centB[b]) for a, b in ppmi if ok[a] and ok[b]])
rand = set()
while len(rand) < len(cos_p):
    a, b = rng.choice(good), rng.choice(good)
    if a != b: rand.add((min(int(a), int(b)), max(int(a), int(b))))
cos_r = np.array([float(centB[a] @ centB[b]) for a, b in rand])
log(f"\n=== L' AUDIT (bersaglio dalla meta' B, mai visto) ===")
log(f"  PPMI di oggi      : vicinanza media {cos_p.mean():+.3f}  ·  AUC contro caso {auc(cos_p, cos_r):.3f}")
log(f"  ADIACENZA APPRESA : vicinanza media {cos_l.mean():+.3f}  ·  AUC contro caso {auc(cos_l, cos_r):.3f}")
log(f"  (a caso: {cos_r.mean():+.3f})")
ov = len(top_learned & {(min(a,b),max(a,b)) for (a,b) in ppmi})
log(f"  quanto cambia il grafo: {ov:,} coppie in comune su {len(top_learned):,} ({100*ov/max(1,len(top_learned)):.0f}%)")

# ---------------------------------------------------------------- 8. si salva l'adiacenza appresa
out = {}
for c in good:
    nb = np.argsort(-learned[c])[:TOP_K]
    out[f"c_{cluster_ids[c]}"] = {f"c_{cluster_ids[int(b)]}": round(float(learned[c, b]), 4) for b in nb if b != c and np.isfinite(learned[c, b])}
ADJ_OUT.write_text(json.dumps(out), encoding="utf-8")
log(f"\nscritto {ADJ_OUT.name}  ({len(out):,} cluster)")
