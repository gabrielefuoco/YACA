"""
.scratch/ml-collaborativo/tmdb-adjacency.py

LA TERZA ADIACENZA: le raccomandazioni TMDB aggregate ai micro-cluster L1.

Le raccomandazioni TMDB sono un proxy debole della co-visione (AUC 0,768 contro un controllo
appaiato, ma al 17% del massimo: report 12) — pero' coprono il 100% del catalogo, serie comprese,
dove il teacher e' cieco.

Qui si risponde a: **come sta, da sola, sul metro esterno?** E quanto e' complementare a quella
appresa da MovieLens? (la domanda dell'utente: TMDB+ML batte TMDB da solo?)

Aggregazione: stessa regola del builder — le coppie fra titoli diventano coppie fra i loro
micro-cluster. Normalizzazione per dimensione (senza, i cluster grandi dominano: e' l'errore che
l'audit appaiato ci ha insegnato a controllare).

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/tmdb-adjacency.py
"""
import json
import pathlib
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
CACHE = ROOT / ".cache" / "movielens"
GRAPH = ROOT / "src" / "data" / "hierarchical_graph.json"
OUT = CACHE / "l1-adjacency-tmdb.json"
TOP_K = 50
SEED = 20261008

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)

def auc(x, y):
    x = np.sort(x)
    lt = np.searchsorted(x, y, side="left").sum(); le = np.searchsorted(x, y, side="right").sum()
    return float((len(x) * len(y) - le + 0.5 * (le - lt)) / (len(x) * len(y)))

g = json.loads(GRAPH.read_text(encoding="utf-8"))
kw_to_l1 = g["kw_to_L1"]
cluster_ids = sorted(int(c[2:]) for c in g["L1"])
cpos = {c: i for i, c in enumerate(cluster_ids)}
NC = len(cluster_ids)
vocab = {n: i for i, n in enumerate(kw_to_l1)}
log(f"grafo: {len(kw_to_l1):,} keyword · {NC:,} micro-cluster")

# ---------------------------------------------------------------- titoli e cluster di ciascuno
items = {}          # (tipo, id) -> insieme di cluster
kwcache = {}
for f, t in (("movies.parquet", "movie"), ("tv.parquet", "tv")):
    d = pd.read_parquet(PQ / f, columns=["id", "keywords", "recommendations"])
    for tid, raw, recs in zip(d["id"], d["keywords"], d["recommendations"]):
        cl = set()
        if isinstance(raw, str):
            for k in json.loads(raw):
                n = str(k.get("name", "")).strip().lower() if isinstance(k, dict) else ""
                if n in vocab:
                    cl.add(cpos[int(kw_to_l1[n][2:])])
        items[(t, int(tid))] = (cl, recs if isinstance(recs, str) else None)
log(f"titoli: {len(items):,} · con almeno un cluster: {sum(1 for v in items.values() if v[0]):,}")

# ---------------------------------------------------------------- coppie TMDB -> coppie di cluster
pair = defaultdict(float)
n_pairs = 0
for (t, tid), (cl, recs) in items.items():
    if not cl or not recs:
        continue
    for r in json.loads(recs):
        other = items.get((t, int(r))) or items.get(("tv" if t == "movie" else "movie", int(r)))
        if not other or not other[0]:
            continue
        n_pairs += 1
        for a in cl:
            for b in other[0]:
                if a != b:
                    pair[(a, b) if a < b else (b, a)] += 1.0
log(f"coppie TMDB usate: {n_pairs:,} · coppie di micro-cluster: {len(pair):,}")

# ---------------------------------------------------------------- normalizzazione per dimensione
inc = np.zeros(NC)
for (a, b), w in pair.items():
    inc[a] += w; inc[b] += w
norm = {}
for (a, b), w in pair.items():
    d = np.sqrt(max(inc[a], 1) * max(inc[b], 1))
    norm[(a, b)] = w / d
log(f"peso grezzo: mediana {np.median(list(pair.values())):.1f} · normalizzato: mediana {np.median(list(norm.values())):.5f}")
rho_size = spearmanr([inc[a] + inc[b] for (a, b) in pair], list(norm.values())).statistic
log(f"correlazione fra incidenza dei cluster e peso normalizzato: {rho_size:+.3f}")

