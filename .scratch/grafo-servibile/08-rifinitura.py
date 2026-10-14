"""08-rifinitura.py — TICKET 08: la risoluzione adattiva, RIORIENTATA dal ticket 05.

Il ticket diceva: split delle chimere, assorbimento delle briciole, multi-appartenenza per i
film-portale. Ma il ticket 05 ha misurato che **lo split delle chimere non copre la popolazione
malata**: le bolle che l'occhio giudica cattive hanno **15-35 titoli** e purezza **normale**
(0,176 contro 0,168 di mediana), mentre la caccia alle chimere guarda le bolle con più di 35 titoli.
Cioè: il rimedio più importante del ticket riparava una popolazione che non è quella rotta.

Quindi la rifinitura ha QUATTRO passi, non tre:

  A. SPLIT DELLE CHIMERE (>35 titoli, taglio spettrale a 2 vie sul sottografo indotto, si divide se
     la densità fra le due metà è sotto un quarto di quella interna) — come da ticket.
  B. DISSOLUZIONE DELLE PATTUMIERE (≤35 titoli, purezza media nel decile più basso: ogni membro va
     alla bolla vicina con cui ha il peso maggiore) — **il passo nuovo**, quello che copre la
     popolazione che il ticket 05 ha identificato come quella davvero rotta.
  C. ASSORBIMENTO DELLE BRICIOLE (1-3 titoli, non franchise chiusi).
  D. MULTI-APPARTENENZA DEI FILM-PORTALE (purezza primaria alta E legame secondario netto con
     almeno 3 nodi accoglienti): restano primari, diventano ospiti.

Partizione di partenza: `bolle2-E` — la stessa su cui è stata fatta la lettura delle 100 bolle nel
report 74. Così il confronto prima/dopo è sulle STESSE bolle, che è l'unico modo per dire se la
rifinitura migliora qualcosa.

Uso:  python .scratch/grafo-servibile/08-rifinitura.py
"""
import pathlib, sys, time
import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
mem = np.load(K.ML / "bolle2-E.npy")
nb = int(mem.max()) + 1
sz = np.bincount(mem, minlength=nb)
print(f"partenza: {nb:,} bolle · {int((sz>=15).sum()):,} con ≥15 titoli · mediana {int(np.median(sz))}")

CMP = K.Componenti(n)
C = CMP(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    C[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
M = K.costruisci(C, {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 1},
                 wc=0.0, beta=0.25)
print(f"grafo pronto: {M.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)

P = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), mem)), shape=(n, nb)).tocsr()
dentro = np.asarray(M.multiply(P[:, mem]).sum(1)).ravel()
tutto = np.asarray(M.sum(1)).ravel()
purezza = dentro / np.maximum(tutto, 1e-9)
# il vicino MIGLIORE di un titolo: la bolla verso cui ha piu' peso (esclusa la propria)
Q = M @ P                                     # titolo x bolla: quanto peso va in ogni bolla
W = (P.T @ M @ P).tocsr()
W.setdiag(0)
W.eliminate_zeros()


def bolla_migliore(i, escludi=None):
    riga = Q.getrow(i)
    if riga.nnz == 0:
        return -1
    d = np.asarray(riga.toarray()).ravel()
    if escludi is not None:
        d[escludi] = -1
    j = int(np.argmax(d))
    return j if d[j] > 0 else -1


