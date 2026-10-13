"""due-cataloghi-2.py — LA MISURA GIUSTA: UN RECALL PER CATALOGO.

Su Stremio i cataloghi sono due, separati. Quindi:
  CATALOGO FILM   -> il top-N fra i FILM,   gold = i film nascosti dell'utente
  CATALOGO SERIE  -> il top-N fra le SERIE, gold = le serie nascoste dell'utente
e il caso che interessa di piu':
  profilo di FILM -> CATALOGO SERIE        (suggerire serie a chi guarda film)

E la domanda mai posta: `CFst` (lo studente metadati->comportamento, che il report 49 aveva
escluso perche' "diluisce" sul lato film) aiuta il CATALOGO SERIE? Era l'unico modo di dare
alle serie un pubblico.

Grafo 1  CF  + Kc + B + T + K      (la ricetta del report 49)
Grafo 2  CF  + CFst + Kc + B + T + K
Grafo 3       CFst + Kc + B + T + K  (senza comportamento sui film: solo il pubblico previsto)
"""
import glob, json, pathlib, time
import numpy as np
from scipy.sparse import csr_matrix, coo_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
TK = ROOT / ".cache" / "trakt" / "users"
NS = (10, 100, 500)

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


def carica(nm):
    q = np.load(ML / nm)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


def topk_edges(V, k, min_sim=0.05, B=1000):
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


CF = topk_edges(np.load(ML / "cf-spazio.npz")["Cf"], 15)
CFst = topk_edges(np.load(ML / "cf-studente.npz")["P"], 15)
Kc = topk_edges(np.load(ML / "spazio-pulito.npz")["P"], 15)
B = carica("boot-B.npz")
Tm = carica("boot-T.npz")
K = carica("boot-Kpari.npz")
print(f"componenti pronti ({time.time()-t0:.0f}s)")


def comp(*parti):
    w = 0.40 / len(parti)
    return normalizza((sum(w * p for p in parti) + 0.60 * K).tocsr())


GRAFI = {
    "CF + Kc + B + T + K (report 49)": comp(CF, Kc, B, Tm),
    "CF + CFst + Kc + B + T + K": comp(CF, CFst, Kc, B, Tm),
    "solo CFst + Kc + B + T + K": comp(CFst, Kc, B, Tm),
}
print(f"grafi pronti ({time.time()-t0:.0f}s)")

# --- le cronologie Trakt ---
def leggi(percorso, chiave):
    try:
        d = json.loads(pathlib.Path(percorso).read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(d, list):
        return []
    out = []
    for v in d:
        tt = ((v.get(chiave) or {}).get("ids") or {}).get("tmdb")
        if not tt:
            continue
        k = f"{'movie' if chiave == 'movie' else 'tv'}:{int(tt)}"
        r = row_of.get(k)
        if r is not None:
            out.append((r, str(v.get("last_watched_at") or "")))
    return out


def dividi(voci, rng, frazione=0.6):
    """split CASUALE (confrontabile con MovieLens). Ritorna (profilo, oro)."""
    if not voci:
        return np.array([], np.int64), set()
    perm = rng.permutation(len(voci))
    t = int(frazione * len(voci))
    prof = np.array([voci[i][0] for i in perm[:t]], np.int64)
    oro = set(voci[i][0] for i in perm[t:])
    return prof, oro


UTENTI = {}
for f in sorted(glob.glob(str(TK / "movie-*.json"))):
    u = pathlib.Path(f).stem[6:]
    fm = leggi(f, "movie")
    sr = leggi(TK / f"show-{u}.json", "show")
    if len(fm) >= 20 and len(sr) >= 10:
        UTENTI[u] = (fm, sr)
print(f"utenti con film >=20 e serie >=10: {len(UTENTI):,} ({time.time()-t0:.0f}s)")

rng = np.random.default_rng(13)
dati = {}
for u, (fm, sr) in UTENTI.items():
    pf, gfare = dividi(fm, rng)
    ps, gser = dividi(sr, rng)
    if len(pf) == 0 or len(ps) == 0:
        continue
    dati[u] = {"pf": pf, "gf": gfare, "ps": ps, "gs": gser}
US = np.array(list(dati.keys()))
print(f"valutabili: {len(US):,} · film d'oro {sum(len(v['gf']) for v in dati.values()):,} · "
      f"serie d'oro {sum(len(v['gs']) for v in dati.values()):,} ({time.time()-t0:.0f}s)")


def attiva(M, semi_di, lotto=120):
    """attivazione con i semi indicati per utente; ritorna la matrice dei ranghi (n x utenti)"""
    R = np.empty((n, len(US)), np.int32)
    for a in range(0, len(US), lotto):
        b = min(a + lotto, len(US))
        E = np.zeros((n, b - a), np.float32)
        for j, u in enumerate(US[a:b]):
            E[semi_di[u], j] = 1.0
        X = E.copy()
        for _ in range(20):
            X = 0.30 * (M.T @ X) + 0.70 * E
        for j, u in enumerate(US[a:b]):
            X[semi_di[u], j] = -1e9
        for j in range(b - a):
            R[np.argsort(-X[:, j]), a + j] = np.arange(n)
        del X, E
    return R


def recall_catalogo(R, gold_di, filtro, NMAX=500):
    """recall DENTRO un catalogo: si prendono i primi N NODI DEL CATALOGO (per rango)"""
    idx = np.where(filtro)[0]
    tot = sum(len(gold_di[u]) for u in US)
    hit = {N: 0 for N in NS}
    for j, u in enumerate(US):
        sub = R[idx, j]
        pos = np.argpartition(sub, NMAX)[:NMAX]
        pos = pos[np.argsort(sub[pos])]
        g = gold_di[u]
        colpiti = np.fromiter((1 if int(idx[p]) in g else 0 for p in pos), np.int8, len(pos))
        for N in NS:
            hit[N] += int(colpiti[:N].sum())
    return {N: 100 * hit[N] / max(tot, 1) for N in NS}


RIS = {}
for nome, M in GRAFI.items():
    print(f"\n  grafo «{nome}»...", flush=True)
    Rf = attiva(M, {u: dati[u]["pf"] for u in US})       # semi = FILM
    Rs = attiva(M, {u: dati[u]["ps"] for u in US})       # semi = SERIE
    gf = {u: dati[u]["gf"] for u in US}
    gs = {u: dati[u]["gs"] for u in US}
    RIS[nome] = {
        "CATALOGO FILM (semi film)": recall_catalogo(Rf, gf, ~is_tv),
        "CATALOGO SERIE (semi serie)": recall_catalogo(Rs, gs, is_tv),
        "CATALOGO SERIE (semi FILM)": recall_catalogo(Rf, gs, is_tv),
        "CATALOGO FILM (semi serie)": recall_catalogo(Rs, gf, ~is_tv),
    }
    del Rf, Rs
    print(f"    fatto ({time.time()-t0:.0f}s)")

print("")
print("=" * 104)
print("I DUE CATALOGHI, SEPARATI — cronologie Trakt, split casuale")
print("=" * 104)
print(f"{'grafo':<30} {'catalogo':<28} " + " ".join(f"{('@'+str(k)):>8}" for k in NS))
for nome, d in RIS.items():
    for caso, v in d.items():
        print(f"{nome:<30} {caso:<28} " + " ".join(f"{v[k]:7.2f}%" for k in NS))
    print("")
print(f"({time.time()-t0:.0f}s)")
