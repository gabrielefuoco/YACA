import pandas as pd
from collections import Counter

df = pd.read_csv('../TMDB_movie_dataset_v11.csv', usecols=['keywords'])
df = df.dropna()

nsfw_substrings = ['sex', 'porn', 'erotic', 'nude', 'nudity', 'rape', 'incest', 'masturbation', 'vibrator', 'dildo', 'bdsm', 'fetish', 'orgasm']

nsfw_keywords = Counter()
for row in df['keywords']:
    kws = [k.strip().lower() for k in row.split(',') if k.strip()]
    for kw in kws:
        if any(sub in kw for sub in nsfw_substrings):
            nsfw_keywords[kw] += 1

print(f"Trovate {len(nsfw_keywords)} keyword NSFW uniche.")
for kw, count in nsfw_keywords.most_common(50):
    if count >= 15:  # La nostra soglia
        print(f"{kw}: {count}")
