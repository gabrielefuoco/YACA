"""Pubblico per film da ml-1m (eta/sesso/occupazione) -> predetto dal contenuto.
Validazione sul Set A (900 film con Yc esclusi dal training)."""
import numpy as np, pandas as pd, torch, torch.nn as nn, torch.nn.functional as F
from services.graph_dense import config as C, data as D

ML = C.ROOT / ".cache" / "movielens" / "ml-1m"
users = pd.read_csv(ML / "users.dat", sep="::", engine="python", header=None,
                    names=["u", "gender", "age", "occ", "zip"])
ratings = pd.read_csv(ML / "ratings.dat", sep="::", engine="python", header=None,
                      names=["u", "m", "r", "t"])
movies = pd.read_csv(ML / "movies.dat", sep="::", engine="python", header=None,
                     names=["m", "title", "genres"], encoding="latin-1")
links = pd.read_csv(C.ROOT / ".cache" / "movielens" / "ml-32m" / "links.csv")
# ml-1m movieId -> tmdb
m1m = {int(r.movieId): int(r.tmdbId) for r in links.itertuples() if r.tmdbId == r.tmdbId}
ages = sorted(users.age.unique().tolist()); gs = ["F", "M"]; occs = sorted(users.occ.unique().tolist())
ui = users.set_index("u")
rows = ratings[ratings.m.isin(m1m)].copy()
rows["tmdb"] = rows.m.map(m1m)
B = D.basic(); ro = B["row_of"]
prof = {}
for tid, g in rows.groupby("tmdb"):
    u = ui.loc[g.u]
    a = np.bincount([ages.index(x) for x in u.age], minlength=len(ages)).astype(np.float32)
    gg = np.bincount([gs.index(x) for x in u.gender], minlength=2).astype(np.float32)
    o = np.bincount([occs.index(x) for x in u.occ], minlength=len(occs)).astype(np.float32)
    p = np.concatenate([a / a.sum(), gg / gg.sum(), o / o.sum()])
    key = f"movie:{tid}"
    if key in ro:
        prof[int(ro[key])] = p
print(f"film con profilo: {len(prof):,} · eta {len(ages)} · occ {len(occs)}", flush=True)
lab = np.full((B["N"], 30), np.nan, np.float32)
for i, p in prof.items(): lab[i] = p
np.savez_compressed(C.DATA / "audience.npz", prof=lab, ages=np.array(ages), occ=np.array(occs))

# training: contenuto (Z 2560) -> profilo 30d (3 teste: eta, sesso, occupazione)
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
has = ~np.isnan(lab[:, 0])
split = np.load(C.DATA / "yc-split.npz"); A = split["A"].astype(np.int64)
train = np.where(has & ~np.isin(np.arange(B["N"]), A))[0]
test = np.array([i for i in A if has[i]])
print(f"train {len(train):,} · test Set A con profilo {len(test):,}", flush=True)
dev = "cuda" if torch.cuda.is_available() else "cuda" if False else "cpu"
dev = "cuda" if torch.cuda.is_available() else "cpu"
Zt = torch.from_numpy(Z).to(dev); Yt = torch.from_numpy(lab).to(dev)
net = nn.Sequential(nn.Linear(Z.shape[1], 1024), nn.GELU(), nn.Dropout(0.2),
                    nn.Linear(1024, 256), nn.GELU(), nn.Linear(256, 30)).to(dev)
opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-2, foreach=False)
def loss_fn(p, y):
    la = F.cross_entropy(p[:, :7], y[:, :7].argmax(1))
    lg = F.cross_entropy(p[:, 7:9], y[:, 7:9].argmax(1))
    lo = F.cross_entropy(p[:, 9:30], y[:, 9:30].argmax(1))
    return la + lg + lo
rng = np.random.default_rng(0)
for ep in range(30):
    net.train(); perm = rng.permutation(train); tot = 0.0
    for st in range(0, len(perm), 1024):
        rows_ = torch.from_numpy(perm[st:st + 1024]).to(dev)
        loss = loss_fn(net(Zt[rows_]), Yt[rows_])
        opt.zero_grad(); loss.backward(); opt.step(); tot += float(loss)
    if ep % 10 == 9: print(f" ep {ep+1}/30 loss {tot/(len(perm)//1024+1):.3f}", flush=True)
@torch.no_grad()
def pred(rows_):
    net.eval(); return net(Zt[torch.from_numpy(rows_).to(dev)]).cpu().numpy()
P = pred(test)
acc_a = (P[:, :7].argmax(1) == lab[test, :7].argmax(1)).mean()
acc_g = (P[:, 7:9].argmax(1) == lab[test, 7:9].argmax(1)).mean()
acc_o = (P[:, 9:30].argmax(1) == lab[test, 9:30].argmax(1)).mean()
# baseline: la classe modale del train
ba = np.bincount(lab[train, :7].argmax(1)).argmax(); bg = np.bincount(lab[train, 7:9].argmax(1)).argmax()
bo = np.bincount(lab[train, 9:30].argmax(1)).argmax()
base_a = (lab[test, :7].argmax(1) == ba).mean(); base_g = (lab[test, 7:9].argmax(1) == bg).mean()
base_o = (lab[test, 9:30].argmax(1) == bo).mean()
print(f"\nSet A: eta {acc_a:.3f} (base {base_a:.3f}) · sesso {acc_g:.3f} (base {base_g:.3f}) · occupazione {acc_o:.3f} (base {base_o:.3f})", flush=True)
torch.save(net.state_dict(), C.DATA / "audience-model.pt")
