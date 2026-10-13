"""rrf-prodotto.py — QUANTO COSTA LA FUSIONE A DUE STADI SUL METRO DEL PRODOTTO?

Il report 58 ha mostrato che la fusione per ranghi (RRF) raddoppia il @10 sul metro curato
(11,18% -> 22,65%) e batte il riferimento storico su ogni profondita'. Ma il report 41 diceva
"RRF 1,4% sul prodotto": se cosi' fosse, la fusione servirebbe al ponte cross-medium e non ai
due cataloghi.

Qui si rimisura sul grafo nuovo, con il protocollo esatto del prodotto (utenti MovieLens,
split 60/40, catalogo FILM, alpha 0,30). La camminata si calcola UNA volta sola: le fusioni
costano pochi secondi, quindi si provano molte combinazioni.

Nota sul protocollo: il catalogo film e' un catalogo a se', quindi i ranghi si calcolano
DENTRO il catalogo film (non sulla lista completa poi filtrata) — e' quello che il prodotto fa.
"""
import json, pathlib, time
import numpy as np
import pandas as pd
import scipy.sparse as sp

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
IDX_FILM = np.where(~is_tv)[0]
print(f"titoli: {n:,} · film: {len(IDX_FILM):,} · serie: {int(is_tv.sum()):,}")

# --- il protocollo del prodotto (identico a ottimizza-1.py) ---
rr = pd.read_parquet(ML / "ratings-puliti.parquet")
link = pd.read_csv(ML / "ml-32m" / "links.csv")
mappa = {}
for tm, im in zip(link.tmdbId.values, link.movieId.values):
    if pd.isna(tm):
        continue
    r = row_of.get(f"movie:{int(tm)}")
    if r is not None:
        mappa[int(im)] = r
rr["row"] = rr.movieId.map(mappa)
rr = rr[rr.row.notna()]
rr["row"] = rr["row"].astype(np.int64)
cnt = rr.groupby("userId").size()
buoni = cnt[cnt >= 20].index.values
SCELTI = np.random.default_rng(9).choice(buoni, size=2000, replace=False)
CAL, VER = SCELTI[:1000], SCELTI[1000:]

N_UTENTI = 500
sub = rr[rr.userId.isin(set(CAL.tolist()))]
gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
PROF, ORO = {}, {}
r2 = np.random.default_rng(7)
for u in CAL:
    righe = np.unique(gruppi[u])
    if len(righe) < 20:
        continue
    perm = r2.permutation(len(righe))
    t = int(0.6 * len(righe))
    PROF[u] = righe[perm[:t]]
    ORO[u] = set(righe[perm[t:]].tolist())
    if len(PROF) >= N_UTENTI:
        break
US = np.array(list(PROF.keys()))
print(f"calibrazione: {len(US)} utenti ({time.time()-t0:.0f}s)")

# --- il grafo nuovo ---
def topk_edges(V, k, min_sim=0.05, B=2048):
    Vn = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
    r, c, v = [], [], []
    for i in range(0, Vn.shape[0], B):
        sim = Vn[i:i + B] @ Vn.T
        for j in range(sim.shape[0]):
            s = sim[j]
            s[i + j] = -2
            idx = np.argpartition(-s, k)[:k]
            m = s[idx] > min_sim
            r.extend([i + j] * int(m.sum()))
            c.extend(idx[m].tolist())
            v.extend(s[idx][m].tolist())
    M = sp.csr_matrix((v, (r, c)), shape=(Vn.shape[0], Vn.shape[0]), dtype=np.float32)
    return ((M + M.T) * 0.5).tocsr()


def carica(nm):
    q = np.load(ML / nm)
    return sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


K = 60
BETA = 0.50
WC = 0.60
print(f"componenti (k={K}) ...", flush=True)
CF = topk_edges(np.load(ML / "cf-spazio.npz")["Cf"], K)
CFst = topk_edges(np.load(ML / "cf-studente.npz")["P"], K)
Kc = topk_edges(np.load(ML / "spazio-pulito.npz")["P"], K)
B = carica("boot-B.npz")
Tm = carica("boot-T.npz")
Kp = carica("boot-Kpari.npz")
print(f"  pronti ({time.time()-t0:.0f}s)", flush=True)


def correggi_hub(M, beta):
    if beta == 0:
        return M
    M = M.tocoo()
    deg = np.asarray(M.sum(1)).ravel()
    w = np.power(np.maximum(deg[M.col], 1e-6), -beta)
    return sp.csr_matrix((M.data * w, (M.row, M.col)), shape=(n, n))


def normalizza(M):
    M = M.tocsr().astype(np.float32)
    d = np.asarray(M.sum(1)).ravel()
    return sp.diags(1.0 / np.maximum(d, 1e-9)).dot(M).tocsr()


pesi = {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}
tot = sum(pesi.values())
COMP = {"CF": CF, "CFst": CFst, "Kc": Kc, "B": B, "T": Tm}
M = None
for nome, w in pesi.items():
    A = correggi_hub(COMP[nome], BETA)
    M = (A * ((1 - WC) * w / tot)) if M is None else M + A * ((1 - WC) * w / tot)
M = normalizza((M + WC * Kp).tocsr())

E = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    E[PROF[u], j] = 1.0

