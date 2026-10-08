import pathlib, numpy as np
from collections import Counter
ROOT = pathlib.Path(__file__).resolve().parents[2]
g = np.load(ROOT / ".cache/movielens/film-graph.npz", allow_pickle=True)
member, types = g["member"], g["types"]
mix = {}
for cl, t in zip(member.tolist(), types.tolist()):
    d = mix.setdefault(cl, {"movie": 0, "tv": 0})
    d[t] += 1
tot_f = int((types == "movie").sum()); tot_t = int((types == "tv").sum())
pure_f = sum(1 for d in mix.values() if d["tv"] == 0)
pure_t = sum(1 for d in mix.values() if d["movie"] == 0)
both = sum(1 for d in mix.values() if d["movie"] > 5 and d["tv"] > 5)
print(f"cluster: {len(mix)} · solo film {pure_f} · solo serie {pure_t} · misti (>5 e >5) {both}")
print(f"film {tot_f:,} · serie {tot_t:,}")
# dove finiscono le serie rispetto ai film: cluster dei primi 500 film più votati?
print("\ncluster misti (se ce ne sono):")
for cl, d in sorted(mix.items(), key=lambda kv: -min(kv[1]['movie'], kv[1]['tv']))[:5]:
    print(f"  cluster {cl}: {d['movie']} film · {d['tv']} serie")
# verifica della causa: distribuzione degli embedding dei film (teacher) vs serie (predetti)
P = g["embeddings"]
cos_mm = float(np.mean([float(P[i] @ P[j]) for i, j in zip(np.where(types=='movie')[0][:2000], np.where(types=='movie')[0][1:2001])]))
i_tv = np.where(types == "tv")[0][:800]
i_mv = np.where(types == "movie")[0][:800]
cross = float(np.mean([float(P[i] @ P[j]) for i in i_tv for j in i_mv[::40]]))
print(f"\ncoseno medio film-film {cos_mm:.3f} · film-serie {cross:.3f} (distanza fra le due popolazioni)")
