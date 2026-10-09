"""test-utenti.py — IL TEST RAPIDO: le cronologie degli utenti collegano film e serie?
Il segnale: due titoli sono legati se lo STESSO utente ha guardato entrambi (co-visione cross-medium).
Il test: i 174 legami film<->serie del set curato finiscono in alto? Controllo: coppie a caso."""
import json, pathlib, re, unicodedata, difflib
import numpy as np, pandas as pd
from scipy.sparse import csr_matrix
ROOT = pathlib.Path(".").resolve(); PQ, ML = ROOT/".cache"/"tmdb", ROOT/".cache"/"movielens"
UC = ROOT/".cache"/"trakt"/"users"
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
n = len(keys)
utenti = {}
for f in sorted(UC.glob("movie-*.json")):
    u = f.name[6:-5]
    ks = set()
    try: v = json.loads(f.read_text(encoding="utf-8"))
    except Exception: continue
    for it in v:
        t = ((it.get("movie") or {}).get("ids") or {}).get("tmdb")
        if t: ks.add(f"movie:{int(t)}")
    utenti.setdefault(u, set()).update(ks & key_set)
for f in sorted(UC.glob("show-*.json")):
    u = f.name[5:-5]
    ks = set()
    try: v = json.loads(f.read_text(encoding="utf-8"))
    except Exception: continue
    for it in v:
        t = ((it.get("show") or {}).get("ids") or {}).get("tmdb")
        if t: ks.add(f"tv:{int(t)}")
    utenti.setdefault(u, set()).update(ks & key_set)
utenti = {u: ks for u, ks in utenti.items() if len(ks) >= 10}
print(f"utenti con cronologia: {len(utenti):,}")
crs, ccs = [], []
for r, (u, ks) in enumerate(utenti.items()):
    for k in ks:
        crs.append(r); ccs.append(row_of[k])
X = csr_matrix((np.ones(len(crs), np.float32), (crs, ccs)), shape=(len(utenti), n))
X.sum_duplicates(); X.data[:] = 1.0
nf = sum(1 for k in keys if k.startswith("movie:")); ns = n - nf
print(f"matrice utenti x titoli: {X.shape} · {X.nnz:,} visioni · film {nf:,} · serie {ns:,}")
colsum = np.asarray(X.sum(0)).ravel()
print(f"titoli con almeno una visione: {int((colsum>0).sum()):,} ({100*(colsum>0).mean():.0f}% del catalogo)")
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
tot = h10 = h20 = h50 = 0; usate = 0
for s in gold["sources"]:
    i = find(s["source"]["title"], s["source"]["year"])
    if i is None or i not in row_of: continue
    med = [(find(l["title"], l["year"]), l["w"]) for l in s["links"] if l["type"] == "medium"]
    med = [(j, w) for j, w in med if j is not None and j in row_of]
    if not med: continue
    usate += 1
    r0 = row_of[i]
    sims = np.asarray((X[:, r0].T @ X).todense()).ravel()      # chi ha guardato il titolo, cos'altro ha guardato
    sims[r0] = -9
    order = np.argsort(-sims)
    rank = np.empty(n, dtype=np.int32); rank[order] = np.arange(n)
    for j, w in med:
        tot += 1; h10 += rank[row_of[j]] < 10; h20 += rank[row_of[j]] < 20; h50 += rank[row_of[j]] < 50
print(f"\nsorgenti con legami medium: {usate} · collegamenti: {tot}")
if tot: print(f"  p3@10 {100*h10/tot:.1f}% ({h10}/{tot}) · p2@20 {100*h20/tot:.1f}% · p1@50 {100*h50/tot:.1f}%")
print("RIFERIMENTO: la pipeline attuale fa 2,2% sul tipo medium; le liste di Trakt hanno fatto 0,0%.")
