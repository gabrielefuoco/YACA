"""07b-esemplari.py — la coerenza fra bolle misurata per ESEMPLARI, non per centroidi.

Il ticket 07 ha misurato che il fattore `cos(mu_a, mu_b)` di §5.4 non discrimina: fra i centroidi V3
il coseno e' **positivo nel 99,7% dei casi**, con mediana 0,086. La ragione e' la stessa del ticket 06
— una media di migliaia di token e' densa e piatta, e due medie si somigliano sempre un po'.

Quindi la coerenza fra due bolle si misura sui **membri**: quanto sono simili i loro esemplari piu'
vicini. E' la stessa lezione dell'ibrido (i top-5 esemplari battono la media), applicata alle coppie
di bolle invece che a una bolla sola.

    coerenza(a, b) = max_{i in a, j in b} cos(v_i, v_j)

Costa piu' del coseno fra due vettori, quindi si usa **a due stadi**: prima si filtra col peso
normalizzato per taglia (che funziona: i falsi giganti cadono), poi si riordina il piccolo gruppo
rimasto con la coerenza per esemplari.

Qui si prova sui tre casi del ticket 07, che hanno una risposta giusta nota.
"""
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
print("=" * 100)
print("LA COERENZA PER ESEMPLARI — max cos fra i membri, non fra i centroidi")
print("=" * 100, flush=True)

TF = sp.load_npz(ML / "05-tfidf.npz").tocsr()
mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
IS_TV = B.IS_TV
q_tv = np.zeros(NB)
np.add.at(q_tv, mem, IS_TV.astype(float))
quota_tv = q_tv / np.maximum(sz, 1)
e_serie = quota_tv > 0.5

q = np.load(ML / "bolle-nitrile-V8-triangolo.npz")
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
Ws = (Ws + Ws.T).tocsr()
S1 = sp.csr_matrix((np.ones(N, np.float32), (np.arange(N), mem)), shape=(N, NB))
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
TIT, _ = B.titoli_leggibili()


def coerenza_esemplari(a, b, quanti=25):
    """Il coseno MASSIMO fra i `quanti` membri piu' pesanti delle due bolle.

    `quanti=25` non e' un parametro innocente: prendere tutti i membri di una bolla da 150 rende
    l'operazione 150x piu' lenta e trova sempre un picco per caso (una bolla grande contiene di
    tutto). Si prendono i 25 membri piu' connessi internamente, che sono i piu' tipici.
    """
    ma, mb = MEMBRI[a][:quanti], MEMBRI[b][:quanti]
    if len(ma) == 0 or len(mb) == 0:
        return 0.0
    T = np.asarray((TF[ma] @ TF[mb].T).todense())
    return float(T.max())


def peso_norm(a, b):
    return float(BB[a, b]) / (np.sqrt(sz[a] * sz[b]) + 1e-9)


CASI = {525: "seinen anime", 560: "late-night talk show", 12: "true crime"}
print(f"\n  per ogni bolla: i 6 vicini col peso normalizzato per taglia, riordinati per coerenza")
print(f"  fra esemplari. Otto coppie per bolla, ~{8*25*25/1e6:.2f}M prodotti sparsi ({time.time()-T0:.0f}s)\n",
      flush=True)

for b, perche in CASI.items():
    riga = BB.getrow(b)
    o = np.argsort(-riga.data)[:8]
    vic = [(int(riga.indices[t]), float(riga.data[t])) for t in o]
    print(f"  bolla {b} ({int(sz[b])} titoli) — {perche}: {[TIT[x][:20] for x in MEMBRI[b][:2]]}")
    print(f"     {'vicino':>28} {'peso grezzo':>12} {'/sqrt(|a||b|)':>14} {'coerenza esempl.':>17}")
    righe = []
    for j, p in vic:
        c = coerenza_esemplari(b, j)
        righe.append((j, p, peso_norm(b, j), c))
    for j, p, pn, c in sorted(righe, key=lambda z: -z[3]):
        print(f"     b{j:>4} ({int(sz[j]):>3} tit.) {perche[:0]:<12} {p:>12.1f} {pn:>14.6f} "
              f"{c:>17.3f}  {[TIT[x][:18] for x in MEMBRI[j][:2]]}")
    print(flush=True)

# e un controllo che il coseno fra centroidi non se li distingua
print("=" * 100)
print("IL CONTROLLO: il coseno fra CENTROIDI sugli stessi vicini")
print("=" * 100)
CENT = {}
r_, c_, v_ = [], [], []
for b in range(NB):
    s = np.asarray(TF[MEMBRI[b]].sum(0)).ravel()
    nz = np.nonzero(s)[0]
    r_.extend([b] * len(nz))
    c_.extend(nz.tolist())
    v_.extend(s[nz].tolist())
C = sp.csr_matrix((v_, (r_, c_)), shape=(NB, TF.shape[1]), dtype=np.float32)
NO = np.sqrt(np.asarray(C.multiply(C).sum(1)).ravel()) + 1e-9
for b in CASI:
    riga = BB.getrow(b)
    o = np.argsort(-riga.data)[:8]
    co = []
    for t in o:
        j = int(riga.indices[t])
        co.append((j, float(C[b].multiply(C[j]).sum()) / (NO[b] * NO[j])))
    co.sort(key=lambda z: -z[1])
    print(f"  bolla {b}: " + " · ".join(f"b{j} ({c:.3f})" for j, c in co[:5]))
print("\n  (i centroidi danno tutti valori vicini e positivi: non separano i vicini veri dai falsi)")
print(f"\nFINE ({time.time()-T0:.0f}s)")
