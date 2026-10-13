"""ordine-2.py — GLI ORDINAMENTI. Chi mette in cima le cose giuste?

Lavora su `.cache/movielens/ordine.parquet` (prodotto da ordine-1.py): per 1.000 utenti di
calibrazione e 1.000 di verifica, i 2.000 candidati del cesto con 12 caratteristiche.

REGOLA: si scegli l'ordinamento sulla CALIBRAZIONE e si riporta solo la VERIFICA.
Metrica: recall@N per utente = quanti dei suoi film veri finiscono nei primi N, sul TOTALE dei
suoi film veri (non solo quelli nel cesto) -> numeri confrontabili con i report precedenti.
"""
import pathlib, time
import numpy as np
import pandas as pd

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
CESTONE = 2000
NS = (10, 100, 500)

DF = pd.read_parquet(ML / "ordine.parquet")
DF["u"] = DF.groupby("split").cumcount() // CESTONE
FEAT = ["att", "att_cf", "pop", "voto", "cos_prof", "cf_cent", "cf_voti",
        "toccata", "dim_fog", "grado", "anno", "curati"]
print(f"righe {len(DF):,} · utenti {DF.u.nunique():,} · colpi {100*DF.colpito.mean():.2f}%")

# --- ricostruisco il numero di film d'oro per utente (stessa procedura di ordine-1) ---
z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
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

n_oro = {}
for nome, utenti in (("calib", SCELTI[:1000]), ("verif", SCELTI[1000:])):
    sub = rr[rr.userId.isin(set(utenti.tolist()))]
    gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
    r2 = np.random.default_rng(7)
    for u in utenti:
        righe = np.unique(gruppi[u])
        if len(righe) < 20:
            continue
        perm = r2.permutation(len(righe))
        t = int(0.6 * len(righe))
        n_oro[u] = len(righe) - t
# ordine degli utenti nel parquet = ordine di SCELTI filtrato
ordine_u = {}
for nome, utenti in (("calib", SCELTI[:1000]), ("verif", SCELTI[1000:])):
    sub = rr[rr.userId.isin(set(utenti.tolist()))]
    gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
    lista = [u for u in utenti if len(np.unique(gruppi[u])) >= 20]
    ordine_u[nome] = lista
MAPPA = {}
for nome, lista in ordine_u.items():
    sp = 0 if nome == "calib" else 1
    for i, u in enumerate(lista):
        MAPPA[(sp, i)] = n_oro[u]
DF["n_oro"] = [MAPPA[(s, i)] for s, i in zip(DF.split.values, DF.u.values)]
print(f"film d'oro per utente: mediana {int(np.median(DF.groupby(['split','u']).n_oro.first()))} "
      f"({time.time()-t0:.0f}s)")

# --- il banco ---
TOT = DF.groupby(["split", "u"]).n_oro.first()
DEN = {}
for sp in (0, 1):
    DEN[sp] = TOT.loc[sp].sum()


def valuta(sc, split):
    """sc: array di punteggi per riga (piu' alto = prima). Ritorna recall@N."""
    d = DF.loc[DF.split == split, ["u", "colpito"]].copy()
    d["s"] = sc
    d = d.sort_values(["u", "s"], ascending=[True, False])
    d["pos"] = d.groupby("u").cumcount()
    out = {}
    for N in NS:
        out[N] = 100 * d.loc[d.pos < N, "colpito"].sum() / DEN[split]
    # oracolo: i film veri del cesto (fino a 100 per utente) nelle prime posizioni
    orac = d.loc[d.colpito == 1].groupby("u").size().clip(upper=100).sum()
    out["orac100"] = 100 * orac / DEN[split]
    return out


print("")
print("=" * 100)
print("ORDINAMENTI A CARATTERISTICA SINGOLA — 'calib' sceglie, 'verif' riporta")
print("=" * 100)
print(f"{'ordinamento':<40} {'calib @10':>10}{'@100':>8}{'@500':>8} | {'verif @10':>10}{'@100':>8}{'@500':>8}")
rif = {}
for sc, nome in ((DF.pos_att.values * -1.0, "ATTIVAZIONE (ordine attuale)"),):
    a, b = valuta(sc[DF.split.values == 0], 0), valuta(sc[DF.split.values == 1], 1)
    rif["calib"], rif["verif"] = a, b
    print(f"{nome:<40} {a[10]:9.2f}%{a[100]:7.2f}%{a[500]:7.2f}% | {b[10]:9.2f}%{b[100]:7.2f}%{b[500]:7.2f}%")
    print(f"{'   (oracolo @100 del cesto)':<40} {a['orac100']:9.2f}%{'':8}{'':8} | {b['orac100']:9.2f}%")

