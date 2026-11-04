import json, sys, numpy as np, scipy.sparse as sp
sys.path.insert(0,'.')
from services.graph import bubbles as BB
from services.graph_dense import data as D
B=D.basic(); N=B['N']; T=B['titoli']; RO=B['row_of']; BB.N=N
def load(p):
    z=np.load(p); return sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
print('chiusura su entrambe...', flush=True)
A=BB.chiusura_triangolare(load('.cache/MIX-complesso.npz'),alpha0=0.1,B=1024,etichetta='complessa')
Bs=BB.chiusura_triangolare(load('.cache/MIX-semplice.npz'),alpha0=0.1,B=1024,etichetta='semplice')
np.savez_compressed('.cache/V13-semplice.npz',indptr=Bs.indptr.astype(np.int64),indices=Bs.indices.astype(np.int32),data=Bs.data.astype(np.float32))
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
print('\n| V13 | R@10 | R@20 | MRR | archi |')
print('|---|---:|---:|---:|---:|')
for n,M in (('complessa',A),('semplice',Bs)):
    a,b,c=val(M); print(f'| {n} | {a:.3f} | {b:.3f} | {c:.3f} | {M.nnz:,} |')
def top(M,i,k=8):
    r=M.getrow(i); o=np.argsort(-r.data)[:k]
    return ' · '.join(T[int(r.indices[x])] for x in o)
for k,lab in [('tv:62560','Mr. Robot'),('tv:87108','Chernobyl'),('movie:346698','Barbie'),('movie:496243','Parasite'),
              ('tv:42009','Black Mirror'),('movie:64690','Drive'),('tv:1396','Breaking Bad'),('movie:129','La citta incantata'),
              ('movie:78','Blade Runner'),('tv:1438','The Wire'),('movie:27205','Inception'),('movie:238','Il padrino')]:
    print(f'\n### {lab}\n  complessa ' + top(A,RO[k]) + '\n  semplice  ' + top(Bs,RO[k]))
