"""40 film + 20 serie: nessuna vs soglia 3 vs soglia 2, con metriche oggettive."""
import json, sys, numpy as np, scipy.sparse as sp
sys.path.insert(0,'.')
from services.graph import bubbles as BB
from services.graph_dense import data as D
B=D.basic(); N=B['N']; T=B['titoli']; VOT=B['VOT']; RO=B['row_of']; BB.N=N
z=np.load('services/graph/data/v12/MIX-rrf-dc-dt.npz')
BASE=sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N)).tocsr()
L=np.log1p(np.maximum(VOT,0))
def applica(M,tau,slope):
    if tau is None: return M
    C=M.tocoo()
    gap=np.abs(L[C.col]-L[C.row])
    f=np.exp(-np.maximum(0.0,gap-tau)/slope).astype(np.float32)
    out=sp.csr_matrix((C.data*f,(C.row,C.col)),shape=(N,N)).tocsr()
    out.setdiag(0); out.eliminate_zeros(); return out
OUT={}
for nome,tau,slope in (('nessuna',None,None),('soglia 3',3.0,1.5),('soglia 2',2.0,1.0)):
    M=applica(BASE,tau,slope)
    M=BB.chiusura_triangolare(M,alpha0=0.1,B=2048,etichetta=nome); OUT[nome]=M
FILM=[346698,64690,76341,27205,11216,157336,329,603,419430,496243,422,807,240,582,1417,406,11093,62215,97370,
      329865,264660,152601,210577,146233,242582,273481,18148,490,797,5156,429,637,78,550,694,28,194,128,313369,244786]
SERIE=[1438,1920,87108,42009,62560,70523,76331,61222,60574,71446,1396,63351,100088,66732,93405,1399,2316,1398,60059,1434]
def top(M,i,k=10):
    r=M.getrow(i)
    if r.nnz==0: return []
    g=np.zeros(N,np.float32); g[r.indices]=r.data; g[i]=-1e9
    return [int(x) for x in np.argsort(-g)[:k]]
seeds=[(f'movie:{t}',t,'F') for t in FILM]+[(f'tv:{t}',t,'S') for t in SERIE]
print('| variante | trash <100 voti | nicchia 200-3000 (semi >5k voti) | ripetuti <100 voti |')
print('|---|---:|---:|---:|')
import collections
for nome,M in OUT.items():
    trash=[]; niche=[]; rep=collections.Counter()
    for key,t,kind in seeds:
        i=RO.get(key)
        if i is None: continue
        tp=[j for j in top(M,i) if j!=i]
        if not tp: continue
        trash.extend(1 for j in tp if VOT[j]<100)
        if VOT[i]>5000: niche.extend(1 for j in tp if 200<=VOT[j]<=3000)
        for j in tp:
            if VOT[j]<100: rep[j]+=1
    tot=len([1 for key,t,kind in seeds if RO.get(key) is not None])*10
    rep5=sum(1 for j,c in rep.items() if c>=5)
    print(f'| {nome} | {100*len(trash)/max(tot,1):.1f}% | {100*len(niche)/max(tot,1):.1f}% | {rep5} titoli in ≥5 semi |')
# elenco delle differenze
righe=['# Penalità di popolarità — 40 film + 20 serie','']
for nome,lab in (('nessuna','Senza penalità'),('soglia 3','Soglia 3,0'),('soglia 2','Soglia 2,0')):
    pass
for key,t,kind in seeds:
    i=RO.get(key)
    if i is None: continue
    liste={n:top(M,i,6) for n,M in OUT.items()}
    if len({tuple(v) for v in liste.values()})==1: continue
    righe.append(f'\n**{T[i]}** — `{key}`\n')
    for n,v in liste.items(): righe.append(f'- {n}: ' + ' · '.join(T[j] for j in v))
open('.scratch/distillazione-grafo/pop-gap-large.md','w',encoding='utf-8').write('\n'.join(righe)+'\n')
print('\ndifferenze scritte in pop-gap-large.md')
