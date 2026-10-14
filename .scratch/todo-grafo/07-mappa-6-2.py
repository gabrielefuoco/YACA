"""07-mappa-6-2.py — TICKET 07: la mappa a 6 vicini intra-medium + 2 ponti cross-medium simmetrizzati.

§2 dell'esperto: «la divisione 4 canonici + 2 vibe e' una tassonomia artificiale che non serve piu':
buttala via e tieni solo 6 vicini diretti + 2 ponti cross-medium». E §2.4: il ponte cross-medium va
**forzato simmetrico**, perche' *Guerre stellari* (film) vede *The Mandalorian* (serie) fra i suoi
vicini, ma *The Mandalorian* non vede *Guerre stellari*.

COME SI SIMMETRIZZA, e l'errore del primo tentativo. Avevo scritto: se `F` sceglie `S` e `S` ha gia'
due ponti, **sostituisci il piu' debole**. Sbagliato, e la misura l'ha detto subito: 2.691
sostituzioni, e **2.264 coppie restavano asimmetriche** — perche' sostituire evince un ponte che era
stato simmetrizzato prima, e il difetto si sposta invece di chiudersi.

L'esperto dice «**aggiungi** anche F ai ponti di S». Aggiungere, non sostituire: cosi' la lista cresce
e la simmetria e' vera per costruzione. Il costo: le bolle che molti scelgono come ponte avranno
**piu' di due** ponti. Lo dico invece di nasconderlo — e la mappa tiene la relazione completa, mentre
sta al prodotto decidere se mostrarne due.

E UN PROBLEMA PIU' GROSSO, che il ticket non chiedeva e che la misura ha portato a galla: **nessuna
bolla e' senza ponte**. Su 1.625 bolle, zero. Il grafo delle bolle ha 1.249.858 adiacenze su
1.306.536 coppie possibili — il 95,7% — quindi ogni bolla confina con tutte le altre, e «i 6 vicini
intra-medium + 2 ponti cross-medium» non selezionano niente: scelgono 8 numeri in una lista che li
contiene quasi tutti. La mappa a otto slot e' **formalmente giusta e praticamente vuota**, e va detto
prima che qualcuno la usi per decidere cosa mostrare.
"""
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
print("=" * 104)
print("TICKET 07 — LA MAPPA A 6+2, SIMMETRIZZATA (partizione V8)")
print("=" * 104, flush=True)

mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
IS_TV = B.IS_TV
q = np.load(ML / "bolle-nitrile-V8-triangolo.npz")
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
Ws = (Ws + Ws.T).tocsr()
S1 = sp.csr_matrix((np.ones(N, np.float32), (np.arange(N), mem)), shape=(N, NB))
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
q_tv = np.zeros(NB)
np.add.at(q_tv, mem, IS_TV.astype(float))
quota_tv = q_tv / np.maximum(sz, 1)
e_serie = quota_tv > 0.5
purezza = np.maximum(quota_tv, 1 - quota_tv)
grado = np.asarray((BB > 0).sum(1)).ravel()
print(f"  V8: {NB:,} bolle · {int(e_serie.sum()):,} serie e {int((~e_serie).sum()):,} film")
print(f"  grafo delle bolle: {BB.nnz:,} adiacenze su {NB*(NB-1)//2:,} coppie = "
      f"{100*BB.nnz/(NB*(NB-1)/2):.1f}%", flush=True)

# ============================================================ LA SATURAZIONE
print("\n" + "=" * 104)
print("LA SATURAZIONE — quanto vale davvero un vicino, su questo grafo")
print("=" * 104)
print(f"  grado di una bolla: mediana {int(np.median(grado)):,} · minimo {int(grado.min()):,} · "
      f"massimo {int(grado.max()):,} su {NB-1:,} possibili")
print(f"  -> una bolla su due confina con oltre {int(np.median(grado)):,} altre bolle. "
      f"«I 6 vicini» sono i primi 6 di {int(np.median(grado)):,}.")
# quanto pesa il sesto vicino rispetto al settimo? se il crollo non c'e', l'ordine e' arbitrario
rapporti, salti = [], []
for b in range(0, NB, 17):
    w = np.sort(BB.getrow(b).data)[::-1]
    if len(w) >= 8:
        rapporti.append(w[5] / max(w[6], 1e-9))
        salti.append(w.mean() and (w[5] - w[6]) / w.mean())
print(f"  peso del 6° vicino / 7°: mediana {np.median(rapporti):.3f} "
      f"(1,00 = indistinguibili). Su {len(rapporti)} bolle campionate.")
print(f"  il salto fra il 6° e il 7° e' {(np.median(salti)*100):.1f}% del peso medio degli archi.")
print("  Non c'e' un ginocchio: il sesto vicino non e' piu' importante del settimo.")

# ============================================================ i 6 + 2
INTRA = np.full((NB, 6), -1, np.int32)
CROSS = [set() for _ in range(NB)]
for b in range(NB):
    riga = BB.getrow(b)
    vic, w = riga.indices, riga.data
    stesso_m = (e_serie[vic] == e_serie[b])
    stesso, ws = vic[stesso_m], w[stesso_m]
    opposto, wo = vic[~stesso_m], w[~stesso_m]
    k = np.argsort(-ws)[:6]
    INTRA[b, :len(k)] = stesso[k]
    for j in opposto[np.argsort(-wo)[:2]]:
        CROSS[b].add(int(j))

