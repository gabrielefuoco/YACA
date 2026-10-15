"""04e-modelli.py — quale embedder per le trame italiane?

Il criterio NON e' il leaderboard: e' se **separa** le coppie che conosciamo, su testi ITALIANI.

`bge-small-en` (inglese, quello delle keyword) comprime tutto in 0,74 ± 0,01 e non discrimina. I
candidati multilingue via Ollama:

  qwen3-embedding:0.6b   596M · 1024 dim · 32k contesto · instruction-aware · top della sua classe
  bge-m3                 568M · 1024 dim ·  8k contesto · 100+ lingue · dense+sparse+ColBERT

Venti coppie identificate per **ID TMDB**, non per titolo: la sottostringa mi aveva gia' ingannato una
volta («Toy Story» -> Toy Story 5, «Gone Girl» -> Umjolo: The Gone Girl).

  ATTESE ALTE: stesso film/saga, stesso genere e tono
  ATTESE BASSE: generi incompatibili
La coppia di controllo e' Toy Story / Toy Story 2: se il modello non mette vicinissimi due film della
stessa saga, non serve a niente.
"""
import json, sys, time, urllib.request

OLLAMA = "http://localhost:11434/api/embed"
TRAME = {}
import pathlib
sys.path.insert(0, ".scratch/bolle-nitrile")
import bolle as B
import pandas as pd
PQ = pathlib.Path(".cache/tmdb")
for typ, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
    d = pd.read_parquet(PQ / f, columns=["id", "overview"])
    for r in d.itertuples(index=False):
        o = str(r.overview or "").strip()
        if len(o) > 40:
            TRAME[int(r.id)] = o

COPPIE = [
    (862, 863, True,  "Toy Story / Toy Story 2 — stessa saga, il controllo"),
    (862, 1084244, True, "Toy Story / Toy Story 5 — stessa saga"),
    (129, 4935, True,  "La citta' incantata / Il castello errante — stesso studio e tono"),
    (238, 240, True,   "Il padrino / Quei bravi ragazzi — stessa scuola"),
    (680, 240, True,   "Pulp Fiction / Quei bravi ragazzi — crime d'autore"),
    (550, 11324, True, "Fight Club / Shutter Island — thriller psicologico"),
    (27205, 157336, True, "Inception / Interstellar — stesso regista"),
    (11324, 210577, True, "Shutter Island / Gone Girl — thriller psicologico"),
    (807, 274, True,   "Seven / Il silenzio degli innocenti — serial killer"),
    (12, 863, True,    "Alla ricerca di Nemo / Toy Story 2 — animazione per famiglie"),
    (585, 12, True,    "Monsters & Co. / Nemo — Pixar"),
    (862, 27205, False, "Toy Story / Inception — un cartone e un mind-bender"),
    (862, 550, False,  "Toy Story / Fight Club — un cartone e un thriller"),
    (863, 274, False,  "Toy Story 2 / Il silenzio degli innocenti — cartone e serial killer"),
    (585, 680, False,  "Monsters & Co. / Pulp Fiction — cartone e crime"),
    (12, 11324, False, "Nemo / Shutter Island — cartone e thriller"),
    (238, 862, False,  "Il padrino / Toy Story — mafia e giocattoli"),
    (129, 274, False, "La citta' incantata / Il silenzio degli innocenti"),
    (680, 863, False,  "Pulp Fiction / Toy Story 2 — crime e cartone"),
    (4935, 807, False, "Il castello errante / Seven — fiaba e serial killer"),
]
coppie = [(a, b, at, per) for a, b, at, per in COPPIE if a in TRAME and b in TRAME]
print(f"  trame trovate: {len(coppie)}/{len(COPPIE)} coppie", flush=True)


def embed(modello, testi):
    corpo = json.dumps({"model": modello, "input": testi}).encode()
    req = urllib.request.Request(OLLAMA, data=corpo, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())["embeddings"]


def prova(modello):
    print(f"\n{'='*100}\n{modello}\n{'='*100}", flush=True)
    testi = [TRAME[a] for a, b, at, p in coppie] + [TRAME[b] for a, b, at, p in coppie]
    t = time.time()
    E = embed(modello, testi)
    dt = time.time() - t
    import numpy as np
    E = np.array(E, dtype=np.float32)
    E /= (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
    n = len(coppie)
    sim = [float(E[k] @ E[n + k]) for k in range(n) if coppie[k][2]]
    div = [float(E[k] @ E[n + k]) for k in range(n) if not coppie[k][2]]
    print(f"  {len(testi)} testi in {dt:.1f}s · {dt/len(testi)*1000:.0f} ms l'uno · "
          f"proiezione ~{dt/len(testi)*35829/60:.0f} min per il catalogo", flush=True)
    print(f"\n  {'coppia':<54} {'coseno':>7}  atteso")
    for k, (a, b, at, per) in enumerate(coppie):
        print(f"  {per[:52]:<54} {float(E[k] @ E[n + k]):>7.3f}  {'SIMILI' if at else 'diverse'}")
    print(f"\n  ATTESE ALTE: {np.mean(sim):+.3f} (min {min(sim):+.3f} · max {max(sim):+.3f})")
    print(f"  ATTESE BASSE: {np.mean(div):+.3f} (max {max(div):+.3f})")
    sep = np.mean(sim) - np.mean(div)
    print(f"  SEPARAZIONE: {sep:+.3f} · caso peggiore {min(sim):+.3f} contro {max(div):+.3f} -> "
          f"{'SEPARA' if min(sim) > max(div) else 'NON separa'}")
    print(f"  (riferimento: bge-small-en dava simili 0,723 · diverse 0,617 · separazione +0,105, "
          f"ma su trame italiane comprimeva tutto in 0,74 ± 0,01)")
    return sep, min(sim) > max(div)


def throughput(modello, quante=1500, lotto=200):
    """Il costo vero: il primo giro paga il caricamento del modello, e su 40 testi e' tutto.

    I testi si mandano a lotti: una richiesta da 1.500 testi a Ollama risponde 400 Bad Request
    (limite del server). 200 per volta va bene e non cambia il throughput.
    """
    import numpy as np
    testi = list(TRAME.values())[:quante]
    t = time.time()
    embed(modello, testi[:50])
    t1 = time.time() - t
    t = time.time()
    for k in range(0, len(testi), lotto):
        embed(modello, testi[k:k + lotto])
    t2 = time.time() - t
    print(f"\n  throughput: primi 50 in {t1:.1f}s (col caricamento) · {len(testi)} in {t2:.1f}s "
          f"-> {t2/len(testi)*1000:.0f} ms l'uno · catalogo in {t2/len(testi)*35829/60:.1f} min")
    return t2 / len(testi)


if __name__ == "__main__":
    for m in sys.argv[1:] or ["qwen3-embedding:0.6b", "bge-m3"]:
        try:
            prova(m)
            throughput(m)
        except Exception as e:
            print(f"\n  {m}: {type(e).__name__}: {str(e)[:120]}", flush=True)
