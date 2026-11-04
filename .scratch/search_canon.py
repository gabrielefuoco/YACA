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

def search_title(query):
    query_norm = ing.norm(query)
    results = []
    cand_keys = set()
    for k in chiavi:
        if query_norm in k:
            for r in idx[k]:
                cand_keys.add(B['keys'][r])
    for k in cand_keys:
        tipo, sid = k.split(':')
        sid = int(sid)
        if tipo == 'movie' and sid in movies.index:
            r = movies.loc[sid]
            y = int(str(r.get('release_date'))[:4]) if str(r.get('release_date'))[:4].isdigit() else 0
            results.append((k, r.get('title'), r.get('original_title'), y, r.get('original_language'), r.get('production_countries'), r.get('vote_count')))
        elif tipo == 'tv' and sid in tv.index:
            r = tv.loc[sid]
            y = int(str(r.get('first_air_date'))[:4]) if str(r.get('first_air_date'))[:4].isdigit() else 0
            results.append((k, r.get('name'), r.get('original_name'), y, r.get('original_language'), r.get('production_countries'), r.get('vote_count')))
    results.sort(key=lambda x: x[6] if pd.notna(x[6]) else 0, reverse=True)
    return results[:15]

if __name__ == '__main__':
    q = sys.argv[1] if len(sys.argv) > 1 else 'Ratatouille'
    for res in search_title(q):
        print(res)
