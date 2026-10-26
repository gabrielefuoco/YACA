"""Pubblico depurato dalla popolarita: PCA-1 tolta dalla Yc, GMM (soft), contenuto -> segmento."""
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from sklearn.mixture import GaussianMixture
from services.graph_dense import config as C, data as D

B = D.basic(); N = B["N"]; ro = B["row_of"]
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
n = np.linalg.norm(Yc, axis=1); has = n > 1e-6
Yc[has] /= n[has, None]
idx = np.where(has)[0]
# togli la prima componente (popolarita) e la direzione media
X = Yc[idx] - Yc[idx].mean(0)
u, s, vt = np.linalg.svd(X, full_matrices=False)
Xr = X - np.outer(X @ vt[0], vt[0])
print(f"varianza 1a PC {s[0]**2/ (s**2).sum():.2f} · residuo usato", flush=True)
K = 30
gm = GaussianMixture(n_components=K, covariance_type="diag", random_state=0, max_iter=200).fit(Xr)
lab = np.full(N, -1, np.int64); lab[idx] = gm.predict(Xr)
print("cluster:", np.bincount(gm.predict(Xr)).tolist(), flush=True)
np.savez_compressed(C.DATA / "yc-segments-gmm.npz", lab=lab, K=K)

split = np.load(C.DATA / "yc-split.npz"); A = split["A"].astype(np.int64)
train = np.where(has & ~np.isin(np.arange(N), A))[0]
dev = "cuda" if torch.cuda.is_available() else "cpu"
Zt = torch.from_numpy(Z).to(dev); Lt = torch.from_numpy(lab).to(dev)
net = nn.Sequential(nn.Linear(Z.shape[1], 1024), nn.GELU(), nn.Dropout(0.2),
                    nn.Linear(1024, 256), nn.GELU(), nn.Dropout(0.1), nn.Linear(256, K)).to(dev)
opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-2, foreach=False)
rng = np.random.default_rng(0)
for ep in range(30):
    net.train(); perm = rng.permutation(train); tot = 0.0
    for st in range(0, len(perm), 1024):
        rows = torch.from_numpy(perm[st:st + 1024]).to(dev)
        loss = F.cross_entropy(net(Zt[rows]), Lt[rows])
        opt.zero_grad(); loss.backward(); opt.step(); tot += float(loss)
    if ep % 10 == 9: print(f" ep {ep+1}/30 loss {tot/(len(perm)//1024+1):.3f}", flush=True)
@torch.no_grad()
def pred(rows):
    net.eval(); out = []
    for st in range(0, len(rows), 2048):
        r = rows[st:st + 2048]
        out.append(net(Zt[torch.from_numpy(r).to(dev)]).argmax(1).cpu().numpy())
    return np.concatenate(out)
P = pred(A)
print(f"\nSet A: accuracy {float((P == lab[A]).mean()):.3f} · baseline {float(np.bincount(lab[A], minlength=K).max()/len(A)):.3f}", flush=True)
torch.save(net.state_dict(), C.DATA / "yc-gmm-model.pt")
CASI = [(597,"Titanic"),(694,"Shining"),(106,"Edward mani di forbice"),(13,"Forrest Gump"),(19995,"Avatar"),
        (680,"Pulp Fiction"),(493922,"Hereditary"),(862,"Toy Story"),(496243,"Parasite"),(872585,"Oppenheimer"),
        (348,"Alien"),(238,"Il padrino"),(881943,"Memoria"),(1024509,"Titane"),(313369,"La La Land")]
for tid, nome in CASI:
    k = f"movie:{tid}"
    if k in ro:
        i = int(ro[k]); print(f"  {nome:22s} GMM={lab[i]:2d} · pred={int(pred(np.array([i]))[0]):2d}", flush=True)
