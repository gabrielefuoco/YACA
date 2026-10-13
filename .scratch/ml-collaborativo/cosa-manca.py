"""cosa-manca.py — DI COSA E' FATTO IL TETTO.

Il grafo mette il 77-79% dei film veri nel top-2000. Il resto — il 21% — non entra mai.
Nessuno ha mai chiesto DI COSA E' FATTO. Se sono titoli senza segnale (nessun vicino, nessuna
popolarità, nessun metadato) il tetto e' dell'informazione e non si sposta. Se invece hanno
segnale ma il grafo non li raggiunge, il tetto e' NOSTRO e si sposta.

Confronto, per i film d'oro degli stessi 1.000 utenti:
    DENTRO  rango <= 2000  (nel cesto)
    FUORI   rango >  2000  (mai raggiunti)
su: copertura comportamentale (CF), popolarita', grado nel grafo, dimensione della foglia,
anno, e quante volte il film compare nei profili degli utenti (notorieta' reale in MovieLens).
"""
import pathlib, time
import numpy as np
import pandas as pd

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo, votes, year = z["tmdb"], z["tipo"], z["votes"], z["year"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
_a = year.astype(float)
anno = np.where(np.isnan(_a), np.nanmedian(_a), _a)

q = np.load(ML / "keyword-esempi.npz")
NODI = q["nodo"]
RK = q["rk_full"]
US = q["soggetti"]

Cfx = np.load(ML / "cf-spazio.npz")["Cf"]
ha_cf = np.linalg.norm(Cfx, axis=1) > 1e-6
Cfn = Cfx / (np.linalg.norm(Cfx, axis=1, keepdims=True) + 1e-9)

q2 = np.load(ML / "spazio-pulito.npz")["P"]
Pm = q2 / (np.linalg.norm(q2, axis=1, keepdims=True) + 1e-9)

CF = np.load(ML / "cf-spazio.npz")["Cf"]
deg_cf = (np.linalg.norm(CF, axis=1) > 1e-6).astype(int)

pct_pop = (np.argsort(np.argsort(votes.astype(float))) / (n - 1.0)) * 100

# notorieta' reale: in quante cronologie MovieLens compare il film
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
n_voti = np.bincount(rr["row"].values.astype(int), minlength=n)
print(f"pronto ({time.time()-t0:.0f}s)")

# per ogni (utente, film d'oro) raccolgo il rango del film
# (i vettori sono piatti, in ordine di utente: ricostruisco i confini dal numero di voci d'oro)
r3 = np.random.default_rng(7)
cnt = rr.groupby("userId").size()          # <- sullo STESSO rr filtrato di keyword-esempi.py
buoni = cnt[cnt >= 20].index.values
VER = np.random.default_rng(9).choice(buoni, size=2000, replace=False)[1000:]
gruppi = {u: g["row"].values for u, g in rr[rr.userId.isin(set(VER.tolist()))].groupby("userId")}
confini = []
for u in VER:
    g = np.unique(gruppi[u])
    if len(g) < 20:
        continue
    perm = r3.permutation(len(g))
    t = int(0.6 * len(g))
    confini.append(len(set(g[perm[t:]].tolist())))   # l'oro era un set: i duplicati erano collassati
assert sum(confini) == len(NODI), f"{sum(confini)} != {len(NODI)}"

pos = 0
righe = []
for k in confini:
    nodi_u = NODI[pos:pos + k]
    rk_u = RK[pos:pos + k]
    pos += k
    for nd, rkk in zip(nodi_u, rk_u):
        righe.append((int(nd), int(rkk)))
D = pd.DataFrame(righe, columns=["nodo", "rango"])
print(f"coppie (utente, film d'oro): {len(D):,} ({time.time()-t0:.0f}s)")

D["dentro"] = D.rango <= 2000
D["ha_cf"] = ha_cf[D.nodo.values]
D["pop"] = pct_pop[D.nodo.values]
D["voti_ml"] = n_voti[D.nodo.values]
D["anno"] = anno[D.nodo.values]
D["serie"] = is_tv[D.nodo.values]

print("")
print("=" * 100)
print("DI COSA E' FATTO IL TETTO — film d'oro DENTRO il cesto contro FUORI")
print("=" * 100)
print(f"{'':<34} {'nel cesto':>12} {'mai raggiunti':>15} {'rapporto':>10}")
for lab, col, agg in (("copertura comportamentale (CF)", "ha_cf", "mean"),
                      ("popolarità (percentile)", "pop", "median"),
                      ("voti MovieLens (mediana)", "voti_ml", "median"),
                      ("anno (mediana)", "anno", "median"),
                      ("è una serie", "serie", "mean")):
    a = D.loc[D.dentro, col].agg(agg)
    b = D.loc[~D.dentro, col].agg(agg)
    if col in ("ha_cf", "serie"):
        print(f"{lab:<34} {100*a:11.1f}% {100*b:14.1f}%")
    else:
        print(f"{lab:<34} {a:12,.1f} {b:15,.1f} {a/max(b,1e-9):9.2f}x")

print("")
print(f"  film d'oro totali: {len(D):,} · nel cesto {int(D.dentro.sum()):,} ({100*D.dentro.mean():.1f}%) "
      f"· mai raggiunti {int((~D.dentro).sum()):,} ({100*(~D.dentro).mean():.1f}%)")

print("")
print("  DEI MAI RAGGIUNTI, quanti hanno il comportamento (e quindi potevano essere trovati)?")
m = ~D.dentro
print(f"    con vettore CF:      {int(D.loc[m,'ha_cf'].sum()):,} ({100*D.loc[m,'ha_cf'].mean():.1f}%)")
print(f"    SENZA vettore CF:    {int((~D.loc[m,'ha_cf'].astype(bool)).sum()):,} "
      f"({100*(~D.loc[m,'ha_cf'].astype(bool)).mean():.1f}%)")
print(f"    con 0 voti MovieLens: {int((D.loc[m,'voti_ml']==0).sum()):,} "
      f"({100*(D.loc[m,'voti_ml']==0).mean():.1f}%)")
print(f"    nei profili degli utenti (voti medi): dentro {D.loc[D.dentro,'voti_ml'].mean():,.0f} "
      f"· fuori {D.loc[m,'voti_ml'].mean():,.0f}")

print("")
print("  E DI QUELLI FUORI, quanto sono lontani?")
for lo, hi in ((2000, 10000), (10000, 30000), (30000, 10 ** 9)):
    mm = (D.rango >= lo) & (D.rango < hi)
    if mm.sum() == 0:
        continue
    print(f"    rango {lo:>6,}-{hi if hi<10**9 else '∞':>6}: {int(mm.sum()):>6,} film · "
          f"CF {100*D.loc[mm,'ha_cf'].mean():4.1f}% · pop {D.loc[mm,'pop'].median():4.0f}° · "
          f"voti ML {D.loc[mm,'voti_ml'].median():,.0f} · serie {100*D.loc[mm,'serie'].mean():4.1f}%")
print(f"\n({time.time()-t0:.0f}s)")
