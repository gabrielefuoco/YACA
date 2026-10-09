"""valuta-prod.py — LA SIMILARITA' DI PRODUZIONE (keyword gerarchiche, quella che gira in src/)
sul set curato. Risponde a: abbiamo qualcosa di meglio da spedire?"""
import json, pathlib, re, unicodedata, difflib
import numpy as np, pandas as pd
from scipy.sparse import csr_matrix
from scipy import sparse as sp
ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ, ML = ROOT/".cache"/"tmdb", ROOT/".cache"/"movielens"
W_K = {3: 10, 2: 20, 1: 50}
def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().lower()
    s = re.sub(r"\b(il|lo|la|i|gli|le|un|uno|una|the|a|an|of|and|der|die|das|les|el|los)\b"," ",s)
    return " ".join(re.sub(r"[^a-z0-9 ]"," ",s).split())
def yr(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0
d = json.loads((ML/"prod-vectors.json").read_text(encoding="utf-8"))
keys = d["keys"]; row_of = {k: i for i, k in enumerate(keys)}
M = csr_matrix((np.asarray(d["vals"], np.float32), (d["rows"], d["cols"])), shape=(len(keys), len(d["tokens"]))).tocsr()
_nrm = np.sqrt(np.asarray(M.multiply(M).sum(1)).ravel()) + 1e-9
M = (sp.diags(1.0/_nrm) @ M).tocsr()
print(f"vettori di produzione: {M.shape[0]:,} titoli x {M.shape[1]:,} token")
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","title","title_en","release_date"])
tv = pd.read_parquet(PQ/"tv.parquet", columns=["id","name","name_en","first_air_date"])
NORM = {}
for typ, rows in (("movie", mv), ("tv", tv)):
    for i, t, te, dt in zip(rows["id"], rows["title" if typ=="movie" else "name"], rows["title_en" if typ=="movie" else "name_en"], rows["release_date" if typ=="movie" else "first_air_date"]):
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
gold = {"sources": []}
for f in ("link-manuali.json", "link-manuali-2.json", "link-manuali-3.json", "link-manuali-4.json"):
    p = ROOT/".scratch"/"ml-collaborativo"/"gold"/f
    if p.exists(): gold["sources"] += json.loads(p.read_text(encoding="utf-8"))["sources"]
srcs = []
for s in gold["sources"]:
    i = find(s["source"]["title"], s["source"]["year"])
    if i is None or i not in row_of: continue
    ls = [(find(l["title"], l["year"]), l["type"], l["w"]) for l in s["links"]]
    ls = [(row_of[j], t, w) for j, t, w in ls if j is not None and j in row_of]
    ff = [find(f["title"], f["year"]) for f in s.get("false_friends", [])]
    ff = [row_of[j] for j in ff if j is not None and j in row_of]
    srcs.append(dict(i=row_of[i], links=ls, ffs=ff))
print(f"set curato: {len(gold['sources'])} sorgenti · agganciate {len(srcs)} · collegamenti {sum(len(s['links']) for s in srcs)} · falsi {sum(len(s['ffs']) for s in srcs)}")
odd = [k for k in range(len(srcs)) if k % 2 == 1]
even = [k for k in range(len(srcs)) if k % 2 == 0]
def valuta(nome, subset=None):
    ss = srcs if subset is None else [srcs[k] for k in subset]
    tot = {w: 0 for w in W_K}; hit = {w: 0 for w in W_K}; byt = {}; ff10 = ff_tot = 0
    for s in ss:
        sims = np.asarray((M @ M[s["i"]].T).todense()).ravel()
        sims[s["i"]] = -9
        order = np.argsort(-sims); rank = {int(x): k for k, x in enumerate(order)}
        for j, t, w in s["links"]:
            tot[w] += 1; hit[w] += rank[j] < W_K[w]
            byt.setdefault(t, [0,0]); byt[t][0] += rank[j] < W_K[w]; byt[t][1] += 1
        for j in s["ffs"]:
            ff_tot += 1; ff10 += rank[j] < 10
    c3 = hit[3]/max(1,tot[3]); c2 = hit[2]/max(1,tot[2]); f10 = ff10/max(1,ff_tot)
    print(f"  {nome:<28} p3@10 {100*c3:5.1f}% ({hit[3]}/{tot[3]}) · p2@20 {100*c2:5.1f}% · falsi {100*f10:4.0f}% · PUNTEGGIO {100*(c3+c2-f10):5.1f}")
    return byt, c3, c2, f10
byt, *_ = valuta("SCORER DI PRODUZIONE")
print("")
print("=== PER TIPO ===")
for t in sorted(byt, key=lambda x: -byt[x][1]):
    h, tt = byt[t]
    print(f"  {t:<11} {100*h/max(1,tt):5.1f}% ({h}/{tt})")
