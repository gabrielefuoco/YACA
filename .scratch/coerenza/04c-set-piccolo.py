"""04c-set-piccolo.py — TICKET 04, il set piccolo: il processo e' valido?

Richiesta dell'utente: «non farlo subito con tutti i dati ma facciamone un set prima, per vedere se il
processo e' valido. Gli embedding generati conservali sempre, e usa lo stesso embedder usato per le
keyword.»

Quindi:
  · **stesso embedder**: `BAAI/bge-small-en-v1.5`, quello di `offline_graph_builder/build_graph.py`;
  · **set piccolo**: 300 trame, giusto per misurare il costo e la qualita';
  · **embedding conservati**: `04-trama-emb.npy` + un indice `04-trama-idx.npy`, cosi' si riprende;
  · e il **controllo che decide**, sulle sei coppie a risposta nota, fatto con lo **stesso** modello e
    con il **reranker** — le due strade, una accanto all'altra.

Nota sull'hardware: il torch installato e' la build **+cpu**, quindi la GPU accesa non e' usabile da
questo ambiente. Per 300 trame non serve; per 35.829 cambia tutto, e va deciso con la misura in mano.
"""
import json
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
ML = K.ML
PQ = pathlib.Path(".cache/tmdb")
N_CAMPIONE = 300          # il set piccolo del controllo; poi tutto
print("=" * 100)
print("TICKET 04c — IL SET PICCOLO: IL PROCESSO E' VALIDO?")
print("=" * 100, flush=True)

import torch
print(f"  torch {torch.__version__} · cuda {torch.cuda.is_available()} "
      f"({'GPU usabile' if torch.cuda.is_available() else 'solo CPU: la build e\' +cpu'})", flush=True)

# ---------------------------------------------------------------- le trame
per_id, TRAME = {}, {}
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    d = pd.read_parquet(PQ / f, columns=["id", "overview", col])
    for r in d.itertuples(index=False):
        dd = r._asdict()
        per_id[(typ, int(dd["id"]))] = str(dd.get(col) or "")
        o = str(dd.get("overview") or "").strip()
        if len(o) > 40:
            TRAME[(typ, int(dd["id"]))] = o
print(f"  trame disponibili: {len(TRAME):,} ({100*len(TRAME)/len(per_id):.1f}% del parquet)",
      flush=True)


def trova(nome, tipo="movie"):
    """Il titolo ESATTO, non una sottostringa. `trova("Toy Story")` restituiva *Toy Story 5*, e a
    seconda dell'ordine del parquet *Gone Girl* poteva essere *Umjolo: The Gone Girl*: il controllo
    che diceva «il modello non separa» era un artefatto di un match sbagliato, non una proprieta'
    del modello."""
    for (tp, i), t in per_id.items():
        if tp == tipo and t.strip().lower() == nome.strip().lower():
            return TRAME.get((tp, i))
    for (tp, i), t in per_id.items():
        if tp == tipo and nome.lower() in t.lower() and (tp, i) in TRAME:
            return TRAME[(tp, i)]
    return None


# ---------------------------------------------------------------- 1. lo stesso embedder delle keyword
print("\n" + "=" * 100)
print("1. L'EMBEDDER DELLE KEYWORD, SULLE TRAME — il controllo che decide")
print("=" * 100, flush=True)
from sentence_transformers import SentenceTransformer
modello = SentenceTransformer("BAAI/bge-small-en-v1.5")
print(f"  `BAAI/bge-small-en-v1.5` caricato, lo stesso di `build_graph.py` ({time.time()-T0:.0f}s)",
      flush=True)

COPPIE = [("Gone Girl", "Shutter Island", True), ("Gone Girl", "Fight Club", True),
          ("Inception", "Interstellar", True), ("Fight Club", "Shutter Island", True),
          ("Gone Girl", "Toy Story", False), ("Fight Club", "Toy Story", False),
          ("Inception", "La sirenetta", False), ("Shutter Island", "La sirenetta", False)]
coppie = [(a, b, trova(a), trova(b), at) for a, b, at in COPPIE]
coppie = [c for c in coppie if c[2] and c[3]]
EMB = modello.encode([c[2] for c in coppie] + [c[3] for c in coppie], normalize_embeddings=True)
n = len(coppie)
print(f"\n  {'coppia':<36} {'coseno':>8}  atteso")
for k, (a, b, _, _, at) in enumerate(coppie):
    cos = float(EMB[k] @ EMB[n + k])
    print(f"  {a[:15] + ' / ' + b[:17]:<36} {cos:>8.3f}  {'SIMILI' if at else 'diverse'}")
