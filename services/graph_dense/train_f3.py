"""Training f3 — tre rami, tre loss pure, nessuna loss sul concatenato.

L = CE_full(z_sem, T_mercury) + CE_full(z_field, T_fusion_v2) + CE_full(z_beh, T_beh)
CE_full: softmax su TUTTI i 66.259 titoli, temperatura TAU, self escluso, maschera valid.

Uso:
  py -m services.graph_dense.train_f3 --epoche 40 --nome f3 --refresh 1 --ckpt-every 10
"""
from __future__ import annotations

import argparse
import time

import numpy as np
import torch
import torch.nn.functional as F

from . import config as C
from . import data as D
from . import fields as FLD
from .model_f3 import F3
from .train_b1 import _batch_meta


def load_target(path, dev):
    z = np.load(path)
    raw = z["idx"].astype(np.int64)
    valid = torch.from_numpy((raw >= 0).any(1)).to(dev)
    idx = torch.from_numpy(np.where(raw >= 0, raw, 0)).to(dev)
    w = torch.from_numpy(z["w"].astype(np.float32)).to(dev)
    w = w / (w.sum(1, keepdim=True) + 1e-9)
    return idx, w, valid


def full_ce(logits, rows_t, idx, w, valid, tau):
    logits = logits / tau
    logits.scatter_(1, rows_t.unsqueeze(1), -1e4)          # esclude self
    log_p = F.log_softmax(logits, dim=1)                   # softmax su TUTTO il canone
    lp = log_p.gather(1, idx)
    ce = -(w * lp).sum(1)
    vm = valid.float()
    return (ce * vm).sum() / vm.sum().clamp(min=1e-9)


