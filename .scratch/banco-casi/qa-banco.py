"""qa-banco.py — controlla i vincoli che gli slave dichiarano di aver rispettato.

Un banco che viola i propri vincoli misura la cosa sbagliata: se le liste contengono film dello
stesso regista, il banco premia l'autorialità e non il tono — esattamente il bias che stiamo cercando
di togliere di mezzo.

  PYTHONPATH=. py .scratch/banco-casi/qa-banco.py
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import numpy as np

from services.graph_dense import data as D

OUT = Path('.scratch/banco-casi')


def main():
    B = D.basic()
    RO, DIR, COLL, TV, Y, VOT = B['row_of'], B['DIR'], B['COLL'], B['is_tv'], B['year'], B['VOT']
    import importlib.util
    spec = importlib.util.spec_from_file_location('ing', OUT / 'ingestione.py')
    ing = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ing)
    idx = ing.indice(B)
    chiavi = sorted(idx)

    tot = Counter()
    righe = []
    for f in sorted(OUT.glob('risposte-*.json')):
        d = json.loads(f.read_text(encoding='utf-8'))
        c = Counter()
        for s in d:
            seed = s.get('seed')
            if seed not in RO:
                c['seme fuori canone'] += 1
                continue
            i = RO[seed]
            righe_canone, senza = [], 0
            for sug in s.get('suggerimenti', []):
                r, _ = ing.aggancia(sug.get('titolo', ''), sug.get('anno'), idx, chiavi, Y, 0.82)
                if r is None:
                    senza += 1
                    continue
                righe_canone.append(r)
            c['suggerimenti'] += len(s.get('suggerimenti', []))
            c['agganciati'] += len(righe_canone)
            c['senza match'] += senza
            if len(righe_canone) < 5:
                continue
            # stesso regista del seme
            c['stesso regista'] += sum(1 for r in righe_canone
                                       if DIR[r] > 0 and DIR[r] == DIR[i])
            # stessa collezione (saga)
            c['stessa collezione'] += sum(1 for r in righe_canone
                                          if COLL[r] > 0 and COLL[r] == COLL[i])
            # duplicati dentro la scheda
            c['duplicati interni'] += len(righe_canone) - len(set(righe_canone))
            # decenni distinti e quota non anglofona non sono ricavabili dal canone: li salta
            anni = [int(Y[r]) for r in righe_canone if Y[r] > 0]
            if anni:
                c['decenni distinti'] += len({a // 10 for a in anni})
                c['schede con anni'] += 1
            c['voti mediani'] += float(np.median([VOT[r] for r in righe_canone]))
        n = max(c['schede con anni'], 1)
        righe.append((f.name, c['agganciati'], c['stesso regista'], c['stessa collezione'],
                      c['duplicati interni'], c['decenni distinti'] / n, c['voti mediani'] / n,
                      c['senza match']))
        tot.update(c)

    print(f"{'blocco':<18}{'link':>6}{'st.regista':>11}{'st.coll':>9}{'dup':>5}"
          f"{'decenni':>9}{'voti med':>10}{'senza':>7}")
    for r in righe:
        print(f'{r[0]:<18}{r[1]:>6}{r[2]:>11}{r[3]:>9}{r[4]:>5}{r[5]:>9.1f}{r[6]:>10.0f}{r[7]:>7}')
    print(f'\ntotale: {tot["agganciati"]:,} link su {tot["suggerimenti"]:,} suggerimenti '
          f'({100*tot["agganciati"]/max(tot["suggerimenti"],1):.1f}%) · '
          f'stesso regista {tot["stesso regista"]:,} · stessa saga {tot["stessa collezione"]:,} · '
          f'duplicati {tot["duplicati interni"]:,}')


if __name__ == '__main__':
    main()
