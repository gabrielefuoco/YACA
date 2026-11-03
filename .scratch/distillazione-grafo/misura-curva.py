"""Misura insieme accuratezza (banco) e coda (quota di titoli popolari in testa).

  PYTHONPATH=. py .scratch/distillazione-grafo/misura-curva.py <grafo.npz> [altri...]
"""
import json
import sys

import numpy as np
import scipy.sparse as sp
from services.graph_dense import data as D

GOLD = '.scratch/ml-collaborativo/gold/cross-merged.json'
SEEDS = ['movie:346698', 'movie:792307', 'movie:545611', 'movie:19366',
         'movie:64690', 'movie:496243', 'movie:37165', 'movie:391713']

B = D.basic(); N = B['N']; RO = B['row_of']; VOT = B['VOT']; TV = B['is_tv']
d = json.load(open(GOLD, encoding='utf-8'))
casi = []
for s in d['sources']:
    i = RO.get(s['id'])
    if i is None:
        continue
    links = [(RO[l['id']], float(l.get('w', 1))) for l in s['links'] if l['id'] in RO]
    if links:
        casi.append((i, links))

# semi popolari a caso, per non misurare solo gli 8 scelti a mano
rng = np.random.default_rng(0)
pop = np.flatnonzero((~TV) & (VOT > 5000))
campione = rng.choice(pop, 200, replace=False)


def topk(M, i, k=10):
    r = M.getrow(i)
    ids = [int(j) for j in r.indices[np.argsort(-r.data)] if not TV[j] and j != i]
    return ids[:k]


def valuta(nome):
    z = np.load(nome)
    M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
    rec, mrr = {5: [], 10: [], 20: []}, []
    for i, links in casi:
        order = topk(M, i, 2000)
        rank = {j: k + 1 for k, j in enumerate(order)}
        for k in rec:
            hit = [w for j, w in links if rank.get(j, 10 ** 9) <= k]
            rec[k].append(len(hit) / len(links))
        found = [1.0 / rank[j] for j, _ in links if j in rank]
        mrr.append(np.mean(found) if found else 0.0)
    quote, med = [], []
    for i in campione:
        ids = topk(M, i, 10)
        if not ids:
            continue
        v = VOT[ids]
        quote.append(float((v > 5000).mean()))
        med.append(float(np.median(v)))
    quote8 = []
    for s in SEEDS:
        ids = topk(M, RO[s], 10)
        quote8.append(float((VOT[ids] > 5000).mean()))
    return {'r5': np.mean(rec[5]), 'r10': np.mean(rec[10]), 'r20': np.mean(rec[20]),
            'mrr': np.mean(mrr), 'pop': np.mean(quote), 'med': np.median(med),
            'pop8': np.mean(quote8)}


print('| grafo | R@5 | R@10 | R@20 | MRR | >5k in top-10 (200 semi) | voti mediani | >5k negli 8 seed |')
print('|---|---:|---:|---:|---:|---:|---:|---:|')
for nome in sys.argv[1:]:
    r = valuta(nome)
    et = nome.split('/')[-2] + '/' + nome.split('/')[-1].replace('bolle-eterogeneo-', '').replace('-p1.0-triangolo.npz', '')
    print(f"| {et} | {r['r5']:.3f} | {r['r10']:.3f} | {r['r20']:.3f} | {r['mrr']:.3f} | "
          f"{r['pop']:.1%} | {r['med']:,.0f} | {r['pop8']:.0%} |")
