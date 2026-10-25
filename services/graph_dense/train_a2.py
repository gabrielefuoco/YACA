"""A2 — 512-d + distillazione del collocatore (soft bubble scores V3).

L'idea: il collocatore V3 è il baseline da battere sulla bolla; invece di distillare solo l'SVD
del grafo, si aggiunge una testa che imita le sue **probabilità di bolla** (calcolate con i suoi
stessi centroidi TF-IDF V3), mentre il resto dello studente impara il grafo e la trama.
"""
from __future__ import annotations

import json
import sys
import time

import numpy as np
import scipy.sparse as sp
import torch
import torch.nn.functional as F
from sklearn.decomposition import TruncatedSVD

from . import config as C
from . import data as D
from . import eval as E
from . import teacher as T
from .model import GatedStudent
from .train_a1 import _batch_meta

DIM2 = 512
TEMP_COLL = 0.10
LAMBDA_KL = 0.50


def coll_target(B, bolle, v3=True):
    """Soft target del collocatore V3 sulle 2.922 bolle >= 5 membri, allineato a `bolle`."""
    sys.path.insert(0, str(C.ROOT / "services"))
    from graph import canon as K
    K.DATA = C.SRC
    from graph import collocator as CO
    S3 = CO.carica(v3=v3)
    X = S3["TFIDF"].tocsr().astype(np.float32)
    SUM = S3["SUM"].tocsr().astype(np.float32)
    NORMA = S3["NORMA"].astype(np.float32)
    TUTTE = S3["TUTTE"]
    order = np.array([int(np.where(TUTTE == b)[0][0]) for b in bolle], dtype=np.int64)
    med = S3["med_voti"][TUTTE[order]].astype(np.float32)
    serie = np.isin(TUTTE, S3["bolle_serie"]).astype(bool)[order]
    N = B["N"]; VOT = B["VOT"]; is_tv = B["is_tv"]
    target = np.zeros((N, len(bolle)), dtype=np.float16)
    for st in range(0, N, 4096):
        en = min(st + 4096, N)
        cos = (X[st:en] @ SUM.T)
        cos = cos.toarray() if sp.issparse(cos) else np.asarray(cos)
        cos = cos[:, order] / NORMA[order]
        vc = VOT[st:en]
        for k in range(en - st):
            v = float(vc[k])
            if v > 0:
                ok = (med >= v / 10.0) & (med <= v * 10.0)
                if ok.any():
                    cos[k, ~ok] = -np.inf
            sm = serie == bool(is_tv[st + k])
            if sm.any():
                cos[k, ~sm] = -np.inf
        cos = np.where(np.isfinite(cos), cos, -1e4)
        p = np.exp((cos - cos.max(1, keepdims=True)) / TEMP_COLL)
        p /= p.sum(1, keepdims=True)
        target[st:en] = p.astype(np.float16)
    return target, TUTTE[order]