for f in FEAT:
    for verso, mul in (("giu'", 1.0), ("su", -1.0)):
        if f in ("dim_fog", "anno") and verso == "su":
            continue
        sc = DF[f].values * mul
        a = valuta(sc[DF.split.values == 0], 0)
        b = valuta(sc[DF.split.values == 1], 1)
        print(f"{f + ' (' + verso + ')':<40} {a[10]:9.2f}%{a[100]:7.2f}%{a[500]:7.2f}% | "
              f"{b[10]:9.2f}%{b[100]:7.2f}%{b[500]:7.2f}%")

print("")
print("=" * 100)
print("MISTI (z-score per utente, somma pesata) — pesi scelti sulla calibrazione")
print("=" * 100)


def z(f):
    g = DF.groupby(["split", "u"])[f]
    return ((DF[f] - g.transform("mean")) / (g.transform("std") + 1e-9)).values


Z = {f: z(f) for f in FEAT}
CAND = {
    "z(att_cf)": Z["att_cf"],
    "z(att_cf)+z(pop)": Z["att_cf"] + Z["pop"],
    "z(att_cf)+z(cf_voti)": Z["att_cf"] + Z["cf_voti"],
    "z(att_cf)+z(cf_voti)+z(pop)": Z["att_cf"] + Z["cf_voti"] + Z["pop"],
    "z(att_cf)+z(cf_voti)+z(cos_prof)": Z["att_cf"] + Z["cf_voti"] + Z["cos_prof"],
    "z(cf_voti)+z(pop)": Z["cf_voti"] + Z["pop"],
    "z(att_cf)*2+z(cf_voti)+z(pop)": 2 * Z["att_cf"] + Z["cf_voti"] + Z["pop"],
}
for nome, sc in CAND.items():
    a = valuta(sc[DF.split.values == 0], 0)
    b = valuta(sc[DF.split.values == 1], 1)
    print(f"{nome:<40} {a[10]:9.2f}%{a[100]:7.2f}%{a[500]:7.2f}% | {b[10]:9.2f}%{b[100]:7.2f}%{b[500]:7.2f}%")

print("")
print("=" * 100)
print("MODELLO IMPARATO — addestrato SOLO sulla calibrazione")
print("=" * 100)
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression

USAC = ["att", "att_cf", "pop", "voto", "cos_prof", "cf_cent", "cf_voti", "toccata",
        "dim_fog", "grado", "anno", "curati"]
Xc = np.column_stack([DF[f].values for f in USAC] + [Z[f] for f in USAC])
mC = (DF.split.values == 0)
mV = DF.split.values == 1
y = DF.colpito.values
for nome, mod in (("logistica", LogisticRegression(max_iter=400, C=1.0)),
                  ("GBM (200 alberi)", HistGradientBoostingClassifier(max_iter=200, random_state=0))):
    mod.fit(Xc[mC], y[mC])
    sc = np.zeros(len(DF))
    sc[mC] = mod.predict_proba(Xc[mC])[:, 1]
    sc[mV] = mod.predict_proba(Xc[mV])[:, 1]
    a = valuta(sc[mC], 0)
    b = valuta(sc[mV], 1)
    print(f"{nome:<40} {a[10]:9.2f}%{a[100]:7.2f}%{a[500]:7.2f}% | {b[10]:9.2f}%{b[100]:7.2f}%{b[500]:7.2f}%")
    coef = getattr(mod, "coef_", None)
    if coef is not None:
        imp = pd.Series(np.abs(coef[0]), index=[f"{x}_raw" for x in USAC] + [f"{x}_z" for x in USAC])
        print("   peso delle caratteristiche (le prime 8): "
              + " · ".join(f"{k} {v:.2f}" for k, v in imp.sort_values(ascending=False).head(8).items()))
print(f"\n({time.time()-t0:.0f}s)")
