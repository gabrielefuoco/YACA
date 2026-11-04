"""Salva gli embedding dei nomi delle keyword (Qwen3, 1024-d). Una volta sola, poi si riusa.

  PYTHONPATH=. py .scratch/distillazione-grafo/kw-emb-cache.py [--force]
"""
import argparse, numpy as np, torch, time
from transformers import AutoModel, AutoTokenizer
from services.graph_dense import data as D, config as C
ap=argparse.ArgumentParser(); ap.add_argument('--force',action='store_true'); a=ap.parse_args()
V=D.vocab(); kw=[t[3:] for t in V if t.startswith('kw:')]
OUT=C.DATA/'kw-emb.npy'; OUTT=C.DATA/'kw-emb.txt'
if OUT.exists() and not a.force:
    E=np.load(OUT)
    if E.shape[0]==len(kw): print(f'già presente: {E.shape} → non rifaccio'); raise SystemExit
M='Qwen/Qwen3-Embedding-0.6B'
tok=AutoTokenizer.from_pretrained(M,padding_side='left')
mod=AutoModel.from_pretrained(M,dtype=torch.float16).eval()
dev='cuda' if torch.cuda.is_available() else 'cpu'
if dev=='cuda': torch.cuda.set_per_process_memory_fraction(0.7,0); torch.cuda.empty_cache()
mod=mod.to(dev)
E=np.zeros((len(kw),1024),np.float32); t0=time.time(); B=128
with torch.inference_mode():
    for st in range(0,len(kw),B):
        b=tok(kw[st:st+B],padding=True,truncation=True,max_length=32,return_tensors='pt').to(dev)
        E[st:st+B]=torch.nn.functional.normalize(mod(**b).last_hidden_state[:,-1,:].float(),dim=1).cpu().numpy()
        if (st//B)%20==0: print(f'  {st}/{len(kw)} · {time.time()-t0:.0f}s', flush=True)
        if (st//B)==0: print('  primo batch ok, procedo', flush=True)
np.save(OUT,E); OUTT.write_text('\n'.join(kw),encoding='utf-8')
print(f'salvati {E.shape} in {time.time()-t0:.0f}s → {OUT.name} + {OUTT.name}')
