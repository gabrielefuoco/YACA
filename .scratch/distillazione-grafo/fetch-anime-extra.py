"""fetch-anime-extra.py — scarica da TMDB gli anime che l'anibridge conosce ma il parquet no.

  PYTHONPATH=. py .scratch/distillazione-grafo/fetch-anime-extra.py [--workers 8]

Perche' esistono: l'ingestore TMDB scarta i titoli con meno di 10 voti (`VOTE_FLOOR`), quindi
~2.970 anime con un id TMDB valido non sono mai entrati nel parquet — e quindi non possono stare
nel canone. Qui si scaricano uno per uno e si scrivono in `.cache/tmdb/anime-extra.parquet`, con
lo stesso schema dei parquet del daemon (liste come stringhe JSON), cosi' i lettori esistenti
(`_nomi`, `json.loads`) funzionano senza modifiche.

NON tocca i parquet del daemon: il canone nuovo unira' questo file.
"""
import argparse
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd

from services.graph_dense import config as C

OUT = C.TMDB / 'anime-extra.parquet'
API = 'https://api.themoviedb.org/3/{tipo}/{tid}'
LOCK = threading.Lock()
STAT = {'ok': 0, 'err': 0, '404': 0}

COLS_MOVIE = ['id', 'title', 'title_en', 'original_title', 'original_language', 'genres', 'keywords',
              'cast', 'directors', 'writers', 'overview', 'runtime', 'release_date', 'vote_count',
              'vote_average', 'popularity', 'status', 'adult', 'budget', 'revenue', 'tagline',
              'collection_id', 'collection_name', 'production_companies', 'production_countries',
              'spoken_languages', 'poster_path', 'backdrop_path', 'imdb_id']
COLS_TV = ['id', 'name', 'name_en', 'original_name', 'original_language', 'genres', 'keywords',
           'cast', 'created_by', 'overview', 'runtime', 'first_air_date', 'last_air_date',
           'number_of_seasons', 'number_of_episodes', 'vote_count', 'vote_average', 'popularity',
           'status', 'in_production', 'type', 'adult', 'tagline', 'networks',
           'production_companies', 'production_countries', 'spoken_languages', 'poster_path',
           'backdrop_path']


def _chiave():
    k = os.environ.get('TMDB_API_KEY')
    if k:
        return k
    for f in ('.env', 'secrets.env'):
        p = C.ROOT / f
        if not p.exists():
            continue
        for line in p.read_text(encoding='utf-8', errors='ignore').splitlines():
            if line.strip().startswith('TMDB_API_KEY='):
                return line.split('=', 1)[1].strip()
    raise SystemExit('TMDB_API_KEY assente')


def _j(x):
    return json.dumps(x if isinstance(x, list) else [], ensure_ascii=False)


def riga_movie(d):
    cr = d.get('credits') or {}
    crew = cr.get('crew') or []
    return {
        'id': int(d['id']), 'title': d.get('title'), 'title_en': d.get('title'),
        'original_title': d.get('original_title'), 'original_language': d.get('original_language'),
        'genres': _j(d.get('genres')), 'keywords': _j((d.get('keywords') or {}).get('keywords')),
        'cast': _j([{'id': c['id'], 'name': c['name'], 'order': c.get('order')}
                    for c in (cr.get('cast') or [])[:15]]),
        'directors': _j([{'id': c['id'], 'name': c['name']} for c in crew if c.get('job') == 'Director']),
        'writers': _j([{'id': c['id'], 'name': c['name']} for c in crew if c.get('job') in ('Writer', 'Screenplay')][:5]),
        'overview': d.get('overview'), 'runtime': d.get('runtime'),
        'release_date': d.get('release_date'), 'vote_count': d.get('vote_count') or 0,
        'vote_average': d.get('vote_average'), 'popularity': d.get('popularity'),
        'status': d.get('status'), 'adult': bool(d.get('adult')), 'budget': d.get('budget'),
        'revenue': d.get('revenue'), 'tagline': d.get('tagline'),
        'collection_id': (d.get('belongs_to_collection') or {}).get('id'),
        'collection_name': (d.get('belongs_to_collection') or {}).get('name'),
        'production_companies': _j(d.get('production_companies')),
        'production_countries': _j(d.get('production_countries')),
        'spoken_languages': _j(d.get('spoken_languages')),
        'poster_path': d.get('poster_path'), 'backdrop_path': d.get('backdrop_path'),
        'imdb_id': d.get('imdb_id') or (d.get('external_ids') or {}).get('imdb_id')}


