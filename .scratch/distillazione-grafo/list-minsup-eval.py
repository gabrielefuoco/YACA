import os, shutil, subprocess, sys, json, numpy as np, scipy.sparse as sp
sys.path.insert(0,'.')
from services.graph_dense import data as D
B=D.basic(); N=B['N']; RO=B['row_of']; ENV=dict(os.environ, PYTHONPATH='.')
g=json.load(open('.scratch/ml-collaborativo/gold/cross-merged.json',encoding='utf-8'))
casi=[]
for s in g['sources']:
    i=RO.get(s['id'])
    if i is None: continue
    links=[RO[x['id']] for x in s['links'] if x['id'] in RO]
    if links: casi.append((i,links))
def load(p):
    z=np.load(p); return sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
def met(M,subset):
    r10=[];r20=[];mrr=[]
    for i,links in subset:
        r=M.getrow(i)
        if r.nnz==0: r10.append(0);r20.append(0);mrr.append(0);continue
        order={int(j):p+1 for p,j in enumerate(r.indices[np.argsort(-r.data)]) if j!=i}
        r10.append(sum(1 for j in links if order.get(int(j),10**9)<=10)/len(links))
        r20.append(sum(1 for j in links if order.get(int(j),10**9)<=20)/len(links))
        f=[1/order[int(j)] for j in links if int(j) in order]; mrr.append(np.mean(f) if f else 0)
    return np.mean(r10),np.mean(r20),np.mean(mrr)
print('| minsup | archi | copertura | R@10 (solo LIST) | R@10 sui coperti | MRR sui coperti | semi coperti |')
print('|---|---:|---:|---:|---:|---:|---:|')
for ms in (1,2,3):
    src=f'.cache/covlist-ms{ms}.npz'
    shutil.copy(src,'services/graph/data/tipi/LIST.npz')
    subprocess.run([sys.executable,'.scratch/distillazione-grafo/tipi.py','norm'],env=ENV,check=True,capture_output=True)
    subprocess.run([sys.executable,'.scratch/distillazione-grafo/tipi.py','budget','--pota','100'],env=ENV,check=True,capture_output=True)
    subprocess.run([sys.executable,'.scratch/distillazione-grafo/mixer.py','--modo','rrf','--rrf-k','15','--tipi','LIST'],env=ENV,check=True,capture_output=True)
    M=load('services/graph/data/v12/MIX-rrf.npz')
    L=load(src)
    coperti=[(i,l) for i,l in casi if L.getrow(i).nnz>0]
    a=met(M,casi); b=met(M,coperti)
    d=np.diff(L.indptr)
    print(f'| {ms} | {L.nnz:,} | {100*(d>0).mean():.1f}% | {a[0]:.3f} | {b[0]:.3f} | {b[2]:.3f} | {len(coperti)} |', flush=True)
shutil.copy('.cache/LIST-v14.bak','services/graph/data/tipi/LIST.npz')
shutil.copy('.cache/LIST-pesi.bak','services/graph/data/tipi-pesi/LIST.npz')
print('\nripristinato LIST = minsup 2 (V14)')
