"""tfidf-v2.py — il TF-IDF V3 sul canone esteso, senza passare dalle bolle.

  PYTHONPATH=. py .scratch/distillazione-grafo/tfidf-v2.py

E' la copia esatta della tokenizzazione di `services/graph/steps/05_centroidi_v3.py` (stessi prefissi,
stessi pesi `PESI_TOKEN`, stesso tetto idf, stessa normalizzazione L2), ma staccata dal passo che
costruisce i centroidi — che pretende la partizione in bolle. Il TF-IDF per titolo non c'entra con le
bolle: e' una proprieta' del titolo e del suo vocabolario.

Scrive `05-tfidf-v2.npz`, `05-vocab-v2.json`, `05-idf-v2.npy`: la sostituzione e' un passo separato.
"""
import json
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

from services.graph import parametri as P
from services.graph_dense import config as C
from services.graph_dense import data as D

T0 = time.time()
PQ = C.TMDB
OUT = C.SRC
DF_MIN = P.V3_DF_MIN
TETTO = P.V3_TETTO_IDF
PESI = dict(P.PESI_TOKEN)

PREF = {"keywords": "kw:", "genres": "ge:", "networks": "rt:", "production_companies": "co:",
        "production_countries": "pa:", "original_language": "lg:",
        "cast": "ca:", "directors": "di:", "created_by": "di:"}
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


def main():
    B = D.basic(); N = B["N"]; row_of = B["row_of"]
    print(f"canone {N:,} · DF_MIN {DF_MIN} · tetto idf {TETTO}", flush=True)

    token = [set() for _ in range(N)]
    for typ, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
        d = pd.read_parquet(PQ / f, columns=COLS[typ])
        for riga in d.itertuples(index=False):
            dd = dict(zip(COLS[typ], riga))
            r = row_of.get(f"{typ}:{int(dd['id'])}")
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
                        token[r].add(pre + t)
    print(f"  token ({time.time()-T0:.0f}s)", flush=True)

    df = {}
    for s in token:
        for t in s:
            df[t] = df.get(t, 0) + 1
    vocab = {t: i for i, t in enumerate(sorted(t for t, c in df.items() if c >= DF_MIN))}
    idf = np.zeros(len(vocab), np.float32)
    for t, i in vocab.items():
        idf[i] = min(np.log(N / (1 + df[t])), np.log(N / TETTO))
    r_, c_, v_ = [], [], []
    for i, s in enumerate(token):
        for t in s:
            j = vocab.get(t)
            if j is None:
                continue
            r_.append(i); c_.append(j); v_.append(idf[j] * PESI.get(t[:3], 1.0))
    TF = sp.csr_matrix((v_, (r_, c_)), shape=(N, len(vocab)), dtype=np.float32)
    TF = TF.multiply(1.0 / (np.sqrt(np.asarray(TF.multiply(TF).sum(1)).ravel()) + 1e-9)[:, None]
                     ).tocsr().astype(np.float32)

    sp.save_npz(OUT / "05-tfidf-v2.npz", TF)
    json.dump(vocab, open(OUT / "05-vocab-v2.json", "w", encoding="utf-8"))
    np.save(OUT / "05-idf-v2.npy", idf)
    pref = {}
    for t in vocab:
        k = t[:3]
        pref[k] = pref.get(k, 0) + 1
    print(f"  TF-IDF V3: {TF.shape} · {TF.nnz:,} valori · vocaboli per prefisso "
          f"{dict(sorted(pref.items(), key=lambda x: -x[1]))}", flush=True)
    print(f"  scritti 05-tfidf-v2.npz · 05-vocab-v2.json · 05-idf-v2.npy ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
