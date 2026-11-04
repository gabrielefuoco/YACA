"""kw-exp.py — tipo KWEXP: keyword pesate per quanto NON dicono la trama, espanse coi sinonimi.

  PYTHONPATH=. py .scratch/distillazione-grafo/kw-exp.py [--lam 1.0] [--gamma 1.0] [--nome KWEXP]

LA RICETTA, in tre passi:

1. PESO CHE PREMIA LE KEYWORD LATENTI. Per ogni (titolo, keyword) si calcola il coseno fra
   l'embedding della trama e quello del nome della keyword. Una keyword che la trama già dice
   ("based on toy" per Barbie, 0,44) pesa poco; una che la trama NON dice ("feminism", 0,30) pesa
   molto:  w = idf(k) · (1 − cos)^gamma.

2. ESPANSIONE COI SINONIMI, per TUTTE le keyword (non solo le latenti). Il grafo semantico delle
   keyword (Qwen3 sui nomi) dà i vicini con il loro coseno; qui la similarità NON si normalizza a
   somma 1 (è il difetto che affossava KWSEM: "feminism"→"women's liberation" prende 0,855 del peso,
   non 1/20).  Xe = Xw + lam · (Xw @ S),  S = top-n con cos ≥ soglia.

3. IL RESTO COME KWSEM: grafo keyword PPMI+semantica (alpha 0,6) sull'incidenza espansa, poi
   proiezione dei titoli e coseno top-k.

Gli embedding dei nomi delle keyword si leggono da `kw-emb.npy` (salvati una volta da
`kw-emb-cache.py`): non si ricalcolano a ogni build.
"""
import argparse
import json
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

import tipi
from services.graph_dense import config as C
from services.graph_dense import data as D

T0 = time.time()


