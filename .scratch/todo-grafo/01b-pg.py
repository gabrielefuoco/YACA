"""01b-pg.py — perche' le firme `pg:paese|decennio|genere` non nascono, se non e' (solo) `genres`.

Il ticket 01 sosteneva che fossero 0 perche' il ciclo `for g in GEN[r]` girava a vuoto. Il ticket 02
mostra che con `genres` guarito sono **ancora** 0: la spiegazione era incompleta. Qui si misura quale
delle tre condizioni manca, una per una:

    if DEC[r] > 0:  and  non_us  and  for g in GEN[r]
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
COLS = {"movie": ["id", "genres", "production_countries", "release_date"],
        "tv": ["id", "genres", "production_countries", "first_air_date"]}


def leggi(s):
    try:
        v = json.loads(s) if isinstance(s, str) else (s or [])
        return [x for x in v if isinstance(x, dict)]
    except Exception:
        return []


TOT = {"righe": 0, "pae_pieno": 0, "dec_ok": 0, "non_us": 0, "gen_pieno": 0,
       "tutte_e_tre": 0, "paesi": Counter(), "esempi": []}

for typ, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
    d = pd.read_parquet(PQ / f, columns=COLS[typ])
    for riga in d.itertuples(index=False):
        dd = dict(zip(COLS[typ], riga))
        r = B.ROW_OF.get(f"{typ}:{int(dd['id'])}")
        if r is None:
            continue
        TOT["righe"] += 1
        pae = {str(x.get("iso_3166_1") or x.get("name") or "").upper()
               for x in leggi(dd.get("production_countries"))}
        pae.discard("")
        gen = {str(x.get("name", "")).lower() for x in leggi(dd.get("genres"))}
        dt = dd.get("release_date") if typ == "movie" else dd.get("first_air_date")
        dec = -1
        if dt:
            try:
                dec = int(str(dt)[:4]) // 10 * 10
            except Exception:
                dec = -1
        non_us = {p for p in pae if p not in ("US", "USA", "GB", "UK")}
        if pae:
            TOT["pae_pieno"] += 1
            for p in pae:
                TOT["paesi"][p] += 1
        if dec > 0:
            TOT["dec_ok"] += 1
        if non_us:
            TOT["non_us"] += 1
        if gen:
            TOT["gen_pieno"] += 1
        if dec > 0 and non_us and gen:
            TOT["tutte_e_tre"] += 1
            if len(TOT["esempi"]) < 5:
                TOT["esempi"].append((typ, dd["id"], sorted(pae), dec, sorted(gen)[:3]))

print("=" * 96)
print("PERCHE' LE FIRME `pg:` NON NASCONO")
print("=" * 96)
print(f"  righe con un indice nel canone: {TOT['righe']:,}")
print(f"  con production_countries non vuoto: {TOT['pae_pieno']:,} "
      f"({100*TOT['pae_pieno']/TOT['righe']:.1f}%)")
print(f"  con decennio valido (DEC > 0):     {TOT['dec_ok']:,} "
      f"({100*TOT['dec_ok']/TOT['righe']:.1f}%)")
print(f"  con un paese NON angloamericano:   {TOT['non_us']:,} "
      f"({100*TOT['non_us']/TOT['righe']:.1f}%)")
print(f"  con almeno un genere:              {TOT['gen_pieno']:,} "
      f"({100*TOT['gen_pieno']/TOT['righe']:.1f}%)")
print(f"\n  TUTTE E TRE -> firme `pg:` attese: {TOT['tutte_e_tre']:,}")
print(f"\n  i 15 paesi piu' frequenti: {TOT['paesi'].most_common(15)}")
print(f"\n  esempi che le soddisfano:")
for typ, i, pae, dec, gen in TOT["esempi"]:
    print(f"    {typ}:{i} paesi={pae} decennio={dec} generi={gen}")
