"""Esporta i candidati del grafo per il test a parità di budget (il ranking lo fa Node)."""
import json, pathlib
import numpy as np, pandas as pd
from collections import Counter
ROOT = pathlib.Path(__file__).resolve().parents[2]
g = np.load(ROOT / ".cache/movielens/film-graph.npz", allow_pickle=True)
member, ids, types, edges = g["member"], g["ids"], g["types"], g["edges"]
row_of = {(str(t), int(i)): k for k, (t, i) in enumerate(zip(types, ids))}
NEIGH = [set() for _ in range(len(member))]
for a, b in edges:
    NEIGH[int(a)].add(int(b)); NEIGH[int(b)].add(int(a))
cl_members = {}
for node, cl in enumerate(member.tolist()):
    cl_members.setdefault(cl, []).append(node)
hist = json.loads((ROOT / ".cache/movielens/histories.json").read_text())
rng = np.random.default_rng(20261008)
K, DRAWS = 30, 15   # 30 semi: un profilo con massa, non 3 titoli
trials = []
for ctx, by in hist.items():
    inside = [("movie", int(x)) for x in by.get("movie", [])] + [("tv", int(x)) for x in by.get("tv", [])]
    inside = [w for w in inside if w in row_of]
    log(f"  {ctx}: {len(inside)} titoli nel grafo") if "log" in dir() else print(f"  {ctx}: {len(inside)} titoli nel grafo")
    for d in range(DRAWS):
        # K ADATTIVO: la cronologia di un contesto puo' avere meno di K titoli NEL GRAFO
        # (il contesto "global" ne ha 21): senza adattare, la verita' resterebbe vuota.
        k_ctx = max(3, min(K, len(inside) - 5))
        perm = rng.permutation(len(inside))
        seeds = [inside[i] for i in perm[:k_ctx]]
        gold = [inside[i] for i in perm[k_ctx:]]
        srows = [row_of[s] for s in seeds]
        one, two, clus = set(), set(), set()
        for r in srows:
            one |= NEIGH[r]
            for nb in NEIGH[r]:
                two |= NEIGH[nb]
            clus.update(cl_members[int(member[r])])
            for nb in list(NEIGH[r])[:5]:
                clus.update(cl_members[int(member[nb])])
        to_keys = lambda nodes: [f"{types[n]}:{int(ids[n])}" for n in nodes]
        trials.append({"ctx": ctx, "seeds": [f"{t}:{i}" for t, i in seeds],
                       "gold": [f"{t}:{i}" for t, i in gold],
                       "onehop": to_keys(one), "twohop": to_keys(two), "cluster": to_keys(clus)})
out = ROOT / ".cache/movielens/graph-candidates.json"
out.write_text(json.dumps(trials))
print(f"trial: {len(trials)} · scritto {out} ({out.stat().st_size/1e6:.1f} MB)")
for name in ["onehop", "twohop", "cluster"]:
    print(f"  {name}: mediana {int(np.median([len(t[name]) for t in trials]))} candidati")
