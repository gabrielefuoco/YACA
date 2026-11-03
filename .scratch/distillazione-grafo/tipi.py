"""tipi.py — gli archi di V12, un tipo per file, senza miscela.

  py .scratch/distillazione-grafo/tipi.py covision
  py .scratch/distillazione-grafo/tipi.py trama --k 100
  py .scratch/distillazione-grafo/tipi.py kw --per-kw 20 --k 100

Ogni tipo e' una CSR N x N float32 in services/graph/data/tipi/<TIPO>.npz, piu' una voce in
manifest.json con ricetta, copertura e grado. La fonte di verita' resta l'emettitore: un tipo e' una
VISTA (top-k), e k si decide qui, non dentro una miscela.
"""
import argparse
import json
import time

import numpy as np
import scipy.sparse as sp

from services.graph_dense import config as C, data as D
from services.graph_dense import config as DC

import os as _os
OUT = _os.environ.get('TIPI_OUT', 'services/graph/data/tipi')
MANIFEST = f'{OUT}/manifest.json'
T0 = time.time()


def save(nome, M, ricetta, extra=None):
    import pathlib
    pathlib.Path(OUT).mkdir(parents=True, exist_ok=True)
    M = M.tocsr()
    M.setdiag(0)
    M.eliminate_zeros()
    np.savez_compressed(f'{OUT}/{nome}.npz', indptr=M.indptr.astype(np.int64),
                        indices=M.indices.astype(np.int32),
                        data=M.data.astype(np.float32))
    man = json.load(open(MANIFEST, encoding='utf-8')) if __import__('os').path.exists(MANIFEST) else {}
    g = np.asarray((M > 0).sum(1)).ravel()
    man[nome] = dict(arhi=int(M.nnz), copertura=float((g > 0).mean()),
                     grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                     riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                     ricetta=ricetta, khi=extra or {}, creato=time.strftime('%Y-%m-%d %H:%M'))
    del man[nome]['arhi']
    man[nome]['archi'] = int(M.nnz)
    json.dump(man, open(MANIFEST, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'  {nome:<10} {M.nnz:>10,} archi · copertura {100*man[nome]["copertura"]:.1f}% · '
          f'grado mediano {man[nome]["grado_mediano"]} ({time.time()-T0:.0f}s)', flush=True)


def topk_cosine(V, k, block=1024, etichetta='', shrink=False, tau_rel=1.0):
    """top-k vicini per coseno, in blocchi. V: densa (N x d).

    Con `shrink` usa la norma shrinkata (D3): nor = sqrt(sum(v^2) + tau^2), tau = mediana delle
    norme. Un titolo con due soli attributi non arriva piu' a coseno 1,0 contro chi ne ha uno in
    comune: e' il difetto che faceva salire i B-movie con una keyword generica.
    """
    N = V.shape[0]
    Vn = V.astype(np.float32)
    q = np.linalg.norm(Vn, axis=1)
    if shrink:
        tau = float(np.median(q[q > 0])) * tau_rel if (q > 0).any() else 1.0
        nor = np.sqrt(q ** 2 + tau ** 2)
        print(f'  shrinkage: tau={tau:.3f} · norme mediane {np.median(q[q>0]):.3f} -> '
              f'{np.median(nor[q>0]):.3f}', flush=True)
    else:
        nor = q
    Vn /= (nor[:, None] + 1e-9)
    rows, cols, vals = [], [], []
    for st in range(0, N, block):
        blk = slice(st, min(st + block, N))
        sim = Vn[blk] @ Vn.T
        for r, i in enumerate(range(st, min(st + block, N))):
            sim[r, i] = -9.0
            idx = np.argpartition(-sim[r], k)[:k]
            w = sim[r][idx]
            ok = w > 0
            rows.extend([i] * int(ok.sum())); cols.extend(idx[ok].tolist()); vals.extend(w[ok].tolist())
        if st % (block * 8) == 0:
            print(f'    {etichetta} {min(st+block, N)}/{N} ({time.time()-T0:.0f}s)', flush=True)
    return sp.csr_matrix((np.float32(vals), (np.int32(rows), np.int32(cols))), shape=(N, N))


def cmd_covision(a):
    z = np.load('services/graph_dense/data/covision.npz')
    M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(D.basic()['N'],) * 2)
    save('COVISION', M, 'co-visione 4 fonti: NPMI+ * log1p(Cw) * Cw/(Cw+1) * tempo, top-20, max-merge',
         {'fonti': ['MovieLens', 'Trakt', 'AniList', 'Serializd'], 'p99': z['p99'].tolist()})


