"""
.scratch/ml-collaborativo/audit-matched.py

IL CONTROLLO APPAIATO PER DIMENSIONE — applicato all'adiacenza appresa.

Perche': nel modello la feature "dimensione dei cluster" correla +0,252 col bersaglio, e i cluster
grandi hanno centroidi piu' "centrali" per costruzione (piu' film, media piu' stabile). Se il
vantaggio dell'adiacenza appresa viene da li', non e' gusto: e' taglia.

Metodo: si calcola per ogni arco la somma delle dimensioni dei due cluster, si divide in QUARTILI, e
si misura l'AUC DENTRO ogni quartile (arco contro coppia a caso con la stessa taglia). Se il vantaggio
sopravvive dentro i quartili, e' gusto.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/audit-matched.py
"""
import json
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
CACHE = ROOT / ".cache" / "movielens"
GRAPH = ROOT / "src" / "data" / "hierarchical_graph.json"
TEACHER = CACHE / "teacher-Z.npz"
SEED = 20261008

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)

def auc(x, y):
    x = np.sort(x)
    lt = np.searchsorted(x, y, side="left").sum(); le = np.searchsorted(x, y, side="right").sum()
    return float((len(x) * len(y) - le + 0.5 * (le - lt)) / (len(x) * len(y)))

z = np.load(TEACHER); Z, mids = z["Z"], z["mids"]
g = json.loads(GRAPH.read_text(encoding="utf-8"))
kw_to_l1 = g["kw_to_L1"]
cluster_ids = sorted(int(c[2:]) for c in g["L1"])
cpos = {c: i for i, c in enumerate(cluster_ids)}
NC = len(cluster_ids)
vocab = {n: i for i, n in enumerate(kw_to_l1)}
links = pd.read_csv(CACHE / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
mid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
trow = {int(m): i for i, m in enumerate(mids)}

mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "keywords"])
cl_films = [[] for _ in range(NC)]
for tid, raw in zip(mv["id"], mv["keywords"]):
    if not isinstance(raw, str):
        continue
    cl = set()
    for k in json.loads(raw):
        n = str(k.get("name", "")).strip().lower() if isinstance(k, dict) else ""
        if n in vocab:
            cl.add(cpos[int(kw_to_l1[n][2:])])
    r = trow.get(mid_by_tmdb.get(int(tid), -1))
    if r is not None:
        for c in cl:
            cl_films[c].append(r)

cent = np.full((NC, Z.shape[1]), np.nan, dtype=np.float32)
n_film = np.zeros(NC, dtype=int)
for c in range(NC):
    n_film[c] = len(cl_films[c])
    if len(cl_films[c]) >= 10:
        v = Z[cl_films[c]].mean(axis=0); cent[c] = v / (np.linalg.norm(v) + 1e-9)
ok = ~np.isnan(cent[:, 0])
good = np.where(ok)[0]
log(f"cluster utilizzabili: {int(ok.sum()):,} · taglia (film col teacher) mediana {int(np.median(n_film[ok]))}")

def edge_list(path):
    adj = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    out = set()
    for a, nb in adj.items():
        ca = cpos[int(a[2:])]
        for b in nb:
            cb = cpos[int(b[2:])]
            if ok[ca] and ok[cb] and ca != cb:
                out.add((min(ca, cb), max(ca, cb)))
    return sorted(out)

ppmi_e = edge_list(CACHE / "l1-adjacency.json")
learn_e = edge_list(CACHE / "l1-adjacency-learned.json")

# controllo: coppie a caso, con la stessa distribuzione di taglia di quelle con arco
sz_pairs = np.array([np.log1p(n_film[a]) + np.log1p(n_film[b]) for a, b in ppmi_e])
q = np.quantile(sz_pairs, [0.25, 0.5, 0.75])
def quartile(p):
    s = np.log1p(n_film[p[0]]) + np.log1p(n_film[p[1]])
    return 0 if s <= q[0] else (1 if s <= q[1] else (2 if s <= q[2] else 3))

rand_by_q = {k: set() for k in range(4)}
while min(len(v) for v in rand_by_q.values()) < 30000:
    a, b = rng.choice(good), rng.choice(good)
    if a == b: continue
    p = (min(int(a), int(b)), max(int(a), int(b)))
    rand_by_q[quartile(p)].add(p)
for k in rand_by_q:
    rand_by_q[k] = sorted(rand_by_q[k])

cos = lambda p: float(cent[p[0]] @ cent[p[1]])
log("\n=== L'AUDIT APPAIATO PER TAGLIA (questo e' il verdetto) ===")
log(f"  {'quartile di taglia':<24}{'coppie':>9}{'AUC PPMI':>11}{'AUC APPRESA':>13}{'vicinanza PPMI':>17}{'vicinanza appresa':>19}")
w = [0.25] * 4
for k in range(4):
    cp = np.array([cos(p) for p in ppmi_e if quartile(p) == k])
    cl = np.array([cos(p) for p in learn_e if quartile(p) == k])
    cr = np.array([cos(p) for p in rand_by_q[k]])
    log(f"  {'Q' + str(k + 1):<24}{len(cp):>9,}{auc(cp, cr):>11.3f}{auc(cl, cr):>13.3f}{cp.mean():>+17.3f}{cl.mean():>+19.3f}")
log(f"  {'(a caso, media)':<24}{'':>9}{'':>11}{'':>13}{np.mean([np.mean([cos(p) for p in rand_by_q[k]]) for k in range(4)]):>+17.3f}")
log(f"\n  capacita' discriminante a parita' di taglia: PPMI {np.mean([auc(np.array([cos(p) for p in ppmi_e if quartile(p)==k]), np.array([cos(p) for p in rand_by_q[k]])) for k in range(4)]):.3f}"
    f"  ·  APPRESA {np.mean([auc(np.array([cos(p) for p in learn_e if quartile(p)==k]), np.array([cos(p) for p in rand_by_q[k]])) for k in range(4)]):.3f}")
