"""rrf-curato-2.py — LA FUSIONE SUL METRO CURATO, CON TEACHER VERI E CON I CONTROLLI.

Il report 58 dava RRF 22,65% @10 sul metro curato (contro 11,18% della camminata sola). Ma il
teacher usato era `Cf` — lo spazio del comportamento, che copre 49.041 FILM e ha le 16.550 SERIE
tutte a zero. E le 249 sorgenti del gold curato sono TUTTE SERIE. Quindi il teacher era la
matrice nulla: `argsort` su tutti pari restituisce l'ordine di indice, cioe' una permutazione
FISSA identica per ogni sorgente. Non un esperto: un bias sistematico verso i nodi di indice
basso.

Qui si rifa' la misura con teacher che coprono davvero le serie, e con due CONTROLLI che devono
venire piatti:
   CONTROLLO 1: il teacher e' l'ordine di indice (esattamente l'artefatto del report 58)
   CONTROLLO 2: il teacher e' una permutazione casuale fissa
Se uno dei due controlli da' ~22%, il numero del report 58 era l'artefatto.
"""
import json, pathlib, time
import numpy as np
import scipy.sparse as sp

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
print(f"legami di test: {len(BERS):,} da {len(US)} sorgenti · serie: {int(is_tv[US].sum())} · film: {int((~is_tv[US]).sum())}")

K = 60
BETA = 0.50
WC = 0.60


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


print(f"componenti (k={K}) ...", flush=True)
CFst_v = np.load(ML / "cf-studente.npz")["P"]
Kc_v = np.load(ML / "spazio-pulito.npz")["P"]
CF = topk_edges(np.load(ML / "cf-spazio.npz")["Cf"], K)
CFst = topk_edges(CFst_v, K)
Kc = topk_edges(Kc_v, K)
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
    dd = np.asarray(M.sum(1)).ravel()
    return sp.diags(1.0 / np.maximum(dd, 1e-9)).dot(M).tocsr()


pesi = {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}
tot = sum(pesi.values())
COMP = {"CF": CF, "CFst": CFst, "Kc": Kc, "B": B, "T": Tm}
M = None
for nome, w in pesi.items():
    A = correggi_hub(COMP[nome], BETA)
    M = (A * ((1 - WC) * w / tot)) if M is None else M + A * ((1 - WC) * w / tot)
M = normalizza((M + WC * Kp).tocsr())

E = np.zeros((n, len(US)), np.float32)
E[US, np.arange(len(US))] = 1.0
print("camminata (alpha 0,70) ...", flush=True)
X = E.copy()
for _ in range(20):
    X = 0.70 * (M.T @ X) + 0.30 * E
X[US, np.arange(len(US))] = -1e9
print(f"  fatta ({time.time()-t0:.0f}s)", flush=True)


def ranghi(S):
    R = np.empty(S.shape, np.int32)
    for j in range(S.shape[1]):
        R[np.argsort(-S[:, j]), j] = np.arange(n)
    return R


def misura(R, nome):
    rk = R[BERS, COL]
    out = [100 * float((rk < N).mean()) for N in (10, 50, 100, 500, 2000)]
    print(f"  {nome:<44} " + " · ".join(f"@{N} {v:5.2f}%" for N, v in
                                        zip((10, 50, 100, 500, 2000), out)), flush=True)
    return out


def centra(P):
    Q = P.astype(np.float32).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


Rs = ranghi(X)
RIS = {}
print("")
print("=" * 100)
print("METRO CURATO — teacher veri, e i due controlli che devono venire piatti")
print("=" * 100)
RIS["camminata sola"] = misura(Rs, "camminata sola (riferimento)")

# --- i teacher VERI (coprono le serie) ---
Et = centra(Kc_v)
Es = centra(CFst_v)
Cf_v = np.load(ML / "cf-spazio.npz")["Cf"]
Ecf = Cf_v / (np.linalg.norm(Cf_v, axis=1, keepdims=True) + 1e-9)
Eadj = normalizza(B + B.T)

T_meta = Et @ Et[US].T
T_stud = Es @ Es[US].T
T_cf = Ecf @ Ecf[US].T
T_adj = np.asarray(Eadj[US].todense()).T
print(f"  (norma media dei teacher sulle sorgenti — CF dev'essere 0)")
print(f"    metadati {np.linalg.norm(T_meta,axis=0).mean():.4f} · CFst {np.linalg.norm(T_stud,axis=0).mean():.4f} "
      f"· CF {np.linalg.norm(T_cf,axis=0).mean():.4f} · co-visione {np.linalg.norm(T_adj,axis=0).mean():.4f}")

# --- i CONTROLLI (devono venire piatti) ---
R_ind = np.tile(np.arange(n, dtype=np.int32)[:, None], (1, len(US)))
rnd = np.random.default_rng(3)
R_rand = np.tile(rnd.permutation(n).astype(np.int32)[:, None], (1, len(US)))

for etichetta, T in (("metadati puliti", T_meta), ("CFst (pubblico previsto)", T_stud),
                     ("co-visione Travi", T_adj), ("CF (film soltanto)", T_cf)):
    R = ranghi(T)
    RIS[f"teacher {etichetta}"] = misura(R, f"teacher SOLO — {etichetta}")

print("")
print("  --- CONTROLLI: teacher senza informazione (devono venire piatti) ---")
RIS["ctrl indice"] = misura(R_ind, "CONTROLLO — teacher = ordine di indice")
RIS["ctrl casuale"] = misura(R_rand, "CONTROLLO — teacher = permutazione casuale")

print("")
print("  --- LE FUSIONI ---")
for etichetta, T in (("metadati", T_meta), ("CFst", T_stud), ("co-visione", T_adj),
                     ("CF (zero)", T_cf), ("INDICE (controllo)", R_ind.astype(np.float32)),
                     ("CASUALE (controllo)", R_rand.astype(np.float32))):
    R = ranghi(T) if T.dtype != np.int32 else T
    for k0 in (60, 3000):
        Rr = ranghi(3.0 / (k0 + Rs) + 0.5 / (k0 + R))
        RIS[f"RRF {etichetta} k{k0}"] = misura(Rr, f"RRF camminata+{etichetta} k={k0}")

print("")
print("=" * 100)
print("COSA DICE — il report 58 dava RRF 22,65% @10 · 39,72% @100")
print("=" * 100)
print(f"  camminata sola: @10 {RIS['camminata sola'][0]:.2f}% · @100 {RIS['camminata sola'][2]:.2f}%")
print(f"  CONTROLLO indice:   @10 {RIS['ctrl indice'][0]:.2f}% · @100 {RIS['ctrl indice'][2]:.2f}%")
print(f"  CONTROLLO casuale:  @10 {RIS['ctrl casuale'][0]:.2f}% · @100 {RIS['ctrl casuale'][2]:.2f}%")
veri = {k: v for k, v in RIS.items() if k.startswith("RRF") and "controllo" not in k.lower()
        and "INDICE" not in k and "CASUALE" not in k}
if veri:
    best = max(veri.items(), key=lambda kv: kv[1][0])
    print(f"  migliore con teacher VERO: {best[0]} → @10 {best[1][0]:.2f}% · @100 {best[1][2]:.2f}%")
print(f"\n({time.time()-t0:.0f}s)")
