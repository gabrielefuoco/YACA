"""09-subclustering.py — TICKET 09, prima parte: spezzare le bolle-continente.

§5.2.2 del senior: «non cambiare la risoluzione globale RB 100 (che sulle nicchie da 15-40 titoli e'
perfetta). Prendi SOLO le 357 bolle con oltre 60 titoli e fai girare un secondo passo di Leiden sul
loro sottografo, dividendole finche' nessuna supera i 60-70 titoli. Vedrai la bolla 820 dividersi in
Sci-Fi Mind-Bending e Thriller Psicologico/Investigativo.»

Qui si fa esattamente questo, senza ricostruire la partizione: si lavora sul triangolo di V8, che e'
gia' su disco. 357 Leiden su grafi da 60 a 552 nodi costano secondi.

La risoluzione si CERCA, non si sceglie: per ogni bolla si prova una scala di RB e si prende la prima
che porta il pezzo piu' grosso sotto i 60 titoli. Se nessuna ci riesce, la bolla resta intera e lo si
dichiara — una bolla puo' essere grande perche' e' un mondo grande, non perche' e' un minestrone.

E poi l'arbitro: N_eff e indice di chimera **prima e dopo**, sulle stesse ancore.
"""
import json
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
SOGLIA = 70          # il tetto che il senior chiede per il pezzo piu' grosso
PMI_MIN = -1.0       # ...ma il bersaglio non e' la TAGLIA, e' la CHIMERA
RISOLUZIONI = (0.03, 0.06, 0.12, 0.25, 0.5, 1.0)   # pesi NORMALIZZATI (media 1)

# PERCHE' NON LA TAGLIA, e questa e' una correzione al senior. Lui chiede di spezzare le bolle sopra
# i 60 titoli e di verificare che «la bolla 820 si divida in Sci-Fi Mind-Bending e Thriller
# Psicologico». Ma la 820 ha **46** titoli e la 594 ne ha **51**: la sua stessa soglia esclude le due
# bolle che vuole vedere divise. E il difetto che descrive — due mondi incollati da un terzo fattore —
# e' esattamente cio' che l'indice di chimera del ticket 03 misura. Quindi il bersaglio e' la chimera,
# e la taglia e' solo un secondo criterio.
print("=" * 104)
print("TICKET 09 — SUB-CLUSTERING DELLE BOLLE-CONTINENTE")
print("=" * 104, flush=True)

import igraph as ig
import leidenalg as la

mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
q = np.load(ML / "bolle-nitrile-V8-triangolo.npz")
W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]

CO = np.load(ML / "coerenza-neff.npz", allow_pickle=True)
pmi_di = {int(b): float(p) for b, p in zip(CO["bolle"], CO["pmi_mediana"])}
chimere = np.array([b for b, p in pmi_di.items() if p < PMI_MIN and sz[b] > 10])
grandi = np.unique(np.concatenate([np.where(sz > SOGLIA)[0], chimere]))
print(f"  bersagli: {len(grandi):,} bolle · sopra i {SOGLIA} titoli "
      f"{int((sz > SOGLIA).sum()):,} · chimere (PMI < {PMI_MIN}, oltre 10 titoli) {len(chimere):,} "
      f"· in unione {len(grandi):,}", flush=True)
print(f"  la bolla 820 (46 titoli) e' una chimera? {'sì' if 820 in chimere else 'no, PMI ' + format(pmi_di.get(820, 0), '+.3f')}",
      flush=True)
print(f"  la bolla 594 (51 titoli) e' una chimera? {'sì' if 594 in chimere else 'no, PMI ' + format(pmi_di.get(594, 0), '+.3f')}",
      flush=True)

