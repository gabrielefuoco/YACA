"""Attraversamento: confronta la configurazione del motore con min+k32+spreading.

  PYTHONPATH=. py .scratch/distillazione-grafo/attraversa.py <grafo.npz> [altri...]

Per ogni grafo confronta, sul banco curato completo e su 200 semi popolari:
  - somma + top-16 + PageRank (quella del motore)
  - min(W,W.T) + top-32 + spreading activation (3 passi, decadimento 0,5)
"""
import json
import sys

import numpy as np
import scipy.sparse as sp
from services.graph_dense import data as D

GOLD = '.scratch/ml-collaborativo/gold/cross-merged.json'
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
rng = np.random.default_rng(0)
pop = np.flatnonzero((~TV) & (VOT > 5000))
campione = rng.choice(pop, 100, replace=False)


def carica(nome):
    z = np.load(nome)
    return sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N)).astype(np.float32)


def topk_per_riga(M, k):
    """Tiene i k archi più forti per riga e normalizza la riga a somma 1."""
    M = M.tocsr()
    rows, cols, vals = [], [], []
    for i in range(M.shape[0]):
        lo, hi = M.indptr[i], M.indptr[i + 1]
        if hi <= lo:
            continue
        idx = M.indices[lo:hi]
        dat = M.data[lo:hi]
        if len(dat) > k:
            o = np.argpartition(-dat, k)[:k]
            idx, dat = idx[o], dat[o]
        s = dat.sum()
        if s > 0:
            rows.append(np.full(len(idx), i, np.int32))
            cols.append(idx.astype(np.int32))
            vals.append((dat / s).astype(np.float32))
    return sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
                         shape=M.shape)


def spreading(A, passi=3, decay=0.5):
    """x_0 = e_seed; x_{t+1} = decay * x_t + (1-decay) * x_t @ A. Ritorna la matrice implicita
    come prodotto: basta propagare i seed uno alla volta, ma qui serve il rango per 499 seed."""
    return A


def rango_pagerank(M, i):
    r = M.getrow(i)
    return [int(j) for j in r.indices[np.argsort(-r.data)] if j != i]


def valuta(nome, modo):
    M = carica(nome)
    if modo == 'motore':
        M = topk_per_riga(M, 16)
        P = None
    else:
        Ms = M.minimum(M.T).tocsr()          # solo archi mutui
        A = topk_per_riga(Ms, 32)
        P = A
    rec = {5: [], 10: [], 20: []}
    mrr = []
    for i, links in casi:
        if modo == 'motore':
            order = rango_pagerank(M, i)
        else:
            x = np.zeros(N, np.float32); x[i] = 1.0
            for _ in range(3):
                x = 0.5 * x + 0.5 * (x @ P)
            x[i] = 0
            order = list(np.argsort(-x))
            order = [int(j) for j in order[:3000] if x[j] > 0]
        rank = {j: k + 1 for k, j in enumerate(order)}
        for k in rec:
            hit = [w for j, w in links if rank.get(int(j), 10 ** 9) <= k]
            rec[k].append(len(hit) / len(links))
        # denominatore FISSO: un link non raggiungibile vale 0, non va escluso
        mrr.append(sum(1.0 / rank.get(int(j), 10 ** 9) for j, _ in links) / len(links))
    quote = []
    for i in campione:
        if modo == 'motore':
            r = M.getrow(i)
            ids = [int(j) for j in r.indices[np.argsort(-r.data)] if not TV[j] and j != i][:10]
        else:
            x = np.zeros(N, np.float32); x[i] = 1.0
            for _ in range(3):
                x = 0.5 * x + 0.5 * (x @ P)
            x[i] = 0
            ids = [int(j) for j in np.argsort(-x)[:40] if not TV[j] and x[j] > 0][:10]
        if ids:
            quote.append(float((VOT[ids] > 5000).mean()))
    return {'r5': np.mean(rec[5]), 'r10': np.mean(rec[10]), 'r20': np.mean(rec[20]),
            'mrr': np.mean(mrr), 'pop': np.mean(quote)}


print('| grafo | modo | R@5 | R@10 | R@20 | MRR | >5k top-10 |')
print('|---|---|---:|---:|---:|---:|---:|')
for nome in sys.argv[1:]:
    for modo in ('motore', 'min-k32-spreading'):
        r = valuta(nome, modo)
        et = nome.split('/')[-2]
        print(f"| {et} | {modo} | {r['r5']:.3f} | {r['r10']:.3f} | {r['r20']:.3f} | "
              f"{r['mrr']:.3f} | {r['pop']:.1%} |")
