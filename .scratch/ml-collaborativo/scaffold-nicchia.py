"""scaffold-nicchia.py — le serie per il dataset cross-medium, selezionate con la QUERY HIDDEN GEM
vera del prodotto (dataFetchers.js), senza il DNA utente, con le penalizzazioni chieste:
kdrama (lingua coreana) e adolescenziale (parole chiave). Piu' i candidati con gli id risolti."""
import json, pathlib, re, unicodedata, datetime
from collections import Counter, defaultdict
import numpy as np, pandas as pd
ROOT = pathlib.Path(".").resolve(); PQ, ML = ROOT/".cache"/"tmdb", ROOT/".cache"/"movielens"
G = ROOT/".scratch"/"ml-collaborativo"/"gold"
# --- la query hidden gem del prodotto ---
VC_MIN, VC_MAX = 100, 1000
VA_MIN = 7.0
POP_MAX = 20
NO_LINGUA = {"ko"}                                     # kdrama
NO_GENERE = ("romance", "soap", "reality", "talk", "news", "documentary", "family", "kids")
NO_KW = ("teen", "teenager", "teenage", "coming of age", "high school", "adolescen",
         "young adult", "college", "school life", "middle school")
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
    try: return parse_kw(json.loads(str(v)))
    except Exception: return [int(x) for x in re.findall(r"\d+", str(v))][:60]
def y4(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0
tv = pd.read_parquet(PQ/"tv.parquet", columns=["id","name","name_en","first_air_date","genres","keywords","popularity","vote_count","vote_average","original_language","overview"])
# gia' fatti
fatti, titoli_fatti = set(), set()
def _norm(t): return unicodedata.normalize("NFKD", str(t)).lower().strip()
for fn in ("cross-merged.json", "link-manuali-4.json", "link-manuali.json", "link-manuali-2.json", "link-manuali-3.json"):
    p = G/fn
    if not p.exists(): continue
    d = json.loads(p.read_text(encoding="utf-8"))
    for s in d.get("sources", []):
        if s.get("id"): fatti.add(s["id"])
        src = s.get("source") or s
        if src.get("title"): titoli_fatti.add(_norm(src["title"]))
print(f"gia' fatte: {len(fatti)}")
OGGI = datetime.date.today().year
sel, scartate = [], Counter()
for i, n, ne, dt, pop, vc, va, lang, kws, ov, gen in zip(tv["id"], tv["name"], tv["name_en"], tv["first_air_date"], tv["popularity"], tv["vote_count"], tv["vote_average"], tv["original_language"], tv["keywords"], tv["overview"], tv["genres"]):
    k = f"tv:{int(i)}"
    if k not in grafo or k in fatti or _norm(n) in titoli_fatti: continue
    if not (VC_MIN <= (vc or 0) <= VC_MAX): scartate["voti"] += 1; continue
    if (va or 0) < VA_MIN: scartate["voto medio"] += 1; continue
    if (pop or 0) > POP_MAX: scartate["popolarita'"] += 1; continue
    if y4(dt) == 0 or y4(dt) > OGGI: scartate["anno"] += 1; continue
    if str(lang) in NO_LINGUA: scartate["kdrama"] += 1; continue
    if any(g in str(gen).lower() for g in NO_GENERE): scartate["genere senza affinita'"] += 1; continue
    testo = (str(ov) + " " + " ".join(str(x) for x in parse_kw(kws))).lower()
    if any(w in testo for w in NO_KW): scartate["adolescenziale"] += 1; continue
    sel.append((float(va or 0), k, str(n), str(ne or ""), y4(dt), int(vc or 0), float(pop or 0)))
print(f"scartate: {dict(scartate)}")
print(f"PASSANO la query hidden gem: {len(sel)}")
sel.sort(key=lambda x: -x[5])               # piu' voti dentro la fascia = piu' conosciute (autoriali)
print("\nprime 20 (per voto medio, poi le piu' nascoste):")
for va, k, n, ne, y, vc, pop in sel[:20]: print(f"  {k} {n} ({y}) voto={va:.1f} voti={vc} pop={pop:.0f}")
# --- candidati per parole chiave ---
kw_of, meta = {}, {}
for i, n, dt, kws, vc in zip(tv["id"], tv["name"], tv["first_air_date"], tv["keywords"], tv["vote_count"]):
    k = f"tv:{int(i)}"
    if k not in grafo: continue
    kw_of[k] = set(parse_kw(kws)); meta[k] = {"t": str(n), "y": y4(dt), "vc": int(vc or 0)}
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","title","release_date","keywords","vote_count"])
for i, t, dt, kws, vc in zip(mv["id"], mv["title"], mv["release_date"], mv["keywords"], mv["vote_count"]):
    k = f"movie:{int(i)}"
    if k not in grafo: continue
    kw_of[k] = set(parse_kw(kws)); meta[k] = {"t": str(t), "y": y4(dt), "vc": int(vc or 0)}
df_idf = Counter()
for d in (kw_of,):
    for k, s in d.items():
        for w in s: df_idf[w] += 1
N = len(kw_of); INV = defaultdict(list)
for k, s in kw_of.items():
    for w in s: INV[w].append(k)
def candidati(k, n_film=12, n_serie=6, vc_min=50):
    sc = Counter()
    for w in kw_of.get(k, ()):
        idf = np.log(N / (1 + df_idf[w]))
        if idf < 1.0: continue
        for o in INV[w]:
            if o != k: sc[o] += idf
    out = []
    for o, v in sc.items():
        m = meta.get(o)
        if not m or m["vc"] < vc_min: continue
        out.append((v, o, m))
    out.sort(reverse=True)
    return ([(o, m) for _, o, m in out if o.startswith("movie:")][:n_film],
            [(o, m) for _, o, m in out if o.startswith("tv:")][:n_serie])
res = []
for va, k, n, ne, y, vc, pop in sel[:300]:
    film, ser = candidati(k)
    res.append({"id": k, "titolo": n, "anno": y, "voto": round(va,1), "voti": vc,
                "film": [{"id": o, "t": m["t"], "y": m["y"], "vc": m["vc"]} for o, m in film],
                "serie": [{"id": o, "t": m["t"], "y": m["y"], "vc": m["vc"]} for o, m in ser]})
P = G/"scaffold-nicchia.json"
P.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"\nscaffold: {P} ({len(res)} serie)")
e = res[0]
print(f"\nesempio — {e['titolo']} ({e['anno']}) voto {e['voto']}")
print("  film:", ", ".join(f"{f['id'][6:]}:{f['t']}({f['y']})" for f in e["film"]))
print("  serie:", ", ".join(f"{s['id'][3:]}:{s['t']}({s['y']})" for s in e["serie"]))
