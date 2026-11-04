import sys
sys.path.insert(0, '.')
import json
import re
from pathlib import Path
import pandas as pd
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

def search_title(query, year=None, kind=None):
    q = query.lower().strip()
    res = []
    if kind != 'tv':
        m_matches = dm[
            dm['title'].fillna('').str.lower().eq(q) |
            dm['original_title'].fillna('').str.lower().eq(q) |
            dm['title_en'].fillna('').str.lower().eq(q)
        ]
        if year:
            m_matches = m_matches[m_matches['year'].between(year - 1, year + 1)]
        for _, r in m_matches.iterrows():
            countries = json.loads(r['production_countries']) if pd.notna(r['production_countries']) else []
            res.append({
                'type': 'movie',
                'id': int(r['id']),
                'title': r['title'],
                'original_title': r['original_title'],
                'year': int(r['year']),
                'lang': r['original_language'],
                'countries': countries,
                'directors': json.loads(r['directors']) if pd.notna(r['directors']) else []
            })
    if kind != 'movie':
        t_matches = dt[
            dt['name'].fillna('').str.lower().eq(q) |
            dt['original_name'].fillna('').str.lower().eq(q) |
            dt['name_en'].fillna('').str.lower().eq(q)
        ]
        if year:
            t_matches = t_matches[t_matches['year'].between(year - 1, year + 1)]
        for _, r in t_matches.iterrows():
            countries = json.loads(r['production_countries']) if pd.notna(r['production_countries']) else []
            res.append({
                'type': 'tv',
                'id': int(r['id']),
                'title': r['name'],
                'original_title': r['original_name'],
                'year': int(r['year']),
                'lang': r['original_language'],
                'countries': countries,
                'directors': json.loads(r['created_by']) if pd.notna(r['created_by']) else []
            })
    return res

if __name__ == '__main__':
    print("Search test:")
    print(search_title("Frances Ha", 2013))
