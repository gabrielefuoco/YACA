"""diag-vicini.py — DOVE SI PERDONO I DUE TERZI.
Per i 79 film del test Trakt: a che RANGO finisce ogni correlata nel nostro spazio? E chi occupa la
top-10 (saga? regista? epoca? popolarita')? E' la diagnosi che dice quale leva alzare.
Uso: python .scratch/ml-collaborativo/diag-vicini.py"""
import json, pathlib
import numpy as np, pandas as pd
ROOT = pathlib.Path(__file__).resolve().parents[2]
ML, PQ = ROOT/".cache"/"movielens", ROOT/".cache"/"tmdb"
z = np.load(ML/"studente-film-pos.npz"); P, tmdb_ids = z["P"], z["tmdb"]
row_of = {int(t): i for i, t in enumerate(tmdb_ids)}
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","title","imdb_id","collection_id","directors","release_date","vote_count","genres","keywords"])
meta = {}
for i, t, cid, d, dt, vc, gs, kw in zip(mv["id"], mv["title"], mv["collection_id"], mv["directors"], mv["release_date"], mv["vote_count"], mv["genres"], mv["keywords"]):
    try: gi = tuple(sorted(int(g["id"]) for g in json.loads(gs or "[]")))
    except Exception: gi = ()
    try: ki = frozenset(str(k.get("name","")).lower() for k in json.loads(kw or "[]") if isinstance(k, dict))
    except Exception: ki = frozenset()
    try: di = tuple(int(x["id"]) for x in json.loads(d or "[]") if isinstance(x, dict))
    except Exception: di = ()
    meta[int(i)] = dict(title=t, coll=None if pd.isna(cid) else int(cid), dirs=di, year=int(str(dt)[:4]) if str(dt)[:4].isdigit() else 0,
                        votes=float(vc or 0), genres=gi, kw=ki)
imdb_of = {str(im): int(i) for i, im in zip(mv["id"], mv["imdb_id"]) if im}
samples = json.loads((ROOT/".cache"/"trakt"/"related-movies-150.json").read_text(encoding="utf-8"))
ranks, absent, tot = [], 0, 0
top_coll = top_dir = top_year = top_kw = 0
vc_src, vc_top = [], []
films = 0
for s in samples:
    src = row_of.get(imdb_of.get(str(s["imdb"]), -1))
    if src is None: continue
    m_src = meta.get(int(tmdb_ids[src]))
    if m_src is None: continue
    rel = []
    for r in s["related"]:
        t = r["ids"].get("tmdb") or imdb_of.get(str(r["ids"].get("imdb")))
        if t and int(t) in row_of and row_of[int(t)] != src: rel.append(row_of[int(t)])
    if len(rel) < 3: continue
    films += 1
    sims = P @ P[src]; sims[src] = -9
    order = np.argsort(-sims)
    pos_of = {int(x): i for i, x in enumerate(order)}
    for x in rel:
        tot += 1
        if x in pos_of: ranks.append(pos_of[x])
        else: absent += 1
    for x in order[:10]:
        m = meta.get(int(tmdb_ids[x]))
        if not m: continue
        top_coll += (m["coll"] is not None and m["coll"] == m_src["coll"])
        top_dir += bool(set(m["dirs"]) & set(m_src["dirs"]))
        top_year += (m["year"] and m_src["year"] and abs(m["year"] - m_src["year"]) <= 2)
        top_kw += (len(m["kw"] & m_src["kw"]) >= 2)
        vc_top.append(m["votes"])
    vc_src.append(m_src["votes"])
r = np.array(ranks)
print(f"film analizzati: {films} · correlate totali: {tot} (assenti dal catalogo: {absent})")
print("\n=== A CHE RANGO FINISCONO LE CORRELATE (su 49.070 film) ===")
for thr in (10, 50, 200, 1000, 5000):
    print(f"  entro {thr:>5}: {100*(r < thr).mean():5.1f}%   (mediana del rango: {int(np.median(r)):,})")
print("\n=== CHI OCCUPA LA TOP-10 (su 10 vicini per film) ===")
n = 10 * films
print(f"  stessa SAGA/collezione : {100*top_coll/n:.0f}%")
print(f"  stesso REGISTA          : {100*top_dir/n:.0f}%")
print(f"  anno entro +-2          : {100*top_year/n:.0f}%")
print(f"  >=2 keyword in comune   : {100*top_kw/n:.0f}%")
print(f"\n  voti mediani: film di partenza {int(np.median(vc_src)):,} · suoi 10 vicini {int(np.median(vc_top)):,}")
