"""amore.py — co-gradimento: le coppie che le stesse persone hanno AMATO (non solo visto).

PERCHE' E' DIVERSO DALLA CO-VISIONE. COVISION conta la *presenza*: chi ha visto entrambi. Ma vedere
non è amare. MovieLens 32M ha 32 milioni di voti con il valore: due film amati (>= 4.5) dalla stessa
persona sono un segnale di gusto, non di esposizione. È l'unica dimensione che non abbiamo mai usato,
e non richiede né etichette né modelli: è comportamento.

  PYTHONPATH=. py -m services.graph_dense.amore [--soglia 4.5] [--k 100]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp

from . import config as C, data as D


def mappa_ml(B):
    """movieId MovieLens -> riga del canone (via tmdbId in links.csv)."""
    links = pd.read_csv(C.ROOT / '.cache' / 'movielens' / 'ml-32m' / 'links.csv')
    links = links.dropna(subset=['tmdbId'])
    ro = B['row_of']
    out = {}
    for mid, t in zip(links.movieId, links.tmdbId):
        r = ro.get(f'movie:{int(t)}')
        if r is not None:
            out[int(mid)] = r
    print(f'  amore: {len(out):,} film MovieLens mappati sul canone', flush=True)
    return out


def costruisci(B=None, soglia=4.5, k=100, blocco=512, peso_npmi=1.0):
    """Matrice di co-gradimento: NPMI pesato sulle coppie amate dalla stessa persona."""
    t0 = time.time()
    B = D.basic() if B is None else B
    N = B['N']
    ml2r = mappa_ml(B)
    r = pd.read_csv(C.ROOT / '.cache' / 'movielens' / 'ml-32m' / 'ratings.csv',
                    usecols=['userId', 'movieId', 'rating'])
    r = r[(r.rating >= soglia) & r.movieId.isin(ml2r.keys())]
    print(f'  amore: {len(r):,} voti >= {soglia} sui film del canone ({time.time()-t0:.0f}s)', flush=True)
    uid, _ = pd.factorize(r.userId)
    riga = np.array([ml2r[int(m)] for m in r.movieId], np.int32)
    X = sp.csr_matrix((np.ones(len(riga), np.float32), (np.int32(uid), riga)), shape=(uid.max() + 1, N))
    X.sum_duplicates()
    X.data[:] = 1.0
    marg = np.asarray(X.sum(0)).ravel().astype(np.float64)
    U = int(X.shape[0])
    print(f'  amore: {U:,} utenti · {int((marg>0).sum()):,} film amati · '
          f'{int(marg.sum()):,} coppie utente-film', flush=True)

    Xt = X.T.tocsr()
    righe, cols, vals = [], [], []
    for st in range(0, N, blocco):
        en = min(st + blocco, N)
        if marg[st:en].sum() == 0:
            continue
        Cb = (Xt[st:en] @ X).tocsr()          # co-gradimento nel blocco
        for rr in range(en - st):
            i = st + rr
            if marg[i] <= 0:
                continue
            lo, hi = Cb.indptr[rr], Cb.indptr[rr + 1]
            if hi <= lo:
                continue
            js = Cb.indices[lo:hi]
            c = Cb.data[lo:hi].astype(np.float64)
            ok = (js != i) & (c > 0)
            js, c = js[ok], c[ok]
            if len(js) == 0:
                continue
            with np.errstate(divide='ignore', invalid='ignore'):
                pmi = np.log(c * U / (marg[i] * np.maximum(marg[js], 1e-9)))
                den = -np.log(np.minimum(c / U, 1 - 1e-12))
                npmi = np.where(den > 1e-12, np.maximum(pmi / den, 0.0), 0.0)
            w = npmi * np.log1p(c) * peso_npmi
            o = np.argsort(-w)[:k]
            o = o[w[o] > 0]
            if len(o) == 0:
                continue
            righe.append(np.full(len(o), i, np.int32))
            cols.append(js[o].astype(np.int32))
            vals.append(w[o].astype(np.float32))
        if (st // blocco) % 30 == 0:
            print(f'    amore {en:,}/{N:,} ({time.time()-t0:.0f}s)', flush=True)
    M = sp.csr_matrix((np.concatenate(vals), (np.concatenate(righe), np.concatenate(cols))),
                      shape=(N, N))
    M.setdiag(0)
    M.eliminate_zeros()
    g = np.asarray((M > 0).sum(1)).ravel()
    print(f'  amore: {M.nnz:,} archi · copertura {100*(g>0).mean():.1f}% '
          f'({time.time()-t0:.0f}s)', flush=True)
    return M


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--soglia', type=float, default=4.5)
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--out', default='services/graph/data/tipi2/AMORE.npz')
    ap.add_argument('--manifest', default='services/graph/data/tipi2/manifest.json')
    a = ap.parse_args()
    from . import provenance as PV
    B = D.basic()
    M = costruisci(B, a.soglia, a.k)
    prov = PV.scrivi(a.out, M, step='tipi',
                     params={'tipo': 'AMORE', 'soglia': a.soglia, 'k': a.k},
                     inputs={'ratings': PV.sha256_file(C.ROOT / '.cache' / 'movielens' / 'ml-32m' / 'ratings.csv')},
                     canon_len=B['N'])
    man = json.loads(Path(a.manifest).read_text(encoding='utf-8')) if Path(a.manifest).exists() else {}
    g = np.asarray((M > 0).sum(1)).ravel()
    man['AMORE'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                        grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                        riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                        ricetta=f'MovieLens 32M: coppie con voto >= {a.soglia} dalla stessa persona, '
                                f'NPMI * log1p(c), top-{a.k}',
                        khi={'k': a.k, 'soglia': a.soglia}, creato=time.strftime('%Y-%m-%d %H:%M'))
    Path(a.manifest).write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'scritto {a.out} · prov {prov["sha256"][:12]}')


if __name__ == '__main__':
    main()