def cmd_trama(a):
    B = D.basic(); N = B['N']
    Xp, hp, _ = D.plot_embedding(B)
    X = Xp                                                  # gia' N x d, righe normalizzate
    print(f'  trama: {int(hp.sum()):,}/{N:,} titoli hanno un embedding', flush=True)
    M = topk_cosine(X, a.k, etichetta='trama')
    save('TRAMA', M, f'top-{a.k} coseno su trama-qwen3b.npy (misto IT/EN), solo titoli con trama',
         {'k': a.k, 'coperti': int(hp.sum())})


def cmd_kw(a):
    B = D.basic(); N = B['N']
    X = D.tfidf(); V = D.vocab()
    cols = [c for t, c in V.items() if t.startswith('kw:')]
    nomi = [t for t, c in V.items() if t.startswith('kw:')]
    Xk = X[:, cols].tocsr().astype(np.float32)
    n = np.sqrt(np.asarray(Xk.multiply(Xk).sum(1)).ravel()) + 1e-9
    Xk = (sp.diags(1.0 / n) @ Xk).tocsr()
    print(f'  keyword: {len(cols):,} vocaboli · {Xk.nnz:,} coppie titolo-keyword', flush=True)

    # (b) il grafo delle keyword. Con --ppmi pesa le coppie per informazione mutua, cosi' una frase
    # generica ("family") non fa da ponte universale: e' la stessa correzione gia' usata in co-visione.
    n_kw = Xk.shape[1]
    marg = np.asarray(Xk.sum(0)).ravel().astype(np.float64) + 1e-9
    rows, cs, vs = [], [], []
    BLK = 1000
    for st in range(0, n_kw, BLK):
        blk = slice(st, min(st + BLK, n_kw))
        Cb = (Xk.T[blk] @ Xk).tocsr()
        for r, j in enumerate(range(st, min(st + BLK, n_kw))):
            row = Cb.getrow(r)
            if row.nnz == 0: continue
            c = row.data.astype(np.float64); js = row.indices
            if a.ppmi:
                w = np.log(c * N / (marg[j] * marg[js]))
                keep = (w > 0) & (js != j)
            else:
                w = c; keep = js != j
            js = js[keep]; w = w[keep]
            if not len(js): continue
            o = np.argpartition(-w, min(a.per_kw, len(w) - 1))[:a.per_kw]
            s = w[o].sum()
            if s <= 0: continue
            rows.extend([j] * len(o)); cs.extend(js[o].tolist()); vs.extend((w[o] / s).tolist())
        if st % (BLK * 5) == 0:
            print(f'    grafo kw {min(st+BLK, n_kw)}/{n_kw} ({time.time()-T0:.0f}s)', flush=True)
    G = sp.csr_matrix((np.float32(vs), (np.int32(rows), np.int32(cs))), shape=(n_kw, n_kw))
    G.setdiag(0); G.eliminate_zeros()
    print(f'  grafo keyword{"PPMI" if a.ppmi else ""}: {G.nnz:,} archi · {a.per_kw} vicini per vocabolo', flush=True)

    # proiezione: ogni film eredita i vocaboli vicini dei suoi
    Xs = (Xk @ G).tocsr().astype(np.float32)
    Xs.eliminate_zeros()
    print(f'  proiezione: {Xs.nnz:,} coppie dopo lo smoothing', flush=True)
    M = topk_cosine(Xs.toarray(), a.k, etichetta='kw', shrink=a.shrink)       # denso: 66k x |vocab| e' gestibile
    nome = 'KW' if not a.ppmi else 'KWppmi'
    save(nome, M, f'proiezione sul grafo keyword{"PPMI" if a.ppmi else ""}: top-{a.per_kw} vicini per '
                  f'vocabolo, poi top-{a.k} coseno fra film',
         {'per_kw': a.per_kw, 'k': a.k, 'vocab': len(cols), 'ppmi': bool(a.ppmi)})


