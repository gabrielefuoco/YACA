import sys
sys.path.insert(0, '.')
import json
import re
from collections import Counter, defaultdict
import pandas as pd
import importlib.util

spec = importlib.util.spec_from_file_location('ingestione', '.scratch/banco-casi/ingestione.py')
ing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ing)

from services.graph_dense import config as C, data as D

def load_catalog_meta():
    movies = pd.read_parquet(C.TMDB / 'movies.parquet').set_index('id')
    tv = pd.read_parquet(C.TMDB / 'tv.parquet').set_index('id')
    return movies, tv

def get_meta(key, movies, tv):
    tipo, sid = key.split(':')
    sid = int(sid)
    if tipo == 'movie' and sid in movies.index:
        r = movies.loc[sid]
        # directors
        dirs = []
        if isinstance(r.get('directors'), str):
            try:
                dirs = [d.get('name') for d in json.loads(r['directors']) if d.get('name')]
            except:
                pass
        countries = []
        if isinstance(r.get('production_countries'), str):
            try:
                countries = json.loads(r['production_countries'])
            except:
                pass
        genres = []
        if isinstance(r.get('genres'), str):
            try:
                genres = [g.get('name') for g in json.loads(r['genres']) if g.get('name')]
            except:
                pass
        coll = r.get('collection_name')
        coll = str(coll) if pd.notna(coll) else None
        return {
            'type': 'movie',
            'title': r.get('title'),
            'original_title': r.get('original_title'),
            'year': int(str(r.get('release_date'))[:4]) if str(r.get('release_date'))[:4].isdigit() else 0,
            'lang': r.get('original_language'),
            'directors': dirs,
            'countries': countries,
            'genres': genres,
            'collection': coll
        }
    elif tipo == 'tv' and sid in tv.index:
        r = tv.loc[sid]
        dirs = []
        if isinstance(r.get('created_by'), str):
            try:
                dirs = [d.get('name') for d in json.loads(r['created_by']) if d.get('name')]
            except:
                pass
        countries = []
        if isinstance(r.get('production_countries'), str):
            try:
                countries = json.loads(r['production_countries'])
            except:
                pass
        genres = []
        if isinstance(r.get('genres'), str):
            try:
                genres = [g.get('name') for g in json.loads(r['genres']) if g.get('name')]
            except:
                pass
        return {
            'type': 'tv',
            'title': r.get('name'),
            'original_title': r.get('original_name'),
            'year': int(str(r.get('first_air_date'))[:4]) if str(r.get('first_air_date'))[:4].isdigit() else 0,
            'lang': r.get('original_language'),
            'directors': dirs,
            'countries': countries,
            'genres': genres,
            'collection': None
        }
    return None

