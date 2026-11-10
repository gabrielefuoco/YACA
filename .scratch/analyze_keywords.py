import sys
sys.path.insert(0, 'services')
import pandas as pd
import json
from collections import Counter
from graph import canon as K

keys, row_of, n, is_tv = K.titoli()
df_m = pd.read_parquet('.cache/tmdb/movies.parquet', columns=['id', 'keywords'])
df_tv = pd.read_parquet('.cache/tmdb/tv.parquet', columns=['id', 'keywords'])

canon_m = {int(k.split(':')[1]) for k in keys if k.startswith('movie:')}
canon_tv = {int(k.split(':')[1]) for k in keys if k.startswith('tv:')}

kw_counter = Counter()

for df, c_set in [(df_m, canon_m), (df_tv, canon_tv)]:
    for _, row in df[df['id'].isin(c_set)].iterrows():
        raw = row['keywords']
        if raw and isinstance(raw, str):
            try:
                items = json.loads(raw)
                for item in items:
                    name = item.get('name')
                    if name:
                        kw_counter[name.lower().strip()] += 1
            except Exception:
                pass

print(f"Total unique keywords in canon: {len(kw_counter)}")
print("Top 50 keywords:")
for kw, count in kw_counter.most_common(50):
    print(f"  {kw}: {count}")

# Check specific terms
search_terms = [
    'dark', 'bleak', 'grim', 'grief', 'suicide', 'tragedy', 'murder', 'serial killer',
    'depression', 'torture', 'horror', 'dystopia', 'nihilism', 'brutal', 'trauma',
    'lighthearted', 'heartwarming', 'comedy', 'feel-good', 'wholesome', 'humor', 'sitcom',
    'friendship', 'holiday', 'christmas', 'family', 'romance', 'optimistic', 'cheerful',
    'philosophical', 'existential', 'slow cinema', 'non-linear', 'psychological', 'allegory',
    'mindfuck', 'surreal', 'arthouse', 'complex', 'epic', 'meditative', 'moral ambiguity',
    'popcorn', 'action hero', 'explosion', 'car chase', 'formulaic', 'slapstick', 'superhero'
]

print("\nSpecific keyword frequencies:")
for term in search_terms:
    matches = [(k, c) for k, c in kw_counter.items() if term in k]
    matches.sort(key=lambda x: -x[1])
    top_m = matches[:5]
    print(f"  [{term}]: {sum(c for _, c in matches)} total matches -> {top_m}")
