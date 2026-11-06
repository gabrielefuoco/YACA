"""audit.py — ogni vicino ha una ragione? E di che tipo? (il metro giusto per un grafo eterogeneo)

PERCHE' NON IL BANCO TONALE. Quel banco chiedeva salti cross-genere con la consegna di *non* usare
genere, regista e decennio: era avversariale per costruzione, e penalizzava il grafo proprio per le
ragioni ovvie che un grafo eterogeneo deve avere. Il bersaglio vero è un altro:

    ogni vicino deve avere ALMENO UNA ragione, e le ragioni devono essere VARIE.

Qui si misura, su un campione grande di semi di tutto il canone, *perché* ogni vicino è lì:

    genere · keyword · cast · regia · collezione · co-visione · liste · trama

Un arco «inspiegato» (nessuna di queste) è rumore. Un grafo sano ha spiegazione alta E mescolata.

  PYTHONPATH=. py -m services.graph_dense.audit <grafo.npz> [--semi 400] [--k 20]
"""
from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp

from . import config as C, data as D, provenance as PV

RAGIONI = ('genere', 'keyword', 'cast', 'regia', 'collezione', 'co-visione', 'liste', 'gusto-utente', 'tribu-gusto', 'trama')


def _insiemi_campo(B, campo, tipo_prefisso):
    """{riga: set di id} da una colonna JSON dei Parquet TMDB."""
    out = {}
    for tipo, f in (('movie', 'movies.parquet'), ('tv', 'tv.parquet')):
        try:
            d = pd.read_parquet(C.TMDB / f, columns=['id', campo])
        except Exception:
            continue
        for i, v in zip(d.id, d[campo]):
            r = B['row_of'].get(f'{tipo}:{int(i)}')
            if r is None or not isinstance(v, str):
                continue
            try:
                lst = json.loads(v)
            except Exception:
                continue
            s = set()
            for e in lst if isinstance(lst, list) else []:
                if isinstance(e, dict) and e.get('id') is not None:
                    s.add(int(e['id']))
                elif isinstance(e, str):
                    s.add(e.lower())
            if s:
                out[r] = s
    return out


def primitive(B):
    """Le ragioni «ovvie», calcolate una volta: generi, keyword, cast, registi, collezioni, trama."""
    t0 = time.time()
    gen = _insiemi_campo(B, 'genres', '')
    kw = _insiemi_campo(B, 'keywords', '')
    cast = _insiemi_campo(B, 'cast', '')
    dirn = _insiemi_campo(B, 'directors', '')
    coll = {r: {int(c)} for r, c in enumerate(B['COLL']) if c > 0}
    Xp, has, _ = D.plot_embedding(B)
    print(f'  audit: primitive pronte in {time.time()-t0:.0f}s · generi {len(gen):,} · '
          f'keyword {len(kw):,} · cast {len(cast):,} · regia {len(dirn):,} · '
          f'collezioni {len(coll):,} · trama {int(has.sum()):,}', flush=True)
    return {'genere': gen, 'keyword': kw, 'cast': cast, 'regia': dirn,
            'collezione': coll, '_trama': (Xp, has)}


def spiega(i, j, prim, soglia_trama=0.55):
    """Le ragioni per cui j è vicino di i. Set vuoto = arco inspiegato."""
    out = []
    for nome in ('genere', 'keyword', 'cast', 'regia', 'collezione'):
        a = prim.get(nome, {}).get(i)
        b = prim.get(nome, {}).get(j)
        if a and b and (a & b):
            out.append(nome)
    Xp, has = prim['_trama']
    if has[i] and has[j] and float(Xp[i] @ Xp[j]) >= soglia_trama:
        out.append('trama')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('grafo')
    ap.add_argument('--semi', type=int, default=400)
    ap.add_argument('--k', type=int, default=20)
    ap.add_argument('--soglia-trama', type=float, default=0.55)
    ap.add_argument('--pesi', help='pesi.json del grafo: include solo i tipi effettivamente usati')
    ap.add_argument('--tipi-dir', default='services/graph/data/tipi2',
                    help='cartella dei tipi comportamentali per l\'audit')
    a = ap.parse_args()
    B = D.basic()
    N, T = B['N'], B['titoli']
    M = PV.leggi(a.grafo)[0]
    prim = primitive(B)

    # Ragioni comportamentali. Se passiamo i pesi, conta solo i tipi inclusi nel grafo.
    pesi = json.loads(Path(a.pesi).read_text(encoding='utf-8')) if a.pesi else None
    comportamentali = [('co-visione', 'COVISION'), ('liste', 'LIST')]
    if pesi is not None and pesi.get('RESID', 0) > 0:
        comportamentali.append(('gusto-utente', 'RESID'))
    if pesi is not None and pesi.get('TRIBU', 0) > 0:
        comportamentali.append(('tribu-gusto', 'TRIBU'))
    tipi = {}
    for nome, f in comportamentali:
        if pesi is not None and pesi.get(f, 0) <= 0:
            continue
        p = Path(a.tipi_dir) / f'{f}.npz'
        if p.exists():
            z = PV.leggi(p)[0]
            tipi[nome] = set(zip(*z.nonzero())) if z.nnz < 3_000_000 else None
            if tipi[nome] is None:
                tipi[nome] = z          # troppo grande: si interroga per riga
    print(f'  audit: ragioni comportamentali: {list(tipi)}', flush=True)

    rng = np.random.default_rng(11)
    pool = np.flatnonzero(np.diff(M.indptr) > 0)
    semi = rng.choice(pool, size=min(a.semi, len(pool)), replace=False)

    conteggio = Counter()
    per_seme = []
    inspiegati_esempi = []
    for i in semi:
        r = M.getrow(i)
        o = r.indices[np.argsort(-r.data)]
        vicini = [int(j) for j in o if j != i][:a.k]
        if not vicini:
            continue
        n_spiegati = 0
        for j in vicini:
            ragioni = spiega(int(i), j, prim, a.soglia_trama)
            for nome, mat in tipi.items():
                if mat is not None and isinstance(mat, set):
                    if (int(i), j) in mat:
                        ragioni.append(nome)
                elif mat is not None:
                    if j in mat.getrow(int(i)).indices:
                        ragioni.append(nome)
            if ragioni:
                n_spiegati += 1
                for x in ragioni:
                    conteggio[x] += 1
            elif len(inspiegati_esempi) < 12:
                inspiegati_esempi.append((str(T[i]), str(T[j])))
        per_seme.append(n_spiegati / len(vicini))

    tot_vicini = len(semi) * a.k
    print(f'\ngrafo: {a.grafo} · {len(semi)} semi × {a.k} vicini')
    print(f'  vicini spiegati: {np.mean(per_seme):.1%} (mediana {np.median(per_seme):.1%})')
    print(f'  semi con TUTTI i vicini spiegati: {np.mean([x >= 0.999 for x in per_seme]):.1%}')
    print('  di che tipo (un vicino può avere più ragioni):')
    for nome in RAGIONI:
        print(f'    {nome:<12} {conteggio[nome]/max(tot_vicini,1):>7.1%} dei vicini')
    if inspiegati_esempi:
        print('\n  esempi di archi INSPIEGATI:')
        for a_, b_ in inspiegati_esempi:
            print(f'    {a_[:34]:<34} -> {b_[:34]}')


if __name__ == '__main__':
    main()
