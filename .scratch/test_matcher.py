import sys
sys.path.insert(0, '.')
import json
import collections
import pandas as pd
from services.graph_dense import config as C

dm = pd.read_parquet(C.TMDB / 'movies.parquet')
dt = pd.read_parquet(C.TMDB / 'tv.parquet')

dm['year'] = dm['release_date'].fillna('').str[:4].apply(lambda x: int(x) if x.isdigit() else 0)
dt['year'] = dt['first_air_date'].fillna('').str[:4].apply(lambda x: int(x) if x.isdigit() else 0)

def match_item(t, y):
    tl = t.lower().strip()
    # first search movie by exact year range
    m = dm[(dm['year'].between(y-1, y+1)) & (
        dm['title'].fillna('').str.lower().eq(tl) |
        dm['original_title'].fillna('').str.lower().eq(tl) |
        dm['title_en'].fillna('').str.lower().eq(tl)
    )]
    if len(m) > 0:
        r = m.iloc[0]
        c = json.loads(r['production_countries']) if pd.notna(r['production_countries']) else []
        g = [x['name'].lower() for x in json.loads(r['genres'])] if pd.notna(r['genres']) else []
        dirs = [x['name'] for x in json.loads(r['directors'])] if pd.notna(r['directors']) else []
        return {'found': True, 'type': 'movie', 'id': int(r['id']), 'title': r['title'], 'orig_title': r['original_title'], 'year': int(r['year']), 'lang': r['original_language'], 'countries': c, 'genres': g, 'directors': dirs}
    
    # then search tv by exact year range
    tv_m = dt[(dt['year'].between(y-1, y+1)) & (
        dt['name'].fillna('').str.lower().eq(tl) |
        dt['original_name'].fillna('').str.lower().eq(tl) |
        dt['name_en'].fillna('').str.lower().eq(tl)
    )]
    if len(tv_m) > 0:
        r = tv_m.iloc[0]
        c = json.loads(r['production_countries']) if pd.notna(r['production_countries']) else []
        g = [x['name'].lower() for x in json.loads(r['genres'])] if pd.notna(r['genres']) else []
        dirs = [x['name'] for x in json.loads(r['created_by'])] if pd.notna(r['created_by']) else []
        return {'found': True, 'type': 'tv', 'id': int(r['id']), 'title': r['name'], 'orig_title': r['original_name'], 'year': int(r['year']), 'lang': r['original_language'], 'countries': c, 'genres': g, 'directors': dirs}

    # fallback without year filter
    m_any = dm[
        dm['title'].fillna('').str.lower().eq(tl) |
        dm['original_title'].fillna('').str.lower().eq(tl) |
        dm['title_en'].fillna('').str.lower().eq(tl)
    ]
    if len(m_any) > 0:
        r = m_any.iloc[0]
        c = json.loads(r['production_countries']) if pd.notna(r['production_countries']) else []
        g = [x['name'].lower() for x in json.loads(r['genres'])] if pd.notna(r['genres']) else []
        dirs = [x['name'] for x in json.loads(r['directors'])] if pd.notna(r['directors']) else []
        return {'found': True, 'type': 'movie', 'id': int(r['id']), 'title': r['title'], 'orig_title': r['original_title'], 'year': int(r['year']), 'lang': r['original_language'], 'countries': c, 'genres': g, 'directors': dirs, 'year_warn': f"expected {y}, got {r['year']}"}
        
    return {'found': False}

print("Helper ready.")