print(f"camminata (alpha 0,30) ...", flush=True)
X = E.copy()
for _ in range(20):
    X = 0.30 * (M.T @ X) + 0.70 * E
print(f"  fatta ({time.time()-t0:.0f}s)", flush=True)
np.savez_compressed(ML / "rrf-prod-camminata.npz", X=X.astype(np.float32))

MASK = np.zeros((n, len(US)), bool)
for j, u in enumerate(US):
    MASK[PROF[u], j] = True


def ranghi_film(S):
    """ranghi calcolati DENTRO il catalogo film (come fa il prodotto)."""
    Sf = S[IDX_FILM]
    Sf = np.where(MASK[IDX_FILM], -1e30, Sf)
    R = np.empty(Sf.shape, np.int32)
    for j in range(Sf.shape[1]):
        R[np.argsort(-Sf[:, j]), j] = np.arange(len(IDX_FILM))
    return R


def misura(R, nome):
    out = []
    den = sum(len(ORO[u]) for u in US)
    for N in (10, 100, 500, 2000):
        hit = 0
        for j, u in enumerate(US):
            scelti = IDX_FILM[np.argpartition(R[:, j], N)[:N]]
            hit += sum(1 for x in scelti if int(x) in ORO[u])
        out.append(100 * hit / den)
    print(f"  {nome:<48} " + " · ".join(f"@{N} {v:6.2f}%" for N, v in
                                        zip((10, 100, 500, 2000), out)), flush=True)
    return out


RIS = {}
print("")
print("=" * 108)
print("METRO DEL PRODOTTO — catalogo FILM, 500 utenti di calibrazione")
print("=" * 108)

Rs = ranghi_film(X)
RIS["spreading sola"] = misura(Rs, "camminata sola (il riferimento)")

Cf = np.load(ML / "cf-spazio.npz")["Cf"]
Cf = Cf / (np.linalg.norm(Cf, axis=1, keepdims=True) + 1e-9)
Kcn = np.load(ML / "spazio-pulito.npz")["P"]
Kcn = Kcn / (np.linalg.norm(Kcn, axis=1, keepdims=True) + 1e-9)

S_cf = np.zeros((n, len(US)), np.float32)
S_kc = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    S_cf[:, j] = Cf @ Cf[PROF[u]].T.mean(1)
    S_kc[:, j] = Kcn @ Kcn[PROF[u]].T.mean(1)
R_cf = ranghi_film(S_cf)
R_kc = ranghi_film(S_kc)
RIS["teacher comportamento"] = misura(R_cf, "teacher SOLO (comportamento)")
RIS["teacher metadati"] = misura(R_kc, "teacher SOLO (metadati puliti)")

# --- varianti del teacher: l'ipotesi e' che il "1,4% sul prodotto" del report 41 venisse
#     da un teacher costruito su UN SOLO seme invece che sul centroide del profilo ---
S_uno = np.zeros((n, len(US)), np.float32)
S_max = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    semi = PROF[u]
    S_uno[:, j] = Cf @ Cf[semi[0]]
    S_max[:, j] = (Cf @ Cf[semi].T).max(1)
R_uno = ranghi_film(S_uno)
R_max = ranghi_film(S_max)
RIS["teacher 1 seme"] = misura(R_uno, "teacher SOLO (UN seme solo)")
RIS["teacher max"] = misura(R_max, "teacher SOLO (max sui semi)")
for k0 in (60, 3000):
    Rr = ranghi_film(3.0 / (k0 + Rs) + 0.5 / (k0 + R_uno))
    RIS[f"RRF 1seme k{k0}"] = misura(Rr, f"RRF camminata+UN seme k={k0}")
    Rr = ranghi_film(3.0 / (k0 + Rs) + 0.5 / (k0 + R_max))
    RIS[f"RRF max k{k0}"] = misura(Rr, f"RRF camminata+max k={k0}")

for k0 in (60, 3000, 20000):
    for w_s, w_t, etichetta in ((3.0, 0.5, "3,0/0,5"), (1.0, 1.0, "1/1"), (0.5, 3.0, "0,5/3,0")):
        Rr = ranghi_film(w_s / (k0 + Rs) + w_t / (k0 + R_cf))
        RIS[f"RRF cf k{k0} {etichetta}"] = misura(Rr, f"RRF camminata+comport. k={k0} pesi {etichetta}")
for k0 in (3000,):
    Rr = ranghi_film(3.0 / (k0 + Rs) + 0.5 / (k0 + R_kc))
    RIS[f"RRF kc k{k0}"] = misura(Rr, f"RRF camminata+metadati k={k0}")

print("")
print("=" * 108)
print("IL CONFRONTO — metro del prodotto (catalogo film, 500 utenti)")
print("=" * 108)
print(f"  {'il grafo nuovo a uno stadio (report 56, 1.000 utenti di verifica)':<58} @10 5,99% · @100 29,61% · @500 63,35% · @2000 87,86%")
print("")
best = max(RIS.items(), key=lambda kv: kv[1][0])
print(f"  migliore qui: {best[0]} → @10 {best[1][0]:.2f}% · @100 {best[1][1]:.2f}%")
print(f"\n({time.time()-t0:.0f}s)")
