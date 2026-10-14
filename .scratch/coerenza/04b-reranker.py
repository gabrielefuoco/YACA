"""04b-reranker.py — la trama, misurata con un modello MULTILINGUE e a coppie.

`bge-small-en-v1.5` su trame italiane non separa: *Gone Girl* sta a **+0,542** da *Toy Story* e a
**+0,487** da *Fight Club* — un cartone piu' vicino di un thriller gemello. L'embedding comprime tutto
fra 0,48 e 0,70, e su una scala cosi' stretta le differenze non si leggono.

In cache c'e' `bge-reranker-v2-m3`: **multilingue** e a **coppie** (un cross-encoder che valuta quanto
un testo risponde a un altro). E' il modello giusto per questa domanda — «quanto si somigliano queste
DUE trame» — ed e' gia' in casa, quindi offline.

Se separa le sei coppie a risposta nota, l'arbitro esiste. Se non separa, si dice e si smette qui.
"""
import pathlib
import sys
import time

import numpy as np
import pandas as pd

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
PQ = pathlib.Path(".cache/tmdb")
print("=" * 100)
print("TICKET 04b — LA TRAMA CON UN MODELLO MULTILINGUE A COPPIE")
print("=" * 100, flush=True)

per_id = {}
TRAME = {}
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    d = pd.read_parquet(PQ / f, columns=["id", "overview", col])
    for r in d.itertuples(index=False):
        dd = r._asdict()
        per_id[(typ, int(dd["id"]))] = str(dd.get(col) or "")
        o = str(dd.get("overview") or "").strip()
        if len(o) > 40:
            TRAME[(typ, int(dd["id"]))] = o


def trova(nome, tipo="movie"):
    for (tp, i), t in per_id.items():
        if tp == tipo and nome.lower() in t.lower():
            return TRAME.get((tp, i))
    return None


from sentence_transformers import CrossEncoder
modello = CrossEncoder("BAAI/bge-reranker-v2-m3")
print(f"  reranker multilingue caricato ({time.time()-T0:.0f}s)", flush=True)

COPPIE = [
    ("Gone Girl", "Shutter Island", True, "due thriller psicologici"),
    ("Gone Girl", "Fight Club", True, "stesso pubblico e stesso tipo"),
    ("Inception", "Interstellar", True, "stesso regista e stesso tipo"),
    ("Fight Club", "Shutter Island", True, "due thriller psicologici"),
    ("Gone Girl", "Toy Story", False, "un thriller e un cartone"),
    ("Fight Club", "Toy Story", False, "un thriller e un cartone"),
    ("Inception", "La sirenetta", False, "fantascienza e fiaba"),
    ("Shutter Island", "La sirenetta", False, "thriller e fiaba"),
]
coppie = []
for a, b, atteso, perche in COPPIE:
    ta, tb = trova(a), trova(b)
    if ta is None or tb is None:
        print(f"  {a} / {b}: trama non trovata")
        continue
    coppie.append((a, b, ta, tb, atteso, perche))

punteggi = modello.predict([(x[2], x[3]) for x in coppie])
print(f"\n  {'coppia':<34} {'score':>8}  atteso · perche'")
for (a, b, _, _, atteso, perche), s in zip(coppie, punteggi):
    print(f"  {a[:14] + ' / ' + b[:16]:<34} {float(s):>8.3f}  {'SIMILI' if atteso else 'diverse':<7} · {perche}")

simili = [float(s) for (_, _, _, _, at, _), s in zip(coppie, punteggi) if at]
diverse = [float(s) for (_, _, _, _, at, _), s in zip(coppie, punteggi) if not at]
print(f"\n  medie: simili {np.mean(simili):+.3f} · diverse {np.mean(diverse):+.3f} · "
      f"separazione {np.mean(simili) - np.mean(diverse):+.3f}")
sep = np.mean(simili) - np.mean(diverse)
min_sim = min(simili)
max_div = max(diverse)
print(f"  il caso peggiore: la coppia 'simile' piu' bassa ({min_sim:+.3f}) contro la 'diversa' "
      f"piu' alta ({max_div:+.3f}) -> {'SEPARA' if min_sim > max_div else 'NON separa'}")
print(f"  ({time.time()-T0:.0f}s)")
