"""scaffold-rinforzo.py — IL RINFORZO MIRATO: quali film di nicchia hanno bisogno di piu' liste.
Il tetto ha detto che il 55% dei legami e' irraggiungibile perche' il bersaglio compare in UNA sola
lista. Qui si trovano i bersagli a grado 1-2 (solo dal TRAIN, mai dal test: sarebbe contaminazione)
e per ognuno si propongono le SERIE che potrebbero legittimamente linkarlo."""
import json, pathlib
from collections import Counter, defaultdict
import numpy as np
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
G = ROOT/".scratch"/"ml-collaborativo"/"gold"
d = json.loads((G/"cross-merged.json").read_text(encoding="utf-8"))
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
is_tv = (tipo == "tv")
def centra(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0); Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
Pc2 = centra(Pc)
src = d["sources"]
train = [s for i, s in enumerate(src) if i % 2 == 0]        # SOLO il train
# chi linka cosa, nel train
chi_lo_linka = defaultdict(set)
for s in train:
    for l in s["links"]: chi_lo_linka[l["id"]].add(s["id"])
# le serie del train e i loro vettori
serie_train = [s["id"] for s in train if s["id"] in row_of]
M = np.array([Pc2[row_of[k]] for k in serie_train])
M = M / (np.linalg.norm(M, axis=1, keepdims=True) + 1e-9)
titoli = {}
try:
    import pandas as pd
    mv = pd.read_parquet(ROOT/".cache"/"tmdb"/"movies.parquet", columns=["id","title"])
    tv = pd.read_parquet(ROOT/".cache"/"tmdb"/"tv.parquet", columns=["id","name"])
    for i, t in zip(mv["id"], mv["title"]): titoli[f"movie:{int(i)}"] = str(t)
    for i, t in zip(tv["id"], tv["name"]): titoli[f"tv:{int(i)}"] = str(t)
except Exception: pass
nicchia = [(k, len(v)) for k, v in chi_lo_linka.items() if 1 <= len(v) <= 2]
nicchia.sort(key=lambda x: (x[1], x[0]))
print(f"serie nel train: {len(serie_train)} · titoli linkati: {len(chi_lo_linka):,}")
print(f"BERSAGLI DI NICCHIA (grado 1-2 nel train): {len(nicchia):,}")
print(f"  grado 1: {sum(1 for _,g in nicchia if g==1):,} · grado 2: {sum(1 for _,g in nicchia if g==2):,}")
out = []
for k, g in nicchia:
    r = row_of.get(k)
    if r is None: continue
    v = Pc2[r]
    sim = M @ v
    idx = np.argsort(-sim)[:12]
    cand = [serie_train[i] for i in idx if serie_train[i] not in chi_lo_linka[k]][:8]
    out.append({"id": k, "titolo": titoli.get(k, "?"), "grado": g,
                "linkato_da": sorted(chi_lo_linka[k]),
                "serie_candidate": [{"id": c, "titolo": titoli.get(c, "?"), "sim": round(float(sim[serie_train.index(c)]), 3)} for c in cand]})
P = G/"rinforzo.json"
P.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"\nscritto: {P} ({len(out):,} bersagli)")
print("\nesempi (i primi 3):")
for e in out[:3]:
    print(f"  {e['id']} {e['titolo']} (grado {e['grado']}, linkato da {e['linkato_da']})")
    print("     candidate:", ", ".join(f"{c['titolo']}({c['sim']})" for c in e["serie_candidate"][:5]))
