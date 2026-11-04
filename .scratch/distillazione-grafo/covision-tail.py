"""Quanto pesa davvero la coda: supporto per item, archi, titoli."""
import numpy as np
import scipy.sparse as sp
import sys
sys.path.insert(0, '.scratch/distillazione-grafo')
import covision as CV

B = CV.B; N = B['N']; T = B['titoli']; IS_TV = B['is_tv']
VOT = B['VOT']; YEAR = B['year']
z = np.load('services/graph_dense/data/covision.npz')
S = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
deg = np.diff(S.indptr)

src = CV.load_all()
sup = {}
for name, d in src.items():
    X = d['X']
    sup[name] = np.asarray(X.T @ np.ones(X.shape[0], np.float32)).ravel().astype(np.int64)
M = np.vstack([sup[n] for n in src])            # fonti x item
mx = M.max(0)                                   # miglior supporto in una singola fonte
tot = M.sum(0)

print('\n== item con archi, per miglior supporto in una fonte ==')
print('| supporto max | item con archi | archi uscenti | peso medio | peso mediano | quota peso>0.5 |')
print('|---|---|---|---|---|---|')
buckets = [(1, 1), (2, 2), (3, 4), (5, 9), (10, 19), (20, 99), (100, 10**9)]
for lo, hi in buckets:
    sel = np.flatnonzero((mx >= lo) & (mx <= hi) & (deg > 0))
    if not len(sel):
        continue
    w = []
    for i in sel[:20000]:
        r = S.getrow(i)
        w.append(r.data)
    w = np.concatenate(w) if w else np.array([])
    lab = f'{lo}' if lo == hi else (f'{lo}-{hi}' if hi < 10**9 else f'{lo}+')
    print(f'| {lab} | {len(sel):,} | {int(deg[sel].sum()):,} | {w.mean():.3f} | {np.median(w):.3f} | {(w > 0.5).mean():.2f} |')

print('\n== item senza archi, per supporto ==')
for lo, hi in buckets:
    sel = np.flatnonzero((mx >= lo) & (mx <= hi) & (deg == 0))
    if len(sel):
        lab = f'{lo}' if lo == hi else (f'{lo}-{hi}' if hi < 10**9 else f'{lo}+')
        print(f'  supporto {lab}: {len(sel):,} item senza alcun arco')

low = np.flatnonzero((mx >= 2) & (mx <= 4) & (deg > 0))
print(f'\n== {len(low):,} item con supporto 2-4 e archi: campione ==')
rng = np.random.default_rng(3)
for i in rng.choice(low, 14, replace=False):
    i = int(i)
    r = S.getrow(i)
    order = np.argsort(-r.data)[:4]
    vic = ' · '.join(f'{T[r.indices[o]]} ({r.data[o]:.2f})' for o in order)
    print(f'  {T[i]} [{B["keys"][i]}] voti={VOT[i]:.0f} anno={YEAR[i]:.0f} sup={mx[i]} → {vic}')

only1 = np.flatnonzero((mx == 1) & (deg > 0))
print(f'\n== {len(only1):,} item con supporto max 1 (un solo utente al mondo) e archi ==')
for i in rng.choice(only1, min(8, len(only1)), replace=False):
    i = int(i)
    r = S.getrow(i)
    order = np.argsort(-r.data)[:3]
    print(f'  {T[i]} [{B["keys"][i]}] voti={VOT[i]:.0f} → ' + ' · '.join(f'{T[r.indices[o]]} ({r.data[o]:.2f})' for o in order))

print(f'\ntotale archi {S.nnz:,} · peso medio {S.data.mean():.3f} · mediano {np.median(S.data):.3f}')