print(f"\n  ponti cross-medium asimmetrici prima della correzione: "
      f"{sum(1 for b in range(NB) for j in CROSS[b] if b not in CROSS[j]):,}")

# LA UNIONE, che e' quello che chiede l'esperto. Niente sostituzioni.
for b in range(NB):
    for j in list(CROSS[b]):
        CROSS[j].add(b)
asimm = sum(1 for b in range(NB) for j in CROSS[b] if b not in CROSS[j])
lun = np.array([len(c) for c in CROSS])
print(f"  dopo la UNIONE simmetrica: coppie asimmetriche {asimm} (deve essere 0) · "
      f"ponti per bolla: mediana {int(np.median(lun))} · media {lun.mean():.1f} · massimo {int(lun.max())}")
print(f"  bolle con piu' di 2 ponti: {int((lun > 2).sum()):,}/{NB:,} "
      f"({100*(lun > 2).mean():.1f}%) — e' il prezzo dichiarato dell'unione")

# ---------------------------------------------------------------- il controllo di §2.4
print("\n" + "=" * 104)
print("IL CONTROLLO DI §2.4 — star Wars <-> The Mandalorian, nei DUE versi")
print("=" * 104)
TIT = np.array([""] * N, dtype=object)
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    for i, t in zip(d["id"], d[col]):
        r = B.ROW_OF.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)
bersaglio = {}
for b in range(NB):
    m_ = np.where(mem == b)[0]
    for nm, et in (("mandalorian", "Mandalorian"), ("star wars", "Star Wars")):
        if nm in bersaglio:
            continue
        for x in m_[:60]:
            if nm in TIT[x].lower():
                bersaglio[nm] = b
bs, bm = bersaglio.get("star wars"), bersaglio.get("mandalorian")
if bs is not None and bm is not None:
    print(f"  bolla {bs} ({int(sz[bs])} titoli, {'serie' if e_serie[bs] else 'film'}) · "
          f"bolla {bm} ({int(sz[bm])} titoli, {'serie' if e_serie[bm] else 'film'})")
    print(f"  {bs} vede {bm} fra i suoi ponti cross-medium? {'SÌ' if bm in CROSS[bs] else 'no'}")
    print(f"  {bm} vede {bs} fra i suoi ponti cross-medium? {'SÌ' if bs in CROSS[bm] else 'no'}")
    print(f"  e i primi intra di {bs}: {[TIT[np.where(mem == j)[0][0]][:20] for j in INTRA[bs] if j >= 0][:4]}")
    print(f"  e i primi intra di {bm}: {[TIT[np.where(mem == j)[0][0]][:20] for j in INTRA[bm] if j >= 0][:4]}")
else:
    print(f"  trovate: star wars {bs}, mandalorian {bm}")

# ---------------------------------------------------------------- purezza e pct_locale (ticket 14)
print("\n" + "=" * 104)
print("(purezza, pct_locale) SU V8 — ticket 14 di `grafo-servibile`")
print("=" * 104)
grado_t = np.asarray((Ws > 0).sum(1)).ravel()
dentro = np.zeros(N, np.float32)
for b in range(NB):
    m_ = np.where(mem == b)[0]
    dentro[m_] = np.asarray((Ws[m_][:, m_] > 0).sum(1)).ravel()
pct = dentro / np.maximum(grado_t, 1)
print(f"  purezza di medium: media {purezza.mean():.3f} · monomedium {int((purezza==1).sum()):,}/{NB:,}")
print(f"  pct_locale: mediana {np.median(pct):.3f} · media {pct.mean():.3f}")
for lo, hi in ((0.5, 0.7), (0.7, 0.9), (0.9, 1.01)):
    m = (purezza[mem] >= lo) & (purezza[mem] < hi)
    if m.sum():
        print(f"    purezza {lo:.1f}-{hi:.1f}: {int(m.sum()):>6,} titoli · pct_locale mediana "
              f"{np.median(pct[m]):.3f}")

cross_sim = np.full((NB, 4), -1, np.int32)
for b in range(NB):
    ordine_c = sorted(CROSS[b], key=lambda j: -BB[b, j])[:4]
    cross_sim[b, :len(ordine_c)] = ordine_c
np.savez_compressed(ML / "bolle-nitrile-V8-mappa-6-2.npz",
                    intra=INTRA, cross=cross_sim, cross_lun=lun, purezza=purezza,
                    pct_locale=pct, quota_tv=quota_tv, sz=sz, grado_bolla=grado, mem=mem)
print(f"\n  salvata: bolle-nitrile-V8-mappa-6-2.npz")
print(f"  `intra` (NB x 6) · `cross` (NB x 4, la relazione simmetrica troncata per il prodotto)")
print(f"  `cross_lun` la lunghezza vera della lista simmetrica · `purezza` · `pct_locale` · `grado_bolla`")
print(f"\nFINE ({time.time()-T0:.0f}s)")
