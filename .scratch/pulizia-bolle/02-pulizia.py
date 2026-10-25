"""Quanto costa pulire le bolle togliendo la coda bassa del punteggio.

Due letture:
  A. LA PROPOSTA LITERALE — per ogni bolla, media e deviazione standard del voto bayesiano
     (BAYESIAN_M=300, BAYESIAN_C=6.5, la formula di `canon.voto_bayesiano`), e via i membri
     sotto `media - k*sigma`. Solo bolle con almeno 5 membri.
  B. LA REGOLA CONSIGLIATA — due filtri indipendenti:
       1) pavimento assoluto: `vote_count >= 50` e `vote_average < 5.0` (la schifezza nota,
          e le bolle interamente brutte, che il filtro relativo non tocca);
       2) intruso relativo: stesso z ma su `vote_average`, mediana/MAD robusti, k=2.5,
          solo bolle con n>=8, e solo se sta almeno 1,0 punto sotto la mediana.
     I due insieme.

Uso:  ../../offline_graph_builder/venv/Scripts/python.exe 02-pulizia.py
"""
import csv
import json
import collections
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "services" / "graph" / "data"
OUT = Path(__file__).resolve().parent

# --- canone
z = np.load(DATA / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo, year = z["tmdb"], z["tipo"], z["year"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
titoli = np.array((DATA / "titoli-canone.txt").read_text(encoding="utf-8").split("\n"), dtype=object)
meta = np.load(DATA / "metadati-canone.npz")
VOT, VAVE = meta["VOT"].astype(float), meta["VAVE"].astype(float)
N = len(keys)
ok = VOT > 0                              # uno zero non e' un voto: fuori dalle medie
BAYES = (VOT * VAVE + 300 * 6.5) / (VOT + 300)   # canon.voto_bayesiano, m=300 C=6.5
BAYES50 = (VOT * VAVE + 50 * 6.5) / (VOT + 50)   # variante meno shrinkata, per il confronto

# --- bolle
b = json.load(open(DATA / "bolle.json", encoding="latin-1"))
bid = np.array([b["titoli"][k] for k in keys])
bolle = b["bolle"]
is_film = tipo == "movie"

# --- statistiche per bolla (solo voti noti)
o = np.argsort(bid)
g, okv = bid[o], ok[o]
bd = np.r_[0, np.flatnonzero(np.diff(g)) + 1, len(g)]
ST = {}
for a, bb in zip(bd[:-1], bd[1:]):
    v300, vraw = BAYES[o][a:bb][okv[a:bb]], VAVE[o][a:bb][okv[a:bb]]
    n = len(v300)
    med = float(np.median(vraw))
    mad = 1.4826 * float(np.median(np.abs(vraw - med)))
    ST[g[a]] = {
        "n": n,
        "media": float(v300.mean()), "sd": float(v300.std()),
        "mediana_va": med, "mad_va": mad,
    }

def per_bolla(regola):
    """regola(i, st) -> motivo stringa o None."""
    out = {}
    for i in range(N):
        if not ok[i]:
            continue
        m = regola(i, ST[bid[i]])
        if m:
            out[i] = m
    return out

def z_relativo(k):
    def f(i, st):
        if st["n"] < 5 or st["sd"] <= 1e-9:
            return None
        return "coda bayes" if BAYES[i] < st["media"] - k * st["sd"] else None
    return f

def relativo_robusto(k=2.5, minn=8, gap=1.0):
    def f(i, st):
        if st["n"] < minn or st["mad_va"] <= 1e-9:
            return None
        if VAVE[i] < st["mediana_va"] - k * st["mad_va"] and VAVE[i] <= st["mediana_va"] - gap:
            return "intruso"
        return None
    return f

def assoluto(vot_min=50, voto_max=5.0):
    def f(i, st):
        if VOT[i] >= vot_min and VAVE[i] < voto_max:
            return "schifezza"
        return None
    return f

def somma(*regole):
    def f(i, st):
        for r in regole:
            m = r(i, st)
            if m:
                return m
        return None
    return f

def riassunto(nome, sel):
    idx = np.array(sorted(sel), dtype=int)
    if len(idx) == 0:
        print(f"{nome:44s} 0")
        return
    per = collections.Counter(bid[idx].tolist())
    sizes = collections.Counter(bid[ok].tolist())
    vuote = sum(1 for b_, s0 in sizes.items() if s0 - per.get(b_, 0) == 0)
    sotto5 = sum(1 for b_, s0 in sizes.items() if s0 >= 5 and s0 - per.get(b_, 0) < 5)
    print(f"{nome:44s} {len(idx):6d} ({100*len(idx)/N:5.2f}%) | "
          f"film {(is_film[idx]).sum():5d} serie {(~is_film[idx]).sum():4d} | "
          f"bolle {len(per):4d} | VAVEmed {np.median(VAVE[idx]):.2f} | "
          f"VOTmed {np.median(VOT[idx]):.0f} | >=6 {int((VAVE[idx]>=6).sum()):4d} | "
          f"svuotate {vuote:2d} | sotto5 {sotto5:2d}")

print(f"canone: {N} titoli ({int(is_film.sum())} film, {int((~is_film).sum())} serie)\n")

print("A. LA PROPOSTA LITERALE (bayesiano m=300, media - k*sigma, bolle n>=5)")
for k in (1.0, 1.5, 2.0, 2.5, 3.0):
    riassunto(f"   k={k}", per_bolla(z_relativo(k)))

print("\nB. PEZZI DELLA REGOLA CONSIGLIATA")
riassunto("   assoluto: VOT>=50 & VAVE<5.0", per_bolla(assoluto()))
riassunto("   relativo: VAVE mediana/MAD k=2.5 n>=8 gap 1.0", per_bolla(relativo_robusto()))
for k in (2.0, 2.5, 3.0):
    riassunto(f"   unione assoluto + relativo k={k}",
              per_bolla(somma(assoluto(), relativo_robusto(k=k))))

print("\nC. CONTROPROVA: bolle interamente brutte (mediana VAVE)")
for th in (4.5, 5.0, 5.5):
    bl = [b_ for b_, st in ST.items() if st["n"] and st["mediana_va"] < th]
    print(f"   mediana VAVE < {th}: {len(bl):3d} bolle, {sum(ST[b_]['n'] for b_ in bl):5d} titoli")

# --- i CSV dei candidati: la regola consigliata e la variante coerenza
def scrivi(nome_file, sel):
    with open(OUT / nome_file, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["chiave", "titolo", "anno", "tipo", "bolla", "bolla_n",
                    "motivo", "voti", "voto", "bayes", "mediana_bolla", "mad_bolla"])
        for i in sorted(sel, key=lambda i: (bid[i], -VOT[i])):
            st = ST[bid[i]]
            w.writerow([keys[i], titoli[i],
                        int(year[i]) if np.isfinite(year[i]) else "",
                        tipo[i], bid[i], st["n"], sel[i],
                        int(VOT[i]), round(float(VAVE[i]), 2), round(float(BAYES[i]), 3),
                        round(st["mediana_va"], 2), round(st["mad_va"], 3)])
    print(f"scritti {len(sel)} candidati in {nome_file}")

scrivi("candidati-pulizia.csv", per_bolla(somma(assoluto(), z_relativo(2.5))))
scrivi("candidati-coerenza.csv", per_bolla(somma(assoluto(), relativo_robusto(k=2.5))))

# --- il limite matematico dello z
print("\nD. PERCHE' LO z NON PUO' SCATTARE NELLE BOLLE PICCOLE")
for n in range(3, 13):
    print(f"   n={n:2d}: z massimo possibile (n-1)/sqrt(n) = {(n-1)/np.sqrt(n):.2f}")
