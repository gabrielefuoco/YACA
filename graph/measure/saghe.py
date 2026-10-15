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

# I VICINI DI BOLLA: LA MISURA DELLE SAGHE HA BISOGNO DELLA MAPPA, E LA MAPPA NON C'E'.
#
# La prima versione di questo file faceva `BB = S1.T @ Ws @ S1` sul triangolo e concludeva
# «0 saghe spezzate · 22,4% adiacenti». Era una TAUTOLOGIA ALGEBRICA, non una misura: dentro il
# triangolo c'e' il componente COLL a peso 3, che mette un arco fra TUTTE le coppie di titoli con lo
# stesso `collection_id`. Se due film della stessa saga finiscono in due bolle diverse, quell'arco
# garantisce BB[b1,b2] > 0 per identita' matematica, e le due bolle risultano «adiacenti» QUALUNQUE
# sia la partizione. Misurare le saghe col componente che le unisce e' come pesarsi con un piede
# sulla bilancia.
#
# Il triangolo non e' rimediabile: e' UNA matrice sommata (`data`, `indices`, `indptr`), senza i
# pezzi per componente, e la miscela e' passata per `beta`/`tau_rel` — quindi COLL non si sottrae.
# L'unica domanda onesta e' «le due bolle sono vicine SULLA MAPPA NAVIGABILE?», che e' anche quella
# che conta per il prodotto: la mappa 6+2 e' cio' che un utente puo' attraversare.
#
# E ATTENZIONE, QUESTA E' LA TRAPPOLA 3b UN'ALTRA VOLTA: la mappa che esiste in `graph/data/`
# (`mappa-pesata-6-2.npz`) e' costruita su V8 e porta dentro il `mem` di V8. Usarla per giudicare
# la partizione finale sarebbe leggere i membri di una partizione su un'altra. Quindi la mappa si
# PRETENDE allineata, e se non lo e' la misura si rifiuta di rispondere: un numero su due
# partizioni diverse non e' un numero.
MAPPA = next((p for p in ("mappa-finale-6-2.npz", "mappa-pesata-6-2.npz")
              if K.A(p).exists()), None)
if MAPPA is None:
    raise SystemExit("manca la mappa 6+2 in graph/data/: senza, la misura delle saghe non ha un\n"
                     "  oggetto onesto su cui misurare (vedi il commento qui sopra)")
P = np.load(K.A(MAPPA), allow_pickle=True)
MEM_MAPPA = np.asarray(P["mem"])
print(f"  mappa: {MAPPA} — {len(MEM_MAPPA):,} titoli, {int(MEM_MAPPA.max())+1:,} bolle", flush=True)


