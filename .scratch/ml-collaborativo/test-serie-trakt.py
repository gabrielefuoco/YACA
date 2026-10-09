"""
test-serie-trakt.py — LA MIGRAZIONE SULLE SERIE, con una verita' COMPORTAMENTALE esterna.
Per 200 serie sparse sui generi: i "related" di Trakt (chi guarda X guarda anche Y, dalla base utenti
Trakt) finiscono vicini nel NOSTRO spazio? Con controllo casuale e con la raggiungibilita' dichiarata.
Uso: python .scratch/ml-collaborativo/test-serie-trakt.py
"""
import json, pathlib
import numpy as np, pandas as pd
ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE, PQ = ROOT/".cache"/"movielens", ROOT/".cache"/"tmdb"
POS = json.loads((CACHE/"positions.json").read_text())
keys = list(POS.keys()); idx = {k: i for i, k in enumerate(keys)}
M = np.asarray([POS[k] for k in keys], dtype=np.float32)
M /= (np.linalg.norm(M, axis=1, keepdims=True) + 1e-9)
tv = pd.read_parquet(PQ/"tv.parquet", columns=["id","name","imdb_id","tvdb_id"])
key_of = {}
for i, im, tvd in zip(tv["id"], tv["imdb_id"], tv["tvdb_id"]):
    k = f"tv:{int(i)}"
    if k in idx:
        if im: key_of[f"imdb:{im}"] = k
        if tvd: key_of[f"tvdb:{tvd}"] = k
print(f"posizioni: {M.shape[0]:,} · serie mappabili nel catalogo: {len(key_of):,}")
samples = json.loads((CACHE.parent/"trakt"/"related-200.json").read_text(encoding="utf-8"))
rng = np.random.default_rng(20261008)
KS = (10, 20, 50)
agg = {k: dict(hit=0.0, ctrl=0.0, rel=0, reach=0, tot=0) for k in KS}
used = 0
for s in samples:
    src = key_of.get(f"imdb:{s['imdb']}")
    if not src: continue
    rel, miss = [], 0
    for r in s["related"]:
        k = None
        for f in ("imdb", "tvdb"):
            v = r["ids"].get(f)
            if v and f"{f}:{v}" in key_of:
                k = key_of[f"{f}:{v}"]
                break
        if k and k != src: rel.append(k)
        else: miss += 1
    if not rel: continue
    used += 1
    v = M[idx[src]]
    sims = M @ v
    order = [keys[i] for i in np.argsort(-sims) if keys[i] != src]
    relset = set(rel)
    for k in KS:
        agg[k]["hit"] += sum(1 for x in order[:k] if x in relset) / len(relset)
        ctrl = [keys[i] for i in rng.choice(len(keys), size=k, replace=False)]
        agg[k]["ctrl"] += sum(1 for x in ctrl if x in relset) / len(relset)
        agg[k]["rel"] += len(relset); agg[k]["reach"] += len(relset) + miss; agg[k]["tot"] += 1
print(f"\nserie usate nel test: {used} · related per serie: mediana {int(np.median([a['rel']/max(1,a['tot']) for a in agg.values()]))}")
print("\n| k | vicini Trakt trovati nel nostro spazio | controllo (k a caso) | rapporto | raggiungibilita' (related nel nostro catalogo) |")
print("|---|---|---|---|---|")
for k in KS:
    a = agg[k]
    if not a["tot"]: continue
    h = a["hit"]/a["tot"]; c = a["ctrl"]/a["tot"]; r = a["rel"]/max(1, a["reach"])
    print(f"| {k} | **{100*h:.1f}%** dei related | {100*c:.1f}% | {h/max(1e-9,c):.0f}x | {100*r:.0f}% |")
