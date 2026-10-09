"""
multivettore.py — MULTI-VETTORE PER MACRO-TEMI invece di un vettore medio.

Idea: la media delle keyword (e la coordinata singola) introduce rumore. Si sale di 2 livelli nella
gerarchia del grafo (keyword -> L1 -> L2) e si rappresenta il film con 1-4 MACRO-TEMI, ognuno con il
proprio vettore. La similarità fra due film = il MASSIMO sui coseni fra i loro temi (non la media).

Perche' riduce il rumore: un film freddo (Caligari, 57 voti) ha una coordinata rumorosa, ma il TEMA
"espressionismo tedesco" ha decine di film dietro -> il suo centroide e' robusto.
Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/multivettore.py
"""
import json, pathlib, re, unicodedata, difflib
from collections import Counter, defaultdict
import numpy as np, pandas as pd
from scipy import sparse as sp
ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ, ML = ROOT/".cache"/"tmdb", ROOT/".cache"/"movielens"
W_K = {3: 10, 2: 20, 1: 50}
def log(m): print(m, flush=True)
def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().lower()
    s = re.sub(r"\b(il|lo|la|i|gli|le|un|uno|una|the|a|an|of|and|der|die|das|les|el|los)\b"," ",s)
    return " ".join(re.sub(r"[^a-z0-9 ]"," ",s).split())
