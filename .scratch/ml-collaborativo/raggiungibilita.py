"""raggiungibilita.py — I SET COERENTI VENGONO RAGGIUNTI DALL'ATTIVAZIONE?

L'ipotesi dell'utente: se le foglie piccole sono coerenti (lo sono: 0,65-0,71 contro 0,004
del caso) e la loro co-occorrenza e' bassa, allora il problema NON e' la qualita' degli
insiemi ma la RAGGIUNGIBILITA' — cioe' l'attivazione.

Test: utenti veri MovieLens. Metta' cronologia = semi (il profilo), l'altra meta' = oro.
Spreading dai semi sul grafo di retrieval. Per ogni film d'oro si guarda il RANGO.
Poi si spezza il risultato per la foglia in cui il film d'oro sta: piccola/coerente o
grande/lasca? Se il recall e' lo stesso, la raggiungibilita' non e' il problema.

Protocollo (report 41): curatela dal solo PARI, grafo di retrieval, alpha 0,7, 20 iterazioni.
I film curiosi: la domanda e' "cosa guardo dopo", quindi split CASUALE.
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
NOME = sys.argv[1] if len(sys.argv) > 1 else "albero.json"
N_UTENTI = int(sys.argv[2]) if len(sys.argv) > 2 else 2000

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")


def carica(nome):
    q = np.load(ML / nome)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


C, B, Tm, K = carica("boot-C.npz"), carica("boot-B.npz"), carica("boot-T.npz"), carica("boot-Kpari.npz")
WT, WC = 0.25, 0.60      # 0.60 = il peso della curatela ottimo per il caso PRODOTTO (report 41)
ALPHA = 0.3              # misurato in chk2: alpha basso batte alpha alto sul caso prodotto
M = normalizza((1 - WC) * (1 - WT) * (0.5 * C + 0.5 * B) + (1 - WC) * WT * Tm + WC * K)
del C, B, Tm, K
print(f"grafo di retrieval pronto (curatela {WC}, alpha {ALPHA}) ({time.time()-t0:.0f}s)")

# --- foglie: dimensione e coerenza (dai risultati gia' calcolati in coerenza-foglie.py) ---
al = json.loads((ML / NOME).read_text(encoding="utf-8"))
foglia = np.full(n, -1, np.int64)
for i, f in enumerate(al["foglie"]):
    for k in f["members"]:
        r = row_of.get(k)
        if r is not None:
            foglia[r] = i
h = len(al["foglie"])
dim = np.bincount(foglia[foglia >= 0], minlength=h)
Pc = z["Pc"]
Q = Pc.astype(np.float64).copy()
Q[~is_tv] -= Pc[~is_tv].mean(0)
Q[is_tv] -= Pc[is_tv].mean(0)
Pcn = Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
coer = np.full(h, np.nan)
for i in range(h):
    mem = np.where(foglia == i)[0]
    if len(mem) > 1:
        G = Pcn[mem] @ Pcn[mem].T
        coer[i] = (G.sum() - np.trace(G)) / (len(mem) * (len(mem) - 1))
print(f"foglie: {h:,} · coerenza mediana {np.nanmedian(coer):.3f}")

# --- utenti veri ---
links = pd.read_csv(ML / "ml-32m" / "links.csv")
ml2row = {}
for mid, tid in zip(links["movieId"], links["tmdbId"]):
    if pd.isna(tid):
        continue
    r = row_of.get(f"movie:{int(tid)}")
    if r is not None:
        ml2row[int(mid)] = r
rr = pd.read_parquet(ML / "ratings-puliti.parquet")
rr["row"] = rr["movieId"].map(ml2row)
rr = rr.dropna(subset=["row"])
rr["row"] = rr["row"].astype(np.int64)
cnt = rr.groupby("userId").size()
buoni = cnt[cnt >= 20].index.values
rng = np.random.default_rng(9)
scelti = rng.choice(buoni, size=min(N_UTENTI, len(buoni)), replace=False)
print(f"utenti con >=20 titoli: {len(buoni):,} · ne uso {len(scelti):,}")
sub = rr[rr.userId.isin(set(scelti))]
gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
print(f"  ({time.time()-t0:.0f}s)")

# --- spreading a blocchi ---
SOGG, ORO, PROF = [], [], []
prof_di = {}
for j, u in enumerate(scelti):
    righe = np.unique(gruppi[u])
    if len(righe) < 20:
        continue
    perm = rng.permutation(len(righe))
    taglio = int(0.6 * len(righe))
    prof = righe[perm[:taglio]]
    oro = righe[perm[taglio:]]
    prof_di[u] = prof
    for f in oro:
        SOGG.append(u)
        ORO.append(f)
SOGG, ORO = np.array(SOGG), np.array(ORO)
US = np.array(list(prof_di.keys()))
col_of = {int(u): i for i, u in enumerate(US)}
COL = np.array([col_of[int(x)] for x in SOGG])
E = np.zeros((n, len(US)), np.float32)
for u, col in col_of.items():
    E[prof_di[u], col] = 1.0
# NESSuna normalizzazione per riga: quella peserebbe un film per quante ALTRE persone lo hanno.
# Ogni colonna e' il profilo di un utente, con i suoi film a peso 1.
print(f"semi: {len(US):,} profili · oro: {len(ORO):,} legami · "
      f"profilo medio {np.mean([len(v) for v in prof_di.values()]):.0f} film")

RANK = np.empty((len(ORO),), np.int32)
BATCH = 250
for a in range(0, len(US), BATCH):
    b = min(a + BATCH, len(US))
    Es = E[:, a:b]
    X = Es.copy()
    for _ in range(20):
        X = ALPHA * (M.T @ X) + (1 - ALPHA) * Es
    # IL PROFILO NON E' UNA RISPOSTA: senza questo mascheramento il top-10 e' pieno
    # dei film che l'utente ha gia' visto, e ogni misura viene 0.
    for j, u in enumerate(US[a:b]):
        X[prof_di[u], j] = -1e9
    for j in range(b - a):
        r = np.empty(n, np.int32)
        r[np.argsort(-X[:, j])] = np.arange(n)
        m = COL == (a + j)          # SOLO la colonna j: prima mascheraro tutto il blocco
        RANK[m] = r[ORO[m]]
    print(f"  blocco {a}-{b} fatto ({time.time()-t0:.0f}s)")

# --- spezzare il risultato per la foglia del film d'oro ---
fg = foglia[ORO]
ok = fg >= 0
fg, rk = fg[ok], RANK[ok]
d_oro, c_oro = dim[fg], coer[fg]
print("")
print("=" * 100)
print(f"SINTESI «{NOME}» — tutti i {len(rk):,} legami d'oro, senza spezzare per foglia")
print("  " + " · ".join(f"@{N} {100*float((rk<N).mean()):.2f}%" for N in (10, 50, 100, 500)))
print(f"CASO UNIFORME: @10 {100*10/n:.3f}% · @100 {100*100/n:.3f}%   "
      f"| CONTROLLO POPOLARITA' (i 10 titoli piu' noti del catalogo)")
pop = z["votes"].astype(float)
rp = np.argsort(-pop)
rkp = np.empty(n, np.int32)
rkp[rp] = np.arange(n)
print(f"popolarita': @10 {100*float((rkp[ORO]<10).mean()):.2f}% · @50 {100*float((rkp[ORO]<50).mean()):.2f}% "
      f"· @100 {100*float((rkp[ORO]<100).mean()):.2f}%")
print("")
print(f"{'la foglia del film nascosto è…':<42} {'legami':>8} " + " ".join(f"{('@'+str(N)):>7}" for N in (10, 50, 100, 500)))
print("=" * 100)
QUAD = (("piccola (<=20)", d_oro <= 20),
        ("media (21-40)", (d_oro > 20) & (d_oro <= 40)),
        ("grande (41+)", d_oro > 40))
for lab, m in QUAD:
    if m.sum() == 0:
        continue
    print(f"{lab:<42} {int(m.sum()):>8} " + " ".join(
        f"{100*float((rk[m]<N).mean()):6.2f}%" for N in (10, 50, 100, 500)))

print("")
med_c = np.nanmedian(c_oro)
for lab, m in (("coerenti (sopra la mediana)", c_oro >= med_c),
               ("lasche (sotto la mediana)", c_oro < med_c)):
    if m.sum() == 0:
        continue
    print(f"{lab:<42} {int(m.sum()):>8} " + " ".join(
        f"{100*float((rk[m]<N).mean()):6.2f}%" for N in (10, 50, 100, 500)))

print("")
print("IL CONFRONTO CHE CONTA — coerenti+piccole contro lasche+grandi")
for lab, m in (("coerenti E piccole", (c_oro >= med_c) & (d_oro <= 20)),
               ("coerenti E grandi", (c_oro >= med_c) & (d_oro > 40)),
               ("lasche E piccole", (c_oro < med_c) & (d_oro <= 20)),
               ("lasche E grandi", (c_oro < med_c) & (d_oro > 40))):
    if m.sum() == 0:
        continue
    print(f"  {lab:<24} {int(m.sum()):>7} legami · @100 {100*float((rk[m]<100).mean()):5.2f}%"
          f" · @500 {100*float((rk[m]<500).mean()):5.2f}%")
print(f"\n({time.time()-t0:.0f}s)")
