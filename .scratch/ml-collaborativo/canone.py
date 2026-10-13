"""canone.py — L'UNICA IMPLEMENTAZIONE DEL GRAFO E DEI BANCHI.

Perche' esiste: i report 58-60 hanno rivelato che in giro c'erano DUE varianti del grafo —
`ottimizza-1.py`/`verifica-finale.py` normalizzavano ogni componente prima di mescolarla e
usavano il grado binario, gli script `rrf-*.py` mescolavano i pesi grezzi. Differenza sulla
camminata del metro curato: 11,18% contro 9,88%, cioe' piu' dell'errore del banco.

Qui c'e' una sola versione, quella CANONICA (quella che ha prodotto i numeri di testa:
prodotto 29,61/63,35/87,86 · curato 26,45/50,00/70,26), e tutte le misure passano di qui.

Scelte canoniche, dichiarate:
  * `correggi_hub` usa il grado BINARIO (quanti vicini, non quanto pesano) e NORMALIZZA la riga;
  * il mixing avviene fra componenti GIA' normalizzate (senza, un componente a peso 5 domina
    anche dove e' piu' rado);
  * la normalizzazione finale e' una sola, sulla somma.
"""
import glob, json, pathlib
import numpy as np
import pandas as pd
import scipy.sparse as sp

ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
GOLD = ROOT / ".scratch" / "ml-collaborativo" / "gold"
TK = ROOT / ".cache" / "trakt" / "users"


# ---------------------------------------------------------------- i titoli
def titoli():
    z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
    tmdb, tipo = z["tmdb"], z["tipo"]
    keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
    row_of = {k: r for r, k in enumerate(keys)}
    is_tv = (tipo == "tv")
    return keys, row_of, len(keys), is_tv


# ---------------------------------------------------------------- gli archi
def normalizza(A):
    A = A.tocsr().astype(np.float32)
    d = np.asarray(A.sum(1)).ravel()
    return sp.diags(1.0 / np.maximum(d, 1e-9)).dot(A).tocsr()


def correggi_hub(A, beta):
    """CANONICA: grado binario (quanti vicini) e normalizzazione della riga."""
    if beta <= 0:
        return A
    ind = np.asarray((A > 0).sum(0)).ravel().astype(np.float64)
    return normalizza(sp.csr_matrix(A.multiply((1.0 / np.maximum(ind, 1.0) ** beta)[None, :])))


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


def carica_csr(nome, n):
    q = np.load(ML / nome)
    return sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


class Componenti:
    """i k-NN degli spazi, cachati per k. Gli spazi vettoriali restano disponibili per i teacher."""

    def __init__(self, n):
        self.n = n
        self.CF_v = np.load(ML / "cf-spazio.npz")["Cf"]
        self.CFst_v = np.load(ML / "cf-studente.npz")["P"]
        self.Kc_v = np.load(ML / "spazio-pulito.npz")["P"]
        self._cache = {}
        self._fissi = None

    def _fissi_(self):
        if self._fissi is None:
            n = self.n
            self._fissi = {"B": carica_csr("boot-B.npz", n),
                           "T": carica_csr("boot-T.npz", n),
                           "K": carica_csr("boot-Kpari.npz", n)}
        return self._fissi

    def __call__(self, k):
        if k not in self._cache:
            C = {nome: topk_edges(V, k) for nome, V in
                 (("CF", self.CF_v), ("CFst", self.CFst_v), ("Kc", self.Kc_v))}
            C.update(self._fissi_())
            self._cache[k] = C
        return self._cache[k]

    def vettori_normalizzati(self):
        out = {}
        for nome, V in (("CF", self.CF_v), ("CFst", self.CFst_v), ("Kc", self.Kc_v)):
            out[nome] = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
        return out


def costruisci(C, pesi, wc, beta):
    """CANONICA: ogni componente corretta e normalizzata, poi mescolata, poi una normalizzazione."""
    tot = sum(pesi.values())
    M = None
    for nome, w in pesi.items():
        A = correggi_hub(C[nome], beta)
        pezzo = A * ((1 - wc) * w / tot)
        M = pezzo if M is None else M + pezzo
    return normalizza((M + wc * C["K"]).tocsr())


def rwr(M, E, alpha, iters=20):
    X = E.copy()
    for _ in range(iters):
        X = alpha * (M.T @ X) + (1 - alpha) * E
    return X


def ranghi(S, filtro=None):
    if filtro is not None:
        S = np.where(filtro[:, None], S, -1e30)
    R = np.empty(S.shape, np.int32)
    for j in range(S.shape[1]):
        R[np.argsort(-S[:, j]), j] = np.arange(S.shape[0])
    return R


def centra(P, is_tv):
    Q = P.astype(np.float32).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


