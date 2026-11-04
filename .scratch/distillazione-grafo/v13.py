"""v13.py — V12 + maschera di genere su CAST/DIR + chiusura triangolare + consenso multivista.

  py .scratch/distillazione-grafo/v13.py            # confronta le varianti e salva quella scelta

V10 (steps/02_partizione.py) faceva: componenti -> maschera_genere su CAST/DIR -> miscela pesata ->
shrink_riga -> chiusura_triangolare -> consenso_multivista -> Leiden.
Qui si tiene la separazione dei tipi e la fusione RRF di V12, e si riusano le tre funzioni di V10.
"""
import json
import sys
import time

import numpy as np
import scipy.sparse as sp

sys.path.insert(0, '.scratch/distillazione-grafo')
from mixer import correggi_hub, damping_famiglia, rrf, _attributi_produzione
from services.graph import bubbles as BB
from services.graph_dense import data as D

SRC = 'services/graph/data/tipi-pesi'
DST = 'services/graph/data/v13'
GOLD = '.scratch/ml-collaborativo/gold/cross-merged.json'
HUB = ('TRAMA', 'KW', 'CAST', 'PROD')

B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']
BB.N = N
tipi = sorted(json.load(open('services/graph/data/tipi/manifest.json', encoding='utf-8')))
pesi = json.load(open('services/graph/data/v12/pesi.json', encoding='utf-8'))
pesi = {t: float(pesi.get(t, 1.0)) for t in tipi}
T0 = time.time()


def insiemi_gen_kw():
    """GEN e KW per titolo, dal tf-idf: stessi insiemi su cui V10 applicava maschera_genere."""
    X = D.tfidf(); V = D.vocab()
    def sets(prefisso):
        cols = [(t, V[t]) for t in V if t.startswith(prefisso)]
        cols.sort(key=lambda x: x[1])
        sub = X[:, [c for _, c in cols]].tocsr()
        nomi = [t.split(':', 1)[1] for t, _ in cols]
        out = []
        for riga in range(sub.shape[0]):
            r = sub.getrow(riga)
            out.append(frozenset(nomi[k] for k in r.indices))
        return out
    GEN = sets('ge:')
    KW = sets('kw:')
    print(f'  insiemi: GEN mediana {int(np.median([len(g) for g in GEN]))} · '
          f'KW mediana {int(np.median([len(k) for k in KW]))} ({time.time()-T0:.0f}s)', flush=True)
    return GEN, KW


print('carico i tipi...', flush=True)
RAW = {}
for t in tipi:
    z = np.load(f'{SRC}/{t}.npz')
    RAW[t] = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))

GEN, KW = insiemi_gen_kw()


def _bits_gen(escludi='drama'):
    """Ogni titolo come bitmask dei suoi generi specifici (drama e' un ombrello: si esclude)."""
    nomi = sorted({g for s in GEN for g in s} - {escludi})
    idx = {g: k for k, g in enumerate(nomi)}
    bits = np.zeros(N, np.uint64)
    for i, s in enumerate(GEN):
        b = 0
        for g in s:
            if g in idx: b |= 1 << idx[g]
        bits[i] = b
    print(f'  generi specifici: {len(nomi)}', flush=True)
    return bits


def maschera_finale(M, bits, stretto=0.15):
    """Abbatte l'arco finale se i due titoli non condividono NESSUN genere specifico.

    Va applicata DOPO la fusione: l'RRF e' invariante a una scala uniforme di riga, quindi la
    maschera sui singoli tipi (come faceva V10) qui non avrebbe effetto.
    """
    M = M.tocoo()
    condiviso = (bits[M.row] & bits[M.col]) != 0
    fatt = np.where(condiviso, 1.0, stretto).astype(np.float32)
    out = sp.csr_matrix((M.data * fatt, (M.row, M.col)), shape=(N, N)).tocsr()
    print(f'  maschera finale: abbattuti {int((~condiviso).sum()):,}/{len(fatt):,} '
          f'({100*(~condiviso).mean():.1f}%)', flush=True)
    out.setdiag(0); out.eliminate_zeros()
    return out


BITS = _bits_gen()

print('maschera di genere su CAST e DIR...', flush=True)
MASKED = dict(RAW)
for t in ('CAST', 'DIR'):
    MASKED[t] = BB.maschera_genere(RAW[t], GEN, KW, stretto=0.15, etichetta=t)

attr = _attributi_produzione()
COLL = B['COLL'].astype(np.int64)


def prepara(matrici, hub=True):
    R = {}
    for t in tipi:
        A = matrici[t]
        if hub and t in HUB:
            A = correggi_hub(A, 0.25)
        R[t] = rrf(A, pesi[t])
    return R


R_RAW = prepara(RAW)
R_MASK = prepara(MASKED)


def miscela(R):
    M = None
    for t in tipi:
        M = R[t] if M is None else M + R[t]
    M = M.tocsr(); M.setdiag(0); M.eliminate_zeros()
    return damping_famiglia(M, T, COLL, attr)[0]


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


def top(M, i, k=6):
    r = M.getrow(i)
    if r.nnz == 0: return '(nessun arco)'
    o = np.argsort(-r.data)[:k]
    return ' · '.join(T[int(r.indices[x])] for x in o)


CASI = [('movie:346698', 'Barbie'), ('tv:42009', 'Black Mirror'), ('movie:64690', 'Drive'),
        ('movie:76341', 'Mad Max'), ('tv:62560', 'Mr. Robot'), ('tv:87108', 'Chernobyl'),
        ('tv:1396', 'Breaking Bad'), ('movie:129', 'La citta incantata'), ('movie:496243', 'Parasite'),
        ('tv:1438', 'The Wire'), ('movie:238', 'Il padrino'), ('movie:78', 'Blade Runner')]

VAR = {}
print('\ncostruisco le varianti...', flush=True)
VAR['V12'] = miscela(R_RAW)
VAR['+maschera'] = miscela(R_MASK)
for nome, base in (('+chiusura', 'raw'), ('+chiusura+consenso', 'raw')):
    M = miscela(R_RAW)
    print(f'  chiusura triangolare ({nome})...', flush=True)
    M = BB.chiusura_triangolare(M, alpha0=0.1, B=1024, etichetta=nome)
    if 'consenso' in nome:
        print(f'  consenso multivista ({nome})...', flush=True)
        M = BB.consenso_multivista(M, RAW, pesi)
    VAR[nome] = M

print('\n| variante | R@10 | R@20 | MRR | archi |')
print('|---|---:|---:|---:|---:|')
for nome, M in VAR.items():
    r10, r20, m = valuta(M)
    print(f'| {nome} | {r10:.3f} | {r20:.3f} | {m:.3f} | {M.nnz:,} |', flush=True)

for key, lab in CASI:
    print(f'\n### {lab}')
    for nome, M in VAR.items():
        print(f'  {nome:<26} ' + top(M, RO[key]))

import os
os.makedirs(DST, exist_ok=True)
scelto = VAR['+masch.finale+chiusura']
out = f'{DST}/bolle-eterogeneo-V13-p1.0-triangolo.npz'
np.savez_compressed(out, indptr=scelto.indptr.astype(np.int64), indices=scelto.indices.astype(np.int32),
                    data=scelto.data.astype(np.float32))
json.dump({'pesi': pesi, 'maschera_genere': True, 'chiusura': True, 'consenso': True,
           'archi': int(scelto.nnz)}, open(f'{DST}/V13.json', 'w', encoding='utf-8'), indent=1)
print(f'\nscritto {out}')
