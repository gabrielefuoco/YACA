"""keyword-esempi.py — LE KEYWORD FANNO COSA, FILM PER FILM. Con i titoli veri.

La misura aggregata ("le keyword aggiunte peggiorano") non dice chi aiuta e chi danneggia.
Qui si guarda ogni film d'oro e si confronta il suo rango in DUE grafi identici tranne che
per il componente dei metadati:

    G_full = Kc + CF + B + T + K
    G_noK  =      CF + B + T + K

Quattro casi, per ogni soglia (100, 2000):
    ENTRA    fuori senza keyword, dentro con -> l'hanno portato loro
    ESCE     dentro senza keyword, fuori con -> l'hanno cacciato
    DENTRO   dentro in entrambi
    FUORI    fuori in entrambi

E poi gli esempi: i casi in cui il rango migliora di piu' e quelli in cui peggiora di piu',
piu' un campione di suggerimenti veri per due utenti, piu' il ponte cross-medium su alcune serie.
"""
import json, pathlib, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, coo_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
SOGLIE = (100, 2000)

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
TIT = {}
mv = pd.read_parquet(pathlib.Path(".cache/tmdb") / "movies.parquet", columns=["id", "title"])
tv = pd.read_parquet(pathlib.Path(".cache/tmdb") / "tv.parquet", columns=["id", "name"])
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t in zip(df["id"], df[col]):
        TIT[f"{typ}:{int(i)}"] = str(t)


def titolo(r):
    return TIT.get(keys[r], "?")


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
Kc = topk_edges(np.load(ML / "spazio-pulito.npz")["P"], 15)
B = carica("boot-B.npz")
Tm = carica("boot-T.npz")
K = carica("boot-Kpari.npz")


def comp(*parti):
    w = 0.40 / len(parti)
    return normalizza((sum(w * p for p in parti) + 0.60 * K).tocsr())


G_full = comp(Kc, CF, B, Tm)
G_noK = comp(CF, B, Tm)
print(f"grafi pronti ({time.time()-t0:.0f}s)")

Cfx = np.load(ML / "cf-spazio.npz")["Cf"]
ha_beh = np.linalg.norm(Cfx, axis=1) > 1e-6

# --- utenti di verifica ---
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
VER = np.random.default_rng(9).choice(buoni, size=2000, replace=False)[1000:]
sub = rr[rr.userId.isin(set(VER.tolist()))]
gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
PROF, ORO = {}, {}
r3 = np.random.default_rng(7)
for u in VER:
    righe = np.unique(gruppi[u])
    if len(righe) < 20:
        continue
    perm = r3.permutation(len(righe))
    t = int(0.6 * len(righe))
    PROF[u] = righe[perm[:t]]
    ORO[u] = righe[perm[t:]]
US = np.array(list(PROF.keys()))
print(f"utenti: {len(US):,} ({time.time()-t0:.0f}s)")

E = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    E[PROF[u], j] = 1.0
RK = {}
LOTTO = 250
for nome, M in (("full", G_full), ("noK", G_noK)):
    R = np.empty((n, len(US)), np.int32)
    for a in range(0, len(US), LOTTO):
        b = min(a + LOTTO, len(US))
        Es = E[:, a:b]
        X = Es.copy()
        for _ in range(20):
            X = 0.30 * (M.T @ X) + 0.70 * Es
        for j, u in enumerate(US[a:b]):
            X[PROF[u], j] = -1e9
        for j in range(b - a):
            R[np.argsort(-X[:, j]), a + j] = np.arange(n)
        del X
    RK[nome] = R
    print(f"  attivazione «{nome}» fatta ({time.time()-t0:.0f}s)", flush=True)

col = {int(u): j for j, u in enumerate(US)}
RIGHE = []
for j, u in enumerate(US):
    for g in ORO[u]:
        RIGHE.append((int(g), RK["full"][g, j], RK["noK"][g, j], int(ha_beh[g]), is_tv[g]))
D = pd.DataFrame(RIGHE, columns=["nodo", "rk_full", "rk_noK", "ha_comportamento", "serie"])
print(f"\ncoppie (utente, film d'oro): {len(D):,} · mediana rango full {int(D.rk_full.median())} "
      f"· noK {int(D.rk_noK.median())}")
# salvo per non dover rifare le attivazioni (8 min) a ogni ritocco degli esempi
np.savez_compressed(ML / "keyword-esempi.npz", nodo=D.nodo.values, rk_full=D.rk_full.values,
                    rk_noK=D.rk_noK.values, ha_beh=D.ha_comportamento.values, serie=D.serie.values,
                    RK_full=RK["full"], RK_noK=RK["noK"], soggetti=US,
                    prof=np.array([len(PROF[u]) for u in US]))

