"""train-studente.py — riaddestra lo studente avendo il grafo nuovo come maestro.

  PYTHONPATH=. py .scratch/distillazione-grafo/train-studente.py [--epoche 24] [--batch 256]

Differenza dal vecchio `train_b1`: il target non e' piu' il triangolo V10 + i pool di Mercury, e' la
RIGA DEL MAESTRO (`v18/maestro.npz`) — cioe' l'output del grafo nuovo. E' auto-distillazione:
lo studente deve imparare a riprodurre, dal solo contenuto, quello che il grafo sa.

La loss e' la stessa di b1: cross-entropy fra la distribuzione del target e la softmax su TUTTI i
76.497 titoli. I negativi sono impliciti (tutti gli altri nodi), quindi non serve un file di negativi.

Architettura invariata: trama (1024, fissa) + keyword (512, JL fissa) + blocco meta addestrato
(EmbeddingBag -> residuo -> 512). Output `rrfstudent-v18.npz` con `Z` (N, 2560).
"""
import argparse
import json
import time

import numpy as np
import scipy.sparse as sp
import torch
import torch.nn.functional as F

from services.graph_dense import config as C
from services.graph_dense import data as D
from services.graph_dense.train_b1 import BlockStudent, _batch_meta, _center


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--maestro', default='services/graph/data/v18/maestro.npz')
    ap.add_argument('--epoche', type=int, default=24)
    ap.add_argument('--batch', type=int, default=256)
    ap.add_argument('--dim', type=int, default=512)
    ap.add_argument('--wp', type=float, default=0.8)
    ap.add_argument('--wk', type=float, default=0.57)
    ap.add_argument('--wm', type=float, default=1.0)
    ap.add_argument('--lr', type=float, default=float(C.LR))
    ap.add_argument('--tau', type=float, default=float(C.TAU))
    ap.add_argument('--drop', type=float, default=0.05)
    ap.add_argument('--topk', type=int, default=0, help='0 = riga intera, >0 = top-k riaffilato')
    ap.add_argument('--out', default='rrfstudent-v18.npz')
    a = ap.parse_args()
    C.DROP = a.drop
    C.FEATURE_DROP = 0.0

    t0 = time.time()
    B = D.basic(); N = B['N']
    zt = np.load(a.maestro)
    W = sp.csr_matrix((zt['data'], zt['indices'], zt['indptr']), shape=(N, N)).tocsr()
    print(f'maestro: {W.nnz:,} archi · grado mediano '
          f'{int(np.median((np.diff(W.indptr))))} · weights {W.data.min():.3f}..{W.data.max():.2f}',
          flush=True)

    zbl = np.load(C.DATA / 'blocks.npz')
    Bp = np.load(C.DATA / 'blocks.npz')['Bp'].astype(np.float32)
    Bk = np.load(C.DATA / 'blocks.npz')['Bk'].astype(np.float32)
    keep = zbl['keep']
    X = D.features(B, extra=True)[:, keep].tocsr()
    print(f'blocchi: trama {Bp.shape[1]} · keyword {Bk.shape[1]} · meta {X.shape[1]:,} · '
          f'copertura trama {(np.abs(Bp).sum(1) > 0).mean():.1%}', flush=True)

    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    if dev == 'cuda':
        torch.cuda.set_per_process_memory_fraction(0.85, 0)
        torch.cuda.empty_cache()
    Bp_t = torch.from_numpy(Bp).to(dev)
    Bk_t = torch.from_numpy(Bk).to(dev)
    del Bp, Bk, zbl
    model = BlockStudent(X.shape[1], d_meta=a.dim, wp=a.wp, wk=a.wk, wm=a.wm).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=C.WD, foreach=False)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a.epoche, eta_min=1e-4)
    rng = np.random.default_rng(C.SEED)
    torch.manual_seed(C.SEED)
    dimv = Bp_t.shape[1] + Bk_t.shape[1] + a.dim
    print(f'studente: {sum(p.numel() for p in model.parameters())/1e6:.2f}M parametri · '
          f'vettore {dimv} · device {dev} · tau {a.tau}', flush=True)

    def enc(rows, drop):
        rows = np.asarray(rows)
        rt = torch.from_numpy(rows.astype(np.int64)).to(dev)
        idx, off, val = _batch_meta(X, rows, rng, drop=drop)
        return model(idx.to(dev), off.to(dev), val.to(dev), Bp_t[rt], Bk_t[rt])

    def banca(ep):
        model.eval()
        Z = np.zeros((N, dimv), np.float32)
        with torch.no_grad():
            for st in range(0, N, 4096):
                r = np.arange(st, min(st + 4096, N))
                Z[r] = enc(r, drop=False).float().cpu().numpy()
        model.train()
        return torch.from_numpy(Z).to(dev)

    def target(bn):
        righe = W[bn]
        if a.topk:
            keep_r, keep_c, keep_v = [], [], []
            for r in range(len(bn)):
                lo, hi = righe.indptr[r], righe.indptr[r+1]
                seg = righe.data[lo:hi]
                if len(seg) > a.topk:
                    o = np.argpartition(-seg, a.topk)[:a.topk]
                    keep_c.extend(righe.indices[lo:hi][o].tolist())
                    keep_v.extend(seg[o].tolist())
                    keep_r.extend([r]*a.topk)
                else:
                    keep_c.extend(righe.indices[lo:hi].tolist())
                    keep_v.extend(seg.tolist())
                    keep_r.extend([r]*len(seg))
            righe = sp.csr_matrix((np.asarray(keep_v, np.float32),
                                   (np.asarray(keep_r, np.int32), np.asarray(keep_c, np.int32))),
                                  shape=(len(bn), N))
        lens = np.diff(righe.indptr).astype(np.int64)
        ii = np.repeat(np.arange(len(bn)), lens)
        vals = np.power(righe.data.astype(np.float32), 0.5)
        starts = righe.indptr[:-1].astype(np.int64)
        if len(vals):
            somma = np.add.reduceat(vals, np.minimum(starts, len(vals) - 1)).astype(np.float64)
        else:
            somma = np.ones(len(bn), np.float64)
        somma[lens == 0] = 1.0
        somma[somma <= 0] = 1.0
        vals = (vals / np.repeat(somma, lens)).astype(np.float32)
        P = torch.zeros((len(bn), N), device=dev)
        P[torch.from_numpy(ii.astype(np.int64)).to(dev),
          torch.from_numpy(righe.indices.astype(np.int64)).to(dev)] = torch.from_numpy(vals).to(dev)
        return P

    # i nodi senza archi nel maestro non hanno un target: restano fuori dal training
    nodes = np.flatnonzero(np.diff(W.indptr) > 0)
    print(f'nodi addestrabili: {len(nodes):,} su {N:,} '
          f'({N-len(nodes):,} isolati nel maestro, esclusi)', flush=True)
    for ep in range(1, a.epoche + 1):
        Zb = banca(ep)
        model.train()
        perm = rng.permutation(nodes)
        tot = 0.0; nb = 0
        for st in range(0, len(perm), a.batch):
            bn = perm[st:st + a.batch]
            if len(bn) < 32:
                continue
            za = enc(bn, drop=True)
            logits = (za @ Zb.T) / a.tau
            bnt = torch.from_numpy(bn.astype(np.int64)).to(dev)
            logits.scatter_(1, bnt.unsqueeze(1), -1e4)
            P = target(bn)
            loss = -(P * torch.log_softmax(logits, dim=1)).sum(1).mean()
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            opt.step()
            tot += float(loss.item()); nb += 1
            if nb % 40 == 0:
                print(f'  ep {ep:2d} · {nb}/{len(perm)//a.batch} batch · loss {tot/nb:.4f} '
                      f'· {time.time()-t0:.0f}s', flush=True)
        sched.step()
        del Zb
        if dev == 'cuda':
            torch.cuda.empty_cache()
        print(f'  ep {ep:2d}/{a.epoche} loss {tot/max(nb,1):.4f} · {time.time()-t0:.0f}s', flush=True)

    model.eval()
    Z = np.zeros((N, dimv), np.float32)
    with torch.no_grad():
        for st in range(0, N, 4096):
            r = np.arange(st, min(st + 4096, N))
            Z[r] = enc(r, drop=False).float().cpu().numpy()
    Q, mu = _center(Z, np.ones(N, bool), B['is_tv'])
    G = np.zeros((N, 4), np.float32)
    G[:, 0] = B['is_tv']; G[:, 1] = ~B['is_tv']
    G[:, 2] = np.clip((B['ANNO'] - 1990.0) / 35.0, -2.5, 1.5)
    G[:, 3] = np.log1p(np.maximum(B['NEP'] - 1.0, 0.0)) / 6.0
    # IL MODELLO, non solo i vettori: serve per collocare i titoli futuri (inferenza su un nodo nuovo)
    torch.save({'state_dict': model.state_dict(), 'dim_meta': int(X.shape[1]),
                'dim': a.dim, 'wp': a.wp, 'wk': a.wk, 'wm': a.wm, 'n_canone': int(N)},
               C.DATA / (a.out.replace('.npz', '.pt')))
    print(f'salvato anche il modello: {a.out.replace(".npz", ".pt")}', flush=True)
    np.savez_compressed(C.DATA / a.out, Z=Z.astype(np.float32), Q=Q.astype(np.float32),
                        mu=mu.astype(np.float32), G=G,
                        meta=np.array(json.dumps({'maestro': a.maestro, 'epoche': a.epoche,
                                                  'dim': dimv, 'tau': a.tau,
                                                  'n_canone': int(N)})))
    print(f'\nscritto {a.out} · Z {Z.shape} · {time.time()-t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
