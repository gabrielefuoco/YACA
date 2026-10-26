"""Blocco dedicato alla co-visione: MLP contenuto (Z 2560) -> Yc 64d.
Validazione sul Set A (900 film con Yc esclusi dal training)."""
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from services.graph_dense import config as C, data as D

B = D.basic(); N = B["N"]
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)      # contenuto distillato (2560)
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
n = np.linalg.norm(Yc, axis=1); has = n > 1e-6
Yc[has] /= n[has, None]
split = np.load(C.DATA / "yc-split.npz"); A = split["A"].astype(np.int64)
train = np.where(has & ~np.isin(np.arange(N), A))[0]
print(f"train {len(train):,} · Set A {len(A):,}", flush=True)

dev = "cuda" if torch.cuda.is_available() else "cpu"
Zt = torch.from_numpy(Z).to(dev); Yt = torch.from_numpy(Yc).to(dev)
net = nn.Sequential(nn.Linear(Z.shape[1], 1024), nn.GELU(), nn.Dropout(0.2),
                    nn.Linear(1024, 256), nn.GELU(), nn.Dropout(0.1),
                    nn.Linear(256, 64)).to(dev)
opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-2, foreach=False)
rng = np.random.default_rng(0)
for ep in range(30):
    net.train(); perm = rng.permutation(train); tot = 0.0
    for st in range(0, len(perm), 1024):
        rows = torch.from_numpy(perm[st:st + 1024]).to(dev)
        p = F.normalize(net(Zt[rows]), dim=1)
        loss = (1.0 - (p * Yt[rows]).sum(1)).mean()
        opt.zero_grad(); loss.backward(); opt.step(); tot += float(loss)
    if ep % 5 == 4:
        print(f" ep {ep+1}/30 loss {tot/(len(perm)//1024+1):.4f}", flush=True)

@torch.no_grad()
def pred(rows):
    net.eval(); out = np.zeros((len(rows), 64), np.float32)
    for st in range(0, len(rows), 2048):
        r = rows[st:st + 2048]
        out[st:st + 2048] = F.normalize(net(Zt[torch.from_numpy(r).to(dev)]), dim=1).cpu().numpy()
    return out
P = pred(A)
cos = (P * Yc[A]).sum(1)
print(f"\nSet A: cos medio pred-vs-Yc {cos.mean():.3f} (mediana {np.median(cos):.3f})", flush=True)
# recall@20 sui vicini Yc veri, usando la predizione come spazio
rec = []
for k, i in enumerate(A):
    yi = torch.from_numpy(Yc[i]).to(dev)
    gt = np.argsort(-(Yc @ Yc[i]))[:11]; gt = [int(x) for x in gt if x != i][:10]
    p = torch.from_numpy(P[k]).to(dev)
    sim = torch.from_numpy(P).to(dev) @ p
    top = torch.argsort(-sim)[:21].cpu().numpy(); top = [int(x) for x in top if x != i][:20]
    rec.append(len(set(top) & set(gt)) / 10.0)
print(f"Set A: recall@20 sui vicini Yc veri {np.mean(rec):.3f}", flush=True)
np.savez_compressed(C.DATA / "yc-hat.npz", Yc_hat=pred(np.arange(N)), has=has)
print("scritto yc-hat.npz", flush=True)
