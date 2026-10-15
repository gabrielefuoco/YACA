"""03-chimere-v8-v10.py — la coerenza intra-cluster, su V8 e su V10, con la STESSA misura.

E' la domanda numero uno dell'utente: «in una bolla ci stanno titoli davvero simili?». La misura e'
l'indice di chimera del ticket 03 di `coerenza`: la PMI mediana fra i 5 token tematici di testa di
ogni bolla, **solo `kw:` e `ge:` e solo con df >= 30** — la stessa forma validata allora.

Il primo tentativo su V10 aveva due difetti, e li correggo qui:
  · mescolava i tipi (un `ge:` e un `rt:` non co-occorrono mai, e finivano a -4 per costruzione);
  · confrontava V10 con un numero di V8 calcolato **in un altro modo**. Le due partizioni vanno
    misurate dalla **stessa funzione**, altrimenti si confrontano mele con arance.

E in piu': N_eff sui tropi chiave, e la dimensione delle bolle.
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
print("=" * 100)
print("LA COERENZA INTRA-CLUSTER — V8 contro V10, con la stessa misura")
print("=" * 100, flush=True)

TF = sp.load_npz(ML / "05-tfidf.npz").tocsr()
vocab = json.load(open(ML / "05-vocab.json", encoding="utf-8"))
inv = {i: t for t, i in vocab.items()}
TFc = TF.tocsc()
dfcol = np.diff(TFc.indptr)
n_tit = TF.shape[0]

KEY = {"kw:psychological thriller", "kw:film noir", "kw:spaghetti western", "kw:iyashikei",
       "kw:true crime", "kw:cyberpunk", "kw:slasher", "kw:superhero", "kw:revenge", "kw:love"}


def chimere(mem, quanti_min=5, max_bolle=4000):
    """(PMI mediane per bolla, N_eff per i tropi chiave). La stessa funzione per ogni partizione."""
    NB = int(mem.max()) + 1
    ordine = np.argsort(mem, kind="stable")
    confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
    MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
    # i centroidi tematici
    r_, c_, v_ = [], [], []
    for b in range(NB):
        s = np.asarray(TF[MEMBRI[b]].sum(0)).ravel() / max(len(MEMBRI[b]), 1)
        nz = np.nonzero(s)[0]
        r_.extend([b] * len(nz))
        c_.extend(nz.tolist())
        v_.extend(s[nz].tolist())
    MU = sp.csr_matrix((v_, (r_, c_)), shape=(NB, TF.shape[1]), dtype=np.float32)
    out = []
    for b in range(NB):
        if len(MEMBRI[b]) < quanti_min:
            continue
        ve = MU[b].toarray().ravel()
        top = np.argsort(-ve)[:8]
        tem = [inv[int(x)] for x in top
               if ve[x] > 0 and inv[int(x)][:3] in ("kw:", "ge:") and dfcol[x] >= 30][:5]
        if len(tem) < 3:
            continue
        pmi = []
        for i in range(len(tem)):
            for j in range(i + 1, len(tem)):
                ca = TFc.indices[TFc.indptr[vocab[tem[i]]]:TFc.indptr[vocab[tem[i]] + 1]]
                cb = TFc.indices[TFc.indptr[vocab[tem[j]]]:TFc.indptr[vocab[tem[j]] + 1]]
                inter = np.intersect1d(ca, cb, assume_unique=True).size
                if inter == 0:
                    pmi.append(-4.0)
                else:
                    pmi.append(float(np.log((inter / n_tit) /
                                            ((len(ca) / n_tit) * (len(cb) / n_tit)))))
        out.append((b, int(len(MEMBRI[b])), float(np.median(pmi)), tem))
    # N_eff per i tropi chiave
    neff = {}
    for t in KEY:
        j = vocab.get(t)
        if j is None:
            continue
        righe = TFc.indices[TFc.indptr[j]:TFc.indptr[j + 1]]
        p = np.bincount(mem[righe], minlength=NB).astype(float)
        p = p[p > 0]
        p /= p.sum()
        neff[t] = 1.0 / float((p ** 2).sum())
    return out, neff, NB


V8 = np.load(ML / "bolle-nitrile-V8.npy")
V10 = np.load(ML / "bolle-eterogeneo-V10-p1.0.npy")
RIS = {}
for nome, mem in (("V8 (senza trama)", V8), ("V10 (con la trama, peso 1.0)", V10)):
    t = time.time()
    out, neff, NB = chimere(mem)
    med = np.median([c[2] for c in out])
    neg = [c for c in out if c[2] < 0]
    RIS[nome] = (out, neff, NB)
    print(f"\n{'='*100}\n{nome}\n{'='*100}")
    print(f"  {NB:,} bolle · giudicabili {len(out):,} · mediana della dimensione "
          f"{int(np.median(np.bincount(mem)))}")
    print(f"  COERENZA: PMI mediana {med:+.3f} · bolle a PMI negativa {len(neg):,} "
          f"({100*len(neg)/max(len(out),1):.1f}%)")
    print(f"     la piu' bassa: {out[0][2]:+.3f} · la piu' alta: {out[-1][2]:+.3f}")
    print(f"  le cinque piu' incoerenti:")
    for b, s, p, tem in out[:5]:
        print(f"     bolla {b:>4} ({s:>3} tit.) PMI {p:+.3f} · {' · '.join(tem)}")
    print(f"  N_eff sui tropi chiave:")
    for k, v in sorted(neff.items(), key=lambda z: z[1]):
        print(f"     {k:<34} {v:>7.2f}")
    print(f"  ({time.time()-t:.0f}s)", flush=True)

print("\n" + "=" * 100)
print("IL CONFRONTO")
print("=" * 100)
o8, n8, b8 = RIS["V8 (senza trama)"]
o10, n10, b10 = RIS["V10 (con la trama, peso 1.0)"]
print(f"  {'':<34} {'V8':>10} {'V10':>10}")
print(f"  {'bolle':<34} {b8:>10,} {b10:>10,}")
print(f"  {'bolle giudicabili':<34} {len(o8):>10,} {len(o10):>10,}")
print(f"  {'PMI mediana (coerenza)':<34} {np.median([c[2] for c in o8]):>+10.3f} "
      f"{np.median([c[2] for c in o10]):>+10.3f}")
print(f"  {'bolle a PMI negativa':<34} {len([c for c in o8 if c[2]<0]):>10,} "
      f"{len([c for c in o10 if c[2]<0]):>10,}")
for k in sorted(n8):
    print(f"  N_eff {k:<28} {n8[k]:>10.2f} {n10.get(k, float('nan')):>10.2f}")
print(f"\n  la trama rende le bolle PIU' COERENTI? "
      f"{'sì' if np.median([c[2] for c in o10]) > np.median([c[2] for c in o8]) else 'no'}"
      f" · e la frammentazione {'scende' if np.median(list(n10.values())) < np.median(list(n8.values())) else 'sale'}")
print(f"\nFINE ({time.time()-T0:.0f}s)")
