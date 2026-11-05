"""kw_beh.py — quali keyword portano pubblico, non solo soggetto (proposta A).

L'IDEA. Oggi KWSEM tratta tutti i tag allo stesso modo: `existentialism` e `based on novel` pesano
uguale. Ma alcuni tag **predicono il pubblico** e altri no, e si misura senza etichette:

    lift(k) = co-visione media fra i film che portano k  /  co-visione media fra film dello stesso
              genere (campione della stessa dimensione)

Le keyword che sopravvivono a quel controllo portano gusto, non soggetto. Poi si ripesa KWSEM: un arco
fra due film vale di più se le keyword condivise hanno lift alto.

  PYTHONPATH=. py -m services.graph_dense.kw_beh [--k 100]
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


def generi(B):
    out = [None] * B['N']
    for tipo, f in (('movie', 'movies.parquet'), ('tv', 'tv.parquet')):
        d = pd.read_parquet(C.TMDB / f, columns=['id', 'genres'])
        for i, g in zip(d.id, d.genres):
            r = B['row_of'].get(f'{tipo}:{int(i)}')
            if r is None:
                continue
            try:
                gs = [str(x.get('name', '')).lower() for x in json.loads(g or '[]') if isinstance(x, dict)]
            except Exception:
                gs = []
            if gs:
                out[r] = gs[0]
    return out


def _cos_media(V, idx):
    """Coseno medio fra tutte le coppie di `idx` (analitico: (|sum|^2 - n) / (n(n-1)))."""
    s = V[idx].sum(0)
    n = len(idx)
    return float((s @ s - n) / max(n * (n - 1), 1))


def lift_keyword(B, X, kws, V, gen, rng, max_film=400, max_df=3000):
    B_ = B
    """lift comportamentale per keyword: affinita' di contesto dentro il gruppo / nel genere.

    NON si usa COVISION a coppie: ha 20 archi per riga, e in un gruppo di 400 film non ci sono
    abbastanza coppie collegate per una media (tutti zeri). I profili di contesto sono densi.
    """
    per_genere = {}
    for r, g in enumerate(gen):
        if g:
            per_genere.setdefault(g, []).append(r)
    pesi = {}
    for k, gi in enumerate(kws):
        # NON `X[:, k].indices`: su una fetta (N,1) sono gli indici di COLONNA (tutti 0).
        films = X[:, k].nonzero()[0]
        if len(films) < 20 or len(films) > max_df:
            continue
        f = rng.choice(films, size=min(len(films), max_film), replace=False)
        n = len(f)
        if n < 20:
            continue
        dentro = _cos_media(V, f)
        # basale: stessi film in numero, ma presi dal genere dominante
        cg = {}
        for r in f:
            g = gen[int(r)]
            if g:
                cg[g] = cg.get(g, 0) + 1
        g0 = max(cg, key=cg.get) if cg else None
        pool = per_genere.get(g0) or []
        if len(pool) < 20:
            continue
        # BASALE STRATIFICATO: stesso genere E stessa fascia di popolarita'. Senza, il lift misura
        # la fama dei film che portano il tag (i gruppi di film noti hanno pubblici piu' densi).
        voti = np.array([B_['VOT'][r] for r in f])
        fascia = float(np.median(np.log1p(voti))) if len(voti) else 0.0
        pool_v = [r for r in pool if abs(np.log1p(B_['VOT'][r]) - fascia) <= 1.0]
        if len(pool_v) >= 20:
            pool = pool_v
        b = rng.choice(pool, size=min(len(pool), n), replace=False)
        base = _cos_media(V, b)
        if base <= 0:
            continue
        pesi[k] = dentro - base          # eccesso ASSOLUTO: il rapporto satura (il basale e' ~0)
    return pesi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--out', default='services/graph/data/tipi2/KWSEM_W.npz')
    ap.add_argument('--manifest', default='services/graph/data/tipi2/manifest.json')
    a = ap.parse_args()
    t0 = time.time()
    from . import provenance as PV
    from .tone import incidenza_keyword
    B = D.basic(); N = B['N']
    X, kws = incidenza_keyword(B)
    from . import contesti_tipo as CT
    H = np.load(C.DATA / 'contesti.npz', allow_pickle=True)['H']
    V = CT.profili(H)
    gen = generi(B)
    rng = np.random.default_rng(20261105)
    lift = lift_keyword(B, X, kws, V, gen, rng)
    print(f'  kw_beh: {len(lift):,} keyword con lift misurabile ({time.time()-t0:.0f}s)', flush=True)
    if not lift:
        raise SystemExit('nessuna keyword misurabile')
    vals = np.array(list(lift.values()))
    p95 = float(np.percentile(vals, 95)) if len(vals) else 1.0
    print(f'  kw_beh: eccesso mediano {np.median(vals):.4f} · p90 {np.percentile(vals,90):.4f} · '
          f'p95 {p95:.4f}', flush=True)
    top = sorted(lift.items(), key=lambda kv: -kv[1])[:20]
    print('  keyword con più pubblico (oltre il genere): ' +
          ', '.join(f'{kws[i]} ({v:.3f})' for i, v in top), flush=True)
    peso = {k: float(np.clip(v / max(p95, 1e-9), 0.0, 1.0)) for k, v in lift.items()}
    idx = [i for i in range(len(kws)) if i in peso]
    W = np.zeros(len(kws), np.float32)
    for i in idx:
        W[i] = peso[i]
    # ripesa KWSEM: ogni arco per la media dei pesi delle keyword condivise
    Z = PV.leggi('services/graph/data/tipi2/KWSEM.npz')[0].tocsr()
    # RIPESAMENTO SU TUTTI GLI ARCHI, con prodotti sparsi invece del ciclo per arco:
    #   numeratore = somma dei pesi delle keyword condivise
    #   denominatore = numero di keyword condivise
    A = X.multiply(W[None, :]).tocsr()           # film x keyword, pesata
    num = (A @ X.T).tocsr()                      # somma dei pesi condivisi
    den = (X @ X.T).tocsr()                      # conteggio delle condivise
    Z = PV.leggi('services/graph/data/tipi2/KWSEM.npz')[0].tocsr()
    Z = Z.multiply(1.0)
    Zc = Z.tocoo()
    fatt = np.ones(len(Zc.data), np.float32)
    nz = num.tocsr(); dz = den.tocsr()
    for k, (i, j) in enumerate(zip(Zc.row, Zc.col)):
        d = dz[i, j]
        if d > 0:
            fatt[k] = 0.5 + float(nz[i, j]) / float(d)
    # NORMALIZZAZIONE A MEDIA 1: senza, `0,5 + w` ha media ~0,75 e il tipo perde un quarto di massa —
    # così si misura il RIORDINO, non un calo globale di peso (l'errore della prima versione).
    prima = float(fatt.mean())
    fatt /= max(prima, 1e-9)
    print(f'  kw_beh: fattore medio prima della normalizzazione {prima:.3f} -> 1,000', flush=True)
    M = sp.csr_matrix((Zc.data * fatt, (Zc.row, Zc.col)), shape=(N, N)).tocsr()
    M.setdiag(0); M.eliminate_zeros()
    r_, c_, v_ = [], [], []
    for i in range(N):
        r0 = M.getrow(i)
        if r0.nnz == 0:
            continue
        dat, idxs = r0.data, r0.indices
        if len(dat) > a.k:
            o = np.argpartition(-dat, a.k)[:a.k]
            dat, idxs = dat[o], idxs[o]
        r_.append(np.full(len(idxs), i, np.int32)); c_.append(idxs.astype(np.int32)); v_.append(dat)
    M = sp.csr_matrix((np.concatenate(v_), (np.concatenate(r_), np.concatenate(c_))), shape=(N, N))
    prov = PV.scrivi(a.out, M, step='tipi', params={'tipo': 'KWSEM_W', 'k': a.k,
                                                   'keyword_pesate': len(lift)},
                     inputs={'KWSEM': PV.sha256_file('services/graph/data/tipi2/KWSEM.npz'),
                             'contesti': PV.sha256_file(C.DATA / 'contesti.npz')},
                     canon_len=N)
    g = np.asarray((M > 0).sum(1)).ravel()
    man = json.loads(Path(a.manifest).read_text(encoding='utf-8')) if Path(a.manifest).exists() else {}
    man['KWSEM_W'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                          grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                          riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                          ricetta='KWSEM ripesato per lift comportamentale delle keyword condivise',
                          khi={'k': a.k}, creato=time.strftime('%Y-%m-%d %H:%M'))
    Path(a.manifest).write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'scritto {a.out} · {M.nnz:,} archi · prov {prov["sha256"][:12]} ({time.time()-t0:.0f}s)')


if __name__ == '__main__':
    main()
