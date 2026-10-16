"""00_ratings_puliti.py — il generatore di `ratings-puliti.parquet`, finalmente ritrovato.

STORIA. Il file era dichiarato «GENERATORE NON IDENTIFICATO — nessuno dei 275 script lo scrive»
(`graph/fetch/README.md`, 15/10/2026), e il senior ne aveva proposto una ricetta *sbagliata* («filtrato
per i voti >= 3.5 sugli utenti con almeno 20 film, colonne userId, movieId, timestamp»): applicandola si
ottengono 19,75M righe invece delle 31,65M che ci sono.

Il generatore vero e' **`.scratch/ml-collaborativo/ranker-pairwise.py`, righe 186-195**, ed e' questo:

    r = pd.read_csv(ML/"ml-32m"/"ratings.csv", usecols=["userId", "movieId"], dtype="int32")
    r = r[r["movieId"].map(lambda m: int(m) in mid2tmdb)]
    r = r[r["movieId"].map(lambda m: int(mid2tmdb[int(m)]) in valid)]   # valid = i tmdb del canone
    r[["userId", "movieId"]].to_parquet(CLEAN)

Spiega tutto quello che sembrava strano:

  · PERCHE' DUE COLONNE — `usecols` scarta `rating` e `timestamp` **al momento della lettura**, non
    dopo: il ranker addestrava su coppie implicite e i voti non gli servivano. Non e' un file
    mutilato, e' una **cache pigra** di una cosa costosa (mappare 32M di righe sul canone).
  · PERCHE' TIENE IL 99% DELLE RIGHE E TUTTI I 200.948 UTENTI — **non c'e' nessun filtro sui voti**.
  · PERCHE' IL 99,9% DELLE SUE RIGHE MAPPA SUL CANONE — il filtro **e'** la mappatura.

QUESTO SCRIPT FA LA STESSA COSA, E IN PIU' TIENE `rating` E `timestamp`, che l'originale buttava via.
E' retro-compatibile: chi legge chiede `userId` e `movieId` (verificato su tutti i consumatori).

    SCRIVI=1 python graph/upstream/00_ratings_puliti.py     # scrive
    python graph/upstream/00_ratings_puliti.py              # solo verifica (default)

Il canone e' cambiato dopo il 09/10/2026, quando il file fu creato: il numero di righe che esce oggi
puo' differire di poco. Lo script lo **stampa**, invece di fingere che coincida.
"""
import os
import pathlib
import sys
import time

import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import canon as K

T0 = time.time()
GREZZO = K.ROOT / ".cache" / "movielens" / "ml-32m" / "ratings.csv"
LINKS = K.ROOT / ".cache" / "movielens" / "ml-32m" / "links.csv"
USCITA = K.ROOT / ".cache" / "movielens" / "ratings-puliti.parquet"
RIGHE_STORICHE = 31_652_632          # quello che c'e' nel file creato il 09/10/2026
UTENTI_STORICI = 200_948

print("=" * 100)
print("IL GENERATORE DI ratings-puliti.parquet — ritrovato, e con due colonne in piu'")
print("=" * 100, flush=True)

links = pd.read_csv(LINKS).dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
mid2tmdb = dict(zip(links["movieId"], links["tmdbId"]))
print(f"  links.csv: {len(mid2tmdb):,} movieId mappati su un tmdbId ({time.time()-T0:.0f}s)", flush=True)

# i tmdb presenti nel canone: la regola IDENTICA all'originale (tutti, film e serie)
keys, row_of, _, is_tv = K.titoli()
valid = set(int(k.split(":")[1]) for k in keys)
solo_film = set(int(k.split(":")[1]) for k in keys if k.startswith("movie:"))
print(f"  canone: {len(valid):,} tmdb id ({len(solo_film):,} film · {len(valid)-len(solo_film):,} serie)",
      flush=True)

r = pd.read_csv(GREZZO, usecols=["userId", "movieId", "rating", "timestamp"],
                dtype={"userId": "int32", "movieId": "int32", "rating": "float32",
                       "timestamp": "int64"})
r2 = r[["userId", "movieId"]].copy()
print(f"  grezzo: {len(r):,} righe · {r.userId.nunique():,} utenti ({time.time()-T0:.0f}s)", flush=True)

r["tmdb"] = r["movieId"].map(mid2tmdb)
fuori_links = r["tmdb"].isna()
r = r[~fuori_links]
r = r[r["tmdb"].isin(valid)]
r = r.drop(columns=["tmdb"])
print(f"\n  LA RICETTA, e il confronto con il file del 09/10:", flush=True)
print(f"    righe  {len(r):>12,}   contro {RIGHE_STORICHE:>12,}  "
      f"({'coincide' if abs(len(r)-RIGHE_STORICHE) < 200_000 else 'DIVERGE'})")
print(f"    utenti {r.userId.nunique():>12,}   contro {UTENTI_STORICI:>12,}  "
      f"({'coincide' if r.userId.nunique() == UTENTI_STORICI else 'DIVERGE'})")
print(f"    film   {r.movieId.nunique():>12,}")
diff = RIGHE_STORICHE - len(r)
print(f"    differenza: {diff:+,} righe ({100*diff/RIGHE_STORICHE:+.2f}%) — il canone e' cambiato "
      f"dopo il 09/10")

# e la differenza fra la regola dell'originale (tutti i tmdb) e quella stretta (solo film):
r2 = r[["userId", "movieId"]].copy()
r2["tmdb"] = r2["movieId"].map(mid2tmdb)
stretta = r2[r2["tmdb"].notna() & r2["tmdb"].isin(solo_film)]
print(f"    (se si chiedesse il tipo 'film' invece di 'un tmdb qualsiasi': {len(stretta):,} righe, "
      f"{RIGHE_STORICHE-len(stretta):+,})")

if os.environ.get("SCRIVI") == "1":
    r.to_parquet(USCITA, index=False)
    print(f"\n  SCRITTO: {USCITA} ({USCITA.stat().st_size/1024/1024:.0f} MB) — con rating e timestamp")
    print(f"  I consumatori leggono `userId` e `movieId`: le due colonne in piu' non li toccano.")
else:
    print(f"\n  (nessuna scrittura: metti SCRIVI=1 per rigenerare il file)")
print(f"FINE ({time.time()-T0:.0f}s)")
