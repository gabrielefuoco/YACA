"""contesti.py — segmenti di visione senza clusterizzare gli utenti (ticket 26).

L'IDEA. Una persona non è un vettore unico: guarda *Barbie* con i figli e *The Substance* da sola. Se
la si assegna a un solo segmento, quei due contesti si mediano e spariscono. Qui la cronologia è una
**miscela**: ogni utente pesa su più contesti, e ogni film appartiene a più contesti.

    X (utenti × titoli)  ≈  W (utenti × K) · H (K × titoli)        NMF, non negativa

`W[u,k]` = quanto l'utente u vive il contesto k; `H[k,:]` = quali titoli vivono in quel contesto.

FONTI (blocchi disgiunti in riga, **H condiviso**): MovieLens (voti), Trakt (presenza), AniList
(anime), Serializd (serie). Ogni blocco è normalizzato sulla propria massa, così MovieLens non
schiaccia gli altri per volume.

  PYTHONPATH=. py -m services.graph_dense.contesti [--k 48] [--iter 60]
"""
from __future__ import annotations

import argparse
import json
import math
import time
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp

from . import config as C, data as D, trakt as TK

ROOT = C.ROOT


def _ml(B):
    links = pd.read_csv(ROOT / '.cache' / 'movielens' / 'ml-32m' / 'links.csv').dropna(subset=['tmdbId'])
    ro = B['row_of']
    ml2r = {}
    for mid, t in zip(links.movieId, links.tmdbId):
        r = ro.get(f'movie:{int(t)}')
        if r is not None:
            ml2r[int(mid)] = r
    d = pd.read_csv(ROOT / '.cache' / 'movielens' / 'ml-32m' / 'ratings.csv',
                    usecols=['userId', 'movieId', 'rating'])
    d = d[(d.rating >= 4.0) & d.movieId.isin(ml2r.keys())]
    uid, _ = pd.factorize(d.userId)
    righe = np.array([ml2r[int(m)] for m in d.movieId], np.int32)
    return uid.astype(np.int32), righe, 'movielens'


def _trakt(B):
    U, I, _ = TK.carica()
    return U.astype(np.int32), I.astype(np.int32), 'trakt'


def _anilist(B):
    raw = json.loads((ROOT / '.cache' / 'anilist-map.json').read_text(encoding='utf-8'))
    m = raw.get('tmdb2ani', raw) if isinstance(raw, dict) else {}   # il file ha due chiavi di primo livello
    inv = {}
    for k, aid in m.items():
        r = B['row_of'].get(k)
        if r is not None:
            inv[int(aid)] = r
    righe, users = [], []
    for n, f in enumerate(sorted((ROOT / '.cache' / 'anilist' / 'users').glob('*.json'))):
        try:
            ids = json.loads(f.read_text(encoding='utf-8'))
        except Exception:
            continue
        for a in ids:
            if not isinstance(a, (int, float, str)):
                continue
            try:
                r = inv.get(int(a))
            except (TypeError, ValueError):
                continue
            if r is not None:
                righe.append(r); users.append(n)
    return np.asarray(users, np.int32), np.asarray(righe, np.int32), 'anilist'


def _serializd(B):
    ro = B['row_of']
    righe, users = [], []
    for n, f in enumerate(sorted((ROOT / '.cache' / 'serializd' / 'users').glob('*.json'))):
        try:
            ids = json.loads(f.read_text(encoding='utf-8'))
        except Exception:
            continue
        for t in ids:
            if not isinstance(t, (int, float, str)):
                continue
            try:
                k = int(t)
            except (TypeError, ValueError):
                continue
            r = ro.get(f'tv:{k}') or ro.get(f'movie:{k}')
            if r is not None:
                righe.append(r); users.append(n)
    return np.asarray(users, np.int32), np.asarray(righe, np.int32), 'serializd'


