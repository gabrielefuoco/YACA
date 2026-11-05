"""kw_tone.py — un tipo d'arco dai soli tag che portano pubblico (proposta A, fatta bene).

DIFFERENZA DALLA PRIMA VERSIONE, che era sbagliata in due modi:
  1. **non ripesa KWSEM** (che perde la sua specificità) ma costruisce un tipo NUOVO, a peso basso:
     KWSEM resta intatto, questo aggiunge un segnale che KWSEM non ha;
  2. il lift e' **controllato per la fama** (basale: stesso genere *e* stessa fascia di voti), quindi
     il tipo non tira verso il canonico.

Il tipo contiene solo gli archi in cui le keyword condivise stanno nel terzo superiore del lift.

  PYTHONPATH=. py -m services.graph_dense.kw_tone [--k 100] [--soglia 0.70]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from . import config as C, data as D
from . import kw_beh as KB, tone


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--soglia', type=float, default=0.70, help='quantile di lift sotto il quale il tag è scartato')
    ap.add_argument('--out', default='services/graph/data/tipi2/KWTONE.npz')
    ap.add_argument('--manifest', default='services/graph/data/tipi2/manifest.json')
    a = ap.parse_args()
    t0 = time.time()
    from . import provenance as PV
    from . import contesti_tipo as CT
    B = D.basic(); N = B['N']
    X, kws = tone.incidenza_keyword(B)
    H = np.load(C.DATA / 'contesti.npz', allow_pickle=True)['H']
    V = CT.profili(H)
    gen = KB.generi(B)
    lift = KB.lift_keyword(B, X, kws, V, gen, np.random.default_rng(20261105))
    vals = np.array(list(lift.values()))
    # si tengono SOLO i tag nel terzo/quarto superiore: gli altri non portano pubblico
    soglia = float(np.quantile(vals, a.soglia))
    tieni = {k for k, v in lift.items() if v >= soglia}
    print(f'  kw_tone: {len(lift):,} keyword misurate · {len(tieni):,} sopra la soglia '
          f'({a.soglia:.0%} = {soglia:.3f})', flush=True)
    esempi = sorted(((kws[k], v) for k, v in lift.items() if k in tieni), key=lambda x: -x[1])[:15]
    print('  esempi: ' + ', '.join(f'{n} ({v:.2f})' for n, v in esempi), flush=True)
    W = np.zeros(len(kws), np.float32)
    for k in tieni:
        W[k] = 1.0
    Xc = X.tocsr()
    # solo gli archi fra film che condividono ALMENO un tag "di tono"
    A = Xc.multiply(W[None, :]).tocsr()
    num = (A @ Xc.T).tocsr()
    # numero di tag "di tono" per film: A e' (film x keyword), quindi si contano le RIGHE
    n_tag = np.asarray(A.getnnz(1)).ravel().astype(np.float64)
    rows, cols, vs = [], [], []
    for i in range(N):
        r = num.getrow(i)
        if r.nnz == 0:
            continue
        lo, hi = r.indptr[0], r.indptr[1]
        idx, dat = r.indices[lo:hi], r.data[lo:hi]
        m = idx != i
        idx, dat = idx[m], dat[m]
        if len(dat) == 0:
            continue
        # normalizza per il numero di tag condivisi (distanza coseno sui tag "di tono")
        ni = float(n_tag[i]) ** 0.5
        nj = np.sqrt(n_tag[idx] + 1e-9)
        w = dat / (ni * nj)
        if len(w) > a.k:
            o = np.argpartition(-w, a.k)[:a.k]
            idx, w = idx[o], w[o]
        rows.append(np.full(len(idx), i, np.int32)); cols.append(idx.astype(np.int32)); vs.append(w.astype(np.float32))
    M = sp.csr_matrix((np.concatenate(vs), (np.concatenate(rows), np.concatenate(cols))), shape=(N, N))
    M.setdiag(0); M.eliminate_zeros()
    prov = PV.scrivi(a.out, M, step='tipi',
                     params={'tipo': 'KWTONE', 'k': a.k, 'soglia': a.soglia, 'tag_tenuti': len(tieni)},
                     inputs={'contesti': PV.sha256_file(C.DATA / 'contesti.npz')}, canon_len=N)
    man = json.loads(Path(a.manifest).read_text(encoding='utf-8')) if Path(a.manifest).exists() else {}
    g = np.asarray((M > 0).sum(1)).ravel()
    man['KWTONE'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                         grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                         riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                         ricetta=f'solo i {len(tieni)} tag col lift comportamentale sopra il '
                                 f'{a.soglia:.0%} (basale stratificato per fama)',
                         khi={'k': a.k, 'soglia': a.soglia}, creato=time.strftime('%Y-%m-%d %H:%M'))
    Path(a.manifest).write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'scritto {a.out} · {M.nnz:,} archi · prov {prov["sha256"][:12]} ({time.time()-t0:.0f}s)')


if __name__ == '__main__':
    main()
