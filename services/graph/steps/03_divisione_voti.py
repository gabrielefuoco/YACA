"""11-subclustering-voti.py — l'idea (b): spezzare le bolle eterogenee NEI VOTI.

Criterio nuovo: invece di «bolle con 80+ titoli», si spezzano le bolle dove convivono titoli molto
votati e titoli oscuri. La misura e' `p90 / p10` dei voti dei membri — robusta, e **la stessa che fa
da criterio si puo' verificare dopo**: se i pezzi hanno uno spread minore del genitore, la divisione
ha fatto il suo lavoro. Se non lo ha fatto, si scarta.

E' il vantaggio di questa prova sull'indice di chimera: il criterio e' numerico, quindi il verdetto
non dipende dall'occhio. L'occhio serve dopo, a dire se i pezzi hanno un nome.

La domanda vera: Leiden vede solo il GRAFO, non i voti. Quindi la divisione strutturale **coincide**
con una divisione nei voti? Se no, l'eterogeneita' dei voti non ha una frontiera strutturale, e la
strada non esiste.
"""
import json
import os
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
import sys; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import canon as K
from graph import parametri as P

T0 = time.time()
ML = K.DATA      # i dati del modulo hanno una cartella loro
SPREAD_MIN = float(sys.argv[1]) if len(sys.argv) > 1 else P.VOTI_SPREAD_MIN
MIN_MEMBRI = int(sys.argv[2]) if len(sys.argv) > 2 else P.VOTI_MIN_MEMBRI
print("=" * 100)
print(f"SUB-CLUSTERING PER ETEROGENEITA' DI VOTI (p90/p10 > {SPREAD_MIN}, almeno {MIN_MEMBRI} titoli)")
print("=" * 100, flush=True)

mem = np.load(ML / "bolle-eterogeneo-V10-p1.0-r200.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
# IL NOME DEL TRIANGOLO: `02_partizione.py` lo salva come `...-p{peso}-r{RES}-triangolo.npz`, e
# cercare il nome senza `-r{RES}` funzionava solo perche' in `graph/data/` era rimasta una copia
# col nome vecchio — che e' la Trappola 3b in azione: uno script che legge un file stantio e non lo
# sa. Si prova il nome giusto e si dice quale si e' usato.
TRI = next((p for p in (f"bolle-eterogeneo-V10-p1.0-r{os.environ.get('RES', '200')}-triangolo.npz",
                        "bolle-eterogeneo-V10-p1.0-r200-triangolo.npz",
                        "bolle-eterogeneo-V10-p1.0-triangolo.npz")
            if K.esiste(p)), None)
if TRI is None:
    raise SystemExit("nessun triangolo di V10 in graph/data/ — rigenera con steps/02_partizione.py")
print(f"  triangolo: {TRI}", flush=True)
q = np.load(K.A(TRI))
W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()

VOT = np.zeros(N, np.float32)
PQ = pathlib.Path(".cache/tmdb")
for typ, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
    d = pd.read_parquet(PQ / f, columns=["id", "vote_count"])
    for r in d.itertuples(index=False):
        riga = B.ROW_OF.get(f"{typ}:{int(r.id)}")
        if riga is not None:
            VOT[int(riga)] = r.vote_count or 0

ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]


def spread(vals):
    """p90/p10, robusto. Con meno di 5 valori si considera 1 (nessuna informazione)."""
    v = np.asarray(vals, float)
    v = v[v > 0]
    if len(v) < 5:
        return 1.0
    a, b = np.percentile(v, [10, 90])
    return float(b / max(a, 1.0))


SP = np.array([spread(VOT[MEMBRI[b]]) if len(MEMBRI[b]) else 1.0 for b in range(NB)])
bersagli = np.where((SP > SPREAD_MIN) & (sz >= MIN_MEMBRI))[0]
print(f"  bolle: {NB:,} · spread p90/p10 mediano {np.median(SP[sz >= MIN_MEMBRI]):.1f}")
print(f"  bersagli (spread > {SPREAD_MIN} e {MIN_MEMBRI}+ titoli): {len(bersagli):,} bolle · "
      f"{int(sz[bersagli].sum()):,} titoli ({100*sz[bersagli].sum()/N:.0f}% del canone) "
      f"({time.time()-T0:.0f}s)", flush=True)
