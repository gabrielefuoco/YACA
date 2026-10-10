"""taratura3.py — ultima salita: k grande, pesi spinti, e due stadi col Borda come recuperatore."""
import numpy as np, pathlib
from scipy.sparse import coo_matrix, csr_matrix
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
fin = np.load(ML/"etero-final2.npz")
Rs = fin["Rs"]; Rt = fin["Rt"]; BERS = fin["bersagli"]; COL = fin["col"]
n = Rt.shape[0]
def misura(nome, R, silenzio=False):
    rk = R[BERS, COL]; NS = [10, 50, 100, 500, 2000]
    o = {k: 100*float((rk < k).mean()) for k in NS}
    if not silenzio:
        print(f"  {nome:<42} " + " · ".join(f"@{k} {o[k]:5.1f}%" for k in NS))
    return o
def ranghi_da_punteggio(P):
    R = np.empty(P.shape, np.int32)
    for j in range(P.shape[1]): R[np.argsort(-P[:, j]), j] = np.arange(n)
    return R
print("=== RRF: k grande e pesi spinti ===")
best = None
for k0 in (3000, 10000, 30000, 100000):
    for ws in (3.0, 5.0, 8.0):
        for wt in (0.3, 0.5, 0.8):
            R = ranghi_da_punteggio(ws/(k0+Rs) + wt/(k0+Rt))
            o = misura(f"k={k0} {ws}/{wt}", R, silenzio=True)
            if best is None or o[10] > best[3][10]: best = (k0, ws, wt, o, R)
print(f"  migliore: k={best[0]} w_sp={best[1]} w_th={best[2]}")
misura(f"RRF k={best[0]} {best[1]}/{best[2]}", best[4])
misura("Borda puro", ranghi_da_punteggio(-(Rs.astype(float)) - (Rt.astype(float))))
print("\n=== DUE STADI col Borda come recuperatore ===")
# il punteggio combinato del Borda, e il teacher che riordina dentro il pool
P_borda = -(Rs.astype(float)) - (Rt.astype(float))
for N in (100, 500, 2000):
    R = np.full((n, Rt.shape[1]), n, np.int32)
    for j in range(Rt.shape[1]):
        pool = np.argsort(-P_borda[:, j])[:N]
        # dentro il pool: ordino per il teacher (Rt = ranghi, piu' piccolo = meglio)
        ordine = pool[np.argsort(Rt[pool, j])]
        R[ordine, j] = np.arange(len(pool))
    misura(f"Borda top-{N} riordinato dal teacher", R)
# variante: punteggio misto finale = ranghi normalizzati (non RRF)
for w in (0.3, 0.5, 0.7):
    Rn = Rs.astype(float)/n; Tn = Rt.astype(float)/n
    misura(f"punteggio misto {w:.1f}*spreading + {1-w:.1f}*teacher", ranghi_da_punteggio(-(w*Rn + (1-w)*Tn)))
print("\n=== migliori finali (riferimento) ===")
misura("teacher solo", Rt)
print("\nsalvo i ranghi migliori per il prodotto")
np.savez_compressed(ML/"etero-rrf-best.npz", R=best[4], bersagli=BERS, col=COL)
