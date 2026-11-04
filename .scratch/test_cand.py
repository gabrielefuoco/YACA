import sys
sys.path.insert(0, '.')
import json
import pandas as pd
from services.graph_dense import config as C, data as D
import importlib.util

spec = importlib.util.spec_from_file_location('ingestione', '.scratch/banco-casi/ingestione.py')
ing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ing)

B = D.basic()
idx = ing.indice(B)
chiavi = sorted(idx)
movies = pd.read_parquet(C.TMDB / 'movies.parquet').set_index('id')
tv = pd.read_parquet(C.TMDB / 'tv.parquet').set_index('id')

def check_cand(title, year):
    r, stato = ing.aggancia(title, year, idx, chiavi, B['year'], 0.82)
    if r is None:
        return None, stato, None
    k = B['keys'][r]
    tipo, sid = k.split(':')
    sid = int(sid)
    meta = None
    if tipo == 'movie' and sid in movies.index:
        row = movies.loc[sid]
        meta = {
            'key': k,
            'title': row.get('title'),
            'orig_title': row.get('original_title'),
            'year': int(str(row.get('release_date'))[:4]) if str(row.get('release_date'))[:4].isdigit() else 0,
            'lang': row.get('original_language'),
            'countries': json.loads(row['production_countries']) if isinstance(row.get('production_countries'), str) else [],
            'directors': [d['name'] for d in json.loads(row['directors'])] if isinstance(row.get('directors'), str) else [],
            'genres': [g['name'] for g in json.loads(row['genres'])] if isinstance(row.get('genres'), str) else [],
            'collection': str(row['collection_name']) if pd.notna(row.get('collection_name')) else None
        }
    elif tipo == 'tv' and sid in tv.index:
        row = tv.loc[sid]
        meta = {
            'key': k,
            'title': row.get('name'),
            'orig_title': row.get('original_name'),
            'year': int(str(row.get('first_air_date'))[:4]) if str(row.get('first_air_date'))[:4].isdigit() else 0,
            'lang': row.get('original_language'),
            'countries': json.loads(row['production_countries']) if isinstance(row.get('production_countries'), str) else [],
            'directors': [d['name'] for d in json.loads(row['created_by'])] if isinstance(row.get('created_by'), str) else [],
            'genres': [g['name'] for g in json.loads(row['genres'])] if isinstance(row.get('genres'), str) else [],
            'collection': None
        }
    return k, stato, meta

test_titles = [
    ("Il pranzo di Babette", 1987),
    ("Tampopo", 1985),
    ("Il favoloso mondo di Amélie", 2001),
    ("Kiki - Consegne a domicilio", 1989),
    ("Appuntamento a Belleville", 2003),
    ("Paddington 2", 2017),
    ("Il sapore delle cose", 2023),
    ("The Taste of Things", 2023),
    ("The Secret of Kells", 2009),
    ("Big Night", 1996),
    ("Julie & Julia", 2009),
    ("Hugo Cabret", 2011),
    ("Il gigante di ferro", 1999),
    ("Midnight in Paris", 2011),
    ("Chocolat", 2000),
    ("Fantastic Mr. Fox", 2009),
    ("Come l'acqua per il cioccolato", 1992),
    ("Mangiare bere uomo donna", 1994),
    ("Wallace & Gromit - La maledizione del coniglio mannaro", 2005),
    ("La cuoca del presidente", 2012)
]

for t, y in test_titles:
    k, stato, meta = check_cand(t, y)
    if k:
        print(f"OK: {t} -> {meta['title']} ({meta['year']}) [{meta['lang']}, {meta['countries']}]")
    else:
        print(f"FAIL: {t} ({y}) -> {stato}")
