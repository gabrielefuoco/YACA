"""06-studente-serie.py — TICKET 06, che il ticket 04 ha reso necessario.

Il fallimento misurato: lo studente e' `metadati -> Cf`, e `Cf` viene da MovieLens, che non ha serie.
Quindi **0 serie** hanno un target, e ogni serie nuova riceve il vettore medio del catalogo — tutte
finiscono negli stessi vicini.

Qui si fa lo stesso lavoro del ticket 01, ma per le serie:
  1. una SVD di `B` (la co-visione Trakt, 14.723 serie) -> il target denso che mancava
  2. la Ridge `FX -> B_svd` sulle sole serie
  3. **lo stesso controllo dei 600**, ma sulle serie: quante tornano nella loro bolla o in una
     adiacente? Il metro e' quello del ticket 04, e va scritto qualunque sia.
  4. il confronto col vecchio studente (quello dei film applicato alle serie): e' il fallimento
     documentato, e serve come baseline.
"""
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI))
import features as F
import canone as K

T0 = time.time()
ML = F.ML
DIM = 128
print("=" * 100)
print("TICKET 06 — lo studente per le SERIE")
print("=" * 100, flush=True)

cat = F.carica_catalogo()
cat2, is_tv = F.arricchisci(cat)
voc = F.costruisci_vocabolari(cat2, is_tv)
FX, _, _ = F.costruisci_fx(cat, voc)
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.preprocessing import normalize
TFIDF = TfidfTransformer().fit(FX)
Sf = normalize(TFIDF.transform(FX)).astype(np.float32)
print(f"feature pronte: {FX.shape} ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- 1. il target: SVD di B sulle serie
B = K.carica_csr("boot-B.npz", FX.shape[0])
grado = np.asarray((B > 0).sum(1)).ravel()
serie = np.where(is_tv & (grado > 0))[0]
print(f"\n1. B (co-visione Trakt): {B.nnz:,} archi · serie con archi: {len(serie):,}", flush=True)
print(f"   (e film con archi: {int((~is_tv & (grado > 0)).sum()):,} — non li uso per questo studente)")

X = B[serie][:, serie].tocsr().astype(np.float32)
c = np.asarray((X > 0).sum(0)).ravel()
Xw = X.multiply((1.0 / np.log1p(np.maximum(c, 1)))[None, :]).tocsr()
t = time.time()
U, S, Vt = __import__("scipy.sparse.linalg", fromlist=["svds"]).svds(Xw, k=DIM)
Z = Vt.T / (np.linalg.norm(Vt.T, axis=1, keepdims=True) + 1e-9)
print(f"   SVD({DIM}): {Z.shape} · varianza {float((S**2).sum()):.1f} ({time.time()-t:.0f}s)", flush=True)
TARGET = np.zeros((FX.shape[0], DIM), np.float32)
TARGET[serie] = Z.astype(np.float32)
np.savez_compressed(ML / "serie-Bsvd.npz", T=TARGET, serie=serie)

# ---------------------------------------------------------------- 2. la Ridge
from sklearn.linear_model import Ridge
maschera_serie = np.zeros(FX.shape[0], bool)
maschera_serie[serie] = True
t = time.time()
mod = Ridge(alpha=10.0, solver="lsqr", max_iter=600).fit(Sf[maschera_serie], TARGET[maschera_serie])
print(f"\n2. Ridge FX -> B_svd sulle {len(serie):,} serie: {time.time()-t:.0f}s "
      f"· coef {mod.coef_.shape}", flush=True)
P_serie = mod.predict(Sf).astype(np.float32)
np.savez_compressed(ML / "inserimento-modello-serie.npz",
                    coef=mod.coef_.astype(np.float32),
                    intercept=np.asarray(mod.intercept_, np.float32),
                    n_col=np.array([FX.shape[1]]), alpha=np.array([10.0]),
                    n_addestramento=np.array([len(serie)]))

# ---------------------------------------------------------------- 3. il controllo sulle serie
mem = np.load(ML / "bolle-nitrile-V7.npy")
sz = np.bincount(mem)
q = np.load(ML / "bolle-nitrile-V7-triangolo.npz")
W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(FX.shape[0],) * 2).tocsr()
S1 = sp.csr_matrix((np.ones(FX.shape[0], np.float32), (np.arange(FX.shape[0]), mem)),
                   shape=(FX.shape[0], len(sz)))