def cmd_kwclu(a):
    """KW dall'albero gerarchico delle keyword: ogni film proiettato sui cluster L1 (sinonimi)."""
    import json as J
    B = D.basic(); N = B['N']
    H = J.load(open('src/data/hierarchical_graph.json', encoding='utf-8'))
    mappa = H['kw_to_L1'] if a.livello == 'L1' else {k: v for k, v in H['kw_to_L1'].items()}
    X = D.tfidf(); V = D.vocab()
    kw = [t for t in V if t.startswith('kw:')]
    cols = [V[t] for t in kw]
    Xk = X[:, cols].tocsr().astype(np.float32)
    live = [i for i, t in enumerate(kw) if t.split(':', 1)[1] in mappa]
    cluster = {}
    for i in live:
        lab = mappa[kw[i].split(':', 1)[1]]
        cluster.setdefault(lab, len(cluster))
    map_lab = np.full(len(kw), -1, np.int32)
    for i in live:
        map_lab[i] = cluster[mappa[kw[i].split(':', 1)[1]]]
    keep = np.flatnonzero(map_lab >= 0)
    P = sp.csr_matrix((np.arange(1, len(keep) + 1), (np.arange(len(keep)), map_lab[keep])),
                      shape=(len(keep), len(cluster)))
    Xc = (Xk[:, keep] @ P).tocsr().astype(np.float32)
    Xc.eliminate_zeros()
    print(f'  cluster {a.livello}: {len(cluster):,} · keyword mappate {len(keep):,}/{len(kw):,} · '
          f'coppie film-cluster {Xc.nnz:,}', flush=True)
    M = topk_cosine(Xc.toarray(), a.k, etichetta='kwclu')
    save('KWCLU', M, f'keyword proiettate sui cluster {a.livello} del grafo gerarchico '
                     f'(PPMI+embedding+Leiden), coseno top-{a.k}',
         {'livello': a.livello, 'cluster': len(cluster), 'kw_mappate': int(len(keep)), 'k': a.k})


def cmd_rrfst(a):
    """RRFST: top-k sul vettore dello studente RRF. I vettori esistono gia': qui solo gli archi."""
    z = np.load(f'{DC.DATA}/' + _os.environ.get('RRFST_Z', 'rrfstudent.npz'))
    Z = z['Z'].astype(np.float32)
    print(f'  rrfstudent: {Z.shape} · norme mediane {np.median(np.linalg.norm(Z, axis=1)):.4f}', flush=True)
    N = Z.shape[0]
    rows, cols, vals = [], [], []
    BLK = 2048
    for st in range(0, N, BLK):
        blk = Z[st:st + BLK]
        sim = blk @ Z.T
        for r, i in enumerate(range(st, min(st + BLK, N))):
            sim[r, i] = -9.0
            idx = np.argpartition(-sim[r], a.k)[:a.k]
            w = sim[r][idx]
            ok = w > 0
            rows.extend([i] * int(ok.sum())); cols.extend(idx[ok].tolist()); vals.extend(w[ok].tolist())
        print(f'    rrfst {min(st+BLK, N)}/{N} ({time.time()-T0:.0f}s)', flush=True)
    M = sp.csr_matrix((np.float32(vals), (np.int32(rows), np.int32(cols))), shape=(N, N))
    save('RRFST', M, f'top-{a.k} coseno sui vettori dello studente RRF (rrfstudent.npz, 2560-d, righe '
                     f'gia normalizzate)', {'k': a.k, 'dim': int(Z.shape[1])})


