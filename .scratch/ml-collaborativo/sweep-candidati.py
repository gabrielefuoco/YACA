"""
.scratch/ml-collaborativo/sweep-candidati.py

QUANTO CANDIDATI SERVONO. Il soffitto del 22,8% era in gran parte un artefatto: il mio export
tagliava il 2 hop a 1.200 titoli, e il 46% della verita' stava a distanza 1-2 proprio dentro il taglio.

Qui misuro il vero compromesso, senza ranker (solo Python, nessun Node):
per ogni ampiezza dell'insieme di candidati -> quanta verita' e' raggiungibile (soffitto) e quanto
prende un ordinamento BANALE (popolarita') su un insieme piu' grande.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/sweep-candidati.py
"""
import json, pathlib
import numpy as np, pandas as pd
from scipy.sparse import coo_matrix

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE, PQ = ROOT/".cache"/"movielens", ROOT/".cache"/"tmdb"
N_TRIALS, MAX_HOPS = 60, 5
g = np.load(CACHE/"film-graph-idf05.npz", allow_pickle=True)
ids, types, edges = g["ids"], g["types"], g["edges"]
n = len(ids)
keys = np.array([f"{t}:{int(i)}" for t, i in zip(types, ids)])
row_of = {k: i for i, k in enumerate(keys)}
A = coo_matrix((np.ones(len(edges)), (edges[:,0].astype(int), edges[:,1].astype(int))), shape=(n,n)).tocsr()
A = ((A+A.T) > 0).astype(np.float64)
pop = pd.read_parquet(PQ/"movies.parquet", columns=["id","vote_count","popularity"])
popt = pd.read_parquet(PQ/"tv.parquet", columns=["id","vote_count","popularity"])
proxy = {f"movie:{int(i)}" for i in pop.nlargest(12000,"popularity")["id"]} | {f"tv:{int(i)}" for i in popt.nlargest(6000,"popularity")["id"]}
popmap = {f"movie:{int(i)}": float(v or 0) for i,v in zip(pop["id"], pop["vote_count"])}
popmap.update({f"tv:{int(i)}": float(v or 0) for i,v in zip(popt["id"], popt["vote_count"])})
trials = json.loads((CACHE/"graph-candidates-synth.json").read_text())
rng = np.random.default_rng(20261008); sel=[]
for st in ("fondo","resto"):
    sub=[t for t in trials if t["strato"]==st]; sel += [sub[i] for i in rng.permutation(len(sub))[:N_TRIALS//2]]
ARM = ["pool proxy (18k)", "pool + 2 hop", "pool + 2-3 hop", "pool + grafo intero"]
rows = {a: {"cand":[], "ceil":[], "hit50":[], "hit200":[], "gold":[]} for a in ARM}
for t in sel:
    seeds=[row_of[k] for k in t["seeds"] if k in row_of]
    gold=[k for k in t["gold"] if k in row_of]
    if not seeds or not gold: continue
    dist={}
    seen=np.zeros(n,bool); seen[seeds]=True
    fr=np.zeros(n); fr[seeds]=1.0
    for h in range(1, MAX_HOPS+1):
        fr = A@fr; fr[seen]=0
        hit=np.flatnonzero(fr>0)
        for r in hit: dist[r]=h
        seen[hit]=True
    inproxy=np.zeros(n,bool)
    for k in proxy:
        r=row_of.get(k)
        if r is not None: inproxy[r]=True
    sets = {
        "pool proxy (18k)": inproxy,
        "pool + 2 hop": inproxy | np.isin(np.arange(n), [r for r,d in dist.items() if d<=2]) | np.isin(np.arange(n), seeds),
        "pool + 2-3 hop": inproxy | np.isin(np.arange(n), [r for r,d in dist.items() if d<=3]) | np.isin(np.arange(n), seeds),
        "pool + grafo intero": np.ones(n,bool),
    }
    for a, mask in sets.items():
        cand=[k for k in keys[mask] if k not in set(t["seeds"])]
        if not cand: continue
        popo=sorted(cand, key=lambda k:(-popmap.get(k,0.0), k))
        gset=set(gold)
        rows[a]["cand"].append(len(cand)); rows[a]["gold"].append(len(gold))
        rows[a]["ceil"].append(sum(1 for k in gold if mask[row_of[k]])/len(gold))
        rows[a]["hit50"].append(sum(1 for k in popo[:50] if k in gset)/len(gold))
        rows[a]["hit200"].append(sum(1 for k in popo[:200] if k in gset)/len(gold))
print(f"trial: {len(rows[ARM[0]]['cand'])} · verita' mediana {int(np.median(rows[ARM[0]]['gold']))} titoli")
print("\n| insieme di candidati | candidati (mediana) | verita' raggiungibile (soffitto) | popolarita' @50 | popolarita' @200 | @50 in quota del soffitto |")
print("|---|---|---|---|---|---|")
for a in ARM:
    r=rows[a]
    print(f"| {a} | {int(np.median(r['cand'])):,} | {100*np.mean(r['ceil']):.1f}% | {100*np.mean(r['hit50']):.1f}% | {100*np.mean(r['hit200']):.1f}% | {100*np.mean(r['hit50'])/max(1e-9,np.mean(r['ceil'])):.0f}% |")
print("\n(la riga del vecchio strumento, per riferimento: pool vero + 2 hop tagliato a 1.200 = soffitto 22,8%, ranker 17,9% @50)")
