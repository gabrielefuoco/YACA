"""covision-list.py — le LISTE Trakt come fonte di co-visione (utente = autore).

Una lista e' curatela dichiarata da una persona: si tratta come un utente con la sua "cronologia",
con l'unione delle liste dello stesso autore. Peso per autore 1/sqrt(k-1), tetto 3x, cosi' una lista
da 1.000 voci non vale quanto migliaia di spettatori. Nessun fattore temporale: le liste non hanno
date di visione.

  PYTHONPATH=services py -m graph.build.covision_list build
  PYTHONPATH=services py -m graph.build.covision_list build --type      # esporta il tipo LIST
"""
import argparse
import glob
import json
import os
from collections import defaultdict

import numpy as np
import scipy.sparse as sp

from . import data as D

CAP = 3.0
TOPK = 20
MINSUP = 2.0
import os as _os
MINSUP = float(_os.environ.get('LIST_MINSUP', MINSUP))
OUTPATH = _os.environ.get('LIST_OUT', str(D.C.BUILD_CACHE / 'covision-list.npz'))
BLOCK = 1000


def carica_autori():
    """autore -> set di item canonici (unione delle sue liste)."""
    B = D.basic(); N = B['N']; RO = B['row_of']
    # id lista -> autore
    autore_di = {}
    for f in glob.glob('.cache/trakt/lists/popular-*.json'):
        try:
            for w in json.load(open(f, encoding='utf-8')):
                L = w.get('list', w)
                lid = (L.get('ids') or {}).get('trakt')
                u = (L.get('user') or {}).get('ids', {}).get('slug')
                if lid and u: autore_di[lid] = u
        except Exception:
            continue
    # HOLDOUT: gli autori del dev set restano FUORI dal tipo, altrimenti i link che misuriamo
    # sarebbero già nel grafo (una lista → archi fra tutti i suoi film).
    hold = set()
    _hf = os.environ.get('HOLDOUT_AUTORI', str(D.C.RECIPES / 'holdout-autori.json'))
    if _hf and os.path.exists(_hf):
        hold = set(json.load(open(_hf, encoding='utf-8')))
        print(f'  holdout: {len(hold):,} autori esclusi dal tipo LIST')
    autori = defaultdict(set)
    liste = 0; voci = 0; fuori = 0
    for f in glob.glob('.cache/trakt/lists/items-*.json'):
        try:
            lid = int(os.path.basename(f)[6:-5])
        except ValueError:
            continue
        au = autore_di.get(lid)
        if au is None or au in hold:
            continue
        try:
            items = json.load(open(f, encoding='utf-8'))
        except Exception:
            continue
        if not isinstance(items, list):
            continue
        liste += 1
        for it in items:
            o = it.get('movie') or it.get('show') or {}
            t = (o.get('ids') or {}).get('tmdb')
            if not t: continue
            key = f"{'movie' if it.get('movie') else 'tv'}:{int(t)}"
            i = RO.get(key)
            voci += 1
            if i is None:
                fuori += 1
                continue
            autori[au].add(i)
    print(f'  liste {liste:,} · autori {len(autori):,} · voci {voci:,} · fuori canone {fuori:,} '
          f'({100*fuori/max(voci,1):.1f}%) · item unici per autore mediana '
          f'{int(np.median([len(v) for v in autori.values()]))}', flush=True)
    return autori, N


def build(esporta_tipo):
    autori, N = carica_autori()
    nomi = [a for a, xs in autori.items() if len(xs) >= 2]
    uid = {a: r for r, a in enumerate(nomi)}
    k = np.array([len(autori[a]) for a in nomi], dtype=np.float64)
    w = np.where(k > 1, 1.0 / np.sqrt(np.maximum(k - 1, 1)), 1.0)
    w = w / w.mean()
    w = np.minimum(w, CAP * w.mean())

    rr, cc = [], []
    for a in nomi:
        for i in autori[a]:
            rr.append(uid[a]); cc.append(i)
    X = sp.csr_matrix((w[np.array(rr)], (np.array(rr), np.array(cc))), shape=(len(nomi), N),
                      dtype=np.float32)
    X.sum_duplicates()
    print(f'  matrice autori x item: {X.shape[0]:,} x {N:,} · {X.nnz:,} coppie · '
          f'peso medio {w.mean():.3f}', flush=True)
    U = float(w.sum())
    marg = np.asarray(X.sum(0)).ravel().astype(np.float64) + 1e-9

    rows, cols, vals = [], [], []
    for st in range(0, N, BLOCK):
        blk = slice(st, min(st + BLOCK, N))
        C = (X.T[blk] @ X).tocsr()
        for r, i in enumerate(range(st, min(st + BLOCK, N))):
            row = C.getrow(r)
            if row.nnz == 0: continue
            js = row.indices; cw = row.data.astype(np.float64)
            keep = (js != i) & (cw >= MINSUP)
            js = js[keep]; cw = cw[keep]
            if not len(js): continue
            pmi = np.log(cw * U / (marg[i] * marg[js]))
            den = -np.log(np.minimum(cw / U, 1 - 1e-12))
            ok = den > 1e-12
            npmi = np.zeros(len(cw)); npmi[ok] = np.maximum(pmi[ok] / den[ok], 0.0)
            sc = npmi * np.log1p(cw)
            o = np.argpartition(-sc, min(TOPK, len(sc) - 1))[:TOPK]
            rows.extend([i] * len(o)); cols.extend(js[o].tolist()); vals.extend(sc[o].tolist())
        if st % (BLOCK * 10) == 0:
            print(f'    {min(st+BLOCK, N)}/{N}', flush=True)

    M = sp.csr_matrix((np.float32(vals), (np.int32(rows), np.int32(cols))), shape=(N, N))
    M = ((M + M.T) * 0.5).tocsr(); M.setdiag(0); M.eliminate_zeros()
    g = np.asarray((M > 0).sum(1)).ravel()
    print(f'  COVISION-LIST: {M.nnz:,} archi · copertura {100*(g>0).mean():.1f}% · '
          f'grado mediano {int(np.median(g[g>0]))}', flush=True)
    np.savez_compressed(OUTPATH,
                        indptr=M.indptr.astype(np.int64), indices=M.indices.astype(np.int32),
                        data=M.data.astype(np.float32))
    print(f'  scritto {OUTPATH} (minsup {MINSUP:g})', flush=True)
    if esporta_tipo:
        os.makedirs('services/graph/data/tipi', exist_ok=True)
        np.savez_compressed('services/graph/data/tipi/LIST.npz',
                            indptr=M.indptr.astype(np.int64), indices=M.indices.astype(np.int32),
                            data=M.data.astype(np.float32))
        man = json.load(open('services/graph/data/tipi/manifest.json', encoding='utf-8'))
        man['LIST'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                           grado_mediano=int(np.median(g[g > 0])),
                           riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                           ricetta='liste Trakt (autore = utente, unione delle sue liste): '
                                   'NPMI+ * log1p(Cw), minsup 2, top-20',
                           khi=dict(autori=len(nomi)), creato='ora')
        json.dump(man, open('services/graph/data/tipi/manifest.json', 'w', encoding='utf-8'),
                  indent=1, ensure_ascii=False)
        print('  esportato come tipo LIST', flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['build'])
    ap.add_argument('--type', action='store_true')
    a = ap.parse_args()
    build(a.type)
