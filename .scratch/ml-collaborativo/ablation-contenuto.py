"""ablation-contenuto.py — (A) DIAGNOSTICA: da dove viene la struttura?
(B) CAMPIONE CASUALE di 20 cluster da leggere, per giudicare a occhio.

ATTENZIONE ALL'INTERPRETAZIONE (punto dell'utente): l'ablation misura la NECESSITA' del contenuto,
non la QUALITA' dei cluster. Se i cluster svaniscono senza il contenuto, significa che il contenuto
e' portante - non che i cluster fossero cattivi. E le keyword sono la descrizione semantica: se e'
il grafo semantico a reggere, e' un fatto sul meccanismo, non un difetto.
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import csr_matrix
import igraph as ig
import leidenalg as la
import pandas as pd

ROOT = pathlib.Path(".").resolve()
ML, PQ = ROOT / ".cache" / "movielens", ROOT / ".cache" / "tmdb"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
n = len(keys)
is_tv = (tipo == "tv")

TIT, GEN = {}, {}
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "genres"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "genres"])
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t, gn in zip(df["id"], df[col], df["genres"]):
        k = f"{typ}:{int(i)}"
        TIT[k] = str(t)
        try:
            g0 = json.loads(gn) if isinstance(gn, str) else gn
        except Exception:
            g0 = []
        GEN[k] = (g0[0].get("name", "?") if g0 and isinstance(g0[0], dict) else (str(g0[0]) if g0 else "?"))


def nome(k):
    return f"{TIT.get(k,'?')} ({'S' if k.startswith('tv:') else 'F'})"


zt = np.load(ML / "temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n:
    T = T.T
TEMA = [str(x) for x in zt["keys"]]
tema_arg = np.argmax(T, axis=1) if T.shape[0] == n else np.zeros(n, int)

zz = np.load(ML / "diagnosi-grafi.npz")
EC = csr_matrix((zz["dc"], zz["ic"], zz["pc"]), shape=(n, n))
EB = csr_matrix((zz["db"], zz["ib"], zz["pb"]), shape=(n, n))
ET = csr_matrix((zz["dt"], zz["it"], zz["pt"]), shape=(n, n))
EK = csr_matrix((zz["dk"], zz["ik"], zz["pk"]), shape=(n, n))


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


def clusterizza(M, res, seed=42):
    coo = M.tocoo()
    mask = coo.row < coo.col
    g = ig.Graph(n=n, edges=list(zip(coo.row[mask].tolist(), coo.col[mask].tolist())), directed=False)
    g.es["weight"] = coo.data[mask].tolist()
    part = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                             resolution_parameter=res, seed=seed)
    return np.array(part.membership)


def analizza(lab, tipi_disponibili, etichetta):
    sizes = np.bincount(lab)
    righe = []
    for c in range(len(sizes)):
        mem = np.where(lab == c)[0]
        if len(mem) < 5:
            continue
        lifts = {}
        for k in tipi_disponibili:
            A = {"C": EC, "B": EB, "T": ET, "K": EK}[k]
            sA = A[mem][:, mem].tocoo()
            msk = sA.row < sA.col
            dentro = int(msk.sum())
            atteso = A.nnz * (len(mem) / n) ** 2 / 2
            lifts[k] = dentro / max(1e-9, atteso)
        n_tipi = sum(1 for v in lifts.values() if v > 1.0)
        temi = Counter(tema_arg[i] for i in mem)
        gen = Counter(GEN.get(keys[i], "?") for i in mem)
        righe.append(dict(c=c, size=len(mem), n_tipi=n_tipi, lifts=lifts,
                          tema_q=temi.most_common(1)[0][1] / len(mem),
                          gen_q=gen.most_common(1)[0][1] / len(mem), mem=mem))
    dist = Counter(r["n_tipi"] for r in righe)
    print(f"\n### {etichetta} — {len(sizes):,} cluster ({len(righe)} con >=5) ###")
    print("   tipi concordanti: " + " · ".join(
        f"{k}/{len(tipi_disponibili)}: {dist.get(k,0)} ({100*dist.get(k,0)/len(righe):.0f}%)"
        for k in range(len(tipi_disponibili), -1, -1)))
    print(f"   purezza tema media {100*np.mean([r['tema_q'] for r in righe]):.0f}% · "
          f"genere media {100*np.mean([r['gen_q'] for r in righe]):.0f}%")
    return righe


t0 = time.time()
# --- (A) con il contenuto, e senza ---
M_full = (normalizza(EC) + normalizza(EB) + normalizza(ET) + 6.0 * normalizza(EK)).tocsr()
M_full.sum_duplicates(); M_full = (M_full + M_full.T) * 0.5
M_noc = (normalizza(EB) + normalizza(ET) + 6.0 * normalizza(EK)).tocsr()
M_noc.sum_duplicates(); M_noc = (M_noc + M_noc.T) * 0.5
print(f"grafi pronti ({time.time()-t0:.0f}s): con contenuto {M_full.nnz:,} archi · senza {M_noc.nnz:,}")

res = 100.0
lab_full = clusterizza(M_full, res)
righe_full = analizza(lab_full, "CBTK", "CON IL CONTENUTO (4 tipi)")

lab_noc = clusterizza(M_noc, res)
righe_noc = analizza(lab_noc, "BTK", "SENZA IL CONTENUTO (3 tipi)")

# --- (B) campione casuale di 20 cluster da leggere (dal grafo completo) ---
print("")
print("=" * 100)
print("CAMPIONE CASUALE DI 20 CLUSTER (dal grafo completo, risoluzione 100) — da leggere, non da misurare")
print("=" * 100)
rng = np.random.default_rng(11)
tutti = []
sizes = np.bincount(lab_full)
for c in range(len(sizes)):
    mem = np.where(lab_full == c)[0]
    if len(mem) >= 5:
        tutti.append(c)
scelti = sorted(rng.choice(len(tutti), 20, replace=False).tolist())
for i, idx in enumerate(scelti, 1):
    c = tutti[idx]
    mem = np.where(lab_full == c)[0]
    temi = Counter(TEMA[tema_arg[j]] for j in mem)
    gen = Counter(GEN.get(keys[j], "?") for j in mem)
    lifts = {}
    for k in "CBTK":
        A = {"C": EC, "B": EB, "T": ET, "K": EK}[k]
        sA = A[mem][:, mem].tocoo()
        msk = sA.row < sA.col
        atteso = A.nnz * (len(mem) / n) ** 2 / 2
        lifts[k] = int(msk.sum()) / max(1e-9, atteso)
    n_tipi = sum(1 for v in lifts.values() if v > 1.0)
    print(f"\n--- {i}. cluster {c} · {len(mem)} titoli "
          f"({int(is_tv[mem].sum())} serie / {int((~is_tv[mem]).sum())} film) · {n_tipi}/4 tipi ---")
    print(f"    temi:   {', '.join(f'{t}({v})' for t, v in temi.most_common(3))}")
    print(f"    generi: {', '.join(f'{g}({v})' for g, v in gen.most_common(3))}")
    print(f"    lift:   " + " ".join(f"{k}:{v:.1f}" for k, v in lifts.items()))
    print(f"    titoli: {', '.join(nome(keys[j]) for j in mem[:14])}")
print(f"\n({time.time()-t0:.0f}s)")
