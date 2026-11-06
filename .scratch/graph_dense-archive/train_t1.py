"""T1: encoder a token (self-attention) con target = riga intera del grafo.

Stessa ricetta di A10/A12 (softmax pieno, memory bank aggiornata, target = distribuzione della
riga del triangolo), ma l'encoder non somma i token: li tiene come set, ci mette dentro il token
di trama, e fa due layer di self-attention. Il pooling e' il CLS.
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np
import torch
import torch.nn.functional as F

from . import config as C
from . import data as D
from . import eval as E
from . import teacher as T
from .model import TokenStudent

MAX_TOK = 128


def _batch_tokens(X, rows, rng, drop, max_tok=MAX_TOK):
    sub = X[rows].tocsr()
    lens = np.diff(sub.indptr)
    b = len(rows)
    L = int(min(max(int(lens.max()) if len(lens) else 1, 1), max_tok))
    ids = np.zeros((b, L), np.int64)
    vals = np.zeros((b, L), np.float32)
    mask = np.zeros((b, L), bool)
    for k in range(b):
        s, e = sub.indptr[k], sub.indptr[k + 1]
        n = int(min(e - s, L))
        ids[k, :n] = sub.indices[s:s + n]
        v = sub.data[s:s + n].astype(np.float32)
        if drop and n:
            keep = rng.random(n) >= C.FEATURE_DROP
            v = v * keep.astype(np.float32) / (1.0 - C.FEATURE_DROP)
        vals[k, :n] = v
        mask[k, :n] = True
    return torch.from_numpy(ids), torch.from_numpy(vals), torch.from_numpy(mask)


def _center(Z, train, is_tv):
    Q = Z.copy()
    mu = np.zeros((2, Z.shape[1]), np.float32)
    for k, m in ((0, ~is_tv), (1, is_tv)):
        mu[k] = Z[train & m].mean(0)
        Q[m] -= mu[k]
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9), mu


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dim", type=int, default=C.DIM)
    ap.add_argument("--heads", type=int, default=4)
    ap.add_argument("--layers", type=int, default=2)
    ap.add_argument("--epoche", type=int, default=C.EPOCHS)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--drop", type=float, default=C.DROP)
    ap.add_argument("--fdrop", type=float, default=C.FEATURE_DROP)
    ap.add_argument("--bank-update", type=int, default=1)
    ap.add_argument("--bank", type=int, default=512)
    ap.add_argument("--soft", type=int, default=1)
    ap.add_argument("--gamma", type=float, default=0.5)
    ap.add_argument("--bolla", type=float, default=C.LAMBDA_BOLLA)
    ap.add_argument("--extra", type=int, default=1)
    ap.add_argument("--train-eval", type=int, default=1024)
    ap.add_argument("--nome", default="t1")
    a = ap.parse_args(argv)

    t0 = time.time()
    C.DROP = a.drop
    C.FEATURE_DROP = a.fdrop
    rng = np.random.default_rng(C.SEED)
    torch.manual_seed(C.SEED)
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
    nodes = np.where(train)[0]

    Xp, hp, _ = D.plot_embedding(B)
    if Xp is None:
        d_plot, plot, hp = 1, np.zeros((N, 1), np.float32), np.zeros(N, bool)
    else:
        d_plot, plot = int(Xp.shape[1]), Xp
    print(f"token: meta {X.shape} · nnz medi {np.diff(X.indptr).mean():.1f} · "
          f"trama {int(hp.sum()):,} · dim {a.dim} · {a.layers} layer · device {dev}", flush=True)

    model = TokenStudent(X.shape[1], d_plot=d_plot, d_emb=a.dim, n_bolle=len(bolle),
                         heads=a.heads, layers=a.layers).to(dev)
    npar = sum(p.numel() for p in model.parameters())
    print(f"parametri {npar/1e6:.1f}M · train {len(nodes):,}", flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=C.LR, weight_decay=C.WD)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a.epoche, eta_min=1e-4)

    plot_t = torch.from_numpy(plot)
    hp_t = torch.from_numpy(hp)
    is_tv_t = torch.from_numpy(is_tv)
    mem_t = torch.from_numpy(mem.astype(np.int64)).to(dev)
    pos_idx = torch.from_numpy(np.where(tr["nbr_idx"] >= 0, tr["nbr_idx"], -1).astype(np.int64)).to(dev)

    def enc(rows, drop):
        rows = np.asarray(rows)
        rt = torch.from_numpy(rows.astype(np.int64))
        ids, vals, mask = _batch_tokens(X, rows, rng, drop=drop)
        return model(ids.to(dev), vals.to(dev), mask.to(dev), plot_t[rt].to(dev),
                     hp_t[rt].to(dev), is_tv_t[rt].to(dev))

    def banca():
        model.eval()
        Z = np.zeros((N, a.dim), np.float32)
        with torch.no_grad():
            for st in range(0, N, a.bank):
                rows = np.arange(st, min(st + a.bank, N))
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
            p = pos_idx[bnt]
            okp = p >= 0
            if a.soft:
                righe = S[bn]
                lens = np.diff(righe.indptr)
                ii = np.repeat(np.arange(len(bn)), lens)
                vals = righe.data.astype(np.float32)
                if a.gamma != 1.0:
                    vals = np.power(vals, a.gamma)
                somma = np.add.reduceat(vals, righe.indptr[:-1]).astype(np.float64)
                somma[somma <= 0] = 1.0
                vals = (vals / np.repeat(somma, lens)).astype(np.float32)
                P = torch.zeros((len(bn), N), device=dev)
                P[torch.from_numpy(ii.astype(np.int64)).to(dev),
                  torch.from_numpy(righe.indices.astype(np.int64)).to(dev)] = \
                    torch.from_numpy(vals).to(dev)
                nce = -(P * torch.log_softmax(logits, dim=1)).sum(1).mean()
            else:
                lp = logits.gather(1, p.clamp(min=0)).masked_fill(~okp, -1e4)
                nce = -(torch.logsumexp(lp, dim=1) - torch.logsumexp(logits, dim=1)).mean()
            lab = torch.from_numpy(yb[bn]).to(dev)
            ok = lab >= 0
            bl = (F.cross_entropy(model.bolla_logits(za[ok]), lab[ok], label_smoothing=0.05)
                  if ok.any() else torch.tensor(0.0, device=dev))
            loss = nce + a.bolla * bl
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
                zs = enc(rs, drop=False)
                lg = zs @ Zb.T
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
        for st in range(0, N, a.bank):
            rows = np.arange(st, min(st + a.bank, N))
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
                   "drop": a.drop, "fdrop": a.fdrop, "bank_update": a.bank_update,
                   "soft": a.soft, "gamma": a.gamma, "extra": int(a.extra),
                   "layers": a.layers, "heads": a.heads, "device": dev,
                   "ricetta": "token transformer (self-attention) + riga intera del grafo"})
    print("%s own %.3f quartiere %.3f · recall@20 %.3f"
          % (a.nome, bub["own"], bub["quartiere"], rec["recall20"]))
    print("saved %s.npz / %s-metrics.json · t %.1fs" % (a.nome, a.nome, time.time() - t0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
