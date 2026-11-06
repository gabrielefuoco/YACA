"""B3: modello a blocchi con GATE PER FILM. Trama (1024) e keyword (512) restano FISSI.

Il vettore e' la combinazione dei tre blocchi con pesi appresi *per film*:

    g = softmax(Linear(h_meta))            # 3 pesi, uno per blocco
    z = normalize(g0*Bp + g1*Bk + g2*h)

Inizializzato sui pesi globali di b2 (0.8 / 0.57 / 0.5) e addestrato sul target
grafo + wsem*semantica. Una piccola penalita' di entropia evita il collasso del gate.

Uso: py -m services.graph_dense.train_b3 --epoche 100 --nome b3 --sem-target data/sem-top25.npz
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
from .train_b1 import _batch_meta, _center


class BlockStudentG(nn.Module):
    def __init__(self, n_meta, d_meta=512, n_blocks=3, init=None):
        super().__init__()
        if init is None:
            init = (0.8, 0.57, 0.5) if n_blocks == 3 else (0.8, 0.57, 0.3, 0.5)
        self.n_blocks = n_blocks
        self.bag = nn.EmbeddingBag(n_meta, 256, mode="sum")
        self.ln = nn.LayerNorm(256)
        self.res = nn.Sequential(nn.Linear(256, 256), nn.LayerNorm(256), nn.GELU(),
                                 nn.Dropout(C.DROP), nn.Linear(256, 256))
        self.proj = nn.Linear(256, d_meta)
        self.fixed = None
        self.gate = nn.Linear(d_meta, n_blocks)
        with torch.no_grad():
            self.gate.weight.zero_()
            self.gate.bias.copy_(torch.log(torch.tensor(init, dtype=torch.float32)))

    def forward(self, idx, off, val, bp, bk, beh=None):
        h = F.gelu(self.ln(self.bag(idx, off, per_sample_weights=val)))
        h = F.normalize(self.proj(h + self.res(h)), dim=1)
        if self.fixed is not None:
            g = self.fixed.unsqueeze(0).expand(bp.shape[0], -1)
        else:
            g = F.softmax(self.gate(h), dim=1)
        blocks = [bp, bk] + ([beh] if beh is not None else []) + [h]
        z = torch.cat([g[:, k:k + 1] * blocks[k] for k in range(len(blocks))], dim=1)
        return F.normalize(z, dim=1), g


class FieldStudent(nn.Module):
    """Encoder a campi: embedding per token, media per campo, attention tra campi."""

    def __init__(self, n_meta, n_fields, d_field=64, d_meta=512, n_blocks=3,
                 init=None, heads=4, layers=1):
        super().__init__()
        if init is None:
            init = (0.8, 0.57, 0.5) if n_blocks == 3 else (0.8, 0.57, 0.3, 0.5)
        self.n_fields = n_fields
        self.fixed = None
        self.tok = nn.Embedding(n_meta, d_field)
        self.fld = nn.Embedding(n_fields, d_field)
        self.cls = nn.Parameter(torch.zeros(1, 1, d_field))
        layer = nn.TransformerEncoderLayer(d_field, heads, d_field * 2, dropout=C.DROP,
                                           batch_first=True, norm_first=True)
        self.tr = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.ln = nn.LayerNorm(d_field)
        self.proj = nn.Linear(d_field, d_meta)
        self.gate = nn.Linear(d_meta, n_blocks)
        with torch.no_grad():
            self.gate.weight.zero_()
            self.gate.bias.copy_(torch.log(torch.tensor(init, dtype=torch.float32)))

    def _meta(self, idx, off, val, fld):
        e = self.tok(idx) * val.unsqueeze(1)
        Bn = off.numel()
        lens = torch.diff(torch.cat([off, off.new_tensor([idx.numel()])]))
        rows = torch.repeat_interleave(torch.arange(Bn, device=idx.device), lens)
        flat = rows * self.n_fields + fld
        pooled = torch.zeros(Bn * self.n_fields, e.shape[1], device=e.device).index_add_(0, flat, e)
        cnt = torch.zeros(Bn * self.n_fields, device=e.device).index_add_(
            0, flat, torch.ones_like(flat, dtype=e.dtype))
        pooled = (pooled / cnt.clamp(min=1).unsqueeze(1)).view(Bn, self.n_fields, e.shape[1])
        pooled = pooled + self.fld.weight.unsqueeze(0)
        mask = cnt.view(Bn, self.n_fields) > 0
        x = torch.cat([self.cls.expand(Bn, -1, -1), pooled], 1)
        pad = torch.cat([torch.zeros(Bn, 1, dtype=torch.bool, device=e.device), ~mask], 1)
        return self.ln(self.tr(x, src_key_padding_mask=pad)[:, 0])

    def forward(self, idx, off, val, bp, bk, beh=None, fld=None):
        h = F.normalize(self.proj(self._meta(idx, off, val, fld)), dim=1)
        if self.fixed is not None:
            g = self.fixed.unsqueeze(0).expand(bp.shape[0], -1)
        else:
            g = F.softmax(self.gate(h), dim=1)
        blocks = [bp, bk] + ([beh] if beh is not None else []) + [h]
        z = torch.cat([g[:, k:k + 1] * blocks[k] for k in range(len(blocks))], dim=1)
        return F.normalize(z, dim=1), g


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dim", type=int, default=512)
    ap.add_argument("--wsem", type=float, default=0.5, help="peso del target semantico")
    ap.add_argument("--sem-target", default="")
    ap.add_argument("--beh-target", default="", help="target comportamentale da B-mf (beh-top50)")
    ap.add_argument("--pf", default="", help="peso per film dal target: none | maxp")
    ap.add_argument("--lambda-margin", type=float, default=0.0, help="peso del margine listwise")
    ap.add_argument("--margin", type=float, default=0.5, help="margine (unita' logit)")
    ap.add_argument("--neg-target", default="", help="negativi hard (idx/w) per unlikelihood")
    ap.add_argument("--train-only-yc", action="store_true", help="addestra solo sui film con co-visione reale")
    ap.add_argument("--neg-lambda", type=float, default=0.5)
    ap.add_argument("--neg-margin", type=float, default=1.0, help="margine logit sui negativi")
    ap.add_argument("--epoche", type=int, default=100)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--drop", type=float, default=0.05)
    ap.add_argument("--fdrop", type=float, default=0.0)
    ap.add_argument("--bank-update", type=int, default=1)
    ap.add_argument("--ent", type=float, default=0.01, help="penalita' di entropia (anti-collasso)")
    ap.add_argument("--train-eval", type=int, default=1024)
    ap.add_argument("--ckpt-every", type=int, default=10)
    ap.add_argument("--init", default="", help="pesi iniziali (warm-start)")
    ap.add_argument("--beh", default="", help="blocco comportamento fisso (npz con Z)")
    ap.add_argument("--fixed", default="", help="masse fisse per blocco, es. 0.3,0.3,0.3,0.1")
    ap.add_argument("--field", action="store_true", help="usa FieldStudent (embedding per campo)")
    ap.add_argument("--dfield", type=int, default=64)
    ap.add_argument("--lg", type=float, default=None, help="peso extra lingua")
    ap.add_argument("--cl", type=float, default=None, help="peso extra collection")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--seed", type=int, default=C.SEED)
    ap.add_argument("--nome", default="b3")
    a = ap.parse_args(argv)

    t0 = time.time()
    C.DROP = a.drop
    C.FEATURE_DROP = a.fdrop
    if a.lg is not None:
        D.PESI_EXTRA["lg:"] = a.lg
    if a.cl is not None:
        D.PESI_EXTRA["cl:"] = a.cl
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
    if a.train_only_yc:
        yc_raw = np.linalg.norm(np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32), axis=1) > 1e-6
        train = train & yc_raw & (~B["is_tv"])
        print(f"--train-only-yc: train {int(train.sum()):,}", flush=True)
    nodes = np.where(train)[0]
    zbl = np.load(C.DATA / "blocks.npz")
    Bp = torch.from_numpy(zbl["Bp"].astype(np.float32)).to(dev)
    Bk = torch.from_numpy(zbl["Bk"].astype(np.float32)).to(dev)
    keep = zbl["keep"]
    Zbeh = None
    if a.beh:
        Zbeh = torch.from_numpy(np.load(a.beh)["Z"].astype(np.float32)).to(dev)
        print(f"blocco comportamento: {Zbeh.shape} da {a.beh}", flush=True)
    n_blocks = 4 if Zbeh is not None else 3
    dVEC = Bp.shape[1] + Bk.shape[1] + a.dim + (0 if Zbeh is None else Zbeh.shape[1])
    X = D.features(B, extra=True)[:, keep].tocsr()
    print(f"blocchi: trama {Bp.shape[1]} · keyword {Bk.shape[1]} · meta {X.shape[1]:,} · "
          f"gate init (0.8/0.57/0.5) · wsem {a.wsem} · ent {a.ent}", flush=True)

    BIDX = BW = PFW = VALID = None
    if a.beh_target:
        zb = np.load(a.beh_target)
        raw = zb["idx"].astype(np.int64)
        VALID = torch.from_numpy((raw >= 0).any(1)).to(dev)
        BIDX = torch.from_numpy(np.where(raw >= 0, raw, 0)).to(dev)
        BW = torch.from_numpy(zb["w"].astype(np.float32)).to(dev)
        if a.pf and a.pf in zb.files:
            v = zb[a.pf].astype(np.float32)
            pfw = (1.0 - v) if a.pf == "none" else v
            PFW = torch.from_numpy(np.clip(pfw, 0.0, 1.0)).to(dev)
        print(f"target comportamento da {a.beh_target} · top-{BIDX.shape[1]} · "
              f"pieni {int(VALID.sum()):,}/{N:,} · pf {a.pf or '-'}", flush=True)
    NEG = NEGW = NEGVALID = None
    if a.neg_target:
        zn = np.load(a.neg_target)
        raw = zn["idx"].astype(np.int64)
        NEG = torch.from_numpy(np.where(raw >= 0, raw, 0)).to(dev)
        NEGW = torch.from_numpy(zn["w"].astype(np.float32)).to(dev)
        NEGVALID = torch.from_numpy((raw >= 0).any(1)).to(dev)
        print(f"negativi hard da {a.neg_target} · {NEG.shape[1]} · lambda {a.neg_lambda}", flush=True)
    SIDX = SW = None
    if a.sem_target:
        zs = np.load(a.sem_target)
        SIDX = torch.from_numpy(zs["idx"].astype(np.int64)).to(dev)
        SW = torch.from_numpy(zs["w"].astype(np.float32)).to(dev)

    if a.field:
        from . import fields as FLD
        ids, nomi = FLD.field_ids(B, keep)
        FIELDt = torch.from_numpy(ids.astype(np.int64)).to(dev)
        print(f"field: {len(nomi)} campi · d_field {a.dfield}", flush=True)
        model = FieldStudent(X.shape[1], len(nomi), d_field=a.dfield, d_meta=a.dim,
                             n_blocks=n_blocks).to(dev)
    else:
        FIELDt = None
        model = BlockStudentG(X.shape[1], d_meta=a.dim, n_blocks=n_blocks).to(dev)
    if a.fixed:
        m = [float(x) for x in a.fixed.split(",")]
        assert len(m) == n_blocks, f"{len(m)} masse per {n_blocks} blocchi"
        model.fixed = torch.tensor([x ** 0.5 for x in m], dtype=torch.float32, device=dev)
        print(f"gate fisso (masse): {m}", flush=True)
    if a.init:
        sd = torch.load(a.init, map_location=dev, weights_only=True)
        sd = {k: v for k, v in sd.items() if not k.startswith("gate.")}
        model.load_state_dict(sd, strict=False)
        print(f"warm-start da {a.init} (gate riparte a {n_blocks} pesi)", flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=C.LR, weight_decay=C.WD, foreach=False)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a.epoche, eta_min=1e-4)
    pos_idx = torch.from_numpy(np.where(tr["nbr_idx"] >= 0, tr["nbr_idx"], -1).astype(np.int64)).to(dev)
    print(f"train {len(nodes):,} · parametri {sum(p.numel() for p in model.parameters())/1e6:.1f}M · "
          f"vettore {dVEC} · device {dev}", flush=True)

    def enc(rows, drop):
        rows = np.asarray(rows)
        rt = torch.from_numpy(rows.astype(np.int64)).to(dev)
        idx, off, val = _batch_meta(X, rows, rng, drop=drop)
        beh = Zbeh[rt] if Zbeh is not None else None
        if FIELDt is not None:
            i_d = idx.to(dev)
            return model(i_d, off.to(dev), val.to(dev), Bp[rt], Bk[rt], beh=beh, fld=FIELDt[i_d])
        return model(idx.to(dev), off.to(dev), val.to(dev), Bp[rt], Bk[rt], beh=beh)

    def banca():
        model.eval()
        Z = np.zeros((N, dVEC), np.float32)
        with torch.no_grad():
            for st in range(0, N, 2048):
                rows = np.arange(st, min(st + 2048, N))
                Z[rows] = enc(rows, drop=False)[0].float().cpu().numpy()
        model.train()
        return torch.from_numpy(Z).to(dev)

    ckpt = C.DATA / f"{a.nome}-ckpt.pt"
    start = 1
    if a.resume and ckpt.exists():
        c = torch.load(ckpt, map_location=dev, weights_only=False)
        model.load_state_dict(c["model"]); opt.load_state_dict(c["opt"])
        sched.load_state_dict(c["sched"]); start = c["epoca"] + 1
        print(f"riprendo da epoca {start}", flush=True)

    GP = np.zeros((N, n_blocks), np.float32)
    for ep in range(start, a.epoche + 1):
        Zb = banca()
        model.train()
        perm = rng.permutation(nodes)
        tot = 0.0; nb = 0; hit = 0; seen = 0
        gs = []
        for st in range(0, len(perm), a.batch):
            bn = perm[st:st + a.batch]
            if len(bn) < 32:
                continue
            za, ga = enc(bn, drop=True)
            logits = (za @ Zb.T) / C.TAU
            bnt = torch.from_numpy(bn.astype(np.int64)).to(dev)
            logits.scatter_(1, bnt.unsqueeze(1), -1e4)
            if BIDX is not None:
                P = torch.zeros((len(bn), N), device=dev)
                P.scatter_(1, BIDX[bnt], BW[bnt])
                P = P / P.sum(1, keepdim=True).clamp(min=1e-9)
                vmask = VALID[bnt]
            else:
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
                vmask = torch.ones(len(bn), dtype=torch.bool, device=dev)
            if SIDX is not None:
                Ps = torch.zeros_like(P)
                Ps.scatter_(1, SIDX[bnt], SW[bnt])
                Ps = Ps / Ps.sum(1, keepdim=True).clamp(min=1e-9)
                P = P + a.wsem * Ps
                P = P / P.sum(1, keepdim=True).clamp(min=1e-9)
                vmask = vmask | (SW[bnt].abs().sum(1) > 0)
            ce = -(P * torch.log_softmax(logits, dim=1)).sum(1)
            w = vmask.float()
            if PFW is not None:
                w = w * PFW[bnt]
            loss = (ce * w).sum() / w.sum().clamp(min=1e-9)
            if NEG is not None:
                pmax = logits.gather(1, BIDX[bnt]).max(1).values
                ng = logits.gather(1, NEG[bnt])
                wneg = NEGW[bnt] * NEGVALID[bnt].float().view(-1, 1)
                hinge = torch.relu(ng - pmax.unsqueeze(1) + a.neg_margin)
                loss = loss + a.neg_lambda * (hinge * wneg).sum(1).div(wneg.sum(1).clamp(min=1e-9)).mean()
            if a.lambda_margin and BIDX is not None:
                ST = logits.gather(1, BIDX[bnt])                    # (B,K) punteggi del modello sui target
                Wt = BW[bnt]                                        # (B,K) pesi Mercury
                wij = (Wt.unsqueeze(2) - Wt.unsqueeze(1)).clamp(min=0)   # solo coppie i>j
                wij = wij * vmask.float().view(-1, 1, 1)
                if PFW is not None:
                    wij = wij * PFW[bnt].view(-1, 1, 1)
                di = ST.unsqueeze(2) - ST.unsqueeze(1)
                mh = (torch.relu(a.margin - di) * wij).sum() / wij.sum().clamp(min=1e-9)
                loss = loss + a.lambda_margin * mh
            if a.ent and model.fixed is None:
                ent = -(ga * torch.log(ga.clamp(min=1e-9))).sum(1).mean()
                loss = loss - a.ent * ent
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            opt.step()
            if a.bank_update:
                model.eval()
                with torch.no_grad():
                    Zb[bnt], _ = enc(bn, drop=False)
                model.train()
            tot += float(loss.item()); nb += 1
            with torch.no_grad():
                gs.append(ga.mean(0).float().cpu().numpy())
                p = pos_idx[bnt]; okp = p >= 0
                top = logits.topk(20, dim=1).indices
                hit += int(sum(len(set(top[k].tolist()) & set(p[k][okp[k]].tolist()))
                               for k in range(len(bn))))
                seen += int(okp.sum())
        sched.step()
        gmed = np.mean(gs, 0) if gs else np.zeros(3)
        msg = (f"  ep {ep:2d}/{a.epoche} loss {tot/max(nb,1):.4f} hit@20 {hit/max(seen,1):.3f} "
               "· gate " + "/".join(f"{x:.2f}" for x in gmed))
        if a.train_eval:
            model.eval()
            with torch.no_grad():
                rs = rng.choice(nodes, min(a.train_eval, len(nodes)), replace=False)
                lg = enc(rs, drop=False)[0] @ Zb.T
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
        if a.ckpt_every and ep % a.ckpt_every == 0:
            torch.save({"model": model.state_dict(), "opt": opt.state_dict(),
                        "sched": sched.state_dict(), "epoca": ep}, ckpt)

    model.eval()
    Z = np.zeros((N, dVEC), np.float32)
    with torch.no_grad():
        for st in range(0, N, 1024):
            rows = np.arange(st, min(st + 1024, N))
            z, g = enc(rows, drop=False)
            Z[rows] = z.float().cpu().numpy()
            GP[rows] = g.float().cpu().numpy()
    Z, mu = _center(Z, train, is_tv)
    np.savez_compressed(C.DATA / f"{a.nome}.npz", Z=Z.astype(np.float16),
                        G=GP.astype(np.float16), mu=mu.astype(np.float16), dim=np.array(Z.shape[1]))
    torch.save(model.state_dict(), C.DATA / f"{a.nome}-model.pt")
    vic = D.mappa(B)
    bub, _, _ = E.bubble_eval(Z, B, split, vic)
    rec, _ = E.recall_eval(Z, B, split, S, 20)
    coll = json.load(open(C.DATA / "collocator.json"))
    E.salva(f"{a.nome}-metrics", bub, coll, rec,
            extra={"epoche": a.epoche, "tempo_s": time.time() - t0, "dim": int(Z.shape[1]),
                   "wsem": a.wsem, "device": dev, "ent": a.ent,
                   "gate_medio": [float(x) for x in GP[nodes].mean(0)],
                   "gate_std": [float(x) for x in GP[nodes].std(0)],
                   "ricetta": "blocchi fissi + gate per film sul meta"})
    print("gate medio " + "/".join(f"{x:.3f}" for x in GP[nodes].mean(0)) +
          " · std " + "/".join(f"{x:.3f}" for x in GP[nodes].std(0)))
    print("%s own %.3f quartiere %.3f · recall@20 %.3f"
          % (a.nome, bub["own"], bub["quartiere"], rec["recall20"]))
    print("saved %s.npz / %s-metrics.json · t %.1fs" % (a.nome, a.nome, time.time() - t0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
