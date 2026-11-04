"""kw-sem2.py — KWSEM a DUE BLOCCHI: il grafo keyword resta puro, i tag AniList stanno a parte.

  PYTHONPATH=. py .scratch/distillazione-grafo/kw-sem2.py --sem-alpha 0.6 --nome KWSEM2

Perche' esiste: in `kw-sem.py --tags` i tag entrano nello stesso vocabolario delle keyword TMDB, e
finiscono nella top-20 dei vicini semantici di ogni keyword, rubando posti. Sui titoli non-anime il
top-20 cambiava del 3%. Qui invece:

  blocco keyword:  Xs_kw = Xk_kw @ G_kw        identico a KWSEM senza tag
  blocco tag:      Xs_tag = Xt   @ G_t         solo per i titoli che hanno tag
  vettore finale:  [ normalizza(Xs_kw) , w · normalizza(Xs_tag) ]

Un titolo senza tag ha il secondo blocco a zero, e il suo coseno con un altro titolo senza tag e'
esattamente quello del blocco keyword: nessuna contaminazione, per costruzione.
"""
import argparse
import json
import time

import numpy as np
import scipy.sparse as sp
import torch

import importlib.util
import pathlib
import sys

import tipi

_spec = importlib.util.spec_from_file_location(
    'kwsem_mod', str(pathlib.Path(__file__).parent / 'kw-sem.py'))
_m = importlib.util.module_from_spec(_spec)
sys.modules['kwsem_mod'] = _m
_spec.loader.exec_module(_m)
embed_nomi = _m.embed_nomi
grafo_ppmi = _m.grafo_ppmi
grafo_semantico = _m.grafo_semantico
topk_cos_sparse = _m.topk_cos_sparse
from services.graph_dense import data as D


def normalizza_righe(X):
    X = X.tocsr().astype(np.float32)
    n = np.sqrt(np.asarray(X.multiply(X).sum(1)).ravel()) + 1e-9
    return (sp.diags((1.0 / n).astype(np.float32)) @ X).tocsr()


