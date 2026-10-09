"""test-liste.py — TEST RAPIDO: le liste di Trakt collegano film e serie?
Il segnale: due titoli sono legati se compaiono nella STESSA lista. Il test: i 90 legami film<->serie
del set curato finiscono in alto? Confronto con il controllo (coppie a caso)."""
import json, pathlib, re, unicodedata, difflib
from collections import defaultdict, Counter
import numpy as np, pandas as pd
ROOT = pathlib.Path(".").resolve(); PQ, ML = ROOT/".cache"/"tmdb", ROOT/".cache"/"movielens"
LC = ROOT/".cache"/"trakt"/"lists"
def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().lower()
    s = re.sub(r"\b(il|lo|la|i|gli|le|un|uno|una|the|a|an|of|and|der|die|das|les|el|los)\b"," ",s)
    return " ".join(re.sub(r"[^a-z0-9 ]"," ",s).split())
def yr(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
keys = [f"{t}:{int(i)}" for t, i in zip(z["tipo"], z["tmdb"])]
key_set = set(keys); row_of = {k: r for r, k in enumerate(keys)}
# le liste: ogni voce ha type (movie/show) e ids (imdb, tmdb)
coppie = Counter()          # quante liste condividono la coppia
per_lista = []
nfile = 0
for f in sorted(LC.glob("items-*.json")):
    try: items = json.loads(f.read_text(encoding="utf-8"))
    except Exception: continue
    ks = set()
    for it in items:
        ty = it.get("type")
        ids = ((it.get("movie") or it.get("show") or {}).get("ids") or {})
        t = ids.get("tmdb")
        if ty == "movie" and t: ks.add(f"movie:{int(t)}")
        elif ty == "show" and t: ks.add(f"tv:{int(t)}")
    ks &= key_set
    if len(ks) < 3: continue
    nfile += 1; per_lista.append(ks)
    L = sorted(ks)
    for i in range(len(L)):
        for j in range(i+1, len(L)):
            coppie[(L[i], L[j])] += 1
print(f"liste usate: {nfile:,} · voci totali: {sum(len(x) for x in per_lista):,} · coppie distinte: {len(coppie):,}")
media = [k for k in keys if k.startswith("tv:")]
film = [k for k in keys if k.startswith("movie:")]
cross = sum(1 for (a, b) in coppie if (a.startswith("tv:") != b.startswith("tv:")))
print(f"coppie film<->serie: {cross:,} ({100*cross/max(1,len(coppie)):.1f}%) · film-film: {sum(1 for a,b in coppie if a.startswith('movie:') and b.startswith('movie:')):,} · serie-serie: {sum(1 for a,b in coppie if a.startswith('tv:') and b.startswith('tv:')):,}")
# il set curato: i legami 'medium'
gold = {"sources": []}
for fn in ("link-manuali.json","link-manuali-2.json","link-manuali-3.json","link-manuali-4.json","link-manuali-5.json"):
    p = ROOT/".scratch"/"ml-collaborativo"/"gold"/fn
    if p.exists(): gold["sources"] += json.loads(p.read_text(encoding="utf-8"))["sources"]
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","title","title_en","release_date"])
tv = pd.read_parquet(PQ/"tv.parquet", columns=["id","name","name_en","first_air_date"])
NORM = {}
for typ, rows in (("movie", mv), ("tv", tv)):
    tn, ten, dn = ("title","title_en","release_date") if typ=="movie" else ("name","name_en","first_air_date")
    for i, t, te, dt in zip(rows["id"], rows[tn], rows[ten], rows[dn]):
        for s in (norm(t), norm(te or "")):
            if s: NORM.setdefault((s, yr(dt)), f"{typ}:{int(i)}")
byf = {}
for (s, y), k in NORM.items(): byf.setdefault(s.split()[0], []).append((s, y, k))
def find(title, year):
    nn = norm(title)
    for dy in (0,1,-1,2,-2,3,-3):
        if (nn, year+dy) in NORM: return NORM[(nn, year+dy)]
    best, bs = None, 0.0
    for s, y, k in byf.get(nn.split()[0], []):
        r = difflib.SequenceMatcher(None, nn, s).ratio()
        if r > bs: bs, best = r, k
    return best if bs >= 0.82 else None
# per ogni sorgente con legami 'medium': ordino TUTTI i titoli per il numero di liste condivise
tot = hit10 = hit20 = hit50 = 0
usate = 0
for s in gold["sources"]:
    i = find(s["source"]["title"], s["source"]["year"])
    if i is None or i not in row_of: continue
    med = [(find(l["title"], l["year"]), l["w"]) for l in s["links"] if l["type"] == "medium"]
    med = [(j, w) for j, w in med if j is not None and j in row_of]
    if not med: continue
    usate += 1
    src = i
    # punteggio = quante liste condividono la coppia (src, j)
    punteggi = {k: coppie.get((min(src,k), max(src,k)), 0) for k in keys}
    order = sorted(keys, key=lambda k: (-punteggi[k], k))
    rank = {k: p for p, k in enumerate(order)}
    for j, w in med:
        tot += 1; hit10 += rank[j] < 10; hit20 += rank[j] < 20; hit50 += rank[j] < 50
print(f"\nsorgenti con legami medium: {usate} · collegamenti: {tot}")
if tot:
    print(f"  p3@10 {100*hit10/tot:.1f}% ({hit10}/{tot}) · p2@20 {100*hit20/tot:.1f}% · p1@50 {100*hit50/tot:.1f}%")
print(f"\nRIFERIMENTO: la pipeline attuale fa 2,2% sul tipo medium.")