# ------------------------------------------------------------------ A. split delle chimere
print("")
print("A. SPLIT DELLE CHIMERE (>35 titoli)")
print("", flush=True)
nuova = mem.copy()
prossima = nb
divise = []
grandi = np.where(sz > 35)[0]
for b in grandi:
    m = np.where(mem == b)[0]
    sub = M[m][:, m].toarray()
    sub = (sub + sub.T) * 0.5
    d = sub.sum(1)
    if (d <= 0).any():
        continue
    Dm = 1.0 / np.sqrt(d)
    L = np.eye(len(m)) - (sub * Dm[:, None]) * Dm[None, :]
    ev, evec = np.linalg.eigh(L)
    if len(ev) < 2:
        continue
    v = evec[:, 1]                                  # il vettore di Fiedler
    m1, m2 = m[v > 0], m[v <= 0]
    if len(m1) < 4 or len(m2) < 4:
        continue
    def densita(righe):
        s = sub[np.isin(m, righe)][:, np.isin(m, righe)].sum()
        k = len(righe)
        return 2 * s / (k * (k - 1)) if k > 1 else 0.0
    d1, d2 = densita(m1), densita(m2)
    # la densita' FRA le due meta'
    i1 = np.isin(m, m1)
    fra = sub[np.ix_(i1, ~i1)].sum()
    d_fra = fra / (len(m1) * len(m2))
    if d_fra < 0.25 * min(d1, d2):
        nuova[m1] = prossima
        divise.append((int(b), len(m), int(prossima), len(m1), len(m2), d_fra, d1, d2))
        prossima += 1
print(f"  bolle con >35 titoli: {len(grandi):,} · DIVISE: {len(divise)}")
for b, msz, nb_, a1, a2, df, d1, d2 in divise[:14]:
    print(f"    [{b}] {msz} titoli -> {a1}+{a2} · densita' fra {df:.4f} contro interna {d1:.4f}/{d2:.4f}")

# ------------------------------------------------------------------ B. dissoluzione pattumiere
print("")
print("B. DISSOLUZIONE DELLE PATTUMIERE (≤35 titoli, purezza media nel decile piu' basso)")
print("", flush=True)
pur_bolla = np.bincount(mem, weights=purezza, minlength=nb) / np.maximum(sz, 1)
piccole = np.where((sz > 3) & (sz <= 35))[0]
soglia = float(np.quantile(pur_bolla[piccole], 0.10))
pat = [b for b in piccole if pur_bolla[b] <= soglia]
print(f"  bolle piccole (>3 e ≤35 titoli): {len(piccole):,} · soglia purezza (decile) {soglia:.4f}")
print(f"  candidate pattumiere: {len(pat)}")
spostati = 0
for b in pat:
    m = np.where(nuova == b)[0]
    for i in m:
        j = bolla_migliore(i, escludi=b)
        if j >= 0:
            nuova[i] = j
            spostati += 1
print(f"  titoli spostati: {spostati:,}")

# ------------------------------------------------------------------ C. assorbimento briciole
print("")
print("C. ASSORBIMENTO DELLE BRICIOLE (1-3 titoli, non franchise chiusi)")
print("", flush=True)
COLL = C["COLL"]
sz2 = np.bincount(nuova, minlength=int(nuova.max()) + 1)
assorbite, spostati2 = 0, 0
for b in np.where((sz2 >= 1) & (sz2 <= 3))[0]:
    m = np.where(nuova == b)[0]
    if len(m) <= 1:
        continue
    # franchise chiuso? (tutti i membri nella stessa collezione, e la collezione e' solo li')
    sub = COLL[m][:, m]
    if sub.nnz >= len(m) * (len(m) - 1) * 0.8:
        continue
    for i in m:
        j = bolla_migliore(i, escludi=b)
        if j >= 0 and j != b:
            nuova[i] = j
            spostati2 += 1
    assorbite += 1
print(f"  briciole assorbite: {assorbite} · titoli spostati: {spostati2:,}")

# ------------------------------------------------------------------ D. film-portale
print("")
print("D. FILM-PORTALE (purezza primaria alta + legame secondario con ≥3 nodi accoglienti)")
print("", flush=True)
sz3 = np.bincount(nuova, minlength=int(nuova.max()) + 1)
# la matrice titolo x bolla va RICOSTRUITA sulla partizione finale: dopo le mosse ci sono bolle
# con id nuovi, e indicizzare la vecchia Q con quelli va fuori dai limiti (bug del primo giro).
P3 = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), nuova)),
                   shape=(n, int(nuova.max()) + 1)).tocsr()
