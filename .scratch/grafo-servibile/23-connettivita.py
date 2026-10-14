"""23-connettivita.py — TICKET 23: una sparsificazione che non frammenti la mappa.

Il ticket 11 ha rivelato che il grafo sparsificato dal ticket 09 ha **117 componenti connesse**, e
che quindi la gerarchia a 25-35 macro-mondi e' impossibile. Il ticket 20 ha aggiunto la terza
conferma (la curatela collega bolle che sono lo stesso mondo diviso in due). La causa e' il k-NN
MUTUO: tiene solo gli archi in cui entrambi gli estremi si scelgono, e taglia proprio i ponti fra i
grappoli.

TRE STRADE, da provare e poi LEGGERE:
  A. albero di copertura sui ponti: dopo il filtro mutuo, aggiungere gli archi piu' forti necessari
     a riconnettere le componenti (costo: ~100 archi su 19.000);
  B. k piu' alto (10 invece di 8);
  C. k-NN NON mutuo (solo «B fra i primi k di A»): selettivo ma ASIMMETRICO.

E il controllo che conta, che stavolta e' una LISTA DI COPPIE VERIFICATE A MANO nella lettura del
ticket 09 — non un tasso su una metrica che si e' gia' mostrata sbagliata.

Uso:  python .scratch/grafo-servibile/23-connettivita.py
"""
import pathlib, sys, time
import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
mem = np.load(K.ML / "bolle2-E.npy")
nb = int(mem.max()) + 1
sz = np.bincount(mem, minlength=nb)

CMP = K.Componenti(n)
C = CMP(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    C[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
M = K.costruisci(C, {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 1},
                 wc=0.0, beta=0.25)
P = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), mem)), shape=(n, nb)).tocsr()
dentro = np.asarray(M.multiply(P[:, mem]).sum(1)).ravel()
purezza = (dentro / np.maximum(np.asarray(M.sum(1)).ravel(), 1e-9)).astype(np.float32)
Md = M.tocoo()
Mcore = sp.csr_matrix((Md.data * (purezza[Md.row] * purezza[Md.col]), (Md.row, Md.col)), shape=(n, n))
G = (P.T @ Mcore @ P).tocsr()
G.setdiag(0)
G.eliminate_zeros()
Ns = (P.T @ (M > 0).astype(np.float32) @ P).tocsr()
Ns.setdiag(0)
Ns.eliminate_zeros()
tiene = ((Ns >= 3.0).astype(np.float32)).multiply((Ns.T.tocsr() >= 3.0).astype(np.float32))
G2 = G.multiply(tiene).tocsr()
G2.eliminate_zeros()
r, c, v = sp.find(G2)
SA = np.asarray(G2.sum(1)).ravel()
tot = v.sum()
pmi = np.maximum(np.log((v * tot) / np.maximum(SA[r] * SA[c], 1e-12)), 0.0)
G3 = sp.csr_matrix((pmi, (r, c)), shape=(nb, nb))
print(f"base: G {G.nnz:,} · testimoni {G2.nnz:,} · PMI+ {G3.nnz:,} ({time.time()-t0:.0f}s)", flush=True)

# le coppie VERIFICATE a mano nella lettura del ticket 09
VERIFICATE = [("Fassbinder -> Nuovo Cinema Tedesco", 210, 1102),
              ("Star Wars TV -> film di Star Wars", 420, 733),
              ("mostri anni '50 -> teenage werewolf", 1092, 3948),
              ("natalizie polacche -> polacche", 1251, 415),
              ("argentine -> argentine", 1167, 4171),
              ("norvegesi -> norvegesi", 761, 2428)]


def knn_mutuo(Gx, k):
    righe, colonne = [], []
    top = {}
    for i in range(nb):
        riga = Gx.getrow(i)
        if riga.nnz == 0:
            continue
        d, idx = riga.data, riga.indices
        top[i] = set(idx[np.argsort(-d)[:k]].tolist())
    for i, sel in top.items():
        for j in sel:
            if i in top.get(j, ()):
                righe.append(i)
                colonne.append(int(j))
    return sp.csr_matrix((np.ones(len(righe), np.float32), (righe, colonne)), shape=(nb, nb))


def knn_diretto(Gx, k):
    righe, colonne = [], []
    for i in range(nb):
        riga = Gx.getrow(i)
        if riga.nnz == 0:
            continue
        d, idx = riga.data, riga.indices
        for j in idx[np.argsort(-d)[:k]]:
            righe.append(i)
            colonne.append(int(j))
    return sp.csr_matrix((np.ones(len(righe), np.float32), (righe, colonne)), shape=(nb, nb))


def componenti(F):
    W = (F + F.T).tocsr()
    from scipy.sparse.csgraph import connected_components
    ncomp, lab = connected_components(W, directed=False)
    return ncomp, lab


