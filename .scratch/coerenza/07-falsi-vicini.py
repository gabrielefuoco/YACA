"""07-falsi-vicini.py — TICKET 07: il peso della mappa normalizzato per taglia e coerente.

§5.4 del senior. Il sintomo, letto in `bolle-esempi.md`: una nicchia ha per vicino più forte una
bolla gigante di argomento diverso.

  bolla 525 (seinen anime)  ha per 3° vicino la bolla 18  (155 titoli: Miss Bala, Il postino)
  bolla 560 (talk show)     ha per 2° vicino la bolla 21  (138 titoli: Papà, La parola ai giurati)
  bolla  12 (true crime)    ha per 1° vicino la bolla 588 (Concerto di Natale con i Flintstones)

Causa: `BB = S.T @ Ws @ S` e' la **somma grezza** degli archi fra i membri, quindi una bolla da 150
titoli ha cinque volte il volume di fuoco di una da 30, e non c'e' nessun filtro di coerenza fra i
due centroidi.

La correzione del senior:

    W_mappa(a, b) = BB_ab / sqrt(|a| · |b|) · max(0, cos(mu_a, mu_b))

La divisione toglie il vantaggio di volume, il coseno fra i centroidi V3 azzera i legami spuri. E i
centroidi li abbiamo gia' in `05-centroidi.npz`.

Da verificare: i tre casi, il ginocchio, e la connettivita' (il vincolo del ticket 23 di
`grafo-servibile`: la mappa deve restare navigabile).
"""
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp
import scipy.sparse.csgraph as cg

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
print("=" * 104)
print("TICKET 07 — I FALSI VICINI SULLA MAPPA")
print("=" * 104, flush=True)

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
print(f"  mappa vecchia: {BB.nnz:,} archi · grado mediano "
      f"{int(np.median(np.asarray((BB>0).sum(1)).ravel()))} ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- i centroidi di TUTTE le bolle
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
print(f"  costruisco i centroidi V3 di tutte le {NB:,} bolle (sparsi) ({time.time()-T0:.0f}s)",
      flush=True)
r_, c_, v_ = [], [], []
for b in range(NB):
    s = np.asarray(TF[MEMBRI[b]].sum(0)).ravel()
    nz = np.nonzero(s)[0]
    r_.extend([b] * len(nz))
    c_.extend(nz.tolist())
    v_.extend(s[nz].tolist())
CENT = sp.csr_matrix((v_, (r_, c_)), shape=(NB, TF.shape[1]), dtype=np.float32)
NORMA = np.sqrt(np.asarray(CENT.multiply(CENT).sum(1)).ravel()) + 1e-9
COS = np.asarray((CENT @ CENT.T).todense()) / (NORMA[:, None] * NORMA[None, :])
np.fill_diagonal(COS, 0.0)
print(f"  coseni fra centroidi: mediana {np.median(COS[COS != 0]):.4f} · "
      f"positivi {100*(COS > 0).mean():.1f}% · >0.1 {100*(COS > 0.1).mean():.1f}% "
      f"({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- il peso nuovo
print(f"\n  e il peso nuovo: BB / sqrt(|a|·|b|) · max(0, cos) ({time.time()-T0:.0f}s)", flush=True)
Mc, Mr = BB.tocoo().col, BB.tocoo().row
dati = BB.tocoo().data
DEN = np.sqrt(sz[Mr].astype(float) * sz[Mc].astype(float)) + 1e-9
COPPIA = np.maximum(0.0, COS[Mr, Mc])
NUOVO = (dati / DEN) * COPPIA
NEW = sp.csr_matrix((NUOVO, (Mr, Mc)), shape=(NB, NB)).tocsr()
NEW.setdiag(0)
NEW.eliminate_zeros()
print(f"  archi col peso nuovo > 0: {NEW.nnz:,} sul {100*NEW.nnz/BB.nnz:.1f}% di prima "
      f"({time.time()-T0:.0f}s)", flush=True)
print(f"  peso: vecchio mediano {np.median(dati):.4f} · nuovo mediano {np.median(NUOVO):.6f}")


def n_vicini(M, b, quanti=6):
    r = M.getrow(b)
    if r.nnz == 0:
        return []
    o = np.argsort(-r.data)[:quanti]
    return [(int(r.indices[t]), float(r.data[t])) for t in o]


TIT, _ = B.titoli_leggibili()


def membri(b, k=3):
    return [TIT[x][:24] for x in MEMBRI[b][:k]]


print("\n" + "=" * 104)
print("I TRE CASI CHE IL SENIOR NOMINA")
print("=" * 104)
for b, perche in ((525, "seinen anime"), (560, "late-night talk show"), (12, "true crime")):
    print(f"\n  bolla {b} ({int(sz[b])} titoli, {'serie' if e_serie[b] else 'film'}) — {perche}")
    print(f"     dentro: {membri(b)}")
    print(f"     PRIMA:")
    for j, p in n_vicini(BB, b, 4):
        print(f"        {p:10.1f}  bolla {j:>4} ({int(sz[j]):>3} tit.) {membri(j, 2)}")
    print(f"     DOPO:")
    for j, p in n_vicini(NEW, b, 4):
        print(f"        {p:10.5f}  bolla {j:>4} ({int(sz[j]):>3} tit.) {membri(j, 2)}")

# ---------------------------------------------------------------- la mappa nuova: top-k + unione
print("\n" + "=" * 104)
print("LA MAPPA NUOVA — top-k per bolla sul peso nuovo, unione simmetrica")
print("=" * 104)
for k in (4, 8, 12):
    r_, c_, v_ = [], [], []
    for b in range(NB):
        riga = NEW.getrow(b)
        if riga.nnz == 0:
            continue
        if riga.nnz <= k:
            idx, val = riga.indices, riga.data
        else:
            o = np.argsort(-riga.data)[:k]
            idx, val = riga.indices[o], riga.data[o]
        r_.extend([b] * len(idx))
        c_.extend(idx.tolist())
        v_.extend(val.tolist())
    M = sp.csr_matrix((v_, (r_, c_)), shape=(NB, NB))
    grafo = (M + M.T).tocsr()
    n_comp, et = cg.connected_components(grafo, directed=False)
    gr = int(np.bincount(et).max())
    grado = np.asarray((grafo > 0).sum(1)).ravel()
    print(f"  top-{k:<3} archi {M.nnz:>7,} · grado mediano {int(np.median(grado)):>3} · "
          f"componenti {n_comp:>4} ({100*gr/NB:.1f}% nella più grande)")

# il ginocchio della mappa nuova (top-8)
r_, c_, v_ = [], [], []
for b in range(NB):
    riga = NEW.getrow(b)
    o = np.argsort(-riga.data)[:8] if riga.nnz > 8 else np.arange(riga.nnz)
    r_.extend([b] * len(o))
    c_.extend(riga.indices[o].tolist())
    v_.extend(riga.data[o].tolist())
M8 = (sp.csr_matrix((v_, (r_, c_)), shape=(NB, NB)) + sp.csr_matrix((v_, (r_, c_)), shape=(NB, NB)).T).tocsr()
rs = []
for b in range(NB):
    d = np.sort(M8.getrow(b).data)[::-1]
    if len(d) >= 8:
        rs.append(d[5] / max(d[6], 1e-9))
print(f"\n  ginocchio w6/w7 sulla mappa nuova: mediana {np.median(rs):.2f}")
print(f"  (sull'adiacenza binaria era 1,074 · sul top-k pesato del ticket 02 era 1,24)")

np.savez_compressed(ML / "mappa-coerente.npz", data=M8.data, indices=M8.indices,
                    indptr=M8.indptr, sz=sz, quota_tv=quota_tv, coseni=COS)
print(f"\n  salvata: mappa-coerente.npz")
print(f"\nFINE ({time.time()-T0:.0f}s)")
