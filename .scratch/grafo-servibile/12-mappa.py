"""12-mappa.py — TICKET 12: la mappa — otto vicini tipizzati per bolla.

L'adiacenza finale di ogni bolla, a QUOTE:
  4 slot di CONTINUITA' CANONICA  (i vicini col massimo punteggio combinato sui due assi)
  2 slot di SALTO VIBE            (massimo sull'asse comportamentale fra chi ha bassa
                                   sovrapposizione strutturale)
  2 slot di PONTE CROSS-MEDIUM    (se la bolla e' a maggioranza film, due slot a bolle a
                                   maggioranza serie, e viceversa)

Otto vicini, non mille: la differenza fra una PROPOSTA e un ELENCO.

Base: il k-NN DIRETTO simmetrizzato del ticket 23 — l'unica variante che dava 5 componenti,
mediana 8 e 6/6 delle adjacency verificate.

Uso:  python .scratch/grafo-servibile/12-mappa.py
"""
import json, pathlib, sys, time
from collections import Counter
import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
voti = K.voti()
mem = np.load(K.ML / "bolle2-E.npy")
nb = int(mem.max()) + 1
sz = np.bincount(mem, minlength=nb)

CMP = K.Componenti(n)
C = CMP(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    C[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
P = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), mem)), shape=(n, nb)).tocsr()


def asse(pesi, extra=None):
    tot = sum(pesi.values())
    M = None
    for nome_c, w in pesi.items():
        A = K.correggi_hub(C[nome_c], 0.25) if nome_c in C else K.correggi_hub(extra, 0.25)
        p = A * (w / tot)
        M = p if M is None else M + p
    return K.normalizza(M.tocsr())


LISTA = K.carica_csr("nuovo-LIST.npz", n)
B_VA = asse({"CF": 1, "B": 1, "TV": 1}, extra=LISTA)
B_VA = K.normalizza((B_VA + K.correggi_hub(LISTA, 0.25) * 0.25).tocsr())
S_VA = asse({"KW": 1, "CAST": 1, "DIR": 1, "COLL": 1})
print(f"assi pronti ({time.time()-t0:.0f}s)", flush=True)


def pesi_e_pmi(M):
    G = (P.T @ M @ P).tocsr()
    G.setdiag(0)
    G.eliminate_zeros()
    r, c, v = sp.find(G)
    SA = np.asarray(G.sum(1)).ravel()
    tot = v.sum()
    pmi = np.maximum(np.log((v * tot) / np.maximum(SA[r] * SA[c], 1e-12)), 0.0)
    return sp.csr_matrix((pmi, (r, c)), shape=(nb, nb))


PB = pesi_e_pmi(B_VA)
PS = pesi_e_pmi(S_VA)
# il punteggio combinato (la somma dei due PMI normalizzati per l'uso nel ranking)
COMB = (PB + PS).tocsr()
print(f"PMI comportamentale {PB.nnz:,} · strutturale {PS.nnz:,} ({time.time()-t0:.0f}s)", flush=True)


def k_diretto(Gx, k):
    righe, col = [], []
    for i in range(nb):
        riga = Gx.getrow(i)
        if riga.nnz == 0:
            continue
        d, idx = riga.data, riga.indices
        for j in idx[np.argsort(-d)[:k]]:
            righe.append(i)
            col.append(int(j))
    return sp.csr_matrix((np.ones(len(righe), np.float32), (righe, col)), shape=(nb, nb))


BASE = ((k_diretto(COMB, 8) + k_diretto(COMB, 8).T) > 0).astype(np.float32).tocsr()
BASE.setdiag(0)
BASE.eliminate_zeros()
from scipy.sparse.csgraph import connected_components
ncomp, _ = connected_components((BASE + BASE.T).tocsr(), directed=False)
print(f"base (k-NN diretto k=8 simmetrizzato): {BASE.nnz:,} archi · {ncomp} componenti")

# ------------------------------------------------------------------ i tipi e la maggioranza
is_tv_b = np.zeros(nb)
for b in range(nb):
    m = np.where(mem == b)[0]
    is_tv_b[b] = is_tv[m].mean()
maggioranza_serie = is_tv_b > 0.5
print(f"  bolle a maggioranza SERIE: {int(maggioranza_serie.sum()):,} · "
      f"a maggioranza FILM: {int((~maggioranza_serie).sum()):,}")

