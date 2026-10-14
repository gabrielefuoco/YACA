"""01c-paesi.py — il quinto bug: `leggi()` scarta i paesi perche' non sono dizionari.

`production_countries` nel parquet e' `["US"]` o `["HK"]`: una lista di STRINGHE. L'helper
`leggi()` di `bolle.py` fa `[x for x in v if isinstance(x, dict)]`, quindi restituisce sempre [].
`PAE` e' vuoto per tutti i 66.259 titoli, e il ciclo che genera le firme `pg:paese|decennio|genere`
gira su un insieme vuoto.

E' lo stesso modo di fallire di `genres` (una colonna che non si legge), ma per una ragione diversa:
qui la colonna c'e' ed e' piena — e' la FORMA del valore a non essere quella attesa.

Misura il danno: quanti titoli hanno un paese, quante firme nascono con la lettura corretta, e
quante con quella rotta.
"""
import json
import pathlib
import sys
from collections import Counter

import numpy as np
import pandas as pd

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

PQ = K.ROOT / ".cache" / "tmdb"
TONNO = ("US", "USA", "GB", "UK")


def leggi_rotto(s):
    """Come `bolle.leggi`: tiene solo i dizionari."""
    try:
        v = json.loads(s) if isinstance(s, str) else (s or [])
        return [x for x in v if isinstance(x, dict)]
    except Exception:
        return []


def leggi_giusto(s):
    """Accetta anche le stringhe: e' quello che il parquet contiene."""
    try:
        v = json.loads(s) if isinstance(s, str) else (s or [])
        return [x for x in v if isinstance(x, (dict, str))]
    except Exception:
        return []


D = {"righe": 0, "paese_rotto": 0, "paese_giusto": 0, "non_us": 0, "pg": 0,
     "paesi": Counter(), "per_lingua": Counter()}
for f in ("movies.parquet", "tv.parquet"):
    d = pd.read_parquet(PQ / f, columns=["id", "production_countries", "original_language"])
    for riga in d.itertuples(index=False):
        did, pc, ol = riga
        r = B.ROW_OF.get(f"movie:{int(did)}") or B.ROW_OF.get(f"tv:{int(did)}")
        if r is None:
            continue
        D["righe"] += 1
        rotto = {str(x.get("iso_3166_1") or x.get("name") or "").upper()
                 for x in leggi_rotto(pc)}
        giusto = {(x if isinstance(x, str) else str(x.get("iso_3166_1") or x.get("name") or ""))
                  .upper() for x in leggi_giusto(pc)}
        rotto.discard("")
        giusto.discard("")
        if rotto:
            D["paese_rotto"] += 1
        if giusto:
            D["paese_giusto"] += 1
            for p in giusto:
                D["paesi"][p] += 1
        if giusto - set(TONNO):
            D["non_us"] += 1
            D["per_lingua"][str(ol)] += 1
        D["pg"] += len(giusto - set(TONNO))

print("=" * 96)
print("IL QUINTO BUG — `production_countries` e' una lista di stringhe, non di dizionari")
print("=" * 96)
print(f"  titoli nel canone:                          {D['righe']:,}")
print(f"  con un paese letto da `leggi()` (rotto):    {D['paese_rotto']:,}  <-- sempre 0")
print(f"  con un paese letto correttamente:           {D['paese_giusto']:,}")
print(f"  con almeno un paese NON angloamericano:     {D['non_us']:,}  "
      f"({100*D['non_us']/D['righe']:.1f}%)")
print(f"  firme `pg:paese|decennio|genere` possibili: {D['pg']:,}  <-- erano 0")
print(f"\n  i 15 paesi piu' frequenti: {D['paesi'].most_common(15)}")
print(f"\n  i 10 titoli non angloamericani per lingua originale: {D['per_lingua'].most_common(10)}")

# e le firme come le costruirebbe bolle.py con PAE pieno
print(f"\n  quello che `bolle.py` guadagnerebbe: {D['pg']:,} firme `pg:`, che oggi sono 0 su 41.268.")
print(f"  E sono esattamente il segnale che l'esperto chiede per le serie in §1.2:")
print(f"  «il Paese + Lingua (KR, JP, TR, ES, NO)», che nello spazio bersaglio dello studente")
print(f"  e' «pochissimo sfruttato o assente». Non era una scelta: era questo.")
