"""05-leggi-bolle.py — 100 bolle da leggere a occhio, non da misurare.

Istruzione dell'utente: «non commettere l'errore di affidarti solo a metriche ma guarda tu stesso i
risultati (leggi 100 bolle e 100 inserimenti)».

Formato compatto: una bolla per riga, coi suoi 4 titoli piu' votati. E' il formato con cui si vede se
un mondo ha un nome. Il campione e' stratificato per dimensione, cosi' non si legge solo il centro
della distribuzione.

La domanda per ogni bolla: **si puo' dare un nome a questa bolla?** Se sì e' un mondo, se no e' un
raggruppamento. E' il giudizio che le metriche non sanno dare.
"""
import pathlib, sys
import numpy as np, pandas as pd
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bolle-nitrile"))
import bolle as B
import canone as K

PART = sys.argv[1] if len(sys.argv) > 1 else "bolle-eterogeneo-V10-p1.0.npy"
QUANTE = int(sys.argv[2]) if len(sys.argv) > 2 else 100
mem = np.load(K.ML / PART)
sz = np.bincount(mem)
N = len(mem)
TIT, VOT = B.titoli_leggibili()
IS_TV = B.IS_TV

# ordine per dimensione, campionato uniformemente lungo l'intera distribuzione
ordine = np.argsort(-sz)
scelti = [int(ordine[int(k * (len(ordine) - 1) / (QUANTE - 1))]) for k in range(QUANTE)]

print(f"=== {PART} · {len(sz):,} bolle · mediana {int(np.median(sz))} ===")
print(f"=== campione stratificato: {QUANTE} bolle, dalla piu' grossa alla piu' piccola ===")
print()
for n, b in enumerate(scelti, 1):
    m_ = np.where(mem == b)[0]
    o = np.argsort(-VOT[m_])[:5]
    nomi = [TIT[x][:34] for x in m_[o]]
    serie = int(IS_TV[m_].sum())
    print(f"{n:>3}. [{b:>5}] {int(sz[b]):>3} tit. ({serie} serie) · " + " | ".join(nomi))
