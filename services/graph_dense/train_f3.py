"""Training f3 — tre rami, tre loss pure, nessuna loss sul concatenato.

L = CE(z_sem, T_mercury) + CE(z_field, T_fusion_v2) + CE(z_beh, T_beh)
CE listwise: logits = z @ Z_all.T sul canone intero, -sum(P * log_softmax(logits)).
Z_all = embedding correnti di tutti i titoli (ricalcolate ogni K epoche, per memoria).

Uso:
  py -m services.graph_dense.train_f3 --epoche 40 --nome f3 \
     --sem-target data/mercury-target.npz --field-target data/fusion-target-v2.npz \
     --beh-target data/beh-target-v2.npz --ckpt-every 10
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


def listwise_ce(logits, idx, w):
    lg = logits.gather(1, idx)
    return -(w * F.log_softmax(lg, dim=1)).sum(1).mean()


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--epoche", type=int, default=40)
    ap.add_argument("--batch", type=int, default=1024)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--nome", default="f3")
    ap.add_argument("--sem-target", default="data/mercury-target.npz")
    ap.add_argument("--field-target", default="data/fusion-target-v2.npz")
    ap.add_argument("--beh-target", default="data/beh-target-v2.npz")
    ap.add_argument("--ckpt-every", type=int, default=10)
    ap.add_argument("--refresh", type=int, default=5, help="ogni quante epoche ricalcolare Z_all")
    ap.add_argument("--resume", default="")
    ap.add_argument("--seed", type=int, default=20261025)
    a = ap.parse_args(argv)

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    B = D.basic(); N = B["N"]
    date = np.load(C.DATA / "uscite-ordinali.npy")
    is_tv = B["is_tv"]
    keep = np.load(C.DATA / "canon-clean.npz")["keep"]
    X = D.features(B, extra=True).tocsr()
    fids, nomi = FLD.field_ids(B)
    FI = torch.from_numpy(fids.astype(np.int64)).to(dev)
    Bp = np.load(C.DATA / "trama-qwen3b.npy").astype(np.float32)
    Bp /= (np.linalg.norm(Bp, axis=1, keepdims=True) + 1e-9)
    Bk = np.load(C.DATA / "blocks.npz")["Bk"].astype(np.float32)
    cen = np.load(C.DATA / "centroids.npz")
    mu_dir = cen["mu_dir"].astype(np.float32); mu_coll = cen["mu_coll"].astype(np.float32)
    SIDX, SW, SVAL = load_target(C.DATA / a.sem_target.split("/")[-1], dev)
    FIDX, FW, FVAL = load_target(C.DATA / a.field_target.split("/")[-1], dev)
    BIDX, BW, BVAL = load_target(C.DATA / a.beh_target.split("/")[-1], dev)
    sp = np.load(C.DATA / "split.npz")
    train = sp["train_idx"] if "train_idx" in sp.files else sp["train"]
    train = np.asarray(train, dtype=np.int64)
    train = train[keep[train]]

    model = F3(len(nomi)).to(dev)
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
        return torch.from_numpy(zs).to(dev), torch.from_numpy(zf).to(dev), torch.from_numpy(zb).to(dev)

    ZS, ZF, ZB = z_all()
    t0 = time.time()
    for ep in range(ep0, a.epoche):
        if ep and ep % a.refresh == 0:
            ZS, ZF, ZB = z_all()
        perm = rng.permutation(train)
        tot = 0.0; nb = 0
        for st in range(0, len(perm), a.batch):
            rows = perm[st:st + a.batch]
            idx, off, val = _batch_meta(X, rows, rng)
            rt = torch.from_numpy(rows).to(dev)
            z1, z2, z3 = model(torch.from_numpy(Bp[rows]).to(dev), torch.from_numpy(Bk[rows]).to(dev),
                               idx.to(dev), off.to(dev), val.to(dev), FI[idx.to(dev)],
                               torch.from_numpy(mu_dir[rows]).to(dev),
                               torch.from_numpy(mu_coll[rows]).to(dev))
            l_sem = listwise_ce(z1 @ ZS.T, SIDX[rt], SW[rt])
            l_fld = listwise_ce(z2 @ ZF.T, FIDX[rt], FW[rt])
            l_beh = listwise_ce(z3 @ ZB.T, BIDX[rt], BW[rt])
            loss = l_sem + l_fld + l_beh
            opt.zero_grad(); loss.backward(); opt.step()
            tot += float(loss); nb += 1
        sched.step()
        print(f"  ep {ep + 1:2d}/{a.epoche} L {tot / max(nb, 1):.4f} "
              f"(sem {float(l_sem):.3f} fld {float(l_fld):.3f} beh {float(l_beh):.3f}) "
              f"· t {time.time() - t0:.0f}s", flush=True)
        if a.ckpt_every and (ep + 1) % a.ckpt_every == 0:
            torch.save({"model": model.state_dict(), "opt": opt.state_dict(),
                        "sched": sched.state_dict(), "epoca": ep},
                       C.DATA / f"{a.nome}-ckpt.pt")
    # salvataggio finale con i tre rami e il concatenato (pesi di default)
    ZS, ZF, ZB = z_all()
    Zc = torch.cat([np.sqrt(0.35) * F.normalize(ZS, dim=1),
                    np.sqrt(0.35) * F.normalize(ZF, dim=1),
                    np.sqrt(0.30) * F.normalize(ZB, dim=1)], 1)
    np.savez_compressed(C.DATA / f"{a.nome}.npz",
                        Z=Zc.float().cpu().numpy().astype(np.float16),
                        Z_sem=ZS.float().cpu().numpy().astype(np.float16),
                        Z_field=ZF.float().cpu().numpy().astype(np.float16),
                        Z_beh=ZB.float().cpu().numpy().astype(np.float16))
    torch.save(model.state_dict(), C.DATA / f"{a.nome}-model.pt")
    print("salvato", C.DATA / f"{a.nome}.npz", flush=True)


if __name__ == "__main__":
    main()
