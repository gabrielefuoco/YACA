"""18-bis-recupero.py — TICKET 18, il criterio che mancava: il componente LIST nel RECUPERO.

La verifica A ha detto che le liste portano segnale comportamentale vero (6,9x il caso). Ma la
domanda del ticket e' un'altra: **metterlo nel grafo di recupero migliora o degrada?**

Il componente copre solo il 14,8% del catalogo (9.835 titoli su 66.259), quindi ci sono due
possibilita' opposte e vanno distinte:
  * e' preciso ma raro -> migliora dove arriva e non tocca il resto;
  * e' raro -> aggiunge rumore su una fetta e non paga.
Stessa forma del ticket 16: la ricetta film e' CF da solo, e qui si aggiunge LIST con un peso.

Uso:  python .scratch/grafo-servibile/18-bis-recupero.py
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

# i titoli che le liste coprono: la domanda "migliora DOVE ARRIVA?" si risponde cosi'
LISTA = K.carica_csr("nuovo-LIST.npz", n)
coperti = np.asarray((LISTA > 0).sum(1)).ravel() > 0
print(f"LIST copre {int(coperti.sum()):,} titoli · titoli d'oro coperti "
      f"{sum(1 for u in US for x in ORO[u] if coperti[x]):,} su {sum(len(ORO[u]) for u in US):,}")

CMP = K.Componenti(n)
C = CMP(30)
CFn = K.correggi_hub(C["CF"], 0.25)
LISTn = K.correggi_hub(LISTA, 0.25)
E = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    E[PROF[u], j] = 1.0


def misura(w, etichetta):
    M = K.normalizza((CFn + LISTn * w).tocsr()) if w > 0 else K.normalizza(CFn)
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
    ainf = K.recall_si(rk, si, 1.0, NS)
    # e solo sull'oro che le liste coprono
    ouro_c = {u: {x for x in ORO[u] if coperti[x]} for u in US}
    gc = K.recall_film(R, US, PROF, ouro_c, IDX_FILM, NS) if sum(len(v) for v in ouro_c.values()) else {}
    print(f"  {etichetta:<28} " + " · ".join(f"@{N} {g[N]:5.2f}/{mc[N]:5.2f}/{ainf[N]:5.2f}" for N in NS))
    if gc:
        print(f"  {'':<28} oro COPERT0 dalle liste " + " · ".join(f"@{N} {gc[N]:5.2f}%" for N in NS))
    return {"glob": g, "mc": mc, "si": ainf}


print("")
print("=" * 106)
print("IL COMPONENTE LIST NEL RECUPERO — banco temporale con mascheramento, formato @N globale/mc/auto-inf")
print("=" * 106)
print("  la riga w=0 (CF da solo) deve riprodurre 2,89/18,94/47,78")
ris = {}
for w in (0.0, 0.5, 1.0, 2.0):
    ris[w] = misura(w, f"LIST peso {w}")
print("")
print(f"  {'':<28} " + " ".join(f"{'@' + str(N):>22}" for N in NS))
for w, d in ris.items():
    if w == 0:
        continue
    print(f"  peso {w:<23} " + " ".join(
        f"glob {d['glob'][N]-ris[0.0]['glob'][N]:+5.2f} mc {d['mc'][N]-ris[0.0]['mc'][N]:+5.2f}"
        f" si {d['si'][N]-ris[0.0]['si'][N]:+5.2f}" for N in NS))
print("  (differenze rispetto a CF da solo)")
print(f"\nFINE ({time.time()-t0:.0f}s)")
