import sys
sys.path.insert(0, '.')
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

def find_in_canon(query):
    query_norm = ing.norm(query)
    found = []
    for k in chiavi:
        if query_norm in k:
            for r in idx[k]:
                key = B['keys'][r]
                tipo, sid = key.split(':')
                sid = int(sid)
                if tipo == 'movie' and sid in movies.index:
                    row = movies.loc[sid]
                    found.append((key, row['title'], row['original_title'], B['year'][r], row['original_language'], row['production_countries']))
                elif tipo == 'tv' and sid in tv.index:
                    row = tv.loc[sid]
                    found.append((key, row['name'], row['original_name'], B['year'][r], row['original_language'], row['production_countries']))
    return found[:10]

if __name__ == '__main__':
    q = sys.argv[1] if len(sys.argv) > 1 else 'Korean'
    for item in find_in_canon(q):
        print(item)
