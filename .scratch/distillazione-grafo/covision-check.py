"""Validazione dell'artefatto co-visione salvato."""
import glob, json, os
import numpy as np
import scipy.sparse as sp
from services.graph_dense import config as C, data as D

B = D.basic(); N = B['N']; RO = B['row_of']; T = B['titoli']; IS_TV = B['is_tv']
REL = np.load(C.DATA / 'uscite-ordinali.npy').astype(np.int64)
z = np.load('services/graph_dense/data/covision.npz')
S = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
S10 = D.triangle()
deg = np.diff(S.indptr)

print(f'archi {S.nnz:,} · simmetrica {(abs(S - S.T).sum() < 1e-6)} · diag {S.diagonal().sum():.1f}')
print(f'grado: mediana {np.median(deg):.0f} · p10 {np.percentile(deg,10):.0f} · zero {int((deg==0).sum()):,} · max {deg.max()}')
HUB = deg > 2000
print(f'item hub (grado>2000): {int(HUB.sum()):,}')

# campione identico alla calibrazione
sup = {}
for f in glob.glob('.cache/trakt/users/movie-*.json') + glob.glob('.cache/trakt/users/show-*.json'):
    base = os.path.basename(f)[:-5]
    typ = 'movie' if base.startswith('movie-') else 'tv'
    try: data = json.load(open(f, encoding='utf-8'))
    except Exception: continue
    if not isinstance(data, list): continue
    for e in data:
        k = (e.get('movie') if typ == 'movie' else e.get('show') or {}).get('ids', {}).get('tmdb')
        if k: sup[(typ, int(k))] = sup.get((typ, int(k)), 0) + 1
pop = np.array([RO[f'{t}:{i}'] for (t, i), c in sup.items() if c >= 5 and f'{t}:{i}' in RO])
rng = np.random.default_rng(7)
films = [i for i in pop if not IS_TV[i]]; series = [i for i in pop if IS_TV[i]]
sample = list(rng.choice(films, 120, replace=False)) + list(rng.choice(series, 80, replace=False))

def top(i, k=10):
    r = S.getrow(i)
    if r.nnz == 0: return []
    g = np.zeros(N, np.float32); g[r.indices] = r.data; g[i] = -1e9
    return [(int(x), float(g[x])) for x in np.argsort(-g)[:k]]

bubbles, jac, hubs = [], [], []
for i in sample:
    tp = top(i)
    if not tp: continue
    if not IS_TV[i] and REL[i] > 0:
        ok = [j for j, _ in tp if REL[j] > 0]
        if ok: bubbles.append(sum(1 for j in ok if abs(int(REL[j]) - int(REL[i])) <= 365) / len(ok))
    r = S10.getrow(i)
    if r.nnz:
        g = np.zeros(N, np.float32); g[r.indices] = r.data; g[i] = -1e9
        ref = set(int(x) for x in np.argsort(-g)[:10]); cand = set(j for j, _ in tp)
        jac.append(len(ref & cand) / len(ref | cand))
    hubs.append(sum(1 for j, _ in tp if HUB[j]) / len(tp))
print(f'su {len(sample)} seed: bolla media {np.mean(bubbles):.3f} mediana {np.median(bubbles):.3f} · '
      f'Jaccard V10 {np.mean(jac):.3f} · hub nei top-10 {np.mean(hubs):.3f} · copertura {sum(1 for i in sample if deg[i]):,}/{len(sample)}')

print('\ncasi noti:')
for key, label in [('movie:346698','Barbie'), ('movie:872585','Oppenheimer'), ('tv:1396','Breaking Bad'),
                   ('tv:63351','Narcos'), ('tv:1429',"L'attacco dei giganti"), ('movie:496243','Parasite'),
                   ('movie:597','Titanic')]:
    i = RO.get(key)
    if i is None: continue
    print(f'  {label}: ' + (' · '.join(T[j] for j, _ in top(i, 8)) or '(nessun arco)'))

print('\ncoda (grado co-visione 1-3, 6 a caso):')
tail = [i for i in np.flatnonzero((deg >= 1) & (deg <= 3)) if str(T[i]).strip()]
for i in list(rng.choice(tail, 6, replace=False)):
    print(f'  {T[i]} [{B["keys"][i]}]: ' + ' · '.join(T[j] for j, _ in top(i, 5)))

print('\ncopertura per tipo: film %s · serie %s' % (
    f'{int(((deg>0)&(~IS_TV)).sum()):,}/{int((~IS_TV).sum()):,}',
    f'{int(((deg>0)&IS_TV).sum()):,}/{int(IS_TV.sum()):,}'))
