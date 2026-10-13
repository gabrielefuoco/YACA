"""01-causa.py — LA CAUSA VERA DEL NUMERO CHE NON SI RIPRODUCE.

Fatto: `canone-misure.log` (12/10 19:54) riporta il prodotto a 5,99 / 29,61 / 63,35 / 87,86.
Oggi lo stesso script da' 6,00 / 29,56 / 63,31 / 87,85. Differenza piccola ma reale.

Ipotesi 1 (sbagliata) — l'ordine di indice sul bordo della classifica: dimostrata FALSA da
01-tie.py (zero titoli irraggiungibili, i due protocolli scelgono gli stessi titoli 1000/1000).

Ipotesi 2 — `boot-B.npz` e' stato RIGENERATO il 13/10 alle 17:53 (report 70: da 2,2M a 4,0M archi,
la vecchia versione salvata come `boot-B-3k.npz`), DOPO la misura di riferimento. E il grafo
canonico del prodotto contiene B a peso 1.

Questo script la verifica: rifa' la stessa misura con B VECCHIA e con B NUOVA. Se con quella
vecchia torna 29,61, la causa e' dimostrata e il numero archiviato era valido per un grafo che
non esiste piu'.
"""
import pathlib, sys, time
import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

B_SCELTA = sys.argv[1] if len(sys.argv) > 1 else "boot-B.npz"
t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]


class ConBVecchia(K.Componenti):
    """Stessa cosa del canonico, ma B arriva dal file indicato."""

    def _fissi_(self):
        if self._fissi is None:
            self._fissi = {"B": K.carica_csr(B_SCELTA, self.n),
                           "T": K.carica_csr("boot-T.npz", self.n),
                           "K": K.carica_csr("boot-Kpari.npz", self.n)}
        return self._fissi


CMP = ConBVecchia(n)
C = CMP(60)
B = C["B"]
print(f"B = {B_SCELTA}: {B.nnz:,} archi")
M = K.costruisci(C, {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, wc=0.60, beta=0.50)
print(f"grafo canonico: {M.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)

PROF, ORO = K.banco_prodotto(row_of, quanti=1000, parte="verifica")
US = np.array(list(PROF.keys()))
E = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    E[PROF[u], j] = 1.0
X = K.rwr(M, E, alpha=0.30)
for j, u in enumerate(US):
    X[PROF[u], j] = -1e9
R = K.ranghi(X)
r = K.recall_film(R, US, PROF, ORO, IDX_FILM)
print("")
K.stampa(f"prodotto con B = {B_SCELTA}", r)
print(f"  atteso con B vecchia: 5,99 / 29,61 / 63,35 / 87,86")
print(f"  atteso con B nuova:   6,00 / 29,56 / 63,31 / 87,85")
ok = all(abs(r[N] - v) < 0.01 for N, v in ((10, 5.99), (100, 29.61), (500, 63.35), (2000, 87.86)))
okn = all(abs(r[N] - v) < 0.01 for N, v in ((10, 6.00), (100, 29.56), (500, 63.31), (2000, 87.85)))
print(f"  >>> {'RIPRODUCE LA B VECCHIA' if ok else ('RIPRODUCE LA B NUOVA' if okn else 'NON RIPRODUCE NESSUNA DELLE DUE')}")
print(f"({time.time()-t0:.0f}s)")
