"""bootstrap-test.py — IL CLASSIFICATORE SA COLLOCARE L'IGNOTO?

Prendo l'albero (3.238 foglie = pseudo-etichette). Addestro un k-NN su metadati -> foglia,
tenendo fuori il 20% dei titoli. Poi misuro l'accuratezza PER GRADO DI COPERTURA:
se sui titoli con pochi archi e' preciso quasi quanto su quelli con molti, allora il
bootstrap (propagare le etichette ai titoli isolati) ha senso.

Misura anche l'accuratezza GERARCHICA: al livello 1 (12 famiglie), livello 2, ecc.
Sbagliare la foglia ma azzeccare la famiglia non e' grave: l'utente vede comunque la zona giusta.
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import csr_matrix
import pandas as pd

ROOT = pathlib.Path(".").resolve()
ML, PQ = ROOT / ".cache" / "movielens", ROOT / ".cache" / "tmdb"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, Pb, tmdb, tipo, year = z["Pc"], z["Pb"], z["tmdb"], z["tipo"], z["year"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")

# --- l'albero: foglia per titolo + catena dei genitori ---
al = json.loads((ML / "albero.json").read_text(encoding="utf-8"))
nodi = {nd["id"]: nd for nd in al["nodi"]}
leaf_of = np.full(n, -1, np.int64)
for f in al["foglie"]:
    for k in f["members"]:
        r = row_of.get(k)
        if r is not None:
            leaf_of[r] = f["id"]
print(f"titoli con foglia: {(leaf_of >= 0).sum():,}/{n:,} · foglie {len(al['foglie']):,}")


def catena(nid):
    """dalla foglia alla radice: [leaf, parent, ..., root]"""
    out = []
    while nid != -1 and nid in nodi:
        out.append(nid)
        nid = nodi[nid]["parent"]
    return out


# livello di ogni foglia (per l'accuratezza gerarchica)
livello = {f["id"]: nodi[f["id"]]["level"] for f in al["foglie"]}

# --- features ---
def centra(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


_a = year.astype(float)
anno = np.where(np.isnan(_a), np.nanmedian(_a), _a)
FEAT = {
    "solo contenuto (Pc)": centra(Pc),
    "contenuto+comport (Pc+Pb)": np.hstack([centra(Pc), centra(Pb)]),
    "Pc+Pb+anno": np.hstack([centra(Pc), centra(Pb), (anno / 100.0)[:, None]]),
}

# --- grado nel grafo: quanti archi ha ogni titolo (la "copertura") ---
zz = np.load(ML / "leiden-graph.npz")
M = csr_matrix((zz["data"], zz["indices"], zz["indptr"]), shape=(n, n))
grado = np.asarray((M > 0).sum(1)).ravel()
print(f"grado: mediana {int(np.median(grado))} · 10%%ile {int(np.percentile(grado,10))} · 90%%ile {int(np.percentile(grado,90))}")

# --- split ---
rng = np.random.default_rng(5)
validi = np.where(leaf_of >= 0)[0]
perm = rng.permutation(len(validi))
n_test = len(validi) // 5
test_idx = validi[perm[:n_test]]
train_idx = validi[perm[n_test:]]
print(f"train {len(train_idx):,} · test {len(test_idx):,}")


def knn_leaf(X, k=10, B=2000):
    """k-NN sui metadati: per ogni test, la foglia maggioritaria fra i k vicini di train."""
    Xn = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)
    Xtr = Xn[train_idx]
    leaf_tr = leaf_of[train_idx]
    pred = np.full(len(test_idx), -1, np.int64)
    for i in range(0, len(test_idx), B):
        blk = test_idx[i:i + B]
        sim = Xn[blk] @ Xtr.T
        idx = np.argpartition(-sim, k, axis=1)[:, :k]
        for r in range(len(blk)):
            vic = leaf_tr[idx[r]]
            pred[i + r] = Counter(vic.tolist()).most_common(1)[0][0]
    return pred


def accuratezza(pred, nome):
    vero = leaf_of[test_idx]
    ok_leaf = pred == vero
    # gerarchica: la foglia predetta e la vera hanno lo stesso antenato a livello L?
    cat_vero = [set(catena(v)) for v in vero]
    ok_liv = {}
    for L in (1, 2, 3, 4):
        c = 0
        for i, v in enumerate(vero):
            # antenato a livello L della foglia vera
            av = [x for x in catena(v) if nodi[x]["level"] == L]
            ap = [x for x in catena(pred[i]) if nodi[x]["level"] == L]
            if av and ap and av[0] == ap[0]:
                c += 1
        ok_liv[L] = c / len(vero)
    print(f"\n  {nome}")
    print(f"    foglia esatta   {100*ok_leaf.mean():5.1f}%")
    for L in (1, 2, 3, 4):
        print(f"    stesso antenato L{L} {100*ok_liv[L]:5.1f}%")
    # per grado
    print(f"    per copertura:")
    g = grado[test_idx]
    for lo, hi, lab in ((0, 10, "0-10 archi"), (11, 30, "11-30"), (31, 80, "31-80"), (81, 10**9, "81+")):
        m = (g >= lo) & (g <= hi)
        if m.sum() < 20:
            continue
        print(f"      {lab:<12} foglia {100*ok_leaf[m].mean():5.1f}% · L1 {100*ok_liv[1]*0+100*np.mean([1 if ([x for x in catena(vero[i]) if nodi[x]['level']==1] or [None])[0] == ([x for x in catena(pred[i]) if nodi[x]['level']==1] or [None])[0] else 0 for i in np.where(m)[0]]):5.1f}%  ({m.sum()} titoli)")
    return ok_leaf.mean(), ok_liv


t0 = time.time()
for nome, X in FEAT.items():
    pred = knn_leaf(X, k=10)
    accuratezza(pred, nome)
print(f"\n({time.time()-t0:.0f}s)")
