import sys
sys.path.insert(0, '.')
import json
import pandas as pd
from services.graph_dense import config as C

semi = json.loads(open('.scratch/banco-casi/semi-08.json', encoding='utf-8').read())
movies = pd.read_parquet(C.TMDB / 'movies.parquet').set_index('id')
tv = pd.read_parquet(C.TMDB / 'tv.parquet').set_index('id')

for s in semi:
    k = s['key']
    tipo, sid = k.split(':')
    sid = int(sid)
    if tipo == 'movie' and sid in movies.index:
        row = movies.loc[sid]
        print(f"{k}: {row['title']} ({row['original_title']}) | year: {s['anno']} | dir: {row.get('directors')} | countries: {row.get('production_countries')} | coll: {row.get('collection_name')}")
    elif tipo == 'tv' and sid in tv.index:
        row = tv.loc[sid]
        print(f"{k}: {row['name']} ({row['original_name']}) | year: {s['anno']} | created_by: {row.get('created_by')} | countries: {row.get('production_countries')}")
    else:
        print(f"{k}: NOT FOUND in parquet! {s}")
