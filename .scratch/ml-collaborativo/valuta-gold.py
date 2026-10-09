"""
valuta-gold.py — IL METRO CURATO. Valuta uno spazio sui collegamenti scritti a mano.
Metriche: per PESO (3 = primi 10, 2 = primi 20, 1 = primi 50), per TIPO, e i FALSI AMICI (devono stare fuori).
Uso: python .scratch/ml-collaborativo/valuta-gold.py
"""
import json, os, pathlib, re, unicodedata, difflib
import numpy as np, pandas as pd
from scipy import sparse as sp
ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ, ML = ROOT/".cache"/"tmdb", ROOT/".cache"/"movielens"
SP = os.environ.get("SPAZI", "spazi")
z = np.load(ML/f"{SP}.npz", allow_pickle=True)
Pc, Pb, tmdb, tipo, coll, year = z["Pc"], z["Pb"], z["tmdb"], z["tipo"], z["coll"], z["year"]
n = len(tmdb)
def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().lower()
    s = re.sub(r"\b(il|lo|la|i|gli|le|un|uno|una|the|a|an|of|and|der|die|das|les|el|los)\b"," ",s)
    return " ".join(re.sub(r"[^a-z0-9 ]"," ",s).split())
def yr(d):
    s = str(d)[:4]
    return int(s) if s.isdigit() else 0
mv = pd.read_parquet(PQ/"movies.parquet", columns=["id","title","title_en","release_date"])
tv = pd.read_parquet(PQ/"tv.parquet", columns=["id","name","name_en","first_air_date"])
T = {}
for i,t,te,d in zip(mv["id"],mv["title"],mv["title_en"],mv["release_date"]): T[("movie",int(i))] = (t,te,yr(d))
for i,t,te,d in zip(tv["id"],tv["name"],tv["name_en"],tv["first_air_date"]): T[("tv",int(i))] = (t,te,yr(d))
names = [T.get((str(t), int(i)), ("","",0)) for t,i in zip(tipo, tmdb)]
NORM = [(norm(a), norm(b), y) for a,b,y in names]
by_first = {}
for j,(a,b,y) in enumerate(NORM):
    for s in (a,b):
        if s: by_first.setdefault(s.split()[0], []).append(j)
EXACT = {}
for j,(a,b,y) in enumerate(NORM):
    for s_ in (a,b):
        if s_: EXACT.setdefault((s_, y), j)
def find(title, year_):
    nn = norm(title)
    for dy in (0,1,-1,2,-2,3,-3):
        j = EXACT.get((nn, year_+dy))
        if j is not None: return j
    cands = by_first.get(nn.split()[0], [])
    best, bs = None, 0.0
    for j in cands:
        for s in NORM[j][:2]:
            r = difflib.SequenceMatcher(None, nn, s).ratio()
            if r > bs: bs, best = r, j
    return best if bs >= 0.82 else None
gold = {"sources": []}
for _f in ("link-manuali.json", "link-manuali-2.json", "link-manuali-3.json", "link-manuali-4.json"):
    _p = ROOT / ".scratch" / "ml-collaborativo" / "gold" / _f
    if _p.exists():
        gold["sources"] += json.loads(_p.read_text(encoding="utf-8"))["sources"]
print(f"set curato: {len(gold['sources'])} sorgenti da {sum(1 for _ in (1,2))} file")
srcs = []
miss = []
for s in gold["sources"]:
    i = find(s["source"]["title"], s["source"]["year"])
    if i is None: miss.append(s["source"]["title"]); continue
    links = [(find(l["title"], l["year"]), l["type"], l["w"], l["why"]) for l in s["links"]]
    links = [(j,t,w,y) for j,t,w,y in links if j is not None]
    ffs = [find(f["title"], f["year"]) for f in s.get("false_friends", [])]
    ffs = [j for j in ffs if j is not None]
    srcs.append(dict(i=i, why=s["why"], links=links, ffs=ffs))
