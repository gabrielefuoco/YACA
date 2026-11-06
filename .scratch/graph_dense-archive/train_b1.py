"""B1: modello a blocchi. Trama e keyword FISSI (la similarita' non si comprime), blocco
meta addestrato sul grafo (la co-visione). Il vettore e' la concatenazione pesata dei blocchi.

Uso: py -m services.graph_dense.train_b1 --epoche 100 --nome b1 --wsem 0.5
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from . import config as C
from . import data as D
from . import eval as E
from . import teacher as T


class BlockStudent(nn.Module):
    def __init__(self, n_meta, d_meta=512, wp=0.8, wk=0.57, wm=1.0):
        super().__init__()
        self.bag = nn.EmbeddingBag(n_meta, 256, mode="sum")
        self.ln = nn.LayerNorm(256)
        self.res = nn.Sequential(nn.Linear(256, 256), nn.LayerNorm(256), nn.GELU(),
                                 nn.Dropout(C.DROP), nn.Linear(256, 256))
        self.proj = nn.Linear(256, d_meta)
        self.wp, self.wk, self.wm = wp, wk, wm

    def forward(self, idx, off, val, bp, bk):
        h = F.gelu(self.ln(self.bag(idx, off, per_sample_weights=val)))
        h = F.normalize(self.proj(h + self.res(h)), dim=1)
        return F.normalize(torch.cat([self.wp * bp, self.wk * bk, self.wm * h], 1), dim=1)


def _batch_meta(X, rows, rng, drop=True):
    sub = X[rows].tocsr()
    idx = torch.from_numpy(sub.indices.astype(np.int64))
    vals = sub.data.astype(np.float32).copy()
    if drop and len(vals):
        keep = rng.random(len(vals)) >= C.FEATURE_DROP
        vals = vals * keep.astype(np.float32) / (1.0 - C.FEATURE_DROP)
    lens = np.diff(sub.indptr).astype(np.int64)
    off = np.r_[0, np.cumsum(lens)[:-1]].astype(np.int64)
    return idx, torch.from_numpy(off), torch.from_numpy(vals)


def _center(Z, train, is_tv):
    Q = Z.copy()
    mu = np.zeros((2, Z.shape[1]), np.float32)
    for k, m in ((0, ~is_tv), (1, is_tv)):
        mu[k] = Z[train & m].mean(0)
        Q[m] -= mu[k]
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9), mu


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dim", type=int, default=512)
    ap.add_argument("--wp", type=float, default=0.8)
    ap.add_argument("--wk", type=float, default=0.57)
    ap.add_argument("--wm", type=float, default=1.0)
    ap.add_argument("--wsem", type=float, default=0.5, help="peso del target semantico")
    ap.add_argument("--sem-target", default="")
    ap.add_argument("--epoche", type=int, default=100)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--drop", type=float, default=0.05)
    ap.add_argument("--fdrop", type=float, default=0.0)
    ap.add_argument("--bank-update", type=int, default=1)
    ap.add_argument("--train-eval", type=int, default=1024)
    ap.add_argument("--seed", type=int, default=C.SEED)
    ap.add_argument("--nome", default="b1")
    a = ap.parse_args(argv)

    t0 = time.time()
    C.DROP = a.drop
    C.FEATURE_DROP = a.fdrop
    rng = np.random.default_rng(a.seed)
    torch.manual_seed(a.seed)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    B = D.basic(); S = D.triangle()
    sp_ = np.load(C.DATA / "split.npz"); split = {k: sp_[k] for k in sp_.files}
    hold, test = split["holdout"], split["test_idx"]
    is_tv, mem, sz = B["is_tv"], B["mem"], B["sz"]
    tr = T.build(B, S, holdout_mask=hold, salva=False)
    N = B["N"]
    train = (~hold) & tr["has_teacher"]
    nodes = np.where(train)[0]
    zbl = np.load(C.DATA / "blocks.npz")
    Bp = torch.from_numpy(zbl["Bp"].astype(np.float32)).to(dev)
    Bk = torch.from_numpy(zbl["Bk"].astype(np.float32)).to(dev)
    keep = zbl["keep"]
    X = D.features(B, extra=True)[:, keep].tocsr()
    print(f"blocchi: trama {Bp.shape[1]} · keyword {Bk.shape[1]} · meta {X.shape[1]:,} · "
          f"pesi {a.wp}/{a.wk}/{a.wm} · wsem {a.wsem}", flush=True)

    SIDX = SW = None
    if a.sem_target:
        zs = np.load(a.sem_target)
        SIDX = torch.from_numpy(zs["idx"].astype(np.int64)).to(dev)
        SW = torch.from_numpy(zs["w"].astype(np.float32)).to(dev)

    model = BlockStudent(X.shape[1], d_meta=a.dim, wp=a.wp, wk=a.wk, wm=a.wm).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=C.LR, weight_decay=C.WD, foreach=False)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a.epoche, eta_min=1e-4)
    pos_idx = torch.from_numpy(np.where(tr["nbr_idx"] >= 0, tr["nbr_idx"], -1).astype(np.int64)).to(dev)
    print(f"train {len(nodes):,} · parametri {sum(p.numel() for p in model.parameters())/1e6:.1f}M · "
          f"vettore {Bp.shape[1] + Bk.shape[1] + a.dim} · device {dev}", flush=True)

    def enc(rows, drop):
        rows = np.asarray(rows)
        rt = torch.from_numpy(rows.astype(np.int64)).to(dev)
        idx, off, val = _batch_meta(X, rows, rng, drop=drop)
        return model(idx.to(dev), off.to(dev), val.to(dev), Bp[rt], Bk[rt])

    def banca():
        model.eval()
        Z = np.zeros((N, Bp.shape[1] + Bk.shape[1] + a.dim), np.float32)
        with torch.no_grad():
            for st in range(0, N, 2048):
                rows = np.arange(st, min(st + 2048, N))
                Z[rows] = enc(rows, drop=False).float().cpu().numpy()
        model.train()
        return torch.from_numpy(Z).to(dev)

    for ep in range(1, a.epoche + 1):
        Zb = banca()
        model.train()
        perm = rng.permutation(nodes)
        tot = 0.0; nb = 0; hit = 0; seen = 0
        for st in range(0, len(perm), a.batch):
            bn = perm[st:st + a.batch]
            if len(bn) < 32:
                continue
            za = enc(bn, drop=True)
            logits = (za @ Zb.T) / C.TAU
            bnt = torch.from_numpy(bn.astype(np.int64)).to(dev)
            logits.scatter_(1, bnt.unsqueeze(1), -1e4)
            righe = S[bn]
            lens = np.diff(righe.indptr)
            ii = np.repeat(np.arange(len(bn)), lens)
            vals = np.power(righe.data.astype(np.float32), 0.5)
            somma = np.add.reduceat(vals, righe.indptr[:-1]).astype(np.float64)
            somma[somma <= 0] = 1.0
            vals = (vals / np.repeat(somma, lens)).astype(np.float32)
            P = torch.zeros((len(bn), N), device=dev)
            P[torch.from_numpy(ii.astype(np.int64)).to(dev),
              torch.from_numpy(righe.indices.astype(np.int64)).to(dev)] = torch.from_numpy(vals).to(dev)
            if SIDX is not None:
                Ps = torch.zeros_like(P)
                Ps.scatter_(1, SIDX[bnt], SW[bnt])
                Ps = Ps / Ps.sum(1, keepdim=True).clamp(min=1e-9)
                P = P + a.wsem * Ps
                P = P / P.sum(1, keepdim=True).clamp(min=1e-9)
            loss = -(P * torch.log_softmax(logits, dim=1)).sum(1).mean()
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            opt.step()
            if a.bank_update:
                model.eval()
                with torch.no_grad():
                    Zb[bnt] = enc(bn, drop=False)
                model.train()
            tot += float(loss.item()); nb += 1
            with torch.no_grad():
                p = pos_idx[bnt]; okp = p >= 0
                top = logits.topk(20, dim=1).indices
                hit += int(sum(len(set(top[k].tolist()) & set(p[k][okp[k]].tolist()))
                               for k in range(len(bn))))
                seen += int(okp.sum())
        sched.step()
        msg = f"  ep {ep:2d}/{a.epoche} loss {tot/max(nb,1):.4f} hit@20 {hit/max(seen,1):.3f}"
        if a.train_eval:
            model.eval()
            with torch.no_grad():
                rs = rng.choice(nodes, min(a.train_eval, len(nodes)), replace=False)
                lg = enc(rs, drop=False) @ Zb.T
                lg.scatter_(1, torch.from_numpy(rs.astype(np.int64)).to(dev).unsqueeze(1), -1e4)
                top = lg.topk(20, dim=1).indices.cpu().numpy()
            hit2 = 0; tot2 = 0
            for k, i in enumerate(rs):
                row = S.getrow(int(i))
                if row.nnz == 0:
                    continue
                o = np.argsort(-row.data)[:20]
                veri = set(int(row.indices[x]) for x in o)
                hit2 += len(veri & set(int(x) for x in top[k]))
                tot2 += len(veri)
            msg += f" · train recall@20 {hit2/max(tot2,1):.3f}"
            model.train()
        if ep <= 3 or ep % 5 == 0 or ep == a.epoche:
            print(msg + f" · t {time.time()-t0:.0f}s", flush=True)

    model.eval()
    Z = np.zeros((N, Bp.shape[1] + Bk.shape[1] + a.dim), np.float32)
    with torch.no_grad():
        for st in range(0, N, 1024):
            rows = np.arange(st, min(st + 1024, N))
            Z[rows] = enc(rows, drop=False).float().cpu().numpy()
    Z, mu = _center(Z, train, is_tv)
    np.savez_compressed(C.DATA / f"{a.nome}.npz", Z=Z.astype(np.float16), mu=mu.astype(np.float16),
                        dim=np.array(Z.shape[1]))
    torch.save(model.state_dict(), C.DATA / f"{a.nome}-model.pt")
    vic = D.mappa(B)
    bub, _, _ = E.bubble_eval(Z, B, split, vic)
    rec, _ = E.recall_eval(Z, B, split, S, 20)
    coll = json.load(open(C.DATA / "collocator.json"))
    E.salva(f"{a.nome}-metrics", bub, coll, rec,
            extra={"epoche": a.epoche, "tempo_s": time.time() - t0, "dim": int(Z.shape[1]),
                   "wp": a.wp, "wk": a.wk, "wm": a.wm, "wsem": a.wsem,
                   "device": dev, "ricetta": "blocchi trama+keyword fissi + meta sul grafo"})
    print("%s own %.3f quartiere %.3f · recall@20 %.3f"
          % (a.nome, bub["own"], bub["quartiere"], rec["recall20"]))
    print("saved %s.npz / %s-metrics.json · t %.1fs" % (a.nome, a.nome, time.time() - t0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
