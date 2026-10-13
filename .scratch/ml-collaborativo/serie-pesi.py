"""serie-pesi.py — QUANTO PESA LA CO-VISIONE SUL CATALOGO SERIE?

L'ordinamento del catalogo serie (ordine-serie.py) ha trovato che la caratteristica piu' forte
e' `covis` — quanti vicini di co-visione Trakt cadono nel profilo dell'utente: toglierla costa
9,94 punti al @100. La co-visione e' l'unico segnale di COMPORTAMENTO che copre le serie
(CF copre 49.041 film e zero serie).

Quindi: il grafo del catalogo serie dovrebbe pesarla di piu'. Qui si sweepa il peso di B (e di
CFst) e si misura il catalogo serie — e accanto il catalogo film, perche' un peso che aiuta uno
e rovina l'altro non e' una soluzione.

Banco: cronologie Trakt, 356 utenti, split 60/40 (rng 13), recall dentro il catalogo.
Grafo canonico (canone.py). Camminata alpha 0,30, sorgente mascherata.
"""
import json, pathlib, sys, time
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
CASI = K.banco_trakt(row_of)
print(f"utenti del banco: {len(CASI)}")
PF = {i: c["pf"] for i, c in enumerate(CASI)}
GF = {i: c["gf"] for i, c in enumerate(CASI)}
PS = {i: c["ps"] for i, c in enumerate(CASI)}
GS = {i: c["gs"] for i, c in enumerate(CASI)}

CMP = K.Componenti(n)
C = CMP(60)
print(f"componenti pronti ({time.time()-t0:.0f}s)", flush=True)


def attiva(M, semi_di, alpha=0.30, lotto=120):
    chiavi = list(semi_di)
    X = np.zeros((n, len(chiavi)), np.float32)
    for i in range(0, len(chiavi), lotto):
        ch = chiavi[i:i + lotto]
        E = np.zeros((n, len(ch)), np.float32)
        for j, u in enumerate(ch):
            E[semi_di[u], j] = 1.0
        Y = K.rwr(M, E, alpha)
        for j, u in enumerate(ch):
            Y[semi_di[u], j] = -1e9
        X[:, i:i + len(ch)] = Y
    return X, chiavi


def misura(X, chiavi, gold_di, filtro, nome):
    R = K.ranghi(X, filtro)
    out = K.recall_catalogo(R, gold_di, chiavi, filtro)
    print(f"  {nome:<44} " + " · ".join(f"@{N} {v:6.2f}%" for N, v in out.items()), flush=True)
    return out


CONF = [
    ("CF5 CFst1 B1 wc0.60  (com'e' ora)", {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, 0.60),
    ("CF5 CFst1 B3 wc0.60", {"CF": 5, "CFst": 1, "Kc": 1, "B": 3, "T": 1}, 0.60),
    ("CF5 CFst1 B5 wc0.60", {"CF": 5, "CFst": 1, "Kc": 1, "B": 5, "T": 1}, 0.60),
    ("CF5 CFst1 B10 wc0.60", {"CF": 5, "CFst": 1, "Kc": 1, "B": 10, "T": 1}, 0.60),
    ("CF5 CFst3 B3 wc0.60", {"CF": 5, "CFst": 3, "Kc": 1, "B": 3, "T": 1}, 0.60),
    ("CF5 CFst3 B5 wc0.60", {"CF": 5, "CFst": 3, "Kc": 1, "B": 5, "T": 1}, 0.60),
    ("CF1 CFst1 B3 wc0.60 (meno comportamento-film)", {"CF": 1, "CFst": 1, "Kc": 1, "B": 3, "T": 1}, 0.60),
    ("CF5 CFst3 B5 wc0.80", {"CF": 5, "CFst": 3, "Kc": 1, "B": 5, "T": 1}, 0.80),
]

print("")
print("=" * 100)
print("CATALOGO SERIE — quanto pesa la co-visione")
print("=" * 100)
RIS = {}
for nome, pesi, wc in CONF:
    M = K.costruisci(C, pesi, wc=wc, beta=0.50)
    Xs, chs = attiva(M, PS)
    d = misura(Xs, chs, GS, is_tv, f"SERIE  {nome}")
    RIS[nome] = ("serie", d)
    del M, Xs

print("")
print("=" * 100)
print("CATALOGO FILM — la stessa configurazione non deve rovinarlo")
print("=" * 100)
for nome, pesi, wc in CONF[:6]:
    M = K.costruisci(C, pesi, wc=wc, beta=0.50)
    Xf, chf = attiva(M, PF)
    d = misura(Xf, chf, GF, ~is_tv, f"FILM   {nome}")
    del M, Xf

print(f"\n({time.time()-t0:.0f}s)")
