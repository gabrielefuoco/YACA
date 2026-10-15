"""00_pulizia_movielens.py — da `ml-32m/ratings.csv` a `ratings-puliti.parquet`.

L'ULTIMO ANELLO MANCANTE DELLA CATENA. Fino al 15/10/2026 `ratings-puliti.parquet` era un file senza
generatore: letto da 9 script, scritto da nessuno. Il senior l'ha ricostruito leggendo `.scratch/
ml-collaborativo/split-movielens.py` e `graph/upstream/spazi-trakt.py`, ed e' la ricetta di qui:

  · si tengono i voti **positivi** (`rating >= 3.5`): sotto, un voto non dice «mi piace», dice
    «l'ho visto», e usarlo come segnale positivo insegna al modello i film che all'utente non sono
    piaciuti;
  · si tengono gli utenti con **almeno 20 film** valutati: un utente con tre voti non ha un profilo,
    ha tre voti;
  · le colonne sono `userId`, `movieId`, `timestamp`.

Non entra in git (e' un artefatto da 400+ MB in `.cache/`): questo script E' la sua rigenerazione.

    python graph/upstream/00_pulizia_movielens.py
"""
import pathlib
import sys
import time

import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import canon as K

T0 = time.time()
GREZZO = K.ROOT / ".cache" / "movielens" / "ml-32m" / "ratings.csv"
USCITA = K.ROOT / ".cache" / "movielens" / "ratings-puliti.parquet"
MIN_VOTO = 3.5
MIN_FILM = 20

print("=" * 96)
print("LA PULIZIA DI MOVIELENS — l'input che non aveva generatore")
print("=" * 96, flush=True)

if not GREZZO.exists():
    raise SystemExit(f"manca {GREZZO}: scarica ml-32m e riprova")

d = pd.read_csv(GREZZO, usecols=["userId", "movieId", "rating", "timestamp"])
print(f"  letto: {len(d):,} voti · {d['userId'].nunique():,} utenti · "
      f"{d['movieId'].nunique():,} film ({time.time()-T0:.0f}s)", flush=True)

n0 = len(d)
d = d[d["rating"] >= MIN_VOTO]
print(f"  voti positivi (>= {MIN_VOTO}): {len(d):,} ({100*len(d)/n0:.1f}%)", flush=True)

conta = d.groupby("userId")["movieId"].transform("size")
n1 = len(d)
d = d[conta >= MIN_FILM]
print(f"  utenti con >= {MIN_FILM} film: {len(d):,} voti · {d['userId'].nunique():,} utenti",
      flush=True)

d = d[["userId", "movieId", "timestamp"]]
d.to_parquet(USCITA, index=False)
print(f"\n  salvato: {USCITA} ({USCITA.stat().st_size/1024/1024:.1f} MB)")
print(f"FINE ({time.time()-T0:.0f}s)")
