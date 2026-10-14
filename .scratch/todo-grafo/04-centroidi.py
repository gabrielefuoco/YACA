"""04-centroidi.py — TICKET 04: i centroidi TF-IDF delle bolle-serie.

§1.B.1 dell'esperto: «una singola serie ha metadati sparsi (magari solo 3 keyword e 1 network), ma
una bolla di 34 serie ha un profilo aggregato ricchissimo». Quindi invece di fare k-NN contro 17.000
serie rumorose, si calcola il prodotto scalare contro i centroidi delle bolle-serie.

Costruito sulla partizione **V8** (che il ticket 02 ha messo al posto di V7: stessa scala, tre
artefatti in meno). I token vengono dai metadati grezzi, con un prefisso per tipo, come chiede §1.B.1:

    kw:  keywords             ge:  generi              rt:  networks
    co:  case di produzione   pa:  paesi               lg:  lingua originale
    ca:  cast (primi 10)      di:  registi / created_by

Tre decisioni, e il perche' di ognuna:
  · **df < 2 scartato.** Un token che appare in un solo titolo ha idf massimo e non descrive nessun
    mondo: nel centroide sarebbe rumore puro.
  · **ogni titolo e' L2-normalizzato prima di mediare.** Altrimenti un titolo con 40 keyword pesa il
    doppio di uno con 20, e il centroide diventa il ritratto dei titoli prolifici, non della bolla.
  · **il centroide e' normalizzato** dopo la media: cosi' bolle di dimensioni diverse sono
    confrontabili a coseno.

E due pesature dei membri, da confrontare al ticket 05 invece di sceglierne una a intuito:
  `uniforme`  ogni membro conta 1
  `grado`     il membro pesa quanto la sua somma di pesi INTERNI nella bolla

I centroidi si calcolano **solo per le bolle-serie**: una matrice NB x V sarebbe 1.625 x ~250k x 4
byte = 3,2 GB, e ne servirebbero due.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
N = B.N
PART = "bolle-nitrile-V8.npy"
TRI = "bolle-nitrile-V8-triangolo.npz"

print("=" * 104)
print("TICKET 04 — I CENTROIDI TF-IDF DELLE BOLLE-SERIE (partizione V8)")
print("=" * 104, flush=True)

# ---------------------------------------------------------------- 1. i token
PQ = K.ROOT / ".cache" / "tmdb"
COLS = {
    "movie": ["id", "keywords", "genres", "production_companies", "production_countries",
              "original_language", "cast", "directors"],
    "tv": ["id", "keywords", "genres", "networks", "production_companies", "production_countries",
           "original_language", "cast", "created_by"],
}
PREFISSO = {"keywords": "kw:", "genres": "ge:", "networks": "rt:", "production_companies": "co:",
            "production_countries": "pa:", "original_language": "lg:",
            "cast": "ca:", "directors": "di:", "created_by": "di:"}


def leggi(s):
    """Dizionari E stringhe: `production_countries` e' ["US"] (il quinto bug del ticket 01)."""
    try:
        v = json.loads(s) if isinstance(s, str) else (s or [])
        return [x for x in v if isinstance(x, (dict, str))]
    except Exception:
        return []


def nome(x, col):
    if isinstance(x, str):
        return x
    return str(x.get("name") or x.get("iso_3166_1") or "")


TOKEN = [set() for _ in range(N)]
for typ, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
    d = pd.read_parquet(PQ / f, columns=COLS[typ])
    for riga in d.itertuples(index=False):
        dd = dict(zip(COLS[typ], riga))
        r = B.ROW_OF.get(f"{typ}:{int(dd['id'])}")
        if r is None:
            continue
        s = TOKEN[r]
        for col, pre in PREFISSO.items():
            v = leggi(dd.get(col))
            if col == "cast":
                v = v[:10]
            for x in v:
                t = nome(x, col).strip()
                t = t.upper() if col == "production_countries" else t.lower()
                if t and len(t) > 1:
                    s.add(pre + t)
    print(f"  {typ}: letto ({time.time()-T0:.0f}s)", flush=True)

gr = np.array([len(s) for s in TOKEN])
print(f"\n  token per titolo: mediana {int(np.median(gr))} · zero {int((gr==0).sum()):,}/{N:,} "
      f"· distinti {len({t for s in TOKEN for t in s}):,}", flush=True)
per_tipo = {}
for s in TOKEN:
    for t in s:
        per_tipo[t[:3]] = per_tipo.get(t[:3], 0) + 1
print(f"  token per tipo: {sorted(per_tipo.items(), key=lambda z: -z[1])}", flush=True)

# ---------------------------------------------------------------- 2. la matrice TF-IDF
df = {}
for s in TOKEN:
    for t in s:
        df[t] = df.get(t, 0) + 1
vocab = {t: i for i, t in enumerate(sorted(t for t, c in df.items() if c >= 2))}
idf = np.zeros(len(vocab), np.float32)
for t, i in vocab.items():
    idf[i] = np.log(N / (1 + df[t]))
r_, c_, v_ = [], [], []
for i, s in enumerate(TOKEN):
    for t in s:
        j = vocab.get(t)
        if j is not None:
            r_.append(i)
            c_.append(j)
            v_.append(idf[j])
