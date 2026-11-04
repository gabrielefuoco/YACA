"""Confronta vettori di pesi spostati verso il comportamento, con chiusura inclusa."""
import json, sys, numpy as np, scipy.sparse as sp
sys.path.insert(0,'.scratch/distillazione-grafo')
from mixer import correggi_hub, damping_famiglia, rrf, _attributi_produzione
from services.graph import bubbles as BB
from services.graph_dense import data as D
from collections import Counter

B=D.basic(); N=B['N']; T=B['titoli']; RO=B['row_of']; BB.N=N
tipi=sorted(json.load(open('services/graph/data/tipi/manifest.json',encoding='utf-8')))
HUB=('TRAMA','KW','CAST','PROD')
RAW={}
for t in tipi:
    z=np.load(f'services/graph/data/tipi-pesi/{t}.npz')
    RAW[t]=sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
print('RRF per tipo...', flush=True)
R={}
for t in tipi:
    A=correggi_hub(RAW[t],0.25) if t in HUB else RAW[t]
    R[t]=rrf(A,1.0)
print('attributi produzione...', flush=True)
attr=_attributi_produzione(); COLL=B['COLL'].astype(np.int64)
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
def costruisci(pesi):
    M=None
    for t in tipi:
        w=pesi.get(t,1.0)
        A=R[t] if w==1 else R[t].multiply(w).tocsr()
        M=A if M is None else M+A
    M=M.tocsr(); M.setdiag(0); M.eliminate_zeros()
    M=damping_famiglia(M,T,COLL,attr)[0]
    return BB.chiusura_triangolare(M,alpha0=0.1,B=2048,etichetta='-')
def provenienza(M):
    rng=np.random.default_rng(41); cnt=Counter(); soli=Counter(); tot=0
    for i in rng.choice(N,200,replace=False):
        r=M.getrow(int(i))
        if r.nnz==0: continue
        for j in r.indices[np.argsort(-r.data)[:10]]:
            if j==i: continue
            chi=[t for t in tipi if RAW[t][int(i),int(j)]>0]
            for t in chi: cnt[t]+=1
            if len(chi)==1: soli[chi[0]]+=1
            tot+=1
    return {t:100*cnt[t]/tot for t in tipi}, {t:100*soli.get(t,0)/tot for t in tipi}
VAR={
 'attuale':   {'COVISION':1.4,'RRFST':1.15,'KW':1.0,'TRAMA':0.6,'DIR':1.0,'CAST':0.4,'PROD':0.3,'COLL':0.5},
 'beh-alto':  {'COVISION':2.2,'RRFST':1.0,'KW':0.7,'TRAMA':0.5,'DIR':1.0,'CAST':0.4,'PROD':0.3,'COLL':0.5},
 'kw-basso':  {'COVISION':1.4,'RRFST':1.15,'KW':0.5,'TRAMA':0.4,'DIR':1.0,'CAST':0.4,'PROD':0.3,'COLL':0.5},
}
OUT={}
print('\n| variante | R@10 | R@20 | MRR | COVISION quota | COVISION unico | RRFST quota |')
print('|---|---:|---:|---:|---:|---:|---:|')
for n,p in VAR.items():
    M=costruisci(p); OUT[n]=M
    a,b,c=val(M); q,u=provenienza(M)
    print(f'| {n} | {a:.3f} | {b:.3f} | {c:.3f} | {q["COVISION"]:.1f}% | {u["COVISION"]:.1f}% | {q["RRFST"]:.1f}% |', flush=True)
def top(M,i,k=6):
    r=M.getrow(i); o=np.argsort(-r.data)[:k]
    return ' · '.join(T[int(r.indices[x])] for x in o)
for k,lab in [('tv:62560','Mr. Robot'),('tv:87108','Chernobyl'),('movie:346698','Barbie'),('movie:64690','Drive'),
              ('movie:157336','Interstellar'),('movie:11216','Cinema Paradiso'),('movie:329','Jurassic Park'),
              ('tv:1396','Breaking Bad'),('movie:496243','Parasite')]:
    print(f'\n### {lab}')
    for n,M in OUT.items(): print(f'  {n:<10} ' + top(M,RO[k]))