# ---------------------------------------------------------------- i banchi
def banco_prodotto(row_of, quanti=500, parte="calibrazione"):
    """MovieLens: utenti con >=20 film, split 60/40 (seed 7). Disgiunti dagli archi CF."""
    links = pd.read_csv(ML / "ml-32m" / "links.csv")
    m2r = {}
    for mid, tid in zip(links["movieId"], links["tmdbId"]):
        if pd.isna(tid):
            continue
        r = row_of.get(f"movie:{int(tid)}")
        if r is not None:
            m2r[int(mid)] = r
    rr = pd.read_parquet(ML / "ratings-puliti.parquet")
    rr["row"] = rr.movieId.map(m2r)
    rr = rr[rr.row.notna()]
    rr["row"] = rr["row"].astype(np.int64)
    cnt = rr.groupby("userId").size()
    buoni = cnt[cnt >= 20].index.values
    SCELTI = np.random.default_rng(9).choice(buoni, size=2000, replace=False)
    utenti = SCELTI[:1000] if parte == "calibrazione" else SCELTI[1000:]
    sub = rr[rr.userId.isin(set(utenti.tolist()))]
    gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
    prof, oro = {}, {}
    r2 = np.random.default_rng(7)
    for u in utenti:
        righe = np.unique(gruppi[u])
        if len(righe) < 20:
            continue
        perm = r2.permutation(len(righe))
        t = int(0.6 * len(righe))
        prof[u] = righe[perm[:t]]
        oro[u] = set(righe[perm[t:]].tolist())
        if len(prof) >= quanti:
            break
    return prof, oro


def banco_curato(row_of):
    """i 1.002 legami cross-medium delle sorgenti a indice DISPARI (i pari sono nel grafo)."""
    d = json.loads((GOLD / "cross-merged.json").read_text(encoding="utf-8"))
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
    return SOGG, BERS, US, COL


def _leggi_trakt(percorso, chiave):
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
        if t:
            out.append(int(t))
    return out


def banco_trakt(row_of):
    """356 utenti con >=20 film e >=10 serie, split 60/40 (rng 13), per catalogo."""
    U = {}
    for f in sorted(glob.glob(str(TK / "movie-*.json"))):
        u = pathlib.Path(f).stem[6:]
        U[u] = {"film": _leggi_trakt(f, "movie") or [],
                "serie": _leggi_trakt(TK / f"show-{u}.json", "show") or []}

    def dividi(voci, rng, frazione=0.6):
        righe = np.array([row_of[f"{tp}:{int(tid)}"] for tp, tid in voci
                          if f"{tp}:{int(tid)}" in row_of], dtype=np.int64)
        if len(righe) == 0:
            return None, None
        righe = np.unique(righe)
        perm = rng.permutation(len(righe))
        t = int(frazione * len(righe))
        return righe[perm[:t]], set(righe[perm[t:]].tolist())

    rng = np.random.default_rng(13)
    casi = []
    for u in sorted(U):
        fm, sr = U[u]["film"], U[u]["serie"]
        if len(fm) < 20 or len(sr) < 10:
            continue
        pf, gf = dividi([("movie", t) for t in fm], rng)
        ps, gs = dividi([("tv", t) for t in sr], rng)
        if pf is None or ps is None or not gf or not gs:
            continue
        casi.append({"pf": pf, "gf": gf, "ps": ps, "gs": gs})
    return casi


# ---------------------------------------------------------------- le misure
def recall_curato(R, BERS, COL, NS=(10, 50, 100, 500, 2000)):
    rk = R[BERS, COL]
    return {N: 100 * float((rk < N).mean()) for N in NS}


def recall_film(R, US, PROF, ORO, IDX, NS=(10, 100, 500, 2000)):
    den = sum(len(ORO[u]) for u in US)
    out = {}
    for N in NS:
        hit = 0
        for j, u in enumerate(US):
            scelti = IDX[np.argpartition(R[IDX, j], N)[:N]]
            hit += sum(1 for x in scelti if int(x) in ORO[u])
        out[N] = 100 * hit / den
    return out


def recall_catalogo(R, gold_di, chiavi, filtro, NS=(10, 100, 500)):
    idx = np.where(filtro)[0]
    out = {}
    for N in NS:
        hit = den = 0
        for j, u in enumerate(chiavi):
            g = gold_di.get(u)
            if not g:
                continue
            den += len(g)
            scelti = idx[np.argsort(R[idx, j])[:N]]
            hit += sum(1 for x in scelti if int(x) in g)
        out[N] = 100 * hit / max(den, 1)
    return out


def stampa(nome, d, larghezza=46):
    print(f"  {nome:<{larghezza}} " + " · ".join(f"@{N} {v:6.2f}%" for N, v in d.items()), flush=True)