def validate_file(path_str):
    B = D.basic()
    Y, KEYS = B['year'], B['keys']
    idx = ing.indice(B)
    chiavi = sorted(idx)
    movies, tv = load_catalog_meta()

    with open(path_str, encoding='utf-8') as f:
        data = json.load(f)

    with open('.scratch/banco-casi/semi-08.json', encoding='utf-8') as f:
        semi_raw = json.load(f)

    errors = []
    warnings = []

    if len(data) != len(semi_raw):
        errors.append(f"Expected {len(semi_raw)} seeds, got {len(data)}")

    all_suggested_keys = Counter()

    for idx_s, (seed_item, target_seed) in enumerate(zip(data, semi_raw)):
        seed_key = seed_item.get('seed')
        expected_key = target_seed['key']
        if seed_key != expected_key:
            errors.append(f"Seed #{idx_s} key mismatch: got {seed_key}, expected {expected_key}")

        seed_meta = get_meta(seed_key, movies, tv)
        if not seed_meta:
            errors.append(f"Seed {seed_key} not found in metadata!")
            continue

        suggs = seed_item.get('suggerimenti', [])
        if len(suggs) != 20:
            errors.append(f"Seed {seed_key} has {len(suggs)} suggestions instead of 20")

        seed_directors = set(seed_meta['directors'])
        same_director_count = 0
        decades = set()
        non_english_count = 0
        country_counts = Counter()

        for idx_g, sug in enumerate(suggs):
            t = sug.get('titolo')
            y = sug.get('anno')
            p = sug.get('perche')

            if not t or not isinstance(y, int) or not p:
                errors.append(f"Seed {seed_key} sug #{idx_g} missing required fields: {sug}")
                continue

            words = p.strip().split()
            if len(words) > 12:
                errors.append(f"Seed {seed_key} sug #{idx_g} 'perche' exceeds 12 words ({len(words)}): {p}")

            r, stato = ing.aggancia(t, y, idx, chiavi, Y, 0.82)
            if r is None:
                errors.append(f"Seed {seed_key} sug #{idx_g} '{t} ({y})' failed to match canon: stato={stato}")
                continue
            
            sug_key = KEYS[r]
            if sug_key == seed_key:
                errors.append(f"Seed {seed_key} sug #{idx_g} '{t}' is the seed itself!")

            all_suggested_keys[sug_key] += 1

            sug_meta = get_meta(sug_key, movies, tv)
            if not sug_meta:
                warnings.append(f"Sug {sug_key} has no metadata")
                continue

            # check documentary
            if 'Documentary' in sug_meta['genres']:
                errors.append(f"Seed {seed_key} sug #{idx_g} '{t}' is a documentary!")

            # check same director
            sug_dirs = set(sug_meta['directors'])
            shared_dirs = seed_directors.intersection(sug_dirs)
            if shared_dirs:
                same_director_count += 1
                if same_director_count > 1:
                    errors.append(f"Seed {seed_key} has multiple suggestions sharing director {shared_dirs}: '{t}'")

            # check collection / franchise
            if seed_meta.get('collection') and sug_meta.get('collection') and seed_meta['collection'] == sug_meta['collection']:
                errors.append(f"Seed {seed_key} sug '{t}' is in same collection {seed_meta['collection']}")

            # decade
            sug_year = sug_meta['year'] or y
            decade = (sug_year // 10) * 10
            decades.add(decade)

            # non-english
            lang = sug_meta['lang']
            if lang and lang != 'en':
                non_english_count += 1

            # country
            c_list = sug_meta['countries']
            if c_list:
                prim_c = c_list[0]
                country_counts[prim_c] += 1
            else:
                country_counts['UNKNOWN'] += 1

        if len(decades) < 4:
            errors.append(f"Seed {seed_key} has only {len(decades)} decades ({decades}), needed >= 4")
        if non_english_count < 3:
            errors.append(f"Seed {seed_key} has only {non_english_count} non-English titles, needed >= 3")
        for c, count in country_counts.items():
            if count > 6:
                errors.append(f"Seed {seed_key} has {count} titles from country {c} (max 6 allowed)")

    # across whole file:
    repeats = {k: v for k, v in all_suggested_keys.items() if v > 1}
    print(f"Total distinct suggested titles: {len(all_suggested_keys)}")
    print(f"Titles repeating across seeds: {len(repeats)} (max 4 allowed)")
    if len(repeats) > 4:
        errors.append(f"Too many repeating titles across seeds: {len(repeats)} > 4 ({repeats})")

    print(f"\n--- Validation summary ---")
    if errors:
        print(f"FAILED with {len(errors)} errors:")
        for e in errors[:30]:
            print("  ERROR:", e)
        if len(errors) > 30:
            print(f"  ... and {len(errors) - 30} more errors")
        return False
    else:
        print("ALL CHECKS PASSED PERFECTLY!")
        return True

if __name__ == '__main__':
    if len(sys.argv) > 1:
        validate_file(sys.argv[1])
    else:
        print("Usage: py validate_risposte.py <path_to_json>")
