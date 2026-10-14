"""01-02-pesata.py — TICKET 01 e 02: i 6+2 sul grafo PESATO, e la lettura dei quartieri.

Il ticket 07 di `todo-grafo` ha misurato che sull'adiacenza binaria la mappa non seleziona niente:
95,7% delle coppie adiacenti, grado mediano 798, rapporto fra il 6° e il 7° vicino **1,074**. Ma la
mediana del PESO e' 0,0: il difetto e' dell'adiacenza, non del peso. Qui si rifa' sul pesato.

TRE DOMANDE, e per ognuna un numero invece di un'intuizione.

1. **Dove sta il ginocchio?** Per ogni bolla si ordina il vicinato per peso decrescente e si guarda il
   rapporto `w_k / w_{k+1}` al variare di k. Se non c'e' un k dove il rapporto salta, allora nessuna
   soglia e' difendibile e va detto. (Il ticket 07 aveva guardato solo k=6, e il rapporto era 1,07 —
   ma su un grafo dove il 7° vicino ESISTE. Qui si cerca il ginocchio invece di assumerlo.)

2. **Il taglio rompe la mappa?** Il vincolo del ticket 23 di `grafo-servibile`: il k-NN **mutuo**
   frammenta (143 componenti), il **diretto simmetrizzato** la tiene intera (5). La mappa pesata si
   verifica allo stesso modo.

3. **Quanto peso si butta?** Un taglio che tiene il 99% del peso e il 10% degli archi e' gratis. Uno
   che tiene il 40% non lo e'.

E poi la mappa finale e i quartieri, letti a mano.
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
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))      # ULTIMO: `ml-collaborativo/bolle.py`
import bolle as B                                          # e' uno script, non un modulo
import canone as K

T0 = time.time()
ML = K.ML
print("=" * 104)
print("TICKET 01-02 — LA MAPPA A 6+2 SUL GRAFO PESATO")
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
print(f"  V8: {NB:,} bolle · {BB.nnz:,} archi pesati su {NB*(NB-1)//2:,} coppie = "
      f"{100*BB.nnz/(NB*(NB-1)/2):.1f}% ({time.time()-T0:.0f}s)", flush=True)

# ============================================================ 1. la distribuzione dei pesi
print("\n" + "=" * 104)
print("1. I PESI")
print("=" * 104)
w = BB.data
print(f"  archi {len(w):,} · mediana {np.median(w):.3f} · media {w.mean():.2f} · massimo {w.max():.1f}")
for p in (10, 25, 50, 75, 90, 95, 99, 99.9):
    print(f"    {p:>5}° percentile: {np.percentile(w, p):8.3f}")
print(f"  archi con peso < 0.1: {int((w < 0.1).sum()):,} ({100*(w<0.1).mean():.1f}%)")
print(f"  peso totale: {w.sum():,.0f}")

# quanto peso sta nel top-8 di ogni bolla, e quanto negli archi buttati
tot = 0.0
tot_top8 = 0.0
for b in range(NB):
    d = np.sort(BB.getrow(b).data)[::-1]
    tot += d.sum()
    tot_top8 += d[:8].sum()
print(f"\n  il top-8 di ogni bolla tiene il {100*tot_top8/tot:.1f}% del peso totale, "
      f"con l'{100*8/np.mean([BB.getrow(b).nnz for b in range(0, NB, 53)]):.1f}% degli archi")

# ============================================================ 2. il ginocchio
print("\n" + "=" * 104)
print("2. DOVE STA IL GINOCCHIO — il rapporto w_k / w_{k+1} al variare di k")
print("=" * 104)
campione = [b for b in range(0, NB, 7) if BB.getrow(b).nnz > 80]
KS = (2, 4, 6, 8, 10, 12, 16, 20, 32, 64)
print(f"  su {len(campione)} bolle campionate")
print(f"  {'k':>4} {'w_k/w_k+1 mediano':>18} {'peso tenuto':>12} {'grado mediano':>14}")
migliore_k, migliore_rapp = None, 0.0
for k in KS:
    rs, tenuto = [], []
    for b in campione:
        d = np.sort(BB.getrow(b).data)[::-1]
        if len(d) > k:
            rs.append(d[k - 1] / max(d[k], 1e-9))
            tenuto.append(d[:k].sum() / d.sum())
    r = float(np.median(rs)) if rs else 0.0
    print(f"  {k:>4} {r:>18.3f} {100*np.median(tenuto):>11.1f}% "
          f"{int(np.median([min(k, BB.getrow(b).nnz) for b in campione])):>14}")
    if r > migliore_rapp:
        migliore_rapp, migliore_k = r, k
print(f"\n  -> il rapporto massimo e' a k = {migliore_k} ({migliore_rapp:.3f}).")
print(f"     Un rapporto di 1,07 come al ticket 07 significa che il taglio e' arbitrario; "
      f"{migliore_rapp:.2f} significa che li' c'e' un gradino.")

# ============================================================ 3. le costruzioni a confronto
print("\n" + "=" * 104)
print("3. LE COSTRUZIONI A CONFRONTO — soglia contro top-k, e cosa rompono")
print("=" * 104)


def analizza(M, nome):
    """Archi, grado, componenti, peso tenuto."""
    grafo = (M + M.T).tocsr()            # per la connettivita' conta l'adiacenza, non il verso
    n_comp, etichette = cg.connected_components(grafo, directed=False)
    grande = int(np.bincount(etichette).max())
    grado = np.asarray((grafo > 0).sum(1)).ravel()
    tenuto = M.sum() / tot
    print(f"  {nome:<34} archi {M.nnz:>9,} · grado mediano {int(np.median(grado)):>4} · "
          f"componenti {n_comp:>4} ({100*grande/NB:.1f}% nella piu' grande) · "
          f"peso tenuto {100*tenuto:>5.1f}%")
    return dict(nome=nome, archi=int(M.nnz), comp=int(n_comp), grande=grande,
                grado=int(np.median(grado)), tenuto=float(tenuto))


RIS = []
for p in (50, 75, 90, 95, 99):
    soglia = np.percentile(w, p)
    M = BB.copy()
    M.data = np.where(M.data >= soglia, M.data, 0.0)
    M.eliminate_zeros()
    RIS.append(analizza((M + M.T).multiply(0.5).tocsr(), f"soglia al {p}° percentile ({soglia:.2f})"))

print()
for k in (4, 8, 12, 20):
    r_, c_, v_ = [], [], []
    for b in range(NB):
        riga = BB.getrow(b)
        if riga.nnz <= k:
            idx, val = riga.indices, riga.data
        else:
            o = np.argsort(-riga.data)[:k]
            idx, val = riga.indices[o], riga.data[o]
        r_.extend([b] * len(idx))
        c_.extend(idx.tolist())
        v_.extend(val.tolist())
    M = sp.csr_matrix((v_, (r_, c_)), shape=(NB, NB))
    RIS.append(analizza(M, f"top-{k} per bolla, union simmetrica"))

# ============================================================ 4. la mappa finale
K_MEDIO = migliore_k if migliore_k >= 6 else 6
print("\n" + "=" * 104)
print(f"4. LA MAPPA 6+2 PESATA — 6 intra-medium + 2 cross-medium, taglio a top-{max(6, K_MEDIO)} per bolla")
print("=" * 104)
INTRA = np.full((NB, 6), -1, np.int32)
CROSS = [set() for _ in range(NB)]


def top_per_peso(b, maschera, quanti):
    riga = BB.getrow(b)
    vic = riga.indices[maschera(riga.indices)]
    if len(vic) == 0:
        return []
    pesi = np.array([BB[b, j] for j in vic])
    o = np.argsort(-pesi)[:quanti]
    return [int(vic[t]) for t in o]


for b in range(NB):
    intra = top_per_peso(b, lambda v: e_serie[v] == e_serie[b], 6)
    cross = top_per_peso(b, lambda v: e_serie[v] != e_serie[b], 2)
    INTRA[b, :len(intra)] = intra
    CROSS[b].update(cross)
for b in range(NB):
    for j in list(CROSS[b]):
        CROSS[j].add(b)
asimm = sum(1 for b in range(NB) for j in CROSS[b] if b not in CROSS[j])
lun = np.array([len(c) for c in CROSS])
print(f"  coppie asimmetriche: {asimm} (deve essere 0) · ponti per bolla: mediana "
      f"{int(np.median(lun))} · massimo {int(lun.max())}")

# connettivita' della mappa a 6+2 (intra + cross insieme)
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
print(f"  la mappa 6+2: {MM.nnz:,} archi · componenti {n_comp} · la piu' grande {gr:,}/{NB:,} "
      f"({100*gr/NB:.1f}%)")
print(f"  e il ginocchio SU QUESTA mappa: ", end="")
rs = []
for b in range(NB):
    d = np.sort(MM.getrow(b).data)[::-1]
    if len(d) >= 8:
        rs.append(d[5] / max(d[6], 1e-9))
print(f"w6/w7 mediano {np.median(rs):.2f} (sull'adiacenza binaria era 1,074)")

# ============================================================ 5. la lettura a mano
print("\n" + "=" * 104)
print("5. I QUARTIERI, LETTI — dieci bolle e i loro 6 vicini intra-medium per peso")
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


scelte = [1313, 1090, 525, 750, 895, 981, 738, 775, 1443, 490]
for b in scelte:
    if b >= NB:
        continue
    print(f"\n  bolla {b} · {int(sz[b])} titoli · {'serie' if e_serie[b] else 'film'} · "
          f"peso medio archi {float(np.median(BB.getrow(b).data)):.2f}")
    print(f"     dentro: {membri(b)}")
    for j in INTRA[b]:
        if j < 0:
            continue
        print(f"     -> {int(j):>4} (peso {float(BB[b, j]):7.2f}) {membri(int(j), 2)}")

np.savez_compressed(ML / "mappa-pesata-6-2.npz", intra=INTRA,
                    cross=np.array([sorted(c)[:6] + [-1] * (6 - len(sorted(c)[:6])) for c in CROSS],
                                   np.int32),
                    cross_lun=lun, quota_tv=quota_tv, sz=sz, mem=mem,
                    grafo_data=MM.data, grafo_indices=MM.indices, grafo_indptr=MM.indptr)
print(f"\n  salvata: mappa-pesata-6-2.npz")
print(f"\nFINE ({time.time()-T0:.0f}s)")
