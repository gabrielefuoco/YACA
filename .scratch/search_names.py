import sys
sys.path.insert(0, '.')
import pandas as pd
from services.graph_dense import config as C, data as D

movies = pd.read_parquet(C.TMDB / 'movies.parquet')
tv = pd.read_parquet(C.TMDB / 'tv.parquet')

names = ['Kairo', 'Pulse', 'Wonderful Days', 'Tetsuo', 'BarLume', 'Birdman', 'Once', 'Mad Max', 'Extreme Job', 'Eroe borghese', 'Viy', 'Vij', 'Grave']

for name in names:
    print(f"\n--- Search: {name} ---")
    m_sub = movies[movies['title'].str.contains(name, case=False, na=False) | movies['original_title'].str.contains(name, case=False, na=False)]
    t_sub = tv[tv['name'].str.contains(name, case=False, na=False) | tv['original_name'].str.contains(name, case=False, na=False)]
    for _, r in m_sub.head(3).iterrows():
        print(f"M: {r['title']} ({r['original_title']}) {str(r['release_date'])[:4]}")
    for _, r in t_sub.head(3).iterrows():
        print(f"T: {r['name']} ({r['original_name']}) {str(r['first_air_date'])[:4]}")