Q3 = M @ P3
OSPITI = {}                                     # titolo -> lista di bolle in cui e' ospite
for i in range(n):
    if sz3[nuova[i]] < 8:
        continue
    pi = purezza[i]
    if pi < 0.35:
        continue
    riga = Q3.getrow(i)
    if riga.nnz == 0:
        continue
    d = np.asarray(riga.toarray()).ravel()
    d[nuova[i]] = -1
    riga_M = np.asarray(M.getrow(i).todense()).ravel()
    for j in np.argsort(-d)[:4]:
        if d[j] <= 0:
            break
        membri_j = np.where(nuova == j)[0]
        accoglienti = int((riga_M[membri_j] > 0).sum())
        if accoglienti >= 3 and d[j] / max(tutto[i], 1e-9) >= 0.15:
            OSPITI.setdefault(i, []).append(int(j))
            break
print(f"  film-portale trovati: {len(OSPITI):,}")

# ------------------------------------------------------------------ il risultato
szF = np.bincount(nuova, minlength=int(nuova.max()) + 1)
print("")
print("=" * 100)
print("PRIMA E DOPO")
print("=" * 100)
print(f"  {'':<28} {'bolle':>8} {'≥15 titoli':>12} {'1-3 titoli':>12} {'mediana':>9} {'titoli isolati':>15}")
for et, memx, szx, nbx in (("PRIMA (bolle2-E)", mem, sz, nb), ("DOPO (rifinita)", nuova, szF, int(nuova.max()) + 1)):
    bric = int(((szx >= 1) & (szx <= 3)).sum())
    print(f"  {et:<28} {nbx:>8,} {int((szx>=15).sum()):>12,} {bric:>12,} {int(np.median(szx)):>9} "
          f"{0:>15}")
# quante bolle sono cambiate, e come
cambiati = int((nuova != mem).sum())
print(f"  titoli che hanno cambiato bolla: {cambiati:,} ({100*cambiati/n:.1f}%)")
np.save(K.ML / "bolle-08-rifinita.npy", nuova)
import json
json.dump({str(k): v for k, v in OSPITI.items()}, open(K.ML / "portali.json", "w"))

# ------------------------------------------------------------------ da leggere
print("")
print("=" * 100)
print("LE BOLLE DA LEGGERE (i titoli, per il giudizio a occhio)")
print("=" * 100)
import pandas as pd
TIT, VOT = {}, np.zeros(n, np.float32)
for f, col in (("movies.parquet", "title"), ("tv.parquet", "name")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col, "vote_count"])
    typ = "movie" if f.startswith("m") else "tv"
    for i, t, vc in zip(dd["id"], dd[col], dd["vote_count"]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)
            VOT[r] = float(vc or 0)


def mostra(b, memx, quante=12, titolo=""):
    m = np.where(memx == b)[0]
    o = m[np.argsort(-VOT[m])]
    print(f"  [{b}] {len(m)} titoli · voti med {int(np.median(VOT[m]))}   {titolo}")
    print("      " + " · ".join(TIT.get(r, "?")[:26] for r in o[:quante]))


print("")
print("--- A) le bolle DIVISE (la chimera prima, le due meta' dopo) ---")
for b, msz, nuovo_id, a1, a2, df, d1, d2 in divise[:8]:
    mostra(b, nuova, 10, "DOPO — meta' rimasta (era la chimera)")
    mostra(nuovo_id, nuova, 8, "DOPO — meta' staccata")
print("")
print("--- B) le prime 6 PATTUMIERE dissolte (i titoli, e dove sono finiti) ---")
for b in pat[:6]:
    m = np.where(mem == b)[0]
    print(f"  [{b}] purezza media {pur_bolla[b]:.3f} · {len(m)} titoli")
    print("      " + " · ".join(TIT.get(r, "?")[:26] for r in m[np.argsort(-VOT[m])][:10]))
    dest = np.bincount(nuova[m], minlength=len(szF))
    for j in np.argsort(-dest)[:3]:
        if dest[j] and j != b:
            print(f"        -> [{j}] {int(dest[j])} titoli finiscono qui")
print("")
print("--- D) i primi 5 FILM-PORTALE (e dove sono ospiti) ---")
for i, bolle in list(OSPITI.items())[:5]:
    print(f"  {TIT.get(i,'?')} (primario in [{nuova[i]}], ospite in {bolle})")
print(f"\nFINE ({time.time()-t0:.0f}s)")
