"""qualita-foglie.py — LA BATTERIA DI QUALITA' SULLE FOGLIE.

La foglia e' l'unita' di raccomandazione. Ma "buona" in che senso? Tre assi scelti
dall'utente, che tirano in direzioni OPPOSTE e quindi vanno misurati insieme:

  AZZECCATO  le persone guardano davvero insieme i titoli della stessa foglia?
             -> co-occorrenza nelle cronologie VERE di MovieLens 32M, contro un nullo
                che mescola le foglie (stessi film, stessa dimensione, foglia a caso)
  SORPRENDENTE  la foglia e' "il solito"? -> popolarita' dei membri (percentile nel catalogo)
  MEDIUM     la foglia regge il cambio di medium? -> quanti membri dell'altro medium, e
             quanto sono sbilanciate le due meta'

Misure: tutte per fascia di dimensione della foglia, cosi' si vede il trade-off.
Uso:  python qualita-foglie.py [albero.json]
"""
import json, pathlib, sys, time
from collections import Counter
import numpy as np
import pandas as pd

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
NOME_ALBERO = sys.argv[1] if len(sys.argv) > 1 else "albero.json"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo, votes = z["tmdb"], z["tipo"], z["votes"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
assert len(row_of) == n

# ---- l'albero: foglia per titolo ----
al = json.loads((ML / NOME_ALBERO).read_text(encoding="utf-8"))
foglia = np.full(n, -1, np.int64)
id_foglia = []
for f in al["foglie"]:
    id_foglia.append(f["id"])
    for k in f["members"]:
        r = row_of.get(k)
        if r is not None:
            foglia[r] = len(id_foglia) - 1
h = len(id_foglia)
assert (foglia >= 0).all(), "copertura non totale"
dim = np.bincount(foglia, minlength=h)
print(f"albero «{NOME_ALBERO}»: {h:,} foglie · mediana {int(np.median(dim))} · max {dim.max()}")
print(f"  foglie >40 titoli: {int((dim>40).sum())} · >100: {int((dim>100).sum())}")

# ---- ASSE MEDIUM ----
film_per = np.bincount(foglia[~is_tv], minlength=h)
serie_per = np.bincount(foglia[is_tv], minlength=h)
entrambi = (film_per > 0) & (serie_per > 0)
print(f"  foglie con ENTRAMBI i medium: {int(entrambi.sum()):,} ({100*entrambi.mean():.1f}%)")
print(f"  foglie di soli film: {int(((film_per>0)&(serie_per==0)).sum())} · "
      f"di sole serie: {int(((film_per==0)&(serie_per>0)).sum())}")

# ---- ASSE SORPRENDENTE: popolarita' ----
# percentile di popolarita' dei membri (voti TMDB come proxy di notorieta')
ordine_pop = np.argsort(np.argsort(votes))
pct_pop = (ordine_pop / (n - 1.0)) * 100
print(f"\n  (popolarita' mediana del catalogo: {np.median(pct_pop):.0f}° percentile)")

# ---- ASSE AZZECCATO: co-occorrenza nelle cronologie vere ----
links = pd.read_csv(ML / "ml-32m" / "links.csv")
ml2row = {}
for mid, tid in zip(links["movieId"], links["tmdbId"]):
    if pd.isna(tid):
        continue
    r = row_of.get(f"movie:{int(tid)}")
    if r is not None:
        ml2row[int(mid)] = r
print(f"\n  mappa MovieLens->catalogo: {len(ml2row):,} film su {len(links):,}")

r = pd.read_parquet(ML / "ratings-puliti.parquet")
r["row"] = r["movieId"].map(ml2row)
r = r.dropna(subset=["row"])
r["row"] = r["row"].astype(np.int64)
print(f"  interazioni mappate: {len(r):,} · utenti {r.userId.nunique():,}")
del r["movieId"]

# pre-indicizzo le righe con la loro foglia, per non rilavorare l'assegnazione
righe_tutte = r["row"].values
ut_tutte = r["userId"].values
ordine = np.argsort(ut_tutte, kind="stable")
righe_tutte = righe_tutte[ordine]
ut_tutte = ut_tutte[ordine]
bordi_ut = np.flatnonzero(np.r_[True, ut_tutte[1:] != ut_tutte[:-1]])
intervalli = list(zip(bordi_ut, np.r_[bordi_ut[1:], len(ut_tutte)]))

coppie_film = (film_per * (film_per - 1)) // 2
deg = np.bincount(righe_tutte, minlength=n).astype(np.float64)
U = float(len(np.unique(ut_tutte)))
print(f"  cronologie: {len(intervalli):,} · utenti {U:,.0f}")
print(f"  coppie distinte di film dentro le foglie: {int(coppie_film.sum()):,}")
print(f"  calibrazione: il NULLO deve venire ~1.00 — se no, la statistica e' sbagliata")
print(f"  attenzione: {int((deg==0).sum()):,} titoli non hanno cronologie MovieLens (deg 0)")


def atteso_per_foglia(deg_v, fog_ass):
    """E[coppie co-occorrenti] sotto indipendenza, per foglia:
    somma_{i<j in foglia} deg_i*deg_j / U = ((S1)^2 - S2) / (2U)
    L'assegnazione va passata: nel passaggio mescolato le foglie sono altre,
    e l'atteso cambia con loro."""
    s1 = np.bincount(fog_ass, weights=deg_v, minlength=h)
    s2 = np.bincount(fog_ass, weights=deg_v ** 2, minlength=h)
    return (s1 ** 2 - s2) / (2 * U)


def conta(fog_di_riga, etichetta, deg_v=None):
    """eventi di co-occorrenza PER FOGLIA, e lift normalizzato per popolarita'.
    lift = osservato / atteso-sotto-indipendenza: cosi' una coppia di blockbuster
    non vale piu' di una coppia di titoli di nicchia."""
    emessi = []
    for a, b in intervalli:
        righe = righe_tutte[a:b]
        if len(righe) < 2:
            continue
        et = fog_di_riga[righe]
        o = np.argsort(et, kind="stable")
        et = et[o]
        c = np.flatnonzero(np.r_[True, et[1:] != et[:-1], True])
        for i in range(len(c) - 1):
            k = c[i + 1] - c[i]
            if k >= 2:
                emessi.append((int(et[c[i]]), k * (k - 1) // 2))
    eventi = np.zeros(h)
    if emessi:
        arr = np.array(emessi, dtype=np.float64)
        eventi = np.bincount(arr[:, 0].astype(np.int64), weights=arr[:, 1], minlength=h)
    atteso = atteso_per_foglia(deg, fog_di_riga)
    medio = eventi / np.maximum(coppie_film, 1)
    lift = eventi / np.maximum(atteso, 1e-9)
    print(f"    {etichetta}: {int(eventi.sum()):,} eventi · media per coppia {medio[coppie_film>0].mean():.2f} · "
          f"lift vs indipendenza {eventi.sum()/max(atteso.sum(),1e-9):.2f}")
    return eventi, medio, lift


eventi, medio, lift = conta(foglia, "OSSERVATO")

rng = np.random.default_rng(21)
fog_sh = foglia.copy()
film_idx = np.where(~is_tv)[0]
fog_sh[film_idx] = foglia[film_idx][rng.permutation(len(film_idx))]
tot_sh, medio_sh, lift_sh = conta(fog_sh, "NULLO (foglie mescolate)")

ok = coppie_film >= 10
# il riferimento e' il NULLO, non l'indipendenza: gli utenti iperattivi generano co-occorrenze
# anche fra titoli scorrelati (l'indipendenza sbaglia di ~4x). Il nullo per coppia e' PIATTO
# su tutte le fasce, quindi e' un riferimento sano.
lift = medio / np.maximum(medio_sh, 1e-12)

pop_foglia = np.zeros(h)
for f in range(h):
    m = np.where(foglia == f)[0]
    pop_foglia[f] = pct_pop[m].mean() if len(m) else 0.0

print("")
print("=" * 96)
print(f"SINTESI — coppie {int(coppie_film.sum()):,} · eventi {int(eventi.sum()):,} · ".replace("SINTESI", f"SINTESI «{NOME_ALBERO}»")
      + f"per coppia {eventi.sum()/max(coppie_film.sum(),1):.2f} · "
      + f"nullo {tot_sh.sum()/max(coppie_film.sum(),1):.2f} · "
      + f"LIFT COMPLESSIVO {eventi.sum()/max(tot_sh.sum(),1):.2f}")
print("=" * 96)
print(f"{'fascia di dimensione':<22} {'foglie':>7} {'coppie':>10} {'co-occ/coppia':>14} {'nullo':>9} "
      f"{'LIFT':>7} {'popol.':>8} {'% 2 medium':>11}")
print("=" * 96)
FASCE = ((2, 5), (6, 10), (11, 20), (21, 40), (41, 80), (81, 150), (151, 10 ** 9))
for lo, hi in FASCE:
    m = (dim >= lo) & (dim <= hi) & ok
    if m.sum() == 0:
        continue
    lab = f"{lo}-{hi}" if hi < 10 ** 9 else f"{lo}+"
    o = eventi[m].sum() / max(coppie_film[m].sum(), 1)
    s = tot_sh[m].sum() / max(coppie_film[m].sum(), 1)
    print(f"{lab:<22} {int(m.sum()):>7} {int(coppie_film[m].sum()):>10,} "
          f"{o:>14.1f} {s:>9.1f} {o/max(s,1e-9):>7.2f} {pop_foglia[m].mean():>7.0f}° "
          f"{100*entrambi[m].mean():>10.1f}%")

print("")
print("LETTURA:")
print("  co-occ/coppia = quante volte due film della foglia compaiono nella stessa cronologia, in media")
print("  nullo = stessa misura con le foglie MESCOLATE (stessi film, raggruppati a caso): deve essere PIATTO")
print("  LIFT > 1 = la foglia raggruppa film che le persone guardano insieme, non solo film simili")
print(f"\n({time.time()-t0:.0f}s)")
