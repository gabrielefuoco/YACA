"""dev-set-kfold.py — lo stesso dev set, cinque volte, su TUTTI gli autori di liste.

PERCHE' ESISTE (handoff 5, §2). Il dev set attuale tiene fuori 155 autori su 775 (20%) e ne ricava
166 casi. L'MDE su R@20 e' ~0,008-0,012: per vedere +0,01 servono ~560 casi. Ma il materiale c'e'
gia': se il grafo esclude **tutti** i 775 autori di liste da LIST e LISTSEM, ogni caso e' cieco e i
casi si possono usare tutti — 5 blocchi disgiunti dello stesso materiale, ~830 casi, MDE che si
divide per sqrt(5).

Costo: una sola ricostruzione di LIST e LISTSEM (il resto del grafo non cambia), non cinque.

  PYTHONPATH=. py .scratch/banco-casi/dev-set-kfold.py
  -> .scratch/banco-casi/holdout-tutti.json          (i 775 autori, da dare a LIST/LISTSEM)
  -> .scratch/banco-casi/dev-kfold/dev-1.json ... dev-5.json
  -> .scratch/banco-casi/dev-kfold/dev-tutti.json    (i 5 blocchi uniti)
"""
from __future__ import annotations

import importlib.util
import json
import math
from collections import Counter
from pathlib import Path

import numpy as np

from services.graph_dense import config as C, data as D

DEV = Path('.scratch/banco-casi/dev-set.py')
OUT = Path('.scratch/banco-casi')
KF = OUT / 'dev-kfold'
SEME = 777
N_BLOCCHI = 5
MIN_TITOLI, MAX_TITOLI = 8, 400
MIN_TARGET, MAX_TARGET = 5, 20


def _dev():
    spec = importlib.util.spec_from_file_location('devset', DEV)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    ds = _dev()
    B = D.basic()
    RO, VOT, DIR, YEAR = B['row_of'], B['VOT'], B['DIR'], B['year']

    import pandas as pd
    gen = {}
    for tipo, f in (('movie', 'movies.parquet'), ('tv', 'tv.parquet')):
        d = pd.read_parquet(C.TMDB / f, columns=['id', 'genres'])
        for i, g in zip(d.id, d.genres):
            r = RO.get(f'{tipo}:{int(i)}')
            if r is None:
                continue
            try:
                gs = [str(x.get('name', '')).lower() for x in json.loads(g or '[]') if isinstance(x, dict)]
            except Exception:
                gs = []
            if gs:
                gen[r] = gs[0]

    meta = {k: v for k, v in ds.metadati().items() if v['autore']}
    autori = sorted({m['autore'] for m in meta.values()})
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'holdout-tutti.json').write_text(json.dumps(autori, indent=1), 'utf-8')
    print(f'autori di liste: {len(autori):,} -> holdout-tutti.json (tutti esclusi da LIST/LISTSEM)')

    semi_test = {s['id'] for s in json.loads((OUT / 'banco.json').read_text(encoding='utf-8'))['sources']}

    casi, scartate = [], Counter()
    for lid, m in meta.items():
        righe = []
        for e in ds.items(lid):
            ent = e.get('movie') or e.get('show')
            if not isinstance(ent, dict):
                continue
            t = (ent.get('ids') or {}).get('tmdb')
            if t is None:
                continue
            r = RO.get(('movie:' if 'movie' in e else 'tv:') + str(int(t)))
            if r is not None:
                righe.append(r)
        righe = list(dict.fromkeys(righe))
        if not (MIN_TITOLI <= len(righe) <= MAX_TITOLI):
            scartate['dimensione'] += 1
            continue
        casi.append({'lista': lid, 'nome': m['nome'][:80], 'autore': m['autore'], 'righe': righe})

    fonti = []
    for c in casi:
        righe = c['righe']
        seme_r = max(righe, key=lambda r: VOT[r])
        g0, d0 = gen.get(seme_r), int(DIR[seme_r])
        _y = YEAR[seme_r]
        y0 = int(_y) // 10 if (_y == _y and _y > 0) else -1
        target = [r for r in righe if r != seme_r
                  and gen.get(r) != g0
                  and (d0 <= 0 or int(DIR[r]) != d0)
                  and (y0 < 0 or not (YEAR[r] == YEAR[r] and YEAR[r] > 0) or int(YEAR[r]) // 10 != y0)]
        if B['keys'][seme_r] in semi_test:
            scartate['seme nel test set'] += 1
            continue
        if len(target) < MIN_TARGET:
            scartate['pochi target cross-genere'] += 1
            continue
        gt = {gen[r] for r in target if r in gen}
        dt = {int(YEAR[r]) // 10 for r in target if YEAR[r] == YEAR[r] and YEAR[r] > 0}
        if len(gt) < 3 or len(dt) < 3:
            scartate['target omogenei (franchise)'] += 1
            continue
        fonti.append({'id': B['keys'][seme_r],
                      'links': [{'id': B['keys'][t], 'w': 1.0} for t in target[:MAX_TARGET]],
                      'lista': c['nome'], 'autore': c['autore']})

    # BLOCCHI DISGIUNTI PER AUTORE: un autore non puo' cadere in due blocchi, altrimenti le due
    # misure non sono indipendenti e il bootstrap sovrastima la precisione.
    rng = np.random.default_rng(SEME)
    aut_f = sorted({f['autore'] for f in fonti})
    ordine = rng.permutation(len(aut_f))
    blocco = {aut_f[i]: int(n % N_BLOCCHI) for n, i in enumerate(ordine)}
    KF.mkdir(parents=True, exist_ok=True)
    tot = 0
    for b in range(N_BLOCCHI):
        ff = [{k: v for k, v in f.items() if k != 'autore'} for f in fonti if blocco[f['autore']] == b]
        (KF / f'dev-{b + 1}.json').write_text(json.dumps({'sources': ff}, ensure_ascii=False), 'utf-8')
        # holdout del blocco: gli autori di QUESTO blocco, e solo loro, escono da LIST/LISTSEM nel
        # grafo-strumento di questo blocco. Cosi' ogni caso e' cieco e i 5 grafi restano confrontabili.
        bloc = sorted(a for a in aut_f if blocco[a] == b)
        (KF / f'holdout-blocco-{b + 1}.json').write_text(json.dumps(bloc, indent=1), 'utf-8')
        n = sum(len(f['links']) for f in ff)
        tot += n
        print(f'  blocco {b + 1}: {len(ff):>4} casi · {n:>6} link · '
              f'{len({f["autore"] for f in fonti if blocco[f["autore"]] == b}):>3} autori')
    tutti = [{k: v for k, v in f.items() if k != 'autore'} for f in fonti]
    (KF / 'dev-tutti.json').write_text(json.dumps({'sources': tutti}, ensure_ascii=False), 'utf-8')
    print(f'\ntotale: {len(fonti)} casi · {tot} link · scartate {dict(scartate)}')
    print(f'scritto {KF}/dev-tutti.json')


if __name__ == '__main__':
    main()