# ---------------------------------------------------------------- il sub-clustering
SUBLAB = mem.copy()          # il risultato: le stesse bolle, alcune divise
divisioni = {}
intere = 0
for n, b in enumerate(grandi):
    m_ = MEMBRI[b]
    sub = W[m_][:, m_].tocoo()
    if sub.nnz == 0:
        intere += 1
        continue
    g = ig.Graph(n=len(m_), edges=np.column_stack((sub.row, sub.col)), directed=False)
    # I PESI SI NORMALIZZANO. La risoluzione RB e' nella stessa unita' dei pesi, quindi la stessa
    # risoluzione che sul grafo intero fa 1.625 bolle ne fa 31.908 sui sottografi — misurato: la
    # prima esecuzione ha frantumato tutto in singoli, mediana 1. Dividendo per la media degli archi
    # del sottografo, "risoluzione 1" significa la stessa cosa su ogni bolla.
    w_sub = sub.data.astype(float)
    g.es["weight"] = (w_sub / max(w_sub.mean(), 1e-9)).tolist()
    pezzi = None
    for res in RISOLUZIONI:
        p = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                              resolution_parameter=res, seed=42, n_iterations=6)
        part = np.array(p.membership)
        # il piu' GROSSOLANO che soddisfa il tetto: si cerca dal basso e si prende il primo. Con
        # 0,5 sulla prima esecuzione uscivano ~21 pezzi per bolla (7.402 bolle, mediana 3): la
        # risoluzione giusta e' un ordine di grandezza sotto.
        tetto = max(12, min(SOGLIA, len(m_) // 2))
        if len(part) and np.bincount(part).max() <= tetto:
            pezzi = (res, part)
            break
    if pezzi is None:
        # nessuna risoluzione spezza abbastanza: si prende la piu' fine provata, se divide
        p = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                              resolution_parameter=1.0, seed=42, n_iterations=6)
        part = np.array(p.membership)
        if len(np.bincount(part)) > 1:
            pezzi = (RISOLUZIONI[-1], part)
    if pezzi is None:
        intere += 1
        continue
    res, part = pezzi
    divisioni[b] = (res, part)
    if (n + 1) % 50 == 0:
        print(f"    {n+1:,}/{len(grandi):,} ({time.time()-T0:.0f}s)", flush=True)

# nuova etichetta: le bolle divise prendono id nuovi
prossimo = NB
NUOVA = mem.copy()
for b, (res, part) in divisioni.items():
    m_ = MEMBRI[b]
    for k in range(1, int(part.max()) + 1):
        sel = m_[part == k]
        NUOVA[sel] = prossimo
        prossimo += 1
    NUOVA[m_[part == 0]] = b
sz2 = np.bincount(NUOVA)
print(f"\n  bolle divise: {len(divisioni):,}/{len(grandi):,} · lasciate intere: {intere:,}")
print(f"  partizione: {NB:,} -> {len(sz2):,} bolle · mediana {int(np.median(sz2))} · "
      f"la piu' grossa {int(sz2.max())} · sopra i {SOGLIA}: {int((sz2 > SOGLIA).sum()):,}")
print(f"  ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- i casi che il senior nomina
TIT, _ = B.titoli_leggibili()
print("\n" + "=" * 104)
print("LA BOLLA 820 SI E' DIVISA?")
print("=" * 104)
for b, perche in ((820, "il minestrone di Verity — Inception, Fight Club, Gone Girl"),
                  (594, "spaghetti western con dentro Zeder e Dabbe"),
                  (12, "true crime, 205 titoli"),
                  (750, "il fantasy anni '80, 41 titoli — non deve cambiare")):
    if b not in divisioni:
        print(f"\n  bolla {b} ({int(sz[b])} titoli) — {perche}: NON divisa")
        continue
    res, part = divisioni[b]
    print(f"\n  bolla {b} ({int(sz[b])} titoli) — {perche}")
    print(f"     risoluzione RB {res} → {int(part.max())+1} pezzi:")
    m_ = MEMBRI[b]
    for k in range(int(part.max()) + 1):
        sel = m_[part == k]
        nomi = [TIT[x][:30] for x in sel[:6]]
        print(f"       pezzo {k} ({len(sel):>3} titoli): {nomi}")

# ---------------------------------------------------------------- l'arbitro: N_eff prima e dopo
print("\n" + "=" * 104)
print("L'ARBITRO — N_eff prima e dopo, sulle stesse ancore")
print("=" * 104, flush=True)
TF = sp.load_npz(ML / "05-tfidf.npz").tocsr().tocsc()
vocab = json.load(open(ML / "05-vocab.json", encoding="utf-8"))
df = np.diff(TF.indptr)


def neff(colonna, labels):
    righe = TF.indices[TF.indptr[colonna]:TF.indptr[colonna + 1]]
    p = np.bincount(labels[righe], minlength=labels.max() + 1).astype(float)
    p = p[p > 0]
    p /= p.sum()
    return 1.0 / float((p ** 2).sum())


print(f"  {'tropo':<34} {'prima':>8} {'dopo':>8}   differenza")
for chiave in ("kw:psychological thriller", "kw:film noir", "kw:spaghetti western", "kw:iyashikei",
               "kw:true crime", "kw:cyberpunk", "kw:slasher", "kw:superhero"):
    j = vocab.get(chiave)
    if j is None:
        continue
    a = neff(j, mem)
    b_ = neff(j, NUOVA)
    print(f"  {chiave:<34} {a:>8.2f} {b_:>8.2f}   {b_-a:+7.2f}")

# e la frammentazione media su tutte le ancore
inv = {i: t_ for t_, i in vocab.items()}
cand = [j for j, d in enumerate(df) if 30 <= d <= 1500 and inv.get(j, "")[:3] in ("kw:", "ge:")]
prima, dopo = [], []
for j in cand[:800]:
    prima.append(neff(j, mem))
    dopo.append(neff(j, NUOVA))
print(f"\n  N_eff mediano su {len(prima)} ancore: prima {np.median(prima):.1f} · "
      f"dopo {np.median(dopo):.1f}")

np.save(ML / "bolle-nitrile-V8sub.npy", NUOVA)
print(f"\n  salvata: bolle-nitrile-V8sub.npy ({len(sz2):,} bolle)")
print(f"\nFINE ({time.time()-T0:.0f}s)")
