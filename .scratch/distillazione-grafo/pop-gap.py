"""Penalità sul salto di popolarità fra seme e candidato, applicata dopo la miscela."""
import json, sys, numpy as np, scipy.sparse as sp
sys.path.insert(0,'.')
from services.graph import bubbles as BB
from services.graph_dense import data as D
B=D.basic(); N=B['N']; T=B['titoli']; VOT=B['VOT']; RO=B['row_of']; BB.N=N
z=np.load('services/graph/data/v12/MIX-rrf-dc-dt.npz')
BASE=sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N)).tocsr()
L=np.log1p(np.maximum(VOT,0))
g=json.load(open('.scratch/ml-collaborativo/gold/cross-merged.json',encoding='utf-8'))
casi=[]
for s in g['sources']:
    i=RO.get(s['id'])
    if i is None: continue
    l=[(RO[x['id']],float(x.get('w',1))) for x in s['links'] if x['id'] in RO]
    if l: casi.append((i,l))
def val(M):
    r10=[];r20=[];mrr=[]
    for i,links in casi:
        r=M.getrow(i)
        if r.nnz==0: r10.append(0);r20.append(0);mrr.append(0);continue
        order=r.indices[np.argsort(-r.data)]; rank={int(j):p+1 for p,j in enumerate(order) if j!=i}
        for k,acc in ((10,r10),(20,r20)):
            acc.append(sum(1 for j,_ in links if rank.get(int(j),10**9)<=k)/len(links))
        f=[1/rank[int(j)] for j,_ in links if int(j) in rank]; mrr.append(np.mean(f) if f else 0)
    return np.mean(r10),np.mean(r20),np.mean(mrr)
def applica(M,tau,slope):
    C=M.tocoo()
    gap=np.abs(L[C.col]-L[C.row])
    f=np.exp(-np.maximum(0.0,gap-tau)/slope).astype(np.float32)
    out=sp.csr_matrix((C.data*f,(C.row,C.col)),shape=(N,N)).tocsr()
    out.setdiag(0); out.eliminate_zeros()
    return out,float((f<0.95).mean())
def bmovie(M,seeds,k=10,thr=50):
    tot=low=0
    for i in seeds:
        r=M.getrow(int(i))
        if r.nnz==0: continue
        for j in r.indices[np.argsort(-r.data)[:k]]:
            if j==i: continue
            tot+=1; low+= VOT[j]<thr
    return 100*low/max(tot,1)
def top(M,i,k=8):
    r=M.getrow(i); o=np.argsort(-r.data)[:k]
    return ' · '.join(T[int(r.indices[x])] for x in o)
rng=np.random.default_rng(7); film=[int(i) for i in rng.choice(np.flatnonzero(~B['is_tv']),300,replace=False)]
VAR={'nessuna':BASE,'soglia 3 (dolce)':None,'soglia 2 (media)':None}
print('| variante | R@10 | R@20 | MRR | <50 voti | archi colpiti |')
print('|---|---:|---:|---:|---:|---:|')
OUT={}
for nome,tau,slope in (('nessuna',None,None),('soglia 3 (dolce)',3.0,1.5),('soglia 2 (media)',2.0,1.0)):
    if tau is None: M=BASE; colp=0.0
    else: M,colp=applica(BASE,tau,slope)
    M=BB.chiusura_triangolare(M,alpha0=0.1,B=2048,etichetta=nome); OUT[nome]=M
    a,b,c=val(M)
    print(f'| {nome} | {a:.3f} | {b:.3f} | {c:.3f} | {bmovie(M,film):.1f}% | {100*colp:.1f}% |', flush=True)
for k,lab in [('movie:329','Jurassic Park'),('tv:62560','Mr. Robot'),('tv:87108','Chernobyl'),
              ('movie:872585','Oppenheimer'),('movie:496243','Parasite'),('movie:346698','Barbie'),
              ('movie:157336','Interstellar'),('tv:1396','Breaking Bad')]:
    print(f'\n### {lab}')
    for n,M in OUT.items(): print(f'  {n:<17} ' + top(M,RO[k]))
