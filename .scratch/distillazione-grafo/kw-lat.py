"""kw-lat.py — tipo KWLAT: solo le keyword che NON dicono la trama, espanse nel grafo keyword.

  PYTHONPATH=. py .scratch/distillazione-grafo/kw-lat.py [--soglia-cos 0.5] [--per-kw 20] [--k 100]

Per ogni film:
  1. coseno fra la trama e il nome di ognuna delle sue keyword;
  2. si tengono solo quelle sotto la mediana del film (le "latenti": la trama non le dice);
  3. si espandono nel grafo keyword (0,4 PPMI + 0,6 semantica), similarità NON normalizzata;
  4. due film sono collegati dal numero di keyword espanse che condividono.
"""
import argparse, json, time
import numpy as np, pandas as pd, scipy.sparse as sp
import tipi
from services.graph_dense import data as D, config as C
T0=time.time()
ap=argparse.ArgumentParser()
ap.add_argument('--soglia-cos',type=float,default=0.5)
ap.add_argument('--per-kw',type=int,default=20)
ap.add_argument('--k',type=int,default=100)
ap.add_argument('--sem-alpha',type=float,default=0.6)
ap.add_argument('--nome',default='KWLAT')
a=ap.parse_args(); tipi.T0=T0
B=D.basic(); N=B['N']; RO=B['row_of']
# incidenza
per_kw={}
for tipo,f in (('movie','movies.parquet'),('tv','tv.parquet')):
    d=pd.read_parquet(C.TMDB/f,columns=['id','keywords'])
    for r in d.itertuples(index=False):
        i=RO.get(f'{tipo}:{int(r.id)}')
        if i is None: continue
        try: ks={str(x.get('name','')).lower() for x in json.loads(r.keywords or '[]') if isinstance(x,dict)}
        except Exception: continue
        for k in ks: per_kw.setdefault(k,[]).append(i)
kws=sorted(per_kw); ki={k:i for i,k in enumerate(kws)}
rr=[];cc=[]
for k,i in ki.items():
    for f in per_kw[k]: rr.append(f); cc.append(i)
X=sp.csr_matrix((np.ones(len(rr),np.float32),(np.int32(rr),np.int32(cc))),shape=(N,len(kws))); X.data[:]=1.0
df=np.asarray(X.sum(0)).ravel()
print(f'keyword {len(kws):,} · coppie {X.nnz:,}',flush=True)
# 1-2. coseno trama-keyword e selezione delle latenti
Xp,has,_=D.plot_embedding(B)
nomi=(C.DATA/'kw-emb.txt').read_text(encoding='utf-8').split('\n'); pos={k:i for i,k in enumerate(nomi)}
E=np.load(C.DATA/'kw-emb.npy').astype(np.float32); E/=(np.linalg.norm(E,axis=1,keepdims=True)+1e-9)
keep_r,keep_c,keep_w=[],[],[]
for f in range(N):
    if not has[f]: continue
    lo,hi=X.indptr[f],X.indptr[f+1]
    cols=X.indices[lo:hi]
    cos=[]
    for c in cols:
        p=pos.get(kws[c]); cos.append(float(Xp[f]@E[p]) if p is not None else 1.0)
    cos=np.array(cos); med=np.median(cos)
    for c,cs in zip(cols,cos):
        if cs<=med and cs<=a.soglia_cos:
            keep_r.append(f); keep_c.append(int(c)); keep_w.append(1.0-cs)
Xw=sp.csr_matrix((np.float32(keep_w),(np.int32(keep_r),np.int32(keep_c))),shape=(N,len(kws)))
n=np.sqrt(np.asarray(Xw.multiply(Xw).sum(1)).ravel())+1e-9
Xn=(sp.diags(1.0/n)@Xw).tocsr()
print(f'latenti tenute: {Xw.nnz:,} coppie ({100*Xw.nnz/max(X.nnz,1):.0f}% dell\'incidenza) · '
      f'titoli con almeno una: {int((np.asarray(Xw.sum(1)).ravel()>0).sum()):,}',flush=True)
# 3. espansione: grafo keyword PPMI + semantica (righe NON normalizzate a 1: si tiene il punteggio)
nkw=len(kws); marg=df.astype(np.float64)+1e-9
rows,cols2,vals=[],[],[]
blk=1000
for st in range(0,nkw,blk):
    sl=slice(st,min(st+blk,nkw))
    Cb=(X[:,sl].T@X).toarray()
    for r in range(Cb.shape[0]):
        j=st+r; row=Cb[r].copy(); row[j]=0
        c=row; js=np.arange(nkw)
        with np.errstate(divide='ignore',invalid='ignore'):
            pm=np.where(c>0,np.log(c*N/(marg[j]*np.maximum(marg,1))),0.0)
        pm=np.maximum(pm,0)
        o=np.argpartition(-pm,a.per_kw)[:a.per_kw]
        sem=np.array([float(E[pos[kws[q]]]@E[pos[kws[j]]]) if kws[q] in pos and kws[j] in pos else 0.0 for q in o])
        tot=(1-a.sem_alpha)*(pm[o]/(pm[o].max() if pm[o].max()>0 else 1))+a.sem_alpha*sem
        for q,w in zip(o,tot):
            if w>0: rows.append(j); cols2.append(int(q)); vals.append(float(w))
    if (st//blk)%4==0: print(f'  grafo keyword {min(st+blk,nkw):,}/{nkw:,} ({time.time()-T0:.0f}s)',flush=True)
S=sp.csr_matrix((np.float32(vals),(np.int32(rows),np.int32(cols2))),shape=(nkw,nkw))
print(f'grafo keyword: {S.nnz:,} archi',flush=True)
Xe=(Xn@S).tocsr(); Xe.eliminate_zeros(); Xb=(Xe>0).astype(np.float32).tocsr()
print(f'espansione: {Xe.nnz:,} valori',flush=True)
# 4. condivisione: conteggio delle keyword espanse in comune, top-k per riga
XbT=Xb.T.tocsr()
r2,c2,v2=[],[],[]
BL=512
for st in range(0,N,BL):
    Bk=Xb[st:st+BL]
    Sm=(Bk@XbT).tocsr()
    for r in range(Sm.shape[0]):
        lo,hi=Sm.indptr[r],Sm.indptr[r+1]
        if hi<=lo: continue
        seg=Sm.data[lo:hi]; idx=Sm.indices[lo:hi]
        if len(seg)>a.k:
            o=np.argpartition(-seg,a.k)[:a.k]; idx=idx[o]; seg=seg[o]
        r2.extend([st+r]*len(idx)); c2.extend(idx.tolist()); v2.extend(seg.tolist())
    if (st//BL)%20==0: print(f'  condivisione {min(st+BL,N):,}/{N:,} ({time.time()-T0:.0f}s)',flush=True)
M=sp.csr_matrix((np.float32(v2),(np.int32(r2),np.int32(c2))),shape=(N,N))
tipi.save(a.nome,M,f'solo keyword sotto la mediana del coseno con la trama, espanse nel grafo keyword '
          f'(PPMI+semantica alpha {a.sem_alpha}, top-{a.per_kw}); arco = n. keyword espanse condivise; top-{a.k}',
          {'soglia_cos':a.soglia_cos,'per_kw':a.per_kw,'k':a.k,'sem_alpha':a.sem_alpha})
