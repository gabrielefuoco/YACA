import json, pathlib, numpy as np, pandas as pd
from collections import Counter
ROOT = pathlib.Path(__file__).resolve().parents[2]
g = np.load(ROOT / ".cache/movielens/film-graph.npz", allow_pickle=True)
member, ids, types = g["member"], g["ids"], g["types"]
row_of = {(str(t), int(i)): k for k, (t, i) in enumerate(zip(types, ids))}
m = pd.read_parquet(ROOT / ".cache/tmdb/movies.parquet", columns=["id", "title"])
t = pd.read_parquet(ROOT / ".cache/tmdb/tv.parquet", columns=["id", "name"])
title = {}
for r in m.itertuples(): title[("movie", int(r.id))] = r.title
for r in t.itertuples(): title[("tv", int(r.id))] = r.name
hist = json.loads((ROOT / ".cache/movielens/histories.json").read_text())
cl_of = {}
for k, cl in enumerate(member): cl_of[k] = int(cl)
cl_sizes = Counter(member.tolist())
for ctx in ["global", "0465f104", "3f2f4afd"]:
    print(f"\n### {ctx}")
    for kind in ["movie", "tv"]:
        items = [x for x in hist[ctx].get(kind, []) if (kind, int(x)) in row_of]
        print(f"  {kind}: {len(items)} titoli")
        for x in items:
            k = row_of[(kind, int(x))]
            print(f"    [{cl_of[k]:>3}] {title.get((kind, int(x)), '?')[:52]:<52} cluster da {cl_sizes[cl_of[k]]} titoli")
