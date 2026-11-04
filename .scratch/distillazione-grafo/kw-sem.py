"""kw-sem.py — tipo KWSEM: il grafo delle keyword con PPMI *e* la semantica, senza clusterizzare.

  PYTHONPATH=. py .scratch/distillazione-grafo/kw-sem.py [--sem-alpha 0.4] [--model Qwen/Qwen3-Embedding-0.6B]

Differenza da KW: KW usa solo il PPMI fra keyword; KWSEM aggiunge il coseno semantico fra i NOMI
delle keyword, cosi' "youkai" e "yokai" (o "magical girl" e "mahou shoujo") si collegano senza
passare da un cluster che ne media 4,4 alla volta.

Differenza da KWCLU: qui non si clusterizza niente. Restano tutte e 16.238 le keyword, quindi la
keyword rara ma precisa non viene diluita.
"""
import argparse
import collections
import json
import time

import numpy as np
import scipy.sparse as sp
import torch
from transformers import AutoModel, AutoTokenizer

import tipi
from services.graph_dense import data as D

ISTRUZIONE = "Instruct: Represent this film keyword for semantic comparison\nQuery: {t}"


def embed_nomi(nomi, modello, istruzione=True, batch=256, maxlen=48):
    tok = AutoTokenizer.from_pretrained(modello, padding_side='left')
    mod = AutoModel.from_pretrained(modello, dtype=torch.float16).eval()
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    if dev == 'cuda':
        torch.cuda.set_per_process_memory_fraction(0.6, 0)
        torch.cuda.empty_cache()
    mod = mod.to(dev)
    out = np.zeros((len(nomi), mod.config.hidden_size), np.float32)
    testi = [ISTRUZIONE.format(t=n) if istruzione else n for n in nomi]
    t0 = time.time()
    with torch.inference_mode():
        for st in range(0, len(testi), batch):
            b = tok(testi[st:st + batch], padding=True, truncation=True, max_length=maxlen,
                    return_tensors='pt').to(dev)
            h = mod(**b).last_hidden_state[:, -1, :].float()
            h = torch.nn.functional.normalize(h, dim=1)
            out[st:st + batch] = h.cpu().numpy()
            if (st // batch) % 16 == 0:
                print(f'    embedding {st}/{len(testi)} ({time.time()-t0:.0f}s)', flush=True)
    del mod
    if dev == 'cuda':
        torch.cuda.empty_cache()
    return out


def grafo_ppmi(Xk, per_kw, blk=1000):
    """Identico a cmd_kw di tipi.py: PPMI positivo, top-per_kw vicini, righe a somma 1."""
    N, n_kw = Xk.shape
    marg = np.asarray(Xk.sum(0)).ravel().astype(np.float64) + 1e-9
    rows, cs, vs = [], [], []
    for st in range(0, n_kw, blk):
        sl = slice(st, min(st + blk, n_kw))
        Cb = (Xk.T[sl] @ Xk).tocsr()
        for r, j in enumerate(range(st, min(st + blk, n_kw))):
            row = Cb.getrow(r)
            if row.nnz == 0:
                continue
            c = row.data.astype(np.float64)
            js = row.indices
            w = np.log(c * N / (marg[j] * marg[js]))
            keep = (w > 0) & (js != j)
            js, w = js[keep], w[keep]
            if not len(js):
                continue
            o = np.argpartition(-w, min(per_kw, len(w) - 1))[:per_kw]
            s = w[o].sum()
            if s <= 0:
                continue
            rows.extend([j] * len(o)); cs.extend(js[o].tolist()); vs.extend((w[o] / s).tolist())
        if (st // blk) % 5 == 0:
            print(f'    ppmi {min(st+blk, n_kw)}/{n_kw}', flush=True)
    G = sp.csr_matrix((np.float32(vs), (np.int32(rows), np.int32(cs))), shape=(n_kw, n_kw))
    G.setdiag(0); G.eliminate_zeros()
    return G


def grafo_semantico(E, per_kw, blk=1024):
    """Coseno fra i nomi delle keyword: top-per_kw, righe a somma 1."""
    n = E.shape[0]
    Et = torch.from_numpy(E)
    Et = Et / Et.norm(dim=1, keepdim=True)
    rows, cs, vs = [], [], []
    for st in range(0, n, blk):
        b = Et[st:st + blk]
        S = (b @ Et.T).numpy()
        for r in range(S.shape[0]):
            S[r, st + r] = -9.0
        o = np.argpartition(-S, per_kw, axis=1)[:, :per_kw]
        for r in range(S.shape[0]):
            idx, val = o[r], S[r, o[r]]
            val = val[val > 0]
            idx = idx[:len(val)]
            if not len(idx):
                continue
            val = val / val.sum()
            rows.extend([st + r] * len(idx)); cs.extend(idx.tolist()); vs.extend(val.tolist())
        if (st // blk) % 4 == 0:
            print(f'    semantica {min(st+blk, n)}/{n}', flush=True)
    G = sp.csr_matrix((np.float32(vs), (np.int32(rows), np.int32(cs))), shape=(n, n))
    G.setdiag(0); G.eliminate_zeros()
    return G


def topk_cos_sparse(X, k, shrink=True, blk=1024, etichetta=''):
    """top-k coseno fra righe di una matrice sparsa, senza mai materializzarla densa."""
    X = X.tocsr().astype(np.float32)
    X.eliminate_zeros()
    n = X.shape[0]
    q = np.sqrt(np.asarray(X.multiply(X).sum(1)).ravel())
    if shrink:
        tau = float(np.median(q[q > 0])) if (q > 0).any() else 1.0
        nor = np.sqrt(q ** 2 + tau ** 2)
    else:
        nor = q + 1e-9
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
            rows.extend([st + r] * len(idx)); cols.extend(idx.tolist())
            vals.extend(v[r][keep[r]].tolist())
        if (st // blk) % 8 == 0:
            print(f'    {etichetta} {min(st+blk, n)}/{n} ({time.time()-t0:.0f}s)', flush=True)
    M = sp.csr_matrix((np.float32(vals), (np.int32(rows), np.int32(cols))), shape=(n, n))
    M.setdiag(0); M.eliminate_zeros()
    return M


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sem-alpha', type=float, default=0.4)
    ap.add_argument('--model', default='Qwen/Qwen3-Embedding-0.6B')
    ap.add_argument('--per-kw', type=int, default=20)
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--no-shrink', dest='shrink', action='store_false')
    ap.add_argument('--nome', default='KWSEM')
    ap.add_argument('--tags', action='store_true', help='aggiunge i tag AniList al vocabolario')
    ap.add_argument('--tag-rank', type=int, default=60)
    ap.add_argument('--tag-df', type=int, default=5)
    a = ap.parse_args()
    tipi.T0 = time.time()

    B = D.basic(); N = B['N']; RO = B['row_of']
    X = D.tfidf(); V = D.vocab()
    kw = [t for t in V if t.startswith('kw:')]
    cols = [V[t] for t in kw]
    Xk = X[:, cols].tocsr().astype(np.float32)
    nomi = [t.split(':', 1)[1] for t in kw]
    print(f'  keyword TMDB: {len(kw):,} · coppie titolo-keyword {Xk.nnz:,}', flush=True)

    if a.tags:
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
        df = collections.Counter()
        for t in insiemi.values():
            for n in t:
                df[n] += 1
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
        Xk = sp.hstack([Xk, Xt]).tocsr()
        nomi = nomi + tagn
        print(f'  tag AniList: {len(tagn)} vocaboli (da {len(df)}, rank>={a.tag_rank}, df>={a.tag_df}) · '
              f'{len(rr):,} coppie · titoli toccati {int((np.asarray(Xt.sum(1)).ravel()>0).sum()):,}', flush=True)

    n = np.sqrt(np.asarray(Xk.multiply(Xk).sum(1)).ravel()) + 1e-9
    Xk = (sp.diags(1.0 / n) @ Xk).tocsr()
    print(f'  vocabolario totale: {len(nomi):,} · coppie {Xk.nnz:,}', flush=True)

    print('  grafo PPMI...', flush=True)
    Gp = grafo_ppmi(Xk, a.per_kw)
    print(f'    PPMI: {Gp.nnz:,} archi', flush=True)

    print(f'  embedding dei {len(nomi):,} nomi con {a.model}...', flush=True)
    E = embed_nomi(nomi, a.model)
    print(f'    embedding: {E.shape}', flush=True)
    Gs = grafo_semantico(E, a.per_kw)
    print(f'    semantica: {Gs.nnz:,} archi', flush=True)

    G = ((1.0 - a.sem_alpha) * Gp + a.sem_alpha * Gs).tocsr()
    G.setdiag(0); G.eliminate_zeros()
    print(f'  combinato: {G.nnz:,} archi (alpha semantica {a.sem_alpha})', flush=True)

    Xs = (Xk @ G).tocsr()
    Xs.eliminate_zeros()
    print(f'  proiezione: {Xs.nnz:,} coppie dopo lo smoothing', flush=True)
    M = topk_cos_sparse(Xs, a.k, shrink=a.shrink, etichetta=a.nome)
    tipi.save(a.nome, M,
              f'grafo keyword PPMI+semantica (alpha {a.sem_alpha}, {a.model}, top-{a.per_kw} vicini per '
              f'vocabolo), coseno top-{a.k}, nessuna clusterizzazione',
              {'per_kw': a.per_kw, 'k': a.k, 'vocab': len(nomi), 'sem_alpha': a.sem_alpha,
               'model': a.model, 'shrink': bool(a.shrink), 'tags': bool(a.tags),
               'tag_rank': a.tag_rank, 'tag_df': a.tag_df})


if __name__ == '__main__':
    main()
