"""amore_res.py — il co-gradimento senza la popolarità (proposta B).

PERCHE' AMORE ERA FALLITO. «Amati dalla stessa persona» premia i film famosi, perché tutti amano i
film famosi: R@20 scese di 0,0095 con il 76% di blockbuster. Il difetto era nel modello, non nell'idea:
mancava il termine di **qualità del film**.

LA CORREZIONE. Due effetti fissi:

    residuo(u, f) = voto(u, f) − media(u) − media(f) + media_globale

Cioè: quanto un utente ama un film **al di là** della propria generosità (media(u)) e **al di là** della
qualità del film (media(f)). Quello che resta è gusto, non popolarità.

Poi la stessa macchina che ha funzionato per i contesti: NMF sul residuo positivo, log-rapporto centrato,
coseno.

  PYTHONPATH=services py -m graph.build.amore_res [--k 100] [--temi 24]
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


def matrice_residuo(B, soglia=0.0):
    """(utenti x film) con i residui positivi del modello a due effetti fissi."""
    from .amore import mappa_ml
    ml2r = mappa_ml(B)
    r = pd.read_csv(C.ROOT / '.cache' / 'movielens' / 'ml-32m' / 'ratings.csv',
                    usecols=['userId', 'movieId', 'rating'])
    r = r[r.movieId.isin(ml2r.keys())].copy()
    r['riga'] = [ml2r[int(m)] for m in r.movieId]
    mu_g = float(r.rating.mean())
    mu_u = r.groupby('userId').rating.transform('mean').to_numpy()
    mu_f = r.groupby('riga').rating.transform('mean').to_numpy()
    resid = r.rating.to_numpy() - mu_u - mu_f + mu_g
    print(f'  amore_res: {len(r):,} voti · residuo medio {resid.mean():+.3f} · '
          f'quota positiva {100*(resid>0).mean():.1f}%', flush=True)
    ok = resid > soglia
    uid, _ = pd.factorize(r.userId[ok])
    X = sp.csr_matrix((resid[ok].astype(np.float32), (np.int32(uid), r.riga.to_numpy()[ok])),
                      shape=(uid.max() + 1, B['N']))
    X.sum_duplicates()
    return X


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--temi', type=int, default=24)
    ap.add_argument('--iter', type=int, default=60)
    ap.add_argument('--soglia', type=float, default=0.0, help='residuo minimo positivo per entrare')
    ap.add_argument('--embeddings-out', default=str(C.BUILD_CACHE / 'embeddings' / 'resid-k24-seed7.npz'))
    ap.add_argument('--out', default='services/graph/data/tipi2/RESID.npz')
    ap.add_argument('--manifest', default='services/graph/data/tipi2/manifest.json')
    a = ap.parse_args()
    t0 = time.time()
    from . import provenance as PV
    from .scelta_k import _nmf
    B = D.basic(); N = B['N']
    X = matrice_residuo(B, a.soglia)
    print(f'  amore_res: matrice {X.shape[0]:,} x {X.shape[1]:,} · {X.nnz:,} residui positivi', flush=True)
    seed = 7
    W, H = _nmf(X, a.temi, a.iter, seme=seed)
    # FIX (handoff 5, bug 2): la stessa ricetta di CONTESTI, con lo smoothing al posto del pavimento
    # 1e-9. Prima gli zeri entravano al valore log(1e-9/0.04) ~ -17,5 e la testa di Barbie erano
    # gli speciali di stand-up comedy. Ora una sola implementazione, condivisa.
    from .contesti_tipo import profili
    V = profili(H, alpha=float(__import__('os').environ.get('CONTESTI_SMOOTH', '0.05')))
    ep = Path(a.embeddings_out)
    ep.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(ep, W=W.astype(np.float32), H=H.astype(np.float32),
                        film=V.astype(np.float32), seed=np.array(seed), topics=np.array(a.temi))
    cop = float((np.linalg.norm(V, axis=1) > 0).mean())
    print(f'  amore_res: {cop:.1%} del canone ha un profilo ({time.time()-t0:.0f}s)', flush=True)
    from . import tipi
    M = tipi.topk_cosine(V.astype(np.float32), a.k, etichetta='resid')
    prov = PV.scrivi(a.out, M, step='tipi',
                     params={'tipo': 'RESID', 'k': a.k, 'temi': a.temi, 'iter': a.iter,
                             'soglia': a.soglia, 'seme': seed},
                     inputs={
                         'ratings': PV.sha256_file(C.ROOT / '.cache' / 'movielens' / 'ml-32m' / 'ratings.csv'),
                         'links': PV.sha256_file(C.ROOT / '.cache' / 'movielens' / 'ml-32m' / 'links.csv'),
                         'canon': PV.sha256_file(C.SRC / C.SPAZI),
                     }, canon_len=N)
    man = json.loads(Path(a.manifest).read_text(encoding='utf-8')) if Path(a.manifest).exists() else {}
    g = np.asarray((M > 0).sum(1)).ravel()
    man['RESID'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                        grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                        riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                        ricetta=f'co-gradimento residualizzato a due effetti fissi, NMF {a.temi} temi, '
                                f'log-lift centrato',
                        khi={'k': a.k, 'temi': a.temi}, creato=time.strftime('%Y-%m-%d %H:%M'))
    Path(a.manifest).write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'scritto {a.out} · {M.nnz:,} archi · prov {prov["sha256"][:12]} ({time.time()-t0:.0f}s)')
    i = B['row_of']['movie:346698']
    # BUG (handoff 5, 2b): `np.argsort(-V[i])` indicizza i TEMI (0..23), non i film, quindi questa
    # riga stampava sempre i primi titoli del canone riordinati. Ora cerca i vicini veri.
    _s = V @ V[i].copy()
    _s[i] = -9.0
    o = np.argsort(-_s)[:8]
    print('  Barbie, primi 8: ' + ' · '.join(str(B['titoli'][j])[:22] for j in o))


if __name__ == '__main__':
    main()