def yr(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0

log("=== grafo: la gerarchia delle keyword ===")
G = json.loads((ROOT/"src"/"data"/"hierarchical_graph.json").read_text(encoding="utf-8"))
CH = {}
for nm, c in G["kw_to_L1"].items():
    t_ = (G["L1"].get(c) or {}).get("parent")
    v_ = (G["L2"].get(t_) or {}).get("parent") if t_ else None
    CH[nm] = (c, t_, v_)
log(f"  keyword mappate: {len(CH):,} · nodi L1 {len(G['L1']):,} · L2 {len(G['L2']):,} · L3 {len(G['L3']):,}")

log("=== catalogo ===")
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","title","title_en","keywords","release_date"])
tv = pd.read_parquet(PQ/"tv.parquet", columns=["id","name","name_en","keywords","first_air_date"])
items = []   # (key, temi_L1 con peso, temi_L2 con peso)
NORM = {}
for typ, rows in (("movie", mv), ("tv", tv)):
    tn, ten, dn = ("title","title_en","release_date") if typ == "movie" else ("name","name_en","first_air_date")
    for i, t, te, dt, kw in zip(rows["id"], rows[tn], rows[ten], rows[dn], rows["keywords"]):
        k = f"{typ}:{int(i)}"
        for s in (norm(t), norm(te or "")):
            if s: NORM.setdefault((s, yr(dt)), k)
        try: ks = [str(x.get("name","")).strip().lower() for x in json.loads(kw or "[]") if isinstance(x, dict)]
        except Exception: ks = []
        c1, c2 = Counter(), Counter()
        for x in ks:
            ch = CH.get(x)
            if ch:
                if ch[0]: c1[ch[0]] += 1
                if ch[1]: c2[ch[1]] += 1
        items.append((k, c1, c2))
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
keys = [x[0] for x in items]
row_of = {k: i for i, k in enumerate(keys)}
log(f"  {len(items):,} titoli · con almeno un tema L1: {sum(1 for _, a, _ in items if a):,}")

log("=== centroide dei temi nello spazio del teacher (SVD contenuto) ===")
z = np.load(ML/"spazi-cap0.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
Pc2 = Pc.astype(np.float64).copy()
is_tv = (tipo == "tv")
Pc2[~is_tv] -= Pc[~is_tv].mean(0); Pc2[is_tv] -= Pc[is_tv].mean(0)
Pc2 /= (np.linalg.norm(Pc2, axis=1, keepdims=True) + 1e-9)
row_in_space = {}
for i, (t, ty) in enumerate(zip(tmdb, tipo)):
    row_in_space[f"{ty}:{int(t)}"] = i
def centroidi(campo):
    acc = defaultdict(lambda: np.zeros(Pc2.shape[1]))
    cnt = Counter()
    for k, c1, c2 in items:
        j = row_in_space.get(k)
        if j is None: continue
        for th in (c1 if campo == 1 else c2):
            acc[th] += Pc2[j]; cnt[th] += 1
    out = {}
    for th, v in acc.items():
        if cnt[th] >= 3:
            v = v / (np.linalg.norm(v) + 1e-9)
            out[th] = v
    return out, cnt
C1, cnt1 = centroidi(1)
C2, cnt2 = centroidi(2)
log(f"  temi L1 con >=3 film: {len(C1):,} (mediana film per tema {int(np.median(list(cnt1.values()))):,})")
log(f"  temi L2 con >=3 film: {len(C2):,} (mediana film per tema {int(np.median(list(cnt2.values()))):,})")

# multi-vettore: i K temi piu' pesati di ogni film
def multi(k, campo, K):
    c1, c2 = None, None
    for kk, a, b in items:
        if kk == k: c1, c2 = a, b; break
    c = c1 if campo == 1 else c2
    C = C1 if campo == 1 else C2
    th = [t for t, _ in c.most_common(K) if t in C]
    return [C[t] for t in th] if th else None

log("")
log("=== set curato ===")
gold = {"sources": []}
for f in ("link-manuali.json", "link-manuali-2.json"):
    p = ROOT/".scratch"/"ml-collaborativo"/"gold"/f
    if p.exists(): gold["sources"] += json.loads(p.read_text(encoding="utf-8"))["sources"]
srcs = []
for s in gold["sources"]:
    i = find(s["source"]["title"], s["source"]["year"])
    if i is None: continue
    ls = [(find(l["title"], l["year"]), l["type"], l["w"]) for l in s["links"]]
    ls = [(j, t, w) for j, t, w in ls if j is not None]
    ff = [find(f["title"], f["year"]) for f in s.get("false_friends", [])]
    srcs.append(dict(i=i, links=ls, ffs=[j for j in ff if j is not None]))
log(f"  {len(gold['sources'])} sorgenti · agganciate {len(srcs)} · collegamenti {sum(len(s['links']) for s in srcs)}")
even = [k for k in range(len(srcs)) if k % 2 == 0]
odd = [k for k in range(len(srcs)) if k % 2 == 1]

def prepara(campo, K):
    """Precalcola: la matrice dei temi (n_temi x 64) e, per ogni titolo, gli indici dei suoi K temi."""
    C = C1 if campo == 1 else C2
    tid = {t: i for i, t in enumerate(C)}
    T = np.array([C[t] for t in C], dtype=np.float64)
    A = np.full((len(items), K), -1, np.int32)
    for r, (k, c1, c2) in enumerate(items):
        c = c1 if campo == 1 else c2
        th = [t for t, _ in c.most_common(K) if t in tid]
        for s_, t in enumerate(th[:K]): A[r, s_] = tid[t]
    return T, A

def valuta(campo, K, modo, nome, subset=None):
    T, A = prepara(campo, K)
    Ac = np.where(A < 0, 0, A); mask = A >= 0
    cnt = np.array([cnt1[t] if campo == 1 else cnt2[t] for t in (C1 if campo == 1 else C2)], np.float64)
    idf = np.log(len(items) / (cnt + 1.0))            # un tema condiviso da 473 film vale poco
    W = idf[Ac] * mask                                 # peso per (titolo, slot)
    Wden = W.sum(1)
    Wn = W / np.maximum(Wden, 1e-9)[:, None]
    ss = srcs if subset is None else [srcs[k] for k in subset]
    tot = {w: 0 for w in W_K}; hit = {w: 0 for w in W_K}; byt = {}; ff10 = ff_tot = 0
    for s in ss:
        r_src = row_of.get(s["i"])
        if r_src is None: continue
        src_themes = [int(t) for t in A[r_src] if t >= 0]
        if not src_themes: continue
        per_t = []
        for t in src_themes:
            S = T @ T[t]                                   # similarita' con TUTTI i temi
            per_t.append((S[Ac] * Wn).sum(1))               # media pesata sui temi del candidato
        per_t = np.array(per_t)
        sims = per_t.max(0) if modo == "max" else per_t.mean(0)
        sims[r_src] = -9
        order = np.argsort(-sims)
        rank = {keys[r]: p for p, r in enumerate(order)}
        for j, t, w in s["links"]:
            tot[w] += 1; hit[w] += rank.get(j, 10**9) < W_K[w]
            byt.setdefault(t, [0,0]); byt[t][0] += rank.get(j, 10**9) < W_K[w]; byt[t][1] += 1
        for j in s["ffs"]:
            ff_tot += 1; ff10 += rank.get(j, 10**9) < 10
    c3 = hit[3]/max(1,tot[3]); c2 = hit[2]/max(1,tot[2]); f10 = ff10/max(1,ff_tot)
    log(f"  {nome:<34} p3@10 {100*c3:5.1f}% ({hit[3]}/{tot[3]}) · p2@20 {100*c2:5.1f}% · falsi {100*f10:4.0f}% · PUNTEGGIO {100*(c3+c2-f10):5.1f}")
    return byt

log("")
log("=== MULTI-VETTORE (verifica: solo sorgenti pari) ===")
# K=20 = TUTTI i temi del film (un film ne ha ~13): la selezione top-K su una distribuzione
# piatta (1 keyword per tema) rischia di scegliere a caso.
for campo, liv in ((1, "L1"), (2, "L2")):
    for K in (1, 4, 20):
        for modo in ("max", "media"):
            valuta(campo, K, modo, f"temi {liv} · K={K} · {modo}", subset=even)
log("")
log("=== RIFERIMENTO (stessa verifica) ===")
log("  spazio attuale (contenuto+anno+saga)  p3@10 40,3% · p2@20 27,0% · PUNTEGGIO 56,2")
log("  scorer di produzione                  p3@10 13,9% · p2@20  2,4% · PUNTEGGIO 12,7")

# ---------------------------------------------------------------- SOMMA e SACCO (aggregazioni giuste)
from scipy.sparse import csr_matrix as _csr
from scipy import sparse as _sp
def valuta_extra(campo, modo, nome, subset=None):
    T, A = prepara(campo, 20)
    Ac = np.where(A < 0, 0, A); mask = A >= 0
    C = C1 if campo == 1 else C2
    cnt_ = np.array([cnt1[t] if campo == 1 else cnt2[t] for t in C], np.float64)
    idf = np.log(len(items) / (cnt_ + 1.0))
    ss = srcs if subset is None else [srcs[k] for k in subset]
    tot = {w: 0 for w in W_K}; hit = {w: 0 for w in W_K}; byt = {}; ff10 = ff_tot = 0
    # sacco di temi: matrice sparsa titoli x temi, pesata con l'idf
    rr_, cc_, vv_ = [], [], []
    for r in range(len(items)):
        for t in A[r]:
            if t >= 0: rr_.append(r); cc_.append(int(t)); vv_.append(float(idf[int(t)]))
    Memb = _csr((vv_, (rr_, cc_)), shape=(len(items), len(C)))
    _nr = np.sqrt(np.asarray(Memb.multiply(Memb).sum(1)).ravel()) + 1e-9
    Mn = (_sp.diags(1.0/_nr) @ Memb).tocsr()
    for s_ in ss:
        r_src = row_of.get(s_["i"])
        if r_src is None: continue
        src_themes = [int(t) for t in A[r_src] if t >= 0]
        if not src_themes: continue
        if modo == "sacco":
            sims = np.asarray((Mn @ Mn[r_src].T).todense()).ravel()
        else:
            W = idf[Ac] * mask
            per_t = np.array([((T @ T[t])[Ac] * W).sum(1) for t in src_themes])   # SOMMA, non media
            sims = per_t.sum(0)
        sims[r_src] = -9
        order = np.argsort(-sims); rank = {keys[r]: p for p, r in enumerate(order)}
        for j, t, w in s_["links"]:
            tot[w] += 1; hit[w] += rank.get(j, 10**9) < W_K[w]
            byt.setdefault(t, [0,0]); byt[t][0] += rank.get(j, 10**9) < W_K[w]; byt[t][1] += 1
        for j in s_["ffs"]:
            ff_tot += 1; ff10 += rank.get(j, 10**9) < 10
    c3 = hit[3]/max(1,tot[3]); c2 = hit[2]/max(1,tot[2]); f10 = ff10/max(1,ff_tot)
    log(f"  {nome:<34} p3@10 {100*c3:5.1f}% ({hit[3]}/{tot[3]}) · p2@20 {100*c2:5.1f}% · falsi {100*f10:4.0f}% · PUNTEGGIO {100*(c3+c2-f10):5.1f}")

log("")
log("=== AGGREGAZIONI GIUSTE (verifica: solo sorgenti pari) ===")
for campo, liv in ((1, "L1"), (2, "L2")):
    valuta_extra(campo, "sacco", f"sacco di temi {liv} (overlap pesato)")
    valuta_extra(campo, "somma", f"centroidi {liv} · SOMMA sui temi")
log("")
log("  spazio attuale (contenuto+anno+saga)  p3@10 40,3% · p2@20 27,0% · PUNTEGGIO 56,2")
log("  scorer di produzione                  p3@10 13,9% · p2@20  2,4% · PUNTEGGIO 12,7")
