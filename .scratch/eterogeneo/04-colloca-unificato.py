"""04-colloca-unificato.py — la collocazione col grafo unificato.

L'ultimo pezzo dell'architettura dell'utente: nella collocazione, gli archi di trama aiutano a
**discriminare meglio i film senza suggerimenti di visione**, inserendoli nella bolla giusta.

Il collocatore attuale (macro) usa i centroidi TF-IDF con la pesatura V1: 63,0% nella propria bolla.
Qui si aggiunge il **voto della trama**: quanto la trama del titolo somiglia alle trame dei membri di
una bolla.

    score(i, b) = cos_centroide(i, b) + w · trama(i, b)

dove `trama(i, b)` e' la similarita' media fra l'embedding di i e quelli dei membri di b che hanno una
trama. E poiche' il titolo nuovo NON e' membro di nessuna bolla, il suo arco di trama e' legittimo:
non c'e' nessun auto-scoring da correggere.

ATTENZIONE alla scala, che e' il difetto in cui sono caduto tre volte oggi: i due voti vivono in
intervalli diversi (il coseno fra centroidi 0,02-0,2; la trama 0,3-0,8). Sommarli grezzi significa far
vincere la trama per costruzione. Quindi **normalizzati entrambi**, e il peso `w` misurato.
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
print("LA COLLOCAZIONE COL VOTO DELLA TRAMA")
print("=" * 100, flush=True)

mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
IS_TV = B.IS_TV
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]

E = np.load(ML / "04-trama-qwen3b.npy")
IDX = np.load(ML / "04-trama-qwen3b-idx.npy")
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
POS = {int(r): k for k, r in enumerate(IDX)}
print(f"  embedding {E.shape} · bolle {NB:,} ({time.time()-T0:.0f}s)", flush=True)

# il banco
Bcsr = K.carica_csr("boot-B.npz", N)
serie = np.where(IS_TV & (np.asarray((Bcsr > 0).sum(1)).ravel() > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
vere = np.array([int(mem[i]) for i in tolti])

# il voto della trama: per ogni bolla, la media delle similarita' coi membri che hanno una trama
print(f"  calcolo il voto della trama per le bolle candidate...", flush=True)
CAND = np.concatenate([np.load(ML / "04-centroidi.npz")["bolle_serie"]])
TP = np.zeros((600, len(CAND)), np.float32)
for k, i in enumerate(tolti):
    if int(i) not in POS:
        TP[k] = np.nan
        continue
    ei = E[POS[int(i)]]
    for j, b in enumerate(CAND):
        m_ = [x for x in MEMBRI[int(b)] if int(x) in POS]
        if not m_:
            TP[k, j] = 0.0
            continue
        TP[k, j] = float(np.mean([ei @ E[POS[int(x)]] for x in m_]))
print(f"  fatto ({time.time()-T0:.0f}s) · copertura del banco: "
      f"{int(np.isfinite(TP[:, 0]).sum())}/600", flush=True)

# il voto del centroide, V1, col leave-one-out esatto
TF1 = sp.load_npz(ML / "04-tfidf.npz").tocsr()
C4 = np.load(ML / "04-centroidi.npz")
CENT = C4["uniforme"]
NORM = np.linalg.norm(CENT, axis=1, keepdims=True) + 1e-9
V = np.asarray(TF1[tolti] @ CENT.T)
COS = V / NORM.T
pos_c = {int(b): k for k, b in enumerate(CAND)}
for k, i in enumerate(tolti):
    b = int(mem[i])
    if b not in pos_c:
        continue
    j = pos_c[b]
    n_b = len(MEMBRI[b])
    S_dot = float(COS[k, j]) * n_b * float(NORM[j].ravel()[0])
    nl = np.sqrt(max((n_b * float(NORM[j].ravel()[0])) ** 2 - 2 * S_dot + 1.0, 1e-12))
    COS[k, j] = (S_dot - 1.0) / max(nl, 1e-9)
ok_base = np.array([int(CAND[int(np.argmax(COS[k]))]) for k in range(600)]) == vere
print(f"\n  base (solo centroide V1): {int(ok_base.sum())}/600 ({100*ok_base.mean():.1f}%)", flush=True)


def normalizza(A):
    """Ogni colonna sulla propria scala, e la somma dei voti resta confrontabile."""
    A = A.copy()
    mn = np.nanmin(A, axis=0, keepdims=True)
    mx = np.nanmax(A, axis=0, keepdims=True)
    return (A - mn) / (mx - mn + 1e-9)


CN = normalizza(COS)
TN = normalizza(TP)
m = np.isfinite(TN).all(axis=1)
print(f"\n  {'peso della trama':<20} {'propria bolla':>16}   sui 600 misurabili ({int(m.sum())})")
for w in (0.0, 0.1, 0.25, 0.5, 1.0, 2.0):
    score = CN + w * np.nan_to_num(TN)
    pred = np.array([int(CAND[int(np.argmax(score[k]))]) for k in range(600)])
    ok = pred == vere
    print(f"  {w:<20.2f} {int(ok.sum()):>10}/600 ({100*ok.mean():5.1f}%)   "
          f"{100*ok[m].mean():5.1f}%", flush=True)

print(f"\n  e il conto a due teste, sul sottocampione che il banco puo' misurare:")
score = CN + 0.25 * np.nan_to_num(TN)
pred = np.array([int(CAND[int(np.argmax(score[k]))]) for k in range(600)])
print(f"     centroide + trama 0,25: {100*(pred[m] == vere[m]).mean():.1f}% "
      f"contro {100*ok_base[m].mean():.1f}% del solo centroide")
print(f"\nFINE ({time.time()-T0:.0f}s)")