TFIDF = sp.csr_matrix((v_, (r_, c_)), shape=(N, len(vocab)), dtype=np.float32)
TFIDF = TFIDF.multiply(
    1.0 / (np.sqrt(np.asarray(TFIDF.multiply(TFIDF).sum(1)).ravel()) + 1e-9)[:, None]
).tocsr().astype(np.float32)
print(f"\n  matrice TF-IDF: {TFIDF.shape[0]:,} x {TFIDF.shape[1]:,} · {TFIDF.nnz:,} valori "
      f"· scartati {sum(1 for c in df.values() if c < 2):,} token con df=1 ({time.time()-T0:.0f}s)",
      flush=True)

# ---------------------------------------------------------------- 3. le bolle-serie
mem = np.load(ML / PART)
sz = np.bincount(mem)
NB = len(sz)
is_tv = B.IS_TV
q_tv = np.zeros(NB)
np.add.at(q_tv, mem, is_tv.astype(float))
quota_tv = q_tv / np.maximum(sz, 1)
MIN_MEMBRI = 5
bolle_serie = np.where((quota_tv > 0.5) & (sz >= MIN_MEMBRI))[0]
bolle_film = np.where((quota_tv <= 0.5) & (sz >= MIN_MEMBRI))[0]
print(f"\n  bolle totali {NB:,} · a maggioranza SERIE {len(bolle_serie):,} · a maggioranza FILM "
      f"{len(bolle_film):,} · sotto i {MIN_MEMBRI} titoli {int((sz < MIN_MEMBRI).sum()):,}",
      flush=True)
print(f"  l'esperto diceva 349 bolle-serie: ne misuro {len(bolle_serie):,} "
      f"(mediana {int(np.median(sz[bolle_serie]))} titoli · la piu' grossa "
      f"{int(sz[bolle_serie].max())} · serie dentro {int(q_tv[bolle_serie].sum()):,})", flush=True)

# ---------------------------------------------------------------- 4. i centroidi
q = np.load(ML / TRI)
W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
Ws = (W + W.T).tocsr()          # il file e' il triangolo: per i pesi interni servono i due versi
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
print(f"\n  membri raggruppati in un colpo solo ({time.time()-T0:.0f}s)", flush=True)

V = TFIDF.shape[1]
CENT = {}
PESO_INTERNO = np.zeros(N, np.float32)
for nome_p, pesa in (("uniforme", False), ("grado", True)):
    M = np.zeros((len(bolle_serie), V), np.float32)
    for k, b in enumerate(bolle_serie):
        membri = MEMBRI[b]
        sub = TFIDF[membri]
        if pesa:
            p = np.asarray(Ws[membri][:, membri].sum(1)).ravel() + 1e-6
            PESO_INTERNO[membri] = p
        else:
            p = np.ones(len(membri), np.float32)
        p = p / p.sum()
        M[k] = np.asarray(sub.multiply(p[:, None]).sum(0)).ravel()
    n = np.linalg.norm(M, axis=1, keepdims=True)
    CENT[nome_p] = (M / (n + 1e-9)).astype(np.float32)
    print(f"  centroidi '{nome_p}': {CENT[nome_p].shape} · norma media prima {float(np.mean(n)):.3f} "
          f"({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- 5. la leggibilita'
inv = {i: t for t, i in vocab.items()}
print("\n" + "=" * 104)
print("CONTROLLO DI LEGGIBILITA' — i primi termini di dieci centroidi di bolle-serie")
print("  Se qui non si legge un mondo, il vettore e' sbagliato e si vede adesso, non al ticket 05.")
print("=" * 104, flush=True)
TIT = np.array([""] * N, dtype=object)
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    d = pd.read_parquet(PQ / f, columns=["id", col])
    for i, t in zip(d["id"], d[col]):
        r = B.ROW_OF.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)

ordinamento = sorted(bolle_serie, key=lambda b: -sz[b])
mezzo = len(ordinamento) // 2
scelte = ordinamento[:5] + ordinamento[mezzo - 2:mezzo + 2] + ordinamento[-3:]
pos = {b: k for k, b in enumerate(bolle_serie)}
for b in scelte:
    v = CENT["uniforme"][pos[b]]
    top = np.argsort(-np.abs(v))[:8]
    termini = " · ".join(inv[j] for j in top if v[j] > 0)
    membri = MEMBRI[b]
    p = np.asarray(Ws[membri][:, membri].sum(1)).ravel()
    esempi = [TIT[membri[k2]][:30] for k2 in np.argsort(-p)[:3]]
    print(f"\n  bolla {b:>4} · {int(sz[b]):>3} titoli · {100*quota_tv[b]:.0f}% serie")
    print(f"     {termini}")
    print(f"     es. {esempi}", flush=True)

np.savez_compressed(ML / "04-centroidi.npz",
                    uniforme=CENT["uniforme"], grado=CENT["grado"],
                    bolle_serie=bolle_serie, bolle_film=bolle_film, quota_tv=quota_tv,
                    sz=sz, peso_interno=PESO_INTERNO)
sp.save_npz(ML / "04-tfidf.npz", TFIDF)
with open(ML / "04-vocab.json", "w", encoding="utf-8") as f:
    json.dump(vocab, f)
print(f"\n\nsalvati: 04-centroidi.npz · 04-tfidf.npz · 04-vocab.json")
print(f"FINE ({time.time()-T0:.0f}s)")
