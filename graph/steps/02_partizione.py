"""02-v10.py — la partizione col componente di trama, e i due arbitri.

L'architettura dell'utente: un unico grafo eterogeneo dove gli embedding sono un TIPO DI ARCO. Questo
script costruisce V10 — la miscela di V8 **piu' il componente di trama** — e la confronta con V8 su
tutto quello che sappiamo misurare.

Gli arbitri, e misurano due cose diverse (lezione di questa sessione):
  · **coerenza intra-cluster** — l'indice di chimera: la PMI fra i 5 token di testa di ogni bolla.
    E' la domanda numero uno dell'utente: «in una bolla ci stanno titoli davvero simili?»
  · **N_eff** — la frammentazione dei mondi, per tropo.
  · e le sentinelle, il conteggio, la purezza, il tempo.

Il peso del componente si SCEGLIE, non si assume: si provano 0.5, 1.0 e 2.0 e si guarda. Con un
segnale piccolo come quello della trama (+0,018 di scarto) il rischio e' che anneghi o che anneghi.

Nota sui centroidi: l'indice di chimera si calcola sui centroidi V3, che sono legati alla partizione
V8. Per giudicare V10 i centroidi vanno **rifatti** sulla partizione nuova — ed e' quello che fa lo
script, altrimenti si confrontano mele con arance.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
import sys; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from graph import bubbles as B
from graph import canon as K

T0 = time.time()
ML = K.DATA      # i dati del modulo hanno una cartella loro
PESI = [float(x) for x in (sys.argv[1:] or ["1.0"])]
# LA RISOLUZIONE si puo' cambiare da riga di comando: RES=200 e' la prova «bolle piu' piccole» chiesta
# dall'utente. Il ticket 09 di `bolle-nitrile` diceva «RB 200 frantuma», ma lo diceva su un'altra
# partizione e con le metriche vecchie: qui si rimisura, e si GUARDA.
RES = int(__import__("os").environ.get("RES", "100"))
print("=" * 104)
print("LA PARTIZIONE COL COMPONENTE DI TRAMA — V10")
print("=" * 104, flush=True)

V8 = np.load(ML / "bolle-nitrile-V8.npy")
sz8 = np.bincount(V8)
TRAMA = sp.load_npz(ML / "eterogeneo-TRAMA.npz").tocsr()
TRAMA.setdiag(0)
TRAMA.eliminate_zeros()
gt = np.asarray((TRAMA > 0).sum(1)).ravel()
print(f"  V8: {len(sz8):,} bolle · mediana {int(np.median(sz8))}", flush=True)
print(f"  componente di trama: {TRAMA.nnz:,} archi · mediana {int(np.median(gt[gt>0]))} · "
      f"coperti {int((gt>0).sum()):,}/{B.N:,} ({100*(gt>0).mean():.1f}%)", flush=True)

# ---------------------------------------------------------------- la miscela
INS = B.costruisci_insiemi()
C = B.carica_componenti(con_shrinkage=True, min_sim_kw=0.12, min_sim_cast=0.02,
                        ricostruisci="cache", insiemi=INS)
CD = dict(C)
CD["DIR"] = B.maschera_genere(C["DIR"], INS["GEN"], INS["KW"], etichetta="DIR")
CD["CAST"] = B.maschera_genere(C["CAST"], INS["GEN"], INS["KW"], etichetta="CAST")
CD["TRAMA"] = TRAMA
print(f"  componenti pronti, TRAMA compreso ({time.time()-T0:.0f}s)", flush=True)

for peso in PESI:
    print(f"\n{'='*104}\nTRAMA con peso {peso}\n{'='*104}", flush=True)
    BASE = {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 3, "LIST": 1,
            "TRAMA": peso}
    t = time.time()
    M = B.costruisci_2(CD, BASE, beta=0.25, tau_rel=1.0, caldi_sopra=5)
    print(f"  miscela ({time.time()-t:.0f}s)", flush=True)
    M = B.chiusura_triangolare(M, alpha0=0.1, etichetta=f"V10p{peso}")
    M = B.consenso_multivista(M, CD, BASE)
    W = B.archi_leiden(M, etichetta=f"V10p{peso}")
    del M
    # IL TRIANGOLO VA SALVATO: e' il grafo di Leiden, e senza di lui non si possono fare la
    # connettivita' esterna ne' il sub-clustering senza ricostruire tutto (600 s). Per V8 esisteva,
    # per V10 l'avevo perso — lezione imparata.
    np.savez_compressed(ML / f"bolle-eterogeneo-V10-p{peso}-r{RES}-triangolo.npz",
                        data=W.data, indices=W.indices, indptr=W.indptr)
    print(f"  triangolo: {W.nnz:,} archi · salvato ({time.time()-T0:.0f}s)", flush=True)
    mem = B.partizione(W, RES, "RB", n_iterations=6, etichetta=f"V10p{peso}r{RES}")
    mem = B.potatura_nucleo(mem, W, quanti_nucleo=4, etichetta=f"V10p{peso}")
    np.save(ML / f"bolle-eterogeneo-V10-p{peso}-r{RES}.npy", mem)
    sz = np.bincount(mem)
    print(f"\n  V10 (peso {peso}): {len(sz):,} bolle · mediana {int(np.median(sz))} · "
          f"la piu' grossa {int(sz.max())} · >=15 {int((sz>=15).sum()):,}", flush=True)

    # -------------------------------------------------- gli arbitri, sui centroidi RIFATTI
    TF = sp.load_npz(ML / "05-tfidf.npz").tocsr()
    vocab = json.load(open(ML / "05-vocab.json", encoding="utf-8"))
    inv = {i: t for t, i in vocab.items()}
    NB = len(sz)
    ordine = np.argsort(mem, kind="stable")
    confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
    MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
    r_, c_, v_ = [], [], []
    for b in range(NB):
        s = np.asarray(TF[MEMBRI[b]].sum(0)).ravel() / max(len(MEMBRI[b]), 1)
        nz = np.nonzero(s)[0]
        r_.extend([b] * len(nz))
        c_.extend(nz.tolist())
        v_.extend(s[nz].tolist())
    MU = sp.csr_matrix((v_, (r_, c_)), shape=(NB, TF.shape[1]), dtype=np.float32)

    # l'indice di chimera: la PMI fra i 5 token di testa, col filtro di supporto df >= 30
    dfcol = np.diff(TF.tocsc().indptr)
    n_tit = TF.shape[0]
    TFc = TF.tocsc()
    chim = []
    for b in range(NB):
        if len(MEMBRI[b]) < 5:
            continue
        ve = MU[b].toarray().ravel()
        top = np.argsort(-ve)[:5]
        termini = [inv[int(x)] for x in top
                   if ve[x] > 0 and inv[int(x)][:3] in ("kw:", "ge:") and dfcol[x] >= 30]
        if len(termini) < 3:
            continue
        pmi = []
        for i in range(len(termini)):
            for j in range(i + 1, len(termini)):
                ca = TFc.indices[TFc.indptr[vocab[termini[i]]]:TFc.indptr[vocab[termini[i]] + 1]]
                cb = TFc.indices[TFc.indptr[vocab[termini[j]]]:TFc.indptr[vocab[termini[j]] + 1]]
                inter = np.intersect1d(ca, cb, assume_unique=True).size
                if inter == 0:
                    pmi.append(-4.0)
                else:
                    pmi.append(float(np.log((inter / n_tit) /
                                            ((len(ca) / n_tit) * (len(cb) / n_tit)))))
        chim.append((b, int(sz[b]), float(np.median(pmi))))
    chim.sort(key=lambda z: z[2])
    neg = [c for c in chim if c[2] < 0]
    print(f"  ARBITRO coerenza intra-cluster: {len(chim):,} bolle giudicabili · "
          f"PMI mediana {np.median([c[2] for c in chim]):+.3f} · bolle con PMI negativa "
          f"{len(neg)} ({100*len(neg)/max(len(chim),1):.1f}%)", flush=True)
    print(f"     le cinque piu' incoerenti:", flush=True)
    for b, s, p in chim[:5]:
        ve = MU[b].toarray().ravel()
        tt = [inv[int(x)] for x in np.argsort(-ve)[:5] if ve[x] > 0][:5]
        print(f"       bolla {b:>4} ({s:>3} tit.) PMI {p:+.3f} · {' · '.join(tt)}", flush=True)
    np.savez_compressed(ML / f"eterogeneo-chimere-p{peso}-r{RES}.npz",
                        bolle=np.array([c[0] for c in chim]),
                        sz=np.array([c[1] for c in chim]),
                        pmi=np.array([c[2] for c in chim]))

print(f"\nFINE ({time.time()-T0:.0f}s)")
