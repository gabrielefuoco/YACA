"""verifica-riferimento41.py — IL "RIFERIMENTO STORICO" DEL METRO CURATO E' UN ARTEFATTO?

Il report 41 dava RRF 18,90% @10 e 36,90% @100 sul metro curato, e da allora quel numero e' il
riferimento da battere. Ma guardando il suo codice (twostage.py):

    A = Mc.copy()        # Mc = archi_curatela(TRAIN) -> le sorgenti a indice PARI
    ...pmi...
    E = TruncatedSVD(256).fit_transform(P)     # il "teacher"

E le sorgenti di TEST sono quelle a indice DISPARI, che in quel grafo NON hanno nessun arco.
Se e' cosi', E[sorgente_di_test] = 0, il teacher e' la matrice nulla, e `ranghi(E @ E[u])`
restituisce l'ordine di indice — esattamente l'artefatto del report 58.

Qui si ricostruisce quel teacher e si guarda.
"""
import json, pathlib, time
import numpy as np
import scipy.sparse as sp
from scipy.sparse import coo_matrix
from sklearn.decomposition import TruncatedSVD

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")

d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
src = d["sources"]
train = [s for i, s in enumerate(src) if i % 2 == 0]
test = [s for i, s in enumerate(src) if i % 2 == 1]
print(f"sorgenti: {len(src)} · train (pari) {len(train)} · test (dispari) {len(test)}")


def normalizza(A):
    A = A.tocsr().astype(np.float32)
    dd = np.asarray(A.sum(1)).ravel()
    return sp.diags(1.0 / np.maximum(dd, 1e-9)).dot(A).tocsr()


def archi_curatela(sorgenti):
    rows, cols, vals = [], [], []
    for s in sorgenti:
        a = row_of.get(s["id"])
        if a is None:
            continue
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None:
                continue
            rows += [a, b]
            cols += [b, a]
            vals += [float(l.get("w", 1))] * 2
    return normalizza(coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr())


Mc = archi_curatela(train)
print(f"curatela del train: {Mc.nnz:,} archi ({time.time()-t0:.0f}s)")

# --- il teacher del report 41, identico ---
A = Mc.copy()
A.data = np.ones_like(A.data)
tot = A.sum()
rs = np.asarray(A.sum(1)).ravel()
cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.maximum(np.log((Co.data * tot) / (rs[Co.row] * cs[Co.col] + 1e-9) + 1e-9) - np.log(10.0), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
E = TruncatedSVD(n_components=256, random_state=0).fit_transform(P).astype(np.float32)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
print(f"teacher: {E.shape} ({time.time()-t0:.0f}s)")

# --- LA DOMANDA: le sorgenti di test hanno un vettore? ---
S_TR = np.array([row_of[s["id"]] for s in train if s["id"] in row_of])
S_TE = np.array([row_of[s["id"]] for s in test if s["id"] in row_of])
nrm = np.linalg.norm(E, axis=1)
print("")
print("=" * 92)
print("LE SORGENTI DI TEST NEL TEACHER DEL REPORT 41")
print("=" * 92)
print(f"  sorgenti di TRAIN (pari):   norma media del vettore teacher {nrm[S_TR].mean():.4f} · "
      f"zero: {int((nrm[S_TR] == 0).sum())}/{len(S_TR)}")
print(f"  sorgenti di TEST (dispari): norma media del vettore teacher {nrm[S_TE].mean():.4f} · "
      f"zero: {int((nrm[S_TE] == 0).sum())}/{len(S_TE)}")

# --- la conseguenza: il teacher di test e' nullo? allora e' l'ordine di indice ---
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


def ranghi(S):
    R = np.empty(S.shape, np.int32)
    for j in range(S.shape[1]):
        R[np.argsort(-S[:, j]), j] = np.arange(n)
    return R


def misura(R, nome):
    rk = R[BERS, COL]
    out = [100 * float((rk < N).mean()) for N in (10, 50, 100, 500, 2000)]
    print(f"  {nome:<46} " + " · ".join(f"@{N} {v:5.2f}%" for N, v in
                                        zip((10, 50, 100, 500, 2000), out)), flush=True)
    return out


Rt = E @ E[US].T
R_ind = np.tile(np.arange(n, dtype=np.int32)[:, None], (1, len(US)))
rnd = np.random.default_rng(3)
R_rand = np.tile(rnd.permutation(n).astype(np.int32)[:, None], (1, len(US)))

print("")
print("  --- il teacher del report 41, come teacher ---")
a1 = misura(ranghi(Rt), "teacher report 41 (SVD PMI della curatela train)")
a2 = misura(R_ind, "CONTROLLO — ordine di indice")
a3 = misura(R_rand, "CONTROLLO — permutazione casuale")

print("")
print("=" * 92)
print("VERDETTO")
print("=" * 92)
uguali = np.allclose(a1, a2)
print(f"  il teacher del report 41 e il controllo 'ordine di indice' danno lo stesso risultato: {uguali}")
if uguali:
    print("  -> il teacher e' la MATRICE NULLA sulle sorgenti di test: e' l'artefatto del report 58.")
else:
    print("  -> il teacher porta informazione vera: il riferimento del report 41 e' legittimo.")
print(f"\n({time.time()-t0:.0f}s)")
