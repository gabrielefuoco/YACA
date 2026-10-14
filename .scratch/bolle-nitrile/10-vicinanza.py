"""10-vicinanza.py — come stanno le bolle una rispetto all'altra. La mappa, prima parte.

La domanda: con la partizione nuova (piu' grossa: 1.617 bolle, mediana 34) le bolle sono ancora
vicine in modo sensato? Il ticket 12 e 23 di `grafo-servibile` avevano misurato, sulla partizione
VECCHIA, che il k-NN **mutuo** frammenta la mappa (143 componenti) mentre il k-NN **diretto**
simmetrizzato la tiene intera (5 componenti, 6/6 adiacenze verificate). Qui si rifa' la stessa
misura sulla partizione nuova.

E si aggiunge la cosa che il ticket 10 chiede davvero: **di che tipo e' ogni vicinanza** —
comportamentale o strutturale — perche' e' quello che distingue "canonico" da "vibe".
"""
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp
import scipy.sparse.csgraph

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
Q = sp.load_npz  # segnaposto, non usato

print("=" * 104)
print("LE VICINANZE FRA BOLLE — sulla partizione nuova (V7)")
print("=" * 104, flush=True)

# ---------------------------------------------------------------- dati
mem = np.load(ML / "bolle-nitrile-V7.npy")
nb = int(mem.max()) + 1
sz = np.bincount(mem, minlength=nb)
q = np.load(ML / "bolle-nitrile-V7-triangolo.npz")
W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(B.N, B.N)).tocsr()
print(f"partizione: {nb:,} bolle · mediana {int(np.median(sz))} · la piu' grossa {int(sz.max())}")
print(f"grafo dei titoli: {W.nnz:,} archi ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- aggregazione titoli -> bolle
S = sp.csr_matrix((np.ones(B.N, np.float32), (np.arange(B.N), mem)), shape=(B.N, nb))
# il triangolo conta ogni coppia una volta sola: simmetrizzo per contare i due versi
Ws = (W + W.T).tocsr()
BB = (S.T @ Ws @ S).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
grado = np.asarray((BB > 0).sum(1)).ravel()
print(f"grafo delle bolle: {BB.nnz:,} adiacenze fra {nb:,} bolle · "
      f"ogni bolla tocca in media {grado.mean():.1f} altre, mediana {int(np.median(grado))} "
      f"({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- i due canali, solo sulle coppie da leggere
# Costruire due miscele intere per i canali costa ~10 minuti e non serve: la tipizzazione serve
# soltanto per le coppie che poi si leggono, e li' si legge il valore dei componenti sugli archi
# di quella coppia (poche decine di archi). Anche il primo tentativo e' morto su uno scalare
# sommato a una matrice sparsa: `A.multiply(X + 1e-9)` non esiste.
INS = B.costruisci_insiemi()
C = B.carica_componenti(con_shrinkage=True, min_sim_kw=0.12, min_sim_cast=0.12,
                        ricostruisci="cache", insiemi=INS)
CD = dict(C)
CD["DIR"] = B.maschera_genere(C["DIR"], INS["GEN"], INS["KW"], etichetta="DIR")
CD["CAST"] = B.maschera_genere(C["CAST"], INS["GEN"], INS["KW"], etichetta="CAST")
del INS, C
BEH = ("CF", "CFst", "B", "TV", "LIST")
STR = ("KW", "CAST", "DIR", "COLL")
BIN = {k: (v > 0).astype(np.float32).tocsr() for k, v in CD.items()}
print(f"  componenti pronti per la tipizzazione ({time.time()-T0:.0f}s)", flush=True)


def canali_fra(b1, b2):
    """Quanto di quegli archi viene dal comportamento e quanto dalla struttura."""
    m1 = np.where(mem == b1)[0]
    m2 = np.where(mem == b2)[0]
    sub = Ws[m1][:, m2].tocoo()
    if sub.nnz == 0:
        return 0.0, 0.0, 0
    rig, col = m1[sub.row], m2[sub.col]
    beh = sum(float(B._valori(BIN[n], rig, col, B.N).sum()) for n in BEH if n in BIN)
    st = sum(float(B._valori(BIN[n], rig, col, B.N).sum()) for n in STR if n in BIN)
    return beh, st, int(sub.nnz)


# ---------------------------------------------------------------- sparsificazione: k-NN DIRETTO
def knn_diretto(BB, k=8):
    """Il ticket 23: il k-NN MUTUO frammenta (la reciprocita' taglia i ponti asimmetrici).
    Il DIRETTO simmetrizzato tiene la mappa intera."""
    Bc = BB.tocsr()
    r, c, v = [], [], []
    for i in range(Bc.shape[0]):
        riga = Bc.getrow(i)
        if riga.nnz == 0:
            continue
        d, idx = riga.data, riga.indices
        if len(d) > k:
            sel = np.argpartition(-d, k)[:k]
            d, idx = d[sel], idx[sel]
        r.extend([i] * len(idx))
        c.extend(idx.tolist())
        v.extend(d.tolist())
    return sp.csr_matrix((v, (r, c)), shape=BB.shape).tocsr()


def knn_mutuo(BB, k=8):
    A = knn_diretto(BB, k)
    return A.multiply(A.T).sqrt().tocsr()


for etichetta, funzione in (("DIRETTO k=8", knn_diretto), ("MUTUO k=8", knn_mutuo)):
    A = funzione(BB, 8)
    ncomp, lab = sp.csgraph.connected_components(A, directed=False)
    gr = np.asarray((A > 0).sum(1)).ravel()
    iso = int((gr == 0).sum())
    grandi = np.bincount(lab)
    print(f"\n  {etichetta}: {ncomp:,} componenti · {A.nnz:,} archi · grado mediano "
          f"{int(np.median(gr))} · bolle isolate {iso:,} · componenti >1 bolla "
          f"{int((grandi > 1).sum()):,} · la piu' grande {int(grandi.max()):,}")
    if etichetta.startswith("DIRETTO"):
        AD = A

# ---------------------------------------------------------------- la lettura
TIT, VOT = B.titoli_leggibili()
import sonda as S_

print("\n" + "=" * 104)
print("LE ADIACENZE DA LEGGERE — gli 8 vicini di ogni bolla sentinella, col canale")
print("=" * 104)
AD = AD.tocsr()
for gruppo, nome, nota in S_.SENTINELLE:
    r, modo = S_.trova(TIT, nome)
    if r is None:
        continue
    b = int(mem[r])
    riga = AD.getrow(b)
    if riga.nnz == 0:
        print(f"\n[{gruppo:>12}] {nome[:40]:<42} -- bolla {b}, NESSUN VICINO")
        continue
    ordine = np.argsort(-riga.data)
    print(f"\n[{gruppo:>12}] {TIT[r][:44]:<46} bolla {b} ({int(sz[b])} titoli)")
    for k in ordine[:8]:
        j = int(riga.indices[k])
        w = float(BB[b, j])
        beh, st, quanti = canali_fra(b, j)
        tipo = ("comportamento" if beh > 1.5 * st else
                "struttura" if st > 1.5 * beh else "misto")
        # tre titoli rappresentativi della bolla vicina
        mm = np.where(mem == j)[0]
        esempi = sorted(mm, key=lambda x: -VOT[x])[:2]
        gg = [str(TIT[x])[:26] for x in esempi]
        print(f"      -> bolla {j:>5} ({int(sz[j]):>3} titoli)  peso {w:>9.2f}  "
              f"[{tipo:>13} {quanti:>4} archi]  es. {' | '.join(gg)}")

print(f"\nFINE ({time.time()-T0:.0f}s)")
