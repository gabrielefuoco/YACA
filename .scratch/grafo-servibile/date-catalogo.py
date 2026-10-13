"""date-catalogo.py — le date di uscita del catalogo, una volta sola, in una cache.

Serve al ticket 03 (il mascheramento a tempo T): per ogni titolo del catalogo, il giorno di
uscita (film: `release_date`; serie: `first_air_date`). Le date mancanti restano -1 e NON
vengono mai mascherate: un titolo senza data non e' un titolo futuro.

Output: .cache/movielens/uscite.npz -> `giorni` (int32, giorni dal 1970-01-01, -1 = ignota),
allineato alla riga dei titoli di canone.py.
"""
import pathlib, sys
import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "ml-collaborativo"))
import canone as K

keys, row_of, n, is_tv = K.titoli()
giorni = np.full(n, -1, np.int32)


def carica(percorso, colonna, prefisso):
    d = pd.read_parquet(percorso, columns=["id", colonna])
    d = d[d[colonna].notna()]
    t = pd.to_datetime(d[colonna], errors="coerce", utc=True)
    ok = t.notna()
    d, t = d[ok], t[ok]
    # la risoluzione di pandas 2.x non e' garantita (ns, us, s): si sottrae l'epoca invece di
    # dividere i tick — un // su una risoluzione sbagliata produce date del 1970 in silenzio.
    g = (t - pd.Timestamp("1970-01-01", tz="UTC")).dt.days
    letti = ignoti = 0
    for tid, gg in zip(d["id"].values, g.values):
        r = row_of.get(f"{prefisso}:{int(tid)}")
        if r is None:
            ignoti += 1
            continue
        giorni[r] = int(gg)
        letti += 1
    print(f"  {prefisso:<6} {letti:>7,} date nel catalogo · {ignoti:,} fuori catalogo")


carica(K.ML.parent / "tmdb" / "movies.parquet", "release_date", "movie")
carica(K.ML.parent / "tmdb" / "tv.parquet", "first_air_date", "tv")

np.savez_compressed(K.ML / "uscite.npz", giorni=giorni)
noti = giorni > 0
print(f"\ntotale: {int(noti.sum()):,} su {n:,} titoli con una data ({100*noti.mean():.1f}%)")
for et, m in (("film", ~is_tv), ("serie", is_tv)):
    mm = m & noti
    if mm.sum():
        d = pd.to_datetime(giorni[mm], unit="D", origin="unix")
        print(f"  {et:<6} {int(mm.sum()):>7,} ({100*mm.sum()/int(m.sum()):5.1f}%) · "
              f"mediana {np.median(giorni[mm])} · dal {d.min().date()} al {d.max().date()}")
print(f"\nsalvato in {K.ML / 'uscite.npz'}")
