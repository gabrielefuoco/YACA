"""k-beta-minima.py — RITARATURA DI k E beta SULLA RICETTA MINIMA.

k e beta erano gli ottimi di un grafo a SEI componenti. Ora la ricetta e' minima:
  FILM   CF da solo
  SERIE  CFst + B (pesi uguali)
e le condizioni sono cambiate: con un solo componente k controlla TUTTA la densita' del grafo,
e senza Kc (6,5 milioni di archi) il grafo e' piu' rado, quindi beta serve meno.

Sweep: prima k (con beta 0,50), poi beta (al k migliore). Il riferimento a 300 utenti MovieLens
e' calcolato dentro la stessa esecuzione, cosi' il confronto e' interno.
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
PROF, ORO = K.banco_prodotto(row_of, quanti=300, parte="calibrazione")
US = np.array(list(PROF.keys()))
print(f"MovieLens: {len(US)} utenti")

CMP = K.Componenti(n)
print(f"({time.time()-t0:.0f}s)", flush=True)


def attiva(M, semi_di, alpha=0.30, lotto=150):
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


def giro(k, beta):
    C = CMP(k)
    # FILM: CF da solo
    M = K.costruisci(C, {"CF": 1}, wc=0.0, beta=beta)
    Xf, chf = attiva(M, PF)
    a = K.recall_catalogo(K.ranghi(Xf, ~is_tv), GF, chf, ~is_tv)
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0
    Xp = K.rwr(M, E, alpha=0.30)
    for j, u in enumerate(US):
        Xp[PROF[u], j] = -1e9
    b = K.recall_film(K.ranghi(Xp), US, PROF, ORO, IDX_FILM)
    del M, Xf, Xp
    # SERIE: CFst + B
    Ms = K.costruisci(C, {"CFst": 1, "B": 1}, wc=0.0, beta=beta)
    Xs, chs = attiva(Ms, PS)
    c = K.recall_catalogo(K.ranghi(Xs, is_tv), GS, chs, is_tv)
    del Ms, Xs
    return a, b, c


print("")
print("=" * 104)
print("SWEEP DI k  (beta = 0,50)")
print("=" * 104)
print(f"  {'k':>5} | {'FILM @10':>9} {'FILM @100':>10} {'FILM @500':>10} | "
      f"{'PROD @100':>10} {'PROD @500':>10} {'PROD @2000':>11} | {'SERIE @10':>10} {'SERIE @100':>11} {'SERIE @500':>11}")
RIS = {}
for k in (15, 30, 60, 120, 240):
    a, b, c = giro(k, 0.50)
    RIS[k] = (a, b, c)
    print(f"  {k:>5} | {a[10]:>9.2f} {a[100]:>10.2f} {a[500]:>10.2f} | "
          f"{b[100]:>10.2f} {b[500]:>10.2f} {b[2000]:>11.2f} | "
          f"{c[10]:>10.2f} {c[100]:>11.2f} {c[500]:>11.2f}   ({time.time()-t0:.0f}s)", flush=True)

# il k migliore: media dei ranghi normalizzati sui tre metri principali
def punteggio(v):
    a, b, c = v
    return (a[100] / 21.0 + b[100] / 29.3 + c[100] / 17.8) / 3.0


k_mig = max(RIS, key=lambda k: punteggio(RIS[k]))
print(f"\n  k migliore: {k_mig}")

print("")
print("=" * 104)
print(f"SWEEP DI beta  (k = {k_mig})")
print("=" * 104)
print(f"  {'beta':>5} | {'FILM @10':>9} {'FILM @100':>10} {'FILM @500':>10} | "
      f"{'PROD @100':>10} {'PROD @500':>10} {'PROD @2000':>11} | {'SERIE @10':>10} {'SERIE @100':>11} {'SERIE @500':>11}")
RISB = {}
for beta in (0.0, 0.25, 0.50, 0.75, 1.0):
    a, b, c = giro(k_mig, beta)
    RISB[beta] = (a, b, c)
    print(f"  {beta:>5.2f} | {a[10]:>9.2f} {a[100]:>10.2f} {a[500]:>10.2f} | "
          f"{b[100]:>10.2f} {b[500]:>10.2f} {b[2000]:>11.2f} | "
          f"{c[10]:>10.2f} {c[100]:>11.2f} {c[500]:>11.2f}   ({time.time()-t0:.0f}s)", flush=True)

b_mig = max(RISB, key=lambda x: punteggio(RISB[x]))
print(f"\n  beta migliore: {b_mig}")
print(f"\n({time.time()-t0:.0f}s)")
