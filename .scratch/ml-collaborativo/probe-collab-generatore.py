"""
.scratch/ml-collaborativo/probe-collab-generatore.py

LA SONDA: la posizione collaborativa puo' GENERARE candidati, non solo riordinarli?

Oggi la posizione collaborativa e' una feature: si calcola il coseno per i candidati che il pool e il
grafo hanno gia' proposto. Come generatore invece si cercano i vicini piu' stretti in TUTTO il catalogo
(85.810 titoli con posizione), compresi quelli che nessuno dei due ha in lista.

La domanda NON e' "aggiunge verita' raggiungibile" (lo fara'): e' "la sua densita' di titoli giusti e'
piu' alta di un candidato medio?". Se no, e' diluizione pura — e l'abbiamo appena visto col pool senza
filtro: il soffitto sale, il recall scende.

PREVISIONE DICHIARATA PRIMA DI GUARDARE: perche' l'idea valga la pena, il top-300 collaborativo deve
avere una densita' di verita' >= 2x quella di un candidato medio. Sotto, l'idea e' morta.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/probe-collab-generatore.py
"""
import glob
import json
import pathlib

import numpy as np

CACHE = pathlib.Path(__file__).resolve().parents[2] / ".cache" / "movielens"
NS = [100, 300, 1000]

POS = json.loads((CACHE / "positions.json").read_text())
keys = list(POS.keys())
M = np.asarray([POS[k] for k in keys], dtype=np.float32)
M /= (np.linalg.norm(M, axis=1, keepdims=True) + 1e-9)
idx = {k: i for i, k in enumerate(keys)}
print(f"posizioni: {M.shape[0]:,} titoli x {M.shape[1]} dimensioni ({M.nbytes/1e6:.0f} MB)")

trials = json.loads((CACHE / "graph-candidates-full.json").read_text())
univ = {}
for f in sorted(glob.glob(str(CACHE / "ranker-full-*.ndjson"))):
    with open(f, encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                r = json.loads(line)
                univ.setdefault(r["c"], set()).add(r["k"])
print(f"universo di riferimento (pool vero + 2 hop): {len(univ):,} account")

rng = np.random.default_rng(20261008)
acc = {N: dict(g=0, ctrl=0, new=0, newg=0, hop=0, n=0) for N in NS}
acc_st = {st: {N: dict(g=0, ctrl=0, n=0) for N in NS} for st in ("fondo", "resto")}
univ_rate = [0, 0]
for t in trials:
    ctx, st = t["ctx"], t["strato"]
    U = univ.get(ctx, set())
    gold = set(t["gold"])
    two = set(t["twohop"])
    seeds = set(t["seeds"])
    srows = [idx[k] for k in t["seeds"] if k in idx]
    if not srows or not gold:
        continue
    p = M[srows].mean(0)
    p /= (np.linalg.norm(p) + 1e-9)
    sims = M @ p
    order = [i for i in np.argsort(-sims) if keys[i] not in seeds][: max(NS)]
    Ulist = [k for k in U if k not in seeds]
    univ_rate[0] += sum(1 for k in Ulist if k in gold)
    univ_rate[1] += len(Ulist)
    for N in NS:
        top = [keys[i] for i in order[:N]]
        if len(top) < N:
            continue
        g = sum(1 for k in top if k in gold)
        ctrl_i = rng.choice(len(Ulist), size=N, replace=False) if len(Ulist) >= N else []
        cg = sum(1 for i in ctrl_i if Ulist[i] in gold)
        newk = [k for k in top if k not in U]
        ng = sum(1 for k in newk if k in gold)
        hop = sum(1 for k in top if k in two)
        a = acc[N]
        a["g"] += g; a["ctrl"] += cg; a["new"] += len(newk); a["newg"] += ng; a["hop"] += hop; a["n"] += N
        s = acc_st[st][N]
        s["g"] += g; s["ctrl"] += cg; s["n"] += N

base = 100 * univ_rate[0] / max(1, univ_rate[1])
print(f"\ncandidato medio (tutto l'universo): {base:.2f}% di titoli giusti")
print("\n| N | densita' verita' del top-N | controllo (N a caso) | rapporto | NUOVI (fuori dall'universo) | nuovi E giusti | sovrapposizione col 2 hop |")
print("|---|---|---|---|---|---|---|")
for N in NS:
    a = acc[N]
    g = 100 * a["g"] / a["n"]; c = 100 * a["ctrl"] / a["n"]
    print(f"| {N} | {g:.2f}% | {c:.2f}% | **{g/max(1e-9,c):.1f}x** | {100*a['new']/a['n']:.0f}% | "
          f"{100*a['newg']/a['n']:.2f}% ({100*a['newg']/max(1,a['new']):.1f}% dei nuovi) | {100*a['hop']/a['n']:.0f}% |")
print("\n| strato | N | densita' verita' | controllo | rapporto |")
print("|---|---|---|---|---|")
for st in ("fondo", "resto"):
    for N in NS:
        s = acc_st[st][N]
        if not s["n"]:
            continue
        g = 100 * s["g"] / s["n"]; c = 100 * s["ctrl"] / s["n"]
        print(f"| {st} | {N} | {g:.2f}% | {c:.2f}% | **{g/max(1e-9,c):.1f}x** |")
print(f"\nPREVISIONE DICHIARATA: top-300 >= 2x il candidato medio ({base:.2f}%) = {2*base:.2f}%")
