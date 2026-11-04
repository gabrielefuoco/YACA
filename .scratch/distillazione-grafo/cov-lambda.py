"""LIST dentro COVISION con moltiplicatore: max(COVISION, lam*LIST)."""
import os, subprocess, sys, numpy as np, scipy.sparse as sp
sys.path.insert(0,'.')
from services.graph import bubbles as BB
from services.graph_dense import data as D
B=D.basic(); N=B['N']; BB.N=N
ENV=dict(os.environ, PYTHONPATH='.')
def load(p):
    z=np.load(p); return sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N)).tocsr()
def tronca(M,k=20):
    rows,cols,vals=[],[],[]
    for i in range(N):
        r=M.getrow(i)
        if r.nnz==0: continue
        o=np.argsort(-r.data)[:k]
        rows.append(np.full(len(o),i,np.int32)); cols.append(r.indices[o].astype(np.int32)); vals.append(r.data[o].astype(np.float32))
    S=sp.csr_matrix((np.concatenate(vals),(np.concatenate(rows),np.concatenate(cols))),shape=(N,N))
    S=((S+S.T)*0.5).tocsr(); S.setdiag(0); S.eliminate_zeros(); return S
C=load('.cache/cov-base.bak'); L=load('services/graph_dense/data/covision-list.npz')
for lam in (2.0, 4.0):
    M=C.maximum(L.multiply(lam)).tocsr()
    S=tronca(M)
    np.savez_compressed('services/graph_dense/data/covision.npz', indptr=S.indptr.astype(np.int64),
                        indices=S.indices.astype(np.int32), data=S.data.astype(np.float32), p99=np.array([1.0]))
    subprocess.run([sys.executable,'.scratch/distillazione-grafo/tipi.py','covision'],env=ENV,check=True,capture_output=True)
    subprocess.run([sys.executable,'.scratch/distillazione-grafo/tipi.py','norm'],env=ENV,check=True,capture_output=True)
    subprocess.run([sys.executable,'.scratch/distillazione-grafo/tipi.py','budget','--pota','100'],env=ENV,check=True,capture_output=True)
    subprocess.run([sys.executable,'.scratch/distillazione-grafo/mixer.py','--modo','rrf','--rrf-k','15',
       '--damp-coll','--damp-titolo','--pop-gap','3.0','--pop-slope','1.5',
       '--tipi','COVISION,TRAMA,KW,RRFST,CAST,DIR,PROD,COLL'],env=ENV,check=True,capture_output=True)
    z=np.load('services/graph/data/v12/MIX-rrf-dc-dt.npz')
    Mm=sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
    V=BB.chiusura_triangolare(Mm,alpha0=0.1,B=2048,etichetta=f'lam{lam}')
    V.setdiag(0); V.eliminate_zeros()
    np.savez_compressed(f'.cache/V14-cov-lam{lam}.npz', indptr=V.indptr.astype(np.int64),
                        indices=V.indices.astype(np.int32), data=V.data.astype(np.float32))
    d=np.diff(V.indptr)
    print(f'lam {lam}: {V.nnz:,} archi · copertura {100*(d>0).mean():.1f}%', flush=True)
# ripristino
import shutil
shutil.copy('.cache/cov-base.bak','services/graph_dense/data/covision.npz')
shutil.copy('.cache/cov-tipo.bak','services/graph/data/tipi/COVISION.npz')
shutil.copy('.cache/cov-pesi.bak','services/graph/data/tipi-pesi/COVISION.npz')
import json
json.dump(json.load(open('.cache/pesi-v13.bak',encoding='utf-8')), open('services/graph/data/v12/pesi.json','w',encoding='utf-8'))
print('ripristinato')
