"""scelta_k.py — quanti contesti? E i contesti applicati alle keyword (ticket 27-28).

PARTE A. Il 48 l'ho scelto a intuito. Qui si sceglie con due criteri onesti, non col bersaglio:
  1. **ricostruzione su holdout**: si nasconde il 5% delle coppie utente-film, si addestra, si misura
     l'errore su quelle coppie. La curva ha un gomito: oltre, il modello impara rumore.
  2. **stabilità**: due run con semi diversi; si misura quanto i contesti restano gli stessi
     (coseno massimo medio fra le righe di H, dopo matching).

PARTE B. Lo stesso metodo applicato alle keyword: matrice film x keyword -> NMF -> profili tematici
morbidi (un film e' "70% satira, 30% dramma", non "ha il tag satira"), poi log-rapporto centrato e
coseno. Se funziona come per i contesti, e' un KWSEM piu' morbido.

  PYTHONPATH=services py -m graph.build.scelta_k [--parte a|b|tutte]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from . import config as C, data as D


def _nmf(X, k, iters, seme=7):
    rng = np.random.default_rng(seme)
    W = (rng.random((X.shape[0], k)).astype(np.float32) + 0.1)
    H = (rng.random((k, X.shape[1])).astype(np.float32) + 0.1)
    for _ in range(iters):
        WtX = W.T @ X
        WtW = W.T @ W
        H *= WtX / (WtW @ H + 1e-9)
        XH = X @ H.T
        HHt = H @ H.T
        W *= XH / (W @ HHt + 1e-9)
        # H e' (k, N), W e' (utenti, k): servono due forme diverse della stessa norma
        n = np.linalg.norm(H, axis=1, keepdims=True)      # (k, 1)
        H /= n
        W *= n.T                                          # (1, k)
    return W, H


def _matrice_contesti(B):
    from . import contesti as CT
    X, nomi = CT.matrice(B)
    return X


def parte_a(k_list=(24, 48, 96, 192), iters=60, quota_hold=0.05, seme=11):
    B = D.basic()
    X = _matrice_contesti(B)
    X = X.tocsr()
    rng = np.random.default_rng(seme)
    nnz = X.nnz
    idx = rng.choice(nnz, size=int(nnz * quota_hold), replace=False)
    coo = X.tocoo()
    righe_h, cols_h, val_h = coo.row[idx], coo.col[idx], coo.data[idx]
    mask = np.zeros(nnz, bool); mask[idx] = True
    Xtr = sp.csr_matrix((coo.data[~mask], (coo.row[~mask], coo.col[~mask])), shape=X.shape)
    print(f'  holdout: {len(idx):,} coppie nascoste su {nnz:,} ({quota_hold:.0%})', flush=True)
    print(f'{"K":>4}{"RMSE holdout":>15}{"stabilità (cos mediano)":>26}{"tempo":>8}')
    righe = []
    for k in k_list:
        t0 = time.time()
        W, H = _nmf(Xtr, k, iters, seme)
        rec = np.einsum('ij,ji->i', W[righe_h], H[:, cols_h])
        rmse = float(np.sqrt(np.mean((val_h - rec) ** 2)))
        _, H2 = _nmf(Xtr, k, iters, seme + 1)
        # matching: per ogni contesto, il miglior coseno nell'altra run
        A = H / (np.linalg.norm(H, axis=1, keepdims=True) + 1e-9)
        Bm = H2 / (np.linalg.norm(H2, axis=1, keepdims=True) + 1e-9)
        sim = np.abs(A @ Bm.T).max(axis=1)
        stab = float(np.median(sim))
        righe.append((k, rmse, stab))
        print(f'{k:>4}{rmse:>15.5f}{stab:>26.3f}{time.time()-t0:>7.0f}s', flush=True)
    best = min(righe, key=lambda r: r[1])
    print(f'\nK con RMSE minore: {best[0]} · stabilità {best[2]:.3f}')
    return righe


def parte_b(k=48, iters=60):
    """NMF su film x keyword -> profili tematici morbidi -> tipo KWSEM_SOFT."""
    t0 = time.time()
    B = D.basic()
    from . import provenance as PV
    from .tone import incidenza_keyword
    X, kws = incidenza_keyword(B)                 # (film x keyword), binaria
    print(f'  kw: matrice {X.shape[0]:,} x {X.shape[1]:,} · {X.nnz:,} incidenze', flush=True)
    X = X.tocsr()
    # si trasposta per fattorizzare keyword x film: i "contesti" sono temi, W = temi x keyword
    Wk, Hf = _nmf(X.T.tocsr(), k, iters)          # Wk: (n_kw, k) · Hf: (k, n_film)
    # Le righe di Hf sono i profili dei film sui temi. come per CONTESTI: log-rapporto + centratura
    quota = Hf / (Hf.sum(0, keepdims=True) + 1e-9)
    v = np.log(np.maximum(quota, 1e-9) / np.maximum(quota.mean(1, keepdims=True), 1e-9))
    v = v - v.mean(1, keepdims=True)
    v[:, Hf.sum(0) <= 0] = 0.0
    Vf = (v / (np.linalg.norm(v, axis=0, keepdims=True) + 1e-9)).T   # (n_film, k)
    from . import tipi
    M = tipi.topk_cosine(Vf.astype(np.float32), 100, etichetta='kwsem_soft')
    out = C.DATA / 'KWSEM_SOFT.npz'
    PV.scrivi(out, M, step='tipi', params={'tipo': 'KWSEM_SOFT', 'k': 100, 'temi': k},
              inputs={'tfidf': PV.sha256_file(C.SRC / C.TFIDF)}, canon_len=B['N'])
    print(f'  kwsem_soft: {M.nnz:,} archi · scritto {out} ({time.time()-t0:.0f}s)', flush=True)
    # diagnostica: i temi hanno senso? primi 8 titoli del profilo di Barbie
    T = B['titoli']; i = B['row_of']['movie:346698']
    # BUG (handoff 5, 2b): argsort su Vf[i] dava indici di tema, non di film.
    _s = Vf @ Vf[i].copy(); _s[i] = -9.0
    o = np.argsort(-_s)[:8]
    print('  Barbie, primi 8 nel nuovo spazio: ' + ' · '.join(str(T[j])[:22] for j in o))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--parte', choices=['a', 'b', 'tutte'], default='tutte')
    ap.add_argument('--k', type=int, default=48)
    a = ap.parse_args()
    if a.parte in ('a', 'tutte'):
        print('=== A. quanti contesti ===')
        parte_a()
    if a.parte in ('b', 'tutte'):
        print('\n=== B. NMF sulle keyword ===')
        parte_b(a.k)
