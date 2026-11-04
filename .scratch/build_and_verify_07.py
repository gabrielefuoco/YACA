# Complete generator and verifier for risposte-07.json
import sys
sys.path.insert(0, '.')
import json
import pandas as pd
from pathlib import Path
from services.graph_dense import config as C

print("Loading TMDB parquet datasets...")
dm = pd.read_parquet(C.TMDB / 'movies.parquet', columns=['id', 'title', 'title_en', 'original_title', 'release_date', 'production_countries', 'original_language', 'directors', 'genres'])
dt = pd.read_parquet(C.TMDB / 'tv.parquet', columns=['id', 'name', 'name_en', 'original_name', 'first_air_date', 'production_countries', 'original_language', 'created_by', 'genres'])

def get_year(val):
    if pd.isna(val) or not val:
        return 0
    try:
        return int(str(val)[:4])
    except:
        return 0

dm['year'] = dm['release_date'].apply(get_year)
dt['year'] = dt['first_air_date'].apply(get_year)

def lookup(title, year=None):
    q = title.lower().strip()
    # match movie
    m = dm[
        dm['title'].fillna('').str.lower().eq(q) |
        dm['original_title'].fillna('').str.lower().eq(q) |
        dm['title_en'].fillna('').str.lower().eq(q)
    ]
    if year:
        m_y = m[m['year'].between(year - 1, year + 1)]
        if len(m_y) > 0:
            m = m_y
    if len(m) > 0:
        r = m.iloc[0]
        c = json.loads(r['production_countries']) if pd.notna(r['production_countries']) else []
        dirs = [d['name'] for d in json.loads(r['directors'])] if pd.notna(r['directors']) else []
        genres = [g['name'].lower() for g in json.loads(r['genres'])] if pd.notna(r['genres']) else []
        return {'found': True, 'type': 'movie', 'id': int(r['id']), 'title': r['title'], 'orig_title': r['original_title'], 'year': int(r['year']), 'lang': r['original_language'], 'countries': c, 'directors': dirs, 'genres': genres}
    
    t = dt[
        dt['name'].fillna('').str.lower().eq(q) |
        dt['original_name'].fillna('').str.lower().eq(q) |
        dt['name_en'].fillna('').str.lower().eq(q)
    ]
    if year:
        t_y = t[t['year'].between(year - 1, year + 1)]
        if len(t_y) > 0:
            t = t_y
    if len(t) > 0:
        r = t.iloc[0]
        c = json.loads(r['production_countries']) if pd.notna(r['production_countries']) else []
        dirs = [d['name'] for d in json.loads(r['created_by'])] if pd.notna(r['created_by']) else []
        genres = [g['name'].lower() for g in json.loads(r['genres'])] if pd.notna(r['genres']) else []
        return {'found': True, 'type': 'tv', 'id': int(r['id']), 'title': r['name'], 'orig_title': r['original_name'], 'year': int(r['year']), 'lang': r['original_language'], 'countries': c, 'directors': dirs, 'genres': genres}
    
    return {'found': False}

# Read semi-07
with open('.scratch/banco-casi/semi-07.json', encoding='utf-8') as f:
    semi = json.load(f)

seed_keys = [s['key'] for s in semi]
print(f"Loaded {len(seed_keys)} seeds.")