def matrice(B):
    blocchi = []
    off = 0
    for fn in (_ml, _trakt, _anilist, _serializd):
        try:
            u, i, nome = fn(B)
        except Exception as e:
            print(f'  contesti: blocco {fn.__name__} saltato ({e})', flush=True)
            continue
        if len(u) == 0:
            continue
        u = u + off
        off = int(u.max()) + 1
        # 1/sqrt(eventi): compromesso fra "ogni fonte conta uguale" (che con 1/len porta i valori a
        # 1e-8 e fa COLLASSARE le moltiplicative: 196.733 utenti su 205.892 azzerati) e "vince chi ha
        # più eventi" (MovieLens 15,8M contro Serializd 28k).
        w = 1.0 / np.sqrt(max(len(u), 1))
        blocchi.append((nome, u, i, w))
        print(f'  contesti: {nome:<10} {u.max()-u.min()+1:>7,} utenti · {len(i):>9,} eventi · '
              f'{len(set(i.tolist())):>6,} titoli', flush=True)
    righe = np.concatenate([u for _, u, _, _ in blocchi])
    cols = np.concatenate([i for _, _, i, _ in blocchi])
    vals = np.concatenate([np.full(len(u), w, np.float32) for _, u, _, w in blocchi])
    X = sp.csr_matrix((vals, (righe, cols)), shape=(off, B['N']), dtype=np.float32)
    X.sum_duplicates()
    X.data[:] = np.minimum(X.data, 1.0)
    return X, [n for n, _, _, _ in blocchi]


def nmf(X, k=48, iters=60, seme=7, verbose=True):
    """NMF moltiplicativa (Lee-Seung) con inizializzazione casuale deterministica."""
    rng = np.random.default_rng(seme)
    W = rng.random((X.shape[0], k)).astype(np.float32) + 0.1
    H = rng.random((k, X.shape[1])).astype(np.float32) + 0.1
    for it in range(1, iters + 1):
        WtX = W.T @ X
        WtW = W.T @ W
        H *= WtX / (WtW @ H + 1e-9)
        XH = X @ H.T          # (utenti x titoli) @ (titoli x k) -> (utenti x k)
        HHt = H @ H.T
        W *= XH / (W @ HHt + 1e-9)
        H /= (np.linalg.norm(H, axis=1, keepdims=True) + 1e-9)
        W *= np.linalg.norm(H, axis=1)[None, :]
        if verbose and it % 10 == 0:
            # proxy di convergenza: ||WtX - WtW H|| (costa k×N, non n×m)
            err = float(np.linalg.norm(WtX - WtW @ H))
            print(f'    nmf iter {it:>3} · ||WtX - WtW H|| {err:,.0f}', flush=True)
    return W, H


def entropia(conteggi):
    tot = sum(conteggi.values())
    return 0.0 if tot <= 0 else -sum((c / tot) * math.log2(c / tot) for c in conteggi.values() if c)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=48)
    ap.add_argument('--iter', type=int, default=60)
    ap.add_argument('--out', default='services/graph_dense/data/contesti.npz')
    a = ap.parse_args()
    t0 = time.time()
    B = D.basic()
    T, YEAR, TV = B['titoli'], B['year'], B['is_tv']
    X, nomi = matrice(B)
    print(f'  contesti: matrice {X.shape[0]:,} × {X.shape[1]:,} · {X.nnz:,} eventi', flush=True)
    W, H = nmf(X, a.k, a.iter)
    print(f'  contesti: NMF fatta ({time.time()-t0:.0f}s)', flush=True)
    np.savez_compressed(a.out, W=W.astype(np.float32), H=H.astype(np.float32),
                        blocchi=np.array(nomi, dtype=object))

    # generi per titolo, per capire se i contesti sono generi travestiti
    gen = {}
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
                gen[r] = gs[0]

    print(f'\n{"#":>3} {"massa":>7} {"generi":>7} {"film":>5} {"serie":>5} {"anime":>6}  primi titoli')
    righe = []
    for kk in range(a.k):
        h = H[kk]
        massa = float(h.sum())
        top = np.argsort(-h)[:40]
        cg = Counter(gen[int(j)] for j in top if int(j) in gen)
        ent = entropia(cg)
        n_tv = sum(1 for j in top if TV[int(j)])
        titoli = ' · '.join(str(T[int(j)])[:22] for j in top[:6])
        righe.append((kk, massa, ent, 40 - n_tv, n_tv))
        print(f'{kk:>3} {massa:>7.1f} {ent:>7.2f} {40-n_tv:>5} {n_tv:>5} {0:>6}  {titoli}')
    ent_med = float(np.median([r[2] for r in righe]))
    print(f'\nentropia di genere mediana dei primi 40 titoli per contesto: {ent_med:.2f} bit')
    print('  (< 1,5 = il contesto è un genere travestito;  > 2,0 = mescola registri)')


if __name__ == '__main__':
    main()
