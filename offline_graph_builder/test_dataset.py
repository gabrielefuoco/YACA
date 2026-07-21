import pandas as pd
import json

df = pd.read_csv('c:/Users/gabri/APP/Streaming/YACA/TMDB_movie_dataset_v11.csv', usecols=['keywords'])
df = df.dropna(subset=['keywords'])

# Le keywords nel dataset TMDB_movie_dataset_v11 sono stringhe o ID?
# Nel codice di build_graph.py: kws = [k.strip().lower() for k in row.split(',') if k.strip()]
# Questo indica che nel dataset CSV le keywords sono le STRINGHE dei nomi, non gli ID numerici!!!

# Cerchiamo la parola anime
anime_count = 0
for row in df['keywords']:
    kws = [k.strip().lower() for k in row.split(',') if k.strip()]
    if 'anime' in kws:
        anime_count += 1

print(f"Movies with 'anime' keyword (string): {anime_count}")
print(f"Sample of a row keywords: {df['keywords'].iloc[0]}")