print(f"sorgenti agganciate: {len(srcs)}/{len(gold['sources'])} · collegamenti {sum(len(s['links']) for s in srcs)} · falsi amici {sum(len(s['ffs']) for s in srcs)}")
if miss: print("  non agganciate:", ", ".join(miss))
Sf = sp.load_npz(ML/f"{SP}-tfidf.npz").tocsr()
_zt = np.load(ML/"temi-scores.npz", allow_pickle=True)
TB, TC, TKEYS = _zt["bag"], _zt["cen"], [str(x) for x in _zt["keys"]]
TB = TB / (np.abs(TB).max() + 1e-9); TC = TC / (np.abs(TC).max() + 1e-9)   # scale confrontabili
temi_row = {k: a for a, k in enumerate(TKEYS)}
key_of_row = {r: f"{tipo[r]}:{int(tmdb[r])}" for r in range(n)}
is_tv = (tipo == "tv")
def centra(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
Pc2, Pb2 = centra(Pc), centra(Pb)
W_K = {3: 10, 2: 20, 1: 50}
def sims_of(row, wc, wb, wf, boost):
    sims = wc * (Pc2 @ Pc2[row]) + wb * (Pb2 @ Pb2[row]) + wf * (Sf[row] @ Sf.T).toarray().ravel()
    if boost:
        sims = sims + boost * ((coll == coll[row]) & ~pd.isna(coll))
    sims[row] = -9
    return sims
def valuta(wc, wb, wf, boost, nome, subset=None):
    ss = srcs if subset is None else [srcs[k] for k in subset]
    tot = {w: 0 for w in W_K}; hit = {w: 0 for w in W_K}
    byt = {}; ff10 = ff_tot = 0
    for s in ss:
        order = np.argsort(-sims_of(s["i"], wc, wb, wf, boost))
        rank = {int(x): k for k, x in enumerate(order)}
        for j, t, w, _ in s["links"]:
            tot[w] += 1; hit[w] += rank[j] < W_K[w]
            byt.setdefault(t, [0,0]); byt[t][0] += rank[j] < W_K[w]; byt[t][1] += 1
        for j in s["ffs"]:
            ff_tot += 1; ff10 += rank[j] < 10
    c3 = hit[3]/max(1,tot[3]); c2 = hit[2]/max(1,tot[2]); c1 = hit[1]/max(1,tot[1]); f10 = ff10/max(1,ff_tot)
    print(f"  {nome:<34} p3@10 {100*c3:5.1f}% ({hit[3]}/{tot[3]}) · p2@20 {100*c2:5.1f}% · p1@50 {100*c1:5.1f}% · falsi {100*f10:4.0f}% · PUNTEGGIO {100*(c3+c2-f10):5.1f}")
    return dict(c3=c3, c2=c2, c1=c1, f10=f10, byt=byt, score=c3+c2-f10)
odd = [k for k in range(len(srcs)) if k % 2 == 1]
even = [k for k in range(len(srcs)) if k % 2 == 0]
print("")
voti = z["votes"].astype(float)
COLD = voti < 200          # sotto questa soglia il teacher non ha dati: le coordinate apprese sono rumore
def sims_of(row, wc, wb, wf, wy, sig, boost, wt=0.0, wz=0.0):
    sims = wc*(Pc2 @ Pc2[row]) + wb*(Pb2 @ Pb2[row])
    if wf and COLD[row]:
        sims = sims + wf*(Sf[row] @ Sf.T).toarray().ravel()
    if wy:
        sims = sims + wy*np.exp(-((year - year[row])/sig)**2)
    if boost:
        sims = sims + boost*((coll == coll[row]) & ~pd.isna(coll))
    if wt or wz:
        a = temi_row.get(key_of_row[row])
        if a is not None:
            if wt: sims = sims + wt*TB[a]
            if wz: sims = sims + wz*TC[a]
    sims[row] = -9
    return sims
def valuta(wc, wb, wf, wy, sig, boost, nome, subset=None, wt=0.0, wz=0.0):
    ss = srcs if subset is None else [srcs[k] for k in subset]
    tot = {w: 0 for w in W_K}; hit = {w: 0 for w in W_K}
    byt = {}; ff10 = ff_tot = 0
    for s_ in ss:
        order = np.argsort(-sims_of(s_["i"], wc, wb, wf, wy, sig, boost, wt, wz))
        rank = {int(x): k for k, x in enumerate(order)}
        for j, t, w, _ in s_["links"]:
            tot[w] += 1; hit[w] += rank[j] < W_K[w]
            byt.setdefault(t, [0,0]); byt[t][0] += rank[j] < W_K[w]; byt[t][1] += 1
        for j in s_["ffs"]:
            ff_tot += 1; ff10 += rank[j] < 10
    c3 = hit[3]/max(1,tot[3]); c2 = hit[2]/max(1,tot[2]); c1 = hit[1]/max(1,tot[1]); f10 = ff10/max(1,ff_tot)
    print(f"  {nome:<30} p3@10 {100*c3:5.1f}% ({hit[3]}/{tot[3]}) · p2@20 {100*c2:5.1f}% · p1@50 {100*c1:5.1f}% · falsi {100*f10:4.0f}% · PUNTEGGIO {100*(c3+c2-f10):5.1f}")
    return dict(c3=c3, c2=c2, c1=c1, f10=f10, byt=byt, score=c3+c2-f10)
odd = [k for k in range(len(srcs)) if k % 2 == 1]
even = [k for k in range(len(srcs)) if k % 2 == 0]
print("")
print("=== COMPONENTI STRUTTURALI (tutto il set) ===")
valuta(1,0,0,0,6,0, "contenuto appreso")
valuta(0,1,0,0,6,0, "comportamento appreso")
valuta(1,0,1,0,6,0, "contenuto + feature grezze (sempre)")
valuta(0.7,0.3,0,0.3,6,0, "contenuto+comport + anno")
valuta(0.7,0.3,0,0.3,6,0.4, "+ saga")
print("")
print("=== I TEMI DENTRO LA FUSIONE (altri pesi fissi al meglio: cont 1.0 · anno 0.15 sig8 · saga 0.4) ===")
print("  [calibrazione sui dispari]")
best = None
for wt in (0.0, 0.05, 0.1, 0.2, 0.4):
    for wz in (0.0, 0.05, 0.1, 0.2):
        r = valuta(1.0, 0.0, 0.0, 0.15, 8, 0.4, f"temi_bag {wt} · temi_cen {wz}", subset=odd, wt=wt, wz=wz)
        if best is None or r["score"] > best[-1]["score"]:
            best = (wt, wz, r)
print("")
valuta(1.0, 0.0, 0.0, 0.15, 8, 0.4, "SENZA temi (riferimento)", subset=even)
print(f"=== MIGLIORE: temi_bag {best[0]} · temi_cen {best[1]} ===")
valuta(1.0, 0.0, 0.0, 0.15, 8, 0.4, "TUTTO IL SET", wt=best[0], wz=best[1])
r_ev = valuta(1.0, 0.0, 0.0, 0.15, 8, 0.4, "VERIFICA (solo pari)", subset=even, wt=best[0], wz=best[1])
print("")
print("=== PER TIPO (verifica) ===")
for t in sorted(r_ev["byt"], key=lambda x: -r_ev["byt"][x][1]):
    h, tt = r_ev["byt"][t]
    print(f"  {t:<11} {100*h/max(1,tt):5.1f}% ({h}/{tt})")

print("")
print("=== SPECIALIZZAZIONE: QUALE CLASSIFICATORE VINCE SU QUALE TIPO (tutto il set) ===")
print("| tipo | n | contenuto (Pc) | comportamento (Pb) | fusione 0.7/0.3 |")
print("|---|---|---|---|---|")
tipi = {}
for nome, cfg in (("Pc", (1,0,0,0,6,0)), ("Pb", (0,1,0,0,6,0)), ("F", (0.7,0.3,0,0,6,0))):
    r = valuta(*cfg, nome, subset=None)
    tipi[nome] = r["byt"]
allt = sorted(set(t for v in tipi.values() for t in v), key=lambda x: -tipi["F"].get(x, [0,0])[1])
for t in allt:
    n_ = max([tipi[k].get(t,[0,0])[1] for k in tipi])
    row = " | ".join(f"{100*tipi[k].get(t,[0,0])[0]/max(1,tipi[k].get(t,[0,0])[1]):.0f}%" if tipi[k].get(t,[0,0])[1] else "-" for k in ("Pc","Pb","F"))
    print(f"| {t} | {n_} | {row} |")
