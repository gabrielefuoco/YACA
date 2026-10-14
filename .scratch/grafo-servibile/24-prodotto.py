"""24-prodotto.py — TICKET 24, parte A: TUTTE LE CANDIDATE CON LE TRE METRICHE AFFIANCATE.

Il ticket 21 ha scelto la ricetta misurando la sola recall GLOBALE, e la coda e' peggiorata. Qui si
rimisura tutto con le tre metriche INSIEME — globale, mezzo+coda, auto-informazione — e la decisione
si prende sulla CODA, che e' la metrica che il prodotto dichiara.

CANDIDATE (le stesse del 21, piu' le combinazioni):
  R0  CF da solo
  A   R0 + TV (0,5)
  B   R0 + LIST (0,5)
  C   R0 + TV (0,5) + LIST (0,5)
  D   R0 + decadimento (tau 365)
  E   R0 + gating (tau0 = 5)
  F   C + decadimento + gating   (la ricetta «tutto»)

Banco: prodotto, split temporale, mascheramento (ticket 03). 997 utenti, 62.322 titoli d'oro.
"""
import pathlib, sys, time
import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

GIORNO = 86_400
NS = (10, 100, 500)
t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
voti = K.voti()
uscite = np.load(K.ML / "uscite.npz")["giorni"]
fas_film = np.full(n, -1, np.int8)
fas_film[IDX_FILM] = K.fasce(voti[IDX_FILM])
si_film = np.zeros(n)
si_film[IDX_FILM] = K.auto_informazione(voti[IDX_FILM])

RR = pd.read_parquet(K.ML / "tempi-ml.parquet")
PROF, PROF_T, ORO, TU, TE = {}, {}, {}, {}, {}
for u, g in RR.groupby("userId"):
    g = g.sort_values("timestamp")
    righe = g["row"].values.astype(np.int64)
    ts = g["timestamp"].values.astype(np.int64)
    if len(righe) < 20:
        continue
    t = int(0.6 * len(righe))
    PROF[u] = righe[:t]
    PROF_T[u] = ts[:t]
    ORO[u] = set(righe[t:].tolist())
    TU[u] = ts[t - 1]
    TE[u] = ts[-1]