def _idf_cosine(insiemi, k, etichetta=''):
    """IDF (log(N/(1+df))) + shrinkage L2 (D3) + coseno top-k. Un titolo con UN attributo non
    arriva piu' a coseno 1,0: e' lo stesso difetto che il grafo correggeva in topk_shrink."""
    N = len(insiemi)
    vocab = {}
    for s in insiemi:
        for x in s:
            vocab[x] = vocab.get(x, 0) + 1
    idx = {x: i for i, x in enumerate(vocab)}
    r_, c_, v_ = [], [], []
    for i, s in enumerate(insiemi):
        for x in s:
            r_.append(i); c_.append(idx[x])
            v_.append(float(np.log(N / (1 + vocab[x]))))
    A = sp.csr_matrix((np.float32(v_), (np.int32(r_), np.int32(c_))), shape=(N, len(idx)))
    q = np.sqrt(np.asarray(A.multiply(A).sum(1)).ravel())
    tau = float(np.median(q[q > 0])) if (q > 0).any() else 1.0
    An = sp.diags(1.0 / (np.sqrt(q ** 2 + tau ** 2) + 1e-9)).dot(A).tocsr()
    print(f'  {etichetta}: {len(vocab):,} attributi · {A.nnz:,} coppie', flush=True)
    rows, cols, vals = [], [], []
    BLK = 1024
    for st in range(0, N, BLK):
        S = (An[st:st + BLK] @ An.T).tocsr()
        S.setdiag(0); S.eliminate_zeros()
        for r, i in enumerate(range(st, min(st + BLK, N))):
            row = S.getrow(r)
            if row.nnz == 0: continue
            d = row.data
            o = np.argpartition(-d, min(k, len(d) - 1))[:k]
            ok = d[o] > 0
            rows.extend([i] * int(ok.sum())); cols.extend(row.indices[o][ok].tolist())
            vals.extend(d[o][ok].tolist())
        if st % (BLK * 8) == 0:
            print(f'    {etichetta} {min(st+BLK, N)}/{N} ({time.time()-T0:.0f}s)', flush=True)
    return sp.csr_matrix((np.float32(vals), (np.int32(rows), np.int32(cols))), shape=(N, N))


def _nomi(x):
    """Lista di dict TMDB (cast, company, director...) -> chiavi stabili per id."""
    import json as J
    if not isinstance(x, str) or not x.strip():
        return []
    try:
        v = J.loads(x)
    except Exception:
        return []
    out = []
    for e in (v if isinstance(v, list) else []):
        if isinstance(e, dict) and e.get('id') is not None:
            out.append(int(e['id']))
    return out


def cmd_meta(a):
    import pandas as pd
    B = D.basic(); N = B['N']; RO = B['row_of']
    def leggi(f, cols):
        import pyarrow.parquet as pq
        have = set(pq.ParquetFile(f).schema.names)
        return pd.read_parquet(f, columns=[c for c in cols if c in have])
    mv = leggi('.cache/tmdb/movies.parquet',
               ['id', 'cast', 'directors', 'created_by', 'production_companies', 'collection_id'])
    tvd = leggi('.cache/tmdb/tv.parquet',
                ['id', 'cast', 'directors', 'created_by', 'production_companies', 'collection_id'])
    pref = {'CAST': 'ca', 'DIR': 'di', 'PROD': 'pr', 'COLL': 'co'}[a.tipo]
    insiemi = [set() for _ in range(N)]
    mancanti = 0
    for tipo, df in (('movie', mv), ('tv', tvd)):
        for row in df.itertuples():
            i = RO.get(f'{tipo}:{int(row.id)}')
            if i is None:
                mancanti += 1; continue
            if a.tipo == 'CAST':
                ids = _nomi(row.cast)
            elif a.tipo == 'DIR':
                ids = _nomi(getattr(row, 'directors', None)) or _nomi(getattr(row, 'created_by', None))
            elif a.tipo == 'PROD':
                ids = _nomi(row.production_companies)
            else:
                cid = getattr(row, 'collection_id', None)
                cid = int(cid) if (cid is not None and str(cid) not in ('nan', 'None')) else 0
                ids = [cid] if (tipo == 'movie' and cid > 0) else []
            for x in ids:
                insiemi[i].add(f'{pref}:{x}')
    print(f'  {a.tipo}: titoli canonici fuori dal parquet {mancanti:,} · con almeno un attributo '
          f'{sum(1 for s in insiemi if s):,}', flush=True)
    M = _idf_cosine(insiemi, a.k, etichetta=a.tipo)
    ric = {'CAST': 'cast TMDB (film+serie), idf + shrinkage, coseno',
           'DIR': 'regia TMDB (film) e creatori (serie), idf + shrinkage, coseno',
           'PROD': 'case di produzione TMDB (film+serie), idf + shrinkage, coseno',
           'COLL': 'collezione TMDB (solo film): saga/franchise, idf + shrinkage, coseno'}[a.tipo]
    save(a.tipo, M, f'top-{a.k} coseno su {ric}', {'k': a.k})


