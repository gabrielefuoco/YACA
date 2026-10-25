"""Diagnostica: quanto bene una TABELLA LIBERA (66k x 256) riesce a rifare la matrice?

Stessa loss di A12/T1 (softmax pieno, target = riga intera, bank aggiornata), ma senza encoder:
ogni titolo ha il suo vettore libero. Se qui il train recall sale alto, il target e' rappresentabile
e il collo di bottiglia e' l'encoder (feature -> vettore). Se resta basso, e' la loss/ottimizzazione.
"""
from __future__ import annotations

import time

import numpy as np
import torch
import torch.nn.functional as F

from services.graph_dense import config as C
from services.graph_dense import data as D
from services.graph_dense import teacher as T

DIM = 512
EPOCHE = 40
GAMMA = 0.5
LR = 1e-2


def main():
    t0 = time.time()
    rng = np.random.default_rng(C.SEED)
    torch.manual_seed(C.SEED)
    dev = "cuda"
    B = D.basic(); S = D.triangle()
    sp = np.load(C.DATA / "split.npz")
    split = {k: sp[k] for k in sp.files}
    hold = split["holdout"]
    tr = T.build(B, S, holdout_mask=hold, salva=False)
    train = (~hold) & tr["has_teacher"]
    nodes = np.where(train)[0]
    N = B["N"]
    E = torch.nn.Embedding(N, DIM).to(dev)
    torch.nn.init.normal_(E.weight, std=0.02)
    opt = torch.optim.AdamW(E.parameters(), lr=LR, weight_decay=0.0)
    samp = rng.choice(nodes, 3000, replace=False)

    def recall(Zb, anchors):
        Za = F.normalize(E(torch.from_numpy(anchors.astype(np.int64)).to(dev)), dim=1)
        lg = Za @ Zb.T
        lg.scatter_(1, torch.from_numpy(anchors.astype(np.int64)).to(dev).unsqueeze(1), -1e4)
        top = lg.topk(20, dim=1).indices.cpu().numpy()
        hit = 0; tot = 0
        for k, i in enumerate(anchors):
            row = S.getrow(int(i))
            if row.nnz == 0:
                continue
            o = np.argsort(-row.data)[:20]
            veri = set(int(row.indices[x]) for x in o)
            hit += len(veri & set(int(x) for x in top[k])); tot += len(veri)
        return hit / max(tot, 1)

    for ep in range(1, EPOCHE + 1):
        E.eval()
        with torch.no_grad():
            Zb = F.normalize(E.weight, dim=1).clone()
        E.train()
        perm = rng.permutation(nodes)
        tot = 0.0; nb = 0
        for st in range(0, len(perm), 256):
            bn = perm[st:st + 256]
            if len(bn) < 32:
                continue
            za = F.normalize(E(torch.from_numpy(bn.astype(np.int64)).to(dev)), dim=1)
            logits = (za @ Zb.T) / C.TAU
            bnt = torch.from_numpy(bn.astype(np.int64)).to(dev)
            logits.scatter_(1, bnt.unsqueeze(1), -1e4)
            righe = S[bn]
            lens = np.diff(righe.indptr)
            ii = np.repeat(np.arange(len(bn)), lens)
            vals = np.power(righe.data.astype(np.float32), GAMMA)
            somma = np.add.reduceat(vals, righe.indptr[:-1]).astype(np.float64)
            somma[somma <= 0] = 1.0
            vals = (vals / np.repeat(somma, lens)).astype(np.float32)
            P = torch.zeros((len(bn), N), device=dev)
            P[torch.from_numpy(ii.astype(np.int64)).to(dev),
              torch.from_numpy(righe.indices.astype(np.int64)).to(dev)] = \
                torch.from_numpy(vals).to(dev)
            loss = -(P * torch.log_softmax(logits, dim=1)).sum(1).mean()
            opt.zero_grad(); loss.backward(); opt.step()
            with torch.no_grad():
                Zb[bnt] = F.normalize(E.weight[bnt], dim=1)
            tot += float(loss.item()); nb += 1
        print(f"  ep {ep:2d}/{EPOCHE} loss {tot/max(nb,1):.4f} "
              f"train recall@20 {recall(Zb, samp):.3f} t {time.time()-t0:.0f}s", flush=True)
    with torch.no_grad():
        Eout = torch.nn.functional.normalize(E.weight, dim=1).cpu().numpy().astype(np.float16)
    np.savez_compressed(C.DATA / "free512.npz", E=Eout, dim=np.array(DIM))
    print("scritto free512.npz", Eout.shape, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