def incidenza(B, kw):
    """(righe, colonne, idf) delle coppie titolo-keyword, pesate con l'idf di 05-idf."""
    V = D.vocab(); idf = np.load(C.SRC / '05-idf.npy')
    col = {t[3:]: V[t] for t in V if t.startswith('kw:')}
    pos = {n: i for i, n in enumerate(kw)}
    rr, cc = [], []
    for tipo, f in (('movie', 'movies.parquet'), ('tv', 'tv.parquet')):
        d = pd.read_parquet(C.TMDB / f, columns=['id', 'keywords'])
        for r in d.itertuples(index=False):
            i = B['row_of'].get(f'{tipo}:{int(r.id)}')
            if i is None:
                continue
            try:
                ks = {str(x.get('name', '')).lower() for x in json.loads(r.keywords or '[]')}
            except Exception:
                continue
            for k in ks:
                j = pos.get(k)
                if j is not None:
                    rr.append(i); cc.append(col[k])
    # l'indice di colonna del vocabolario non è l'indice in `kw` (ordine diverso): rimappo
    rr = np.asarray(rr, np.int64); cc = np.asarray(cc, np.int64)
    return rr, cc, idf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lam', type=float, default=1.0)
    ap.add_argument('--gamma', type=float, default=1.0)
    ap.add_argument('--soglia-cos', type=float, default=0.75)
    ap.add_argument('--per-kw', type=int, default=20)
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--sem-alpha', type=float, default=0.6)
    ap.add_argument('--nome', default='KWEXP')
    a = ap.parse_args()
    tipi.T0 = time.time()

    B = D.basic(); N = B['N']
    kw = (C.DATA / 'kw-emb.txt').read_text(encoding='utf-8').split('\n')
    E = np.load(C.DATA / 'kw-emb.npy').astype(np.float32)
    E /= (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
    print(f'keyword: {len(kw):,} · embedding {E.shape} (da cache)', flush=True)

    V = D.vocab(); idf = np.load(C.SRC / '05-idf.npy')
    pos_in_kw = {t: i for i, t in enumerate(kw)}
    # la colonna nel vettore `kw` NON è la colonna del vocabolario (le kw: non sono contigue)
    col2kwpos = {V[t]: pos_in_kw[t[3:]] for t in V if t.startswith('kw:')}

    rr, cc, _ = incidenza(B, kw)          # rr riga canone, cc colonna del VOCABOLARIO
    kwidx = np.array([col2kwpos[c] for c in cc], np.int32)   # colonna nel vettore kw
    w_idf = idf[cc].astype(np.float32)
    print(f'incidenza: {len(rr):,} coppie titolo-keyword', flush=True)

    # --- 1. peso che premia le keyword lontane dalla trama ---
    Xp, has, _ = D.plot_embedding(B)
    cosv = np.zeros(len(rr), np.float32)
    passo = 50_000
    for st in range(0, len(rr), passo):
        sl = slice(st, min(st + passo, len(rr)))
        cosv[sl] = np.sum(Xp[rr[sl]] * E[kwidx[sl]], axis=1)
        if st % (passo * 4) == 0:
            print(f'  coseno trama-keyword {sl.stop:,}/{len(rr):,} ({time.time()-T0:.0f}s)', flush=True)
    cosv = np.clip(cosv, 0.0, 1.0)
    w = w_idf * np.power(1.0 - cosv, a.gamma)
    w[~has[rr]] = w_idf[~has[rr]]        # senza trama non c'è nulla da scontare
    Xw = sp.csr_matrix((w, (rr, kwidx)), shape=(N, len(kw)), dtype=np.float32)
    Xw.sum_duplicates()
    print(f'  peso: idf medio {w_idf.mean():.2f} → dopo lo sconto {np.asarray(Xw.sum(1)).ravel().mean()/max(1,1):.2f} '
          f'per titolo · coseno mediano {np.median(cosv):.2f}', flush=True)

    # --- 2. espansione coi sinonimi (similarità NON normalizzata) ---
    blk = 1024; rows, cols, vals = [], [], []
    for st in range(0, len(kw), blk):
        M = E[st:st + blk] @ E.T
        for r in range(M.shape[0]):
            M[r, st + r] = -9.0
        o = np.argpartition(-M, a.per_kw, axis=1)[:, :a.per_kw]
        for r in range(M.shape[0]):
            idx, v = o[r], M[r, o[r]]
            keep = v >= a.soglia_cos
            if not keep.any():
                continue
            rows.extend([st + r] * int(keep.sum()))
            cols.extend(idx[keep].tolist())
            vals.extend(v[keep].tolist())
        if (st // blk) % 4 == 0:
            print(f'  similarità keyword {min(st+blk,len(kw)):,}/{len(kw):,} ({time.time()-T0:.0f}s)', flush=True)
    S = sp.csr_matrix((np.float32(vals), (np.int32(rows), np.int32(cols))), shape=(len(kw), len(kw)))
    print(f'  sinonimi: {S.nnz:,} archi (cos ≥ {a.soglia_cos}) · grado mediano '
          f'{int(np.median(np.diff(S.indptr)))}', flush=True)
    Xe = (Xw + a.lam * (Xw @ S)).tocsr()
    Xe.sum_duplicates()
    print(f'  incidenza espansa: {Xe.nnz:,} valori (da {Xw.nnz:,})', flush=True)

    # --- 3. come KWSEM: normalizza, grafo keyword, proiezione, coseno ---
    n = np.sqrt(np.asarray(Xe.multiply(Xe).sum(1)).ravel()) + 1e-9
    Xn = (sp.diags(1.0 / n) @ Xe).tocsr()
    from importlib import import_module
    import importlib.util, pathlib, sys
    spec = importlib.util.spec_from_file_location('kwsem_mod', str(pathlib.Path(__file__).parent / 'kw-sem.py'))
    m = importlib.util.module_from_spec(spec); sys.modules['kwsem_mod'] = m; spec.loader.exec_module(m)
    Gp = m.grafo_ppmi((Xn > 0).astype(np.float32).tocsr(), a.per_kw)
    Gs = sp.csr_matrix((np.float32(vals), (np.int32(rows), np.int32(cols))), shape=(len(kw), len(kw)))
    G = ((1.0 - a.sem_alpha) * Gp + a.sem_alpha * Gs).tocsr()
    G.setdiag(0); G.eliminate_zeros()
    print(f'  grafo keyword: {G.nnz:,} archi', flush=True)
    Xs = (Xn @ G).tocsr(); Xs.eliminate_zeros()
    M = m.topk_cos_sparse(Xs, a.k, shrink=True, etichetta=a.nome)
    tipi.save(a.nome, M,
              f'keyword pesate per (1-coseno con la trama)^gamma e espanse coi sinonimi (cos ≥ {a.soglia_cos}, '
              f'lam {a.lam}); grafo PPMI+semantica alpha {a.sem_alpha}; coseno top-{a.k}',
              {'lam': a.lam, 'gamma': a.gamma, 'soglia_cos': a.soglia_cos, 'per_kw': a.per_kw,
               'k': a.k, 'sem_alpha': a.sem_alpha, 'sinonimi': int(S.nnz)})


if __name__ == '__main__':
    main()