def cmd_norm(a):
    """Rende i pesi dei tipi confrontabili: toglie il pavimento (p1) e porta la coda al p99.

    Perche' globale e non per riga: COLL ha 2-3 archi per riga, e sottrarre la mediana DI RIGA
    azzererebbe meta' saga. Il pavimento e' una proprieta' della distribuzione del TIPO (TRAMA sta
    tutta fra 0.45 e 0.70), quindi si misura sul tipo.
    """
    import os, shutil
    SRC, DST = f'{OUT}', _os.environ.get('NORM_OUT', 'services/graph/data/tipi-norm')
    os.makedirs(DST, exist_ok=True)
    tipi = sorted(json.load(open(f'{SRC}/manifest.json', encoding='utf-8')))
    B = D.basic(); N = B['N']
    righe = []
    for n in tipi:
        z = np.load(f'{SRC}/{n}.npz')
        S = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
        w = S.data.astype(np.float64)
        pavimento = float(np.percentile(w, 1))
        w2 = np.maximum(w - pavimento, 0.0)
        coda = float(np.percentile(w2[w2 > 0], 99)) if (w2 > 0).any() else 1.0
        w3 = np.minimum(w2 / coda, 1.0)
        S2 = sp.csr_matrix((w3.astype(np.float32), S.indices, S.indptr), shape=(N, N))
        S2.setdiag(0); S2.eliminate_zeros()
        np.savez_compressed(f'{DST}/{n}.npz', indptr=S2.indptr.astype(np.int64),
                            indices=S2.indices.astype(np.int32), data=S2.data.astype(np.float32))
        rs = np.asarray(S2.sum(1)).ravel(); pos = rs[rs > 0]
        r1 = np.asarray(S2.max(1).todense()).ravel()
        righe.append(dict(tipo=n, archi=int(S2.nnz), pavimento=pavimento, coda=coda,
                          massa=float(rs.sum()), riga_mediana=float(np.median(pos)),
                          peso_mediano=float(np.median(S2.data)),
                          top1_medio=float(r1[r1 > 0].mean()),
                          zero=float((w2 == 0).mean())))
        print(f'  {n:<9} pavimento {pavimento:.3f} · coda p99 {coda:.3f} · massa {rs.sum():>12,.0f} '
              f'· top-1 medio {righe[-1]["top1_medio"]:.3f} ({time.time()-T0:.0f}s)', flush=True)
    json.dump(righe, open(f'{DST}/normalizzazione.json', 'w', encoding='utf-8'), indent=1)
    print()
    print('| tipo | archi | peso p1 tolto | coda p99 | massa | riga mediana | peso mediano | top-1 medio | azzerati |')
    print('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
    for r in righe:
        print(f'| {r["tipo"]} | {r["archi"]:,} | {r["pavimento"]:.3f} | {r["coda"]:.3f} | {r["massa"]:,.0f} | '
              f'{r["riga_mediana"]:.2f} | {r["peso_mediano"]:.3f} | {r["top1_medio"]:.3f} | {100*r["zero"]:.1f}% |')


def cmd_budget(a):
    """Budget per riga: ogni tipo tiene i suoi top-P archi e li normalizza a somma 1.

    E' la normalizzazione che rende w_t una QUOTA e non un moltiplicatore nascosto dalla densita'.
    Senza, un tipo denso (TRAMA, 100 archi/riga) vince per volume anche con peso 1.
    """
    import os
    SRC, DST = _os.environ.get('NORM_OUT', 'services/graph/data/tipi-norm'), _os.environ.get('PESI_OUT', 'services/graph/data/tipi-pesi')
    os.makedirs(DST, exist_ok=True)
    tipi = sorted(json.load(open(f'{OUT}/manifest.json', encoding='utf-8')))
    B = D.basic(); N = B['N']
    righe = []
    for n in tipi:
        z = np.load(f'{SRC}/{n}.npz')
        S = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
        rows, cols, vals = [], [], []
        for i in range(N):
            r = S.getrow(i)
            if r.nnz == 0: continue
            d = r.data; js = r.indices
            if len(d) > a.pota:
                o = np.argpartition(-d, a.pota)[:a.pota]
                d = d[o]; js = js[o]
            t = d.sum()
            if t <= 0: continue
            rows.extend([i] * len(js)); cols.extend(js.tolist()); vals.extend((d / t).tolist())
        S2 = sp.csr_matrix((np.float32(vals), (np.int32(rows), np.int32(cols))), shape=(N, N))
        S2.setdiag(0); S2.eliminate_zeros()
        np.savez_compressed(f'{DST}/{n}.npz', indptr=S2.indptr.astype(np.int64),
                            indices=S2.indices.astype(np.int32), data=S2.data.astype(np.float32))
        rs = np.asarray(S2.sum(1)).ravel(); pos = rs[rs > 0]
        r1 = np.asarray(S2.max(1).todense()).ravel()
        righe.append(dict(tipo=n, archi=int(S2.nnz), righe_attive=int((pos > 0).sum()),
                          massa=float(rs.sum()), riga_mediana=float(np.median(pos)),
                          peso_mediano=float(np.median(S2.data)),
                          top1_medio=float(r1[r1 > 0].mean()),
                          grado_mediano=int(np.median(np.diff(S2.indptr)[np.diff(S2.indptr) > 0]))))
        print(f'  {n:<9} archi {S2.nnz:>9,} · grado mediano {righe[-1]["grado_mediano"]:>3} · '
              f'peso mediano {righe[-1]["peso_mediano"]:.3f} · top-1 {righe[-1]["top1_medio"]:.3f}', flush=True)
    json.dump(righe, open(f'{DST}/budget.json', 'w', encoding='utf-8'), indent=1)
    print()
    print('| tipo | archi | grado mediano | peso mediano | top-1 medio | massa (= righe attive) |')
    print('|---|---:|---:|---:|---:|---:|')
    for r in righe:
        print(f'| {r["tipo"]} | {r["archi"]:,} | {r["grado_mediano"]} | {r["peso_mediano"]:.3f} | '
              f'{r["top1_medio"]:.3f} | {r["massa"]:,.0f} |')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('comando', choices=['covision', 'trama', 'kw', 'kwclu', 'rrfst', 'meta', 'norm', 'budget'])
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--per-kw', type=int, default=20)
    ap.add_argument('--shrink', action='store_true')
    ap.add_argument('--no-ppmi', dest='ppmi', action='store_false')
    ap.add_argument('--livello', default='L1')
    ap.add_argument('--pota', type=int, default=16)
    ap.add_argument('--tipo', default='CAST')
    a = ap.parse_args()
    a.ppmi = getattr(a, 'ppmi', True)
    {'covision': cmd_covision, 'trama': cmd_trama, 'kw': cmd_kw, 'kwclu': cmd_kwclu, 'rrfst': cmd_rrfst, 'meta': cmd_meta, 'norm': cmd_norm, 'budget': cmd_budget}[a.comando](a)
