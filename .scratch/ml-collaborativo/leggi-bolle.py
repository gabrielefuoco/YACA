"""leggi-bolle.py — CAMPIONE LARGO DA LEGGERE, COMPATTO.

I giudizi su 4 bolle per variante sono pochi. Qui si caricano le partizioni gia' calcolate
(bolle-A/B/C/D.npy) e si stampano 24 bolle per variante in forma compatta: solo i titoli, cosi'
che si possa leggere molto di piu'.

Varianti:
  A) COMPORTAMENTO  CF + CFst + B
  B) CONTENUTO      Kc + T
  C) TUTTO con curatela
  D) TUTTO senza curatela
"""
import json, pathlib, sys
import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

keys, row_of, n, is_tv = K.titoli()
PQ = K.ROOT / ".cache" / "tmdb"
TIT, VOT = {}, np.zeros(n, np.float32)
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "vote_count"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "vote_count"])
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t, vc in zip(df["id"], df[col], df["vote_count"]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)
            VOT[r] = float(vc or 0)

QUANTE = 24
for lettera, nome in (("A", "COMPORTAMENTO (CF+CFst+B)"),
                      ("B", "CONTENUTO (Kc+T)"),
                      ("C", "TUTTO con curatela"),
                      ("D", "TUTTO senza curatela")):
    f = K.ML / f"bolle-{lettera}.npy"
    if not f.exists():
        continue
    mem = np.load(f)
    sz = np.bincount(mem)
    ids = [i for i in range(len(sz)) if 15 <= sz[i] <= 45]
    rng = np.random.default_rng(7)
    scelte = rng.choice(len(ids), size=min(QUANTE, len(ids)), replace=False)
    print("")
    print("=" * 100)
    print(f"{lettera}) {nome}   ({len(ids):,} bolle di 15-45 titoli · ne leggo {len(scelte)})")
    print("=" * 100)
    for i in scelte:
        b = ids[i]
        m = np.where(mem == b)[0]
        v = VOT[m]
        ordine = m[np.argsort(-v)]
        testa = [TIT.get(r, "?") for r in ordine[:14]]
        print("")
        print(f"  [{len(m)} titoli · serie {int(is_tv[m].sum())} · voti mediani {int(np.median(v))}]")
        print("     " + " · ".join(t[:34] for t in testa))
