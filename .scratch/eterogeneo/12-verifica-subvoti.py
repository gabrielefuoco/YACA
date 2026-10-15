"""12-verifica-subvoti.py — ha senso? ha causato errori?

La domanda dell'utente, ed e' quella che avrei dovuto farmi prima di dire «spettacolare». Un criterio
sui VOTI e' pericoloso: i voti di una saga sono diversi (*Shrek* 20.000, *Shrek 4* 3.000), quindi la
divisione potrebbe **separare le saghe** — che era la cosa migliore delle 100 bolle lette.

Cinque controlli:
  1. **le saghe**: 30 saghe note, sono ancora tutte nella stessa bolla? E' il test che conta.
  2. **la coerenza semantica** (l'indice di chimera): peggiora? Il criterio e' numerico, non semantico,
     quindi il rischio e' che i mondi si rompano.
  3. **la dimensione delle bolle**: nascono bolle da 1-2 titoli? Quante?
  4. **i pezzi staccati per voti**: sono sempre "gli oscuri", o a volte sono film giusti?
  5. **la connettivita'**: i pezzi restano legati alla mappa?
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
print("=" * 100)
print("LA DIVISIONE PER VOTI HA SENSO? HA CAUSATO ERRORI?")
print("=" * 100, flush=True)

mem = np.load(ML / "bolle-eterogeneo-V10-p1.0-r200.npy")
sub = np.load(ML / "bolle-eterogeneo-subvoti.npy")
N = len(mem)
TIT, VOT = B.titoli_leggibili()

# ============================================================ 1. le saghe
print("\n" + "=" * 100)
print("1. LE SAGHE — sono ancora tutte nella stessa bolla?")
print("=" * 100, flush=True)
SAGHE = ["Toy Story", "Shrek", "Terminator", "Tremors", "Cars", "Jurassic", "Predator", "Amityville",
         "Resident Evil", "Sharknado", "One Piece", "OSS 117", "Ong-Bak", "Bad Boys", "Final Destination",
         "Mission: Impossible", "Cattivissimo me", "Minions", "Dragon Trainer", "Kung Fu Panda",
         "Il Signore degli Anelli", "Harry Potter", "Ritorno al futuro", "Il padrino", "Rocky",
         "Fast and Furious", "Rambo", "Alien", "Ghostbusters", "Ip Man"]
rotte_prima = rotte_dopo = 0
for saga in SAGHE:
    righe = [r for r in range(N) if saga.lower() in TIT[r].lower() and VOT[r] > 0]
    if len(righe) < 2:
        continue
    b_prima = len(set(int(mem[r]) for r in righe))
    b_dopo = len(set(int(sub[r]) for r in righe))
    stato = "OK " if b_dopo == 1 else ("ROTTA" if b_dopo > b_prima else "→")
    if b_prima > 1:
        rotte_prima += 1
    if b_dopo > 1:
        rotte_dopo += 1
    if b_dopo != b_prima or b_dopo > 1:
        print(f"  {stato} {saga:<24} {len(righe):>2} titoli · bolle: prima {b_prima} -> dopo {b_dopo}")
print(f"\n  saghe su piu' bolle: PRIMA {rotte_prima} · DOPO {rotte_dopo} (su {len(SAGHE)} provate)")

# ============================================================ 2. la coerenza
print("\n" + "=" * 100)
print("2. LA COERENZA SEMANTICA — peggiora?")
print("=" * 100, flush=True)
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
    M2 = [o[c_[b]:c_[b + 1]] for b in range(NBx)]
    r_, cc_, v_ = [], [], []
    for b in range(NBx):
        if len(M2[b]) == 0:
            continue
        s = np.asarray(TF[M2[b]].sum(0)).ravel() / len(M2[b])
        nz = np.nonzero(s)[0]
        r_.extend([b] * len(nz))
        cc_.extend(nz.tolist())
        v_.extend(s[nz].tolist())
    MU = sp.csr_matrix((v_, (r_, cc_)), shape=(NBx, TF.shape[1]), dtype=np.float32)
    out = []
    for b in range(NBx):
        if len(M2[b]) < 5:
            continue
        ve = MU[b].toarray().ravel()
        tem = [inv[int(x)] for x in np.argsort(-ve)[:8]
               if ve[x] > 0 and inv[int(x)][:3] in ("kw:", "ge:") and dfcol[x] >= 30][:5]
        if len(tem) < 3:
            continue
        pp = []
        for i in range(len(tem)):
            for j in range(i + 1, len(tem)):
                ca = TFc.indices[TFc.indptr[vocab[tem[i]]]:TFc.indptr[vocab[tem[i]] + 1]]
                cb = TFc.indices[TFc.indptr[vocab[tem[j]]]:TFc.indptr[vocab[tem[j]] + 1]]
                inter = np.intersect1d(ca, cb, assume_unique=True).size
                pp.append(-4.0 if inter == 0 else
                          float(np.log((inter / n_tit) / ((len(ca) / n_tit) * (len(cb) / n_tit)))))
        out.append(float(np.median(pp)))
    return out


ch_prima = chimere(mem)
ch_dopo = chimere(sub)
print(f"  PMI mediana: prima {np.median(ch_prima):+.3f} · dopo {np.median(ch_dopo):+.3f} "
      f"({'PEGGIORA' if np.median(ch_dopo) < np.median(ch_prima) else 'migliora'})")
print(f"  bolle a PMI negativa: prima {100*np.mean(np.array(ch_prima) < 0):.1f}% · "
      f"dopo {100*np.mean(np.array(ch_dopo) < 0):.1f}%")

# ============================================================ 3. la dimensione
print("\n" + "=" * 100)
print("3. LA DIMENSIONE DELLE BOLLE")
print("=" * 100, flush=True)
sz1, sz2 = np.bincount(mem), np.bincount(sub)
print(f"  bolle: {len(sz1):,} -> {len(sz2):,} · mediana {int(np.median(sz1))} -> {int(np.median(sz2))}")
for nome, s in (("prima", sz1), ("dopo", sz2)):
    print(f"  {nome}: da 1 titolo {int((s==1).sum()):>5,} · 2-4 {int(((s>=2)&(s<=4)).sum()):>5,} · "
          f"5-14 {int(((s>=5)&(s<15)).sum()):>5,} · 15-60 {int(((s>=15)&(s<60)).sum()):>5,} · "
          f"60+ {int((s>=60).sum()):>4,}")
print(f"  titoli in bolle da 1-2: prima {int(sz1[sz1<=2].sum()):,} · dopo {int(sz2[sz2<=2].sum()):,}")

# ============================================================ 4. i pezzi staccati sono "gli oscuri"?
print("\n" + "=" * 100)
print("4. I PEZZI STACCATI — sono sempre gli oscuri, o a volte sono film giusti?")
print("=" * 100, flush=True)
cambiate = [int(b) for b in np.unique(mem) if len(np.unique(sub[np.where(mem == b)[0]])) > 1]
staccati_alti = []
for b in cambiate:
    m_ = np.where(mem == b)[0]
    pezzi = {}
    for r in m_:
        pezzi.setdefault(int(sub[r]), []).append(r)
    med_gen = np.median(VOT[m_])
    for pid, mm in pezzi.items():
        med_p = np.median(VOT[mm])
        if med_p > 2 * med_gen and len(mm) >= 3:
            o = sorted(mm, key=lambda z: -VOT[z])[:4]
            staccati_alti.append((int(b), len(mm), int(med_p), int(med_gen),
                                  [TIT[x][:24] for x in o]))
print(f"  pezzi staccati con voti DOPPI rispetto al genitore: {len(staccati_alti)}")
for b, n, mp, mg, nomi in sorted(staccati_alti, key=lambda z: -z[2])[:12]:
    print(f"    bolla {b:>5} · pezzo da {n:>2} tit. · mediana {mp:>7,} (genitore {mg:>6,})")
    print(f"       {' | '.join(nomi)}")
print(f"\nFINE ({time.time()-T0:.0f}s)")
