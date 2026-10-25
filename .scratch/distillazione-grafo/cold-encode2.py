"""Encode cold-start (niente pyarrow): legge feature/trama dal disco e usa lc150/m1/b10."""
import json, sys, numpy as np, scipy.sparse as sp, torch, torch.nn.functional as F
from services.graph_dense import config as C, data as D
from services.graph_dense.model import GatedStudent
from services.graph_dense.train_b3 import BlockStudentG, FieldStudent
from services.graph_dense.train_b1 import _batch_meta
B=D.basic(); ro=B["row_of"]; date=np.load(C.DATA/"uscite-ordinali.npy"); N=B["N"]
X0=sp.load_npz(C.DATA/"cold-feats.npz").tocsr()
z=sp.load_npz(C.DATA/"cold-feats.npz"); del z
pl=np.load(C.DATA/"cold-plot.npz"); tids=[int(t) for t in pl["tids"]]; PV={int(t):e for t,e in zip(pl["tids"],pl["emb"])}
meta=json.load(open(C.DATA/"cold-meta.json",encoding="utf-8"))
keep=np.load(C.DATA/"blocks.npz")["keep"]; fids=np.load(C.DATA/"cold-fids.npy"); nomi=json.load(open(C.DATA/"cold-nomi.json",encoding="utf-8"))
V=D.vocab(); kwcols=np.array([c for t,c in V.items() if t.startswith("kw:")],dtype=np.int64)
rng=np.random.default_rng(42); R=rng.choice(np.array([-1.,1.],np.float32),size=(len(kwcols),512))/np.sqrt(512)
Xk=X0[:,keep].tocsr(); Xkk=X0[:,kwcols].tocsr()
n=np.sqrt(np.asarray(Xkk.multiply(Xkk).sum(1)).ravel())+1e-9; Xkk=sp.diags(1/n)@Xkk
BK=np.asarray(Xkk@R,np.float32); BK/= (np.linalg.norm(BK,axis=1,keepdims=True)+1e-9)
dev="cuda" if torch.cuda.is_available() else "cpu"
lc=GatedStudent(X0.shape[1],d_plot=1024,d_emb=512,n_bolle=2922,d_kw=0).to(dev)
lc.load_state_dict(torch.load(C.DATA/"lc150-model.pt",map_location=dev,weights_only=True)); lc.eval()
fm=FieldStudent(Xk.shape[1],len(nomi),d_field=64,d_meta=512,n_blocks=3).to(dev)
fm.load_state_dict(torch.load(C.DATA/"m1-model.pt",map_location=dev,weights_only=True)); fm.eval()
bm=BlockStudentG(Xk.shape[1],d_meta=512,n_blocks=4).to(dev)
bm.load_state_dict(torch.load(C.DATA/"b10-model.pt",map_location=dev,weights_only=True)); bm.eval()
z1=np.load(C.DATA/"m1.npz"); mu1=z1["mu"].astype(np.float32); Z1=z1["Z"].astype(np.float32)
zb=np.load(C.DATA/"b10.npz"); mub=zb["mu"].astype(np.float32); Zb=zb["Z"].astype(np.float32)
f1=torch.tensor([0.3**.5,0.2**.5,0.5**.5],device=dev); fb=torch.tensor([0.3**.5,0.3**.5,0.3**.5,0.1**.5],device=dev)
def t_(i):
    a=int(date[i]//365.25+1970) if date[i]>0 else 0
    return f"{B['titoli'][int(i)]} ({a})" if a else B["titoli"][int(i)]
for q,tid in enumerate(tids):
    pv=torch.from_numpy(PV[tid]).to(dev).view(1,-1); bkv=torch.from_numpy(BK[q:q+1]).to(dev)
    i0=np.array([q]); idx,off,val=_batch_meta(X0,i0,np.random.default_rng(0),drop=False)
    with torch.no_grad():
        lcz=lc(idx.to(dev),off.to(dev),val.to(dev),pv,torch.ones(1,device=dev),torch.zeros(1,dtype=torch.long,device=dev)).float().cpu().numpy().ravel()
        idx2,off2,val2=_batch_meta(Xk,i0,np.random.default_rng(0),drop=False)
        fi=torch.from_numpy(fids.astype(np.int64)).to(dev)
        h1=fm._meta(idx2.to(dev),off2.to(dev),val2.to(dev),fi[idx2.to(dev)]); hp=F.normalize(fm.proj(h1),dim=1)[0]
        hb=F.gelu(bm.ln(bm.bag(idx2.to(dev),off2.to(dev),per_sample_weights=val2.to(dev))))
        hb=F.normalize(bm.proj(hb+bm.res(hb)),dim=1)[0]
    zm=torch.cat([f1[0]*pv[0],f1[1]*bkv[0],f1[2]*hp]).float().cpu().numpy(); zm=zm-mu1[0]; zm/=np.linalg.norm(zm)+1e-9
    zn=np.concatenate([(fb[0]*pv[0]).cpu().numpy(),(fb[1]*bkv[0]).cpu().numpy(),float(fb[2])*lcz,(fb[3]*hb).cpu().numpy()]); zn=zn-mub[0]; zn/=np.linalg.norm(zn)+1e-9
    m=meta.get(str(tid),{}); print(f"\n{tid} {m.get('title')} ({m.get('release')})")
    print("  m1 : "+" · ".join(t_(x) for x in np.argsort(-(Z1@zm))[:10]))
    print("  b10: "+" · ".join(t_(x) for x in np.argsort(-(Zb@zn))[:10]))
