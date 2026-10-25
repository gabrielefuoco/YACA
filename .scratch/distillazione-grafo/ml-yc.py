"""Yc = co-visione MovieLens VERA: SVD 64 dei voti reali (stessi filtri di upstream/spazi-trakt.py).
Niente Ridge, niente metadati. Salva ml-yc.npz: Yc (N,64), mask (film con co-visione)."""
import numpy as np, pandas as pd, time
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import svds
from services.graph_dense import config as C, data as D

CAP, MIN_U, SEED, K = 2000, 20, 20261008, 64
t0=time.time(); B=D.basic(); ro=B["row_of"]; N=B["N"]
r=pd.read_csv(C.ROOT/".cache/movielens/ml-32m/ratings.csv",usecols=["userId","movieId","timestamp"],
              dtype={"userId":"int32","movieId":"int32","timestamp":"int64"})
links=pd.read_csv(C.ROOT/".cache/movielens/ml-32m/links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId":"int64","movieId":"int64"})
mid2tmdb=dict(zip(links["movieId"],links["tmdbId"]))
mv=pd.read_parquet(C.TMDB/"movies.parquet",columns=["id","keywords"])
kw_ok=set(int(i) for i,k in zip(mv["id"],mv["keywords"]) if isinstance(k,str) and k not in ("[]",""))
r=r[r["movieId"].map(lambda m:int(m) in mid2tmdb)]
r["tmdb"]=r["movieId"].map(lambda m:int(mid2tmdb[int(m)]))
r=r[r["tmdb"].map(lambda t:t in kw_ok)]
nu=r.groupby("userId").size(); r=r[r["userId"].isin(set(nu[nu>=MIN_U].index))]
r=r.sort_values("timestamp").groupby("userId").tail(1000)
before=len(r); r=r.sample(frac=1.0,random_state=SEED).groupby("movieId").head(CAP)
print(f"voti {before:,} -> {len(r):,} · utenti {r.userId.nunique():,} · film {r.movieId.nunique():,} · t {time.time()-t0:.0f}s",flush=True)
mids=np.array(sorted(r["movieId"].unique())); mid_pos={int(m):i for i,m in enumerate(mids)}
X=csr_matrix((np.ones(len(r),np.float32),(r["userId"].to_numpy("int32"),r["movieId"].map(mid_pos).to_numpy("int32"))),
             shape=(int(r["userId"].max())+1,len(mids)))
X.sum_duplicates(); X.data[:]=1.0
c_i=np.asarray(X.sum(0)).ravel()
Xw=X.multiply((1.0/np.log1p(np.maximum(c_i,1)))[None,:]).tocsr()
U,S,Vt=svds(Xw,k=K)
Zs=Vt.T/(np.linalg.norm(Vt.T,axis=1,keepdims=True)+1e-9)
print(f"SVD {Zs.shape} · t {time.time()-t0:.0f}s",flush=True)
Yc=np.zeros((N,K),np.float32); mask=np.zeros(N,bool); mid_of=np.array(mids)
for m,pos in mid_pos.items():
    t=int(mid2tmdb[int(m)]); row=ro.get(f"movie:{t}")
    if row is not None: Yc[row]=Zs[pos]; mask[row]=True
np.savez_compressed(C.DATA/"ml-yc.npz", Yc=Yc, mask=mask, mids=mid_of)
print(f"Yc: {int(mask.sum()):,} film con co-visione · t {time.time()-t0:.0f}s",flush=True)
