import os, shutil, subprocess, sys, numpy as np, scipy.sparse as sp
sys.path.insert(0,'.')
from services.graph import bubbles as BB
from services.graph_dense import data as D
B=D.basic(); N=B['N']; BB.N=N; ENV=dict(os.environ, PYTHONPATH='.')
def load(p):
    z=np.load(p); return sp.csr_matrix((z['data'],z['indices'],z['indptr']),shape=(N,N))
for ms in (1,3):
    shutil.copy(f'.cache/covlist-ms{ms}.npz','services/graph/data/tipi/LIST.npz')
    for cmd in (['tipi.py','norm'],['tipi.py','budget','--pota','100'],
                ['mixer.py','--modo','rrf','--rrf-k','15','--damp-coll','--damp-titolo',
                 '--pop-gap','3.0','--pop-slope','1.5']):
        subprocess.run([sys.executable,f'.scratch/distillazione-grafo/{cmd[0]}']+cmd[1:],env=ENV,check=True,capture_output=True)
    M=load('services/graph/data/v12/MIX-rrf-dc-dt.npz')
    print(f'minsup {ms}: chiusura...', flush=True)
    V=BB.chiusura_triangolare(M,alpha0=0.1,B=2048,etichetta=f'ms{ms}')
    V.setdiag(0); V.eliminate_zeros()
    np.savez_compressed(f'.cache/V14-ms{ms}.npz', indptr=V.indptr.astype(np.int64),
                        indices=V.indices.astype(np.int32), data=V.data.astype(np.float32))
shutil.copy('.cache/LIST-v14.bak','services/graph/data/tipi/LIST.npz')
shutil.copy('.cache/LIST-pesi.bak','services/graph/data/tipi-pesi/LIST.npz')
shutil.copy('.cache/MIX-v13.bak','services/graph/data/v12/MIX-rrf-dc-dt.npz')
print('ripristinato V14 (minsup 2)')
