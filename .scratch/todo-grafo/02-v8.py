"""02-v8.py — TICKET 02: le correzioni del ticket 01, e la partizione V8.

Ricetta IDENTICA a V7 (`09-cpm.py`, ramo `else`): stessa miscela (`B7`), stessa chiusura
triangolare (`alpha0=0.1`), stesso consenso multi-vista, stessa risoluzione (RB 100, 6 passate),
stessa potatura al nucleo. Cambiano **solo** le tre cose che il ticket 01 ha dimostrato rotte:

  1. `genres` viene letto -> la maschera di genere tiene il 76,4% degli archi DIR invece del 23,7%
  2. `min_sim_cast` 0.12 -> 0.02, la soglia MISURATA (a 0.12 il grado mediano di CAST e' 0)
  3. `potatura_nucleo` legge il grafo intero e non meta' triangolo

Il resto e' fermo apposta: se V8 peggiora, si deve poter dire quale delle tre l'ha peggiorata.

Nota su cosa NON cambia qui: le firme `pg:` di PROD, che il `genres` guarito fa finalmente nascere,
non entrano nella miscela (`BASE` non contiene PROD). Serviranno ai centroidi del ticket 04.
"""
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

ML = K.ML
TR = ML / "bolle-nitrile-V8-triangolo.npz"
MIN_SIM_CAST = 0.02      # misurato nel ticket 01: a 0.12 il grado mediano e' 0, a 0.02 e' 30
MIN_SIM_KW = 0.12        # lasciato com'e': a 0.12 il grado mediano di KW e' 20, non e' rotto
N_ITER = 6
RES = 100

print("=" * 100)
print("TICKET 02 — V8: le tre correzioni, ricetta di V7 identica")
print("=" * 100, flush=True)

if TR.exists():
    q = np.load(TR)
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(B.N, B.N)).tocsr()
    print(f"triangolo V8 dalla cache: {W.nnz:,} archi", flush=True)
else:
    t0 = time.time()
    INS = B.costruisci_insiemi()
    GEN, KW_ins = INS["GEN"], INS["KW"]
    print(f"\nguardia: titoli con almeno un genere {sum(1 for g in GEN if g):,}/{B.N:,} "
          f"(prima delle correzioni era 0)", flush=True)
    SIG = INS["SIG"]
    pg = sum(1 for s in SIG for x in s if x.startswith("pg:"))
    print(f"guardia: firme `pg:paese|decennio|genere` {pg:,} (prima erano 0)", flush=True)
    print(f"guardia: RETE/PAE/COMP ora escono da costruisci_insiemi: "
          f"{[k for k in ('RETE','PAE','COMP') if k in INS]}", flush=True)

    # ricostruisci=True: la cache sul disco e' quella costruita a 0.12, e va rifatta. Le cache
    # vecchie sono state salvate in `.bak` prima di questo run.
    C = B.carica_componenti(con_shrinkage=True, min_sim_kw=MIN_SIM_KW, min_sim_cast=MIN_SIM_CAST,
                            ricostruisci=True, insiemi=INS)
    CD = dict(C)
    CD["DIR"] = B.maschera_genere(C["DIR"], GEN, KW_ins, etichetta="DIR")
    CD["CAST"] = B.maschera_genere(C["CAST"], GEN, KW_ins, etichetta="CAST")

    B7 = {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 3, "LIST": 1}
    M = B.costruisci_2(CD, B7, beta=0.25, tau_rel=1.0, caldi_sopra=5)
    print(f"\nmiscela pronta ({time.time()-t0:.0f}s)", flush=True)
    M = B.chiusura_triangolare(M, alpha0=0.1, etichetta="V8")
    print(f"chiusura pronta ({time.time()-t0:.0f}s)", flush=True)
    M = B.consenso_multivista(M, CD, B7)
    print(f"consenso pronto ({time.time()-t0:.0f}s)", flush=True)
    W = B.archi_leiden(M, etichetta="V8")
    del M, CD, C
    np.savez_compressed(TR, data=W.data, indices=W.indices, indptr=W.indptr)
    print(f"triangolo V8 salvato: {W.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)

import sonda as S
TIT, VOT = B.titoli_leggibili()
RIF = np.load(ML / "bolle2-E.npy")

print(f"\n### V8 — risoluzione {RES}, {N_ITER} passate ###", flush=True)
mem = B.partizione(W, RES, "RB", n_iterations=N_ITER, etichetta="V8")
mem = B.potatura_nucleo(mem, W, quanti_nucleo=4, etichetta="V8")
np.save(ML / "bolle-nitrile-V8.npy", mem)
sz = np.bincount(mem)
print(f"  -> bolle-nitrile-V8.npy · {len(sz):,} bolle · {int((sz>=15).sum()):,} con >=15", flush=True)
S.stampa_confronto("V8", mem, RIF, "bolle2-E", TIT, VOT)

# ------------------------------------------------------------------ il confronto che conta
print("\n" + "=" * 100)
print("V7 CONTRO V8 — le metriche che decidono, non il numero di bolle")
print("=" * 100, flush=True)
v7 = np.load(ML / "bolle-nitrile-V7.npy")
for nome, m in (("V7", v7), ("V8", mem)):
    s = np.bincount(m)
    print(f"  {nome}: {len(s):,} bolle · mediana {int(np.median(s))} · "
          f"la piu' grossa {int(s.max())} · >=15 {int((s>=15).sum()):,} "
          f"· titoli in bolle >=15 {int(s[s>=15].sum()):,}")

# purezza: quanto una bolla e' fatta di un solo medium
is_tv = B.IS_TV
for nome, m in (("V7", v7), ("V8", mem)):
    nb = int(m.max()) + 1
    q = np.zeros(nb)
    np.add.at(q, m, is_tv.astype(float))
    sz = np.bincount(m, minlength=nb)
    pur = np.maximum(q, sz - q) / np.maximum(sz, 1)
    print(f"  {nome}: purezza di medium media {pur.mean():.3f} · bolle monomedium "
          f"{int((pur==1).sum()):,}/{nb:,}")
print(f"\nFINE ({time.time()-B.T0:.0f}s)")
