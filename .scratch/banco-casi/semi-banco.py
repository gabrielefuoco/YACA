"""semi-banco.py — i 200 semi del banco dei casi, stratificati (140 film, 60 serie).

Il banco curato (499 sorgenti) è scritto da un curatore con i suoi gusti, e ci abbiamo ottimizzato
sopra: premia il popolare e l'autoriale. Questo ne costruisce uno nuovo: 200 semi riconoscibili, 10
blocchi da 20 (14 film + 6 serie), ognuno con 20 suggerimenti "stesso tono" da parte di un agente
indipendente — che non sa niente del nostro grafo.

  PYTHONPATH=. py .scratch/banco-casi/semi-banco.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from services.graph_dense import config as C, data as D

OUT = Path('.scratch/banco-casi')
N_BLOCCHI, PER_BLOCCO, FILM_PER_BLOCCO, SERIE_PER_BLOCCO = 10, 20, 14, 6
SEME = 20261105

# film riconoscibili: la stratificazione serve a non avere 140 volte lo stesso decennio
DECENNI = [(1970, 1979), (1980, 1989), (1990, 1999), (2000, 2009), (2010, 2019), (2020, 2026)]
GENERI = ['Dramma', 'Commedia', 'Thriller', 'Horror', 'Fantascienza', 'Avventura', 'Romantico',
          'Animazione', 'Documentario', 'Storico', 'Guerra', 'Western', 'Musical', 'Mistero']


def _generi():
    """(id_tmdb, insieme di generi) dai Parquet: serve solo a stratificare i semi."""
    out = {}
    for tipo, f, campo in (('movie', 'movies.parquet', 'genres'), ('tv', 'tv.parquet', 'genres')):
        d = pd.read_parquet(C.TMDB / f, columns=['id', campo])
        for i, g in zip(d.id, d[campo]):
            try:
                out[int(i)] = {str(x.get('name', '')).lower() for x in json.loads(g or '[]')
                               if isinstance(x, dict)}
            except Exception:
                out[int(i)] = set()
    return out


def main():
    B = D.basic()
    RO, KEYS, T, Y, VOT, TV = B['row_of'], B['keys'], B['titoli'], B['year'], B['VOT'], B['is_tv']
    gen = _generi()
    rng = np.random.default_rng(SEME)

    # --- film: serve un'IDENTITA', non solo popolarità. Un blockbuster generico non ha "tono" da
    # giudicare: si tengono voto alto (>=6.8) e una quota di "distintivi" (>=7.8), più le ancore.
    VAVE = B['VAVE']
    ANCORE = [RO[k] for k in ('movie:346698', 'movie:792307', 'movie:933260', 'movie:545611',
                              'movie:64690', 'movie:496243', 'movie:391713', 'movie:37165') if k in RO]
    film_pool = np.flatnonzero((~TV) & (VOT >= 1500) & (VAVE >= 6.8))
    scelti_film = list(ANCORE)
    for d0, d1 in DECENNI:
        for lo, hi in ((2000, 8000), (8000, 10 ** 9)):
            pool = np.array([x for x in film_pool if d0 <= Y[x] <= d1 and lo <= VOT[x] < hi])
            if len(pool):
                scelti_film.append(int(rng.choice(pool)))
    # completa con altri film popolari finché non ne bastano
    resto = list(rng.permutation(film_pool))
    for x in resto:
        if len(scelti_film) >= N_BLOCCHI * FILM_PER_BLOCCO:
            break
        if int(x) not in set(scelti_film):
            scelti_film.append(int(x))
    # quota di film "distintivi": voto molto alto e pubblico medio — quelli su cui il tono conta
    distinti = np.array([x for x in film_pool if VAVE[x] >= 7.8 and VOT[x] <= 25000])
    for x in rng.permutation(distinti):
        if len(scelti_film) >= N_BLOCCHI * FILM_PER_BLOCCO + 5:
            break
        if int(x) not in set(scelti_film):
            scelti_film.append(int(x))
    scelti_film = list(dict.fromkeys(scelti_film))[:N_BLOCCHI * FILM_PER_BLOCCO]

    # --- serie: >=1000 voti, stratificate per fascia
    tv_pool = np.flatnonzero(TV & (VOT >= 800) & (VAVE >= 7.0))
    scelti_serie = []
    for lo, hi in ((1000, 3000), (3000, 10 ** 9)):
        pool = np.array([x for x in tv_pool if lo <= VOT[x] < hi])
        if len(pool):
            for x in rng.choice(pool, size=min(len(pool), N_BLOCCHI * SERIE_PER_BLOCCO), replace=False):
                scelti_serie.append(int(x))
    scelti_serie = list(dict.fromkeys(scelti_serie))[:N_BLOCCHI * SERIE_PER_BLOCCO]

    def voce(i):
        return {'key': KEYS[i], 'titolo': str(T[i]),
                'anno': int(Y[i]) if Y[i] > 0 else 0,
                'voti': int(VOT[i]),
                'generi': sorted(gen.get(int(B['tmdb'][i]), set()))[:4]}

    OUT.mkdir(parents=True, exist_ok=True)
    blocchi = []
    for b in range(N_BLOCCHI):
        semi = ([voce(i) for i in scelti_film[b * FILM_PER_BLOCCO:(b + 1) * FILM_PER_BLOCCO]] +
                [voce(i) for i in scelti_serie[b * SERIE_PER_BLOCCO:(b + 1) * SERIE_PER_BLOCCO]])
        rng.shuffle(semi)
        p = OUT / f'semi-{b + 1:02d}.json'
        p.write_text(json.dumps(semi, ensure_ascii=False, indent=1), encoding='utf-8')
        blocchi.append((p, semi))
        print(f'{p.name}: {sum(1 for s in semi if s["key"].startswith("movie"))} film + '
              f'{sum(1 for s in semi if s["key"].startswith("tv"))} serie')
    print(f'\ntotale: {len(scelti_film)} film + {len(scelti_serie)} serie')
    (OUT / 'manifest.json').write_text(json.dumps(
        {'blocchi': [str(p) for p, _ in blocchi], 'per_blocco': PER_BLOCCO,
         'film': len(scelti_film), 'serie': len(scelti_serie)}, ensure_ascii=False, indent=1),
        encoding='utf-8')


if __name__ == '__main__':
    main()