def main():
    t0 = time.time()
    rng = np.random.default_rng(C.SEED)
    torch.manual_seed(C.SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    B = D.basic(); S = D.triangle()
    sp_ = np.load(C.DATA / "split.npz"); split = {k: sp_[k] for k in sp_.files}
    hold, is_tv, mem, sz = split["holdout"], B["is_tv"], B["mem"], B["sz"]
    tr = T.build(B, S, holdout_mask=hold, salva=False)
    X = D.features(B)
    Xp, hp, _ = D.plot_embedding(B)
    bolle = np.where(sz >= 5)[0]; b2c = np.full(B["NB"], -1, np.int64)
    for k, b in enumerate(bolle): b2c[int(b)] = k
    yb = b2c[mem]
    print("coll target V3...", flush=True)
    target, tutti = coll_target(B, bolle)
    print("target", target.shape, "allineato", bool(np.all(tutti >= 0)), f"t {time.time()-t0:.0f}s", flush=True)
    svd = TruncatedSVD(n_components=DIM2, algorithm="randomized", n_iter=5, random_state=C.SEED)
    U = svd.fit_transform(tr["P_sym"]).astype(np.float32)
    train = (~hold) & tr["has_teacher"]
    def center(Z):
        Q = Z.copy(); mu = np.zeros((2, Z.shape[1]), np.float32)
        for k, m in ((0, ~is_tv), (1, is_tv)):
            mu[k] = Z[train & m].mean(0); Q[m] -= mu[k]
        return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9), mu
    Uc, _ = center(U)
    d_plot = 1 if Xp is None else int(Xp.shape[1])
    plot = torch.zeros((B["N"], d_plot), dtype=torch.float32) if Xp is None else torch.from_numpy(Xp)
    has_plot = torch.zeros(B["N"], dtype=torch.bool) if hp is None else torch.from_numpy(hp)
    is_tv_t = torch.from_numpy(is_tv).to(device)
    plot = plot.to(device); has_plot = has_plot.to(device)
    U_t = torch.from_numpy(Uc).to(device)
    model = GatedStudent(X.shape[1], d_plot=d_plot, d_emb=DIM2, n_bolle=len(bolle)).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=C.LR, weight_decay=C.WD)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=C.EPOCHS, eta_min=1e-4)
    nodes = np.where(train)[0]
    print(f"train {len(nodes):,} · dim {DIM2} · device {device} · t {time.time()-t0:.0f}s", flush=True)
    for ep in range(1, C.EPOCHS + 1):
        model.train(); perm = rng.permutation(nodes); tot = 0.0; nb = 0
        for st in range(0, len(perm), C.BATCH):
            bn = perm[st:st + C.BATCH]
            if len(bn) < 32: continue
            pos = np.empty(len(bn), np.int64)
            for k, u in enumerate(bn):
                val = tr["nbr_idx"][u] >= 0; cand = tr["nbr_idx"][u][val]; p = tr["nbr_w"][u][val].astype(np.float64)
                s = float(p.sum())
                if (not np.isfinite(s)) or s <= 0: pos[k] = int(cand[0]); continue
                p = p / s; pos[k] = int(rng.choice(cand, p=p))
            alln, inv = np.unique(np.concatenate([bn, pos]), return_inverse=True)
            idx, off, val = _batch_meta(X, alln, rng, drop=True)
            idx = idx.to(device); off = off.to(device); val = val.to(device)
            z_all = model(idx, off, val, plot[alln], has_plot[alln], is_tv_t[alln])
            za = z_all[inv[:len(bn)]]; zp = z_all[inv[len(bn):]]
            wmed = torch.where(is_tv_t[bn], C.TV_WEIGHT, 1.0)
            sim = (za @ zp.T) / C.TAU
            same = torch.from_numpy((mem[bn][:, None] == mem[pos][None, :])).to(device)
            same.fill_diagonal_(False); sim = sim.masked_fill(same, -1e4)
            nce = (F.cross_entropy(sim, torch.arange(len(bn), device=device), reduction="none") * wmed).mean()
            svd_l = ((1.0 - (za * U_t[bn]).sum(1)) * wmed).mean()
            lab = torch.from_numpy(yb[bn]).to(device); ok = lab >= 0
            ce = F.cross_entropy(model.bolla_logits(za[ok]), lab[ok], label_smoothing=0.05) if ok.any() else torch.tensor(0.0, device=device)
            tgt = torch.from_numpy(target[bn].astype(np.float32)).to(device)
            tgt = tgt / tgt.sum(1, keepdim=True).clamp_min(1e-9)
            logp = F.log_softmax(model.bolla_logits(za), dim=1)
            kl = F.kl_div(logp, tgt, reduction="batchmean")
            loss = nce + C.LAMBDA_SVD * svd_l + C.LAMBDA_BOLLA * ce + LAMBDA_KL * kl
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 2.0); opt.step()
            tot += float(loss.item()); nb += 1
        sched.step()
        if ep in (1, 3, 5, 10, 15, 20, C.EPOCHS):
            print(f"  ep {ep:2d}/{C.EPOCHS} loss {tot/max(nb,1):.4f} t {time.time()-t0:.0f}s", flush=True)
    model.eval(); Z = np.zeros((B["N"], DIM2), np.float32)
    with torch.no_grad():
        for st in range(0, B["N"], 1024):
            rows = np.arange(st, min(st + 1024, B["N"]))
            idx, off, val = _batch_meta(X, rows, rng, drop=False)
            idx = idx.to(device); off = off.to(device); val = val.to(device)
            Z[rows] = model(idx, off, val, plot[rows], has_plot[rows], is_tv_t[rows]).cpu().numpy()
    Z, mu = center(Z)
    np.savez_compressed(C.DATA / "a2.npz", Z=Z.astype(np.float16), mu=mu.astype(np.float16),
                        proto=model.proto.detach().cpu().numpy().astype(np.float16), dim=np.array(DIM2))
    torch.save(model.state_dict(), C.DATA / "a2-model.pt")
    vic = D.mappa(B)
    bub, own, quart = E.bubble_eval(Z, B, split, vic)
    rec, _ = E.recall_eval(Z, B, split, S, 20)
    coll = json.load(open(C.DATA / "collocator.json"))
    E.salva("a2-metrics", bub, coll, rec, extra={"dim": DIM2, "lambda_kl": LAMBDA_KL,
                                                "tempo_s": time.time() - t0})
    print("A2 bolla own %.3f quart %.3f · recall@20 %.3f · %.1fs" %
          (bub["own"], bub["quartiere"], rec["recall20"], time.time() - t0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
