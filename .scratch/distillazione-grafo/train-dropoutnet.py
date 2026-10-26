"""DropoutNet semplificato: tower item [contenuto | Yc], Yc droppata al 60% in training.
Il tower impara a compensare la mancanza di interazione con il contenuto."""
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from services.graph_dense import config as C, data as D

B = D.basic(); N = B["N"]; ro = B["row_of"]
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
n = np.linalg.norm(Yc, axis=1); has = n > 1e-6
Yc[has] /= n[has, None]
X = np.concatenate([Z, Yc], 1)                      # 2560 + 64
split = np.load(C.DATA / "yc-split.npz"); A = split["A"].astype(np.int64)
train = np.where(has & ~np.isin(np.arange(N), A))[0]
print(f"train {len(train):,} · Set A {len(A):,}", flush=True)
dev = "cuda" if torch.cuda.is_available() else "cpu"
Xt = torch.from_numpy(X).to(dev); Yt = torch.from_numpy(Yc).to(dev)
DIN = X.shape[1]; DC = Z.shape[1]; P = 0.6
net = nn.Sequential(nn.Linear(DIN, 512), nn.GELU(), nn.Dropout(0.2),
                    nn.Linear(512, 64)).to(dev)
opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-2, foreach=False)
rng = np.random.default_rng(0)
for ep in range(30):
    net.train(); perm = rng.permutation(train); tot = 0.0
    for st in range(0, len(perm), 1024):
        rows = torch.from_numpy(perm[st:st + 1024]).to(dev)
        x = Xt[rows].clone()
        drop = (torch.rand(len(rows), device=dev) < P)
        x[drop, DC:] = 0.0                           # droppa la Yc
        e = F.normalize(net(x), dim=1)
        tgt = F.normalize(Yt[rows], dim=1)
        loss = (1.0 - (e @ tgt.T).diagonal()).mean()  # avvicina l'embedding al profilo Yc
        opt.zero_grad(); loss.backward(); opt.step(); tot += float(loss)
    if ep % 10 == 9: print(f" ep {ep+1}/30 loss {tot/(len(perm)//1024+1):.3f}", flush=True)

@torch.no_grad()
def emb(rows):
    net.eval(); out = np.zeros((len(rows), 64), np.float32)
    for st in range(0, len(rows), 2048):
        r = rows[st:st + 2048]
        x = Xt[torch.from_numpy(r).to(dev)].clone(); x[:, DC:] = 0.0   # solo contenuto
        out[st:st + 2048] = F.normalize(net(x), dim=1).cpu().numpy()
    return out
E = emb(A)
cos = (E * F.normalize(Yt[A], dim=1).cpu().numpy()).sum(1)
rec = []
for k, i in enumerate(A):
    gt = np.argsort(-(Yc @ Yc[i]))[:11]; gt = [int(x) for x in gt if x != i][:10]
    sim = E @ E[k]
    top = np.argsort(-sim)[:21]; top = [int(x) for x in top if x != i][:20]
    # i vicini sono indici in A: confronto con i gt nel canone
    rec.append(len(set(int(A[x]) for x in top) & set(gt)) / 10.0)
print(f"\nSet A: cos {cos.mean():.3f} · recall@20 sui vicini Yc {np.mean(rec):.3f}", flush=True)
tot = emb(np.arange(N)); np.savez_compressed(C.DATA / "dropoutnet.npz", E=tot.astype(np.float16))
print("scritto dropoutnet.npz", flush=True)