# ---------------------------------------------------------------- top-50 per cluster e audit
adj = defaultdict(dict)
for (a, b), w in norm.items():
    adj[a][b] = w; adj[b][a] = w
final = {c: dict(sorted(nb.items(), key=lambda x: -x[1])[:TOP_K]) for c, nb in adj.items()}
log(f"cluster con almeno un vicino TMDB: {len(final):,} su {NC:,}")

# teacher (film) per l'audit
z = np.load(CACHE / "teacher-Z-heldout.npz"); Z, mids = z["Z"], z["mids"]
row_of = {int(m): i for i, m in enumerate(mids)}
links = pd.read_csv(CACHE / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
mid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
per_cluster = [[] for _ in range(NC)]
for (t, tid), (cl, _) in items.items():
    if t != "movie":
        continue
    m = mid_by_tmdb.get(tid)
    r = row_of.get(m) if m is not None else None
    if r is None:
        continue
    for c in cl:
        per_cluster[c].append(r)
cent = np.full((NC, Z.shape[1]), np.nan, dtype=np.float32)
size = np.array([len(x) for x in per_cluster])
for c in range(NC):
    if size[c] >= 10:
        v = Z[per_cluster[c]].mean(axis=0); cent[c] = v / (np.linalg.norm(v) + 1e-9)
ok = ~np.isnan(cent[:, 0])
log(f"cluster con teacher: {int(ok.sum()):,} · mediana film {int(np.median(size[size>0]))}")

edges = [(a, b) for c, nb in final.items() for b in nb if ok[c] and ok[b] and c != b]
cos_e = np.array([float(cent[a] @ cent[b]) for a, b in edges])
good = np.where(ok)[0]
# controllo appaiato per TAGLIA (come audit-matched.py)
q = np.quantile([np.log1p(size[a]) + np.log1p(size[b]) for a, b in edges], [0.25, 0.5, 0.75])
quart = lambda a, b: int(np.searchsorted(q, np.log1p(size[a]) + np.log1p(size[b]), side="right"))
byq = defaultdict(list)
for a, b in edges:
    byq[quart(a, b)].append((a, b))
aucs = []
for k, lst in sorted(byq.items()):
    rand = set()
    while len(rand) < 40000:
        a, b = rng.choice(good), rng.choice(good)
        if a != b and quart(int(a), int(b)) == k:
            rand.add((min(int(a), int(b)), max(int(a), int(b))))
    cos_r = np.array([float(cent[a] @ cent[b]) for a, b in rand])
    a_ = auc(np.array([float(cent[a] @ cent[b]) for a, b in lst]), cos_r)
    aucs.append(a_)
    log(f"  quartile taglia Q{k+1}: {len(lst):>6,} archi · vicinanza media {np.mean([float(cent[a] @ cent[b]) for a, b in lst]):+.3f} · AUC {a_:.3f}")
log(f"\n=== L'ADIACENZA TMDB, A PARITA' DI TAGLIA: AUC {np.mean(aucs):.3f} ===")
log("    (confronto: PPMI 0,631 · appresa da MovieLens 0,699)")

# complementarita' con quella appresa
learned = json.loads((CACHE / "l1-adjacency-learned.json").read_text())
set_t = {(min(cpos[int(a[2:])], cpos[int(b[2:])]), max(cpos[int(a[2:])], cpos[int(b[2:])])) for a, nb in final.items() for b in nb}
set_l = {(min(cpos[int(a[2:])], cpos[int(b[2:])]), max(cpos[int(a[2:])], cpos[int(b[2:])])) for a, nb in learned.items() for b in nb}
log(f"\n  coppie TMDB: {len(set_t):,} · apprese: {len(set_l):,} · in comune: {len(set_t & set_l):,} ({100*len(set_t & set_l)/max(1,len(set_t)):.0f}% delle TMDB)")

OUT.write_text(json.dumps({f"c_{cluster_ids[c]}": {f"c_{cluster_ids[b]}": round(w, 6) for b, w in nb.items()} for c, nb in final.items()}))
log(f"scritto {OUT.name} ({(OUT).stat().st_size/1e6:.1f} MB)")
