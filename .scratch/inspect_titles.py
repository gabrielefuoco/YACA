import pandas as pd
import json

df_m = pd.read_parquet('.cache/tmdb/movies.parquet', columns=['id', 'title', 'keywords', 'overview', 'runtime', 'vote_average', 'vote_count'])
df_tv = pd.read_parquet('.cache/tmdb/tv.parquet', columns=['id', 'name', 'keywords', 'overview', 'runtime', 'vote_average', 'vote_count', 'number_of_episodes'])

for mid in [920, 3175, 4108, 496243, 508]:
    sub = df_m[df_m['id'] == mid]
    if not sub.empty:
        r = sub.iloc[0]
        kws = [x['name'] for x in json.loads(r['keywords'])] if r['keywords'] else []
        print(f"=== MOVIE {mid}: {r['title']} ===")
        print(f"  Runtime: {r['runtime']} | VoteAvg: {r['vote_average']} | VoteCount: {r['vote_count']}")
        print(f"  Keywords: {kws}")
        print(f"  Overview: {str(r['overview'])[:150]}")

sub = df_tv[df_tv['id'] == 136315]
if not sub.empty:
    r = sub.iloc[0]
    kws = [x['name'] for x in json.loads(r['keywords'])] if r['keywords'] else []
    print(f"=== TV 136315: {r['name']} ===")
    print(f"  Episodes: {r['number_of_episodes']} | Runtime: {r['runtime']} | VoteAvg: {r['vote_average']}")
    print(f"  Keywords: {kws}")
    print(f"  Overview: {str(r['overview'])[:150]}")
