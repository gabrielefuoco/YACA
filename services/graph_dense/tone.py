"""tone.py — il sottospazio del tono: quello che resta quando si toglie il soggetto (ticket 07).

L'IPOTESI. Quindici varianti sulle keyword hanno fallito perché sommano 1-grammi di *soggetto*:
`feminism` porta ai documentari, `doll` agli horror con le bambole. Il tono non è un sostantivo: è ciò
che resta della rappresentazione quando si toglie **ciò di cui il film parla**.

COME SI FA (prima parte, senza addestrare niente). Per ogni titolo:
  1. `s_i` = direzione del **soggetto**: media (pesata idf) degli embedding delle sue keyword, normalizzata;
  2. `r_i` = `z_i − (z_i · ŝ_i) ŝ_i`: la parte della trama che il soggetto **non** spiega;
  3. il tipo TONE è il coseno fra i residui.

Se il residuo è rumore, questo si vede subito e non si butta tempo nel contrastivo (seconda parte, che
richiederebbe coppie positive/negative e un MLP). Il criterio è dichiarato nel ticket: se *Barbie* non si
muove, l'ipotesi è falsa su questi dati e serve il dato nuovo (recensioni / Wikipedia), non altre prove.

  PYTHONPATH=. py -m services.graph_dense.tone [--k 100] [--peso-idf]
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

from . import config as C, data as D


def incidenza_keyword(B):
    """(N x n_kw) binaria + nomi delle keyword, letta dai Parquet TMDB."""
    ro = B['row_of']
    per_kw = {}
    for tipo, f in (('movie', 'movies.parquet'), ('tv', 'tv.parquet')):
        d = pd.read_parquet(C.TMDB / f, columns=['id', 'keywords'])
        for r in d.itertuples(index=False):
            i = ro.get(f'{tipo}:{int(r.id)}')
            if i is None:
                continue
            try:
                ks = {str(x.get('name', '')).lower() for x in json.loads(r.keywords or '[]')
                      if isinstance(x, dict)}
            except Exception:
                continue
            for k in ks:
                per_kw.setdefault(k, []).append(i)
    kws = sorted(per_kw)
    ki = {k: j for j, k in enumerate(kws)}
    rr, cc = [], []
    for k, films in per_kw.items():
        for f in films:
            rr.append(f); cc.append(ki[k])
    X = sp.csr_matrix((np.ones(len(rr), np.float32), (np.int32(rr), np.int32(cc))),
                      shape=(B['N'], len(kws)))
    X.data[:] = 1.0
    return X, kws


def direzione_soggetto(X, kws, pesa_idf=True):
    """La direzione del soggetto per ogni titolo: media degli embedding delle sue keyword."""
    nomi = (C.DATA / 'kw-emb.txt').read_text(encoding='utf-8').split('\n')
    pos = {k: j for j, k in enumerate(nomi)}
    E = np.load(C.DATA / 'kw-emb.npy').astype(np.float32)
    E /= (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
    # le keyword senza embedding restano fuori: meglio un soggetto parziale che uno sbagliato
    tiene = np.array([pos.get(k, -1) for k in kws])
    ok = tiene >= 0
    Xe = X[:, ok].tocsr()
    Ek = E[tiene[ok]]
    if pesa_idf:
        df = np.asarray(Xe.sum(0)).ravel()
        idf = np.log((1 + Xe.shape[0]) / (1 + df)) + 1.0
        Xe = Xe.multiply(idf[None, :]).tocsr()
    S = (Xe @ Ek).astype(np.float32)
    n = np.linalg.norm(S, axis=1, keepdims=True)
    print(f'  tone: {int(ok.sum()):,}/{len(kws):,} keyword con embedding · '
          f'{int((n.ravel() > 0).sum()):,} titoli con un soggetto', flush=True)
    return S / (n + 1e-9)


def residuo(B=None, z=None, S=None):
    """`z` meno la componente spiegata dal soggetto, riga per riga, poi normalizzato."""
    B = D.basic() if B is None else B
    if z is None:
        from . import data as _D
        z = _D.plot_embedding(B)[0]
    if S is None:
        X, kws = incidenza_keyword(B)
        S = direzione_soggetto(X, kws)
    # proiezione: r = z - (z·ŝ) ŝ.  Dove ŝ è nullo il residuo è z (nessuna informazione di soggetto).
    proiezione = np.sum(z * S, axis=1, keepdims=True)
    r = z - proiezione * S
    n = np.linalg.norm(r, axis=1, keepdims=True)
    print(f'  tone: residuo calcolato · norma mediana {np.median(n):.3f} '
          f'(trama mediana {np.median(np.linalg.norm(z, axis=1)):.3f})', flush=True)
    return r / (n + 1e-9)


def tipo_tone(B=None, k=100, z=None):
    from . import config as _C
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'tipi', _C.ROOT / '.scratch' / 'distillazione-grafo' / 'tipi.py')
    tipi = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tipi)
    R = residuo(B, z)
    return tipi.topk_cosine(R, k, etichetta='tone')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--out', default='services/graph/data/tipi2/TONE.npz')
    a = ap.parse_args()
    t0 = time.time()
    from . import provenance as PV
    B = D.basic()
    M = tipo_tone(B, a.k)
    prov = PV.scrivi(a.out, M, step='tipi',
                     params={'tipo': 'TONE', 'k': a.k,
                             'ricetta': 'residuo della trama ortogonale al soggetto (keyword idf)'},
                     inputs={'trama': PV.sha256_file(C.DATA / 'trama-qwen3b.npy'),
                             'kw-emb': PV.sha256_file(C.DATA / 'kw-emb.npy')},
                     canon_len=B['N'])
    print(f'scritto {a.out} · archi {M.nnz:,} · prov {prov["sha256"][:12]} '
          f'({time.time()-t0:.0f}s)')


if __name__ == '__main__':
    main()
