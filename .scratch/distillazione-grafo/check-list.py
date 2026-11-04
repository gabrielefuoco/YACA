"""Check 30 film + 10 serie: V13 base vs LIST-tipo vs LIST-in-COVISION."""
import numpy as np, scipy.sparse as sp
from services.graph_dense import data as D
B=D.basic(); N=B['N']; T=B['titoli']; RO=B['row_of']; VOT=B['VOT']
def load(p):
    z=np.load(p); return sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
G={'base':load('services/graph/data/v13/bolle-eterogeneo-V13-p1.0-triangolo.npz'),
   'LIST tipo':load('.cache/V13-list.npz'),
   'LIST in cov':load('.cache/V13-covlist.npz')}
FILM=[346698,64690,76341,27205,11216,157336,329,603,419430,496243,422,807,240,582,1417,406,11093,62215,97370,
      329865,264660,152601,210577,146233,242582,273481,18148,490,797,5156]
SERIE=[1438,1920,87108,42009,62560,70523,76331,61222,60574,71446]
def top(M,i,k=8):
    r=M.getrow(i)
    if r.nnz==0: return '(nessun arco)'
    g=np.zeros(N,np.float32); g[r.indices]=r.data; g[i]=-1e9
    o=np.argsort(-g)[:k]
    return ' · '.join(T[int(x)] for x in o)
righe=['# LISTE Trakt — 30 film + 10 serie','','`base` = V13 senza liste · `LIST tipo` = nono tipo a peso 1,0 · `LIST in cov` = quinta fonte dentro COVISION (max).','']
for grp,casi,pref in (('Film',FILM,'movie'),('Serie',SERIE,'tv')):
    righe.append(f'## {grp}')
    for t in casi:
        i=RO.get(f'{pref}:{t}')
        if i is None: continue
        righe.append(f'\n**{T[i]}** — `{pref}:{t}` · voti {VOT[i]:.0f}\n')
        for n,M in G.items(): righe.append(f'- {n}: {top(M,i)}')
open('.scratch/distillazione-grafo/check-list.md','w',encoding='utf-8').write('\n'.join(righe)+'\n')
print('scritto check-list.md')
