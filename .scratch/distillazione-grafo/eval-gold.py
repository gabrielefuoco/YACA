"""eval-gold.py — il banco di prova: la curatela scritta a mano (499 serie, 3.533 link).

  py .scratch/distillazione-grafo/eval-gold.py services/graph/data/v12/MIX-quota.npz [altri...]

Per ogni voce curata misura a che rango finiscono i link scritti a mano. La curatela NON entra nel
grafo: e' la misura. Recall@k pesata sui pesi 1-3 e MRR.
"""
import json
import sys

import numpy as np
import scipy.sparse as sp
from services.graph_dense import data as D

GOLD = '.scratch/ml-collaborativo/gold/cross-merged.json'
KS = (5, 10, 20, 50)


def carica(nome):
    z = np.load(nome)
    return sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))


B = D.basic(); N = B['N']; RO = B['row_of']; IS_TV = B['is_tv']
d = json.load(open(GOLD, encoding='utf-8'))
casi = []
for s in d['sources']:
    i = RO.get(s['id'])
    if i is None: continue
    links = [(RO[l['id']], float(l.get('w', 1))) for l in s['links'] if l['id'] in RO]
    if links: casi.append((i, links))
print(f'curatela: {len(casi)} voci · {sum(len(l) for _, l in casi):,} link · '
      f'{sum(1 for _, l in casi for j, _ in l if not IS_TV[j])} cross-medium serie→film')


def valuta(nome):
    M = carica(nome)
    rec = {k: [] for k in KS}
    recw = {k: [] for k in KS}
    mrr = []
    for i, links in casi:
        r = M.getrow(i)
        if r.nnz == 0:
            for k in KS: rec[k].append(0.0); recw[k].append(0.0)
            mrr.append(0.0); continue
        order = r.indices[np.argsort(-r.data)]
        rank = {}
        for pos, j in enumerate(order):
            if j != i: rank[int(j)] = pos + 1
        for k in KS:
            hit = [w for j, w in links if rank.get(int(j), 10 ** 9) <= k]
            rec[k].append(len(hit) / len(links))
            recw[k].append(sum(hit) / sum(w for _, w in links))
        found = [1.0 / rank[int(j)] for j, _ in links if int(j) in rank]
        mrr.append(np.mean(found) if found else 0.0)
    return {k: float(np.mean(rec[k])) for k in KS}, {k: float(np.mean(recw[k])) for k in KS}, float(np.mean(mrr))


print()
print('| grafo | R@5 | R@10 | R@20 | R@50 | R@20 pesata | MRR |')
print('|---|---:|---:|---:|---:|---:|---:|')
righe = []
for nome in sys.argv[1:]:
    r, rw, m = valuta(nome)
    etichetta = nome.split('/')[-1].replace('MIX-', '').replace('.npz', '')
    righe.append((etichetta, r, rw, m))
    print(f'| {etichetta} | {r[5]:.3f} | {r[10]:.3f} | {r[20]:.3f} | {r[50]:.3f} | {rw[20]:.3f} | {m:.3f} |')

best = max(righe, key=lambda x: x[1][20])
print(f'\n> miglior R@20: **{best[0]}** ({best[1][20]:.3f})')
