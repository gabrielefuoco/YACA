"""04i-payload.py — il payload: solo trama, o titolo + trama?

Idea dell'utente. Il motivo per cui e' sensata: il titolo e' l'unica informazione che il collocatore
**non usa** (lavora su keyword, generi, cast, registi, reti, case, paesi), quindi aggiungerlo alla
metrica NON la rende circolare — mentre le keyword la renderebbero tale, e infatti si escludono.

Tre payload, misurati su DUE test che chiedono cose diverse:

  SAGHE (20 coppie)      Toy Story / Toy Story 2 — il titolo dovrebbe aiutare MOLTO
  GEMELLI (5 coppie)     Armageddon / Deep Impact — qui conta la storia, non il nome

  A. trama                       com'e' adesso
  B. titolo + trama
  C. titolo (anno) + trama       l'anno e' informazione vera o un trucco? I gemelli sono lo STESSO
                                 anno, quindi l'anno li avvicina per costruzione: se C vince solo sui
                                 gemelli, sta barando.
"""
import json, sys, time, urllib.request
import numpy as np, pandas as pd, pathlib

PQ = pathlib.Path(".cache/tmdb")
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "title_en", "overview",
                                                     "release_date", "vote_count"])
TRAME, TIT, ANNO, VOTI = {}, {}, {}, {}
for r in mv.itertuples(index=False):
    i = int(r.id)
    o = str(r.overview or "").strip()
    if len(o) > 40:
        TRAME[i] = o
    ten = r.title_en if isinstance(r.title_en, str) and r.title_en.strip() else r.title
    TIT[i] = str(ten or "")
    ANNO[i] = int(str(r.release_date or "0")[:4] or 0)
    VOTI[i] = int(r.vote_count or 0)

SAGHE = [(862, 863, True), (862, 1084244, True), (129, 4935, True), (238, 240, True), (680, 240, True),
         (550, 11324, True), (27205, 157336, True), (11324, 210577, True), (807, 274, True),
         (12, 863, True), (585, 12, True),
         (862, 27205, False), (862, 550, False), (863, 274, False), (585, 680, False),
         (12, 11324, False), (238, 862, False), (129, 274, False), (680, 863, False),
         (4935, 807, False)]


def trova(titolo, anno):
    for i, n in TIT.items():
        if n.strip().lower() == titolo.lower() and abs(ANNO[i] - anno) <= 2 and i in TRAME:
            return i
    for i, n in TIT.items():
        if titolo.lower() in n.lower() and abs(ANNO[i] - anno) <= 2 and i in TRAME:
            return i
    return None


GEMELLI = []
for a, ya, b, yb in [("Armageddon", 1998, "Deep Impact", 1998),
                     ("The Prestige", 2006, "The Illusionist", 2006),
                     ("Tombstone", 1993, "Wyatt Earp", 1994),
                     ("Olympus Has Fallen", 2013, "White House Down", 2013),
                     ("Capote", 2005, "Infamous", 2006)]:
    ia, ib = trova(a, ya), trova(b, yb)
    if ia and ib:
        GEMELLI.append((ia, ib))
gem = [(a, b, True) for a, b in GEMELLI]
rng = np.random.default_rng(7)
pop = sorted([i for i in TRAME if VOTI.get(i, 0) > 500], key=lambda z: -VOTI[z])[:400]
for _ in range(len(gem)):
    i, j = rng.choice(pop, 2, replace=False)
    while abs(ANNO[i] - ANNO[j]) > 6:
        i, j = rng.choice(pop, 2, replace=False)
    gem.append((int(i), int(j), False))

PAYLOAD = {
    "A. trama": lambda i: TRAME[i],
    "B. titolo + trama": lambda i: f"{TIT[i]}. {TRAME[i]}",
    "C. titolo (anno) + trama": lambda i: f"{TIT[i]} ({ANNO[i]}). {TRAME[i]}",
}


def embed(testi):
    corpo = json.dumps({"model": "qwen3-embedding:0.6b", "input": testi}).encode()
    req = urllib.request.Request("http://localhost:11434/api/embed", data=corpo,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return np.array(json.loads(r.read())["embeddings"], dtype=np.float32)


def misura(coppie, nome_test, prep):
    testi = [prep(a) for a, b, at in coppie] + [prep(b) for a, b, at in coppie]
    E = embed(testi)
    E /= (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
    n = len(coppie)
    sim = [float(E[k] @ E[n + k]) for k, c in enumerate(coppie) if c[2]]
    div = [float(E[k] @ E[n + k]) for k, c in enumerate(coppie) if not c[2]]
    return np.mean(sim), np.mean(div), min(sim), max(div)


print("=" * 100)
print("IL PAYLOAD — tre varianti, due test")
print("=" * 100, flush=True)
print(f"  autori: {len(SAGHE)} coppie di saghe · {len(gem)} coppie di gemelli ({len(GEMELLI)} vere)")
print(f"\n  {'payload':<26} {'test':<10} {'simili':>8} {'diverse':>8} {'separ.':>8} {'min sim':>8} {'max div':>8}")
for nome, prep in PAYLOAD.items():
    for coppie, etichetta in ((SAGHE, "saghe"), (gem, "gemelli")):
        try:
            s, d, mn, mx = misura(coppie, etichetta, prep)
            print(f"  {nome:<26} {etichetta:<10} {s:>8.3f} {d:>8.3f} {s-d:>8.3f} {mn:>8.3f} {mx:>8.3f}",
                  flush=True)
        except Exception as e:
            print(f"  {nome}: {type(e).__name__}: {str(e)[:80]}")