US = np.array(list(PROF.keys()))
lim = np.array([TU[u] // GIORNO - 90 for u in US])
fine = np.array([TE[u] // GIORNO for u in US])
VIVO = (uscite[:, None] <= lim[None, :]) | (uscite[:, None] < 0)
ESCL = uscite[:, None] > fine[None, :]

CMP = K.Componenti(n)
C = CMP(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    C[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
LISTA = K.carica_csr("nuovo-LIST.npz", n)
STRUTT = None
for nome in ("CFst", "KW", "DIR", "CAST", "COLL"):
    A = K.correggi_hub(C[nome], 0.25)
    STRUTT = A if STRUTT is None else STRUTT + A
d_behav = np.asarray(((C["CF"] + C["CF"].T) > 0).sum(1)).ravel() + \
          np.asarray(((C["B"] + C["B"].T) > 0).sum(1)).ravel()
print(f"componenti pronti ({time.time()-t0:.0f}s)", flush=True)

CF = K.correggi_hub(C["CF"], 0.25)
TV = K.correggi_hub(C["TV"], 0.25)
LI = K.correggi_hub(LISTA, 0.25)
# il gating: la struttura pesa max(lambda_i, lambda_j) con tau0 = 5
lam = (5.0 / (5.0 + d_behav)).astype(np.float32)
Sc = STRUTT.tocoo()
Sg = sp.csr_matrix((Sc.data * np.maximum(lam[Sc.row], lam[Sc.col]), (Sc.row, Sc.col)), shape=(n, n))


def semi(tau=None):
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        if tau is None:
            E[PROF[u], j] = 1.0 / len(PROF[u])
        else:
            eta = (TU[u] - PROF_T[u]) / (tau * GIORNO)
            w = np.exp2(-eta).astype(np.float32)
            E[PROF[u], j] = w / w.sum()
    return E


def misura(M, etichetta, tau=None):
    E = semi(tau)
    X = E.copy()
    for _ in range(20):
        X = 0.30 * (M.T @ (VIVO * X)) + 0.70 * E
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
        X[ESCL[:, j], j] = -1e9
    R = K.ranghi(X, ~is_tv)
    g = K.recall_film(R, US, PROF, ORO, IDX_FILM, NS)
    rk, fb, si = [], [], []
    for j, u in enumerate(US):
        gg = np.fromiter(ORO[u], np.int64, len(ORO[u]))
        rk.append(R[gg, j]); fb.append(fas_film[gg]); si.append(si_film[gg])
    rk, fb, si = np.concatenate(rk), np.concatenate(fb), np.concatenate(si)
    mc = K.per_fascia(rk, fb, NS)["mezzo+coda"]
    ai = K.recall_si(rk, si, 1.0, NS)
    print(f"  {etichetta:<26} globale " + " · ".join(f"@{N} {g[N]:5.2f}" for N in NS)
          + "   coda " + " · ".join(f"@{N} {mc[N]:5.2f}" for N in NS), flush=True)
    return {"g": g, "mc": mc, "si": ai}


print("")
print("=" * 118)
print("TUTTE LE CANDIDATE, CON LA CODA AFFIANCATA ALLA TESTA")
print("=" * 118)
ris = {}
ris["R0"] = misura(K.normalizza(CF), "R0  CF da solo")
ris["A"] = misura(K.normalizza((CF + TV * 0.5).tocsr()), "A   + TV (0,5)")
ris["B"] = misura(K.normalizza((CF + LI * 0.5).tocsr()), "B   + LIST (0,5)")
ris["C"] = misura(K.normalizza((CF + TV * 0.5 + LI * 0.5).tocsr()), "C   + TV + LIST")
ris["D"] = misura(K.normalizza(CF), "D   + decadimento (365)", tau=365)
ris["E"] = misura(K.normalizza((CF + Sg).tocsr()), "E   + gating (tau0=5)")
ris["F"] = misura(K.normalizza((CF + TV * 0.5 + LI * 0.5 + Sg).tocsr()), "F   tutto", tau=365)

print("")
print("=" * 118)
print("LA DECISIONE, PRESA SULLA CODA")
print("=" * 118)
base = ris["R0"]
print(f"  {'candidata':<20} " + " ".join(f"{'coda @' + str(N):>11}" for N in NS)
     + "    " + " ".join(f"{'glob @' + str(N):>11}" for N in NS))
for k, d in ris.items():
    if k == "R0":
        continue
    print(f"  {k:<20} " + " ".join(f"{d['mc'][N]-base['mc'][N]:>+11.3f}" for N in NS)
          + "    " + " ".join(f"{d['g'][N]-base['g'][N]:>+11.3f}" for N in NS))
print("")
print("  >>> una candidata va bene solo se la CODA non peggiora a nessuna soglia")
buone = [k for k, d in ris.items() if k != "R0"
         and all(d["mc"][N] >= base["mc"][N] - 0.02 for N in NS)]
if buone:
    print(f"      candidate che NON peggiorano la coda: {buone}")
    mig = max(buone, key=lambda k: sum(ris[k]["mc"][N] - base["mc"][N] for N in NS))
    print(f"      migliore sulla coda: {mig} "
          f"({sum(ris[mig]['mc'][N]-base['mc'][N] for N in NS):+.3f} somma sui tre tagli)")
else:
    print("      NESSUNA candidata migliora o tiene la coda. La ricetta di riferimento resta R0")
    print("      (la MINIMA), e il negativo e' dichiarato: ogni aggiunta di comportamento sposta")
    print("      la massa verso la testa del catalogo.")
print(f"\nFINE ({time.time()-t0:.0f}s)")
