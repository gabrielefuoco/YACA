"""06-ponte.py — TICKET 06: il ponte film->serie, e la fusione dei due voti.

§1.B.2 e §1.B.3 dell'esperto:

    S_ponte(s, b_serie) = somma su b_film di P(b_film | s) * BB~(b_film, b_serie)
    S(s, b) = S_diretto(s, b) + lambda * S_ponte(s, b)      -> argmax sulle bolle-serie

`BB~` e' riga-normalizzata, dice l'esperto: «perche' una bolla-film con 40 archi non deve valere
quanto una con 3». Giusto — ed e' la differenza fra contare i vicini e misurarne il peso.

DEVIATO DALLA RICETTA, e va detto: l'esperto prende `P(b_film | s)` dallo **studente dei film** (la
Ridge `FX -> Cf`, quella che fa il 27,7%). Qui si usa il voto diretto della serie contro i centroidi
delle bolle-FILM. La ragione e' che cosi' il ponte resta **autosufficiente**: nessuna dipendenza da un
modello addestrato su un'altra partizione, e le due strade (diretto, ponte) parlano la stessa lingua,
cio' che rende leggibile il loro accordo. Il prezzo: non e' la ricetta esatta, e se il numero non
conferma l'esperto non si puo' incolpare la deviazione senza misurarla — quindi la misura c'e'.

Le somme per bolla si tengono SPARSE: la somma di vettori sparsi e' sparsa (l'unione dei token dei
membri), e 1.189 bolle-film dense sarebbero 580 MB con un matmul da 87 GFLOP.

`lambda` si tara su meta' del banco e si verifica sull'altra meta'. Se il migliore fosse 0 o infinito,
la risposta sarebbe che una delle due strade e' inutile, e va scritto.
"""
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
print("=" * 104)
print("TICKET 06 — IL PONTE FILM->SERIE, E LA FUSIONE DEI DUE VOTI")
print("=" * 104, flush=True)

TFIDF = sp.load_npz(ML / "04-tfidf.npz").tocsr()
C4 = np.load(ML / "04-centroidi.npz")
bolle_serie, bolle_film, sz = C4["bolle_serie"], C4["bolle_film"], C4["sz"]
N = TFIDF.shape[0]
mem = np.load(ML / "bolle-nitrile-V8.npy")
IS_TV = B.IS_TV
q = np.load(ML / "bolle-nitrile-V8-triangolo.npz")
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
Ws = (Ws + Ws.T).tocsr()
NB = len(sz)
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]

# ---------------------------------------------------------------- le somme sparse
def somme(gruppo):
    """Somma dei vettori (L2-normalizzati) dei membri, per bolla. SPARSA."""
    righe, colonne, valori = [], [], []
    for k, b in enumerate(gruppo):
        sub = TFIDF[MEMBRI[b]]
        s = np.asarray(sub.sum(0)).ravel()
        nz = np.nonzero(s)[0]
        righe.extend([k] * len(nz))
        colonne.extend(nz.tolist())
        valori.extend(s[nz].tolist())
    return sp.csr_matrix((valori, (righe, colonne)), shape=(len(gruppo), TFIDF.shape[1]),
                         dtype=np.float32)


