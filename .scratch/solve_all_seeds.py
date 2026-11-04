import sys
sys.path.insert(0, '.')
import json
from collections import Counter
import pandas as pd
import importlib.util

spec = importlib.util.spec_from_file_location('ingestione', '.scratch/banco-casi/ingestione.py')
ing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ing)

from services.graph_dense import config as C, data as D
B = D.basic()
idx = ing.indice(B)
chiavi = sorted(idx)

movies = pd.read_parquet(C.TMDB / 'movies.parquet').set_index('id')
tv = pd.read_parquet(C.TMDB / 'tv.parquet').set_index('id')

def check_one(t, y):
    r, stato = ing.aggancia(t, y, idx, chiavi, B['year'], 0.82)
    if r is None:
        return None, stato, {}
    k = B['keys'][r]
    tipo, sid = k.split(':')
    sid = int(sid)
    meta = {}
    if tipo == 'movie' and sid in movies.index:
        row = movies.loc[sid]
        countries = json.loads(row['production_countries']) if isinstance(row.get('production_countries'), str) else []
        dirs = [d['name'] for d in json.loads(row['directors'])] if isinstance(row.get('directors'), str) else []
        genres = [g['name'] for g in json.loads(row['genres'])] if isinstance(row.get('genres'), str) else []
        coll = str(row['collection_name']) if pd.notna(row.get('collection_name')) else None
        meta = {
            'key': k, 'title': row['title'], 'orig_title': row['original_title'],
            'year': int(str(row['release_date'])[:4]) if str(row['release_date'])[:4].isdigit() else 0,
            'lang': row['original_language'], 'countries': countries,
            'directors': dirs, 'genres': genres, 'collection': coll
        }
    elif tipo == 'tv' and sid in tv.index:
        row = tv.loc[sid]
        countries = json.loads(row['production_countries']) if isinstance(row.get('production_countries'), str) else []
        dirs = [d['name'] for d in json.loads(row['created_by'])] if isinstance(row.get('created_by'), str) else []
        genres = [g['name'] for g in json.loads(row['genres'])] if isinstance(row.get('genres'), str) else []
        meta = {
            'key': k, 'title': row['name'], 'orig_title': row['original_name'],
            'year': int(str(row['first_air_date'])[:4]) if str(row['first_air_date'])[:4].isdigit() else 0,
            'lang': row['original_language'], 'countries': countries,
            'directors': dirs, 'genres': genres, 'collection': None
        }
    return k, stato, meta

print("Helper ready")
