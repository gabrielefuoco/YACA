"""A1: addestra lo studente gated con EmbeddingBag, loss InfoNCE + SVD + bolla."""
from __future__ import annotations

import argparse
import json
import sys
import time

import numpy as np
import torch
import torch.nn.functional as F

from . import config as C
from . import data as D
from . import eval as E
from . import teacher as T
from .model import GatedStudent


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
    ap.add_argument("--nome", default="a1")
    ap.add_argument("--extra", type=int, default=0)
    a = ap.parse_args(argv)
    t0 = time.time()
    rng = np.random.default_rng(C.SEED)
    torch.manual_seed(C.SEED)
    B = D.basic(); S = D.triangle()
    sp = np.load(C.DATA / "split.npz")
    split = {k: sp[k] for k in sp.files}
    hold = split["holdout"]; test = split["test_idx"]; strata = split["strata"]
    is_tv = B["is_tv"]; mem = B["mem"]; sz = B["sz"]
    tr = T.build(B, S, holdout_mask=hold, salva=False)
    X = D.features(B, extra=bool(a.extra))
    U = np.load(C.DATA / "a0-test.npz")["U"].astype(np.float32)
    N = B["N"]
    train = (~hold) & tr["has_teacher"]
    bolle = np.where(sz >= 5)[0]
    b2c = np.full(B["NB"], -1, dtype=np.int64)
    for k, b in enumerate(bolle):
        b2c[int(b)] = k
    yb = b2c[mem]
    Xp, hp, _ = D.plot_embedding(B)
    if Xp is None:
        d_plot = 1
        plot = torch.zeros((N, d_plot), dtype=torch.float32)
        has_plot = torch.zeros(N, dtype=torch.bool)
        print("trama: assente, ramo plot spento", flush=True)
    else:
        d_plot = int(Xp.shape[1])
        plot = torch.from_numpy(Xp)
        has_plot = torch.from_numpy(hp)
        print(f"trama: {int(hp.sum()):,}/{N:,} · dim {d_plot}", flush=True)
    is_tv_t = torch.from_numpy(is_tv)
    U_t = torch.from_numpy(U)
    model = GatedStudent(X.shape[1], d_plot=d_plot, d_emb=C.DIM, n_bolle=len(bolle))
    opt = torch.optim.AdamW(model.parameters(), lr=C.LR, weight_decay=C.WD)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=C.EPOCHS, eta_min=1e-4)
    nodes = np.where(train)[0]
    print(f"train nodes {len(nodes):,} · meta {X.shape} · bolle {len(bolle):,} · "
          f"device cpu · t {time.time()-t0:.1f}s", flush=True)
    for ep in range(1, C.EPOCHS + 1):
        model.train()
        perm = rng.permutation(nodes)
        tot = 0.0; nb = 0
        for st in range(0, len(perm), C.BATCH):
            bn = perm[st:st + C.BATCH]
            if len(bn) < 32:
                continue
            pos = np.empty(len(bn), dtype=np.int64)
            for k, u in enumerate(bn):
                val = tr["nbr_idx"][u] >= 0
                cand = tr["nbr_idx"][u][val]
                p = tr["nbr_w"][u][val].astype(np.float64)
                s = float(p.sum())
                if (not np.isfinite(s)) or s <= 0:
                    pos[k] = int(cand[0])
                    continue
                p = p / s
                pos[k] = int(rng.choice(cand, p=p))
            alln, inv = np.unique(np.concatenate([bn, pos]), return_inverse=True)
            idx, off, val = _batch_meta(X, alln, rng, drop=True)
            z_all = model(idx, off, val, plot[alln], has_plot[alln], is_tv_t[alln])
            za = z_all[inv[:len(bn)]]; zp = z_all[inv[len(bn):]]
            wmed = torch.where(is_tv_t[bn], C.TV_WEIGHT, 1.0)
            sim = (za @ zp.T) / C.TAU
            same = torch.from_numpy((mem[bn][:, None] == mem[pos][None, :]))
            same.fill_diagonal_(False)
            sim = sim.masked_fill(same, -1e4)
            nce = (F.cross_entropy(sim, torch.arange(len(bn)), reduction="none") * wmed).mean()
            svd = ((1.0 - (za * U_t[bn]).sum(1)) * wmed).mean()
            lab = torch.from_numpy(yb[bn])
            ok = lab >= 0
            if ok.any():
                bl = F.cross_entropy(model.bolla_logits(za[ok]), lab[ok], label_smoothing=0.05)
            else:
                bl = torch.tensor(0.0)
            loss = nce + C.LAMBDA_SVD * svd + C.LAMBDA_BOLLA * bl
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            opt.step()
            tot += float(loss.item()); nb += 1
        sched.step()
        if ep in (1, 3, 5, 10, 15, 20, C.EPOCHS):
            print(f"  ep {ep:2d}/{C.EPOCHS} loss {tot/max(nb,1):.4f} t {time.time()-t0:.0f}s", flush=True)
    model.eval()
    Z = np.zeros((N, C.DIM), np.float32)
    with torch.no_grad():
        for st in range(0, N, 1024):
            rows = np.arange(st, min(st + 1024, N))
            idx, off, val = _batch_meta(X, rows, rng, drop=False)
            Z[rows] = model(idx, off, val, plot[rows], has_plot[rows], is_tv_t[rows]).numpy()
    Z, mu = _center(Z, train, is_tv)
    np.savez_compressed(C.DATA / f"{a.nome}.npz", Z=Z.astype(np.float16), mu=mu.astype(np.float16),
                        proto=model.proto.detach().numpy().astype(np.float16),
                        dim=np.array(C.DIM))
    torch.save(model.state_dict(), C.DATA / f"{a.nome}-model.pt")
    vic = D.mappa(B)
    bub, own, quart = E.bubble_eval(Z, B, split, vic)
    rec, _ = E.recall_eval(Z, B, split, S, 20)
    coll = json.load(open(C.DATA / "collocator.json"))
    E.salva(f"{a.nome}-metrics", bub, coll, rec,
            extra={"epoche": C.EPOCHS, "tempo_s": time.time() - t0, "extra": int(a.extra)})
    print("%s bolla own %.3f quartiere %.3f · recall@20 %.3f"
          % (a.nome, bub["own"], bub["quartiere"], rec["recall20"]))
    print("saved %s.npz / %s-metrics.json · t %.1fs" % (a.nome, a.nome, time.time() - t0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