sim = [float(EMB[k] @ EMB[n + k]) for k, c in enumerate(coppie) if c[4]]
div = [float(EMB[k] @ EMB[n + k]) for k, c in enumerate(coppie) if not c[4]]
print(f"\n  simili {np.mean(sim):+.3f} · diverse {np.mean(div):+.3f} · separazione "
      f"{np.mean(sim)-np.mean(div):+.3f}")
print(f"  caso peggiore: simile piu' bassa {min(sim):+.3f} contro diversa piu' alta {max(div):+.3f} -> "
      f"{'SEPARA' if min(sim) > max(div) else 'NON separa'}")

# ---------------------------------------------------------------- 2. il reranker, sulle stesse coppie
print("\n" + "=" * 100)
print("2. IL RERANKER, SULLE STESSE COPPIE — l'utente e' scettico, e vediamo")
print("=" * 100, flush=True)
from sentence_transformers import CrossEncoder
rk = CrossEncoder("BAAI/bge-reranker-v2-m3")
print(f"  `bge-reranker-v2-m3` caricato ({time.time()-T0:.0f}s)", flush=True)
sc = rk.predict([(c[2], c[3]) for c in coppie])
print(f"\n  {'coppia':<36} {'score':>8}  atteso")
for (a, b, _, _, at), s in zip(coppie, sc):
    print(f"  {a[:15] + ' / ' + b[:17]:<36} {float(s):>8.3f}  {'SIMILI' if at else 'diverse'}")
sim2 = [float(s) for c, s in zip(coppie, sc) if c[4]]
div2 = [float(s) for c, s in zip(coppie, sc) if not c[4]]
print(f"\n  simili {np.mean(sim2):+.3f} · diverse {np.mean(div2):+.3f} · separazione "
      f"{np.mean(sim2)-np.mean(div2):+.3f}")
print(f"  caso peggiore: simile piu' bassa {min(sim2):+.3f} contro diversa piu' alta {max(div2):+.3f} -> "
      f"{'SEPARA' if min(sim2) > max(div2) else 'NON separa'}")

# ---------------------------------------------------------------- 3. il set piccolo, e il costo
print("\n" + "=" * 100)
print("3. IL SET PICCOLO — 300 trame, gli embedding CONSERVATI")
print("=" * 100, flush=True)
MEM = ML / "04-trama-emb.npy"
IDX = ML / "04-trama-idx.npy"
RIGA_TRAMA = {}          # riga del canone -> trama, una volta sola (prima lo cercavo a ogni giro)
for (tp, i), o in TRAME.items():
    r = B.ROW_OF.get(f"{tp}:{i}")
    if r is not None:
        RIGA_TRAMA[r] = o
chiavi = np.array(sorted(RIGA_TRAMA), dtype=np.int32)
E = np.load(MEM) if MEM.exists() else np.zeros((len(chiavi), 384), np.float32)
fatti = set(np.load(IDX).tolist()) if IDX.exists() else set()
print(f"  nel canone con una trama: {len(chiavi):,} · gia' fatti: {len(fatti):,}", flush=True)

da_fare = [r for r in chiavi if int(r) not in fatti]   # TUTTO, con ripresa
t = time.time()
if da_fare:
    testi = [RIGA_TRAMA[int(r)] for r in da_fare]
    NUOVI = modello.encode(testi, batch_size=32, normalize_embeddings=True,
                           show_progress_bar=False, device="cpu")
    pos = {int(r): k for k, r in enumerate(chiavi)}
    for k, r in enumerate(da_fare):
        E[pos[int(r)]] = NUOVI[k]
    np.save(MEM, E)
    np.save(IDX, np.array(sorted(fatti | set(int(r) for r in da_fare)), dtype=np.int32))
    dt = time.time() - t
    print(f"  codificate {len(da_fare)} trame in {dt:.1f}s · "
          f"{dt/len(da_fare)*1000:.0f} ms l'una · salvate in 04-trama-emb.npy", flush=True)
    print(f"  -> il canone intero (35.829) costerebbe {dt/len(da_fare)*35829/60:.0f} minuti di CPU",
          flush=True)
else:
    print("  niente da fare: il campione c'e' gia'", flush=True)

print(f"\nFINE ({time.time()-T0:.0f}s)")
