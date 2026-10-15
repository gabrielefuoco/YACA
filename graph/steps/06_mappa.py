"""05_mappa.py — la mappa navigabile 6+2, costruita SULLA PARTIZIONE CHE SI CHIAMA.

Questo script non esisteva nel modulo: la mappa era un artefatto di `.scratch/mappa-pesata/`, cotto
su **V8** e mai rigenerato. Finche' stava la', ogni misura che ne aveva bisogno — la connettivita'
esterna, le saghe adiacenti, le 80+ che non si dividono — misurava la mappa vecchia, non il grafo.

E' l'unico artefatto del sistema che dipende dalla partizione E dal triangolo insieme: la mappa si
costruisce proiettando il grafo pesato sulle bolle (`BB = S1ᵀ · Ws · S1`) e prendendo, per ogni bolla,
i **6 vicini intra-medium** e i **2 cross-medium** di peso maggiore. Cambia la partizione, cambia la
mappa: e' la Trappola 3b, e per questo il file che esce porta dentro il `mem` con cui e' stato fatto.

    MEM=bolle-eterogeneo-subvoti.npy TRI=bolle-eterogeneo-V10-p1.0-triangolo.npz \\
        python graph/steps/05_mappa.py

Esce `graph/data/mappa-finale-6-2.npz` (o `mappa-<MEM>.npz` se `OUT` e' dato), con dentro `intra`,
`cross`, `quota_tv`, `sz`, `mem` e il grafo 6+2 in forma CSR (`grafo_*`). Il grafo e' anche cio' che
`measure/saghe.py` usa per chiedersi se due bolle sono **davvero** adiacenti — e senza il quale,
giustamente, si rifiuta di rispondere.
"""
import os
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp
import scipy.sparse.csgraph as cg

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import canon as K

T0 = time.time()
MEM_NOME = os.environ.get("MEM", "bolle-eterogeneo-subvoti.npy")
TRI_NOME = os.environ.get("TRI", "bolle-eterogeneo-V10-p1.0-triangolo.npz")
OUT = os.environ.get("OUT", "mappa-finale-6-2.npz")
K_INTRA, K_CROSS = 6, 2

print("=" * 104)
print(f"LA MAPPA {K_INTRA}+{K_CROSS} — su {MEM_NOME}")
print("=" * 104, flush=True)

mem = np.load(K.A(MEM_NOME))
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
IS_TV = B.IS_TV
if len(IS_TV) != N:
    raise SystemExit(f"IS_TV ha {len(IS_TV)} titoli, la partizione ne ha {N}: allineamento rotto")
q = np.load(K.A(TRI_NOME))
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
print(f"  {NB:,} bolle · {BB.nnz:,} archi pesati su {NB*(NB-1)//2:,} coppie · "
      f"grado mediano {int(np.median(np.asarray((BB > 0).sum(1)).ravel()))} ({time.time()-T0:.0f}s)",
      flush=True)


def top_per_peso(b, maschera, quanti):
    riga = BB.getrow(b)
    vic = riga.indices[maschera(riga.indices)]
    if len(vic) == 0:
        return []
    pesi = np.array([BB[b, j] for j in vic])
    o = np.argsort(-pesi)[:quanti]
    return [int(vic[t]) for t in o]


INTRA = np.full((NB, K_INTRA), -1, np.int32)
CROSS = [set() for _ in range(NB)]
for b in range(NB):
    INTRA[b, :len(top_per_peso(b, lambda v: e_serie[v] == e_serie[b], K_INTRA))] = \
        top_per_peso(b, lambda v: e_serie[v] == e_serie[b], K_INTRA)
    CROSS[b].update(top_per_peso(b, lambda v: e_serie[v] != e_serie[b], K_CROSS))
for b in range(NB):
    for j in list(CROSS[b]):
        CROSS[j].add(b)
asimm = sum(1 for b in range(NB) for j in CROSS[b] if b not in CROSS[j])
lun = np.array([len(c) for c in CROSS])
print(f"  ponti cross-medium: coppie asimmetriche {asimm} (deve essere 0) · "
      f"per bolla mediana {int(np.median(lun))}, massimo {int(lun.max())}", flush=True)

r_, c_, v_ = [], [], []
for b in range(NB):
    for j in list(INTRA[b][INTRA[b] >= 0]) + list(CROSS[b]):
        r_.append(b)
        c_.append(j)
        v_.append(float(BB[b, j]))
MM = sp.csr_matrix((v_, (r_, c_)), shape=(NB, NB))
MM = (MM + MM.T).tocsr()
n_comp, et = cg.connected_components(MM, directed=False)
gr = int(np.bincount(et).max())
print(f"  la mappa: {MM.nnz:,} archi · componenti {n_comp} · la piu' grande {gr:,}/{NB:,} "
      f"({100*gr/NB:.1f}%)", flush=True)


def ginocchio(M, quanti=8):
    """w_6/w_7: se non salta, nessuna soglia e' difendibile, e va detto."""
    rs = []
    for b in range(NB):
        d = np.sort(M.getrow(b).data)[::-1]
        if len(d) >= quanti:
            rs.append(d[5] / max(d[6], 1e-9))
    return float(np.median(rs)) if rs else float("nan")


print(f"  ginocchio w6/w7 mediano {ginocchio(MM):.2f}", flush=True)
for nome, Mn in (("soglie: il grafo denso com'e'", BB), ("la mappa 6+2", MM)):
    gc = np.asarray((Mn > 0).sum(1)).ravel()
    print(f"    {nome:<32} archi {Mn.nnz:>9,} · grado mediano {int(np.median(gc)):>4}",
          flush=True)

CROSS_A = np.array([sorted(c)[:K_CROSS] + [-1] * (K_CROSS - len(sorted(c)[:K_CROSS]))
                    for c in CROSS], np.int32)
np.savez_compressed(K.DATA / OUT, intra=INTRA, cross=CROSS_A, cross_lun=lun, quota_tv=quota_tv,
                    sz=sz, mem=mem, grafo_data=MM.data, grafo_indices=MM.indices,
                    grafo_indptr=MM.indptr, partition=MEM_NOME, triangle=TRI_NOME)
print(f"\n  salvata: {OUT}")

# ---------------------------------------------------------------- la lettura a mano
print("\n" + "=" * 104)
print("I QUARTIERI, LETTI — le bolle piu' grosse e i loro vicini intra-medium")
print("=" * 104)
TIT = np.array([""] * N, dtype=object)
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    for i, t in zip(d["id"], d[col]):
        r = B.ROW_OF.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)


def membri(b, k=3):
    return [TIT[x][:24] for x in np.where(mem == b)[0]][:k]


for b in np.argsort(-sz)[:6]:
    print(f"\n  bolla {b} · {int(sz[b])} titoli · {'serie' if e_serie[b] else 'film'} · "
          f"peso medio archi {float(np.median(BB.getrow(b).data)):.2f}")
    print(f"     dentro: {membri(b)}")
    for j in INTRA[b]:
        if j < 0:
            continue
        print(f"     -> {int(j):>5} (peso {float(BB[b, j]):7.2f}) {membri(int(j), 2)}")
print(f"\nFINE ({time.time()-T0:.0f}s)")
