"""
.scratch/ml-collaborativo/analyze-candidate-gap.py

DOV'E' FINITO IL 77% DELLA VERITA'.

L'universo di candidati (pool di produzione + 2 hop del grafo) contiene solo il 22,8% dei titoli che
gli utenti guardano dopo. Questo script dice DOVE sono gli altri, per capire se si possono recuperare
e a che prezzo.

Classificazione di ogni titolo della verita' (rispetto ai semi del profilo):
  nel grafo?            -> se no, il grafo non potra' mai proporlo
  distanza nel grafo    -> 1, 2, 3, 4, oltre (BFS sui vicini)
  nel pool proxy?       -> i 18k titoli piu' popolari: se non c'e', il pool non puo' vederlo
  nel cluster?          -> condivide un cluster con un titolo visto (segnale piu' grossolano)
  popolarita' e anno    -> sono titoli di nicchia? recenti?

Poi il conto che conta: quanta verita' si recupera allargando i candidati, e quanto cresce il costo.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/analyze-candidate-gap.py
"""
import glob
import json
import pathlib

import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "movielens"
PQ = ROOT / ".cache" / "tmdb"
N_TRIALS = 60          # campione (30 fondo + 30 resto): statistica su ~2.000 titoli mancanti
MAX_HOPS = 5

g = np.load(CACHE / "film-graph-idf05.npz", allow_pickle=True)
ids, types, edges, member = g["ids"], g["types"], g["edges"], g["member"]
n = len(ids)
keys = np.array([f"{t}:{int(i)}" for t, i in zip(types, ids)])
row_of = {k: i for i, k in enumerate(keys)}
print(f"grafo: {n:,} nodi · {len(edges):,} archi · cluster: {len(set(member.tolist())):,}")
A = coo_matrix((np.ones(len(edges)), (edges[:, 0].astype(int), edges[:, 1].astype(int))), shape=(n, n)).tocsr()
A = ((A + A.T) > 0).astype(np.float64)          # non orientato, binario
print(f"matrice di adiacenza: {A.nnz:,} collegamenti")

# pool proxy = i piu' popolari del catalogo (lo stesso perimetro del banco)
pop = pd.read_parquet(PQ / "movies.parquet", columns=["id", "vote_count", "popularity", "release_date"])
popt = pd.read_parquet(PQ / "tv.parquet", columns=["id", "vote_count", "popularity", "first_air_date"])
proxy = set(f"movie:{int(i)}" for i in pop.nlargest(12000, "popularity")["id"]) | \
        set(f"tv:{int(i)}" for i in popt.nlargest(6000, "popularity")["id"])
popmap = {}
def yr(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0
for i, v, d in zip(pop["id"], pop["vote_count"], pop["release_date"]):
    popmap[f"movie:{int(i)}"] = (float(v or 0), yr(d))
for i, v, d in zip(popt["id"], popt["vote_count"], popt["first_air_date"]):
    popmap[f"tv:{int(i)}"] = (float(v or 0), yr(d))
print(f"pool proxy: {len(proxy):,} titoli")

# l'universo reale = le righe gia' esportate (pool vero + 2 hop), una riga per candidato
univ = {}
for f in sorted(glob.glob(str(CACHE / "ranker-*.ndjson"))):
    with open(f, encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                r = json.loads(line)
                univ.setdefault(r["c"], set()).add(r["k"])
print(f"universo ricostruito: {len(univ):,} account · {sum(len(v) for v in univ.values()):,} righe")

trials = json.loads((CACHE / "graph-candidates-synth.json").read_text())
rng = np.random.default_rng(20261008)
sel = []
for st in ("fondo", "resto"):
    sub = [t for t in trials if t["strato"] == st]
    sel += [sub[i] for i in rng.permutation(len(sub))[: N_TRIALS // 2]]
print(f"trial analizzati: {len(sel)}")

cls = {}
pop_found, pop_missing, yr_found, yr_missing = [], [], [], []
size_3hop, size_4hop = [], []
n_gold = 0
for t in sel:
    ctx = t["ctx"]
    U = univ.get(ctx, set())
    seeds = [row_of[k] for k in t["seeds"] if k in row_of]
    gold = [k for k in t["gold"] if k in row_of]
    if not seeds or not gold:
        continue
    n_gold += len(gold)
    # BFS per livelli dai semi
    seen = np.zeros(n, dtype=bool)
    seen[seeds] = True
    frontier = np.zeros(n, dtype=np.float64)
    frontier[seeds] = 1.0
    dist = {}
    for h in range(1, MAX_HOPS + 1):
        frontier = A @ frontier
        frontier[seen] = 0
        hit = np.flatnonzero(frontier > 0)
        if h == 3:
            size_3hop.append(len(hit) + int(seen.sum()))
        if h == 4:
            size_4hop.append(len(hit) + int(seen.sum()))
        for r in hit:
            dist[r] = h
        seen[hit] = True
    cl_seeds = {int(member[r]) for r in seeds}
    for k in gold:
        r = row_of[k]
        p, y = popmap.get(k, (0.0, 0))
        inU = k in U
        if inU:
            pop_found.append(p); yr_found.append(y)
            cls["nell'universo"] = cls.get("nell'universo", 0) + 1
        else:
            pop_missing.append(p); yr_missing.append(y)
            d = dist.get(r)
            if d is None:
                c = "fuori dal grafo (irraggiungibile)"
            elif d <= 2:
                c = f"distanza {d} (dovrebbe esserci!)"
            else:
                c = f"distanza {d}" if d < MAX_HOPS else f"oltre {MAX_HOPS - 1}"
            if k in proxy:
                c += " · nel pool (filtrato)"
            else:
                c += " · fuori dal pool"
            if int(member[r]) in cl_seeds:
                c += " · stesso cluster"
            cls[c] = cls.get(c, 0) + 1

print(f"\n=== DOVE STA LA VERITA' ({n_gold:,} titoli in {len(sel)} account) ===")
for c, v in sorted(cls.items(), key=lambda x: -x[1]):
    print(f"  {100*v/n_gold:5.1f}%  {v:6,}  {c}")
print(f"\npopolarita' mediana: trovati {int(np.median(pop_found)):,} voti · mancanti {int(np.median(pop_missing)):,} voti")
print(f"anno mediano:        trovati {int(np.median(yr_found))} · mancanti {int(np.median(yr_missing))}")
print(f"candidati per profilo: 2 hop ~{int(np.median([len(t['twohop']) for t in sel])):,} · "
      f"3 hop ~{int(np.median(size_3hop)):,} · 4 hop ~{int(np.median(size_4hop)):,} · grafo intero {n:,}")