def riga_tv(d):
    cr = d.get('credits') or {}
    return {
        'id': int(d['id']), 'name': d.get('name'), 'name_en': d.get('name'),
        'original_name': d.get('original_name'), 'original_language': d.get('original_language'),
        'genres': _j(d.get('genres')), 'keywords': _j((d.get('keywords') or {}).get('results')),
        'cast': _j([{'id': c['id'], 'name': c['name'], 'order': c.get('order')}
                    for c in (cr.get('cast') or [])[:15]]),
        'created_by': _j(d.get('created_by')),
        'overview': d.get('overview'), 'runtime': (d.get('episode_run_time') or [None])[0],
        'first_air_date': d.get('first_air_date'), 'last_air_date': d.get('last_air_date'),
        'number_of_seasons': d.get('number_of_seasons'), 'number_of_episodes': d.get('number_of_episodes'),
        'vote_count': d.get('vote_count') or 0, 'vote_average': d.get('vote_average'),
        'popularity': d.get('popularity'), 'status': d.get('status'),
        'in_production': d.get('in_production'), 'type': d.get('type'),
        'adult': bool(d.get('adult')), 'tagline': d.get('tagline'), 'networks': _j(d.get('networks')),
        'production_companies': _j(d.get('production_companies')),
        'production_countries': _j(d.get('production_countries')),
        'spoken_languages': _j(d.get('spoken_languages')),
        'poster_path': d.get('poster_path'), 'backdrop_path': d.get('backdrop_path')}


def scarica(api, tipo, tid, tentativi=3):
    url = (API.format(tipo=tipo, tid=tid) + f'?api_key={api}&language=en-US'
           + '&append_to_response=keywords,credits,external_ids')
    for t in range(tentativi):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'YACA/1.0'})
            with urllib.request.urlopen(req, timeout=40) as r:
                d = json.load(r)
            return (riga_movie(d) if tipo == 'movie' else riga_tv(d))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                with LOCK:
                    STAT['404'] += 1
                return None
            time.sleep(0.5 + t)
        except Exception:
            time.sleep(0.5 + t)
    with LOCK:
        STAT['err'] += 1
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workers', type=int, default=8)
    a = ap.parse_args()
    api = _chiave()

    parquet_tv = set(int(x) for x in pd.read_parquet(C.TMDB / 'tv.parquet', columns=['id']).id)
    parquet_mv = set(int(x) for x in pd.read_parquet(C.TMDB / 'movies.parquet', columns=['id']).id)
    d = json.load(open(C.TMDB / 'anibridge-mappings.json', encoding='utf-8'))
    ids_tv, ids_mo = set(), set()
    for v in d.values():
        if not isinstance(v, dict):
            continue
        for kk in v:
            m = re.match(r'tmdb_show:(\d+)', str(kk))
            if m:
                ids_tv.add(int(m.group(1)))
            m = re.match(r'tmdb_movie:(\d+)', str(kk))
            if m:
                ids_mo.add(int(m.group(1)))
    mancanti = ([('tv', i) for i in sorted(ids_tv - parquet_tv)] +
                [('movie', i) for i in sorted(ids_mo - parquet_mv)])
    print(f'anime da scaricare: {len(mancanti):,} '
          f'({len(ids_tv - parquet_tv):,} serie · {len(ids_mo - parquet_mv):,} film)', flush=True)

    fatte_tv, fatte_mv = [], []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        fut = {ex.submit(scarica, api, t, i): (t, i) for t, i in mancanti}
        for n, fu in enumerate(as_completed(fut), 1):
            r = fu.result()
            if r:
                (fatte_mv if fut[fu][0] == 'movie' else fatte_tv).append(r)
                with LOCK:
                    STAT['ok'] += 1
            if n % 250 == 0:
                print(f'  {n}/{len(mancanti)} · ok {STAT["ok"]} 404 {STAT["404"]} err {STAT["err"]} '
                      f'({time.time()-t0:.0f}s)', flush=True)

    if fatte_mv:
        pd.DataFrame(fatte_mv).reindex(columns=COLS_MOVIE).to_parquet(
            C.TMDB / 'anime-extra-movies.parquet', index=False)
    if fatte_tv:
        pd.DataFrame(fatte_tv).reindex(columns=COLS_TV).to_parquet(
            C.TMDB / 'anime-extra-tv.parquet', index=False)
    print(f'\nscritti: film {len(fatte_mv):,} · serie {len(fatte_tv):,} · '
          f'404 {STAT["404"]} · err {STAT["err"]} ({time.time()-t0:.0f}s)')


if __name__ == '__main__':
    main()
