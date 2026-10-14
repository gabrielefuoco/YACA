"""09-cpm.py — TICKET 09: CPM contro RBConfiguration, e la risoluzione.

DEVIATO DAL TICKET, e il motivo sta nella misura: il ticket proponeva risoluzioni **piu' basse**
(CPM 0.005-0.02, RB 30-60) perche' dava per scontato che il grafo fosse troppo fine. Ma gli
interventi dei ticket 02-08 lo hanno reso molto **piu' grosso** (5.297 bolle con mediana 9 ->
1.430 con mediana 39). Le risoluzioni piu' basse lo gonfierebbero ancora. Quindi:

    V8-CPM0.02   la piu' alta delle tre del ticket
    V8-RB60      la piu' alta delle due del ticket
    V8-RB200     PIU' ALTA della linea di base (100): l'unica che risponde alla domanda vera

Il triangolo si salva su disco: ricostruirlo costa ~12 minuti, e questo script deve poter ripartire.
"""
import pathlib
import sys
import time

import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
import bolle as B
import canone as K

ML = K.ML
SPEC = (("V8-CPM0.02", "CPM", 0.02), ("V8-RB60", "RB", 60), ("V8-RB200", "RB", 200))
TR = ML / "bolle-nitrile-V7-triangolo.npz"

print("=" * 100)
print("TICKET 09 — CPM e risoluzione, sulla miscela di V7 (tutto acceso)")
print("=" * 100, flush=True)

if TR.exists():
    q = np.load(TR)
    import scipy.sparse as sp
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(B.N, B.N))
    print(f"triangolo dalla cache: {W.nnz:,} archi", flush=True)
else:
    INS = B.costruisci_insiemi()
    C = B.carica_componenti(con_shrinkage=True, min_sim_kw=0.12, min_sim_cast=0.12,
                            ricostruisci="cache", insiemi=INS)
    CD = dict(C)
    CD["DIR"] = B.maschera_genere(C["DIR"], INS["GEN"], INS["KW"], etichetta="DIR")
    CD["CAST"] = B.maschera_genere(C["CAST"], INS["GEN"], INS["KW"], etichetta="CAST")
    B7 = {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 3, "LIST": 1}
    M = B.costruisci_2(CD, B7, beta=0.25, tau_rel=1.0, caldi_sopra=5)
    print(f"miscela pronta ({time.time()-B.T0:.0f}s)", flush=True)
    M = B.chiusura_triangolare(M, alpha0=0.1, etichetta="V7")
    M = B.consenso_multivista(M, CD, B7)
    W = B.archi_leiden(M, etichetta="V7")
    del M, CD, C
    np.savez_compressed(TR, data=W.data, indices=W.indices, indptr=W.indptr)
    print(f"triangolo salvato: {W.nnz:,} archi", flush=True)

import sonda as S
TIT, VOT = B.titoli_leggibili()
RIF = np.load(ML / "bolle2-E.npy")
for tag, tipo, res in SPEC:
    f = ML / f"bolle-nitrile-{tag}.npy"
    if f.exists():
        print(f"\n### {tag} — gia' fatto ###", flush=True)
        continue
    print(f"\n### {tag} — {tipo} a risoluzione {res} ###", flush=True)
    m = B.partizione(W, res, tipo, n_iterations=6, etichetta=tag)
    m = B.potatura_nucleo(m, W, quanti_nucleo=4, etichetta=tag)
    np.save(f, m)
    sz = np.bincount(m)
    print(f"  -> {tag}: {len(sz):,} bolle · {int((sz>=15).sum()):,} con >=15", flush=True)
    S.stampa_confronto(tag, m, RIF, "bolle2-E", TIT, VOT)

print(f"\nFINE ({time.time()-B.T0:.0f}s)")
