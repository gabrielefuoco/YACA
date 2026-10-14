"""09-sparsificazione.py — TICKET 09: dal grafo denso alla mappa.

Il grafo quoziente delle bolle ha una mediana di ~1.100 vicini: e' quasi una clique rumorosa.
Basta un utente generalista che ha visto un film di Fassbinder e un film Marvel per creare un arco
fra i due mondi. Il ticket 05 ha gia' misurato che la sola regola dei testimoni disgiunti porta
961 -> 47 e lascia **177 bolle isolate** — quindi non basta, e serve un ripiego.

I QUATTRO PASSI, nell'ordine in cui servono:
  1. AGGREGAZIONE CORE-TO-CORE: il peso fra due bolle somma gli archi pesati per la purezza interna
     dei due estremi. Un arco da un archetipo puro conta pieno, uno da un intruso viene abbattuto.
  2. TESTIMONI DISGIUNTI: l'arco esiste solo se almeno 3 titoli distinti di A vanno verso B e
     viceversa (ticket 05: 961 -> 47, ma 177 isolate).
  3. PMI+ E FILTRO DI DISPARITA': si normalizza per informazione mutua puntuale positiva, e si tiene
     il k-NN MUTUO — l'arco sopravvive solo se B sta fra i primi k di A e A fra i primi k di B.
     E' questo passo che porta a ~6, non i testimoni.
  4. RIPIEGO PER LE BOLle CHE RESTEREBBERO SOLE: ognuna tiene il suo vicino di peso massimo. Il
     criterio «nessuna bolla resta isolata» e' del ticket e la regola dei testimoni lo viola.

E LA SCELTA DI k SI FA LEGGENDO, non con una metrica: lo script stampa i vicini di 12 bolle per
k = 4, 6, 8 e le liste si giudicano a occhio.

Uso:  python .scratch/grafo-servibile/09-sparsificazione.py
"""
import json, pathlib, sys, time
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
print(f"partizione: {nb:,} bolle · {int((sz>=15).sum()):,} con ≥15 titoli")

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
purezza = (dentro / np.maximum(tutto, 1e-9)).astype(np.float32)

# ------------------------------------------------------------------ 1. core-to-core
Md = M.tocoo()
fatt = (purezza[Md.row] * purezza[Md.col]).astype(np.float32)
Mcore = sp.csr_matrix((Md.data * fatt, (Md.row, Md.col)), shape=(n, n))
G = (P.T @ Mcore @ P).tocsr()
G.setdiag(0)
G.eliminate_zeros()
gradi0 = np.asarray((G > 0).sum(1)).ravel()
print(f"")
print(f"1. CORE-TO-CORE: {G.nnz:,} collegamenti · mediana vicini {int(np.median(gradi0)):,} "
      f"· isolate {int((gradi0==0).sum()):,}")

# ------------------------------------------------------------------ 2. testimoni disgiunti
Q = (M > 0).astype(np.float32) @ P
Qs = (Q > 0).astype(np.float32)
Ns = (P.T @ Qs).tocsr()
Ns.setdiag(0)
Ns.eliminate_zeros()
tiene = ((Ns >= 3.0).astype(np.float32)).multiply((Ns.T.tocsr() >= 3.0).astype(np.float32))
G2 = G.multiply(tiene).tocsr()
G2.eliminate_zeros()
gradi2 = np.asarray((G2 > 0).sum(1)).ravel()
print(f"2. TESTIMONI DISGIUNTI (≥3 per lato): {G2.nnz:,} · mediana {int(np.median(gradi2)):,} · "
      f"isolate {int((gradi2==0).sum()):,}   (il ticket 05 aveva trovato 47 e 177)")

# ------------------------------------------------------------------ 3. PMI+ e k-NN mutuo
r, c, v = sp.find(G2)
SA = np.asarray(G2.sum(1)).ravel()
tot = v.sum()
with np.errstate(divide="ignore", invalid="ignore"):
    pmi = np.log((v * tot) / np.maximum(SA[r] * SA[c], 1e-12))
pmi = np.maximum(pmi, 0.0)
G3 = sp.csr_matrix((pmi, (r, c)), shape=(nb, nb))
print(f"3. PMI+: {G3.nnz:,} collegamenti con PMI positiva "
      f"({100*G3.nnz/max(G2.nnz,1):.0f}% dei sopravvissuti ai testimoni)")


def knn_mutuo(Gx, k):
    """L'arco sopravvive se B sta fra i primi k di A E A fra i primi k di B."""
    Gx = Gx.tocsr()
    righe, colonne = [], []
    for i in range(nb):
        riga = Gx.getrow(i)
        if riga.nnz == 0:
            continue
        d, idx = riga.data, riga.indices
        sel = idx[np.argsort(-d)[:k]]
        for j in sel:
            riga_j = Gx.getrow(int(j))
            dj, idxj = riga_j.data, riga_j.indices
            selj = idxj[np.argsort(-dj)[:k]]
            if i in selj:
                righe.append(i)
                colonne.append(int(j))
    R = sp.csr_matrix((np.ones(len(righe), np.float32), (righe, colonne)), shape=(nb, nb))
    return R


print("")
print("   --- la scelta di k (l'effetto sui vicini) ---")
KK = (4, 5, 6, 8, 10)
FK = {}
for k in KK:
    F = knn_mutuo(G3, k)
    g = np.asarray((F > 0).sum(1)).ravel()
    FK[k] = F
    print(f"   k={k:<3} collegamenti {F.nnz:>8,} · mediana vicini {int(np.median(g)):>4} · "
          f"isolate {int((g==0).sum()):>4,}")

