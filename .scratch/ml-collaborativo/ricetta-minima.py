"""ricetta-minima.py — LA RICETTA DOPO LA SOTTRAZIONE.

L'ablation dice che la ricetta finale porta zavorra:
  * `Kc` (i metadati puliti) non serve a NIENTE, da nessuna parte (delta +-0,1 ovunque)
  * `T` (i temi) e' neutro (+-0,17)
  * `CFst` non serve ai FILM (-0,15) e serve alle SERIE (-0,81 @100, -3,07 @500)
  * `B` non serve ai FILM (-0,26) e serve alle SERIE (-1,80 @100, -6,14 @500)
  * `CF` serve ai FILM (-7,06 @100 Trakt, -17,71 sul prodotto) e non alle serie
  * **LA CURATELA FA MALE**: toglierla da' +1,19 @100 e +1,27 @500 sul prodotto,
    +0,99 al @10 sul catalogo serie (1,99% -> 2,97%, cioe' +50%) e +0,27 sui film.

Quindi la ricetta minima candidata:
  FILM    CF da solo
  SERIE   CFst + B

Qui si misura, e si tara il rapporto CFst/B per le serie.
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


print("")
print("=" * 104)
print("RICETTA MINIMA — catalogo FILM: CF da solo, senza curatela")
print("=" * 104)
M = K.costruisci(C, {"CF": 1}, wc=0.0, beta=0.50)
Xf, chf = attiva(M, PF)
K.stampa("catalogo FILM (Trakt)", K.recall_catalogo(K.ranghi(Xf, ~is_tv), GF, chf, ~is_tv), 30)
E = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    E[PROF[u], j] = 1.0
Xp = K.rwr(M, E, alpha=0.30)
for j, u in enumerate(US):
    Xp[PROF[u], j] = -1e9
K.stampa("PRODOTTO (MovieLens 500)", K.recall_film(K.ranghi(Xp), US, PROF, ORO, IDX_FILM), 30)
del M, Xf, Xp

print("")
print("=" * 104)
print("RICETTA MINIMA — catalogo SERIE: CFst + B, senza curatela")
print("=" * 104)
RIS = {}
for et in ("CFst1 B1", "CFst1 B3", "CFst1 B5", "CFst3 B5", "CFst1 B10", "B da solo", "CFst da solo"):
    if et == "B da solo":
        pesi = {"B": 1}
    elif et == "CFst da solo":
        pesi = {"CFst": 1}
    else:
        a, b = et.replace("CFst", "").replace("B", "").split()
        pesi = {"CFst": int(a), "B": int(b)}
    Ms = K.costruisci(C, pesi, wc=0.0, beta=0.50)
    Xs, chs = attiva(Ms, PS)
    d = K.recall_catalogo(K.ranghi(Xs, is_tv), GS, chs, is_tv)
    RIS[et] = d
    K.stampa(f"SERIE  {et}", d, 30)
    del Ms, Xs

print("")
print("=" * 104)
print("CONFRONTO — ricetta completa (con curatela, 5 componenti) contro ricetta minima")
print("=" * 104)
print(f"  {'':<28} {'FILM @10':>9} {'FILM @100':>9} {'PROD @100':>10} {'PROD @500':>10} {'SERIE @10':>10} {'SERIE @100':>10}")
print(f"  {'COMPLETA (con curatela)':<28} {4.51:>9.2f} {21.16:>9.2f} {28.73:>10.2f} {62.48:>10.2f} {1.99:>10.2f} {17.37:>10.2f}")
print(f"  {'MINIMA (senza curatela)':<28} {'—':>9} {'—':>9} {'—':>10} {'—':>10} "
      f"{RIS['CFst1 B3'][10]:>10.2f} {RIS['CFst1 B3'][100]:>10.2f}")
print(f"\n({time.time()-t0:.0f}s)")
