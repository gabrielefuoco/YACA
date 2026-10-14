"""03-cross.py — TICKET 03: le 94 serie cross-medium, e cosa succede togliendo il vincolo.

Il ticket 05 di `todo-grafo` ha misurato il tetto: 506 serie su 600 hanno la bolla vera fra le 336
bolle-serie, e **94 su 94 di quelle escluse stanno in bolle a MAGGIORANZA FILM**. Con il vincolo di
medium — che rispetta i due cataloghi del prodotto — quelle 94 valgono 0% per costruzione.

Qui si toglie il vincolo e si misura. Tre configurazioni, sulle stesse 600 serie, con lo stesso
leave-one-out esatto del ticket 06c:

  A. **solo bolle-serie** (com'e' adesso)                     tetto 84,3%
  B. **tutte le bolle** (serie + film)                        tetto da misurare
  C. **la via di mezzo**: il film solo se batte il migliore candidato-serie di un margine

E poiche' la macchina del ticket 06/06c non aveva i centroidi delle bolle-film, si costruiscono qui:
1.189 righe da 122.314 colonne, tenute **sparse** (dense sarebbero 580 MB).

Poi le 94 si leggono: chi sono, in che bolle stanno, e se hanno un segnale comune.
"""
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
print("=" * 104)
print("TICKET 03 — LE 94 CROSS-MEDIUM: SI TOGLIE IL VINCOLO E SI MISURA")
print("=" * 104, flush=True)

TFIDF = sp.load_npz(ML / "04-tfidf.npz").tocsr()
C4 = np.load(ML / "04-centroidi.npz")
bolle_serie, bolle_film, sz = C4["bolle_serie"], C4["bolle_film"], C4["sz"]
N = TFIDF.shape[0]
mem = np.load(ML / "bolle-nitrile-V8.npy")
NB = len(sz)
IS_TV = B.IS_TV
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
q_tv = np.zeros(NB)
np.add.at(q_tv, mem, IS_TV.astype(float))
quota_tv = q_tv / np.maximum(sz, 1)

# ---------------------------------------------------------------- i centroidi di TUTTE le bolle (sparsi)
TUTTE = np.concatenate([bolle_serie, bolle_film])
r_, c_, v_ = [], [], []
for k, b in enumerate(TUTTE):
    s = np.asarray(TFIDF[MEMBRI[b]].sum(0)).ravel()
    nz = np.nonzero(s)[0]
    r_.extend([k] * len(nz))
    c_.extend(nz.tolist())
    v_.extend(s[nz].tolist())
