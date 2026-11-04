"""dev-set.py — l'insieme di sviluppo: micro-liste Trakt scritte da umani, in holdout (ticket 13).

PERCHE' ESISTE. Il banco tonale (`banco-casi/banco.json`) è il **test set cieco**: 200 semi scritti da
agenti che non hanno mai visto il grafo. Non si usa per tarare niente. Ma senza un secondo insieme non
si può sviluppare — ogni scelta sarebbe una violazione.

Qui si costruisce il dev set dal materiale **umano** che abbiamo già: le liste pubbliche Trakt, con il
loro nome e i loro film. Si tiene fuori il 20% degli autori (quei film non entrano in LIST/LISTSEM) e da
quegli autori si prendono solo le liste che sono **puro tono** per costruzione:

  · 8-35 titoli        (abbastanza per esprimere un gusto, non una filmografia)
  · entropia di genere >= 1,6 bit e >= 3 decenni   (non è "i miei action preferiti")
  · zero coppie con lo stesso regista              (non è "il mio regista preferito")

  PYTHONPATH=. py .scratch/banco-casi/dev-set.py
"""
from __future__ import annotations

import json
import math
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

from services.graph_dense import config as C, data as D

LISTE = Path('.cache/trakt/lists')
OUT = Path('.scratch/banco-casi')
SEME = 777
QUOTA_HOLDOUT = 0.20
MIN_TITOLI, MAX_TITOLI = 8, 400
MIN_TARGET = 5            # quanti salti cross-genere/decennio/autore servono perché la lista sia un caso
MAX_TARGET = 20


def metadati():
    """{id_lista: {nome, descrizione, autore}} dai file `popular-*.json`."""
    out = {}
    for f in sorted(LISTE.glob('popular-*.json')):
        for e in json.loads(f.read_text(encoding='utf-8')):
            l = e.get('list') or {}
            ids = (l.get('ids') or {})
            lid = ids.get('trakt')
            u = (l.get('user') or {})
            if lid is None:
                continue
            # LA CHIAVE DELL'AUTORE È LO SLUG: è quella che usa `covision-list.py`, e senza la
            # stessa chiave l'holdout non si può applicare a LIST (e il dev set non sarebbe cieco).
            slug = (u.get('ids') or {}).get('slug')
            out[int(lid)] = {'nome': str(l.get('name') or ''),
                             'descrizione': str(l.get('description') or ''),
                             'autore': slug or '',
                             'item_count': int(l.get('item_count') or 0)}
    return out


def items(lid):
    """Le righe del canone per la lista `lid`, o [] se il file manca."""
    f = LISTE / f'items-{lid}.json'
    if not f.exists():
        return []
    try:
        d = json.loads(f.read_text(encoding='utf-8'))
    except Exception:
        return []
    return [x for x in d if isinstance(x, dict)]


def generi_e_anno(B, righe):
    """Generi (primo) e anni delle righe, letti una volta sola dai Parquet."""
    return B['year'], B.get('_generi')


def entropia(conteggi):
    tot = sum(conteggi.values())
    if tot <= 0:
        return 0.0
    return -sum((c / tot) * math.log2(c / tot) for c in conteggi.values() if c)


