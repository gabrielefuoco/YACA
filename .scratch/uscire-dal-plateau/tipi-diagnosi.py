"""tipi-diagnosi.py — ogni tipo da solo, prima della fusione (handoff 5, §3).

PERCHE' ESISTE. Finora un tipo si giudicava solo dentro il grafo fuso, dove RRF lo rende inudibile
a peso basso: non si distingueva «tipo inutile» da «tipo inascoltato». Il senior ha proposto il
Conditional Complementarity Lift: sui soli link che il grafo base MANCA, quanti il tipo recupera
in testa. Qui tre numeri per tipo, tutti sul dev set umano:

  r20        recall@20 del tipo da solo (quanto e' buono in assoluto)
  rescue@15  fra i link che il grafo base sbaglia (rank > 20), quanti il tipo mette nei primi 15
  tonal      quota dei primi 10 del tipo che sono target di ALMENO un caso umano: se la testa e'
             fatta di film che nessuno ha mai messo in una lista tonale, la testa e' spazzatura

Uso:
  PYTHONPATH=. py .scratch/uscire-dal-plateau/tipi-diagnosi.py services/graph/data/v42d/tipi2
  PYTHONPATH=. py .scratch/uscire-dal-plateau/tipi-diagnosi.py DIR --grafo G.npz --tipi RESID,KWSEM
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from services.graph_dense import config as C, data as D, provenance as PV, valuta as V

DEV = Path('.scratch/banco-casi/dev-set.json')
PESI = {'COVISION': 0.8, 'KWSEM': 1.4, 'CAST': 0.4, 'PROD': 0.3, 'LIST': 1.0, 'CONTESTI': 0.2,
        'TRIBU': 0.15, 'RESID': 1.2, 'TRAMA': 0.15, 'RRFST': 1.0, 'DIR': 1.0, 'COLL': 0.5,
        'CREWPROP': 0.15, 'LISTSEM': 0.15}


def ordine(M, i, taglia=3000):
    if i >= M.shape[0]:
        return []
    r = M.getrow(i)
    if r.nnz == 0:
        return []
    o = np.argsort(-r.data)
    return [int(j) for j in r.indices[o] if int(j) != i][:taglia]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('tipi_dir')
    ap.add_argument('--grafo', default='services/graph/data/v42d/bolle-eterogeneo-V42D-p1.0-triangolo.npz')
    ap.add_argument('--tipi', default='')
    ap.add_argument('--dev', default=str(DEV))
    ap.add_argument('--k-head', type=int, default=10)
    a = ap.parse_args()

    B = D.basic()
    IS_TV = B['is_tv']
    casi = V.banco(a.dev)
    print(f'dev: {len(casi)} casi · {sum(len(l) for _, l in casi)} link')
    tonal = set()
    for _, links in casi:
        tonal |= {int(j) for j, _ in links}
    print(f'film che compaiono in almeno un caso umano: {len(tonal):,}')

    G = V.carica(a.grafo) if Path(a.grafo).exists() else None
    base_rank = {}
    if G is not None:
        for n, (i, links) in enumerate(casi):
            o = ordine(G, i)
            rk = {j: p + 1 for p, j in enumerate(o)}
            base_rank[n] = {int(j): rk.get(int(j), 10 ** 9) for j, _ in links}
    else:
        print('  (nessun grafo base: rescue non calcolabile)')

    d = Path(a.tipi_dir)
    nomi = [t.strip() for t in a.tipi.split(',') if t.strip()] if a.tipi else \
        sorted(p.stem for p in d.glob('*.npz') if p.stem != 'manifest')
    print(f'\n{"tipo":<10}{"peso":>6}{"r20":>8}{"r5":>8}{"rescue15":>10}{"tonal@10":>10}{"archi":>12}')
    righe = []
    for t in nomi:
        p = d / f'{t}.npz'
        if not p.exists():
            continue
        M = PV.leggi(p)[0].tocsr()
        mt = V.metriche_per_sorgente(M, casi, ks=(5, 20))
        resc, tot, ton, ton_n = 0, 0, 0, 0
        for n, (i, links) in enumerate(casi):
            o = ordine(M, i)
            rk = {j: q + 1 for q, j in enumerate(o)}
            for j, _ in links:
                if G is not None and base_rank[n][int(j)] > 20:
                    tot += 1
                    if rk.get(int(j), 10 ** 9) <= 15:
                        resc += 1
            testa = [j for j in o if not IS_TV[j]][:a.k_head]
            ton += sum(1 for j in testa if j in tonal)
            ton_n += len(testa)
        r20 = float(mt['r20'].mean()); r5 = float(mt['r5'].mean())
        righe.append(dict(tipo=t, peso=PESI.get(t, 0), r20=r20, r5=r5,
                          rescue=resc / max(tot, 1), tonal=ton / max(ton_n, 1), archi=int(M.nnz)))
        print(f'{t:<10}{PESI.get(t, 0):>6.2f}{r20:>8.4f}{r5:>8.4f}{resc / max(tot, 1):>10.3f}'
              f'{ton / max(ton_n, 1):>10.3f}{M.nnz:>12,}')
    if righe:
        out = Path('.cache/tipi-diagnosi.json')
        out.write_text(json.dumps(righe, indent=1), 'utf-8')
        print(f'\nscritto {out}')


if __name__ == '__main__':
    main()
