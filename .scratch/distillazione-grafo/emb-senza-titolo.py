"""Embedding delle TRAME SENZA TITOLO (Qwen3). Serve a togliere la dominanza del marchio."""
import numpy as np, pandas as pd, torch, time
from transformers import AutoModel, AutoTokenizer
from services.graph_dense import data as D, config as C
B=D.basic(); RO=B['row_of']; VOT=B['VOT']
righe=[]; testi=[]
for tipo,f in (('movie','movies.parquet'),('tv','tv.parquet')):
    d=pd.read_parquet(C.TMDB/f,columns=['id','overview'])
    for r in d.itertuples(index=False):
        i=RO.get(f'{tipo}:{int(r.id)}')
        if i is None or VOT[i]<200: continue
        o=r.overview
        if not isinstance(o,str) or len(o.strip())<40: continue
        righe.append(i); testi.append(o.strip())
print(f'trame da embeddare: {len(testi):,} (canone, ≥200 voti)',flush=True)
M='Qwen/Qwen3-Embedding-0.6B'
tok=AutoTokenizer.from_pretrained(M,padding_side='left')
mod=AutoModel.from_pretrained(M,dtype=torch.float16).eval()
dev='cuda' if torch.cuda.is_available() else 'cpu'
if dev=='cuda': torch.cuda.set_per_process_memory_fraction(0.7,0); torch.cuda.empty_cache()
mod=mod.to(dev)
E=np.zeros((len(testi),1024),np.float32); t0=time.time(); BS=32
with torch.inference_mode():
    for st in range(0,len(testi),BS):
        b=tok(testi[st:st+BS],padding=True,truncation=True,max_length=256,return_tensors='pt').to(dev)
        E[st:st+BS]=torch.nn.functional.normalize(mod(**b).last_hidden_state[:,-1,:].float(),dim=1).cpu().numpy()
        if (st//BS)%50==0: print(f'  {st}/{len(testi)} · {time.time()-t0:.0f}s',flush=True)
np.save(C.DATA/'trama-notitle.npy',E); np.save(C.DATA/'trama-notitle-idx.npy',np.array(righe,np.int32))
print(f'salvati {E.shape} in {time.time()-t0:.0f}s',flush=True)