def topk_cos_tau(X, k, tau, blk=1024, etichetta=''):
    """Come topk_cos_sparse ma con shrinkage a tau fissato (quello del blocco keyword)."""
    X = X.tocsr().astype(np.float32)
    n = X.shape[0]
    q = np.sqrt(np.asarray(X.multiply(X).sum(1)).ravel())
    nor = np.sqrt(q ** 2 + tau ** 2)
    Xn = (sp.diags((1.0 / np.maximum(nor, 1e-9)).astype(np.float32)) @ X).tocsr()
    Xt = Xn.T.tocsr()
    rows, cols, vals = [], [], []
    t0 = time.time()
    for st in range(0, n, blk):
        b = Xn[st:st + blk]
        S = (b @ Xt).toarray()
        m = S.shape[0]
        S[np.arange(m), st + np.arange(m)] = -9.0
        kk = min(k, n - 1)
        o = np.argpartition(-S, kk, axis=1)[:, :kk]
        v = np.take_along_axis(S, o, axis=1)
        keep = v > 0
        for r in range(m):
            idx = o[r][keep[r]]
            if not len(idx):
                continue
            rows.extend([st + r] * len(idx)); cols.extend(idx.tolist()); vals.extend(v[r][keep[r]].tolist())
        if (st // blk) % 16 == 0:
            print(f'    {etichetta} {min(st+blk, n)}/{n} ({time.time()-t0:.0f}s)', flush=True)
    M = sp.csr_matrix((np.float32(vals), (np.int32(rows), np.int32(cols))), shape=(n, n))
    M.setdiag(0); M.eliminate_zeros()
    return M


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sem-alpha', type=float, default=0.6)
    ap.add_argument('--model', default='Qwen/Qwen3-Embedding-0.6B')
    ap.add_argument('--per-kw', type=int, default=20)
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--tag-rank', type=int, default=60)
    ap.add_argument('--tag-df', type=int, default=5)
    ap.add_argument('--w-tag', type=float, default=1.0)
    ap.add_argument('--nome', default='KWSEM2')
    a = ap.parse_args()
    tipi.T0 = time.time()

    B = D.basic(); N = B['N']; RO = B['row_of']
    X = D.tfidf(); V = D.vocab()
    kw = [t for t in V if t.startswith('kw:')]
    cols = [V[t] for t in kw]
    Xk = X[:, cols].tocsr().astype(np.float32)
    nomi_kw = [t.split(':', 1)[1] for t in kw]
    print(f'  keyword TMDB: {len(kw):,} · coppie {Xk.nnz:,}', flush=True)

    # ---------------- blocco 1: keyword pure, come KWSEM senza tag ----------------
    Xn = normalizza_righe(Xk)
    print('  grafo PPMI keyword...', flush=True)
    Gp = grafo_ppmi(Xn, a.per_kw)
    print(f'    PPMI: {Gp.nnz:,} archi', flush=True)
    print(f'  embedding dei {len(nomi_kw):,} nomi keyword...', flush=True)
    Ekw = embed_nomi(nomi_kw, a.model)
    Gs = grafo_semantico(Ekw, a.per_kw)
    print(f'    semantica: {Gs.nnz:,} archi', flush=True)
    G = ((1.0 - a.sem_alpha) * Gp + a.sem_alpha * Gs).tocsr()
    G.setdiag(0); G.eliminate_zeros()
    Xs_kw = (Xn @ G).tocsr()
    Xs_kw.eliminate_zeros()
    q_kw = np.sqrt(np.asarray(Xs_kw.multiply(Xs_kw).sum(1)).ravel())
    tau = float(np.median(q_kw[q_kw > 0])) if (q_kw > 0).any() else 1.0
    print(f'  blocco keyword: {Xs_kw.shape} · {Xs_kw.nnz:,} coppie · tau {tau:.4f} '
          f'(lo stesso shrinkage di KWSEM)', flush=True)

    # ---------------- blocco 2: tag AniList, isolato ----------------
    T = json.load(open('.cache/anilist-tags.json', encoding='utf-8'))
    mappa = json.load(open('.cache/anilist-map.json', encoding='utf-8'))['tmdb2ani']
    insiemi = {}
    for key, aid in mappa.items():
        m = T.get(str(aid))
        if not m:
            continue
        t = {n.lower().strip() for n, r, sp_ in m['tags'] if r >= a.tag_rank and not sp_}
        if t:
            insiemi[key] = t
    df = {}
    for t in insiemi.values():
        for n in t:
            df[n] = df.get(n, 0) + 1
    tagn = sorted([n for n, v in df.items() if v >= a.tag_df])
    idx = {n: i for i, n in enumerate(tagn)}
    rr, cc = [], []
    for key, t in insiemi.items():
        i = RO.get(key)
        if i is None:
            continue
        for n in t:
            j = idx.get(n)
            if j is not None:
                rr.append(i); cc.append(j)
    Xt = sp.csr_matrix((np.ones(len(rr), np.float32), (rr, cc)), shape=(N, len(tagn)))
    print(f'  tag: {len(tagn)} vocaboli · {len(rr):,} coppie · titoli '
          f'{int((np.asarray(Xt.sum(1)).ravel() > 0).sum()):,}', flush=True)

    Xtn = normalizza_righe(Xt)
    Gtp = grafo_ppmi(Xtn, a.per_kw)
    Et = embed_nomi(tagn, a.model)
    Gts = grafo_semantico(Et, a.per_kw)
    Gt = ((1.0 - a.sem_alpha) * Gtp + a.sem_alpha * Gts).tocsr()
    Gt.setdiag(0); Gt.eliminate_zeros()
    Xs_tag = normalizza_righe((Xtn @ Gt).tocsr())
    # porto il blocco tag alla stessa scala tipica del blocco keyword: cosi' w_tag=1 significa
    # "i tag pesano come le keyword" e non "pesano quanto capita"
    scala = float(np.median(q_kw[q_kw > 0])) if (q_kw > 0).any() else 1.0
    Xs_tag = (a.w_tag * scala * Xs_tag).tocsr()
    print(f'  blocco tag: {Xs_tag.shape} · {Xs_tag.nnz:,} coppie · '
          f'PPMI {Gtp.nnz:,} · semantica {Gts.nnz:,} · scala {scala:.4f}', flush=True)

    # ---------------- unione dei due blocchi, ognuno normalizzato per riga ----------------
    Xs = sp.hstack([Xs_kw, Xs_tag]).tocsr()
    Xs.eliminate_zeros()
    print(f'  vettore finale: {Xs.shape} · {Xs.nnz:,} coppie · peso blocco tag {a.w_tag}', flush=True)

    # coseno con lo STESSO tau del blocco keyword: per un titolo senza tag la norma e' identica
    # a KWSEM, quindi il suo coseno con un altro titolo senza tag e' identico per costruzione.
    M = topk_cos_tau(Xs, a.k, tau, etichetta=a.nome)
    tipi.save(a.nome, M,
              f'keyword PPMI+semantica ({a.sem_alpha}) su due blocchi separati: {len(kw):,} keyword TMDB '
              f'e {len(tagn)} tag AniList, coseno top-{a.k}, nessuna clusterizzazione',
              {'per_kw': a.per_kw, 'k': a.k, 'kw': len(kw), 'tag': len(tagn),
               'sem_alpha': a.sem_alpha, 'w_tag': a.w_tag, 'model': a.model,
               'tag_rank': a.tag_rank, 'tag_df': a.tag_df, 'blocchi': 2})


if __name__ == '__main__':
    main()