def analizza(mem, nome, mappa_npz=None):
    NB = int(mem.max()) + 1
    if len(MEM_MAPPA) != len(mem) or int(MEM_MAPPA.max()) != int(mem.max()) \
            or not np.array_equal(MEM_MAPPA, mem):
        diverse = int((MEM_MAPPA != mem).sum()) if len(MEM_MAPPA) == len(mem) else -1
        raise SystemExit(
            f"LA MAPPA E' DI UN'ALTRA PARTIZIONE — la misura si rifiuta di rispondere.\n"
            f"  mappa  {MAPPA}: {int(MEM_MAPPA.max())+1:,} bolle su {len(MEM_MAPPA):,} titoli\n"
            f"  misuro {nome}: {NB:,} bolle su {len(mem):,} titoli\n"
            f"  titoli con bolla diversa: {diverse:,}\n"
            f"  Rigenera la mappa sulla partizione che stai misurando.")
    # IL GRAFO 6+2 E' GIA' A LIVELLO DI BOLLA: 3.497x3.497, non 66.259x66.259. La proiezione del
    # grafo pesato sulle bolle la fa `steps/05_mappa.py`, una volta, quando costruisce la mappa.
    # Qui non serve proiettare niente: questa E' l'adiacenza che un utente puo' attraversare.
    BB = sp.csr_matrix((P["grafo_data"], P["grafo_indices"], P["grafo_indptr"]),
                       shape=(NB, NB)).tocsr()
    BB.setdiag(0)
    BB.eliminate_zeros()
    adiacenti = {b: set(BB.getrow(b).indices.tolist()) for b in range(NB)}
    una = collegate = spezzate = 0
    distanze = []
    esempi_rotti = []
    # E IL QUARTIERE, NON SOLO IL VICINO. La mappa 6+2 e' un criterio severo: ogni bolla ha ~13
    # vicini su 3.496 possibili, cioe' lo 0,37% dello spazio. Due bolle a caso sono adiacenti nello
    # 0,37% dei casi; le coppie di saga nell'8,2% — ventidue volte il caso, quindi il segnale c'e'.
    # Ma il carosello, in prodotto, si fa dalla bolla E DAL SUO QUARTIERE (la risposta del senior alla
    # domanda 2): bolla a peso 1,0 e primi vicini a 0,6. Quindi la domanda utile e' anche «a due
    # passi si arriva?», e la si misura invece di sperare.
    due = 0
    B2 = ((BB > 0).astype(np.int8) @ (BB > 0).astype(np.int8))
    B2 = (B2 + B2.T).astype(bool).tocsr()
    adiacenti2 = {b: set(B2.getrow(b).indices.tolist()) for b in range(NB)}
    for cid, righe in COLL.items():
        bolle = [int(mem[r]) for r in righe]
        uniq = sorted(set(bolle))
        if len(uniq) == 1:
            una += 1
            continue
        # le bolle della collezione sono connesse fra loro (una catena di adiacenze)?
        def catena(vicini):
            visti = {uniq[0]}
            frontiera = [uniq[0]]
            while frontiera:
                b = frontiera.pop()
                for nb in vicini.get(b, ()):
                    if nb in uniq and nb not in visti:
                        visti.add(nb)
                        frontiera.append(nb)
            return visti

        if len(catena(adiacenti)) == len(uniq):
            collegate += 1
        elif len(catena(adiacenti2)) == len(uniq):
            due += 1
            if len(esempi_rotti) < 6:
                esempi_rotti.append((cid, len(righe), len(uniq), len(uniq)))
        else:
            spezzate += 1
            if len(esempi_rotti) < 6:
                esempi_rotti.append((cid, len(righe), len(uniq), len(catena(adiacenti2))))
    tot = una + collegate + due + spezzate
    print(f"\n  {nome} ({NB:,} bolle)")
    print(f"    collezioni con 2+ titoli: {tot:,}")
    print(f"      tutte in UNA bolla:          {una:>5,} ({100*una/tot:.1f}%)")
    print(f"      bolle ADIACENTI (1 passo):   {collegate:>5,} ({100*collegate/tot:.1f}%)  <- nessun danno")
    print(f"      a DUE PASSI sulla mappa:     {due:>5,} ({100*due/tot:.1f}%)  <- il quartiere, che basta")
    print(f"      SPEZZATE (oltre due passi):  {spezzate:>5,} ({100*spezzate/tot:.1f}%)  <- il problema vero")
    if esempi_rotti:
        print("      esempi (collezione, titoli, bolle, raggiunte):")
        for cid, ntit, nbolle, ragg in esempi_rotti:
            print(f"        {cid} · {ntit} titoli in {nbolle} bolle · raggiunte {ragg}")
    return una, collegate, due, spezzate


print("\n" + "=" * 100)
print("LE SAGHE SULLA MAPPA NAVIGABILE")
print("=" * 100, flush=True)
# SI MISURA LA PARTIZIONE CHE LA MAPPA DICHIARA DI AVERE.
# Prima qui c'era un confronto fra tre partizioni (RB 100, RB 200, RB 200+divisione). Ma la mappa e'
# UNA, ed e' costruita su una sola: misurarne un'altra era il modo di riprodurre la Trappola 3b
# dentro lo strumento che serve a scoprirla. Se la mappa dichiara `bolle-X.npy`, si misura `bolle-X.npy`
# e basta. Per confrontare due partizioni si costruiscono due mappe: `steps/05_mappa.py` costa 88
# secondi, ed e' il prezzo giusto per non mentire.
PART = str(P["partition"]) if "partition" in P.files else None
if PART is None:
    print("\n  la mappa non dichiara la sua partizione (file vecchio): non si misura.")
    raise SystemExit(1)
f = K.A(PART)
if not f.exists():
    raise SystemExit(f"la mappa dichiara {PART}, che non esiste in graph/data/")
print(f"\n  la mappa dichiara: {PART} · il triangolo: "
      f"{str(P['triangle']) if 'triangle' in P.files else '?'}")
analizza(np.load(f), PART)

print(f"\nFINE ({time.time()-T0:.0f}s)")
