"""contaminazione.py — QUANTO PESA LA PERDITA DI CONTENUTO?

TROVATO: `Pc` NON e' contenuto. In spazi-trakt.py:
    Zs = svds(Xw, k=64)      con X = matrice utente x film di MOVIELENS
    Pc = Ridge().fit(FX, Yc).predict(FX)      con Yc[i] = Zs[...]
Cioe': lo spazio "contenuto" e' un Ridge che predice un embedding DERIVATO DAL COMPORTAMENTO
MOVIELENS a partire dalle keyword. E la valutazione di tutta la sessione e' su MovieLens.

Se e' cosi', gli archi di contenuto -- il componente piu' grande del grafo, 1,6M archi --
contengono gia' la risposta. Questa e' la contaminazione che il handoff segnala due volte.

MISURA: si costruisce lo spazio contenuto PULITO (SVD del TF-IDF delle keyword, nessun
MovieLens dentro), si rifanno gli archi di contenuto, si tiene tutto il resto identico, e si
confrontano i due grafi sulla STESSA valutazione (utenti MovieLens tenuti fuori, protocollo
di sempre). La differenza e' la contaminazione.
"""
import json, pathlib, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, coo_matrix, load_npz
from sklearn.decomposition import TruncatedSVD

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
N_UTENTI = 1000

z = np.load(K.A("spazi-trakt.npz"), allow_pickle=True)
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


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


def carica(nome):
    q = np.load(ML / nome)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


def topk_edges(V, k, min_sim=0.05, B=1000):
    Vn = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
    rows, cols, vals = [], [], []
    for i in range(0, n, B):
        sim = Vn[i:i + B] @ Vn.T
        for r in range(sim.shape[0]):
            sim[r, i + r] = -9
        idx = np.argpartition(-sim, k, axis=1)[:, :k]
        w = np.take_along_axis(sim, idx, 1)
        for r in range(sim.shape[0]):
            pos = w[r] >= min_sim
            rows += [i + r] * int(pos.sum())
            cols += list(idx[r][pos])
            vals += list(w[r][pos])
    A = coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr()
    return normalizza((A + A.T) * 0.5)


# ---------- lo spazio contenuto PULITO ----------
CACHE = K.DATA / "spazio-pulito.npz"
if CACHE.exists():
    q = np.load(CACHE)
    Pclean = q["P"]
    print(f"spazio pulito da cache: {Pclean.shape} ({time.time()-t0:.0f}s)")
else:
    F = load_npz(K.A("spazi-trakt-tfidf.npz")).tocsr()
    print(f"TF-IDF delle keyword: {F.shape} · nnz {F.nnz:,} ({time.time()-t0:.0f}s)")
    sv = TruncatedSVD(n_components=128, random_state=0)
    E = sv.fit_transform(F).astype(np.float64)
    print(f"  SVD 128 fatto, varianza spiegata {sv.explained_variance_ratio_.sum():.3f} ({time.time()-t0:.0f}s)")
    Pclean = centra(E)
    np.savez_compressed(CACHE, P=Pclean.astype(np.float32))
    print(f"  salvato ({time.time()-t0:.0f}s)")

# quanto sono d'accordo i due spazi?
Pc_c = centra(Pc)
rng = np.random.default_rng(1)
s = rng.choice(n, 3000, replace=False)
A1 = Pc_c[s] @ Pc_c.T
A2 = Pclean[s] @ Pclean.T
print(f"\naccordo fra Pc (contaminato) e lo spazio pulito, su {len(s):,} titoli:")
print(f"  correlazione fra le due similarita': {np.corrcoef(A1.ravel(), A2.ravel())[0,1]:.3f}")

# ---------- i due grafi, tutto il resto identico ----------
B = carica("boot-B.npz")
Tm = carica("boot-T.npz")
K = carica("boot-Kpari.npz")
C_pc = carica("boot-C.npz")
print(f"\narchi di contenuto da Pc (cache): {C_pc.nnz:,}")
C_clean = topk_edges(Pclean, 15)
print(f"archi di contenuto PULITI:        {C_clean.nnz:,} ({time.time()-t0:.0f}s)")

