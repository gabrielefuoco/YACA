"""critica.py — il lessico aggettivale delle recensioni (ticket 17).

PERCHE' NON IL TESTO INTERO. Le recensioni embeddate per intero hanno densità di tono **0,13%**
(193 parole di tono su 146.483): l'embedding misura la trama raccontata. Ma gli **aggettivi** sono
addensati in poche frasi, e sono quelli che dicono il registro: «campy», «surreal», «deadpan»,
«grottesco», «kitsch».

Qui invece di embeddare il documento si costruisce un **vocabolario aggettivale** e si pesa quanto ogni
film ne è descritto: TF-IDF sulle sole parole con suffisso da aggettivo, poi SVD a 128 dimensioni.

  PYTHONPATH=. py -m services.graph_dense.critica_lex [--k 100]
"""
from __future__ import annotations

import argparse
import json
import re
import time
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp
from scipy.sparse.linalg import svds

from . import config as C, data as D

REC = Path(__file__).resolve().parent / "data" / "recensioni.parquet"
SUFFISSI = ('oso', 'osa', 'osi', 'ose', 'esco', 'esca', 'ico', 'ica', 'ici', 'iche', 'ale', 'ali',
            'ivo', 'iva', 'ivi', 'ive', 'ante', 'enti', 'ente', 'astro', 'astra', 'istico', 'istica',
            'ic', 'ous', 'ive', 'ive', 'al', 'ial', 'esque', 'ish', 'ful', 'less', 'able', 'ible',
            'ary', 'ory', 'y', 'ish')
MIN_LEN, MAX_LEN = 5, 18
MIN_DF, MAX_DF = 15, 500


def aggettivi():
    """I token con suffisso da aggettivo, con la loro frequenza in documenti."""
    df = Counter()
    for t in pd.read_parquet(REC, columns=['testo']).testo:
        if not isinstance(t, str):
            continue
        for w in set(re.findall(r"[a-zàèéìòù']{5,18}", t.lower())):
            if w.endswith(SUFFISSI):
                df[w] += 1
    tieni = sorted(w for w, c in df.items() if MIN_DF <= c <= MAX_DF)
    return tieni


def costruisci(B=None, k=100, dim=128):
    t0 = time.time()
    B = D.basic() if B is None else B
    N = B['N']
    ro = B['row_of']
    d = pd.read_parquet(REC)
    righe_doc = [(ro.get(f'movie:{int(i)}'), str(t)) for i, t in zip(d.id, d.testo)]
    righe_doc = [(r, t) for r, t in righe_doc if r is not None and t.strip()]
    print(f'  crit_lex: {len(righe_doc)} film con recensioni', flush=True)
    voc = aggettivi()
    col = {w: j for j, w in enumerate(voc)}
    print(f'  crit_lex: {len(voc)} aggettivi (df {MIN_DF}-{MAX_DF}) · '
          f'esempi: {", ".join(voc[:8])}', flush=True)
    rr, cc = [], []
    for r, t in righe_doc:
        for w in set(re.findall(r"[a-zàèéìòù']{5,18}", t.lower())):
            j = col.get(w)
            if j is not None:
                rr.append(r); cc.append(j)
    X = sp.csr_matrix((np.ones(len(rr), np.float32), (np.int32(rr), np.int32(cc))), shape=(N, len(voc)))
    X.data[:] = 1.0
    df = np.asarray(X.sum(0)).ravel()
    idf = np.log((1 + X.shape[0]) / (1 + df)) + 1.0
    X = X.multiply(idf[None, :]).tocsr()
    norma = np.linalg.norm(X.toarray(), axis=1) if N < 2000 else None
    Xn = X.toarray().astype(np.float32)
    nrm = np.linalg.norm(Xn, axis=1, keepdims=True)
    Xn = Xn / (nrm + 1e-9)
    copertura = float((nrm.ravel() > 0).mean())
    print(f'  crit_lex: {copertura:.1%} del canone ha >= 1 aggettivo', flush=True)
    dim = int(min(dim, max(8, min(Xn.shape) - 1)))
    U, S, Vt = svds(sp.csr_matrix(Xn), k=dim)
    Z = (U * S)
    Z = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
    import importlib.util
    spec = importlib.util.spec_from_file_location('tipi', C.ROOT / '.scratch' / 'distillazione-grafo' / 'tipi.py')
    tipi = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tipi)
    M = tipi.topk_cosine(Z, k, etichetta='crit_lex')
    print(f'  crit_lex: {M.nnz:,} archi ({time.time()-t0:.0f}s)', flush=True)
    return M, {'aggettivi': len(voc), 'film': len(righe_doc), 'copertura': copertura}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--out', default='services/graph/data/tipi2/CRIT_LEX.npz')
    ap.add_argument('--manifest', default='services/graph/data/tipi2/manifest.json')
    a = ap.parse_args()
    from . import provenance as PV
    B = D.basic()
    M, info = costruisci(B, a.k)
    prov = PV.scrivi(a.out, M, step='tipi', params={'tipo': 'CRIT_LEX', 'k': a.k, **info},
                     canon_len=B['N'])
    man = json.loads(Path(a.manifest).read_text(encoding='utf-8')) if Path(a.manifest).exists() else {}
    g = np.asarray((M > 0).sum(1)).ravel()
    man['CRIT_LEX'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                           grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                           riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                           ricetta=f'solo aggettivi delle recensioni ({info["aggettivi"]} termini), '
                                   f'tf-idf + SVD {a.k}, coseno',
                           khi={'k': a.k}, creato=time.strftime('%Y-%m-%d %H:%M'))
    Path(a.manifest).write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'scritto {a.out} · prov {prov["sha256"][:12]}')


if __name__ == '__main__':
    main()
