import os, shutil, subprocess, sys, numpy as np, scipy.sparse as sp
sys.path.insert(0,'.')
from services.graph import bubbles as BB
from services.graph_dense import data as D
B=D.basic(); N=B['N']; BB.N=N; ENV=dict(os.environ, PYTHONPATH='.')
def load(p):
    z=np.load(p); return sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
for tau in (1.0,1.5,2.0):
    subprocess.run([sys.executable,'.scratch/distillazione-grafo/mixer.py','--modo','rrf','--rrf-k','15',
        '--damp-coll','--damp-titolo','--pop-smooth','--pop-slope',str(tau)],env=ENV,check=True,capture_output=True)
    M=load('services/graph/data/v12/MIX-rrf-dc-dt.npz')
    print(f'tau {tau}: chiusura...', flush=True)
    V=BB.chiusura_triangolare(M,alpha0=0.1,B=2048,etichetta=f's{tau}')
    V.setdiag(0); V.eliminate_zeros()
    np.savez_compressed(f'.cache/V15-smooth-{tau}.npz', indptr=V.indptr.astype(np.int64),
                        indices=V.indices.astype(np.int32), data=V.data.astype(np.float32))
shutil.copy('.cache/MIX-v14.bak','services/graph/data/v12/MIX-rrf-dc-dt.npz')
print('ripristinato V14')