SUM = sp.csr_matrix((v_, (r_, c_)), shape=(len(TUTTE), TFIDF.shape[1]), dtype=np.float32)
NORMA = np.sqrt(np.asarray(SUM.multiply(SUM).sum(1)).ravel())
pos_tutte = {b: k for k, b in enumerate(TUTTE)}
pos_serie = {b: k for k, b in enumerate(bolle_serie)}
print(f"  centroidi: {SUM.shape} · {SUM.nnz:,} valori · norme da {NORMA.min():.2f} a {NORMA.max():.2f} "
      f"({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- il banco
Bcsr = K.carica_csr("boot-B.npz", N)
serie = np.where(IS_TV & (np.asarray((Bcsr > 0).sum(1)).ravel() > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
vere = np.array([int(mem[i]) for i in tolti])
print(f"  banco: 600 serie (seed 13) · bolla vera fra le {len(TUTTE):,} candidate: "
      f"{int(np.isin(vere, TUTTE).sum())}/600", flush=True)

# ---------------------------------------------------------------- i punteggi, col LOO esatto
V = np.asarray((TFIDF[tolti] @ SUM.T).todense())        # (600, 1525) = somma·v_i
COS = V / (NORMA[None, :] + 1e-9)
for k, i in enumerate(tolti):
    b = vere[k]
    if b not in pos_tutte:
        continue
    kk = pos_tutte[b]
    # ||somma - v_i||^2 = ||somma||^2 - 2 somma·v_i + 1
    nl = np.sqrt(max(float(NORMA[kk] ** 2 - 2 * V[k, kk] + 1.0), 1e-12))
    COS[k, kk] = (V[k, kk] - 1.0) / max(nl, 1e-9)
print(f"  punteggi calcolati: {COS.shape} ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- la mappa, per l'adiacenza
S1 = sp.csr_matrix((np.ones(N, np.float32), (np.arange(N), mem)), shape=(N, NB))
q = np.load(ML / "bolle-nitrile-V8-triangolo.npz")
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
Ws = (Ws + Ws.T).tocsr()
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
vicini_di = {b: set(BB.getrow(b).indices.tolist()) for b in range(NB)}

# ---------------------------------------------------------------- le tre configurazioni
col_s = [pos_tutte[b] for b in bolle_serie]
# DUE "dentro" DIVERSI, e la distinzione e' tutto il ticket:
#   dentro_serie  le bolle che stanno fra le 336 candidate di A  -> 506
#   dentro_tutte  le bolle che stanno fra le 1.525 di B          -> 600 su 600
# Le 94 che A non puo' prendere sono escluse da `bolle_serie` PER DEFINIZIONE (maggioranza film),
# non "a causa del medium": la differenza si vede solo misurando B.
dentro_serie = np.isin(vere, bolle_serie)
dentro_tutte = np.isin(vere, TUTTE)
escluse = ~dentro_serie
print(f"  copertura: A {int(dentro_serie.sum())}/600 · B {int(dentro_tutte.sum())}/600")


def valuta(S, etichetta, colonne=None):
    """S: (600, n candidate). Se `colonne` e' dato, si sceglie solo fra quelle."""
    if colonne is not None:
        S = S[:, colonne]
        cand = TUTTE[colonne]
    else:
        cand = TUTTE
    a = np.array([int(cand[int(np.argmax(S[k]))]) for k in range(600)])
    ok = a == vere
    adj = np.array([a[k] in vicini_di.get(vere[k], set()) for k in range(600)])
    print(f"  {etichetta:<44} propria {int(ok.sum()):>3}/600 ({100*ok.mean():5.1f}%) · "
          f"scollegate {int((~ok & ~adj).sum()):>3}")
    return ok, a


print("\n" + "=" * 104)
print("LE TRE CONFIGURAZIONI")
print("=" * 104)
ok_a, a_a = valuta(COS, "A. solo bolle-serie (com'e' adesso)", col_s)
ok_b, a_b = valuta(COS, "B. tutte le bolle (vincolo tolto)")
ok_c, a_c = valuta(COS, "C. film solo se batte il migliore serie")

# C: il margine — se il migliore in assoluto e' un film, lo si prende solo se batte il migliore
# candidato-serie di un margine relativo
print(f"\n  la configurazione C, al variare del margine:")
migliori_serie = COS[:, col_s].max(1)
for margine in (0.0, 0.05, 0.1, 0.25, 0.5, 1.0):
    a = []
    for k in range(600):
        j = int(np.argmax(COS[k]))
        b = int(TUTTE[j])
        if b in pos_serie:
            a.append(b)
        else:
            # e' un film: lo prendo solo se batte il migliore serie di margine
            ms = migliori_serie[k]
            a.append(b if COS[k, j] > ms * (1 + margine) else int(bolle_serie[int(np.argmax(COS[k, col_s]))]))
    a = np.array(a)
    print(f"    margine {margine:>5.2f}: {int((a == vere).sum()):>3}/600 "
          f"({100*(a == vere).mean():5.1f}%)")

# ---------------------------------------------------------------- le 94, separate
print("\n" + "=" * 104)
print("LE 94, SEPARATE DALLE 506")
print("=" * 104)
for nome, sel in (("le 506 con bolla-serie", ~escluse), ("le 94 cross-medium", escluse)):
    print(f"  {nome}:")
    for etichetta, ok in (("solo bolle-serie", ok_a), ("tutte le bolle", ok_b)):
        print(f"     {etichetta:<20} {int(ok[sel].sum()):>3}/{int(sel.sum()):>3} "
              f"({100*ok[sel].mean():5.1f}%)")
print(f"\n  e il caso per la configurazione B: 1/{len(TUTTE)} = {100/len(TUTTE):.3f}%")
K.stampa_tasso("B. tutte le bolle", a_b, vere)
K.stampa_tasso("A. solo bolle-serie", a_a, vere)

# ---------------------------------------------------------------- chi sono le 94
print("\n" + "=" * 104)
print("CHI SONO LE 94 — e hanno un segnale comune?")
print("=" * 104)
TIT = np.array([""] * N, dtype=object)
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    for i, t in zip(d["id"], d[col]):
        r = B.ROW_OF.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)

bolle_94 = {}
for k in np.where(escluse)[0]:
    bolle_94.setdefault(vere[k], []).append(tolti[k])
print(f"  le 94 stanno in {len(bolle_94)} bolle diverse (una bolla puo' contenerne piu' d'una)")
dim = np.array([sz[b] for b in bolle_94])
print(f"  dimensione: da {dim.min()} a {dim.max()} · mediana {int(np.median(dim))}")
print(f"  quota di serie in quelle bolle: mediana {np.median([quota_tv[b] for b in bolle_94]):.2f}")
print(f"\n  le dieci bolle piu' grosse che contengono serie cross-medium:")
for b in sorted(bolle_94, key=lambda z: -sz[z])[:10]:
    membri = np.where(mem == b)[0][:4]
    print(f"     bolla {b:>4} · {int(sz[b]):>3} titoli · {100*quota_tv[b]:>3.0f}% serie · "
          f"{[TIT[x][:22] for x in membri]}")
    print(f"        le serie dentro: "
          f"{[TIT[i][:26] for i in bolle_94[b][:4]]}")

# e i token piu' frequenti nei centroidi di quelle bolle, contro il resto
vocab = {v: kk for kk, v in __import__("json").load(open(ML / "04-vocab.json", encoding="utf-8")).items()}
print(f"\n  i termini che dominano i centroidi delle bolle cross-medium, contro le bolle-serie:")
somma_cm = np.asarray(SUM[[pos_tutte[b] for b in bolle_94]].sum(0)).ravel()
somma_s = np.asarray(SUM[[pos_serie[b] for b in bolle_serie]].sum(0)).ravel()
rapp = somma_cm / (somma_cm.sum() + 1e-9) \
    - somma_s / (somma_s.sum() + 1e-9)
top = np.argsort(-rapp)[:18]
print("   " + " · ".join(vocab.get(int(j), "?") for j in top))
print("\n  (un termine che qui e' in testa descrive le bolle cross-medium e non le bolle-serie)")
np.savez_compressed(ML / "03-cross.npz", ok_a=ok_a, ok_b=ok_b, a_a=a_a, a_b=a_b,
                    vere=vere, tolti=tolti, bolle_94=np.array(sorted(bolle_94)))
print(f"\nFINE ({time.time()-T0:.0f}s)")