SS = somme(bolle_serie)
SF = somme(bolle_film)
print(f"  somme sparse: bolle-serie {SS.shape} ({SS.nnz:,} valori) · "
      f"bolle-film {SF.shape} ({SF.nnz:,} valori) ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- il banco
Bcsr = K.carica_csr("boot-B.npz", N)
serie = np.where(IS_TV & (np.asarray((Bcsr > 0).sum(1)).ravel() > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
print(f"  banco: {len(tolti)} serie (seed 13, come il ticket 05)", flush=True)

# ---------------------------------------------------------------- i due voti grezzi
# diretto: coseno normalizzato contro i centroidi delle bolle-serie
S_dir = np.asarray((TFIDF[tolti] @ SS.T).todense())
n = np.asarray(SS.multiply(SS).sum(1)).ravel()
S_dir = S_dir / (np.sqrt(n)[None, :] + 1e-9)

# ponte, passo 1: il voto della stessa serie sulle bolle-FILM
S_film = np.asarray((TFIDF[tolti] @ SF.T).todense())
nf = np.asarray(SF.multiply(SF).sum(1)).ravel()
S_film = S_film / (np.sqrt(nf)[None, :] + 1e-9)

# ponte, passo 2: BB_film->serie riga-normalizzata
S1 = sp.csr_matrix((np.ones(N, np.float32), (np.arange(N), mem)), shape=(N, NB))
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
gradi_BB = np.asarray(abs(BB).sum(1)).ravel()
BBn = BB.multiply(1.0 / (gradi_BB + 1e-9)[:, None]).tocsr()   # riga-normalizzata, come chiede §1.B.2
BF = BBn[bolle_film][:, bolle_serie].toarray()      # (n film, n serie)
print(f"  BB: {BB.nnz:,} adiacenze · la fetta film->serie {BF.shape} · "
      f"righe non vuote {int((BF.sum(1) > 0).sum()):,}/{len(bolle_film):,} ({time.time()-T0:.0f}s)",
      flush=True)

S_ponte = S_film @ BF                                # (600, n bolle-serie)
print(f"  ponte costruito: {S_ponte.shape} · media {S_ponte.mean():.5f} · "
      f"non-zero {int((S_ponte > 0).sum()):,} ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- leave-one-out sul diretto
pos = {b: k for k, b in enumerate(bolle_serie)}
S_dir_loo = S_dir.copy()
for k, i in enumerate(tolti):
    b_vera = int(mem[i])
    if b_vera in pos:
        kk = pos[b_vera]
        nb = len(MEMBRI[b_vera])
        S_dir_loo[k, kk] = (S_dir[k, kk] * nb - 1.0) / max(nb - 1, 1)

# ---------------------------------------------------------------- la misura
vicini_di = {b: set(BB.getrow(b).indices.tolist()) for b in range(NB)}


def valuta(S, etichetta=""):
    stessa = vicina = lontana = 0
    for k, i in enumerate(tolti):
        b_vera = int(mem[i])
        b_tro = int(bolle_serie[int(np.argmax(S[k]))])
        if b_tro == b_vera:
            stessa += 1
        elif b_tro in vicini_di.get(b_vera, set()):
            vicina += 1
        else:
            lontana += 1
    if etichetta:
        print(f"    {etichetta:<34} propria {stessa:>3}/600 ({100*stessa/600:5.1f}%) · "
              f"adiacente {vicina:>3} · scollegata {lontana:>3}")
    return stessa, vicina, lontana


print("\n" + "=" * 104)
print("I DUE VOTI, SEPARATI")
print("=" * 104)
valuta(S_dir_loo, "solo diretto")
valuta(S_ponte, "solo ponte")
valuta(S_dir_loo + S_ponte, "somma grezza (lambda=1)")

# ---------------------------------------------------------------- lambda, tarato e verificato
meta = 300
tar = np.arange(0, 600, 2)          # meta' del banco per tarare
ver = np.arange(1, 600, 2)          # l'altra meta' per verificare
print("\n" + "=" * 104)
print("LA TARATURA DI lambda — su meta' del banco, verificata sull'altra meta'")
print("=" * 104)
ris = []
for lam in (0.0, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 1e9):
    S = S_dir_loo + lam * S_ponte
    def col(sel):
        c = 0
        for k in sel:
            i = tolti[k]
            if int(bolle_serie[int(np.argmax(S[k]))]) == int(mem[i]):
                c += 1
        return c
    a, b = col(tar), col(ver)
    ris.append((lam, a / len(tar), b / len(ver)))
    print(f"  lambda {lam:<8.2g} taratura {100*a/len(tar):5.1f}% · verifica {100*b/len(ver):5.1f}%",
          flush=True)
migliore = max(ris, key=lambda z: z[2])
print(f"\n  -> lambda migliore sulla verifica: {migliore[0]:g} ({100*migliore[2]:.1f}%)")
if migliore[0] == 0:
    print("  IL PONTE NON AGGIUNGE NIENTE: la fusione migliore e' quella che lo spegne.")
elif migliore[0] >= 1e9:
    print("  IL DIRETTO NON AGGIUNGE NIENTE: la fusione migliore e' il solo ponte.")

# ---------------------------------------------------------------- le due popolazioni
print("\n" + "=" * 104)
print("DOVE IL PONTE ESISTE, E DOVE IL MONDO E' SOLO-SERIE (§1.B: 58,7% contro 41,3%)")
print("=" * 104)
ha_ponte = np.zeros(len(tolti), bool)
for k, i in enumerate(tolti):
    b_vera = int(mem[i])
    ha_ponte[k] = any(BF[:, pos[b_vera]] > 0) if b_vera in pos else False
print(f"  serie la cui bolla ha almeno un ponte film: {int(ha_ponte.sum())}/600 "
      f"({100*ha_ponte.mean():.1f}%) · l'esperto diceva 58,7%")
for nome, sel in (("con ponte", ha_ponte), ("solo-serie", ~ha_ponte)):
    if sel.sum() == 0:
        continue
    for etichetta, S in (("diretto", S_dir_loo), ("ponte", S_ponte),
                         ("fusione", S_dir_loo + migliore[0] * S_ponte)):
        c = sum(1 for k in np.where(sel)[0]
                if int(bolle_serie[int(np.argmax(S[k]))]) == int(mem[tolti[k]]))
        print(f"    {nome:<12} {etichetta:<9} {c:>3}/{int(sel.sum()):>3} "
              f"({100*c/int(sel.sum()):5.1f}%)")
    print(flush=True)

# ---------------------------------------------------------------- accordo fra le due strade
print("=" * 104)
print("SU QUANTE SERIE LE DUE STRADE SONO D'ACCORDO")
print("=" * 104)
a_dir = np.array([int(bolle_serie[int(np.argmax(S_dir_loo[k]))]) for k in range(600)])
a_pon = np.array([int(bolle_serie[int(np.argmax(S_ponte[k]))]) for k in range(600)])
a_fus = np.array([int(bolle_serie[int(np.argmax((S_dir_loo + migliore[0] * S_ponte)[k]))])
                  for k in range(600)])
vere = np.array([int(mem[i]) for i in tolti])
print(f"  diretto e ponte scelgono la STESSA bolla: {int((a_dir == a_pon).sum())}/600 "
      f"({100*(a_dir == a_pon).mean():.1f}%)")
print(f"  il diretto ha ragione dove il ponte sbaglia: {int(((a_dir == vere) & (a_pon != vere)).sum())}")
print(f"  il ponte ha ragione dove il diretto sbaglia: {int(((a_pon == vere) & (a_dir != vere)).sum())}")
print(f"  sbagliano tutti e due:                       {int(((a_dir != vere) & (a_pon != vere)).sum())}")
print(f"  e la fusione ne prende {int((a_fus == vere).sum())} (diretto {int((a_dir == vere).sum())}, "
      f"ponte {int((a_pon == vere).sum())})")
np.savez_compressed(ML / "06-ponte.npz", S_dir=S_dir_loo, S_ponte=S_ponte, tolti=tolti,
                    bolle_serie=bolle_serie, lam=np.array([migliore[0]]))
print(f"\nFINE ({time.time()-T0:.0f}s)")
