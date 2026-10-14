"""21-decisione.py — TICKET 21: la decisione di ricetta, con la regola scritta PRIMA dei numeri.

LA REGOLA, scritta e datata prima di produrre i numeri (13/10/2026):

  1. INVARIANZA CROSS-DOMINIO. Un componente estratto da una sorgente si valida se migliora o NON
     DEGRADA il banco dell'altra. Un componente nato dai dati di comportamento si valida sul banco
     comportamentale di origine opposta.
  2. MINIMAX NORMALIZZATO. Si misura la percentuale del tetto (o il guadagno relativo alla baseline)
     di CIASCUN banco, e si sceglie la ricetta che massimizza il MINIMO dei guadagni.
  3. I PARAMETRI LIBERI NON CRESCONO. La ricetta non ha piu' di quattro parametri liberi.
  4. UN NEGATIVO DICHIARATO E' UN RISULTATO AMMESSO. Se nessuna ricetta vince sul minimo, si dice.

LE CANDIDATE, enumerate PRIMA:
  R0  MINIMA           film = CF ; serie = CFst + B
  R1  MINIMA + TV      il ponte cross-medium nel recupero, su entrambi i cataloghi
  R2  MINIMA + TV + LIST   le liste curate a peso 0,5 sul catalogo film
  R3  R2 + decadimento (tau 365) + gating (tau0 = 5)

IL TEST CHE MANCAVA: TV e' estratta dalle cronologie TRACK, e i banchi su cui e' stata misurata
(ticket 17) sono i banchi Trakt. **L'invarianza cross-dominio chiede che TV migliori anche il banco
MovieLens** — che e' l'altra sorgente. Non era mai stato misurato, ed e' cio' che questo script fa.

Uso:  python .scratch/grafo-servibile/21-decisione.py
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
for _nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    C[_nome] = K.carica_csr(f"nuovo-{_nome}.npz", n)      # non sono nella cache dei componenti
TV = C["TV"]
LISTA = K.carica_csr("nuovo-LIST.npz", n)
d_behav = np.asarray(((C["CF"] + C["CF"].T) > 0).sum(1)).ravel() + \
          np.asarray(((C["B"] + C["B"].T) > 0).sum(1)).ravel()
STRUTT = None
for nome in ("CFst", "KW", "DIR", "CAST", "COLL"):
    A = K.correggi_hub(C[nome], 0.25)
    STRUTT = A if STRUTT is None else STRUTT + A
print(f"componenti pronti ({time.time()-t0:.0f}s)", flush=True)


def cammina(M, etichetta):
    X = E.copy()
    for _ in range(20):
        X = 0.30 * (M.T @ (VIVO * X)) + 0.70 * E
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
        X[ESCL[:, j], j] = -1e9
    g = K.recall_film(K.ranghi(X, ~is_tv), US, PROF, ORO, IDX_FILM, NS)
    K.stampa(etichetta, g)
    return g


print("")
print("=" * 100)
print("L'INVARIANZA CROSS-DOMINIO: TV (sorgente Trakt) sul banco MovieLens")
print("=" * 100)
CF = K.correggi_hub(C["CF"], 0.25)
r0 = cammina(K.normalizza(CF), "R0  MINIMA (CF da solo)")
ris = {"R0": r0}
for w in (0.25, 0.5, 1.0):
    r = cammina(K.normalizza((CF + K.correggi_hub(TV, 0.25) * w).tocsr()), f"R0 + TV (peso {w})")
    ris[f"TV{w}"] = r
print("")
print(f"  {'diff. da R0':<46} " + " ".join(f"{'@' + str(N):>9}" for N in NS))
for w in (0.25, 0.5, 1.0):
    print(f"  {'TV peso ' + str(w):<46} " + " ".join(f"{ris[f'TV{w}'][N]-r0[N]:>+9.2f}" for N in NS))

# anche le liste, per completezza del confronto
rL = cammina(K.normalizza((CF + K.correggi_hub(LISTA, 0.25) * 0.5).tocsr()), "R0 + LIST (peso 0,5)")
print("")
print(f"  {'LIST peso 0,5':<46} " + " ".join(f"{rL[N]-r0[N]:>+9.2f}" for N in NS))
rTL = cammina(K.normalizza((CF + K.correggi_hub(TV, 0.25) * 0.5 + K.correggi_hub(LISTA, 0.25) * 0.5).tocsr()),
              "R0 + TV (0,5) + LIST (0,5)")
print(f"  {'TV 0,5 + LIST 0,5':<46} " + " ".join(f"{rTL[N]-r0[N]:>+9.2f}" for N in NS))

print("")
print("=" * 100)
print("I NUMERI DEI DUE BANCHI, PER IL MINIMAX")
print("=" * 100)
print("""
  banco PRODOTTO (MovieLens, temporale + mascheramento, 997 utenti):
    R0 MINIMA           29,31 / 63,35 / 89,87      (ticket 66, @100/@500/@2000)
    + decadimento       +0,13 al @100, +0,44 al @500
    + gating (tau0=5)   +0,25 al @100, -0,50 al @500
    + LIST (0,5)        +0,52 al @100, +0,52 al @500   MA -1,34 su mezzo+coda al @500
  banco TRACK (split casuale, 5 fold in cross-validazione, ticket 17):
    R0 MINIMA  film 4,23 / serie 2,86        (@10)
    + TV       film 5,32 (+1,09) / serie 5,04 (+2,19)   <-- su TUTTE e 5 i fold
  banco CURATO (1.002 legami di test, ticket 19):
    pesi a mano  11,88 / 26,85 / 46,41
    pesi appresi 14,47 / 33,83 / 54,79  (+2,59 / +6,99 / +8,38)
""")
print("  ATTENZIONE AI PROTOCOLLI: i tre banchi usano protocolli DIVERSI (temporale+mascheramento,")
print("  split casuale con cross-validazione, banco curato). Un minimax che attraversa protocolli")
print("  diversi somma mele e arance: il minimo va preso DENTRO ciascun banco, e le ricette si")
print("  confrontano solo dove la stessa ricetta e' stata misurata sullo stesso banco.")
print(f"\nFINE ({time.time()-t0:.0f}s)")
