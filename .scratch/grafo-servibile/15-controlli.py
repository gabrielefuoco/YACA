"""15-controlli.py — I CONTROLLI DEL TICKET 15, FATTI COME SI DEVE.

Qui c'e' una storia di due bug miei, che vale la pena scrivere perche' e' la terza volta in questa
sessione che un artefatto nasce da uno strumento e non dal mondo.

BUG 1. In `15-cesto.py` il controllo di popolarita' passava `K.ranghi_popolare(...)` a `misura`, che
chiama `K.ranghi` sopra. Ma `ranghi_popolare` restituisce un RANGO (0 = il piu' votato) e `K.ranghi`
rimescola per PUNTEGGIO decrescente: rango 0 = punteggio minimo. La popolarita' veniva INVERTITA, e
il controllo dava 0,00% dove il numero archiviato e' 0,94% (misurato sul banco a split casuale).

BUG 2. La mia prima "correzione" ha negato i voti (`Rp = -voti`), introducendo la stessa inversione
al contrario.

La lezione: `K.ranghi` prende PUNTEGGI, non ranghi. E i controlli vanno costruiti con la stessa
esclusione del profilo che si applica alla camminata, altrimenti si confrontano due protocolli.

Nessun grafo, nessuna camminata: solo i ranghi e l'oro. Gira in secondi.
"""
import pathlib, sys, time
import numpy as np
import pandas as pd

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
PROF, ORO, ESCL = [], [], []
for u, g in RR.groupby("userId"):
    g = g.sort_values("timestamp")
    righe = g["row"].values.astype(np.int64)
    ts = g["timestamp"].values.astype(np.int64)
    if len(righe) < 20:
        continue
    t = int(0.6 * len(righe))
    PROF.append(righe[:t])
    ORO.append(set(righe[t:].tolist()))
    ESCL.append(np.unique(righe[uscite[righe] > ts[-1] // GIORNO]))
print(f"{len(ORO)} utenti · {sum(len(g) for g in ORO):,} titoli d'oro ({time.time()-t0:.0f}s)")

base_film = np.where(~is_tv, np.asarray(voti, np.float64), -1.0)
base_idx = -np.arange(n, dtype=np.float64)


def misura(base, etichetta, escludi_profilo):
    """La recall a @N di una classifica FISSA. Il rango si ricalcola a ogni utente."""
    m = np.zeros(len(NS))
    den = 0
    for j in range(len(ORO)):
        s = base.copy()
        s[is_tv] = -1e30                    # filtro di catalogo: si serve solo il film
        s[ESCL[j]] = -1e30
        if escludi_profilo:
            s[PROF[j]] = -1e30
        o = np.argsort(-s, kind="stable")   # ordine decrescente: rank 0 = il piu' alto
        rank = np.empty(n, np.int64)
        rank[o] = np.arange(n, dtype=np.int64)
        gg = np.fromiter(ORO[j], np.int64, len(ORO[j]))
        rk = rank[gg]
        for i, N in enumerate(NS):
            m[i] += float((rk < N).sum())
        den += len(gg)
    d = {N: 100 * m[i] / den for i, N in enumerate(NS)}
    print(f"  {etichetta:<48} " + " · ".join(f"@{N} {d[N]:6.2f}%" for N in NS), flush=True)
    return d


print("")
print("=" * 100)
print("I CONTROLLI, CON E SENZA L'ESCLUSIONE DEL PROFILO")
print("=" * 100)
print("  (la camminata esclude il profilo: i controlli devono fare lo stesso, o si confrontano")
print("   due protocolli diversi — ed e' la differenza fra 0,00% e 1,47%)")
misura(base_film, "popolarita'  — profilo escluso", True)
misura(base_film, "popolarita'  — profilo NON escluso", False)
misura(base_idx, "ordine di indice — profilo escluso", True)
misura(base_idx, "ordine di indice — profilo NON escluso", False)
print("")
print("  Riferimento: la camminata mascherata del ticket 03/15, profilo escluso:")
print("    @10 2,89 · @100 18,94 · @500 47,78")
print("  Riferimento archiviato (report 68, split temporale, catalogo film, SENZA mascheramento):")
print("    camminata 2,87/18,21/46,14 · popolarita' 0,94/7,36/25,04")
print(f"\nFINE ({time.time()-t0:.0f}s)")