WT, WC = 0.25, 0.60
GRAFI = {
    "Pc (contaminato, l'attuale)": normalizza((1 - WC) * (1 - WT) * (0.5 * C_pc + 0.5 * B) + (1 - WC) * WT * Tm + WC * K),
    "spazio PULITO (keyword only)": normalizza((1 - WC) * (1 - WT) * (0.5 * C_clean + 0.5 * B) + (1 - WC) * WT * Tm + WC * K),
}

# ---------- valutazione ----------
links = pd.read_csv(ML / "ml-32m" / "links.csv")
m2r = {}
for mid, tid in zip(links["movieId"], links["tmdbId"]):
    if pd.isna(tid):
        continue
    r = row_of.get(f"movie:{int(tid)}")
    if r is not None:
        m2r[int(mid)] = r
rr = pd.read_parquet(ML / "ratings-puliti.parquet")
rr["row"] = rr["movieId"].map(m2r)
rr = rr.dropna(subset=["row"])
rr["row"] = rr["row"].astype(np.int64)
cnt = rr.groupby("userId").size()
buoni = cnt[cnt >= 20].index.values
rng = np.random.default_rng(9)
scelti = rng.choice(buoni, size=min(N_UTENTI, len(buoni)), replace=False)
sub = rr[rr.userId.isin(set(scelti))]
gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
prof_di, oro_di = {}, {}
for u in scelti:
    righe = np.unique(gruppi[u])
    if len(righe) < 20:
        continue
    perm = rng.permutation(len(righe))
    t = int(0.6 * len(righe))
    prof_di[u] = righe[perm[:t]]
    oro_di[u] = set(righe[perm[t:]].tolist())
US = np.array(list(prof_di.keys()))
pop = z["votes"].astype(float)
pct_pop = (np.argsort(np.argsort(pop)) / (n - 1.0)) * 100
print(f"utenti valutati: {len(US):,} ({time.time()-t0:.0f}s)")

print("")
print("=" * 100)
print("IL VERDETTO — stesso protocollo, cambia solo lo spazio del contenuto")
print("=" * 100)
NS = (10, 50, 100, 500, 2000)
for nome, M in GRAFI.items():
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[prof_di[u], j] = 1.0
    X = E.copy()
    for _ in range(20):
        X = 0.30 * (M.T @ X) + 0.70 * E
    for j, u in enumerate(US):
        X[prof_di[u], j] = -1e9
    rk = np.empty((n, len(US)), np.int32)
    for j in range(len(US)):
        rk[np.argsort(-X[:, j]), j] = np.arange(n)
    colpito_recall = []
    pop10 = []
    for N in NS:
        tot = hit = 0
        for j, u in enumerate(US):
            m = N
            sel = np.argpartition(rk[:, j], m)[:m]
            oro = oro_di[u]
            hit += sum(1 for x in sel if int(x) in oro)
            tot += len(oro)
        colpito_recall.append(100 * hit / tot)
    # testa riordinata per popolarita' (il piano: recupero + popolarita')
    for j, u in enumerate(US):
        cand = np.argpartition(rk[:, j], 500)[:500]
        cand = cand[np.argsort(-pct_pop[cand])][:10]
        oro = oro_di[u]
        pop10.append(sum(1 for x in cand if int(x) in oro))
    print(f"\n  {nome}")
    print("    recupero (recall): " + " · ".join(f"@{N} {v:5.2f}%" for N, v in zip(NS, colpito_recall)))
    print(f"    testa riordinata per popolarita': recall@10 {100*sum(pop10)/sum(len(oro_di[u]) for u in US):.2f}%")
print(f"\n({time.time()-t0:.0f}s)")