def fit_score(Z, idx, w, k=20, bs=4096):
    """coseno medio pesato sui primi k target (stessa definizione del 'fit' dell'handoff)."""
    sel = idx[:, :k]
    tot = 0.0; n = 0
    for st in range(0, Z.shape[0], bs):
        z = Z[st:st + bs]
        cos = (z[:, None, :] * Z[sel[st:st + bs]]).sum(-1)   # (bs, k)
        tot += float((w[st:st + bs, :k] * cos).sum(1).sum())
        n += cos.shape[0]
    return tot / max(n, 1)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--epoche", type=int, default=40)
    ap.add_argument("--batch", type=int, default=1024)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--tau", type=float, default=0.07)
    ap.add_argument("--nome", default="f3")
    ap.add_argument("--sem-target", default="mercury-target.npz")
    ap.add_argument("--field-target", default="fusion-target-v2.npz")
    ap.add_argument("--beh-target", default="beh-target-v2.npz")
    ap.add_argument("--ckpt-every", type=int, default=10)
    ap.add_argument("--refresh", type=int, default=1)
    ap.add_argument("--no-centroid", action="store_true", help="togli mu_dir/mu_coll dal transformer")
    ap.add_argument("--resume", default="")
    ap.add_argument("--seed", type=int, default=20261025)
    a = ap.parse_args(argv)

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    B = D.basic(); N = B["N"]
    keep = np.load(C.DATA / "canon-clean.npz")["keep"]
    X = D.features(B, extra=True).tocsr()
    fids, nomi = FLD.meta_field_ids(B)
    FI = torch.from_numpy(fids.astype(np.int64)).to(dev)
    Bp = np.load(C.DATA / "trama-qwen3b.npy").astype(np.float32)
    Bp /= (np.linalg.norm(Bp, axis=1, keepdims=True) + 1e-9)
    Bk = np.load(C.DATA / "blocks.npz")["Bk"].astype(np.float32)
    cen = np.load(C.DATA / "centroids.npz")
    mu_dir = cen["mu_dir"].astype(np.float32); mu_coll = cen["mu_coll"].astype(np.float32)
    SIDX, SW, SVAL = load_target(C.DATA / a.sem_target, dev)
    FIDX, FW, FVAL = load_target(C.DATA / a.field_target, dev)
    BIDX, BW, BVAL = load_target(C.DATA / a.beh_target, dev)

    sp = np.load(C.DATA / "split.npz")
    test = np.concatenate([np.asarray(sp[k]) for k in sp.files])
    train = np.setdiff1d(np.arange(N), np.unique(test))
    train = train[keep[train]]
    # Set A (induttivo): fuori dal training e dai centroidi
    ycs = C.DATA / "yc-split.npz"
    if ycs.exists():
        train = np.setdiff1d(train, np.load(ycs)["A"])
        print(f"Set A escluso dal training · train {len(train):,}", flush=True)

    model = F3(X.shape[1], len(nomi), use_cent=not a.no_centroid).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01, foreach=False)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, a.epoche)
    if a.resume:
        ck = torch.load(a.resume, map_location=dev)
        model.load_state_dict(ck["model"]); opt.load_state_dict(ck["opt"])
        sched.load_state_dict(ck["sched"]); ep0 = ck["epoca"] + 1
        print("ripreso da", a.resume, "epoca", ep0)
    else:
        ep0 = 0
    rng = np.random.default_rng(a.seed)

    @torch.no_grad()
    def z_all():
        model.eval()
        zs = np.zeros((N, 768), np.float32); zf = np.zeros((N, 768), np.float32)
        zb = np.zeros((N, 512), np.float32)
        for st in range(0, N, 2048):
            rows = np.arange(st, min(st + 2048, N))
            idx, off, val = _batch_meta(X, rows, rng, drop=False)
            z1, z2, z3 = model(torch.from_numpy(Bp[rows]).to(dev), torch.from_numpy(Bk[rows]).to(dev),
                               idx.to(dev), off.to(dev), val.to(dev), FI[idx.to(dev)],
                               torch.from_numpy(mu_dir[rows]).to(dev),
                               torch.from_numpy(mu_coll[rows]).to(dev))
            zs[rows] = z1.float().cpu().numpy(); zf[rows] = z2.float().cpu().numpy()
            zb[rows] = z3.float().cpu().numpy()
        model.train()
        return (torch.from_numpy(zs).to(dev), torch.from_numpy(zf).to(dev),
                torch.from_numpy(zb).to(dev))

    ZS, ZF, ZB = z_all()
    t0 = time.time()
    for ep in range(ep0, a.epoche):
        if ep and ep % a.refresh == 0:
            ZS, ZF, ZB = z_all()
        perm = rng.permutation(train)
        tot = 0.0; nb = 0; ls = lf = lb = None
        for st in range(0, len(perm), a.batch):
            rows = perm[st:st + a.batch]
            idx, off, val = _batch_meta(X, rows, rng)
            rt = torch.from_numpy(rows).to(dev)
            z1, z2, z3 = model(torch.from_numpy(Bp[rows]).to(dev), torch.from_numpy(Bk[rows]).to(dev),
                               idx.to(dev), off.to(dev), val.to(dev), FI[idx.to(dev)],
                               torch.from_numpy(mu_dir[rows]).to(dev),
                               torch.from_numpy(mu_coll[rows]).to(dev))
            ls = full_ce(z1 @ ZS.T, rt, SIDX[rt], SW[rt], SVAL[rt], a.tau)
            lf = full_ce(z2 @ ZF.T, rt, FIDX[rt], FW[rt], FVAL[rt], a.tau)
            lb = full_ce(z3 @ ZB.T, rt, BIDX[rt], BW[rt], BVAL[rt], a.tau)
            loss = ls + lf + lb
            opt.zero_grad(); loss.backward(); opt.step()
            with torch.no_grad():                       # banca aggiornata in-place
                ZS[rt] = z1.detach(); ZF[rt] = z2.detach(); ZB[rt] = z3.detach()
            tot += float(loss); nb += 1
        sched.step()
        print(f"  ep {ep + 1:2d}/{a.epoche} L {tot / max(nb, 1):.4f} "
              f"(sem {float(ls):.3f} fld {float(lf):.3f} beh {float(lb):.3f}) "
              f"· t {time.time() - t0:.0f}s", flush=True)
        if a.ckpt_every and (ep + 1) % a.ckpt_every == 0:
            torch.save({"model": model.state_dict(), "opt": opt.state_dict(),
                        "sched": sched.state_dict(), "epoca": ep},
                       C.DATA / f"{a.nome}-ckpt.pt")

    ZS, ZF, ZB = z_all()
    ZSe = F.normalize(ZS, dim=1); ZFe = F.normalize(ZF, dim=1); ZBe = F.normalize(ZB, dim=1)
    Zc = torch.cat([np.sqrt(0.35) * ZSe, np.sqrt(0.35) * ZFe,
                    np.sqrt(0.30) * ZBe], 1)
    print("fit:  sem %.3f · field %.3f · beh %.3f · concat %.3f" % (
        fit_score(ZSe, SIDX, SW), fit_score(ZFe, FIDX, FW),
        fit_score(ZBe, BIDX, BW), fit_score(Zc, FIDX, FW)), flush=True)
    np.savez_compressed(C.DATA / f"{a.nome}.npz",
                        Z=Zc.float().cpu().numpy().astype(np.float16),
                        Z_sem=ZSe.float().cpu().numpy().astype(np.float16),
                        Z_field=ZFe.float().cpu().numpy().astype(np.float16),
                        Z_beh=ZBe.float().cpu().numpy().astype(np.float16))
    torch.save(model.state_dict(), C.DATA / f"{a.nome}-model.pt")
    print("salvato", C.DATA / f"{a.nome}.npz", flush=True)


if __name__ == "__main__":
    main()
