"""
.scratch/ml-collaborativo/export-testset-candidates.py

Esporta i candidati del grafo per i 400 trial del TEST SET CONGELATO, usando il grafo costruito
SENZA gli utenti di valutazione (film-graph-heldout.npz). Stessa logica del banco precedente:
semi -> 1 hop, 2 hop, cluster (e i cluster dei vicini), perche' il confronto fra i due banchi
deve cambiare solo le persone, non il metodo.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/export-testset-candidates.py
"""
import json
import pathlib

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "movielens"

def log(m): print(m, flush=True)

g = np.load(CACHE / "film-graph-heldout.npz", allow_pickle=True)
member, ids, types, edges = g["member"], g["ids"], g["types"], g["edges"]
row_of = {f"{str(t)}:{int(i)}": k for k, (t, i) in enumerate(zip(types, ids))}
NEIGH = [set() for _ in range(len(member))]
for a, b in edges:
    NEIGH[int(a)].add(int(b)); NEIGH[int(b)].add(int(a))
cl_members = {}
for node, cl in enumerate(member.tolist()):
    cl_members.setdefault(int(cl), []).append(node)
log(f"grafo held-out: {len(member):,} nodi · {len(edges):,} archi · {len(cl_members):,} cluster")

ts = json.loads((CACHE / "testset.json").read_text())
stratum = {u["user"]: u["strato"] for u in ts["users"]}
out, skipped = [], 0
for t in ts["trials"]:
    seeds = [k for k in t["seeds"] if k in row_of]
    gold = [k for k in t["gold"] if k in row_of]
    if len(seeds) < 2 or len(gold) < 5:
        skipped += 1
        continue
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
    out.append({"ctx": t["ctx"], "user": t["user"], "strato": stratum.get(t["user"], "?"),
                "seeds": seeds, "gold": gold,
                "onehop": to_keys(one), "twohop": to_keys(two), "cluster": to_keys(clus)})
log(f"trial esportati: {len(out):,} · scartati (semi/verita' insufficienti nel grafo): {skipped}")
for st in ("fondo", "resto"):
    sub = [t for t in out if t["strato"] == st]
    if sub:
        log(f"  strato {st}: {len(sub)} trial · mediana verita' {int(np.median([len(t['gold']) for t in sub]))} "
            f"· candidati 1hop {int(np.median([len(t['onehop']) for t in sub]))} · 2hop {int(np.median([len(t['twohop']) for t in sub]))}")
(CACHE / "graph-candidates-testset.json").write_text(json.dumps(out))
log(f"scritto graph-candidates-testset.json ({(CACHE / 'graph-candidates-testset.json').stat().st_size/1e6:.1f} MB)")
