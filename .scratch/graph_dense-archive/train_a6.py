"""A6: softmax pieno con memory bank multi-positivo.

A5/A1 usano InfoNCE con 1 positivo campionato e 512 negativi in batch. Qui, ogni epoca:

1. si calcola Z per tutto il canone (senza gradiente) -> memory bank;
2. per ogni ancora si ricalcola l'embedding con gradiente e si confronta con *tutti* i
   66.259 titoli (negativi pieni, non 512), con **tutti** i 25 vicini del teacher come
   positivi (multi-positivo): e' la loss che assomiglia di piu' al recall@20;
3. opzionale: termine bolla sui prototipi; niente SVD (il suo recall e' 0,07%).

Uso: py -m services.graph_dense.train_a6 --dim 256 --kw 1 --bolla 0.3 --nome a6
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
    K = np.load(C.DATA / "kw-set.npz")
    if tok == "film":
        return (K["emb_kw"].astype(np.float32), K["kids"].astype(np.int32),
                K["kw_w"].astype(np.float32), np.zeros(K["kids"].shape[1], np.int64),
                K["ktags"].astype(np.int64), int(K["cent_L2"].shape[0]))
    cent, ids, wts, lvl = [], [], [], []
    base = 0
    for i, name in enumerate(LEVELS):
        c = K[f"cent_{name}"].astype(np.float32)
        cent.append(c)
        ids.append(np.where(K[f"ids_{name}"] >= 0, K[f"ids_{name}"].astype(np.int32) + base, -1))
        wts.append(K[f"w_{name}"].astype(np.float32))
        lvl.append(np.full(K[f"ids_{name}"].shape[1], i, np.int64))
        base += c.shape[0]
    return (np.vstack(cent), np.concatenate(ids, 1), np.concatenate(wts, 1),
            np.concatenate(lvl), np.zeros_like(np.concatenate(ids, 1)), 0)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dim", type=int, default=256)
    ap.add_argument("--kw", type=int, default=1)
    ap.add_argument("--bolla", type=float, default=C.LAMBDA_BOLLA)
    ap.add_argument("--epoche", type=int, default=C.EPOCHS)
    ap.add_argument("--bank", type=int, default=256, help="ancore per passo del softmax pieno")
    ap.add_argument("--mask-bolla", type=int, default=0)
    ap.add_argument("--soft", type=int, default=0, help="target = intera riga del grafo (non top-25)")
    ap.add_argument("--gamma", type=float, default=1.0, help="temperatura del target: p ~ w**gamma")
    ap.add_argument("--extra", type=int, default=0)
    ap.add_argument("--tok", choices=("cluster", "film"), default="cluster")
    ap.add_argument("--drop", type=float, default=C.DROP)
    ap.add_argument("--fdrop", type=float, default=C.FEATURE_DROP)
    ap.add_argument("--bank-update", type=int, default=0, help="aggiorna la bank a ogni passo")
    ap.add_argument("--train-eval", type=int, default=1024, help="ancore per il recall di training")
    ap.add_argument("--free", default="", help="npz con E: tabella libera come bank fissa")
    ap.add_argument("--lambda-anchor", type=float, default=1.0, help="peso dell'ancora coseno a E")
    ap.add_argument("--votsup", type=int, default=0, help="denoising: peso * sqrt(min(VOT)/(min+50))")
    ap.add_argument("--target-topk", type=int, default=0, help="target = solo i primi k della riga")
    ap.add_argument("--nopg", type=int, default=0, help="spegne i token paese|decennio|genere")
    ap.add_argument("--init", default="", help="state_dict da cui riprendere")
    ap.add_argument("--lr", type=float, default=C.LR)
    ap.add_argument("--seed", type=int, default=C.SEED)
    ap.add_argument("--ckpt-every", type=int, default=10, help="checkpoint ogni N epoche (0 = mai)")
    ap.add_argument("--resume", default="", help="riprende da un checkpoint {nome}-ckpt.pt")
    ap.add_argument("--noplot", type=int, default=0, help="spegne la trama (vista metadati-only)")
    ap.add_argument("--sem-target", default="", help="npz con idx/w del target semantico")
    ap.add_argument("--wg", type=float, default=0.4, help="peso del grafo nel blend semantico")
    ap.add_argument("--nome", default="a6")
    a = ap.parse_args(argv)

    t0 = time.time()
    C.DROP = a.drop
    C.FEATURE_DROP = a.fdrop
    C.EXTRA_PG = not bool(a.nopg)
    rng = np.random.default_rng(a.seed)
    torch.manual_seed(a.seed)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    B = D.basic(); S = D.triangle()
    sp = np.load(C.DATA / "split.npz")
    split = {k: sp[k] for k in sp.files}
    hold = split["holdout"]
    is_tv = B["is_tv"]; mem = B["mem"]; sz = B["sz"]
    tr = T.build(B, S, holdout_mask=hold, salva=False)
    X = D.features(B, extra=bool(a.extra))
    N = B["N"]
    train = (~hold) & tr["has_teacher"]
    bolle = np.where(sz >= 5)[0]
    b2c = np.full(B["NB"], -1, dtype=np.int64)
    for k, b in enumerate(bolle):
        b2c[int(b)] = k
    yb = b2c[mem]

    CENT, IDS, WTS, LVL, TAGS, N_TAGS = _kw_arrays(a.tok)
    Xp, hp, _ = D.plot_embedding(B)
    d_plot = 1 if Xp is None else int(Xp.shape[1])
    plot = np.zeros((N, 1), np.float32) if Xp is None else Xp
    hp = np.zeros(N, bool) if Xp is None else hp
    print(f"kw {IDS.shape[1]} token · trama {int(hp.sum()):,} · dim {a.dim} · "
          f"device {dev} · softmax pieno su {N:,}", flush=True)

    model = GatedStudent(X.shape[1], d_plot=d_plot, d_emb=a.dim, n_bolle=len(bolle),
                         d_kw=384 if a.kw else 0,
                         n_levels=len(LEVELS) if a.tok == "cluster" else 0,
                         n_tags=N_TAGS).to(dev)
    if a.init:
        sd = torch.load(a.init, map_location=dev, weights_only=True)
        model.load_state_dict(sd)
        print(f"init: {a.init}", flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=C.WD, foreach=False)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a.epoche, eta_min=1e-5)
    start_ep = 1
    if a.resume:
        ck = torch.load(a.resume, map_location=dev, weights_only=False)
        model.load_state_dict(ck["model"])
        opt.load_state_dict(ck["opt"])
        sched.load_state_dict(ck["sched"])
        start_ep = int(ck["epoca"]) + 1
        print(f"resume da {a.resume} · epoca {start_ep}", flush=True)

    CENT_t = torch.from_numpy(CENT).to(dev)
    LVL_t = torch.from_numpy(LVL).to(dev)
    TAGS_t = torch.from_numpy(TAGS.astype(np.int64))
    plot_t = torch.from_numpy(plot)
    hp_t = torch.from_numpy(hp)
    is_tv_t = torch.from_numpy(is_tv)
    mem_t = torch.from_numpy(mem.astype(np.int64)).to(dev)
    pos_idx = torch.from_numpy(np.where(tr["nbr_idx"] >= 0, tr["nbr_idx"], -1).astype(np.int64)).to(dev)
    SIDX = SW = None
    if a.sem_target:
        zs = np.load(a.sem_target)
        SIDX = torch.from_numpy(zs["idx"].astype(np.int64)).to(dev)
        SW = torch.from_numpy(zs["w"].astype(np.float32)).to(dev)
        print(f"target semantico: {tuple(SIDX.shape)} · peso grafo {a.wg}", flush=True)
    Efree = None
    if a.free:
        zf = np.load(a.free)
        Efree = F.normalize(torch.from_numpy(zf["E"].astype(np.float32)).to(dev), dim=1)
        print(f"tabella libera: {tuple(Efree.shape)} · bank fissa, ancora λ={a.lambda_anchor}", flush=True)
    pos_w = torch.from_numpy(tr["nbr_w"].astype(np.float32)).to(dev)
    nodes = np.where(train)[0]
    vic = D.mappa(B)
    print(f"train nodes {len(nodes):,} · meta {X.shape} · bolle {len(bolle):,} · "
          f"t {time.time()-t0:.1f}s", flush=True)

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

    def banca():
        model.eval()
        Z = np.zeros((N, a.dim), np.float32)
        with torch.no_grad():
            for st in range(0, N, 2048):
                rows = np.arange(st, min(st + 2048, N))
                Z[rows] = enc(rows, drop=False).float().cpu().numpy()
        model.train()
        return torch.from_numpy(Z).to(dev)

    for ep in range(start_ep, a.epoche + 1):
        Zb = Efree if Efree is not None else banca()
        model.train()
        perm = rng.permutation(nodes)
        tot = 0.0; nb = 0; hit = 0; seen = 0
        for st in range(0, len(perm), a.bank):
            bn = perm[st:st + a.bank]
            if len(bn) < 32:
                continue
            za = enc(bn, drop=True)
            logits = (za @ Zb.T) / C.TAU
            bnt = torch.from_numpy(bn.astype(np.int64)).to(dev)
            logits.scatter_(1, bnt.unsqueeze(1), -1e4)
            p = pos_idx[bnt]
            okp = p >= 0
            if a.soft:
                righe = S[bn]
                lens = np.diff(righe.indptr)
                ii = np.repeat(np.arange(len(bn)), lens)
                vals = righe.data.astype(np.float32)
                if a.votsup:
                    vi = B["VOT"].astype(np.float64)[bn][ii]
                    vj = B["VOT"].astype(np.float64)[righe.indices]
                    mn = np.minimum(vi, vj)
                    vals = (vals * np.sqrt(mn / (mn + 50.0))).astype(np.float32)
                if a.gamma != 1.0:
                    vals = np.power(vals, a.gamma)
                somma = np.add.reduceat(vals, righe.indptr[:-1]).astype(np.float64)
                somma[somma <= 0] = 1.0
                if a.target_topk:
                    for r in range(len(bn)):
                        s0, e0 = int(righe.indptr[r]), int(righe.indptr[r + 1])
                        if e0 - s0 > a.target_topk:
                            tieni = np.argpartition(-vals[s0:e0], a.target_topk)[:a.target_topk]
                            maschera = np.zeros(e0 - s0, bool); maschera[tieni] = True
                            vals[s0:e0] = np.where(maschera, vals[s0:e0], 0.0)
                    somma = np.add.reduceat(vals, righe.indptr[:-1]).astype(np.float64)
                    somma[somma <= 0] = 1.0
                    vals = (vals / np.repeat(somma, lens)).astype(np.float32)
                P = torch.zeros((len(bn), N), device=dev)
                P[torch.from_numpy(ii.astype(np.int64)).to(dev),
                  torch.from_numpy(righe.indices.astype(np.int64)).to(dev)] =                     torch.from_numpy(vals).to(dev)
                if SIDX is not None:
                    Ps = torch.zeros_like(P)
                    Ps.scatter_(1, SIDX[bnt], SW[bnt])
                    Ps = Ps / Ps.sum(1, keepdim=True).clamp(min=1e-9)
                    P = a.wg * P + Ps
                    P = P / P.sum(1, keepdim=True).clamp(min=1e-9)
                nce = -(P * torch.log_softmax(logits, dim=1)).sum(1).mean()
            else:
                lp = logits.gather(1, p.clamp(min=0)).masked_fill(~okp, -1e4)
                if a.mask_bolla:
                    same = (mem_t[bnt].unsqueeze(1) == mem_t.unsqueeze(0))
                    same.scatter_(1, bnt.unsqueeze(1), False)
                    is_pos = torch.zeros_like(same)
                    is_pos.scatter_(1, p.clamp(min=0), okp)
                    same &= ~is_pos
                    logits = logits.masked_fill(same, -1e4)
                num = torch.logsumexp(lp, dim=1)
                den = torch.logsumexp(logits, dim=1)
                nce = -(num - den).mean()
            lab = torch.from_numpy(yb[bn]).to(dev)
            ok = lab >= 0
            bl = (F.cross_entropy(model.bolla_logits(za[ok]), lab[ok], label_smoothing=0.05)
                  if ok.any() else torch.tensor(0.0, device=dev))
            anc = ((1.0 - (za * Efree[bnt]).sum(1)).mean()
                   if Efree is not None else torch.tensor(0.0, device=dev))
            loss = nce + a.bolla * bl + a.lambda_anchor * anc
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            opt.step()
            if a.bank_update and Efree is None:
                model.eval()
                with torch.no_grad():
                    Zb[bnt] = enc(bn, drop=False)
                model.train()
            tot += float(loss.item()); nb += 1
            with torch.no_grad():
                top = logits.topk(20, dim=1).indices
                hit += int(sum(len(set(top[k].tolist()) & set(p[k][okp[k]].tolist()))
                               for k in range(len(bn))))
                seen += int(okp.sum())
        sched.step()
        if a.ckpt_every and (ep % a.ckpt_every == 0 or ep == a.epoche):
            torch.save({"model": model.state_dict(), "opt": opt.state_dict(),
                        "sched": sched.state_dict(), "epoca": ep, "nome": a.nome},
                       C.DATA / f"{a.nome}-ckpt.pt")
        msg = f"  ep {ep:2d}/{a.epoche} loss {tot/max(nb,1):.4f} hit@20 {hit/max(seen,1):.3f}"
        if a.train_eval:
            model.eval()
            with torch.no_grad():
                rs = rng.choice(nodes, min(a.train_eval, len(nodes)), replace=False)
                zs = enc(rs, drop=False)
                lg = (zs @ Zb.T)
                lg.scatter_(1, torch.from_numpy(rs.astype(np.int64)).to(dev).unsqueeze(1), -1e4)
                top = lg.topk(20, dim=1).indices.cpu().numpy()
            hit2 = 0; tot2 = 0
            for k, i in enumerate(rs):
                row = S.getrow(int(i))
                if row.nnz == 0:
                    continue
                o = np.argsort(-row.data)[:20]
                veri = set(int(row.indices[x]) for x in o)
                hit2 += len(veri & set(int(x) for x in top[k])); tot2 += len(veri)
            msg += f" · train recall@20 {hit2/max(tot2,1):.3f}"
            model.train()
        print(msg + f" · t {time.time()-t0:.0f}s", flush=True)

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
    bub, _, _ = E.bubble_eval(Z, B, split, vic)
    rec, _ = E.recall_eval(Z, B, split, S, 20)
    coll = json.load(open(C.DATA / "collocator.json"))
    E.salva(f"{a.nome}-metrics", bub, coll, rec,
            extra={"epoche": a.epoche, "tempo_s": time.time() - t0, "dim": a.dim,
                   "kw": a.kw, "bolla_lambda": a.bolla, "mask_bolla": a.mask_bolla,
                   "soft": a.soft, "gamma": a.gamma, "extra": int(a.extra), "tok": a.tok,
                   "drop": a.drop, "fdrop": a.fdrop, "bank_update": a.bank_update,
                   "free": a.free, "lambda_anchor": a.lambda_anchor, "votsup": a.votsup,
                   "target_topk": a.target_topk, "sem_target": a.sem_target, "wg": a.wg,
                   "device": dev, "ricetta": "softmax pieno multi-positivo (memory bank)"})
    print("%s bolla own %.3f quartiere %.3f · recall@20 %.3f"
          % (a.nome, bub["own"], bub["quartiere"], rec["recall20"]))
    print("saved %s.npz / %s-metrics.json · t %.1fs" % (a.nome, a.nome, time.time() - t0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
