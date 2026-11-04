import pandas as pd
import json

m_df = pd.read_parquet('.cache/tmdb/movies.parquet')
t_df = pd.read_parquet('.cache/tmdb/tv.parquet')

def search_movies(q):
    sub = m_df[
        m_df.title.str.contains(q, case=False, na=False) |
        m_df.title_en.str.contains(q, case=False, na=False) |
        m_df.original_title.str.contains(q, case=False, na=False)
    ]
    print(f"=== MOVIES for '{q}' ({len(sub)} matches) ===")
    for _, r in sub.head(5).iterrows():
        print(f"  id: {r.id} | title: {r.title} | title_en: {r.title_en} | orig: {r.original_title} | date: {r.release_date} | lang: {r.original_language} | countries: {r.production_countries}")

def search_tv(q):
    sub = t_df[
        t_df.name.str.contains(q, case=False, na=False) |
        t_df.name_en.str.contains(q, case=False, na=False) |
        t_df.original_name.str.contains(q, case=False, na=False)
    ]
    print(f"=== TV for '{q}' ({len(sub)} matches) ===")
    for _, r in sub.head(5).iterrows():
        print(f"  id: {r.id} | name: {r.name} | name_en: {r.name_en} | orig: {r.original_name} | date: {r.first_air_date} | lang: {r.original_language} | countries: {r.production_countries}")

for q in ['Baahubali', 'Dhoom', 'Nausicaa', 'Grave of the Fireflies', 'House', 'Devdas', 'Ram-Leela', 'Riki-Oh', 'Kisaragi', 'Scene at the Sea', 'Lemonade Joe']:
    search_movies(q)

for q in ['Attack on Titan', 'Kingdom', 'Skins', 'Happy Valley']:
    search_tv(q)