# ------------------------------------------------------------------ 4. il ripiego
K_SCELTO = 6
F = FK[K_SCELTO]
gradi = np.asarray((F > 0).sum(1)).ravel()
sole = np.where(gradi == 0)[0]
print("")
print(f"4. RIPIEGO: {len(sole):,} bolle sarebbero rimaste isolate con k={K_SCELTO} "
      f"(su {nb:,}, {100*len(sole)/nb:.1f}%)")
G_rip = G3.tolil()
r_, c_ = [], []
for b in sole:
    riga = G3.getrow(b)
    if riga.nnz == 0:
        continue
    j = int(riga.indices[np.argmax(riga.data)])
    r_ += [b, j]
    c_ += [j, b]
Ffin = (F + sp.csr_matrix((np.ones(len(r_), np.float32), (r_, c_)), shape=(nb, nb))).tocsr()
Ffin.data[:] = 1.0
gradiF = np.asarray((Ffin > 0).sum(1)).ravel()
print(f"   dopo il ripiego: mediana vicini {int(np.median(gradiF))} · "
      f"isolate {int((gradiF==0).sum())} · grado massimo {int(gradiF.max())}")

# ------------------------------------------------------------------ la conservazione
print("")
print("=" * 100)
print("I VICINI FORTI DELLA LETTURA SONO CONSERVATI? (report 74)")
print("=" * 100)
ids = [i for i in range(nb) if 15 <= sz[i] <= 60]
scelte = [ids[i] for i in np.random.default_rng(11).choice(len(ids), size=100, replace=False)]
visti = scelte[:30]
prima, dopo, persi = 0, 0, []
for b in visti:
    riga = G.getrow(b)
    if riga.nnz == 0:
        continue
    top = riga.indices[np.argsort(-riga.data)][:4]
    for j in top:
        prima += 1
        if Ffin[b, j] > 0 or Ffin[j, b] > 0:
            dopo += 1
        else:
            persi.append((int(b), int(j)))
print(f"  dei {prima} vicini forti (i primi 4 di ognuna delle 30 bolle lette), "
      f"ne sopravvivono {dopo} ({100*dopo/max(prima,1):.1f}%)")
print(f"  persi: {len(persi)}")
# LA DOMANDA CHE CONTA: i perduti erano rumore (hub) o erano veri?
# Se il grado del bersaglio nel grafo DENSO e' alto, il perduto era un hub, e PMI+ l'ha tolto
# apposta. Se il grado e' basso, PMI+ ha tolto una relazione specifica.
if persi:
    gr_del = np.array([gradi0[vers] for _, vers in persi])
    gr_ten = np.array([gradi0[vers] for b in visti for vers in
                       G.getrow(b).indices[np.argsort(-G.getrow(b).data)][:4]
                       if Ffin[b, vers] > 0 or Ffin[vers, b] > 0])
    print(f"  grado (nel grafo denso) dei BERSAGLI perduti: mediana {int(np.median(gr_del)):,} "
          f"· dei conservati: mediana {int(np.median(gr_ten)):,}" if len(gr_ten) else "")
    print(f"  >>> se i perduti hanno grado MOLTO piu' alto, erano hub e PMI+ ha fatto il suo lavoro;")
    print(f"      se hanno grado simile o minore, la sparsificazione ha tolto relazioni specifiche")

print("")
print("  --- le bolle di nicchia conservano vicini? (le 10 piu' piccole del campione) ---")
for b in sorted(visti, key=lambda x: sz[x])[:10]:
    print(f"    [{b}] {sz[b]:>3} titoli · vicini prima {int(gradi0[b]):>5,} · "
          f"dopo {int(gradiF[b]):>3}")

# ------------------------------------------------------------------ i vicini da leggere
print("")
print("=" * 100)
print("I VICINI DA LEGGERE (k = 4, 6, 8 sulle stesse 12 bolle)")
print("=" * 100)
TIT, VOT = {}, np.zeros(n, np.float32)
for f, col in (("movies.parquet", "title"), ("tv.parquet", "name")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col, "vote_count"])
    typ = "movie" if f.startswith("m") else "tv"
    for i, t, vc in zip(dd["id"], dd[col], dd["vote_count"]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)
            VOT[r] = float(vc or 0)


def kw_bolla(b, q=3):
    m = np.where(mem == b)[0]
    s = set()
    for x in m[:10]:
        s |= KWt[x]
    return " · ".join(sorted(s)[:q])


KWt = [set() for _ in range(n)]
for f, col in (("movies.parquet", "keywords"), ("tv.parquet", "keywords")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    typ = "movie" if f.startswith("m") else "tv"
    for i, kwd in zip(dd["id"], dd[col]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is None:
            continue
        try:
            g = json.loads(kwd) if isinstance(kwd, str) else (kwd or [])
            KWt[r] = {x.get("name", "").lower() for x in g if isinstance(x, dict)}
        except Exception:
            pass

for b in visti[:12]:
    m = np.where(mem == b)[0]
    print("")
    print(f"[{b}] {sz[b]} titoli · " + " · ".join(TIT.get(r, "?")[:26]
                                                 for r in m[np.argsort(-VOT[m])][:5]))
    for k in (4, 6, 8):
        riga = FK[k].getrow(b)
        if riga.nnz == 0:
            print(f"   k={k}: (nessun vicino)")
            continue
        nomi = []
        for j in riga.indices:
            mj = np.where(mem == j)[0]
            nomi.append("[" + str(j) + "] " + " / ".join(
                TIT.get(r, "?")[:22] for r in mj[np.argsort(-VOT[mj])][:2]))
        print(f"   k={k}: " + "  |  ".join(nomi))
np.save(K.ML / "bolle-sparse.npy", mem)
sp.save_npz(K.ML / "bolle-archi.npz", Ffin)
print(f"\nFINE ({time.time()-t0:.0f}s)")
