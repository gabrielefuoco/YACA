"""verity.py — perché Verity finisce con Fight Club, e di chi è la colpa.

Obiezione dell'utente (14/10/2026), ed e' quella giusta da fare:
  «Verity non c'entra niente con Fight Club, Inception. Magari con Gone Girl si', ma non e' nella
   bolla giusta: e' un thriller psicologico con qualche jump scare e tensione costante.»

La domanda che decide cosa riparare: il difetto e' del **collocatore** (che sbaglia mira) o della
**bolla** (che e' larga)? Le due cose si distinguono cosi':

  · il collocatore usa il **centroide** della bolla, cioe' la MEDIA dei suoi membri. Se la bolla e'
    un minestrone, il centroide e' un minestrone per costruzione, e nessun collocatore puo' fare
    meglio di cosi' — puo' solo scegliere meglio fra i minestroni.
  · quindi si guarda lo stesso segnale SENZA la media: i titoli piu' vicini a Verity, uno per uno.
    Se i vicini sono thriller psicologici coerenti e le loro bolle sono sparse, allora la partizione
    non ha quel mondo, e il problema e' a monte.

E si cerca la bolla giusta: quante bolle hanno `kw:psychological thriller` fra i termini del
centroide, e chi c'e' dentro.
"""
import json
import pathlib
import sys

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import colloca_finale as CF
import bolle as B
import canone as K

S = CF.carica()
mem = S["mem"]
sz = S["sz"]
TIT, VOT = B.titoli_leggibili()
PQ = pathlib.Path(".cache/tmdb")
TFIDF = sp.load_npz(K.ML / "04-tfidf.npz").tocsr()

print("=" * 100)
print("PERCHE' VERITY FINISCE CON FIGHT CLUB")
print("=" * 100, flush=True)

# ---------------------------------------------------------------- Verity
mv = pd.read_parquet(PQ / "movies.parquet")
v = mv[mv["id"] == 1283515]
print(f"\n  Verity nel parquet: {len(v)} riga(e)")
dd = v.iloc[0].to_dict()
print(f"  titolo {dd.get('title')} ({dd.get('release_date')}) · voti {dd.get('vote_count')}")
print(f"  nel grafo? {'sì' if B.ROW_OF.get('movie:1283515') is not None else 'NO (fuori dal canone)'}")
gen = json.loads(dd["genres"]) if isinstance(dd["genres"], str) else dd["genres"]
kw = json.loads(dd["keywords"]) if isinstance(dd["keywords"], str) else dd["keywords"]
print(f"  generi: {[x['name'] for x in gen]}")
print(f"  keyword: {[x['name'] for x in kw][:18]}")

tok = CF.tokenizza(dd, "movie")
print(f"\n  token ({len(tok)}): {' · '.join(sorted(tok)[:22])}")

b, conf, ntok, fuori = CF.colloca(dd, "movie", S)
print(f"\n  collocato: bolla {b} (coseno {conf:.3f}) · {ntok} termini, {fuori} fuori vocabolario")

# ---------------------------------------------------------------- la bolla 820, per intero
membri = np.where(mem == b)[0]
print(f"\n  LA BOLLA {b} PER INTERO ({len(membri)} titoli):")
for x in membri:
    print(f"     {TIT[x][:50]:<52} voti {int(VOT[x]):>7,}")

# i termini che pesano di piu' nel suo centroide
vocab = S["vocab"]
inv = {i: t for t, i in vocab.items()}
j = int(np.where(S["TUTTE"] == b)[0][0])
vett = S["SUM"][j].toarray().ravel()
top = np.argsort(-vett)[:14]
print(f"\n  e i termini che la definiscono:")
print(f"     {' · '.join(inv[int(t)] for t in top if vett[t] > 0)}")

# ---------------------------------------------------------------- senza la media: i vicini
print("\n" + "=" * 100)
print("LO STESSO SEGNALE SENZA LA MEDIA — i venti titoli piu' vicini a Verity")
print("=" * 100, flush=True)
vec, _ = CF.vettore(tok, S)
cos = np.asarray((vec @ TFIDF.T).todense()).ravel()
vicini = np.argsort(-cos)[:25]
print(f"  {'titolo':<50} {'coseno':>7} {'bolla':>6} {'tit.':>5}")
for x in vicini:
    if cos[x] <= 0:
        continue
    print(f"  {TIT[x][:48]:<50} {cos[x]:>7.3f} {int(mem[x]):>6} {int(sz[mem[x]]):>5}")
bolle_vicine = [int(mem[x]) for x in vicini if cos[x] > 0]
conta = {}
for bb in bolle_vicine:
    conta[bb] = conta.get(bb, 0) + 1
print(f"\n  le loro bolle: {sorted(conta.items(), key=lambda z: -z[1])}")
print(f"  -> {'CONCENTRATE' if max(conta.values()) >= 8 else 'SPARSE'}: "
      f"i vicini piu' prossimi stanno in {len(conta)} bolle diverse")

# ---------------------------------------------------------------- dove sta il mondo giusto
print("\n" + "=" * 100)
print("ESISTE UNA BOLLA 'THRILLER PSICOLOGICO'? — cercata nei termini dei centroidi")
print("=" * 100)
cerca = ["kw:psychological thriller", "kw:thriller", "kw:jump scare", "kw:suicide", "kw:revenge"]
for termine in cerca:
    k = vocab.get(termine)
    if k is None:
        print(f"  «{termine}»: non nel vocabolario")
        continue
    col = np.asarray(S["SUM"][:, k].todense()).ravel()
    idx = np.argsort(-col)[:6]
    print(f"\n  «{termine}» (in {int((col > 0).sum())} bolle)")
    for t in idx:
        if col[t] <= 0:
            continue
        bb = int(S["TUTTE"][t])
        mm = np.where(mem == bb)[0]
        print(f"     bolla {bb:>4} ({int(sz[bb]):>3} tit., peso {col[t]:.2f}): "
              f"{[TIT[x][:26] for x in mm[:4]]}")

# e i titoli che l'utente nominerebbe
print("\n" + "=" * 100)
print("E I FILM DEL MONDO GIUSTO — sono nella stessa bolla o sparsi?")
print("=" * 100)
NOMI = ["Gone Girl", "L'amore bugiardo", "The Girl on the Train", "La ragazza del treno",
        "The Woman in the Window", "La donna alla finestra", "Shutter Island", "Fight Club",
        "Inception", "Prisoners", "Sharp Objects", "The Gift", "Gone Baby Gone"]
TITOLI = {}
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    d = pd.read_parquet(PQ / f, columns=["id", col])
    for i, t in zip(d["id"], d[col]):
        r = B.ROW_OF.get(f"{typ}:{int(i)}")
        if r is not None:
            TITOLI.setdefault(str(t).lower(), r)
for nome in NOMI:
    trovati = [r for t, r in TITOLI.items() if nome.lower() in t]
    for r in trovati[:2]:
        print(f"  {TIT[r][:46]:<48} bolla {int(mem[r]):>5} ({int(sz[mem[r]]):>3} tit.)")
