"""L'effetto della costante RRF: con k piccolo contano solo i primi ranghi di ogni tipo."""
import json, sys, numpy as np, scipy.sparse as sp
sys.path.insert(0,'.scratch/distillazione-grafo')
from mixer import correggi_hub, damping_famiglia, _attributi_produzione
from services.graph import bubbles as BB
from services.graph_dense import data as D
B=D.basic(); N=B['N']; T=B['titoli']; RO=B['row_of']; BB.N=N
tipi=sorted(json.load(open('services/graph/data/tipi/manifest.json',encoding='utf-8')))
HUB=('TRAMA','KW','CAST','PROD')
PESI={'COVISION':2.2,'RRFST':1.0,'KW':0.7,'TRAMA':0.5,'DIR':1.0,'CAST':0.4,'PROD':0.3,'COLL':0.5}
RAW={}
for t in tipi:
    z=np.load(f'services/graph/data/tipi-pesi/{t}.npz')
    A=sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
    RAW[t]=correggi_hub(A,0.25) if t in HUB else A
attr=_attributi_produzione(); COLL=B['COLL'].astype(np.int64)
g=json.load(open('.scratch/ml-collaborativo/gold/cross-merged.json',encoding='utf-8'))
casi=[]
for s in g['sources']:
    i=RO.get(s['id'])
    if i is None: continue
    l=[(RO[x['id']],float(x.get('w',1))) for x in s['links'] if x['id'] in RO]
    if l: casi.append((i,l))
def rrf(A,k):
    rows,cols,vals=[],[],[]
    for i in range(N):
        r=A.getrow(i)
        if r.nnz==0: continue
        o=np.argsort(-r.data); js=r.indices[o]
        rows.append(np.full(len(js),i,np.int32)); cols.append(js.astype(np.int32))
        vals.append((1.0/(k+np.arange(len(js)))).astype(np.float32))
    return sp.csr_matrix((np.concatenate(vals),(np.concatenate(rows),np.concatenate(cols))),shape=(N,N))
def val(M):
    r10=[];r20=[];mrr=[]
    for i,links in casi:
        r=M.getrow(i)
        if r.nnz==0: r10.append(0);r20.append(0);mrr.append(0);continue
        order=r.indices[np.argsort(-r.data)]; rank={int(j):p+1 for p,j in enumerate(order) if j!=i}
        for kk,acc in ((10,r10),(20,r20)):
            acc.append(sum(1 for j,_ in links if rank.get(int(j),10**9)<=kk)/len(links))
        f=[1/rank[int(j)] for j,_ in links if int(j) in rank]; mrr.append(np.mean(f) if f else 0)
    return np.mean(r10),np.mean(r20),np.mean(mrr)
def top(M,i,k=8):
    r=M.getrow(i); o=np.argsort(-r.data)[:k]
    return ' · '.join(T[int(r.indices[x])] for x in o)
OUT={}
print('| k RRF | R@10 | R@20 | MRR |')
print('|---|---:|---:|---:|')
for K in (5,15,60):
    R={t:rrf(RAW[t],K).multiply(PESI[t]).tocsr() for t in tipi}
    M=None
    for t in tipi: M=R[t] if M is None else M+R[t]
    M=M.tocsr(); M.setdiag(0); M.eliminate_zeros()
    M=damping_famiglia(M,T,COLL,attr)[0]
    M=BB.chiusura_triangolare(M,alpha0=0.1,B=2048,etichetta=f'k{K}')
    OUT[K]=M
    a,b,c=val(M); print(f'| {K} | {a:.3f} | {b:.3f} | {c:.3f} |', flush=True)
for key,lab in [('movie:807','Se7en'),('tv:87108','Chernobyl'),('movie:329','Jurassic Park'),
                ('tv:62560','Mr. Robot'),('tv:71446','La casa di carta'),('movie:346698','Barbie'),
                ('movie:157336','Interstellar'),('movie:64690','Drive'),('movie:422','8 e mezzo'),
                ('tv:42009','Black Mirror'),('movie:496243','Parasite')]:
    print(f'\n### {lab}')
    for K,M in OUT.items(): print(f'  k={K:<3} ' + top(M,RO[key]))
