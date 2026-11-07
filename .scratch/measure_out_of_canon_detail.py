import json
from pathlib import Path
import pandas as pd
from graph.runtime import Engine

engine = Engine.carica_transizione('services/graph/data/v45-transizione/transizione-pota16.npz')
tk = Path('.cache/trakt/users')
m = json.loads((tk / 'movie-castoffcrown.json').read_text(encoding='utf-8'))
s = json.loads((tk / 'show-castoffcrown.json').read_text(encoding='utf-8'))

out_m = [v for v in m if v['movie']['ids'].get('tmdb') and f"movie:{v['movie']['ids']['tmdb']}" not in engine.row_of]
out_s = [v for v in s if v['show']['ids'].get('tmdb') and f"tv:{v['show']['ids']['tmdb']}" not in engine.row_of]
print(f"Total out-of-canon with TMDB ID: {len(out_m)} movies + {len(out_s)} shows = {len(out_m) + len(out_s)}")

df_m = pd.read_parquet('.cache/tmdb/movies.parquet')
df_t = pd.read_parquet('.cache/tmdb/tv.parquet')

m_dict = df_m.set_index('id').to_dict(orient='index')
t_dict = df_t.set_index('id').to_dict(orient='index')

# Analyze movies
m_missing = []
m_present = []
for item in out_m:
    tid = item['movie']['ids']['tmdb']
    title = item['movie']['title']
    year = item['movie'].get('year')
    if tid in m_dict:
        row = m_dict[tid]
        vc = row.get('vote_count', 0)
        pop = row.get('popularity', 0.0)
        m_present.append({'id': tid, 'title': title, 'year': year, 'vote_count': vc, 'popularity': pop, 'medium': 'movie'})
    else:
        m_missing.append({'id': tid, 'title': title, 'year': year, 'medium': 'movie'})

# Analyze shows
s_missing = []
s_present = []
for item in out_s:
    tid = item['show']['ids']['tmdb']
    title = item['show']['title']
    year = item['show'].get('year')
    if tid in t_dict:
        row = t_dict[tid]
        vc = row.get('vote_count', 0)
        pop = row.get('popularity', 0.0)
        s_present.append({'id': tid, 'title': title, 'year': year, 'vote_count': vc, 'popularity': pop, 'medium': 'tv'})
    else:
        s_missing.append({'id': tid, 'title': title, 'year': year, 'medium': 'tv'})

print(f"\n--- MOVIES ({len(out_m)}) ---")
print(f"Missing from movies.parquet: {len(m_missing)}")
print(f"Present in movies.parquet (but excluded from canon): {len(m_present)}")

print(f"\n--- SHOWS ({len(out_s)}) ---")
print(f"Missing from tv.parquet: {len(s_missing)}")
print(f"Present in tv.parquet (but excluded from canon): {len(s_present)}")

total_missing = len(m_missing) + len(s_missing)
total_present = len(m_present) + len(s_present)
print(f"\n--- TOTAL 180 ---")
print(f"Missing entirely from parquet: {total_missing}")
print(f"Present in parquet but excluded from canon: {total_present}")

df_present = pd.DataFrame(m_present + s_present)
print("\nVote count summary of present-but-excluded:")
print(df_present['vote_count'].describe())

# Check bands
bins = [-1, 0, 10, 20, 50, 100, 500, 100000]
labels = ['0', '1-10', '11-20', '21-50', '51-100', '101-500', '500+']
df_present['band'] = pd.cut(df_present['vote_count'], bins=bins, labels=labels)
print("\nPresent-but-excluded by vote_count band (all):")
print(df_present['band'].value_counts().sort_index())

print("\nMovies present-but-excluded by vote_count band:")
df_p_m = pd.DataFrame(m_present)
df_p_m['band'] = pd.cut(df_p_m['vote_count'], bins=bins, labels=labels)
print(df_p_m['band'].value_counts().sort_index())

print("\nShows present-but-excluded by vote_count band:")
df_p_s = pd.DataFrame(s_present)
df_p_s['band'] = pd.cut(df_p_s['vote_count'], bins=bins, labels=labels)
print(df_p_s['band'].value_counts().sort_index())

# Sample missing items
print("\nSample missing movies:")
for x in m_missing[:10]:
    print(f"  {x['id']}: {x['title']} ({x['year']})")

print("\nSample missing shows:")
for x in s_missing[:10]:
    print(f"  {x['id']}: {x['title']} ({x['year']})")
