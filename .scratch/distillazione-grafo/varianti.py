"""varianti.py — confronta vettori di pesi sullo stesso elenco, senza ricostruire l'RRF ogni volta."""
import json
import numpy as np
import scipy.sparse as sp
import sys
sys.path.insert(0, '.scratch/distillazione-grafo')
from mixer import correggi_hub, damping_famiglia, rrf, _attributi_produzione
from services.graph_dense import data as D

SRC = 'services/graph/data/tipi-pesi'
GOLD = '.scratch/ml-collaborativo/gold/cross-merged.json'
tipi = sorted(json.load(open('services/graph/data/tipi/manifest.json', encoding='utf-8')))
B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']
HUB = ('TRAMA', 'KW', 'CAST', 'PROD')

print('costruisco RRF per tipo (una volta sola)...', flush=True)
R = {}
for t in tipi:
    z = np.load(f'{SRC}/{t}.npz')
    A = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
    if t in HUB: A = correggi_hub(A, 0.25)
    R[t] = rrf(A, 1.0)
    print(f'  {t:<9} fatto', flush=True)
attr = _attributi_produzione()

casi = []
for s in json.load(open(GOLD, encoding='utf-8'))['sources']:
    i = RO.get(s['id'])
    if i is None: continue
    links = [(RO[l['id']], float(l.get('w', 1))) for l in s['links'] if l['id'] in RO]
    if links: casi.append((i, links))


def valuta(M):
    rec = {10: [], 20: []}; mrr = []
    for i, links in casi:
        r = M.getrow(i)
        if r.nnz == 0:
            rec[10].append(0.0); rec[20].append(0.0); mrr.append(0.0); continue
        order = r.indices[np.argsort(-r.data)]
        rank = {int(j): p + 1 for p, j in enumerate(order) if j != i}
        for k in (10, 20):
            rec[k].append(sum(1 for j, _ in links if rank.get(int(j), 10**9) <= k) / len(links))
        found = [1.0 / rank[int(j)] for j, _ in links if int(j) in rank]
        mrr.append(np.mean(found) if found else 0.0)
    return float(np.mean(rec[10])), float(np.mean(rec[20])), float(np.mean(mrr))


def costruisci(pesi):
    M = None
    for t in tipi:
        w = float(pesi.get(t, 1.0))
        if w <= 0: continue
        A = R[t] if w == 1 else R[t].multiply(w).tocsr()
        M = A if M is None else M + A
    M = M.tocsr(); M.setdiag(0); M.eliminate_zeros()
    return damping_famiglia(M, T, B['COLL'].astype(np.int64), attr)[0]


def top(M, i, k=6):
    r = M.getrow(i)
    if r.nnz == 0: return '(nessun arco)'
    o = np.argsort(-r.data)[:k]
    return ' · '.join(T[int(r.indices[x])] for x in o)


VAR = {
    'attuale (DIR 1.5)': {'COVISION': 1.2, 'RRFST': 1.0, 'KW': 1.0, 'TRAMA': 0.6, 'DIR': 1.5, 'CAST': 0.8, 'PROD': 0.3, 'COLL': 0.5},
    'meno regia':        {'COVISION': 1.6, 'RRFST': 1.3, 'KW': 1.0, 'TRAMA': 0.6, 'DIR': 0.9, 'CAST': 0.5, 'PROD': 0.3, 'COLL': 0.5},
    'equilibrata':       {'COVISION': 1.4, 'RRFST': 1.15, 'KW': 1.0, 'TRAMA': 0.6, 'DIR': 1.1, 'CAST': 0.6, 'PROD': 0.3, 'COLL': 0.5},
}
M = {}
print('\n| variante | R@10 | R@20 | MRR |')
print('|---|---:|---:|---:|')
for nome, p in VAR.items():
    M[nome] = costruisci(p)
    r10, r20, m = valuta(M[nome])
    print(f'| {nome} | {r10:.3f} | {r20:.3f} | {m:.3f} |', flush=True)

PROVA = [('movie:346698', 'Barbie'), ('movie:422', '8 e mezzo'), ('movie:439', 'La dolce vita'),
         ('tv:1920', 'Twin Peaks'), ('tv:1438', 'The Wire'), ('tv:87108', 'Chernobyl'),
         ('tv:42009', 'Black Mirror'), ('tv:62560', 'Mr. Robot'), ('movie:64690', 'Drive'),
         ('movie:76341', 'Mad Max'), ('movie:27205', 'Inception'), ('movie:419430', 'Get Out'),
         ('movie:531428', 'Ritratto'), ('tv:2316', 'The Office US'), ('tv:1398', 'I Soprano'),
         ('movie:497', 'Sopranos?')]
for key, lab in PROVA:
    i = RO.get(key)
    if i is None: continue
    print(f'\n### {lab} [{key}]')
    for nome in VAR:
        print(f'  {nome:<17} ' + top(M[nome], i))
