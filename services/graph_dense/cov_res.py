"""cov_res.py — co-visione fuori genere (ticket 15).

L'IDEA. Due film con affinità comportamentale alta ma **generi disgiunti** ed **epoche distanti**: per
costruzione sono «chi guarda X guarda anche Y, e non c'entrano niente come genere». È la definizione
operativa di tono, e oggi nessun tipo la isola: la co-visione grezza è dominata da genere ed epoca.

COME. Si parte dalla COVISION già calcolata e si tengono solo gli archi che **scavalcano** genere e
decennio, con una soglia di forza per non far emergere il rumore dei conteggi bassi (il ruolo del LCB
nel progetto originale).

  PYTHONPATH=. py -m services.graph_dense.cov_res [--k 100] [--anni 10]
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


def generi_per_riga(B):
    """(lista di set di generi per riga, anno per riga)."""
    gen = [set() for _ in range(B['N'])]
    for tipo, f in (('movie', 'movies.parquet'), ('tv', 'tv.parquet')):
        d = pd.read_parquet(C.TMDB / f, columns=['id', 'genres'])
        for i, g in zip(d.id, d.genres):
            r = B['row_of'].get(f'{tipo}:{int(i)}')
            if r is None:
                continue
            try:
                gen[r] = {str(x.get('name', '')).lower() for x in json.loads(g or '[]')
                          if isinstance(x, dict)}
            except Exception:
                pass
    return gen


def costruisci(B=None, k=100, anni=10, forza_pct=50):
    """Tiene solo gli archi di co-visione che scavalcano genere e decennio."""
    t0 = time.time()
    B = D.basic() if B is None else B
    N = B['N']
    YEAR = B['year']
    z = np.load('services/graph/data/tipi2/COVISION.npz')
    M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N)).tocsr()
    gen = generi_per_riga(B)
    soglia = float(np.percentile(M.data, forza_pct)) if M.nnz else 0.0
    print(f'  cov_res: soglia di forza p{forza_pct} = {soglia:.4f}', flush=True)

    righe, cols, vals = [], [], []
    tenuti = scartati_gen = scartati_forza = 0
    for i in range(N):
        lo, hi = M.indptr[i], M.indptr[i + 1]
        if hi <= lo:
            continue
        gi = gen[i]
        yi = YEAR[i]
        for j, w in zip(M.indices[lo:hi], M.data[lo:hi]):
            j = int(j)
            if w < soglia:
                scartati_forza += 1
                continue
            gj = gen[j]
            # stesso genere primario => è "il solito", non un salto
            if gi and gj and (gi & gj):
                scartati_gen += 1
                continue
            # stessa epoca => è "uscito insieme", non un salto
            if yi == yi and YEAR[j] == YEAR[j] and yi > 0 and YEAR[j] > 0 \
                    and abs(yi - YEAR[j]) < anni:
                scartati_gen += 1
                continue
            righe.append(i); cols.append(j); vals.append(w)
            tenuti += 1
    M2 = sp.csr_matrix((np.float32(vals), (np.int32(righe), np.int32(cols))), shape=(N, N))
    M2.setdiag(0)
    M2.eliminate_zeros()
    # top-k per riga
    rows, cols2, v2 = [], [], []
    for i in range(N):
        r = M2.getrow(i)
        if r.nnz == 0:
            continue
        if r.nnz > k:
            o = np.argpartition(-r.data, k)[:k]
            idx, dat = r.indices[o], r.data[o]
        else:
            idx, dat = r.indices, r.data
        rows.append(np.full(len(idx), i, np.int32)); cols2.append(idx.astype(np.int32))
        v2.append(dat.astype(np.float32))
    Mout = sp.csr_matrix((np.concatenate(v2), (np.concatenate(rows), np.concatenate(cols2))),
                         shape=(N, N))
    g = np.asarray((Mout > 0).sum(1)).ravel()
    print(f'  cov_res: {Mout.nnz:,} archi · copertura {100*(g>0).mean():.1f}% · '
          f'scartati per genere/epoca {scartati_gen:,} · per forza {scartati_forza:,} '
          f'({time.time()-t0:.0f}s)', flush=True)
    return Mout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--anni', type=int, default=10)
    ap.add_argument('--forza-pct', type=int, default=50)
    ap.add_argument('--out', default='services/graph/data/tipi2/COV_RES.npz')
    ap.add_argument('--manifest', default='services/graph/data/tipi2/manifest.json')
    a = ap.parse_args()
    from . import provenance as PV
    B = D.basic()
    M = costruisci(B, a.k, a.anni, a.forza_pct)
    prov = PV.scrivi(a.out, M, step='tipi',
                     params={'tipo': 'COV_RES', 'k': a.k, 'anni': a.anni,
                             'forza_pct': a.forza_pct},
                     inputs={'COVISION': PV.sha256_file('services/graph/data/tipi2/COVISION.npz')},
                     canon_len=B['N'])
    man = json.loads(Path(a.manifest).read_text(encoding='utf-8')) if Path(a.manifest).exists() else {}
    g = np.asarray((M > 0).sum(1)).ravel()
    man['COV_RES'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                          grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                          riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                          ricetta='co-visione che scavalca genere ed epoca (soglia di forza p50)',
                          khi={'k': a.k, 'anni': a.anni}, creato=time.strftime('%Y-%m-%d %H:%M'))
    Path(a.manifest).write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'scritto {a.out} · prov {prov["sha256"][:12]}')


if __name__ == '__main__':
    main()