print("")
print("=" * 100)
print("COSA FANNO LE KEYWORD, FILM PER FILM (1.000 utenti, 63 film d'oro ciascuno)")
print("=" * 100)
for S in SOGLIE:
    ent = int(((D.rk_noK > S) & (D.rk_full <= S)).sum())
    esc = int(((D.rk_full > S) & (D.rk_noK <= S)).sum())
    den = int(((D.rk_full <= S) & (D.rk_noK <= S)).sum())
    fou = int(((D.rk_full > S) & (D.rk_noK > S)).sum())
    print(f"\n  soglia top-{S}  (totale {len(D):,} film d'oro)")
    print(f"    ENTRANO per merito loro (fuori senza, dentro con) : {ent:>6,}  ({100*ent/len(D):4.2f}%)")
    print(f"    ESCONO  per colpa loro (dentro senza, fuori con)  : {esc:>6,}  ({100*esc/len(D):4.2f}%)")
    print(f"    dentro in entrambi                                : {den:>6,}")
    print(f"    fuori in entrambi                                 : {fou:>6,}")
    print(f"    saldo netto: {ent-esc:+,}")

print("")
print("=" * 100)
print("E PER CHI HA COMPORTAMENTO CONTRO CHI NON CE L'HA (soglia top-2000)")
print("=" * 100)
for lab, m in (("ha un vettore di comportamento", D.ha_comportamento == 1),
               ("NON ha comportamento", D.ha_comportamento == 0)):
    d = D[m]
    if len(d) == 0:
        continue
    ent = int(((d.rk_noK > 2000) & (d.rk_full <= 2000)).sum())
    esc = int(((d.rk_full > 2000) & (d.rk_noK <= 2000)).sum())
    print(f"  {lab:<32} n {len(d):>6,} · entrano {ent:>5,} · escono {esc:>5,} · saldo {ent-esc:+6,} "
          f"· rango mediano full {int(d.rk_full.median()):>6} noK {int(d.rk_noK.median()):>6}")

print("")
print("=" * 100)
print("ESEMPI — dove le keyword fanno la differenza (il rango migliora di piu')")
print("=" * 100)
D["guad"] = D.rk_noK - D.rk_full
for _, r in D.nlargest(12, "guad").iterrows():
    print(f"    {titolo(int(r.nodo))[:52]:<52} senza {int(r.rk_noK):>6,} -> con {int(r.rk_full):>5}  "
          f"({'comportamento' if r.ha_comportamento else 'nessun comportamento'})")
print("")
print("ESEMPI — dove le keyword fanno danno (il rango peggiora di piu')")
for _, r in D.nsmallest(12, "guad").iterrows():
    print(f"    {titolo(int(r.nodo))[:52]:<52} senza {int(r.rk_noK):>6,} -> con {int(r.rk_full):>6,}  "
          f"({'comportamento' if r.ha_comportamento else 'nessun comportamento'})")

print("")
print("=" * 100)
print("SUGGERIMENTI VERI — i primi 10 di due utenti (con i film che ha davvero visto segnati +)")
print("=" * 100)
for j in (300, 700):
    u = US[j]
    top = np.argsort(RK["full"][:, j])[:10]
    oro = ORO[u]
    print(f"\n  utente {u} — profilo: " + " · ".join(titolo(x) for x in PROF[u][:6]) + " …")
    for t_, g in enumerate(top, 1):
        print(f"     {t_:>2}. {titolo(g)[:58]:<58} {'+' if g in oro else ' '}")

print("")
print("=" * 100)
print("IL PONTE CROSS-MEDIUM — le 8 cose piu' vicine a 4 serie (metadati + comportamento)")
print("=" * 100)
q = np.load(ML / "cf-studente.npz")["P"] if (ML / "cf-studente.npz").exists() else None
Pcf = q / (np.linalg.norm(q, axis=1, keepdims=True) + 1e-9)
PR = np.load(ML / "spazio-pulito.npz")["P"]
PRn = PR / (np.linalg.norm(PR, axis=1, keepdims=True) + 1e-9)
serie_con_cura = [row_of[s["id"]] for s in json.loads((ROOT / ".scratch" / "ml-collaborativo" / "gold" / "cross-merged.json").read_text(encoding="utf-8"))["sources"] if s["id"] in row_of]
rng = np.random.default_rng(11)
for s in rng.choice(np.array(serie_con_cura), size=4, replace=False):
    sim = Pcf[s] @ Pcf.T
    sim[is_tv] = -9
    sim[s] = -9
    top = np.argsort(-sim)[:8]
    sm = PRn[s] @ PRn.T
    sm[is_tv] = -9
    sm[s] = -9
    topm = np.argsort(-sm)[:8]
    print(f"\n  serie «{titolo(s)}»")
    print(f"     per COMPORTAMENTO previsto: " + " · ".join(titolo(x) for x in top))
    print(f"     per METADATI puri:          " + " ".join(titolo(x) for x in topm))
print(f"\n({time.time()-t0:.0f}s)")
