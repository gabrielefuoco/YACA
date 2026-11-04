"""kw-rare.py — tipo KWRARE: archi solo fra film che condividono ≥2 tag RARI.

  PYTHONPATH=. py .scratch/distillazione-grafo/kw-rare.py [--min-df 5] [--max-df 30] [--min-comuni 2]

Perche' esiste: nel tipo KWEXP la somma sulle keyword era dominata dai tag con piu' portatori
(satire, 561 film), e il tetto idf pareggiava `adventure comedy` (20 film) a `misandry` (6).
Qui il peso e' idf SENZA tetto (log(N/df)) e conta solo il numero di tag RARI condivisi:
un arco esiste se due film condividono almeno `min_comuni` tag con df <= max_df.
"""
import argparse, json, time
import numpy as np, pandas as pd, scipy.sparse as sp
import tipi
from services.graph_dense import data as D, config as C

T0=time.time()
ap=argparse.ArgumentParser()
ap.add_argument('--min-df',type=int,default=5)
ap.add_argument('--max-df',type=int,default=30)
ap.add_argument('--min-comuni',type=int,default=2)
ap.add_argument('--k',type=int,default=100)
ap.add_argument('--nome',default='KWRARE')
a=ap.parse_args(); tipi.T0=T0
B=D.basic(); N=B['N']; RO=B['row_of']
# incidenza
per_kw={}
for tipo,f in (('movie','movies.parquet'),('tv','tv.parquet')):
    d=pd.read_parquet(C.TMDB/f,columns=['id','keywords'])
    for r in d.itertuples(index=False):
        i=RO.get(f'{tipo}:{int(r.id)}')
        if i is None: continue
        try: ks={str(x.get('name','')).lower() for x in json.loads(r.keywords or '[]')}
        except Exception: continue
        for k in ks: per_kw.setdefault(k,[]).append(i)
Xp,has,_=D.plot_embedding(B)
kw=(C.DATA/'kw-emb.txt').read_text(encoding='utf-8').split('\n'); pos={k:i for i,k in enumerate(kw)}
E=np.load(C.DATA/'kw-emb.npy').astype(np.float32)
rari={k:v for k,v in per_kw.items() if a.min_df<=len(v)<=a.max_df}
print(f'keyword totali {len(per_kw):,} · rare ({a.min_df}≤df≤{a.max_df}): {len(rari):,}',flush=True)
# peso di ogni (film, tag): idf senza tetto × (1 - coseno con la trama)
W={}
for k,films in rari.items():
    idf=float(np.log(N/len(films)))
    j=pos.get(k)
    if j is None:
        for i in films: W[(i,k)]=idf
        continue
    e=E[j]
    for i in films:
        c=float(Xp[i]@e) if has[i] else 0.0
        W[(i,k)]=idf*max(0.0,1.0-c)
# coppie
band={}
for k,films in rari.items():
    for x in range(len(films)):
        for y in range(x+1,len(films)):
            i,j=films[x],films[y]
            if i>j: i,j=j,i
            p=(i,j)
            wii=W.get((i,k),0.0); wjj=W.get((j,k),0.0)
            c,acc=band.get(p,(0,0.0))
            band[p]=(c+1,acc+ (wii*wjj)**0.5)
print(f'coppie con ≥1 tag raro condiviso: {len(band):,} ({time.time()-T0:.0f}s)',flush=True)
r_,c_,v_=[],[],[]
for (i,j),(cnt,w) in band.items():
    if cnt<a.min_comuni: continue
    r_.extend([i,j]); c_.extend([j,i]); v_.extend([w,w])
M=sp.csr_matrix((np.float32(v_),(np.int32(r_),np.int32(c_))),shape=(N,N))
print(f'coppie con ≥{a.min_comuni} tag rari: {M.nnz//2:,}',flush=True)
# top-k per riga
r2,c2,v2=[],[],[]
for i in range(N):
    lo,hi=M.indptr[i],M.indptr[i+1]; seg=M.data[lo:hi]
    if len(seg)>a.k:
        o=np.argpartition(-seg,a.k)[:a.k]; idx=M.indices[lo:hi][o]; w=seg[o]
    else: idx=M.indices[lo:hi]; w=seg
    r2.extend([i]*len(idx)); c2.extend(idx.tolist()); v2.extend(w.tolist())
M2=sp.csr_matrix((np.float32(v2),(np.int32(r2),np.int32(c2))),shape=(N,N))
tipi.save(a.nome,M2,f'archi solo fra film che condividono ≥{a.min_comuni} keyword rare '
          f'({a.min_df}≤df≤{a.max_df}), peso = radice del prodotto di idf·(1−cos trama)',
          {'min_df':a.min_df,'max_df':a.max_df,'min_comuni':a.min_comuni,'k':a.k})
