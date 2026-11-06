"""A3 — testa di bolla ad alta capacità: Linear(X_meta 81k -> 2.922 bolle).

La lezione di A2: il collo di bottiglia a 512-d non è il modo di fare il classificatore di bolla;
il collocatore V3 è una testa lineare sui suoi 79k token. Qui la stessa capacità, ma con le
feature dello studente (TF-IDF + L1-L3 + strutturali) e il soft target del collocatore.
"""
from __future__ import annotations

import json
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from . import config as C
from . import data as D
from . import eval as E
from . import split as SP
from .train_a2 import coll_target


def main(v3=True):
    t0 = time.time()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    B = D.basic(); sp_ = np.load(C.DATA / "split.npz"); split = {k: sp_[k] for k in sp_.files}
    hold, mem, sz, VOT, is_tv = split["holdout"], B["mem"], B["sz"], B["VOT"], B["is_tv"]
    X = D.features(B)
    bolle = np.where(sz >= 5)[0]
    target, _ = coll_target(B, bolle, v3=v3)
    print(f"target {target.shape} · v3={v3} · t {time.time()-t0:.0f}s", flush=True)
    head = nn.Linear(X.shape[1], len(bolle), bias=True).to(device)
    opt = torch.optim.AdamW(head.parameters(), lr=1e-3, weight_decay=1e-5)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=20, eta_min=1e-4)
    train = np.where(~hold)[0]
    yb = np.full(B["N"], -1, np.int64)
    pos = {int(b): k for k, b in enumerate(bolle)}
    for i in range(B["N"]):
        k = pos.get(int(mem[i]), -1)
        if k >= 0: yb[i] = k
    for ep in range(1, 21):
        perm = np.random.default_rng(C.SEED + ep).permutation(train); tot = 0.0; nb = 0
        for st in range(0, len(perm), 512):
            rows = perm[st:st + 512]
            if len(rows) < 32: continue
            x = torch.from_numpy(X[rows].toarray()).to(device)
            logits = head(x)
            tgt = torch.from_numpy(target[rows].astype(np.float32)).to(device)
            tgt = tgt / tgt.sum(1, keepdim=True).clamp_min(1e-9)
            lab = torch.from_numpy(yb[rows]).to(device)
            ok = lab >= 0
            ce = F.cross_entropy(logits[ok], lab[ok], label_smoothing=0.05) if ok.any() else torch.tensor(0.0, device=device)
            kl = F.kl_div(F.log_softmax(logits, dim=1), tgt, reduction="batchmean")
            loss = ce + 0.5 * kl
            opt.zero_grad(); loss.backward(); opt.step()
            tot += float(loss.item()); nb += 1
        sched.step()
        if ep in (1, 5, 10, 15, 20):
            print(f"  ep {ep:2d}/20 loss {tot/max(nb,1):.4f} t {time.time()-t0:.0f}s", flush=True)
    head.eval()
    with torch.no_grad():
        xt = torch.from_numpy(X[split["test_idx"]].toarray()).to(device)
        cos = head(xt).cpu().numpy()
    cand = bolle; tr = ~hold
    med = np.zeros(len(cand), np.float32); ser = np.zeros(len(cand), bool)
    for k, b in enumerate(cand):
        m = np.where((mem == b) & tr)[0]
        v = VOT[m]; v = v[v > 0]
        med[k] = float(np.median(v)) if len(v) else 0.0
        ser[k] = float(is_tv[m].mean()) > 0.5
    test, strata = split["test_idx"], split["strata"]
    vic = D.mappa(B)
    own = np.zeros(len(test), bool); quart = np.zeros(len(test), bool)
    for k, i in enumerate(test):
        b = int(mem[int(i)]); c = cos[k].copy()
        vc = float(VOT[int(i)])
        if vc > 0:
            ok = (med >= vc / 10.0) & (med <= vc * 10.0)
            if ok.any(): c = np.where(ok, c, -np.inf)
        sm = ser == bool(is_tv[int(i)])
        if sm.any(): c = np.where(sm, c, -np.inf)
        j = int(np.argmax(c)); bp = int(cand[j])
        if bp == b: own[k] = True; quart[k] = True
        elif bp in vic[b]: quart[k] = True
    out = {"own": float(own.mean()), "quartiere": float(quart.mean()), "n": int(len(test)),
           "per_strato": {str(s): {"own": float(own[strata == s].mean()), "quartiere": float(quart[strata == s].mean()),
                                   "n": int((strata == s).sum())} for s in range(6)}}
    rec, _ = E.recall_eval(np.load(C.DATA / "a2.npz")["Z"].astype(np.float32), B, split, D.triangle(), 20)
    coll = json.load(open(C.DATA / "collocator.json"))
    E.salva(f"a3-{'v3' if v3 else 'v1'}-metrics", out, coll, rec, extra={"v3": bool(v3), "tempo_s": time.time() - t0})
    print(f"A3 v3={v3} bolla own {out['own']:.3f} quart {out['quartiere']:.3f} · {time.time()-t0:.0f}s")
    return 0


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument("--v3", action="store_true", default=True)
    ap.add_argument("--v1", action="store_true")
    a = ap.parse_args(); raise SystemExit(main(v3=not a.v1))
