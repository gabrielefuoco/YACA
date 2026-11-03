"""La variante da spedire, misurata col PageRank del motore (ALPHA 0.60, ITER 20).

  PYTHONPATH=. py .scratch/distillazione-grafo/attraversa-motore.py <grafo.npz>

Confronta sul banco curato:
  A) pota top-16 + simmetrizza  (quello che fa il motore oggi)
  B) archi mutui + top-32       (la proposta)
entrambe con la stessa diffusione: r = a*e + (1-a)*(r @ Tr), a=0.60, 20 iterazioni.
"""
import json
import sys

import numpy as np
import scipy.sparse as sp
from services.graph_dense import data as D

GOLD = '.scratch/ml-collaborativo/gold/cross-merged.json'
ALPHA, ITER = 0.60, 20
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


def topk(M, k):
    rows, cols, vals = [], [], []
    for i in range(M.shape[0]):
        lo, hi = M.indptr[i], M.indptr[i + 1]
        if hi <= lo:
            continue
        idx, dat = M.indices[lo:hi], M.data[lo:hi]
        if len(dat) > k:
            o = np.argpartition(-dat, k)[:k]
            idx, dat = idx[o], dat[o]
        rows.append(np.full(len(idx), i, np.int32))
        cols.append(idx.astype(np.int32))
        vals.append(dat)
    return sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
                         shape=M.shape)


def transizione(M):
    deg = np.asarray(M.sum(1)).ravel()
    deg[deg <= 0] = 1
    return sp.diags(1.0 / deg) @ M


def ppr(Tr, seme):
    e = np.zeros(N, np.float64)
    np.add.at(e, seme, 1.0)
    e /= max(float(e.sum()), 1e-12)
    r = e.copy()
    for _ in range(ITER):
        r = ALPHA * e + (1 - ALPHA) * (r @ Tr)
    return r


def valuta(nome, modo):
    z = np.load(nome)
    W = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N)).astype(np.float32)
    if modo == 'motore':
        P = transizione(topk((W + W.T).tocsr(), 16))
    else:
        mutui = W.minimum(W.T).tocsr()
        P = transizione(topk(mutui, 32))
    rec = {5: [], 10: [], 20: []}
    mrr, quote = [], []
    for i, links in casi:
        r = ppr(P, [i])
        order = [int(j) for j in np.argsort(-r) if j != i]
        rank = {j: k + 1 for k, j in enumerate(order)}
        for k in rec:
            hit = [w for j, w in links if rank.get(int(j), 10 ** 9) <= k]
            rec[k].append(len(hit) / len(links))
        mrr.append(sum(1.0 / rank.get(int(j), 10 ** 9) for j, _ in links) / len(links))
    for i in campione:
        r = ppr(P, [i]); r[i] = 0
        ids = [int(j) for j in np.argsort(-r) if not TV[j] and r[j] > 0][:10]
        if ids:
            quote.append(float((VOT[ids] > 5000).mean()))
    return (np.mean(rec[5]), np.mean(rec[10]), np.mean(rec[20]),
            np.mean(mrr), np.mean(quote), P.nnz)


print('| grafo | modo | R@5 | R@10 | R@20 | MRR | >5k | archi |')
print('|---|---|---:|---:|---:|---:|---:|---:|')
for nome in sys.argv[1:]:
    for modo in ('motore', 'mutui-k32'):
        a, b, c, m, q, nnz = valuta(nome, modo)
        print(f'| {nome.split("/")[-2]} | {modo} | {a:.3f} | {b:.3f} | {c:.3f} | {m:.4f} | '
              f'{q:.1%} | {nnz:,} |')