def valuta(F, etichetta, simmetrizza=True):
    Fv = ((F + F.T) > 0).astype(np.float32).tocsr() if simmetrizza else (F > 0).astype(np.float32)
    Fv.setdiag(0)
    Fv.eliminate_zeros()
    ncomp, lab = componenti(Fv)
    gradi = np.asarray((Fv > 0).sum(1)).ravel()
    isolate_grandi = int(((gradi == 0) & (sz >= 15)).sum())
    ver = sum(1 for _, a, b in VERIFICATE if Fv[a, b] > 0 or Fv[b, a] > 0)
    print(f"  {etichetta:<34} archi {Fv.nnz:>7,} · mediana grado {int(np.median(gradi)):>3} · "
          f"componenti {ncomp:>4} · bolle ≥15 isolate {isolate_grandi:>3} · "
          f"coppie verificate {ver}/{len(VERIFICATE)}")
    return Fv, ncomp, lab, gradi


print("")
print("=" * 108)
print("LE TRE STRADE")
print("=" * 108)
FM8 = knn_mutuo(G3, 8)
A, nA, labA, gA = valuta(FM8, "A0 mutual k=8 (il ticket 09)")
FM10 = knn_mutuo(G3, 10)
valuta(FM10, "B  mutual k=10")
FD = knn_diretto(G3, 8)
valuta(FD, "C  diretto k=8 (asimmetrico)", simmetrizza=False)

# --- A: albero di copertura sui ponti, scelto per PESO
print("")
print("  --- A: albero di copertura sui ponti (archi scelti dal peso di PMI+) ---")
ncomp, lab = componenti(A)
print(f"    componenti di partenza: {ncomp}")
# per ogni coppia di componenti, l'arco piu' forte che le unisce
r3, c3, v3 = sp.find(G3)
ordine = np.argsort(-v3)
miglior = {}
for i in ordine:
    a, b = int(r3[i]), int(c3[i])
    ca, cb = int(lab[a]), int(lab[b])
    if ca == cb:
        continue
    kk = (min(ca, cb), max(ca, cb))
    if kk not in miglior:
        miglior[kk] = (a, b, float(v3[i]))
print(f"    archi candidati fra componenti diverse: {len(miglior):,}")
# Kruskal sui componenti
padre = {i: i for i in range(ncomp)}


def trova(x):
    while padre[x] != x:
        padre[x] = padre[padre[x]]
        x = padre[x]
    return x


scelti = []
for (ca, cb), (a, b, w) in sorted(miglior.items(), key=lambda kv: -kv[1][2]):
    ra, rb = trova(ca), trova(cb)
    if ra != rb:
        padre[ra] = rb
        scelti.append((a, b, w))
print(f"    archi di ricucitura scelti: {len(scelti)} "
      f"(+{100*len(scelti)/A.nnz:.2f}% sugli archi del grafo A)")
AF = A.copy().tolil()
for a, b, _ in scelti:
    AF[a, b] = 1.0
    AF[b, a] = 1.0
AF = AF.tocsr()
_, nAF, labF, gAF = valuta(AF, "A1 mutual k=8 + albero di copertura")

# --- A2: e se alla ricucitura si aggiungessero anche i vicini deboli per le bolle grandi isolate?
print("")
print("  --- il conflitto col ticket 05: le bolle piccole vanno DIVISE, la mappa va RICONNESSA ---")
piccole = int(((sz >= 1) & (sz <= 3)).sum())
print(f"    bolle da 1-3 titoli: {piccole:,} · bolle ≥15 isolate dopo la ricucitura: "
      f"{int(((gAF==0)&(sz>=15)).sum())}")
print(f"    la ricucitura non tocca le bolle piccole: sono due problemi diversi e due rimedi diversi")

# ------------------------------------------------------------------ la lettura della ricucitura
print("")
print("=" * 108)
print("I PONTI DI RICUCITURA — da leggere: sono veri o sono il legame generico che il filtro aveva tolto?")
print("=" * 108)
TIT = {}
for f, col in (("movies.parquet", "title"), ("tv.parquet", "name")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    typ = "movie" if f.startswith("m") else "tv"
    for i, t_ in zip(dd["id"], dd[col]):
        rr = row_of.get(f"{typ}:{int(i)}")
        if rr is not None:
            TIT[rr] = str(t_)
KWt = [set() for _ in range(n)]
import json
for f, col in (("movies.parquet", "keywords"), ("tv.parquet", "keywords")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    typ = "movie" if f.startswith("m") else "tv"
    for i, kwd in zip(dd["id"], dd[col]):
        rr = row_of.get(f"{typ}:{int(i)}")
        if rr is None:
            continue
        try:
            g = json.loads(kwd) if isinstance(kwd, str) else (kwd or [])
            KWt[rr] = {x.get("name", "").lower() for x in g if isinstance(x, dict)}
        except Exception:
            pass


def nome(b, q=3):
    from collections import Counter
    c = Counter()
    for x in np.where(mem == b)[0][:20]:
        c.update(KWt[x])
    return " · ".join(w for w, _ in c.most_common(q)) or "—"


for a, b, w in sorted(scelti, key=lambda x: -x[2])[:12]:
    ma, mb_ = np.where(mem == a)[0], np.where(mem == b)[0]
    print(f"    [{a}] {sz[a]:>3} titoli · {nome(a,3):<44} <-> [{b}] {sz[b]:>3} · {nome(b,3)}")
    print(f"          es. {TIT.get(ma[0],'?')[:26]} / {TIT.get(mb_[0],'?')[:26]}   (PMI+ {w:.2f})")
np.save(K.ML / "bolle-archi-23.npz", AF)
print(f"\nFINE ({time.time()-t0:.0f}s)")
