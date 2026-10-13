"""medio-quota.py — QUANTO DELLA "TESTA ROTTA" E' L'INVASIONE DEL MEDIO?

Trovato: nel top-10 l'85,5% delle voci sono SERIE, per utenti il cui gold e' 100% film
(MovieLens). Una serie non puo' mai essere colpita: e' un buco strutturale.

Si rivaluta lo stesso cesto in tre letture:
  1. come sta ora
  2. TENENDO SOLO I FILM  -> isola l'effetto "invasione del medio"
  3. con una QUOTA di medio (greedy: max una frazione di serie nella lista)
E si confronta con l'attivazione semplice e col GBM.
"""
import pathlib, time
import numpy as np
import pandas as pd

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
CESTONE = 2000
NS = (10, 100, 500)
QUOTE = (1.0, 0.5, 0.3, 0.15)

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")

DF = pd.read_parquet(ML / "ordine.parquet")
DF["u"] = DF.groupby("split").cumcount() // CESTONE
DF["e_serie"] = is_tv[DF.nodo.values]
FEAT = ["att", "att_cf", "pop", "voto", "cos_prof", "cf_cent", "cf_voti",
        "toccata", "dim_fog", "grado", "anno", "curati"]
print(f"righe {len(DF):,} · serie nel cesto {100*DF.e_serie.mean():.1f}% ({time.time()-t0:.0f}s)")

# --- il VERO totale d'oro per utente (stessa procedura di ordine-1) ---
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
SCELTI = np.random.default_rng(9).choice(buoni, size=2000, replace=False)
DEN, NGOLD = {}, {}
for split, utenti in ((0, SCELTI[:1000]), (1, SCELTI[1000:])):
    sub = rr[rr.userId.isin(set(utenti.tolist()))]
    gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
    r2 = np.random.default_rng(7)
    lista_u, lista_n = [], []
    tot = 0
    for u in utenti:
        righe = np.unique(gruppi[u])
        if len(righe) < 20:
            continue
        perm = r2.permutation(len(righe))
        t = int(0.6 * len(righe))
        lista_u.append(u)
        lista_n.append(len(righe) - t)
        tot += len(righe) - t
    DEN[split] = tot
    for i, k in enumerate(lista_n):
        NGOLD[(split, i)] = k
print(f"oro totale: calib {DEN[0]:,} · verifica {DEN[1]:,} ({time.time()-t0:.0f}s)")
DF["n_oro"] = [NGOLD[(s, i)] for s, i in zip(DF.split.values, DF.u.values)]


def prepara(split):
    d = DF.loc[DF.split == split, ["u", "colpito", "e_serie"]].copy()
    return d, d.u.nunique()


def recall(d, split, N):
    return 100 * d.loc[d.pos < N, "colpito"].sum() / DEN[split]


def leggi(d, sc):
    d = d.copy()
    d["s"] = sc
    return d.sort_values(["u", "s"], ascending=[True, False]).assign(
        pos=lambda x: x.groupby("u").cumcount())


def ordina_quota(d, sc, quota, NMAX=500):
    """greedy con tetto di serie: si pesca dalla classifica dei film e da quella delle serie
    tenendo la quota (media) sotto controllo."""
    d = d.copy()
    d["s"] = sc
    fuori = []
    for u, g in d.groupby("u", sort=False):
        g = g.sort_values("s", ascending=False)
        ser = g.e_serie.values
        idx = g.index.values
        fil = idx[~ser]
        ser_i = idx[ser]
        res, fi, si, nser = [], 0, 0, 0
        while len(res) < NMAX:
            cap = quota * (len(res) + 1)
            if fi < len(fil) and (nser + 1 > cap or si >= len(ser_i)):
                res.append(fil[fi]); fi += 1
            elif si < len(ser_i):
                res.append(ser_i[si]); si += 1; nser += 1
            elif fi < len(fil):
                res.append(fil[fi]); fi += 1
            else:
                break
        fuori.append(pd.DataFrame({"u": u, "idx": res, "pos": np.arange(len(res))}))
    F = pd.concat(fuori)
    out = d.loc[F.idx.values, ["u", "colpito"]].copy()
    out["pos"] = F.pos.values
    return out


# --- il GBM ---
from sklearn.ensemble import HistGradientBoostingClassifier
def zz(f):
    g = DF.groupby(["split", "u"])[f]
    return ((DF[f] - g.transform("mean")) / (g.transform("std") + 1e-9)).values

X = np.column_stack([DF[f].values for f in FEAT] + [zz(f) for f in FEAT])
mC, mV = DF.split.values == 0, DF.split.values == 1
gb = HistGradientBoostingClassifier(max_iter=200, random_state=0).fit(X[mC], DF.colpito.values[mC])
sc = np.zeros(len(DF))
sc[mC] = gb.predict_proba(X[mC])[:, 1]
sc[mV] = gb.predict_proba(X[mV])[:, 1]

dc, _ = prepara(0)
dv, _ = prepara(1)
print("")
print("=" * 100)
print("LO STESSO CESTO — come sta ora | solo film | con quota di medio")
print("=" * 100)
print(f"{'ordinamento':<32} {'lettura':<14} {'@10':>8}{'@100':>8}{'@500':>8}")
for nome, s_ in (("attivazione", DF.att.values), ("attivazione sul comportamento", DF.att_cf.values),
                 ("popolarita'", DF["pop"].values), ("GBM (200 alberi)", sc)):
    sv = s_[mV]
    a = leggi(dv, sv)
    print(f"{nome:<32} {'come sta ora':<14} {recall(a,1,10):7.2f}%{recall(a,1,100):7.2f}%{recall(a,1,500):7.2f}%")
    dm = dv[~dv.e_serie].copy()
    am = leggi(dm, sv[~dv.e_serie.values])
    print(f"{'':<32} {'solo film':<14} {recall(am,1,10):7.2f}%{recall(am,1,100):7.2f}%{recall(am,1,500):7.2f}%")
    for q in (0.3, 0.15):
        aq = ordina_quota(dv, sv, q)
        print(f"{'':<32} {('quota serie ' + str(int(q*100)) + '%'):<14} "
              f"{recall(aq,1,10):7.2f}%{recall(aq,1,100):7.2f}%{recall(aq,1,500):7.2f}%")
    print("")
print(f"({time.time()-t0:.0f}s)")
