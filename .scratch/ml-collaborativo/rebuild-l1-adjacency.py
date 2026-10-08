"""
.scratch/ml-collaborativo/rebuild-l1-adjacency.py

RICOSTRUISCE `L1_adjacency` — la chiave che il codice legge e il JSON di produzione non ha.

Regola del builder (build_graph.py:275-298), riprodotta:
  1. si parte da una matrice di similarita' fra keyword (il builder usa la PPMI fusa);
  2. si accumulano gli archi in archi fra MICRO-CLUSTER L1 (solo se i cluster differiscono);
  3. top-50 vicini per cluster, arrotondati a 4 decimali.

Qui la PPMI si ricalcola dai dati con la definizione classica (co-occorrenza di keyword negli
stessi titoli). Namespace-safe per costruzione: il vocabolario nasce da `kw_to_L1` del grafo
stesso, quindi ogni nome che entra e' un nome che il grafo conosce. (E' la classe di bug che
ci e' costata mezza giornata: due namespace che collidono per caso.)

Output: .cache/movielens/l1-adjacency.json  ->  { "c_0": {"c_12": 0.9123, ...}, ... }

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/rebuild-l1-adjacency.py
"""
import json
import pathlib
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
from scipy import sparse

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
GRAPH = ROOT / "src" / "data" / "hierarchical_graph.json"
OUT = ROOT / ".cache" / "movielens" / "l1-adjacency.json"
TOP_K = 50

def log(m): print(m, flush=True)

# ---------------------------------------------------------------- 1. il grafo e i suoi nomi
g = json.loads(GRAPH.read_text(encoding="utf-8"))
kw_to_l1 = g["kw_to_L1"]                                    # nome -> c_N
l1_medoid = {k: (v.get("medoid") or "") for k, v in g["L1"].items()}
log(f"grafo: {len(kw_to_l1):,} keyword -> {len(g['L1']):,} micro-cluster L1")

# ---------------------------------------------------------------- 2. le keyword di ogni titolo
def kw_names(raw):
    if not isinstance(raw, str) or not raw:
        return []
    try:
        v = json.loads(raw)
    except Exception:
        return []
    out = []
    for k in v if isinstance(v, list) else []:
        if isinstance(k, dict):
            n = str(k.get("name", "")).strip().lower()
            if n:
                out.append(n)
    return out

docs = []
for f in ("movies.parquet", "tv.parquet"):
    d = pd.read_parquet(PQ / f, columns=["id", "keywords"])
    docs.extend(kw_names(s) for s in d["keywords"])
log(f"titoli nel catalogo: {len(docs):,}")

# solo le keyword che il grafo conosce, senza duplicati nel titolo
vocab = {n: i for i, n in enumerate(kw_to_l1)}
items = []
for names in docs:
    idx = {vocab[n] for n in set(names) if n in vocab}
    if len(idx) > 1:
        items.append(sorted(idx))
log(f"titoli con >=2 keyword note al grafo: {len(items):,}  ·  keyword usate: {len({k for it in items for k in it}):,}")

# ---------------------------------------------------------------- 3. co-occorrenza e PPMI
rows, cols = [], []
for it in items:
    for a in range(len(it)):
        for b in range(a + 1, len(it)):
            rows.append(it[a]); cols.append(it[b])
V = len(vocab)
C = sparse.csr_matrix((np.ones(len(rows), dtype=np.float32), (rows, cols)), shape=(V, V))
C = C + C.T                                                 # matrice simmetrica delle co-occorrenze
c_i = np.asarray(C.sum(axis=1)).ravel()                     # quanti titoli contengono la keyword
N = float(len(items))
ii, jj = C.nonzero()
cij = np.asarray(C[ii, jj]).ravel()
ppmi = np.log((cij * N) / (c_i[ii] * c_i[jj]))
keep = (ppmi > 0) & (ii < jj)                               # triangolo superiore, PPMI positivo
ii, jj, ppmi = ii[keep], jj[keep], ppmi[keep]
log(f"coppie di keyword con PPMI>0: {len(ii):,}  (su {V*(V-1)//2:,} possibili)")

# ---------------------------------------------------------------- 4. dagli archi keyword agli archi L1
l1_of = np.array([int(kw_to_l1[n][2:]) for n in kw_to_l1])   # 'c_N' -> N, nell'ordine del vocabolario
cl_i, cl_j = l1_of[ii], l1_of[jj]
same = cl_i == cl_j
log(f"coppie intra-cluster (scartate, come fa il builder): {int(same.sum()):,} · fra cluster: {int((~same).sum()):,}")

acc = defaultdict(float)
for a, b, w in zip(cl_i[~same], cl_j[~same], ppmi[~same]):
    acc[(a, b) if a < b else (b, a)] += float(w)
log(f"archi fra micro-cluster: {len(acc):,}")

# ---------------------------------------------------------------- 5. top-50 per cluster
adj = defaultdict(dict)
for (a, b), w in acc.items():
    adj[a][f"c_{b}"] = w
    adj[b][f"c_{a}"] = w
final = {}
for c, nb in adj.items():
    top = sorted(nb.items(), key=lambda x: x[1], reverse=True)[:TOP_K]
    final[f"c_{c}"] = {k: round(v, 4) for k, v in top}

deg = np.array([len(v) for v in final.values()])
allw = np.array([w for v in final.values() for w in v.values()])
log(f"\ncluster con almeno un vicino: {len(final):,} su {len(g['L1']):,} ({100*len(final)/len(g['L1']):.0f}%)")
log(f"grado: mediana {int(np.median(deg))} · p90 {int(np.percentile(deg, 90))} · max {deg.max()} (cap {TOP_K})")
log(f"peso degli archi: mediana {np.median(allw):.3f} · p90 {np.percentile(allw, 90):.3f} · max {allw.max():.3f}")

# ---------------------------------------------------------------- 6. sanita': i vicini hanno senso?
log("\n=== sanita': i 5 vicini piu' forti di alcuni micro-cluster ===")
sample = [c for c in ["c_0", "c_1", "c_2"] if c in final]
for c in sample:
    nb = list(final[c].items())[:5]
    log(f"  {c} ({l1_medoid.get(c,'?')}) -> " + " · ".join(f"{n} {l1_medoid.get(n,'?')} ({w:.2f})" for n, w in nb))

# controllo del banale: quanto vale il grado in funzione della DIMENSIONE del cluster?
sizes = np.array([len(g["L1"][f"c_{c}"].get("keywords", [])) for c in range(len(g["L1"]))])
if len(final):
    idx = [int(c[2:]) for c in final]
    r = np.corrcoef(sizes[idx], deg)[0, 1]
    log(f"\n  correlazione fra dimensione del cluster e grado: {r:.3f}  <- se alta, l'adiacenza e' pilotata dalla dimensione")
    log(f"  (e' l'effetto che il builder NON corregge: somma i PPMI, quindi i cluster grandi accumulano piu' peso)")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(final), encoding="utf-8")
log(f"\nscritto {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")
