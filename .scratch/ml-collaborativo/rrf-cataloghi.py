"""rrf-cataloghi.py — LA FUSIONE SUI DUE CATALOGHI.

Il report 59 ha mostrato che la fusione per ranghi (RRF) e' NEUTRA sul prodotto e RADDOPPIA il
@10 sul metro curato: una sola ricetta per tutto. Ma la misura sul prodotto era solo sul
CATALOGO FILM. Resta la domanda che decide se la ricetta e' davvero una: la fusione funziona
anche sul CATALOGO SERIE?

Il problema: CF copre 49.041 film e ZERO serie, quindi per un profilo di serie il teacher del
comportamento e' nullo. Va costruito via CFst (il pubblico previsto delle serie).

Banco: cronologie Trakt, 353 utenti con >=20 film e >=10 serie, split casuale 60/40 (rng 13),
recall misurato DENTRO il catalogo giusto. Protocollo identico a due-cataloghi-2.py.
"""
import glob, json, pathlib, time
import numpy as np
import scipy.sparse as sp

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
TK = ROOT / ".cache" / "trakt" / "users"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
NS = (10, 100, 500)
print(f"titoli: {n:,} · film: {int((~is_tv).sum()):,} · serie: {int(is_tv.sum()):,}")


def leggi(percorso, chiave):
    try:
        d = json.loads(pathlib.Path(percorso).read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(d, list):
        return None
    out = []
    for v in d:
        o = v.get(chiave) or {}
        t = (o.get("ids") or {}).get("tmdb")
        if not t:
            continue
        out.append(int(t))
    return out


UTENTI = {}
for f in sorted(glob.glob(str(TK / "movie-*.json"))):
    u = pathlib.Path(f).stem[6:]
    UTENTI[u] = {"film": leggi(f, "movie") or [], "serie": leggi(TK / f"show-{u}.json", "show") or []}


def dividi(voci, rng, frazione=0.6):
    """voci = lista di (tipo, id tmdb). Ritorna (profilo, oro) come righe del catalogo."""
    righe = np.array([row_of[f"{tp}:{int(tid)}"] for tp, tid in voci
                      if f"{tp}:{int(tid)}" in row_of], dtype=np.int64)
    if len(righe) == 0:
        return None, None
    righe = np.unique(righe)
    perm = rng.permutation(len(righe))
    t = int(frazione * len(righe))
    return righe[perm[:t]], set(righe[perm[t:]].tolist())


# --- il banco ---
rng = np.random.default_rng(13)
# le cronologie sono di film o di serie: le "voci" sono gli id tmdb, e il tipo lo sappiamo dal file
CASI = []
for u in sorted(UTENTI):
    fm, sr = UTENTI[u]["film"], UTENTI[u]["serie"]
    if len(fm) < 20 or len(sr) < 10:
        continue
    pf, gf = dividi([("movie", t) for t in fm], rng)
    ps, gs = dividi([("tv", t) for t in sr], rng)
    if pf is None or ps is None or len(gf) == 0 or len(gs) == 0:
        continue
    CASI.append((pf, gf, ps, gs))
print(f"utenti del banco: {len(CASI):,}")


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
Cf_v = np.load(ML / "cf-spazio.npz")["Cf"]
CF = topk_edges(Cf_v, K)
CFst_v = np.load(ML / "cf-studente.npz")["P"]
CFst = topk_edges(CFst_v, K)
Kc_v = np.load(ML / "spazio-pulito.npz")["P"]
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
print(f"grafo pronto ({time.time()-t0:.0f}s)", flush=True)


def attiva(semi_di, alpha, lotto=120):
    chiavi = list(semi_di)
    X = np.zeros((n, len(chiavi)), np.float32)
    for i in range(0, len(chiavi), lotto):
        ch = chiavi[i:i + lotto]
        E = np.zeros((n, len(ch)), np.float32)
        for j, u in enumerate(ch):
            E[semi_di[u], j] = 1.0
        Y = E.copy()
        for _ in range(20):
            Y = alpha * (M.T @ Y) + (1 - alpha) * E
        for j, u in enumerate(ch):
            Y[semi_di[u], j] = -1e9
        X[:, i:i + len(ch)] = Y
    return X, chiavi


def ranghi_cat(S, filtro):
    Sf = np.where(filtro[:, None], S, -1e30)
    R = np.empty(Sf.shape, np.int32)
    for j in range(Sf.shape[1]):
        R[np.argsort(-Sf[:, j]), j] = np.arange(n)
    return R


def recall(R, gold_di, chiavi, filtro, nome):
    out = []
    for N in NS:
        hit = den = 0
        for j, u in enumerate(chiavi):
            g = gold_di.get(u)
            if not g:
                continue
            den += len(g)
            ordine = np.argsort(R[filtro, j])[:N]
            scelti = np.where(filtro)[0][ordine]
            hit += sum(1 for x in scelti if int(x) in g)
        out.append(100 * hit / max(den, 1))
    print(f"  {nome:<46} " + " · ".join(f"@{N} {v:6.2f}%" for N, v in zip(NS, out)), flush=True)
    return out


# --- i quattro casi ---
PF = {i: c[0] for i, c in enumerate(CASI)}
GF = {i: c[1] for i, c in enumerate(CASI)}
PS = {i: c[2] for i, c in enumerate(CASI)}
GS = {i: c[3] for i, c in enumerate(CASI)}

for alpha in (0.30, 0.70):
    print("")
    print("=" * 108)
    print(f"FUSIONE SUI DUE CATALOGHI — alpha {alpha}")
    print("=" * 108)
    Xf, chf = attiva(PF, alpha)
    Xs, chs = attiva(PS, alpha)
    print(f"  camminate fatte ({time.time()-t0:.0f}s)", flush=True)

    # teacher: centroide del profilo, nei tre spazi
    def teacher(V, semi_di, chiavi):
        T = np.zeros((n, len(chiavi)), np.float32)
        for j, u in enumerate(chiavi):
            T[:, j] = V @ V[semi_di[u]].T.mean(1)
        return T

    Tf_cf = teacher(Cf_v, PF, chf)
    Tf_kc = teacher(Kc_v, PF, chf)
    Ts_st = teacher(CFst_v, PS, chs)
    Ts_kc = teacher(Kc_v, PS, chs)
    Tf_st = teacher(CFst_v, PF, chf)
    Ts_cf = teacher(Cf_v, PS, chs)

    for etichetta, (X, ch, cat, gold, T1, T2) in {
        "CATALOGO FILM (semi film)": (Xf, chf, ~is_tv, GF, Tf_cf, Tf_kc),
        "CATALOGO SERIE (semi serie)": (Xs, chs, is_tv, GS, Ts_st, Ts_kc),
        "CATALOGO SERIE (semi FILM)": (Xf, chf, is_tv, GS, Tf_st, Tf_kc),
        "CATALOGO FILM (semi serie)": (Xs, chs, ~is_tv, GF, Ts_cf, Ts_kc),
    }.items():
        print("")
        print(f"  --- {etichetta} ---")
        Rs = ranghi_cat(X, cat)
        recall(Rs, gold, ch, cat, "camminata sola")
        R1 = ranghi_cat(T1, cat)
        recall(R1, gold, ch, cat, "teacher comportamento/CFst SOLO")
        R2 = ranghi_cat(T2, cat)
        recall(R2, gold, ch, cat, "teacher metadati SOLO")
        for k0 in (60, 3000):
            Rr = ranghi_cat(3.0 / (k0 + Rs) + 0.5 / (k0 + R1), cat)
            recall(Rr, gold, ch, cat, f"RRF camminata+comport. k={k0}")
            Rr2 = ranghi_cat(3.0 / (k0 + Rs) + 0.5 / (k0 + R2), cat)
            recall(Rr2, gold, ch, cat, f"RRF camminata+metadati k={k0}")

print(f"\n({time.time()-t0:.0f}s)")