def main():
    B = D.basic()
    RO, TMDB = B['row_of'], B['tmdb']
    TV, YEAR = B['is_tv'], B['year']
    DIR = B['DIR']

    # generi per riga: dal Parquet, una passata
    gen = {}
    for tipo, f in (('movie', 'movies.parquet'), ('tv', 'tv.parquet')):
        d = pd.read_parquet(C.TMDB / f, columns=['id', 'genres'])
        for i, g in zip(d.id, d.genres):
            r = RO.get(f'{tipo}:{int(i)}')
            if r is None:
                continue
            try:
                gs = [str(x.get('name', '')).lower() for x in json.loads(g or '[]')
                      if isinstance(x, dict)]
            except Exception:
                gs = []
            if gs:
                gen[r] = gs[0]
    print(f'generi: {len(gen):,} titoli')

    meta = metadati()
    print(f'liste con metadati: {len(meta):,}')

    # QUALI AUTORI RESTANO FUORI. Il seme è fisso: due run danno lo stesso split.
    # senza slug non si può tenere fuori l'autore: quelle liste non entrano nel dev set
    meta = {k: v for k, v in meta.items() if v['autore']}
    autori = sorted({m['autore'] for m in meta.values()})
    rng = np.random.default_rng(SEME)
    ordine = rng.permutation(len(autori))
    n_hold = int(round(len(autori) * QUOTA_HOLDOUT))
    holdout = {autori[i] for i in ordine[:n_hold]}
    OUT.mkdir(parents=True, exist_ok=True)
    OUT.joinpath('holdout-autori.json').write_text(json.dumps(sorted(holdout), indent=1), 'utf-8')
    print(f'autori: {len(autori):,} · in holdout: {len(holdout):,} -> holdout-autori.json')

    casi, scartate = [], Counter()
    for lid, m in meta.items():
        if m['autore'] not in holdout:
            continue
        righe = []
        for e in items(lid):
            ent = e.get('movie') or e.get('show')
            if not isinstance(ent, dict):
                continue
            ids = ent.get('ids') or {}
            t = ids.get('tmdb')
            if t is None:
                continue
            r = RO.get(('movie:' if 'movie' in e else 'tv:') + str(int(t)))
            if r is not None:
                righe.append(r)
        righe = list(dict.fromkeys(righe))
        if not (MIN_TITOLI <= len(righe) <= MAX_TITOLI):
            scartate['dimensione'] += 1
            continue
        cg = Counter(gen[r] for r in righe if r in gen)
        decenni = {int(YEAR[r]) // 10 for r in righe if YEAR[r] > 0}
        # IL VINCOLO STA SUI TARGET, NON SULLA LISTA. Le liste popolari sono liste-franchise (MCU,
        # Nolan, Disney): chiedere che l'INTERA lista sia cross-genere scarta il 95% del materiale.
        # Quello che serve è che la lista contenga salti — e li contiene quasi sempre.
        casi.append({'lista': lid, 'nome': m['nome'][:80], 'autore': m['autore'],
                     'righe': righe, 'entropia': round(entropia(cg), 2),
                     'decenni': len(decenni), 'generi': len(cg)})

    # seme = il titolo più votato; target = gli altri che NON condividono genere primario, regista
    # e decennio col seme: sono i salti che vogliamo misurare.
    VOT = B['VOT']
    # DISGIUNZIONE DAL TEST SET: se un seme del dev è anche un seme del banco tonale, il caso esce.
    _test = OUT / 'banco.json'
    semi_test = set()
    if _test.exists():
        semi_test = {s['id'] for s in json.loads(_test.read_text(encoding='utf-8'))['sources']}
        print(f'escludo i {len(semi_test)} semi del test set')
    fonti, report = [], []
    for c in casi:
        righe = c['righe']
        seme = max(righe, key=lambda r: VOT[r])
        g0, d0 = gen.get(seme), int(DIR[seme])
        _y = YEAR[seme]
        y0 = int(_y) // 10 if (_y == _y and _y > 0) else -1
        target = [r for r in righe if r != seme
                  and gen.get(r) != g0
                  and (d0 <= 0 or int(DIR[r]) != d0)
                  and (y0 < 0 or not (YEAR[r] == YEAR[r] and YEAR[r] > 0) or int(YEAR[r]) // 10 != y0)]
        if B['keys'][seme] in semi_test:
            scartate['seme nel test set'] += 1
            continue
        if len(target) < MIN_TARGET:
            scartate['pochi target cross-genere'] += 1
            continue
        # I SALTI DEVONO ESSERE EBTEROGENEI: una lista-franchise (Bond, MCU) passa il filtro
        # "genere diverso dal seme" solo perché i generi TMDB variano, ma resta un franchise.
        # Tre generi e tre decenni fra i target escludono quel caso.
        gt = {gen[r] for r in target if r in gen}
        dt = {int(YEAR[r]) // 10 for r in target if YEAR[r] == YEAR[r] and YEAR[r] > 0}
        if len(gt) < 3 or len(dt) < 3:
            scartate['target omogenei (franchise)'] += 1
            continue
        fonti.append({'id': B['keys'][seme], 'links': [{'id': B['keys'][t], 'w': 1.0}
                                                       for t in target[:MAX_TARGET]],
                      'lista': c['nome'], 'entropia': c['entropia']})
        report.append(c)

    OUT.joinpath('dev-set.json').write_text(json.dumps({'sources': fonti}, ensure_ascii=False), 'utf-8')
    OUT.joinpath('dev-report.json').write_text(json.dumps(
        {'liste_valutate': len(casi), 'casi_usati': len(fonti),
         'autori': len(autori), 'autori_holdout': len(holdout),
         'scartate': dict(scartate)}, ensure_ascii=False, indent=1), 'utf-8')
    tot = sum(len(f['links']) for f in fonti)
    print(f"\ndev set: {len(fonti)} casi · {tot} link · scartate {dict(scartate)}")
    print('esempi:', '; '.join(f"{f['lista'][:28]} ({len(f['links'])})" for f in fonti[:5]))


if __name__ == '__main__':
    main()
