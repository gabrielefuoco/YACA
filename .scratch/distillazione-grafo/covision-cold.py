import numpy as np, scipy.sparse as sp, sys
sys.path.insert(0, '.scratch/distillazione-grafo')
import covision as CV

B = CV.B; N = B['N']; T = B['titoli']; IS_TV = B['is_tv']; YEAR = B['year']
RO = B['row_of']
z = np.load('services/graph_dense/data/covision.npz')
S = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
deg = np.diff(S.indptr)
src = CV.load_all()
sup = {n: np.asarray(d['X'].T @ np.ones(d['X'].shape[0], np.float32)).ravel().astype(np.int64)
       for n, d in src.items()}
tot = np.sum([sup[n] for n in src], axis=0)

def find(needle):
    return [(i, B['keys'][i], str(T[i])) for i in range(N)
            if needle.casefold() in str(T[i]).casefold()]

for needle in ('Verity', 'The Odyssey', 'Odissea', 'Ulisse'):
    print(f'\n### "{needle}"')
    for i, key, title in find(needle)[:6]:
        s = ' · '.join(f'{n}={sup[n][i]}' for n in src)
        print(f'  {title} [{key}] anno={YEAR[i]:.0f} · {s} · tot={tot[i]} · archi={deg[i]}')
        if deg[i]:
            r = S.getrow(i); o = np.argsort(-r.data)[:5]
            print('     ' + ' · '.join(f'{T[r.indices[x]]} ({r.data[x]:.2f})' for x in o))

print('\n== distribuzione supporto totale (tutte le fonti) ==')
for lo, hi in [(0,0),(1,1),(2,2),(3,4),(5,9),(10,19),(20,99),(100,10**9)]:
    sel = (tot >= lo) & (tot <= hi)
    lab = f'{lo}' if lo == hi else (f'{lo}-{hi}' if hi < 10**9 else f'{lo}+')
    print(f'  supporto {lab}: {int(sel.sum()):,} item · con archi {int((sel & (deg>0)).sum()):,}')
print(f'\nitem mai visti in nessuna fonte: {int((tot==0).sum()):,}/{N:,}')
