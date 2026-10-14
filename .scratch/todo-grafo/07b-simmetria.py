"""07b-simmetria.py — il controllo di §2.4 sulle due bolle vere, e un sospetto da sciogliere.

Un comando `-c` ha restituito un output che non era il suo (bolle 267, «tema movie:680», 625s). Non
era un errore mio nel merito: e' la shell. Da qui in avanti i controlli si fanno da file.
"""
import pathlib
import sys

import numpy as np
import pandas as pd

QUI = pathlib.Path(__file__).resolve().parent
# ORDINE DEI PATH: l'ultimo insert e' il primo della lista. `ml-collaborativo/` contiene un
# `bolle.py` che NON e' un modulo ma uno script della fase 1, e all'import esegue un'analisi da
# ~10 minuti. Se va prima lui, `import bolle` prende quello: e' successo, e ha prodotto un output
# che sembrava di un altro processo. `bolle-nitrile` va inserito per ULTIMO.
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

d = np.load(K.ML / "bolle-nitrile-V8-mappa-6-2.npz", allow_pickle=True)
intra, cross, lun, sz, quota = d["intra"], d["cross"], d["cross_lun"], d["sz"], d["quota_tv"]
mem = np.load(K.ML / "bolle-nitrile-V8.npy")   # nel .npz non l'avevo salvato: errore mio

TIT = np.array([""] * len(mem), dtype=object)
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    for i, t in zip(dd["id"], dd[col]):
        r = B.ROW_OF.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)


def membri(b, k=4):
    return [TIT[x][:26] for x in np.where(mem == b)[0]][:k]


print("=" * 100)
print("IL CONTROLLO DI §2.4 — le bolle vere, dal log del ticket 02")
print("=" * 100)
for nome, b in (("Guerre stellari", 1313), ("The Mandalorian", 1090)):
    print(f"  {nome:<18} bolla {b:>4} · {int(sz[b]):>3} titoli · "
          f"{'serie' if quota[b] > 0.5 else 'film'} · lungh. ponti simmetrica {int(lun[b])}")
    print(f"     membri: {membri(b)}")

bs, bm = 1313, 1090
print(f"\n  la domanda di §2.4: i due si vedono a vicenda?")
print(f"     {bs} vede {bm}? {'SÌ' if bm in cross[bs] else 'no'}")
print(f"     {bm} vede {bs}? {'SÌ' if bs in cross[bm] else 'no'}")
print(f"\n  i ponti cross-medium delle due (la relazione simmetrica, troncata a 4 dal file):")
for b in (bs, bm):
    p = [int(j) for j in cross[b] if j >= 0]
    print(f"     bolla {b}: {p} · lungh. vera {int(lun[b])}")
    for j in p[:4]:
        print(f"        -> {j:>4} ({int(sz[j]):>3} tit., {'serie' if quota[j] > 0.5 else 'film'}): "
              f"{membri(j, 3)}")
print(f"\n  i 6 vicini intra-medium di {bs}: {[int(j) for j in intra[bs] if j >= 0]}")
print(f"  i 6 vicini intra-medium di {bm}: {[int(j) for j in intra[bm] if j >= 0]}")

# e il peso dei due archi, per capire quanto valgono
q = np.load(K.ML / "bolle-nitrile-V8-triangolo.npz")
import scipy.sparse as sp
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(len(mem),) * 2)
Ws = (Ws + Ws.T).tocsr()
S1 = sp.csr_matrix((np.ones(len(mem), np.float32), (np.arange(len(mem)), mem)),
                   shape=(len(mem), len(sz)))
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
print(f"\n  peso dell'arco {bs}-{bm}: {float(BB[bs, bm]):.1f} · "
      f"peso mediano degli archi di {bs}: {float(np.median(BB.getrow(bs).data)):.1f} · "
      f"massimo {float(BB.getrow(bs).data.max()):.1f}")
print(f"  -> l'arco esiste (tutti gli archi esistono: 95,7% delle coppie), e sta al "
      f"{100*float(BB[bs, bm])/float(BB.getrow(bs).data.max()):.0f}% del peso massimo di {bs}.")

print("\n" + "=" * 100)
print("E IL SOSPETTO: qualcosa ha stampato un output che non era il mio comando")
print("=" * 100)
print("  Il testo parlava di «bolla 267 · 51 titoli · tema movie:680» e finiva con «FINE (625s)».")
print("  Non e' nessuno script di questo effort. Comando `-c` a parte, i controlli si fanno da file.")
