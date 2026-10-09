"""
test-film-trakt.py — LO STESSO STRUMENTO DELLE SERIE, SUI FILM.
Verita' esterna: i "related" di Trakt per 150 film (comportamento aggregato della base utenti Trakt,
non il co-watch rumoroso dello split-half). Studente e soffitto valutati SULLO STESSO insieme di
candidati (i 49.070 film con metadati), cosi' il confronto e' onesto.
Uso: python .scratch/ml-collaborativo/test-film-trakt.py
"""
import json, pathlib
import numpy as np, pandas as pd
ROOT = pathlib.Path(__file__).resolve().parents[2]
ML, PQ = ROOT/".cache"/"movielens", ROOT/".cache"/"tmdb"
KS = (10, 20, 50)
z = np.load(ML/"studente-film-pos.npz")
P, tmdb_ids = z["P"], z["tmdb"]
row_of = {int(t): i for i, t in enumerate(tmdb_ids)}
print(f"studente: {P.shape[0]:,} film x {P.shape[1]}")
# il soffitto: le coordinate VERE, ristrette allo stesso insieme di film e allo stesso ordine
zt = np.load(ML/"teacher-A-half.npz"); ZA = zt["ZA"]
links = pd.read_csv(ML/"ml-32m"/"links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId":"int64","movieId":"int64"})
mid2tmdb = dict(zip(links["movieId"], links["tmdbId"]))
tmdb2mid = dict(zip(links["tmdbId"], links["movieId"]))
_r = pd.read_csv(ML/"ml-32m"/"ratings.csv", usecols=["movieId"], dtype="int32")
mids = np.array(sorted(set(_r["movieId"].unique().tolist()) & set(mid2tmdb.keys())))
assert len(mids) == ZA.shape[0], (len(mids), ZA.shape)
print(f"mids ricostruiti e coerenti con ZA: {len(mids):,}")
row_of_mid = {int(m): i for i, m in enumerate(mids)}
Zsub = np.zeros_like(P)
ok = 0
for i, t in enumerate(tmdb_ids):
    mid = tmdb2mid.get(int(t))                      # tmdbId -> movieId -> riga del teacher
    j = row_of_mid.get(int(mid)) if mid is not None else None
    if j is not None:
        Zsub[i] = ZA[j]; ok += 1
Zsub /= (np.linalg.norm(Zsub, axis=1, keepdims=True) + 1e-9)
print(f"soffitto allineato: {ok:,} film su {len(tmdb_ids):,}")
# mappa imdb -> tmdb per la verita'
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id", "imdb_id"])
imdb_of = {str(im): int(i) for i, im in zip(mv["id"], mv["imdb_id"]) if im}
samples = json.loads((ROOT/".cache"/"trakt"/"related-movies-150.json").read_text(encoding="utf-8"))
rng = np.random.default_rng(20261008)
agg = {k: dict(stu=0.0, ceil=0.0, ctrl=0.0, rel=0, tot=0) for k in KS}
used = 0
for s in samples:
    src = row_of.get(imdb_of.get(str(s["imdb"]), -1))
    if src is None: continue
    rel = set()
    for r in s["related"]:
        t = r["ids"].get("tmdb") or imdb_of.get(str(r["ids"].get("imdb")))
        if t and int(t) in row_of and row_of[int(t)] != src: rel.add(row_of[int(t)])
    if len(rel) < 3: continue
    used += 1
    for k in KS:
        o = [i for i in np.argsort(-(P @ P[src])) if i != src][:k]
        agg[k]["stu"] += sum(1 for x in o if x in rel)/len(rel)
        oc = [i for i in np.argsort(-(Zsub @ Zsub[src])) if i != src][:k]
        agg[k]["ceil"] += sum(1 for x in oc if x in rel)/len(rel)
        rc = rng.choice(len(tmdb_ids), size=k, replace=False)
        agg[k]["ctrl"] += sum(1 for x in rc if x in rel)/len(rel)
        agg[k]["rel"] += len(rel); agg[k]["tot"] += 1
print(f"\nfilm usati: {used} · related per film (mediana): {int(np.median([a['rel']/max(1,a['tot']) for a in agg.values()]))}")
print("\n| k | STUDENTE (film) | SOFFITTO (coordinate vere) | controllo | quota del soffitto |  | SERIE (stesso strumento) |")
print("|---|---|---|---|---|---|---|")
SER = {10: 15.0, 20: 22.0, 50: 34.2}
for k in KS:
    a = agg[k]
    if not a["tot"]: continue
    s_, c_, ct = a["stu"]/a["tot"], a["ceil"]/a["tot"], a["ctrl"]/a["tot"]
    print(f"| {k} | **{100*s_:.1f}%** | {100*c_:.1f}% | {100*ct:.1f}% | {100*s_/max(1e-9,c_):.0f}% |  | {SER[k]:.1f}% |")
