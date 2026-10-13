"""nitidezza.py — COSA FA BRILLARE UN ITEM IN CIMA? (via A)

Il filone OCEAN ha lasciato questa domanda aperta: «quali elementi devono brillare — va misurata
la nitidezza della cima, oggi nessuno la misura». E la sessione di oggi ha mostrato che e' LA
domanda: tutto il sistema e' un ottimo recuperatore e un pessimo discriminatore.

Qui NON si addestra un modello (report 34: la classe del ranker e' chiusa, impara la popolarita').
Si MISURA: per ogni candidato che l'attivazione mette in alto, si guarda quali caratteristiche
separano i colpiti dai non colpiti. Decili, non GBM.

Disegno: 1.500 utenti MovieLens reali, split 60/40, attivazione dai film del profilo sul grafo di
retrieval. Per i primi 500 candidati di ogni utente (escluso il profilo) si registra:
    colpito?  il candidato e' nell'oro dell'utente
    + 8 caratteristiche, calcolate senza guardare l'oro
Poi: tasso di colpimento per decile di ogni caratteristica. Se una caratteristica separa, quella
e' "cosa deve brillare". Se nessuna separa, la testa non e' aggiustabile con questi dati.
"""
import json, pathlib, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
NOME = "albero.json"
N_UTENTI = 1500
TOPK = 500

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo, votes, year = z["Pc"], z["tmdb"], z["tipo"], z["votes"], z["year"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
Q = Pc.astype(np.float64).copy()
Q[~is_tv] -= Pc[~is_tv].mean(0)
Q[is_tv] -= Pc[is_tv].mean(0)
Pcn = Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
_a = year.astype(float)
anno = np.where(np.isnan(_a), np.nanmedian(_a), _a)


def carica(nome):
    q = np.load(ML / nome)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


# --- struttura e grafo ---
al = json.loads((ML / NOME).read_text(encoding="utf-8"))
foglia = np.full(n, -1, np.int64)
for i, f in enumerate(al["foglie"]):
    for k in f["members"]:
        r = row_of.get(k)
        if r is not None:
            foglia[r] = f["id"]
dim_foglia = np.zeros(int(foglia.max()) + 1, np.int64)
for f in al["foglie"]:
    dim_foglia[f["id"]] = f["size"]
dim_di = dim_foglia[foglia]

C, B, Tm, K = carica("boot-C.npz"), carica("boot-B.npz"), carica("boot-T.npz"), carica("boot-Kpari.npz")
WT, WC = 0.25, 0.60
M = normalizza((1 - WC) * (1 - WT) * (0.5 * C + 0.5 * B) + (1 - WC) * WT * Tm + WC * K)
Kall = carica("boot-Kall.npz")
del C, B, Tm, K
# centroidi delle foglie: "quanto e' tipico questo candidato nella SUA foglia"
ids_ = np.array(sorted(set(foglia.tolist())))
pos_ = {int(c): i for i, c in enumerate(ids_)}
CENM = np.zeros((len(ids_), Pcn.shape[1]))
for c in ids_:
    m = np.where(foglia == c)[0]
    v = Pcn[m].mean(0)
    CENM[pos_[int(c)]] = v / (np.linalg.norm(v) + 1e-9)
foglia_pos = np.array([pos_[int(c)] for c in foglia])
grado = np.asarray((M > 0).sum(1)).ravel()
pct_pop = (np.argsort(np.argsort(votes)) / (n - 1.0)) * 100
n_curati = np.asarray((Kall > 0).sum(1)).ravel()
print(f"grafo + struttura pronti ({time.time()-t0:.0f}s)")

# --- utenti ---
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
print(f"utenti: {len(US):,} · oro medio {np.mean([len(v) for v in oro_di.values()]):.0f}")

# --- attivazione + caratteristiche ---
FEAT = ["rank", "popolarita", "cos_profilo", "dim_foglia", "foglia_toccata",
        "grado", "anno_diff", "curati", "coerenza_foglia"]
righe = []
BATCH = 250
for a in range(0, len(US), BATCH):
    b = min(a + BATCH, len(US))
    Es = np.zeros((n, b - a), np.float32)
    for j, u in enumerate(US[a:b]):
        Es[prof_di[u], j] = 1.0
    X = Es.copy()
    for _ in range(20):
        X = 0.30 * (M.T @ X) + 0.70 * Es
    for j, u in enumerate(US[a:b]):
        X[prof_di[u], j] = -1e9
    for j, u in enumerate(US[a:b]):
        col = X[:, j]
        idx = np.argpartition(-col, TOPK)[:TOPK]
        idx = idx[np.argsort(-col[idx])]
        prof = prof_di[u]
        oro = oro_di[u]
        cent = Pcn[prof].sum(0)
        cent = cent / (np.linalg.norm(cent) + 1e-9)
        cos_p = Pcn[idx] @ cent
        occ = np.bincount(foglia[prof], minlength=len(dim_foglia))
        anno_p = np.median(anno[prof])
        cosf = np.einsum("ij,ij->i", Pcn[idx], CENM[foglia_pos[idx]])
        for r_i, k in enumerate(idx):
            righe.append((1 if k in oro else 0, r_i, pct_pop[k], float(cos_p[r_i]),
                          dim_di[k], int(occ[foglia[k]]), grado[k],
                          abs(anno[k] - anno_p), n_curati[k], float(cosf[r_i])))
    print(f"  blocco {a}-{b} ({time.time()-t0:.0f}s)")

DF = pd.DataFrame(righe, columns=["colpito"] + FEAT)
DF.to_parquet(ML / "nitidezza.parquet")
print(f"coppie: {len(DF):,} · colpiti: {int(DF.colpito.sum()):,} ({100*DF.colpito.mean():.2f}%)")

# coerenza della foglia: quanto e' tipico il candidato nella sua foglia
print("")
print("=" * 100)
print("TASSO DI COLPI PER POSIZIONE (l'oro e' nel top-N?)")
print("=" * 100)
for lo, hi in ((0, 10), (10, 50), (50, 100), (100, 250), (250, 500)):
    m = (DF["rank"] >= lo) & (DF["rank"] < hi)
    print(f"  posizione {lo:>3}-{hi:<3}: colpi {100*DF.colpito[m].mean():5.2f}%  ({int(m.sum()):,} coppie)")

print("")
print("=" * 100)
print("COSA SEPARA I COLPI? tasso di colpimento per decile — SOLO nel top-500")
print("=" * 100)
sub = DF
print(f"{'caratteristica':<18} " + " ".join(f"{('D'+str(i+1)):>6}" for i in range(10)) + f" {'max/min':>8}")
for f in FEAT:
    if f == "rank":
        continue
    q = pd.qcut(sub[f], 10, labels=False, duplicates="drop")
    tas = [100 * sub.colpito[q == i].mean() for i in range(int(q.max()) + 1) if (q == i).sum() > 0]
    if not tas:
        continue
    print(f"{f:<18} " + " ".join(f"{t:5.2f}%" for t in tas) + f" {max(tas)/max(min(tas),1e-9):>7.1f}x")

print("")
print("  CONTROLLO — e nel solo top-10? (dove si giudica la qualita')")
t10 = DF[DF["rank"] < 10]
print(f"{'caratteristica':<18} " + " ".join(f"{('D'+str(i+1)):>6}" for i in range(10)))
for f in ("popolarita", "cos_profilo", "dim_foglia", "grado", "curati"):
    q = pd.qcut(DF[f], 10, labels=False, duplicates="drop")
    tas = []
    for i in range(int(q.max()) + 1):
        m = (DF["rank"] < 10) & (q == i)
        if m.sum() > 0:
            tas.append(100 * DF.colpito[m].mean())
    if tas:
        print(f"{f:<18} " + " ".join(f"{t:5.2f}%" for t in tas))
print(f"\n({time.time()-t0:.0f}s)")
