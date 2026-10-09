"""scaffold-300.py — le 300 serie piu' popolari non ancora fatte + i CANDIDATI per parole chiave.
La macchina fa il recupero (con gli id GIA' RISOLTI), io faccio la curatela: scelgo e scarto."""
import json, pathlib, re, unicodedata
from collections import Counter, defaultdict
import numpy as np, pandas as pd
ROOT = pathlib.Path(".").resolve(); PQ, ML = ROOT/".cache"/"tmdb", ROOT/".cache"/"movielens"
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
grafo = {f"{t}:{int(i)}" for t, i in zip(z["tipo"], z["tmdb"])}
def parse_kw(v):
    if v is None: return []
    if isinstance(v, (list, tuple, np.ndarray)):
        out = []
        for x in v:
            if isinstance(x, dict): out.append(int(x.get("id") or 0))
            elif isinstance(x, (int, np.integer)): out.append(int(x))
        return [x for x in out if x]
    s = str(v)
    try:
        d = json.loads(s)
        return parse_kw(d)
    except Exception:
        return [int(x) for x in re.findall(r"\d+", s)][:60]
def y4(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0
tv = pd.read_parquet(PQ/"tv.parquet", columns=["id","name","name_en","first_air_date","genres","keywords","popularity","vote_count"])
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","title","title_en","release_date","genres","keywords","popularity","vote_count"])
# cosa e' gia' fatto
fatti = set()
for fn in ("link-manuali-4.json", "cross-pulito.json"):
    p = ROOT/".scratch"/"ml-collaborativo"/"gold"/fn
    if not p.exists(): continue
    d = json.loads(p.read_text(encoding="utf-8"))
    for s in d.get("sources", []):
        if "id" in s: fatti.add(s["id"])
        else: fatti.add(s.get("source", {}).get("title", ""))
    for c in d.get("cluster", []) or []:
        for s in c.get("sources", []): fatti.add(f"tv:{s['year']}")   # placeholder, sotto filtriamo per titolo
titoli_fatti = set()
for fn in ("link-manuali.json","link-manuali-2.json","link-manuali-3.json","link-manuali-4.json","cross-1.json","cross-2.json"):
    p = ROOT/".scratch"/"ml-collaborativo"/"gold"/fn
    if not p.exists(): continue
    d = json.loads(p.read_text(encoding="utf-8"))
    for s in d.get("sources", []):
        t = s.get("source", s)
        titoli_fatti.add(unicodedata.normalize("NFKD", str(t.get("title",""))).lower())
    for c in d.get("cluster", []) or []:
        for s in c.get("sources", []): titoli_fatti.add(unicodedata.normalize("NFKD", str(s.get("title",""))).lower())
# i candidati: per parola chiave condivisa, pesata IDF
def indice(df, tipo, colonna_titolo, colonna_data):
    kw_of, meta = {}, {}
    for i, t, te, dt, kws, pop, vc, gen in zip(df["id"], df[colonna_titolo], df.get(colonna_titolo+"_en", df[colonna_titolo]) if colonna_titolo+"_en" in df else df[colonna_titolo], df[colonna_data], df["keywords"], df["popularity"], df["vote_count"], df["genres"]):
        k = f"{tipo}:{int(i)}"
        if k not in grafo: continue
        kw_of[k] = set(parse_kw(kws))
        meta[k] = {"t": str(t), "te": str(te or ""), "y": y4(dt), "pop": float(pop or 0), "vc": int(vc or 0), "gen": str(gen)[:80]}
    return kw_of, meta
KTV, MTV = indice(tv, "tv", "name", "first_air_date")
KMV, MMV = indice(mv, "movie", "title", "release_date")
print(f"nel grafo: {len(KTV):,} serie · {len(KMV):,} film")
df_idf = Counter()
for d in (KTV, KMV):
    for k, s in d.items():
        for w in s: df_idf[w] += 1
N = len(KTV) + len(KMV)
INV = defaultdict(list)
for d in (KTV, KMV):
    for k, s in d.items():
        for w in s: INV[w].append(k)
def candidati(k, n_film=12, n_serie=6, vc_min=80):
    q = KTV.get(k) or KMV.get(k) or set()
    sc = Counter()
    for w in q:
        idf = np.log(N / (1 + df_idf[w]))
        if idf < 1.0: continue                      # parole troppo comuni: non informano
        for o in INV[w]:
            if o != k: sc[o] += idf
    out = []
    for o, v in sc.items():
        m = MMV.get(o) or MTV.get(o)
        if not m or m["vc"] < vc_min: continue
        out.append((v + 0.15 * np.log1p(m["pop"]), o, m))
    out.sort(reverse=True)
    film = [(o, m) for _, o, m in out if o.startswith("movie:")][:n_film]
    ser = [(o, m) for _, o, m in out if o.startswith("tv:")][:n_serie]
    return film, ser
# le 300 piu' popolari non fatte
# Ordino per VOTI ACCUMULATI (quanti l'hanno visto), non per 'popularity' di TMDB (che e' un
# indice settimanale: ci finiscono talk show, telegiornali, varieta'). Escludo i generi senza
# affinita' cinematografica e le serie non ancora uscite.
NO = ("talk", "news", "reality", "soap")
import datetime
OGGI = datetime.date.today().year
cand = []
for i, n, ne, dt, pop, vc, gen in zip(tv["id"], tv["name"], tv["name_en"], tv["first_air_date"], tv["popularity"], tv["vote_count"], tv["genres"]):
    k = f"tv:{int(i)}"
    if k not in grafo or k in fatti: continue
    if int(vc or 0) < 150: continue
    y = y4(dt)
    if y == 0 or y > OGGI: continue
    g = str(gen).lower()
    if any(x in g for x in NO): continue
    if unicodedata.normalize("NFKD", str(n)).lower() in titoli_fatti: continue
    cand.append((int(vc or 0), k, str(n), str(ne or ""), y, float(pop or 0)))
cand.sort(key=lambda x: -x[0])
scelte = cand[:300]
print(f"candidate totali: {len(cand):,} -> scelte {len(scelte)}")
print("\nprime 12:")
for vc, k, n, ne, y, pop in scelte[:12]: print(f"  {k} {n} ({y}) voti={vc}")
out = []
for vc, k, n, ne, y, pop in scelte:
    film, ser = candidati(k)
    out.append({"id": k, "titolo": n, "titolo_en": ne, "anno": y, "voti": vc,
                "film": [{"id": o, "t": m["t"], "y": m["y"], "vc": m["vc"]} for o, m in film],
                "serie": [{"id": o, "t": m["t"], "y": m["y"], "vc": m["vc"]} for o, m in ser]})
p = ROOT/".scratch"/"ml-collaborativo"/"gold"/"scaffold-300.json"
p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"\nscaffold scritto: {p} ({len(out)} serie)")
print("\nesempio (la prima):")
e = out[0]
print(f"  {e['titolo']} ({e['anno']})")
print("  film:", ", ".join(f"{f['t']} ({f['y']})" for f in e["film"]))
print("  serie:", ", ".join(f"{s['t']} ({s['y']})" for s in e["serie"]))