# ------------------------------------------------------------------ gli otto slot
print("")
print("assegno gli otto slot ...", flush=True)
SLOT = {}
for b in range(nb):
    riga = BASE.getrow(b)
    if riga.nnz == 0:
        SLOT[b] = []
        continue
    idx = riga.indices
    pb = np.array([PB[b, int(j)] for j in idx])
    ps = np.array([PS[b, int(j)] for j in idx])
    comb = np.array([COMB[b, int(j)] for j in idx])
    scelti, presi = [], set()

    def prendi(cand, quanti, etichetta):
        n_presi = 0
        for j in cand:
            if len(scelti) >= 8 or n_presi >= quanti:
                break
            if j in presi:
                continue
            scelti.append((int(j), etichetta))
            presi.add(j)
            n_presi += 1
        return n_presi

    # 4 canonici: massimo punteggio combinato
    prendi(list(idx[np.argsort(-comb)]), 4, "canonico")
    # 2 vibe: massimo comportamentale con strutturale BASSO
    sl_vibe = np.where(ps <= np.median(ps), pb, -1)
    prendi(list(idx[np.argsort(-sl_vibe)]), 2, "vibe")
    # 2 cross-medium: bolle a maggioranza opposta
    opp = np.array([maggioranza_serie[int(j)] != maggioranza_serie[b] for j in idx])
    cand_opp = list(idx[opp][np.argsort(-comb[opp])]) if opp.any() else []
    prendi(cand_opp, 2, "cross-medium")
    # riempi se manca qualcosa
    if len(scelti) < 8:
        prendi(list(idx[np.argsort(-comb)]), 8, "canonico")
    SLOT[b] = scelti

pieni = np.array([len(v) for v in SLOT.values()])
con_cross = np.array([sum(1 for _, e in v if e == "cross-medium") for v in SLOT.values()])
print("")
print("=" * 100)
print("GLI OTTO SLOT — come si riempiono")
print("=" * 100)
print(f"  slot riempiti: mediana {int(np.median(pieni))} · min {int(pieni.min())} · max {int(pieni.max())}")
print(f"  bolle con 8 slot: {int((pieni==8).sum()):,} su {nb:,} ({100*(pieni==8).mean():.1f}%)")
print(f"  bolle SENZA nessun vicino: {int((pieni==0).sum()):,}")
print(f"  bolle con ≥2 slot CROSS-MEDIUM: {int((con_cross>=2).sum()):,} ({100*(con_cross>=2).mean():.1f}%)")
print(f"  bolle con 0 slot cross-medium: {int((con_cross==0).sum()):,} ({100*(con_cross==0).mean():.1f}%)")
da = Counter(e for v in SLOT.values() for _, e in v)
print(f"  ripartizione: " + " · ".join(f"{k} {v:,}" for k, v in da.most_common()))

# il controllo: le adjacency verificate del ticket 09 e 23 sono ancora nella mappa?
VER = [(210, 1102, "Fassbinder -> Nuovo Cinema Tedesco"), (420, 733, "Star Wars TV -> film"),
       (1092, 3948, "mostri '50 -> teenage werewolf"), (1251, 415, "polacche -> polacche"),
       (1167, 4171, "argentine -> argentine"), (761, 2428, "norvegesi -> norvegesi")]
print("")
print("  --- le adjacency verificate sono nella mappa a 8 slot? ---")
for a, b, et in VER:
    dentro = any(j == b for j, _ in SLOT[a]) or any(j == a for j, _ in SLOT[b])
    tipo = next((e for j, e in SLOT[a] if j == b), next((e for j, e in SLOT[b] if j == a), "—"))
    print(f"    {'✓' if dentro else '✗'} {et:<38} [{a}]-[{b}] {tipo if dentro else ''}")

# ------------------------------------------------------------------ il documento da leggere
TIT, KWt = {}, [set() for _ in range(n)]
for f, col in (("movies.parquet", "title"), ("tv.parquet", "name")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    typ = "movie" if f.startswith("m") else "tv"
    for i, t_ in zip(dd["id"], dd[col]):
        rr = row_of.get(f"{typ}:{int(i)}")
        if rr is not None:
            TIT[rr] = str(t_)
for f in ("movies.parquet", "tv.parquet"):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", "keywords"])
    typ = "movie" if f.startswith("m") else "tv"
    for i, kwd in zip(dd["id"], dd["keywords"]):
        rr = row_of.get(f"{typ}:{int(i)}")
        if rr is None:
            continue
        try:
            g = json.loads(kwd) if isinstance(kwd, str) else (kwd or [])
            KWt[rr] = {x.get("name", "").lower() for x in g if isinstance(x, dict)}
        except Exception:
            pass


def nome(b, q=3):
    c = Counter()
    for x in np.where(mem == b)[0][:20]:
        c.update(KWt[x])
    return " · ".join(w for w, _ in c.most_common(q)) or "—"


ids = [i for i in range(nb) if 15 <= sz[i] <= 60]
scelte = [ids[i] for i in np.random.default_rng(11).choice(len(ids), size=100, replace=False)]
print("")
print("=" * 110)
print("LA MAPPA SU 30 BOLLE — da leggere")
print("=" * 110)
for b in scelte[:30]:
    m = np.where(mem == b)[0]
    print("")
    print(f"[{b}] {sz[b]} titoli · {int(is_tv_b[b]*100)}% serie · {nome(b,3)}")
    print("     " + " · ".join(TIT.get(r, "?")[:24] for r in m[np.argsort(-voti[m])][:5]))
    for j, e in SLOT[b]:
        mj = np.where(mem == j)[0]
        print(f"     {e:<13} [{j}] {sz[j]:>3} titoli · {nome(j,3):<42} "
              f"· es. {TIT.get(mj[0],'?')[:26]}")
print(f"\nFINE ({time.time()-t0:.0f}s)")
