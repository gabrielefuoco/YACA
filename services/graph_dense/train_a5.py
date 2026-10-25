"""A5: studente con set di cluster keyword (PMA) oltre a metadati e trama.

Rispetto ad A1: il film non ha un solo vettore di keyword ma un set di centroidi di cluster
(L1/L2/L3) con pesi; il `SetPool` lo riduce con multi-head attention. Opzionale: negativi
difficili presi dallo stesso cluster L2 dell'ancora (non vicini nel teacher, non stessa bolla).

Uso: py -m services.graph_dense.train_a5 --dim 256 --hard 0 --nome a5
"""
from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict

import numpy as np
import torch
import torch.nn.functional as F

from . import config as C
from . import data as D
from . import eval as E
from . import teacher as T
from .model import GatedStudent

LEVELS = ("L1", "L2", "L3")


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


def _kw_arrays(tok="cluster"):
    """Tabella da cui fare gather + id/pesi dei token di ogni film.

    `cluster`: 3K token, centroidi dei cluster L1/L2/L3 (multi-vettore di concetti).
    `film`:    K token, embedding bge delle keyword del film, etichettati col cluster L2.
    """
    K = np.load(C.DATA / "kw-set.npz")
    if tok == "film":
        return (K["emb_kw"].astype(np.float32), K["kids"].astype(np.int32),
                K["kw_w"].astype(np.float32), np.zeros(K["kids"].shape[1], np.int64),
                K["ktags"].astype(np.int64), int(K["cent_L2"].shape[0]))
    cent, ids, wts, offs, lvl = [], [], [], [], []
    base = 0
    for i, name in enumerate(LEVELS):
        c = K[f"cent_{name}"].astype(np.float32)
        cent.append(c)
        ids.append(np.where(K[f"ids_{name}"] >= 0, K[f"ids_{name}"].astype(np.int32) + base, -1))
        wts.append(K[f"w_{name}"].astype(np.float32))
        offs.append(base)
        lvl.append(np.full(K[f"ids_{name}"].shape[1], i, np.int64))
        base += c.shape[0]
    return (np.vstack(cent), np.concatenate(ids, 1), np.concatenate(wts, 1),
            np.concatenate(lvl), np.zeros_like(np.concatenate(ids, 1)), 0)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dim", type=int, default=256)
    ap.add_argument("--hard", type=int, default=0, help="negativi difficili per ancora (0 = spento)")
    ap.add_argument("--epoche", type=int, default=C.EPOCHS)
    ap.add_argument("--svd", type=float, default=C.LAMBDA_SVD)
    ap.add_argument("--bolla", type=float, default=C.LAMBDA_BOLLA)
    ap.add_argument("--kw", type=int, default=1)
    ap.add_argument("--extra", type=int, default=0, help="collection/writers/lingua/rating")
    ap.add_argument("--tok", choices=("cluster", "film"), default="cluster")
    ap.add_argument("--batch", type=int, default=C.BATCH)
    ap.add_argument("--nome", default="a5")
    a = ap.parse_args(argv)

    t0 = time.time()
    rng = np.random.default_rng(C.SEED)
    torch.manual_seed(C.SEED)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    B = D.basic(); S = D.triangle()
    sp = np.load(C.DATA / "split.npz")
    split = {k: sp[k] for k in sp.files}
    hold = split["holdout"]; strata = split["strata"]
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

    CENT, IDS, WTS, LVL, TAGS, N_TAGS = _kw_arrays(a.tok)
    print(f"kw-set [{a.tok}]: {IDS.shape[1]} token · tabella {CENT.shape} · "
          f"film con keyword {(IDS >= 0).any(1).mean():.3f}", flush=True)
    members = defaultdict(list)
    if a.hard and a.tok == "cluster":
        for r in range(N):
            for c in IDS[r, 12:24]:
                if c >= 0:
                    members[int(c)].append(r)
    has_kw_film = (IDS >= 0).any(1)

    Xp, hp, _ = D.plot_embedding(B)
    if Xp is None:
        d_plot = 1
        plot = np.zeros((N, d_plot), np.float32)
        hp = np.zeros(N, bool)
        print("trama: assente, ramo plot spento", flush=True)
    else:
        d_plot = int(Xp.shape[1])
        plot = Xp
        print(f"trama: {int(hp.sum()):,}/{N:,} · dim {d_plot}", flush=True)

    model = GatedStudent(X.shape[1], d_plot=d_plot, d_emb=a.dim, n_bolle=len(bolle),
                         d_kw=384 if a.kw else 0,
                         n_levels=len(LEVELS) if a.tok == "cluster" else 0,
                         n_tags=N_TAGS).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=C.LR, weight_decay=C.WD)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a.epoche, eta_min=1e-4)

    CENT_t = torch.from_numpy(CENT).to(dev)
    LVL_t = torch.from_numpy(LVL).to(dev)
    TAGS_t = torch.from_numpy(TAGS.astype(np.int64))
    U_t = torch.from_numpy(U)
    plot_t = torch.from_numpy(plot)
    hp_t = torch.from_numpy(hp)
    is_tv_t = torch.from_numpy(is_tv)
    nodes = np.where(train)[0]
    print(f"train nodes {len(nodes):,} · meta {X.shape} · bolle {len(bolle):,} · "
          f"dim {a.dim} · hard {a.hard} · kw {a.kw} · svd {a.svd} · bolla {a.bolla} · "
          f"device {dev} · t {time.time()-t0:.1f}s", flush=True)

    def enc(rows, drop):
        rows = np.asarray(rows)
        rt = torch.from_numpy(rows.astype(np.int64))
        idx, off, val = _batch_meta(X, rows, rng, drop=drop)
        ids = torch.from_numpy(IDS[rows].astype(np.int64))
        w = torch.from_numpy(WTS[rows])
        m = ids >= 0
        xk = CENT_t[ids.clamp(min=0)].to(torch.float32)
        tag = TAGS_t[rt].to(dev) if N_TAGS else None
        return model(idx.to(dev), off.to(dev), val.to(dev), plot_t[rt].to(dev),
                     hp_t[rt].to(dev), is_tv_t[rt].to(dev),
                     kw=xk, kw_w=w.to(dev), kw_mask=m.to(dev),
                     kw_lvl=LVL_t if a.tok == "cluster" else None, kw_tag=tag)

    for ep in range(1, a.epoche + 1):
        model.train()
        perm = rng.permutation(nodes)
        tot = 0.0; nb = 0
        for st in range(0, len(perm), a.batch):
            bn = perm[st:st + a.batch]
            if len(bn) < 32:
                continue
            pos = np.empty(len(bn), dtype=np.int64)
            for k, u in enumerate(bn):
                val = tr["nbr_idx"][u] >= 0
                cand = tr["nbr_idx"][u][val]
                p = tr["nbr_w"][u][val].astype(np.float64)
                s = float(p.sum())
                if (not np.isfinite(s)) or s <= 0:
                    pos[k] = int(cand[0]); continue
                pos[k] = int(rng.choice(cand, p=p / s))
            hard = []
            if a.hard:
                seen = set(int(x) for x in np.concatenate([bn, pos]))
                for u in bn:
                    nbr = set(int(x) for x in tr["nbr_idx"][u] if x >= 0)
                    l2 = IDS[u, 12:24]
                    pool = members.get(int(l2[l2 >= 0][0]), []) if (l2 >= 0).any() else []
                    got = 0
                    for _ in range(8):
                        if got >= a.hard:
                            break
                        c = int(pool[rng.integers(0, len(pool))]) if len(pool) else -1
                        if c < 0 or c == int(u) or mem[c] == mem[u] or c in nbr or c in seen:
                            c = int(nodes[rng.integers(0, len(nodes))])
                        if mem[c] == mem[u] or c in nbr or c in seen:
                            continue
                        hard.append(c); seen.add(c); got += 1
                    while got < a.hard:
                        hard.append(int(nodes[rng.integers(0, len(nodes))])); got += 1
            cand = np.concatenate([pos, np.array(hard, np.int64)]) if hard else pos
            alln, inv = np.unique(np.concatenate([bn, cand]), return_inverse=True)
            z_all = enc(alln, drop=True)
            za = z_all[inv[:len(bn)]]; zc = z_all[inv[len(bn):]]
            wmed = torch.where(is_tv_t[bn].to(dev), torch.full((len(bn),), C.TV_WEIGHT, device=dev),
                               torch.ones(len(bn), device=dev))
            sim = (za @ zc.T) / C.TAU
            same = torch.from_numpy(mem[bn][:, None] == mem[cand][None, :]).to(dev)
            same.fill_diagonal_(False)
            sim = sim.masked_fill(same, -1e4)
            nce = (F.cross_entropy(sim, torch.arange(len(bn), device=dev), reduction="none") * wmed).mean()
            svd = ((1.0 - (za * U_t[bn].to(dev)).sum(1)) * wmed).mean()
            lab = torch.from_numpy(yb[bn]).to(dev)
            ok = lab >= 0
            bl = (F.cross_entropy(model.bolla_logits(za[ok]), lab[ok], label_smoothing=0.05)
                  if ok.any() else torch.tensor(0.0, device=dev))
            loss = nce + a.svd * svd + a.bolla * bl
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            opt.step()
            tot += float(loss.item()); nb += 1
        sched.step()
        if ep in (1, 3, 5, 10, 15, 20, a.epoche):
            print(f"  ep {ep:2d}/{a.epoche} loss {tot/max(nb,1):.4f} t {time.time()-t0:.0f}s", flush=True)

    model.eval()
    Z = np.zeros((N, a.dim), np.float32)
    with torch.no_grad():
        for st in range(0, N, 1024):
            rows = np.arange(st, min(st + 1024, N))
            Z[rows] = enc(rows, drop=False).float().cpu().numpy()
    Z, mu = _center(Z, train, is_tv)
    np.savez_compressed(C.DATA / f"{a.nome}.npz", Z=Z.astype(np.float16),
                        mu=mu.astype(np.float16),
                        proto=model.proto.detach().cpu().numpy().astype(np.float16),
                        dim=np.array(a.dim))
    torch.save(model.state_dict(), C.DATA / f"{a.nome}-model.pt")
    vic = D.mappa(B)
    bub, own, quart = E.bubble_eval(Z, B, split, vic)
    rec, _ = E.recall_eval(Z, B, split, S, 20)
    coll = json.load(open(C.DATA / "collocator.json"))
    E.salva(f"{a.nome}-metrics", bub, coll, rec,
            extra={"epoche": a.epoche, "tempo_s": time.time() - t0, "dim": a.dim,
                   "hard": a.hard, "device": dev, "svd": a.svd, "bolla_lambda": a.bolla,
                   "kw": a.kw, "batch": a.batch, "tok": a.tok, "extra": int(a.extra),
                   "ricetta": {"kw": a.tok, "pma": True, "K": int(IDS.shape[1])}})
    print("%s bolla own %.3f quartiere %.3f · recall@20 %.3f"
          % (a.nome, bub["own"], bub["quartiere"], rec["recall20"]))
    print("saved %s.npz / %s-metrics.json · t %.1fs" % (a.nome, a.nome, time.time() - t0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