print(f"\n  i dieci bersagli piu' eterogenei:")
for b in sorted(bersagli, key=lambda z: -SP[z])[:10]:
    m_ = MEMBRI[b]
    p10, p90 = np.percentile(VOT[m_][VOT[m_] > 0], [10, 90]) if (VOT[m_] > 0).sum() >= 5 else (0, 0)
    print(f"    bolla {b:>5} · {int(sz[b]):>3} tit. · p10 {int(p10):>6,} · p90 {int(p90):>8,} · "
          f"spread {SP[b]:>7.1f}")

# ---------------------------------------------------------------- il sub-clustering
import igraph as ig
import leidenalg as la

RISOLUZIONI = tuple(P.VOTI_RISOLUZIONI)
NUOVA = mem.copy()
prossimo = NB
dettagli = []
for b in bersagli:
    m_ = MEMBRI[b]
    sub = W[m_][:, m_].tocoo()
    if sub.nnz == 0:
        continue
    g = ig.Graph(n=len(m_), edges=np.column_stack((sub.row, sub.col)), directed=False)
    w = sub.data.astype(float)
    g.es["weight"] = (w / max(w.mean(), 1e-9)).tolist()
    tetto = max(10, len(m_) // 2)
    scelta = None
    for res in RISOLUZIONI:
        p = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                              resolution_parameter=res, seed=42, n_iterations=6)
        part = np.array(p.membership)
        if len(np.bincount(part)) > 1 and np.bincount(part).max() <= tetto:
            scelta = (res, part)
            break
    if scelta is None:
        continue
    res, part = scelta
    for k in range(1, int(part.max()) + 1):
        NUOVA[m_[part == k]] = prossimo
        prossimo += 1
    NUOVA[m_[part == 0]] = b
    dettagli.append((int(b), int(sz[b]), res, int(part.max()) + 1, float(SP[b])))

print(f"\n  divise {len(dettagli):,} bolle · risoluzioni {sorted({d[2] for d in dettagli})}")

# ---------------------------------------------------------------- il verdetto: lo spread scende?
o2 = np.argsort(NUOVA, kind="stable")
c2 = np.searchsorted(NUOVA[o2], np.arange(int(NUOVA.max()) + 2))
M2 = [o2[c2[b]:c2[b + 1]] for b in range(int(NUOVA.max()) + 1)]
SP2 = np.array([spread(VOT[m_]) if len(m_) else 1.0 for m_ in M2])

print("\n" + "=" * 100)
print("IL VERDETTO — lo spread nei pezzi e' minore di quello nel genitore?")
print("=" * 100)
prima, dopo = [], []
for b, s, res, quanti, sp0 in sorted(dettagli, key=lambda z: -z[4]):
    # SENZA `setdiff1d(..., [b])`. Il pezzo `part == 0` tiene l'ID `b` del genitore (riga sopra:
    # `NUOVA[m_[part == 0]] = b`), quindi togliere `[b]` dall'insieme scartava dal verdetto proprio
    # il pezzo piu' grosso — quello che di solito NON si divide. La mediana risultava piu' bassa di
    # quanto sia, e il verdetto «lo spread scende» era compiacente. Vedi il commento in testa.
    pezzi = [SP2[p] for p in np.unique(NUOVA[MEMBRI[b]])]
    pezzi = [p for p in pezzi if not np.isnan(p)]
    med = float(np.median(pezzi)) if pezzi else float('nan')
    prima.append(sp0)
    dopo.extend(pezzi)
    print(f"  bolla {b:>5} ({s:>3} tit.) -> {quanti} pezzi · spread {sp0:>7.1f} -> mediana pezzi "
          f"{med:>6.1f} {'OK' if med < sp0 else ' PEGGIO'}")
print(f"\n  complessivo: spread mediano prima {np.median(prima):.1f} -> dopo {np.median(dopo):.1f}")
print(f"  pezzi con spread < 10: {sum(1 for p in dopo if p < 10)}/{len(dopo)} "
      f"({100*sum(1 for p in dopo if p < 10)/len(dopo):.0f}%)")
print(f"  e i genitori con spread < 10 erano: {sum(1 for p in prima if p < 10)}/{len(prima)}")

np.save(ML / "bolle-eterogeneo-subvoti.npy", NUOVA)
print(f"\n  salvata: bolle-eterogeneo-subvoti.npy")
print(f"\nFINE ({time.time()-T0:.0f}s)")
