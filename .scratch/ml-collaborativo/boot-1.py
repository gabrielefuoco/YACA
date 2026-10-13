"""boot-1.py — IL TEST DECISIVO DEL BOOTSTRAP.

DOMANDA. La struttura delle community nasce dalla curatela (3.512 archi su 1.459 nodi).
Il 97,8% dei titoli non ha mai visto un legame scritto a mano: il suo posto e' deciso da
contenuto/co-visione/temi. Il bootstrap sostiene: posso PREDIRE col contenuto dove la
curatela metterebbe un titolo, e far arrivare la struttura curata a chi non ce l'ha.

METRICA NON CIRCOLARE. Il classificatore e' addestrato sulle community, quindi ogni misura
di accordo CON le community e' circolare. L'unico segnale esterno sono i legami TENUTI
FUORI: sorgenti a indice dispari, mai entrate nel grafo (protocollo di etero2.py).

DUE GRAFI, DUE MESTIERI (misurato in boot-0.py):
  - CLUSTERING: stile leiden2, somma non rinormalizzata, curatela x6  -> le community del report 42
  - RETRIEVAL:  stile etero2, normalizza dopo la somma, curatela 0.88 -> 11,2% @10 (riferimento)

ARMI (10 film proposti per ogni serie; si misura quanti legami veri cadono nel top-10):
  A0  spreading sul grafo (riferimento)
  A1  contenuto cross-medium (top-10 film per similarita')
  A2  contenuto DENTRO il cluster predetto dal contenuto  <- IL BOOTSTRAP
  A3  contenuto dentro il cluster che il GRAFO assegna alla sorgente
  A4  NULLO: stesso numero di candidati, pescati a caso fra i film
  A5  spreading sul grafo ARRICCHITO con archi pseudo-curatela (il ciclo)
  A6  pool = cluster predetto, ordinato dallo spreading (l'architettura del report 42)
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
import igraph as ig
import leidenalg as la

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")


def centra(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


Pc2 = centra(Pc)
Pcn = Pc2 / (np.linalg.norm(Pc2, axis=1, keepdims=True) + 1e-9)


def carica(nome):
    q = np.load(ML / nome)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


C, B, Tm, K = carica("boot-C.npz"), carica("boot-B.npz"), carica("boot-T.npz"), carica("boot-Kpari.npz")

# --- grafo per il CLUSTERING (quello del report 42) ---
Mc = (C + B + Tm + 6.0 * K).tocsr()
Mc.sum_duplicates()
Mc = ((Mc + Mc.T) * 0.5).tocsr()
# --- grafo per il RETRIEVAL (riferimento 11,2%) ---
WT, WC = 0.25, 0.88
M_r = normalizza((1 - WC) * (1 - WT) * (0.5 * C + 0.5 * B) + (1 - WC) * WT * Tm + WC * K)
print(f"grafi pronti ({time.time()-t0:.0f}s)")

# ---------------- legami di test ----------------
d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
test = [s for i, s in enumerate(d["sources"]) if i % 2 == 1]
SOGG, BERS = [], []
for s in test:
    a = row_of.get(s["id"])
    if a is None:
        continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None or l["type"] == s["id"].split(":")[0]:
            continue
        SOGG.append(a)
        BERS.append(b)
SOGG, BERS = np.array(SOGG), np.array(BERS)
US = np.unique(SOGG)
col_of = {int(u): i for i, u in enumerate(US)}
COL = np.array([col_of[int(x)] for x in SOGG])
E = np.zeros((n, len(US)), np.float32)
E[US, np.arange(len(US))] = 1.0
print(f"legami di test cross-medium: {len(BERS)} da {len(US)} sorgenti")

# ---------------- la struttura: Leiden sul grafo decontaminato ----------------
t1 = time.time()
coo = Mc.tocoo()
msk = coo.row < coo.col
g = ig.Graph(n=n, edges=list(zip(coo.row[msk].tolist(), coo.col[msk].tolist())), directed=False)
g.es["weight"] = coo.data[msk].tolist()
RES = 3.0
L = np.array(la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                               resolution_parameter=RES, seed=42).membership)
sz = np.bincount(L)
film_per_cluster = np.bincount(L[~is_tv], minlength=len(sz))
print(f"Leiden res {RES}: {len(sz)} cluster · mediana {int(np.median(sz))} · "
      f"con >=5 film: {int((film_per_cluster>=5).sum())} ({time.time()-t1:.0f}s)")

# ---------------- il classificatore: contenuto -> cluster ----------------
t2 = time.time()
KNN = 10
pred = np.full(n, -1, np.int64)
for i in range(0, n, 500):
    sim = Pcn[i:i + 500] @ Pcn.T
    for r in range(sim.shape[0]):
        sim[r, i + r] = -9
    idx = np.argpartition(-sim, KNN, axis=1)[:, :KNN]
    for r in range(sim.shape[0]):
        pred[i + r] = Counter(L[idx[r]].tolist()).most_common(1)[0][0]
print(f"classificatore: accordo col cluster {100*float((pred==L).mean()):.1f}% ({time.time()-t2:.0f}s)")
npred_film = film_per_cluster[np.clip(pred, 0, None)]
print(f"  film nel cluster predetto di una serie: mediana {int(np.median(npred_film[is_tv]))}"
      f" · 10°ile {int(np.percentile(npred_film[is_tv],10))}")

# ---------------- armi ----------------
film_idx = np.where(~is_tv)[0]
MOLTO = 10 ** 9


def rwr(M, alpha=0.7, iters=20):
    X = E.copy()
    for _ in range(iters):
        X = alpha * (M.T @ X) + (1 - alpha) * E
    return X


def rank_matrix(X):
    R = np.empty(X.shape, dtype=np.int32)
    for j in range(X.shape[1]):
        R[np.argsort(-X[:, j]), j] = np.arange(n)
    return R


X0 = rwr(M_r)
R0 = rank_matrix(X0)
del X0
print(f"spreading fatto ({time.time()-t0:.0f}s)")

rng = np.random.default_rng(3)
CHIAVI = ("A0 spreading sul grafo (riferimento)",
          "A1 contenuto cross-medium",
          "A2 contenuto nel cluster PREDETTO  <- bootstrap",
          "A3 contenuto nel cluster GRAFO",
          "A4 NULLO · pool casuale di pari taglia",
          "A5 spreading su grafo ARRICCHITO",
          "A6 pool=cluster predetto, ordine=spreading")
RIS = {k: np.full(len(BERS), MOLTO, np.int64) for k in CHIAVI}
RIS[CHIAVI[0]] = R0[BERS, COL]

# A5: archi pseudo-curatela per le sorgenti di test
rows, cols = [], []
for u in US:
    sim = Pcn[u] @ Pcn.T
    sim[u] = -9
    altro = ~is_tv if is_tv[u] else is_tv
    sim[~altro] = -9
    cand = np.where(L == pred[u])[0]
    cand = cand[altro[cand]]
    if len(cand) == 0:
        continue
    for v in cand[np.argsort(-sim[cand])[:10]]:
        rows.append(u)
        cols.append(int(v))
Pp = coo_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(n, n)).tocsr()
Pp = ((Pp + Pp.T) * 0.5).tocsr()
print(f"A5: {len(rows)} archi pseudo-curatela")

pos_di = {}
for i, s in enumerate(SOGG):
    pos_di.setdefault(int(s), []).append(i)

for s, posizioni in pos_di.items():
    sim = Pcn[s] @ Pcn.T
    sim[s] = -9
    altro = ~is_tv if is_tv[s] else is_tv
    sim[~altro] = -9
    a1 = set(np.argsort(-sim)[:10].tolist())
    c2 = pred[s]
    a2 = set(np.argsort(-np.where(L == c2, sim, -9))[:10].tolist())
    a3 = set(np.argsort(-np.where(L == L[s], sim, -9))[:10].tolist())
    k = int((L[film_idx] == c2).sum())
    pool = rng.choice(film_idx, size=min(k, len(film_idx)), replace=False)
    a4 = set(pool[np.argsort(-sim[pool])][:10].tolist())
    # A6: pool = cluster predetto, ma l'ordine lo da' lo SPREADING (rango crescente = meglio)
    a6 = set(np.argsort(np.where(L == c2, R0[:, col_of[s]], MOLTO))[:10].tolist())
    for pos in posizioni:
        b = BERS[pos]
        if b in a1:
            RIS[CHIAVI[1]][pos] = 0
        if b in a2:
            RIS[CHIAVI[2]][pos] = 0
        if b in a3:
            RIS[CHIAVI[3]][pos] = 0
        if b in a4:
            RIS[CHIAVI[4]][pos] = 0
        if b in a6:
            RIS[CHIAVI[6]][pos] = 0

# A5: grafo di retrieval + pseudo-archi, rinormalizzato
M5 = normalizza(M_r + 1.0 * Pp)
R5 = rank_matrix(rwr(M5))
RIS[CHIAVI[5]] = R5[BERS, COL]
del R5

NS = (10, 50, 100, 500, 2000)
print("")
print("=" * 96)
print("RISULTATI — 1.002 legami serie->film tenuti fuori, protocollo a parita'")
print("=" * 96)
print(f"{'arma':<48} " + " ".join(f"{('@'+str(k)):>7}" for k in NS))
for k in CHIAVI:
    v = RIS[k]
    print(f"{k:<48} " + " ".join(f"{100*float((v<N).mean()):6.1f}%" for N in NS))

perm = rng.permutation(len(BERS))
cal, ver = perm[:len(perm) // 2], perm[len(perm) // 2:]
print("")
print("CALIBRAZIONE (meta') / VERIFICA (altra meta') — @10")
print(f"{'arma':<48} {'calib':>8} {'verifica':>9}")
for k in CHIAVI:
    v = RIS[k]
    print(f"{k:<48} {100*float((v[cal]<10).mean()):7.1f}% {100*float((v[ver]<10).mean()):8.1f}%")

np.savez_compressed(ML / "boot-1.npz", L=L, pred=pred, soggetti=US, bersagli=BERS, col=COL)
print(f"\n({time.time()-t0:.0f}s)")
