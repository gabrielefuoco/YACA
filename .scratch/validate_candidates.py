import sys
sys.path.insert(0, '.')
import json
import collections
from pathlib import Path
import pandas as pd
from services.graph_dense import config as C

print("Loading TMDB parquet datasets...")
dm = pd.read_parquet(C.TMDB / 'movies.parquet', columns=['id', 'title', 'title_en', 'original_title', 'release_date', 'production_countries', 'original_language', 'directors', 'genres'])
dt = pd.read_parquet(C.TMDB / 'tv.parquet', columns=['id', 'name', 'name_en', 'original_name', 'first_air_date', 'production_countries', 'original_language', 'created_by', 'genres'])

dm['year'] = dm['release_date'].fillna('').str[:4].apply(lambda x: int(x) if x.isdigit() else 0)
dt['year'] = dt['first_air_date'].fillna('').str[:4].apply(lambda x: int(x) if x.isdigit() else 0)

def lookup(title, year=None):
    q = title.lower().strip()
    candidates = []
    
    # search movie
    m = dm[
        dm['title'].fillna('').str.lower().eq(q) |
        dm['original_title'].fillna('').str.lower().eq(q) |
        dm['title_en'].fillna('').str.lower().eq(q)
    ]
    if year:
        m = m[m['year'].between(year - 1, year + 1)]
    for _, r in m.iterrows():
        c = json.loads(r['production_countries']) if pd.notna(r['production_countries']) else []
        dirs = [d['name'] for d in json.loads(r['directors'])] if pd.notna(r['directors']) else []
        genres = [g['name'].lower() for g in json.loads(r['genres'])] if pd.notna(r['genres']) else []
        candidates.append({'found': True, 'type': 'movie', 'id': int(r['id']), 'title': r['title'], 'orig_title': r['original_title'], 'year': int(r['year']), 'lang': r['original_language'], 'countries': c, 'directors': dirs, 'genres': genres})

    # search tv
    t = dt[
        dt['name'].fillna('').str.lower().eq(q) |
        dt['original_name'].fillna('').str.lower().eq(q) |
        dt['name_en'].fillna('').str.lower().eq(q)
    ]
    if year:
        t = t[t['year'].between(year - 1, year + 1)]
    for _, r in t.iterrows():
        c = json.loads(r['production_countries']) if pd.notna(r['production_countries']) else []
        dirs = [d['name'] for d in json.loads(r['created_by'])] if pd.notna(r['created_by']) else []
        genres = [g['name'].lower() for g in json.loads(r['genres'])] if pd.notna(r['genres']) else []
        candidates.append({'found': True, 'type': 'tv', 'id': int(r['id']), 'title': r['name'], 'orig_title': r['original_name'], 'year': int(r['year']), 'lang': r['original_language'], 'countries': c, 'directors': dirs, 'genres': genres})

    if not candidates:
        return {'found': False}
    
    # filter out documentaries if non-documentaries exist
    non_docs = [cand for cand in candidates if 'documentary' not in cand['genres']]
    if non_docs:
        candidates = non_docs
        
    # pick closest year
    if year:
        candidates.sort(key=lambda c: abs(c['year'] - year))
    return candidates[0]

# Read candidates
with open('.scratch/test_candidates.json', encoding='utf-8') as f:
    data = json.load(f)

with open('.scratch/banco-casi/semi-07.json', encoding='utf-8') as f:
    semi = json.load(f)

expected_keys = [s['key'] for s in semi]
actual_keys = [d['seed'] for d in data]

print(f"Number of seeds: {len(data)} (expected {len(expected_keys)})")
assert actual_keys == expected_keys, f"Seed keys mismatch! {actual_keys} vs {expected_keys}"

all_titles = []
errors = []

for i, seed_obj in enumerate(data):
    s_key = seed_obj['seed']
    suggs = seed_obj['suggerimenti']
    if len(suggs) != 20:
        errors.append(f"Seed {s_key} has {len(suggs)} suggestions, expected 20!")
    
    decades = set()
    non_english = 0
    country_counts = collections.Counter()
    
    # lookup seed info
    s_kind, s_id = s_key.split(':')
    s_id = int(s_id)
    s_df = dm if s_kind == 'movie' else dt
    s_row = s_df[s_df['id'] == s_id].iloc[0]
    s_dirs = [d['name'] for d in json.loads(s_row['directors' if s_kind == 'movie' else 'created_by'])] if pd.notna(s_row.get('directors' if s_kind == 'movie' else 'created_by')) else []
    
    same_dir_count = 0
    
    for item in suggs:
        t = item['titolo']
        y = item['anno']
        p = item['perche']
        
        words = len(p.strip().split())
        if words > 12:
            errors.append(f"Seed {s_key} title '{t}': perche has {words} words (> 12) -> '{p}'")
            
        all_titles.append((t, y, s_key))
        decades.add(y // 10 * 10)
        
        # lookup
        info = lookup(t, y)
        if not info['found']:
            errors.append(f"Seed {s_key}: Title NOT found in TMDB: '{t}' ({y})")
        else:
            if 'documentary' in info['genres']:
                errors.append(f"Seed {s_key}: Title '{t}' is a DOCUMENTARY!")
            if info['lang'] != 'en':
                non_english += 1
            # primary country
            c = info['countries'][0] if info['countries'] else ('US' if info['lang'] == 'en' else 'OTHER')
            country_counts[c] += 1
            
            # check directors
            for d in info['directors']:
                if d in s_dirs:
                    same_dir_count += 1
                    print(f"Seed {s_key} shares director {d} with suggestion '{t}'")
                    
    if len(decades) < 4:
        errors.append(f"Seed {s_key} has only {len(decades)} decades: {sorted(decades)}")
    if non_english < 3:
        errors.append(f"Seed {s_key} has only {non_english} non-English titles ({non_english} < 3)")
    for c, cnt in country_counts.items():
        if cnt > 6:
            errors.append(f"Seed {s_key} has {cnt} titles from country '{c}' (> 6) -> breakdown: {dict(country_counts)}")
    if same_dir_count > 1:
        errors.append(f"Seed {s_key} has {same_dir_count} titles sharing director with seed (> 1)")

# Check total repeats across whole file
title_counter = collections.Counter([t[0].lower() for t in all_titles])
repeats = {k: v for k, v in title_counter.items() if v > 1}
if len(repeats) > 4:
    errors.append(f"Too many repeated titles across seeds ({len(repeats)}): {repeats}")
else:
    print(f"Repeats across file: {len(repeats)} ({repeats})")

if errors:
    print("\n--- ERRORS FOUND ---")
    for e in errors:
        print("ERROR:", e)
else:
    print("\nALL AUTOMATED CHECKS PASSED PERFECTLY!")
