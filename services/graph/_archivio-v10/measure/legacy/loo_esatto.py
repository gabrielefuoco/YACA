"""06c-loo-esatto.py — il numero finale del voto diretto, col leave-one-out ESATTO.

Perche' serve un terzo script. Il voto diretto ha dato tre numeri diversi in tre esecuzioni, e
questa e' la storia di come si e' arrivati a quello giusto:

  ticket 05  29,7%  `v·mu` senza normalizzare il centroide, LOO esatto sul prodotto scalare
  ticket 06  63,7%  normalizzato, ma il LOO sbagliato: `(S·n_b − 1)/(n_b − 1)` su un punteggio
                    GIA' diviso per ||mu||, che non e' il numeratore che si crede. Gonfiato.
  ticket 06b 34,2%  normalizzato, LOO con `||mu||` al denominatore — ma il denominatore giusto e'
                    `||mu senza la serie||`, non `||mu||`. Approssimazione buona per le bolle grandi
                    (1/40 di differenza) e cattiva per quelle piccole (1/5 = 20%).

Qui il denominatore si calcola esatto: `||somma − v_i||`, con `v_i` il vettore della serie toltа.
Costa 600 prodotti sparsi su 122.314 colonne, cioe' niente.
"""
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
from graph import bubbles as B
from graph import canon as K

T0 = time.time()
ML = K.ML
print("=" * 100)
print("TICKET 06c — IL VOTO DIRETTO COL LEAVE-ONE-OUT ESATTO")
print("=" * 100, flush=True)

TFIDF = sp.load_npz(K.A("04-tfidf.npz")).tocsr()
C4 = np.load(K.A("04-centroidi.npz"))
bolle_serie, sz = C4["bolle_serie"], C4["sz"]
N = TFIDF.shape[0]
mem = np.load(K.A("bolle-nitrile-V8.npy"))
IS_TV = B.IS_TV
NB = len(sz)
q = np.load(K.A("bolle-nitrile-V8-triangolo.npz"))
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
Ws = (Ws + Ws.T).tocsr()
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
pos = {b: k for k, b in enumerate(bolle_serie)}

Bcsr = K.carica_csr("boot-B.npz", N)
serie = np.where(IS_TV & (np.asarray((Bcsr > 0).sum(1)).ravel() > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
vere = np.array([int(mem[i]) for i in tolti])
dentro = np.isin(vere, bolle_serie)
print(f"  banco {len(tolti)} serie · con la bolla in gara: {int(dentro.sum())} "
      f"({100*dentro.mean():.1f}%) = il tetto", flush=True)

# la matrice delle somme (sparsa) e i punteggi grezzi
r_, c_, v_ = [], [], []
for k, b in enumerate(bolle_serie):
    s = np.asarray(TFIDF[MEMBRI[b]].sum(0)).ravel()
    nz = np.nonzero(s)[0]
    r_.extend([k] * len(nz))
    c_.extend(nz.tolist())
    v_.extend(s[nz].tolist())
SS = sp.csr_matrix((v_, (r_, c_)), shape=(len(bolle_serie), TFIDF.shape[1]), dtype=np.float32)
V = np.asarray((TFIDF[tolti] @ SS.T).todense())            # (600, 336) = somma·v_i
# la serie in esame ha norma 1 (la matrice e' L2-normalizzata)
SELF = np.array([V[k, pos[vere[k]]] if vere[k] in pos else 0.0 for k in range(600)])

# LOO esatto: per ogni serie, e SOLO per la sua bolla, il denominatore diventa ||somma - v_i||
n_b = np.array([len(MEMBRI[b]) for b in bolle_serie], np.float32)
norma = np.sqrt(np.asarray(SS.multiply(SS).sum(1)).ravel())
COS = V / (norma[None, :] + 1e-9)
norma_loo = np.zeros(len(bolle_serie), np.float32)
for k, i in enumerate(tolti):
    b = vere[k]
    if b not in pos:
        continue
    kk = pos[b]
    # ||somma - v_i||^2 = ||somma||^2 - 2 somma·v_i + 1
    q2 = float(norma[kk] ** 2 - 2 * V[k, kk] + 1.0)
    norma_loo[kk] = np.sqrt(max(q2, 1e-12))
    COS[k, kk] = (V[k, kk] - 1.0) / max(norma_loo[kk], 1e-9)

vicini_di = {b: set() for b in range(NB)}
S1 = sp.csr_matrix((np.ones(N, np.float32), (np.arange(N), mem)), shape=(N, NB))
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
for b in range(NB):
    vicini_di[b] = set(BB.getrow(b).indices.tolist())

a = np.array([int(bolle_serie[int(np.argmax(COS[k]))]) for k in range(600)])
ok = a == vere
adj = np.array([a[k] in vicini_di.get(vere[k], set()) for k in range(600)])
print(f"\n  ** voto diretto, coseno, LOO esatto: {int(ok.sum())}/600 ({100*ok.mean():.1f}%) **")
print(f"     adiacente {int(adj.sum())} · scollegata {int((~ok & ~adj).sum())}")
print(f"     sugli {int(dentro.sum())} in gara: {100*ok[dentro].mean():.1f}%  (il tetto)")

# e la correzione dell'approssimazione, per capire quanto contava
COS_app = V / (norma[None, :] + 1e-9)
for k, i in enumerate(tolti):
    b = vere[k]
    if b in pos:
        kk = pos[b]
        COS_app[k, kk] = (V[k, kk] - 1.0) / max(norma[kk], 1e-9)
a_app = np.array([int(bolle_serie[int(np.argmax(COS_app[k]))]) for k in range(600)])
print(f"\n  con l'approssimazione ||mu|| invece di ||mu senza la serie||: "
      f"{int((a_app == vere).sum())}/600 ({100*(a_app == vere).mean():.1f}%)")
print(f"  la differenza e' tutta nelle bolle piccole, dove 1/5 e' il 20% della norma:")
dim_vere = np.array([int(sz[b]) for b in vere])
for lo, hi in ((0, 10), (10, 30), (30, 60), (60, 120), (120, 10**6)):
    m = (dim_vere >= lo) & (dim_vere < hi)
    if m.sum():
        print(f"    bolla vera {lo:>3}-{hi if hi < 10**6 else '∞':>3} titoli: esatto "
              f"{100*ok[m].mean():5.1f}% · approssimato {100*(a_app == vere)[m].mean():5.1f}% "
              f"({int(m.sum())} serie)")

# il tasso base, come vuole il contratto
print()
K.stampa_tasso("voto diretto (LOO esatto)", a, vere)
print(f"  caso vero per questa misura: 1/{len(bolle_serie)} = "
      f"{100/len(bolle_serie):.3f}% (fra le {NB:,} bolle: {100/NB:.3f}%)")
print(f"  lift {100*ok.mean()/(100/len(bolle_serie)):.0f}x sulle bolle-serie")

np.savez_compressed(ML / "06c-voto.npz", COS=COS, tolti=tolti, vere=vere, previste=a,
                    bolle_serie=bolle_serie)
print(f"\nFINE ({time.time()-T0:.0f}s)")
