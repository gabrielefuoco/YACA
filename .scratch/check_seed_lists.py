import sys, json, re
sys.path.insert(0, '.')
from collections import Counter, defaultdict
import pandas as pd
from pathlib import Path

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

def get_meta(k):
    tipo, sid = k.split(':')
    sid = int(sid)
    df = movies if tipo == 'movie' else tv
    if sid not in df.index:
        return {}
    r = df.loc[sid]
    try: countries = json.loads(r.get('production_countries') or '[]')
    except: countries = []
    try: genres = [g.get('name', '').lower() for g in json.loads(r.get('genres') or '[]')]
    except: genres = []
    dirs = []
    if tipo == 'movie':
        try: dirs = [d.get('name', '') for d in json.loads(r.get('directors') or '[]')]
        except: dirs = []
    else:
        try: dirs = [d.get('name', '') for d in json.loads(r.get('created_by') or '[]')]
        except: dirs = []
    return {
        'key': k,
        'title': r.get('title') if tipo == 'movie' else r.get('name'),
        'original_title': r.get('original_title') if tipo == 'movie' else r.get('original_name'),
        'title_en': r.get('title_en') if tipo == 'movie' else r.get('name_en'),
        'year': int(str(r.get('release_date') if tipo == 'movie' else r.get('first_air_date'))[:4]) if str(r.get('release_date') if tipo == 'movie' else r.get('first_air_date'))[:4].isdigit() else 0,
        'lang': r.get('original_language', ''),
        'countries': countries,
        'genres': genres,
        'directors': dirs,
        'collection': r.get('collection_name') if tipo == 'movie' else None
    }

def test_candidates(seed_key, items):
    seed_meta = get_meta(seed_key)
    seed_dirs = set(seed_meta.get('directors', []))
    seed_coll = seed_meta.get('collection')
    
    decades = set()
    non_en = 0
    country_counts = Counter()
    dir_matches = 0
    matched_keys = []
    errors = []
    
    if len(items) != 20:
        errors.append(f"Count is {len(items)}, expected 20")
        
    for it in items:
        t, y, p = it['titolo'], it['anno'], it['perche']
        w = len(p.split())
        if w > 12:
            errors.append(f"Perche > 12 words ({w}): {p}")
        if w == 0:
            errors.append("Empty perche")
            
        r, stato = ing.aggancia(t, y, idx, chiavi, B['year'], 0.82)
        if r is None:
            errors.append(f"UNATTACHED: '{t}' ({y})")
            continue
            
        cand_k = B['keys'][r]
        if cand_k == seed_key:
            errors.append(f"Suggestion is the seed itself: {cand_k}")
            
        matched_keys.append(cand_k)
        cand_meta = get_meta(cand_k)
        
        # Year / decade
        cand_y = cand_meta.get('year', y)
        decades.add((cand_y // 10) * 10)
        
        # Lang
        if cand_meta.get('lang') != 'en':
            non_en += 1
            
        # Countries
        for c in cand_meta.get('countries', []):
            country_counts[c] += 1
            
        # Director
        if seed_dirs and set(cand_meta.get('directors', [])).intersection(seed_dirs):
            dir_matches += 1
            
        # Collection
        if seed_coll and cand_meta.get('collection') and cand_meta.get('collection') == seed_coll:
            errors.append(f"Shares collection '{seed_coll}' with seed: {t}")
            
        # Documentary
        if 'documentary' in cand_meta.get('genres', []):
            errors.append(f"Is documentary: {t}")
            
    if len(decades) < 4:
        errors.append(f"Decades < 4 ({len(decades)}: {sorted(decades)})")
    if non_en < 3:
        errors.append(f"Non-English < 3 ({non_en})")
    if dir_matches > 1:
        errors.append(f"Director matches > 1 ({dir_matches})")
    for c, cnt in country_counts.items():
        if cnt > 6:
            errors.append(f"Country '{c}' has {cnt} titles (> 6)")
            
    return errors, matched_keys, country_counts, decades, non_en
