"""21-bis-coda.py — LA DOMANDA CHE IL 21 NON HA RISPOSTO: TV migliora la CODA o solo la testa?

Il ticket 21 ha deciso la ricetta (film = CF + TV 0,5) misurando la recall GLOBALE: 2,89 -> 3,27
al @10, 18,94 -> 20,15 al @100. Ma il prodotto vuole l'**azzeccato non banale**, e la metrica che
lo misura e' **mezzo+coda** (fuori dal top 5% di popolarita').

Se TV migliora solo la testa, la decisione del 21 e' sbagliata per il prodotto anche se i numeri
salgono. Se migliora anche la coda, e' la prima volta in questa sessione che qualcosa va nella
direzione giusta SU ENTRAMBE.

Stesso banco e stesso protocollo del 21: temporale + mascheramento, 997 utenti.
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
PROF, ORO, TU, TE = {}, {}, {}, {}
for u, g in RR.groupby("userId"):
    g = g.sort_values("timestamp")
    righe = g["row"].values.astype(np.int64)
    ts = g["timestamp"].values.astype(np.int64)
    if len(righe) < 20:
        continue
    t = int(0.6 * len(righe))
    PROF[u] = righe[:t]
    ORO[u] = set(righe[t:].tolist())
    TU[u] = ts[t - 1]
    TE[u] = ts[-1]
US = np.array(list(PROF.keys()))
lim = np.array([TU[u] // GIORNO - 90 for u in US])
fine = np.array([TE[u] // GIORNO for u in US])
VIVO = (uscite[:, None] <= lim[None, :]) | (uscite[:, None] < 0)
ESCL = uscite[:, None] > fine[None, :]
E = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    E[PROF[u], j] = 1.0

CMP = K.Componenti(n)
C = CMP(30)
TV = K.carica_csr("nuovo-TV.npz", n)
print(f"pronti ({time.time()-t0:.0f}s)", flush=True)


def misura(M, etichetta):
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
        rk.append(R[gg, j])
        fb.append(fas_film[gg])
        si.append(si_film[gg])
    rk, fb, si = np.concatenate(rk), np.concatenate(fb), np.concatenate(si)
    mc = K.per_fascia(rk, fb, NS)["mezzo+coda"]
    ai = K.recall_si(rk, si, 1.0, NS)
    K.stampa(etichetta + " GLOBALE", g)
    K.stampa("                 MEZZO+CODA", mc)
    K.stampa("                 AUTO-INF", ai)
    return {"g": g, "mc": mc, "si": ai}


print("")
print("=" * 100)
print("R0 (CF da solo) contro R1 (CF + TV 0,5) — banco temporale con mascheramento")
print("=" * 100)
CF = K.correggi_hub(C["CF"], 0.25)
r0 = misura(K.normalizza(CF), "R0 MINIMA   ")
r1 = misura(K.normalizza((CF + K.correggi_hub(TV, 0.25) * 0.5).tocsr()), "R1 + TV (0,5)")

print("")
print("=" * 100)
print("DIFFERENZA R1 - R0")
print("=" * 100)
print(f"  {'':<12} " + " ".join(f"{'@' + str(N):>12}" for N in NS))
for chiave, nome in (("g", "GLOBALE"), ("mc", "MEZZO+CODA"), ("si", "AUTO-INF")):
    print(f"  {nome:<12} " + " ".join(f"{r1[chiave][N]-r0[chiave][N]:>+12.3f}" for N in NS))
print("")
mq = r1["mc"][10] - r0["mc"][10]
print(f"  >>> la CODA al @10 cambia di {mq:+.3f}: " +
      ("TV migliora la coda, non solo la testa." if mq > 0.05 else
       "TV NON migliora la coda: il guadagno e' tutto sulla testa del catalogo."))
print(f"  >>> la testa @10 cambia di {r1['g'][10]-r0['g'][10]:+.3f} e la coda di {mq:+.3f}: "
      f"il rapporto e' {(r1['g'][10]-r0['g'][10])/max(mq,1e-9):.1f}x")
print(f"\nFINE ({time.time()-t0:.0f}s)")
