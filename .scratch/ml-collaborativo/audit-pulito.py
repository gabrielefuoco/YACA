"""audit-pulito.py — L'AUDIT DELLE FOGLIE NELLO SPAZIO DEI METADATI PULITI.

Il report 46 aveva misurato la coerenza delle foglie in `Pc` — che il report 48 ha dimostrato
essere comportamento MovieLens travestito. Quindi la coerenza 0,744 era coerenza *di pubblico*,
non di contenuto. Qui si rifa' nei tre spazi:
   Pc            contaminato (quello del report 46)
   metadati      puliti (SVD del TF-IDF, nessun MovieLens)
   CF            comportamento dichiarato
e si guarda se le foglie sono buone di contenuto, di pubblico, o di entrambi.
"""
import json, pathlib, time
import numpy as np

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")

al = json.loads((ML / "albero.json").read_text(encoding="utf-8"))
foglia = np.full(n, -1, np.int64)
for f in al["foglie"]:
    for k in f["members"]:
        r = row_of.get(k)
        if r is not None:
            foglia[r] = f["id"]
ids = np.array(sorted(set(foglia[foglia >= 0].tolist())))
print(f"albero: {len(al['foglie']):,} foglie · {len(ids):,} con id validi ({time.time()-t0:.0f}s)")


def normalizza_righe(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


def coerenza(V):
    out = np.full(len(ids), np.nan)
    for i, c in enumerate(ids):
        m = np.where(foglia == c)[0]
        k = len(m)
        if k < 2:
            continue
        S = V[m].sum(0)
        out[i] = (float(S @ S) - k) / (k * (k - 1))
    return out


Pc = np.load(ML / "spazi-trakt.npz", allow_pickle=True)["Pc"]
a = coerenza(normalizza_righe(Pc))
b = coerenza(normalizza_righe(np.load(ML / "spazio-pulito.npz")["P"]))
c = coerenza(normalizza_righe(np.load(ML / "cf-spazio.npz")["Cf"]))

print("")
print("=" * 96)
print("COERENZA DELLE FOGLIE NEI TRE SPAZI")
print("=" * 96)
print(f"{'spazio':<40} {'mediana':>9} {'10°ile':>8} {'sotto 0.20':>11} {'sotto 0.30':>11}")
for nome, arr in (("Pc — CONTAMINATO (report 46)", a),
                  ("METADATI PULITI", b),
                  ("COMPORTAMENTO (CF, solo film)", c)):
    ok = ~np.isnan(arr)
    print(f"{nome:<40} {np.nanmedian(arr):>9.3f} {np.nanpercentile(arr,10):>8.3f} "
          f"{100*np.nanmean(arr<0.20):>10.1f}% {100*np.nanmean(arr<0.30):>10.1f}%")

print("")
print(f"  correlazione Pc contro metadati puliti: {np.corrcoef(a[~np.isnan(a)], b[~np.isnan(b)])[0,1]:.3f}")
print(f"  correlazione Pc contro comportamento:   {np.corrcoef(a[~np.isnan(a)], c[~np.isnan(c)])[0,1]:.3f}")
print(f"  correlazione metadati contro comport.:  {np.corrcoef(b[~np.isnan(b)], c[~np.isnan(c)])[0,1]:.3f}")
print("")
print(f"  foglie buone in Pc (>=0.20) ma lasche nei METADATI (<0.20): {int(np.nansum((a>=0.20)&(b<0.20)))}")
print(f"  foglie lasche in Pc (<0.20) ma buone nei METADATI (>=0.20): {int(np.nansum((a<0.20)&(b>=0.20)))}")

print("")
print("  per fascia di dimensione (mediana della coerenza):")
print(f"{'fascia':<12} {'foglie':>7} {'Pc':>8} {'metadati':>10} {'comport.':>10}")
dim = np.array([len(np.where(foglia == c)[0]) for c in ids])
for lo, hi in ((2, 5), (6, 10), (11, 20), (21, 40), (41, 80), (81, 150), (151, 10 ** 9)):
    m = (dim >= lo) & (dim <= hi)
    if m.sum() == 0:
        continue
    lab = f"{lo}-{hi}" if hi < 10 ** 9 else f"{lo}+"
    print(f"{lab:<12} {int(m.sum()):>7} {np.nanmedian(a[m]):>8.3f} {np.nanmedian(b[m]):>10.3f} "
          f"{np.nanmedian(c[m]):>10.3f}")
print(f"\n({time.time()-t0:.0f}s)")
