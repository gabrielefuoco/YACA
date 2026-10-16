"""boot-comp.py — I COMPONENTI DEL GRAFO, CACHATI UNA VOLTA.

Il ciclo di bootstrap e' iterativo: se ogni giro ricostruisce il grafo da zero non si itera.
Qui si costruiscono i QUATTRO tipi di arco separatamente e si salvano normalizzati per riga:
  C  contenuto   k-NN(15) dello spazio Pc centrato
  B  co-visione  related di Trakt
  T  temi        k-NN(15) dei macro-temi
  K  curatela    scritta a mano — la costruisco in DUE versioni: tutti i 499, e solo i pari

Da qui in poi qualsiasi esperimento compone  M = C + B + T + 6*K  in secondi.

VERIFICA (fatta PRIMA di credere a qualunque numero): C + B + T + 6*K(tutti)
deve riprodurre `leiden-graph.npz`, che e' stato costruito da leiden2.py.
Se non lo riproduce, la ricostruzione e' sbagliata e nessun esperimento vale.
"""
import json, pathlib, time
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
z = np.load(K.A("spazi-trakt.npz"), allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
assert len(row_of) == n, "chiavi duplicate"
src = d["sources"]


def centra(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


Pc2 = centra(Pc)
zt = np.load(ML / "temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n:
    T = T.T
assert T.shape[0] == n, f"temi: forma inattesa {T.shape} per n={n}"


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


def topk_edges(V, k, min_sim=0.05, B=1000):
    """IDEMPOTENTE a leiden2.py: k-NN diretto, simmetrizzato (A+A.T)/2, POI normalizzato."""
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


def trakt_edges():
    rows, cols = [], []
    base = pathlib.Path(ROOT / ".cache" / "trakt")
    for f in list(base.glob("rel-movie-*.json")) + list(base.glob("rel-tv-*.json")):
        try:
            rel = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(rel, list):
            continue
        m = f.name.split("-")[1]
        tids = [int(t) for t in ((v.get("ids") or {}).get("tmdb") for v in rel) if t]
        for t in tids:
            r = row_of.get(f"{m}:{t}")
            if r is None:
                continue
            for t2 in tids:
                if t2 == t:
                    continue
                r2 = row_of.get(f"{m}:{t2}")
                if r2 is not None:
                    rows.append(r)
                    cols.append(r2)
    A = coo_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(n, n)).tocsr()
    return normalizza((A + A.T) * 0.5)


def curatela_edges(sorgenti):
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


def salva(nome, A):
    A = A.tocsr()
    np.savez_compressed(ML / nome, data=A.data.astype(np.float32),
                        indices=A.indices.astype(np.int32), indptr=A.indptr.astype(np.int64))
    print(f"  {nome:<22} {A.nnz:>9,} archi  ({time.time()-t0:.0f}s)")


C = topk_edges(Pc2, 15)
salva("boot-C.npz", C)
B = trakt_edges()
salva("boot-B.npz", B)
Tm = topk_edges(T, 15)
salva("boot-T.npz", Tm)
K_all = curatela_edges(src)
salva("boot-Kall.npz", K_all)
K_gra = curatela_edges([s for i, s in enumerate(src) if i % 2 == 0])
salva("boot-Kpari.npz", K_gra)
print(f"  curatela: tutti {K_all.nnz:,} · solo pari {K_gra.nnz:,}")

# ---------------- LA VERIFICA ----------------
print("")
print("VERIFICA: la ricostruzione riproduce leiden-graph.npz?")
M = (C + B + Tm + 6.0 * K_all).tocsr()
M.sum_duplicates()
M = ((M + M.T) * 0.5).tocsr()
zz = np.load(ML / "leiden-graph.npz")
R = csr_matrix((zz["data"], zz["indices"], zz["indptr"]), shape=(n, n)).tocsr()
print(f"  ricostruito {M.nnz:,} archi · cache {R.nnz:,} archi")
if M.nnz != R.nnz:
    print("  !!! FORMA DIVERSA — stop.")
    raise SystemExit(1)
diff = abs(M - R)
print(f"  differenza massima per arco: {diff.max() if diff.nnz else 0:.2e}")
print(f"  archi con differenza > 1e-6: {int((diff > 1e-6).sum()) if diff.nnz else 0}")
ok = diff.nnz == 0 or float(diff.max()) < 1e-6
print(f"  >>> {'RIPRODUCE ESATTAMENTE' if ok else 'NON RIPRODUCE — la ricostruzione e\' sospetta'}")

# copertura della curatela: chi e' toccato dagli archi scritti a mano
for nome, K in (("tutti", K_all), ("solo pari (grafo)", K_gra)):
    toccati = np.asarray((K > 0).sum(1)).ravel() > 0
    print(f"  nodi toccati dalla curatela ({nome}): {int(toccati.sum()):,} ({100*toccati.mean():.1f}%)")
    print(f"     di cui serie {int((toccati & is_tv).sum()):,} · film {int((toccati & ~is_tv).sum()):,}")
print(f"\n({time.time()-t0:.0f}s)")
