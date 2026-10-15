"""04g-gemelli.py — il test giusto: i FILM GEMELLI, non le saghe.

Il test precedente chiedeva al modello di trovare simili due film della STESSA SAGA. Ma *Toy Story 2* e
*Toy Story 5* raccontano storie DIVERSE — e' il mestiere del sequel. Se il modello dice che le loro
trame differiscono, ha ragione lui, e il mio terreno di verita' era sbagliato.

I "twin films" sono la prova corretta: due studi che nello stesso anno fanno lo STESSO film.
  Armageddon / Deep Impact        un asteroide minaccia la Terra
  A Bug's Life / Antz             una formica ribelle
  Dante's Peak / Volcano          un vulcano erutta su una cittadina
  The Prestige / The Illusionist  un mago nell'Ottocento
  Tombstone / Wyatt Earp          la sparatoria all'OK Corral
  Olympus Has Fallen / White House Down   la Casa Bianca occupata
  No Strings Attached / Friends with Benefits   due amici che finiscono a letto
  Capote / Infamous               Truman Capote scrive A sangue freddo

E il confronto e' con coppie a caso dello stesso decennio. Se il modello separa QUESTE, funziona e il
test di prima era sbagliato. Se non le separa nemmeno cosi', allora non legge le trame.
"""
import json, sys, time, urllib.request
import numpy as np, pandas as pd, pathlib

PQ = pathlib.Path(".cache/tmdb")
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "title_en", "overview",
                                                     "release_date", "vote_count"])
TRAME, NOMI, ANNI, VOTI = {}, {}, {}, {}
for r in mv.itertuples(index=False):
    o = str(r.overview or "").strip()
    if len(o) > 40:
        TRAME[int(r.id)] = o
    # `title_en` e' NaN, non vuoto — e `NaN or title` restituisce NaN, non il titolo italiano.
    # Con quel bug tutti i NOMI erano la stringa "nan", e il test non trovava nessun film.
    ten = r.title_en if isinstance(r.title_en, str) and r.title_en.strip() else r.title
    NOMI[int(r.id)] = str(ten or "")
    ANNI[int(r.id)] = int(str(r.release_date or "0")[:4] or 0)
    VOTI[int(r.id)] = int(r.vote_count or 0)


def trova(titolo, anno=None):
    """Il film col titolo inglese ESATTO (o quasi) e l'anno giusto. La sottostringa mi ha gia' ingannato."""
    for i, n in NOMI.items():
        if n.strip().lower() == titolo.lower() and (anno is None or abs(ANNI[i] - anno) <= 2):
            if i in TRAME:
                return i
    for i, n in NOMI.items():
        if titolo.lower() in n.lower() and (anno is None or abs(ANNI[i] - anno) <= 2):
            if i in TRAME:
                return i
    return None


GEMELLI = [("Armageddon", 1998, "Deep Impact", 1998), ("A Bug's Life", 1998, "Antz", 1998),
           ("Dante's Peak", 1997, "Volcano", 1997), ("The Prestige", 2006, "The Illusionist", 2006),
           ("Tombstone", 1993, "Wyatt Earp", 1994),
           ("Olympus Has Fallen", 2013, "White House Down", 2013),
           ("No Strings Attached", 2011, "Friends with Benefits", 2011),
           ("Capote", 2005, "Infamous", 2006)]
coppie = []
for a, ya, b, yb in GEMELLI:
    ia, ib = trova(a, ya), trova(b, yb)
    if ia and ib:
        coppie.append((ia, ib, True, f"{NOMI[ia][:22]} / {NOMI[ib][:22]}"))
    else:
        print(f"  non trovate: {a} ({ia}) / {b} ({ib})")
print(f"\n  gemelli trovati: {len(coppie)}/{len(GEMELLI)}")

# e i controlli: coppie a caso fra i titoli piu' popolari, dello stesso periodo
rng = np.random.default_rng(7)
pop = sorted([i for i in TRAME if VOTI.get(i, 0) > 500], key=lambda z: -VOTI[z])[:400]
for _ in range(len(coppie)):
    i, j = rng.choice(pop, 2, replace=False)
    while abs(ANNI[i] - ANNI[j]) > 6:
        i, j = rng.choice(pop, 2, replace=False)
    coppie.append((int(i), int(j), False, f"a caso: {NOMI[int(i)][:20]} / {NOMI[int(j)][:20]}"))

def embed(modello, testi):
    corpo = json.dumps({"model": modello, "input": testi}).encode()
    req = urllib.request.Request("http://localhost:11434/api/embed", data=corpo,
                                headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return np.array(json.loads(r.read())["embeddings"], dtype=np.float32)


mod = sys.argv[1] if len(sys.argv) > 1 else "qwen3-embedding:0.6b"
testi = [TRAME[a] for a, b, at, p in coppie] + [TRAME[b] for a, b, at, p in coppie]
E = embed(mod, testi)
E /= (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
n = len(coppie)
print(f"\n  {mod}")
print(f"  {'coppia':<52} {'coseno':>7}")
for k, (a, b, at, per) in enumerate(coppie):
    print(f"  {per[:50]:<52} {float(E[k] @ E[n + k]):>7.3f}  {'GEMELLI' if at else 'a caso'}")
sim = [float(E[k] @ E[n + k]) for k, c in enumerate(coppie) if c[2]]
div = [float(E[k] @ E[n + k]) for k, c in enumerate(coppie) if not c[2]]
print(f"\n  GEMELLI {np.mean(sim):+.3f} (min {min(sim):+.3f}) · A CASO {np.mean(div):+.3f} "
      f"(max {max(div):+.3f}) · separazione {np.mean(sim)-np.mean(div):+.3f}")
print(f"  -> {'SEPARA' if min(sim) > max(div) else 'NON separa'}")
