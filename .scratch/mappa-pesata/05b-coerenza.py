"""05b-coerenza.py — il banco dice una cosa, l'occhio ne dice un'altra. Chi ha ragione?

Il ticket 05 ha trovato un disaccordo che vale piu' dei numeri:

  · la variante V3 (df>=3, tetto idf, pesi per tipo) **peggiora il banco**: 32,0% contro 35,3%;
  · ma i vicini di Verity diventano thriller veri, non Cinquanta sfumature di grigio.

Due misure in disaccordo sulla stessa cosa. Qui si fa la stessa domanda a quattro titoli, sotto le due
varianti, e si legge. Se V3 e' meglio all'occhio e peggio al numero, allora il numero non misura quello
che interessa — e va detto, perche' e' il numero che ho usato per dire «35,3%».

Le due varianti:
  V0  com'e' in `04-tfidf.npz`: df >= 2, idf = log(N/(1+df)), tutti i tipi pari
  V3  df >= 3, idf con tetto a log(N/20), generi e reti x1,5, cast e case x0,4, registi x0,8

Nessuna delle due si scrive sul disco: si costruiscono qui e si buttano.
"""
import json
import pathlib
import sys
import time

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

T0 = time.time()
ML = K.ML
PQ = pathlib.Path(".cache/tmdb")
mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
sz = np.bincount(mem)
TIT, VOT = B.titoli_leggibili()

PREF = {"keywords": "kw:", "genres": "ge:", "networks": "rt:", "production_companies": "co:",
        "production_countries": "pa:", "original_language": "lg:",
        "cast": "ca:", "directors": "di:", "created_by": "di:"}
PESI = {"ge:": 1.5, "rt:": 1.5, "co:": 0.4, "ca:": 0.4, "di:": 0.8}
COLS = {
    "movie": ["id", "keywords", "genres", "production_companies", "production_countries",
              "original_language", "cast", "directors"],
    "tv": ["id", "keywords", "genres", "networks", "production_companies", "production_countries",
           "original_language", "cast", "created_by"],
}


def leggi(s):
    try:
        v = json.loads(s) if isinstance(s, str) else (s or [])
        return [x for x in v if isinstance(x, (dict, str))]
    except Exception:
        return []


def nome(x):
    return x if isinstance(x, str) else str(x.get("name") or x.get("iso_3166_1") or "")


# ---------------------------------------------------------------- i token
TOKEN = [set() for _ in range(N)]
for typ, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
    d = pd.read_parquet(PQ / f, columns=COLS[typ])
    for riga in d.itertuples(index=False):
        dd = dict(zip(COLS[typ], riga))
        r = B.ROW_OF.get(f"{typ}:{int(dd['id'])}")
        if r is None:
            continue
        for col, pre in PREF.items():
            v = leggi(dd.get(col))
            if col == "cast":
                v = v[:10]
            for x in v:
                t = nome(x).strip()
                t = t.upper() if col == "production_countries" else t.lower()
                if t and len(t) > 1:
                    TOKEN[r].add(pre + t)
print(f"  token pronti ({time.time()-T0:.0f}s)", flush=True)


def costruisci(df_min, tetto, pesi):
    df = {}
    for s in TOKEN:
        for t in s:
            df[t] = df.get(t, 0) + 1
    vocab = {t: i for i, t in enumerate(sorted(t for t, c in df.items() if c >= df_min))}
    idf = np.zeros(len(vocab), np.float32)
    for t, i in vocab.items():
        v = np.log(N / (1 + df[t]))
        idf[i] = min(v, np.log(N / 20.0)) if tetto else v
    r_, c_, v_ = [], [], []
    for i, s in enumerate(TOKEN):
        for t in s:
            j = vocab.get(t)
            if j is None:
                continue
            r_.append(i)
            c_.append(j)
            v_.append(idf[j] * (pesi.get(t[:3], 1.0) if pesi else 1.0))
    M = sp.csr_matrix((v_, (r_, c_)), shape=(N, len(vocab)), dtype=np.float32)
    M = M.multiply(1.0 / (np.sqrt(np.asarray(M.multiply(M).sum(1)).ravel()) + 1e-9)[:, None]
                   ).tocsr().astype(np.float32)
    return M, vocab, idf


V0, VOC0, IDF0 = costruisci(2, False, None)
V3, VOC3, IDF3 = costruisci(3, True, PESI)
print(f"  V0 {V0.shape} · V3 {V3.shape} ({time.time()-T0:.0f}s)", flush=True)


def vicini(dd, tipo, M, vocab, idf, pesi):
    tok = CF.tokenizza(dd, tipo)
    idx = [vocab[t] for t in tok if t in vocab]
    if not idx:
        return None, 0
    val = [idf[j] * (pesi.get(tk[:3], 1.0) if pesi else 1.0)
           for tk, j in ((t, vocab[t]) for t in tok if t in vocab)]
    v = sp.csr_matrix((val, ([0] * len(idx), idx)), shape=(1, M.shape[1]), dtype=np.float32)
    n = float(np.sqrt(v.multiply(v).sum()))
    v = v.multiply(1.0 / (n + 1e-9))
    cos = np.asarray((v @ M.T).todense()).ravel()
    return cos, len(tok)


# ---------------------------------------------------------------- la lettura
mv = pd.read_parquet(PQ / "movies.parquet")
CASI = [(1283515, "VERITY (2026, fuori dal grafo)"),
        (210577, "Gone Girl"),
        (11324, "Shutter Island"),
        (138843, "The Conjuring"),
        (27205, "Inception"),
        (603, "Matrix")]
for ident, perche in CASI:
    r = mv[mv["id"] == ident]
    if not len(r):
        continue
    dd = r.iloc[0].to_dict()
    print("\n" + "=" * 100)
    print(f"{perche} — {dd.get('title')} ({dd.get('release_date')}) · "
          f"generi {[x['name'] for x in leggi(dd.get('genres'))]}")
    print("=" * 100)
    for tag, M, vocab, idf, pesi in (("COM'E' ADESSO (V0)", V0, VOC0, IDF0, None),
                                     ("V3 pesi per tipo", V3, VOC3, IDF3, PESI)):
        cos, ntok = vicini(dd, "movie", M, vocab, idf, pesi)
        if cos is None:
            print(f"  {tag}: nessun termine nel vocabolario")
            continue
        top = np.argsort(-cos)[:8]
        print(f"  {tag} ({ntok} termini):")
        for x in top:
            if cos[x] > 0:
                print(f"     {cos[x]:.3f}  {TIT[x][:46]:<48} bolla {int(mem[x]):>5} "
                      f"({int(sz[mem[x]]):>3} tit.)")
print(f"\nFINE ({time.time()-T0:.0f}s)")
