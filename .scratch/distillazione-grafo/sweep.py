"""sweep.py — quanto vale ogni tipo sulla curatela, e che pesi ne derivano.

  py .scratch/distillazione-grafo/sweep.py

Costruisce una volta sola la matrice RRF di ogni tipo (indipendente dal peso), poi misura:
  · SOLO      il tipo da solo
  · LOO       tutti gli altri a peso 1, senza quel tipo
  · pesi      qualche vettore di pesi da confrontare
"""
import json
import numpy as np
import scipy.sparse as sp
from services.graph_dense import data as D

GOLD = '.scratch/ml-collaborativo/gold/cross-merged.json'
SRC = 'services/graph/data/tipi-pesi'
KS = (10, 20, 50)
B = D.basic(); N = B['N']; RO = B['row_of']
tipi = sorted(json.load(open('services/graph/data/tipi/manifest.json', encoding='utf-8')))

casi = []
for s in json.load(open(GOLD, encoding='utf-8'))['sources']:
    i = RO.get(s['id'])
    if i is None: continue
    links = [(RO[l['id']], float(l.get('w', 1))) for l in s['links'] if l['id'] in RO]
    if links: casi.append((i, links))


def rrf(A, k=60):
    rows, cols, vals = [], [], []
    for i in range(N):
        r = A.getrow(i)
        if r.nnz == 0: continue
        o = np.argsort(-r.data); js = r.indices[o]
        rows.append(np.full(len(js), i, np.int32)); cols.append(js.astype(np.int32))
        vals.append((1.0 / (k + np.arange(len(js)))).astype(np.float32))
    return sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(N, N))


R = {}
for t in tipi:
    z = np.load(f'{SRC}/{t}.npz')
    A = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
    R[t] = rrf(A)
    print(f'  rrf {t:<9} {R[t].nnz:,} archi', flush=True)


def valuta(pesi):
    M = None
    for t, w in pesi.items():
        if w <= 0: continue
        A = R[t] if w == 1 else R[t].multiply(w).tocsr()
        M = A if M is None else M + A
    rec = {k: [] for k in KS}; mrr = []
    for i, links in casi:
        r = M.getrow(i)
        if r.nnz == 0:
            for k in KS: rec[k].append(0.0)
            mrr.append(0.0); continue
        order = r.indices[np.argsort(-r.data)]
        rank = {int(j): p + 1 for p, j in enumerate(order) if j != i}
        for k in KS:
            rec[k].append(sum(1 for j, _ in links if rank.get(int(j), 10 ** 9) <= k) / len(links))
        found = [1.0 / rank[int(j)] for j, _ in links if int(j) in rank]
        mrr.append(np.mean(found) if found else 0.0)
    return {k: float(np.mean(rec[k])) for k in KS}, float(np.mean(mrr))


print('\n## contributo di ogni tipo (R@20)')
print('| tipo | da solo | senza di lui (LOO) | calo se lo togli |')
print('|---|---:|---:|---:|')
pari = {t: 1.0 for t in tipi}
base, base_mrr = valuta(pari)
solo = {}
for t in tipi:
    s, _ = valuta({u: (1.0 if u == t else 0.0) for u in tipi})
    loo = dict(pari); loo.pop(t)
    l, _ = valuta(loo)
    solo[t] = s[20]
    print(f'| {t} | {s[20]:.3f} | {l[20]:.3f} | {base[20]-l[20]:+.3f} |')
print(f'\nbase (tutti a 1): R@20 {base[20]:.3f} · R@50 {base[50]:.3f} · MRR {base_mrr:.3f}')

print('\n## vettori di pesi (modo rrf)')
print('| nome | COV | RRF | TRA | KW | DIR | CAST | PROD | COLL | R@10 | R@20 | R@50 | MRR |')
print('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
proposte = {
    'pari': {t: 1.0 for t in tipi},
    'mio-1.5': {'COVISION': 1.5, 'RRFST': 1.2, 'TRAMA': 0.8, 'KW': 0.8, 'DIR': 0.6, 'CAST': 0.3, 'PROD': 0.3, 'COLL': 0.5},
    'cov-alto': {'COVISION': 2.0, 'RRFST': 1.0, 'TRAMA': 1.0, 'KW': 1.0, 'DIR': 1.0, 'CAST': 1.0, 'PROD': 1.0, 'COLL': 1.0},
    'cov-molto-alto': {'COVISION': 3.0, 'RRFST': 1.0, 'TRAMA': 1.0, 'KW': 1.0, 'DIR': 1.0, 'CAST': 1.0, 'PROD': 1.0, 'COLL': 1.0},
    'meta-bassi': {'COVISION': 1.5, 'RRFST': 1.0, 'TRAMA': 1.0, 'KW': 1.0, 'DIR': 0.5, 'CAST': 0.2, 'PROD': 0.2, 'COLL': 0.5},
    'senza-meta': {'COVISION': 1.5, 'RRFST': 1.0, 'TRAMA': 1.0, 'KW': 1.0, 'DIR': 0.0, 'CAST': 0.0, 'PROD': 0.0, 'COLL': 0.0},
    'cov-2-no-meta': {'COVISION': 2.0, 'RRFST': 1.0, 'TRAMA': 1.0, 'KW': 1.0, 'DIR': 0.0, 'CAST': 0.0, 'PROD': 0.0, 'COLL': 0.0},
}
for nome, p in proposte.items():
    r, m = valuta(p)
    cells = ' | '.join(f'{p.get(t, 0):g}' for t in ('COVISION', 'RRFST', 'TRAMA', 'KW', 'DIR', 'CAST', 'PROD', 'COLL'))
    print(f'| {nome} | {cells} | {r[10]:.3f} | {r[20]:.3f} | {r[50]:.3f} | {m:.3f} |')