BB = (S1.T @ (W + W.T) @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
vicini_di = {b: set(BB.getrow(b).indices.tolist()) for b in range(len(sz))}
print(f"\n3. mappa delle bolle: {BB.nnz:,} adiacenze ({time.time()-T0:.0f}s)", flush=True)

P = np.load(ML / "cf-studente.npz")["P"]
Pn_vecchio = P / (np.linalg.norm(P, axis=1, keepdims=True) + 1e-9)
Pn_nuovo = P_serie / (np.linalg.norm(P_serie, axis=1, keepdims=True) + 1e-9)
TARGET_n = TARGET / (np.linalg.norm(TARGET, axis=1, keepdims=True) + 1e-9)

rng = np.random.default_rng(13)
N = 600
tolti = rng.choice(serie, min(N, len(serie)), replace=False)
mask = np.ones(FX.shape[0], bool)
mask[tolti] = False
m_cieco = Ridge(alpha=10.0, solver="lsqr", max_iter=600).fit(
    Sf[maschera_serie & mask], TARGET[maschera_serie & mask])
P_cieco = m_cieco.predict(Sf[tolti]).astype(np.float32)
P_cieco /= (np.linalg.norm(P_cieco, axis=1, keepdims=True) + 1e-9)


NB = len(sz)
BASE_OWN = 1.0 / NB
BASE_ADJ = BB.nnz / (NB * (NB - 1) / 2)
print(f"  TASSI BASE: propria bolla {100*BASE_OWN:.3f}% · adiacente {100*BASE_ADJ:.1f}% "
      f"· non collegata {100*(1-BASE_ADJ):.1f}%")


def controllo(P_proiettata, etichetta, colonne):
    """Ripete esattamente il metro del ticket 04."""
    stessa = vicina = lontana = 0
    for k, i in enumerate(tolti):
        v = colonne @ P_proiettata[k]
        v[tolti] = -9                       # non trova se stesso
        v[~is_tv] = -9                      # il medium si rispetta
        top = np.argsort(-v)[:10]
        b_vera = int(mem[i])
        b_trovate = {int(mem[x]) for x in top}
        if b_vera in b_trovate:
            stessa += 1
        elif b_trovate & vicini_di.get(b_vera, set()):
            vicina += 1
        else:
            lontana += 1
    n = len(tolti)
    print(f"\n  {etichetta}")
    print(f"     propria bolla: {stessa:>4}/{n} ({100*stessa/n:.1f}%) · "
          f"adiacente: {vicina:>4}/{n} ({100*vicina/n:.1f}%) · "
          f"non collegata: {lontana:>4}/{n} ({100*lontana/n:.1f}%)")
    print(f"     adiacente: {100*vicina/n:.1f}% contro un tasso base di {100*BASE_ADJ:.1f}% "
          f"-> {100*vicina/n/(100*BASE_ADJ):.2f}x   ** NON DISCRIMINA **")
    print(f"     non collegata: {100*lontana/n:.1f}% contro un tasso base di "
          f"{100*(1-BASE_ADJ):.1f}% -> {1/(max(lontana,1)/n/(1-BASE_ADJ)):.1f}x meglio del caso")
    print(f"     ** propria bolla: {100*stessa/n:.1f}% contro {100*BASE_OWN:.3f}% "
          f"-> {100*stessa/n/(100*BASE_OWN):.0f}x il caso **")
    return stessa


print(f"\n*** IL CONTROLLO SU {len(tolti)} SERIE COL COMPORTAMENTO NASCOSTO ***", flush=True)
a = controllo(Pn_vecchio, "BASELINE — lo studente dei FILM applicato alle serie", Pn_vecchio)
b = controllo(P_cieco, "NUOVO — lo studente delle SERIE (target B_svd)", Pn_vecchio)

print(f"\n\n### la risposta ###")
print(f"  studente dei film (baseline):  {a}/{len(tolti)} nel quartiere giusto")
print(f"  studente delle serie (nuovo):  {b}/{len(tolti)} nel quartiere giusto")
print(f"\nFINE ({time.time()-T0:.0f}s)")
