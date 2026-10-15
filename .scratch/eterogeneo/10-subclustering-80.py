"""10-subclustering-80.py — spezzare SOLO le bolle con 80+ titoli.

L'idea dell'utente: «potrebbe essere utile spezzare solo le bolle grosse (con 80+ film). Magari
trattarle come un grafo isolato e clusterizzare di nuovo solo là dentro, per vedere se la situazione
migliora.»

Tre cose imparate a spese mie, e applicate qui:
  1. **i pesi si normalizzano** prima di Leiden: la risoluzione RB e' nella stessa unita' dei pesi, e
     la stessa risoluzione che sul grafo intero fa 2.838 bolle ne fa 30.000 su un sottografo. Nel
     ticket 09 di `coerenza` la prima esecuzione ha frantumato tutto in singoli, mediana 1.
  2. **le risoluzioni si cercano dal basso** e si prende la piu' grossolana che divide, non la prima
     che capita.
  3. **si misura la coerenza PRIMA e DOPO** con la stessa funzione (l'indice di chimera), e poi si
     GUARDA. La metrica dice se migliora; l'occhio dice se i pezzi hanno un nome.

Si spezzano solo le bolle con 80+ titoli: sono ~300 su 2.838, e toccare le altre 2.500 (che la lettura
manuale ha mostrato essere saghe e mondi precisi) sarebbe un danno.

NON si ricostruisce la partizione globale: si lavora sul sottografo di ogni bolla grossa, quindi il
costo e' secondi.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
SOGLIA = int(sys.argv[1]) if len(sys.argv) > 1 else 80
print("=" * 100)
print(f"SUB-CLUSTERING DELLE BOLLE CON {SOGLIA}+ TITOLI")
print("=" * 100, flush=True)

mem = np.load(ML / "bolle-eterogeneo-V10-p1.0-r200.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
    # ATTENZIONE AL NOME: il triangolo e' il grafo PRIMA di Leiden, quindi NON dipende dalla
    # risoluzione. Il file salvato si chiama `r100` perche' un rilancio non ha passato RES=200, ma e'
    # lo stesso grafo da cui viene la partizione r200. La risoluzione cambia solo Leiden.
q = np.load(ML / "bolle-eterogeneo-V10-p1.0-triangolo.npz")
W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
print(f"  partizione: {NB:,} bolle · mediana {int(np.median(sz))} · la piu' grossa {int(sz.max())}")
print(f"  grafo: {W.nnz:,} archi · da spezzare: {int((sz >= SOGLIA).sum()):,} bolle "
      f"({int(sz[sz>=SOGLIA].sum()):,} titoli, {100*sz[sz>=SOGLIA].sum()/N:.0f}% del canone) "
      f"({time.time()-T0:.0f}s)", flush=True)

ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]

# ---------------------------------------------------------------- il sub-clustering
import igraph as ig
import leidenalg as la

RISOLUZIONI = (0.05, 0.1, 0.2, 0.4, 0.8)
ber = np.where(sz >= SOGLIA)[0]
NUOVA = mem.copy()
prossimo = NB
dettagli = []
for n, b in enumerate(ber):
    m_ = MEMBRI[b]
    sub = W[m_][:, m_].tocoo()
    if sub.nnz == 0:
        continue
    g = ig.Graph(n=len(m_), edges=np.column_stack((sub.row, sub.col)), directed=False)
    w = sub.data.astype(float)
    g.es["weight"] = (w / max(w.mean(), 1e-9)).tolist()
    tetto = max(20, min(SOGLIA, len(m_) // 2))
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
        sel = m_[part == k]
        NUOVA[sel] = prossimo
        prossimo += 1
    NUOVA[m_[part == 0]] = b
    dettagli.append((int(b), int(sz[b]), res, int(part.max()) + 1))
sz2 = np.bincount(NUOVA)
print(f"\n  divise {len(dettagli):,} bolle · risoluzioni usate: "
      f"{sorted({d[2] for d in dettagli})}")
print(f"  partizione: {NB:,} -> {len(sz2):,} bolle · mediana {int(np.median(sz2))} · "
      f"la piu' grossa {int(sz2.max())} · sopra {SOGLIA}: {int((sz2 >= SOGLIA).sum()):,} "
      f"({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- la coerenza, prima e dopo
TF = sp.load_npz(ML / "05-tfidf.npz").tocsr()
vocab = json.load(open(ML / "05-vocab.json", encoding="utf-8"))
inv = {i: t for t, i in vocab.items()}
TFc = TF.tocsc()
dfcol = np.diff(TFc.indptr)
n_tit = TF.shape[0]


def chimere(labels):
    NBx = int(labels.max()) + 1
    o = np.argsort(labels, kind="stable")
    c_ = np.searchsorted(labels[o], np.arange(NBx + 1))
    M_ = [o[c_[b]:c_[b + 1]] for b in range(NBx)]
    r_, cc_, v_ = [], [], []
    for b in range(NBx):
        if len(M_[b]) == 0:
            continue
        s = np.asarray(TF[M_[b]].sum(0)).ravel() / len(M_[b])
        nz = np.nonzero(s)[0]
        r_.extend([b] * len(nz))
        cc_.extend(nz.tolist())
        v_.extend(s[nz].tolist())
    MU = sp.csr_matrix((v_, (r_, cc_)), shape=(NBx, TF.shape[1]), dtype=np.float32)
    out = []
    for b in range(NBx):
        if len(M_[b]) < 5:
            continue
        ve = MU[b].toarray().ravel()
        tem = [inv[int(x)] for x in np.argsort(-ve)[:8]
               if ve[x] > 0 and inv[int(x)][:3] in ("kw:", "ge:") and dfcol[x] >= 30][:5]
        if len(tem) < 3:
            continue
        pmi = []
        for i in range(len(tem)):
            for j in range(i + 1, len(tem)):
                ca = TFc.indices[TFc.indptr[vocab[tem[i]]]:TFc.indptr[vocab[tem[i]] + 1]]
                cb = TFc.indices[TFc.indptr[vocab[tem[j]]]:TFc.indptr[vocab[tem[j]] + 1]]
                inter = np.intersect1d(ca, cb, assume_unique=True).size
                pmi.append(-4.0 if inter == 0 else
                           float(np.log((inter / n_tit) / ((len(ca) / n_tit) * (len(cb) / n_tit)))))
        out.append((b, len(M_[b]), float(np.median(pmi)), tem))
    return out


prima = chimere(mem)
dopo = chimere(NUOVA)
print(f"\n  COERENZA: prima PMI mediana {np.median([c[2] for c in prima]):+.3f} "
      f"({len(prima):,} bolle) · dopo {np.median([c[2] for c in dopo]):+.3f} ({len(dopo):,} bolle)")
print(f"  bolle a PMI negativa: prima {len([c for c in prima if c[2]<0]):,} "
      f"({100*len([c for c in prima if c[2]<0])/len(prima):.1f}%) · "
      f"dopo {len([c for c in dopo if c[2]<0]):,} "
      f"({100*len([c for c in dopo if c[2]<0])/len(dopo):.1f}%)", flush=True)

# ---------------------------------------------------------------- e ora si GUARDA
TIT, VOT = B.titoli_leggibili()
print("\n" + "=" * 100)
print(f"LE BOLLE SPEZZATE, LETTE — le dieci piu' grosse e i loro pezzi")
print("=" * 100)
for b, s, res, quanti in sorted(dettagli, key=lambda z: -z[1])[:10]:
    print(f"\n  bolla {b} ({s} tit.) -> {quanti} pezzi (RB {res})")
    for k in range(quanti):
        # i pezzi hanno id nuovi: si ritrovano dai membri
        m0 = np.where(NUOVA == b)[0] if k == 0 else None
    # piu' semplice: si ricalcola la mappa pezzo -> titoli
    pezzi = {}
    for r in np.where(mem == b)[0]:
        pezzi.setdefault(int(NUOVA[r]), []).append(r)
    for pid, membri in sorted(pezzi.items(), key=lambda z: -len(z[1]))[:6]:
        o = sorted(membri, key=lambda z: -VOT[z])[:5]
        print(f"     [{int(len(membri)):>3}] " + " | ".join(TIT[x][:28] for x in o))

np.save(ML / f"bolle-eterogeneo-sub{SOGLIA}.npy", NUOVA)
print(f"\n  salvata: bolle-eterogeneo-sub{SOGLIA}.npy ({len(sz2):,} bolle)")
print(f"\nFINE ({time.time()-T0:.0f}s)")
