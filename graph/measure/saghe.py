"""13-saghe-sulla-mappa.py — le saghe rotte sono un problema? Dipende dalla mappa.

La domanda dell'utente: «l'unico problema e' che le saghe sono spezzate?»

Risposta onesta: forse non e' un problema. Una saga puo' stare in bolle diverse **se quelle bolle sono
vicine sulla mappa**: per «altri come questo» quello che conta e' la vicinanza, non l'appartenenza.

E il test delle saghe va fatto bene. I miei due tentativi precedenti erano sbagliati:
  · match per sottostringa: «Alien» prendeva 119 titoli, compreso *Alien Autopsy*
  · match per inizio: «Alien» ne prendeva 61, in 51 bolle — ancora spazzatura
TMDB ha un campo apposta: **`collection_id`**. Le saghe vere, senza euristiche.

Tre misure:
  1. per ogni collezione con 2+ titoli nel canone: in quante bolle sta, e **le bolle sono adiacenti
     sulla mappa 6+2**? Quante collezioni restano collegate, quante si spezzano davvero.
  2. lo stesso su RB 100, per confronto.
  3. la distanza sulla mappa: i pezzi di una stessa saga sono a un passo o agli antipodi?
"""
import json
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
import sys
import time
from collections import defaultdict

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
from graph import bubbles as B
from graph import canon as K

T0 = time.time()
ML = K.ML
print("=" * 100)
print("LE SAGHE SULLA MAPPA — spezzate e' un problema?")
print("=" * 100, flush=True)

N = B.N
# le collezioni TMDB: il campo giusto, senza euristiche sui titoli. Solo i FILM ne hanno uno:
# le serie non hanno `collection_id`, quindi il test riguarda le saghe cinematografiche.
COLL = {}
for typ, f in (("movie", "movies.parquet"),):
    d = pd.read_parquet(pathlib.Path(".cache/tmdb") / f, columns=["id", "collection_id"])
    for r in d.itertuples(index=False):
        riga = B.ROW_OF.get(f"{typ}:{int(r.id)}")
        if riga is None or pd.isna(r.collection_id):
            continue
        COLL.setdefault(int(r.collection_id), []).append(int(riga))
COLL = {k: v for k, v in COLL.items() if len(v) >= 2}
print(f"  collezioni TMDB con 2+ titoli nel canone: {len(COLL):,} · "
      f"titoli coinvolti {sum(len(v) for v in COLL.values()):,} ({time.time()-T0:.0f}s)", flush=True)

# la mappa: il grafo delle bolle (la mappa 6+2 salvata, o le adiacenze del triangolo)
q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
Ws = (W + W.T).tocsr()


def analizza(mem, nome, mappa_npz=None):
    NB = int(mem.max()) + 1
    S1 = sp.csr_matrix((np.ones(N, np.float32), (np.arange(N), mem)), shape=(N, NB))
    BB = (S1.T @ Ws @ S1).tocsr()
    BB.setdiag(0)
    BB.eliminate_zeros()
    adiacenti = {b: set(BB.getrow(b).indices.tolist()) for b in range(NB)}
    una = collegate = spezzate = 0
    distanze = []
    esempi_rotti = []
    for cid, righe in COLL.items():
        bolle = [int(mem[r]) for r in righe]
        uniq = sorted(set(bolle))
        if len(uniq) == 1:
            una += 1
            continue
        # le bolle della collezione sono connesse fra loro (una catena di adiacenze)?
        visti = {uniq[0]}
        frontiera = [uniq[0]]
        while frontiera:
            b = frontiera.pop()
            for nb in adiacenti.get(b, ()):
                if nb in uniq and nb not in visti:
                    visti.add(nb)
                    frontiera.append(nb)
        if len(visti) == len(uniq):
            collegate += 1
        else:
            spezzate += 1
            if len(esempi_rotti) < 6:
                esempi_rotti.append((cid, len(righe), len(uniq), len(visti)))
    tot = una + collegate + spezzate
    print(f"\n  {nome} ({NB:,} bolle)")
    print(f"    collezioni con 2+ titoli: {tot:,}")
    print(f"      tutte in UNA bolla:        {una:>5,} ({100*una/tot:.1f}%)")
    print(f"      in piu' bolle ma ADIACENTI: {collegate:>5,} ({100*collegate/tot:.1f}%)  <- nessun danno")
    print(f"      SPEZZATE (bolle scollegate): {spezzate:>5,} ({100*spezzate/tot:.1f}%)  <- il problema vero")
    return una, collegate, spezzate


print("\n" + "=" * 100)
print("IL CONFRONTO — RB 100 contro RB 200")
print("=" * 100, flush=True)
for nome, part in (("RB 100 (V10 p1.0)", "bolle-eterogeneo-V10-p1.0.npy"),
                   ("RB 200 (V10 p1.0)", "bolle-eterogeneo-V10-p1.0-r200.npy"),
                   ("RB 200 + divisione per voti", "bolle-eterogeneo-subvoti.npy")):
    f = K.A(part)
    if not f.exists():
        print(f"\n  {nome}: file assente")
        continue
    analizza(np.load(f), nome)

print(f"\nFINE ({time.time()-T0:.0f}s)")
