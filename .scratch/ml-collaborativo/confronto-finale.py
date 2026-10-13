"""confronto-finale.py — RICETTA COMPLETA CONTRO RICETTA MINIMA, SUL BANCO NUOVO.

Il banco Trakt e' cresciuto da 374 a oltre 1.000 utenti (fetch allargato a 1.200 autori di liste).
Tutte le misure precedenti sono su 356-374 utenti: qui si rifa' il confronto sul banco grande,
altrimenti il paragone e' falso.

  A) RICETTA COMPLETA   film: CF5 CFst1 Kc1 B1 T1 + curatela 0,60
                        serie: CF5 CFst3 Kc1 B5 T1 + curatela 0,60
  B) RICETTA MINIMA     film: CF da solo, senza curatela
                        serie: CFst1 + B1, senza curatela
  + la POPOLARITA' come ancora.

Su tre misure: catalogo film (Trakt), catalogo serie (Trakt), prodotto (MovieLens 500).
"""
import pathlib, sys, time
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
CASI = K.banco_trakt(row_of)
PF = {i: c["pf"] for i, c in enumerate(CASI)}
GF = {i: c["gf"] for i, c in enumerate(CASI)}
PS = {i: c["ps"] for i, c in enumerate(CASI)}
GS = {i: c["gs"] for i, c in enumerate(CASI)}
print(f"Trakt: {len(CASI)} utenti")
PROF, ORO = K.banco_prodotto(row_of, quanti=500, parte="calibrazione")
US = np.array(list(PROF.keys()))
print(f"MovieLens: {len(US)} utenti")

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


def prodotto(M, etichetta):
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0
    X = K.rwr(M, E, alpha=0.30)
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
    d = K.recall_film(K.ranghi(X), US, PROF, ORO, IDX_FILM)
    K.stampa(etichetta, d, 30)
    return d


z = np.load(K.ML / "spazi-trakt.npz", allow_pickle=True)
votes = z["votes"].astype(np.float32)
pop = np.argsort(np.argsort(votes)).astype(np.float32)
print("")
print("=" * 104)
print("ANCORA — POPOLARITA' (banco nuovo)")
print("=" * 104)
for nome, gold, chiavi, filtro in (("catalogo FILM (Trakt)", GF, PF, ~is_tv),
                                   ("catalogo SERIE (Trakt)", GS, PS, is_tv)):
    K.stampa(nome, K.recall_catalogo(K.ranghi(np.tile(pop[:, None], (1, len(chiavi)))), gold, chiavi, filtro), 30)

RIS = {}
for etichetta, pesi_f, wc_f, pesi_s, wc_s in (
    ("A) RICETTA COMPLETA", {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, 0.60,
     {"CF": 5, "CFst": 3, "Kc": 1, "B": 5, "T": 1}, 0.60),
    ("B) RICETTA MINIMA", {"CF": 1}, 0.0, {"CFst": 1, "B": 1}, 0.0),
):
    print("")
    print("=" * 104)
    print(etichetta)
    print("=" * 104)
    Mf = K.costruisci(C, pesi_f, wc=wc_f, beta=0.50)
    Xf, chf = attiva(Mf, PF)
    a = K.recall_catalogo(K.ranghi(Xf, ~is_tv), GF, chf, ~is_tv)
    K.stampa("catalogo FILM (Trakt)", a, 30)
    b = prodotto(Mf, "PRODOTTO (MovieLens 500)")
    del Mf, Xf
    Ms = K.costruisci(C, pesi_s, wc=wc_s, beta=0.50)
    Xs, chs = attiva(Ms, PS)
    c = K.recall_catalogo(K.ranghi(Xs, is_tv), GS, chs, is_tv)
    K.stampa("catalogo SERIE (Trakt)", c, 30)
    del Ms, Xs
    RIS[etichetta] = (a, b, c)
    print(f"  ({time.time()-t0:.0f}s)", flush=True)

print("")
print("=" * 104)
print(f"IL CONFRONTO — banco Trakt da {len(CASI)} utenti · MovieLens 500")
print("=" * 104)
print(f"  {'':<24} {'FILM @10':>9} {'FILM @100':>10} {'FILM @500':>10} "
      f"{'PROD @100':>10} {'PROD @500':>10} {'PROD @2000':>11} {'SERIE @10':>10} {'SERIE @100':>11} {'SERIE @500':>11}")
for et, (a, b, c) in RIS.items():
    print(f"  {et:<24} {a[10]:>9.2f} {a[100]:>10.2f} {a[500]:>10.2f} "
          f"{b[100]:>10.2f} {b[500]:>10.2f} {b[2000]:>11.2f} {c[10]:>10.2f} {c[100]:>11.2f} {c[500]:>11.2f}")
if len(RIS) == 2:
    ka, kb = list(RIS)
    print("")
    print(f"  differenza (MINIMA − COMPLETA):")
    a1, b1, c1 = RIS[ka]
    a2, b2, c2 = RIS[kb]
    print(f"    FILM    {a2[10]-a1[10]:+6.2f} @10 · {a2[100]-a1[100]:+6.2f} @100 · {a2[500]-a1[500]:+6.2f} @500")
    print(f"    PRODOTTO {b2[100]-b1[100]:+6.2f} @100 · {b2[500]-b1[500]:+6.2f} @500 · {b2[2000]-b1[2000]:+6.2f} @2000")
    print(f"    SERIE   {c2[10]-c1[10]:+6.2f} @10 · {c2[100]-c1[100]:+6.2f} @100 · {c2[500]-c1[500]:+6.2f} @500")
print(f"\n({time.time()-t0:.0f}s)")
