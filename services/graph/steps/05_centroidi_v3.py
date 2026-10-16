"""05c-salva-v3.py — salva gli artefatti della variante V3, cosi' il collocatore la usa davvero.

Il ticket 05 ha misurato che V3 e' meglio all'occhio e peggio al banco, e ha concluso che per un
titolo NUOVO l'occhio e' la misura che conta (il banco chiede una cosa — «atterra dove la co-visione
l'aveva messo?» — che per un titolo fuori dal grafo non esiste).

Quindi V3 diventa la variante di produzione. Questo script ne scrive gli artefatti con la stessa forma
dei precedenti, cosi' `colloca_finale.py` cambia solo i nomi dei file:

  05-tfidf.npz      la matrice TF-IDF V3 (66.259 x 79.281), L2-normalizzata per riga
  05-vocab.json     il vocabolario
  05-idf.npy        gli idf, col tetto — salvati, perche' e' l'errore da non rifare
  05-centroidi.npz  le somme per bolla (sparse) e le norme, per le 1.525 candidate

**Gli idf si salvano insieme al vocabolario.** E' il rischio numero uno della proposta per `src/`
(ticket 04): senza, o si ricalcolano dal corpus — che va bene finche' il corpus non cambia — o i due
lati del coseno non parlano piu' la stessa lingua, in silenzio.
"""
import json
import os
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
import sys; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import parametri as P
from graph import canon as K

T0 = time.time()
ML = K.DATA      # i dati del modulo hanno una cartella loro
PQ = pathlib.Path(".cache/tmdb")
DF_MIN = P.V3_DF_MIN
TETTO = P.V3_TETTO_IDF                      # idf massimo = log(N/20)
PESI = dict(P.PESI_TOKEN)          # LA FONTE E' UNA: era il ticket 13

print("=" * 96)
print("SALVO GLI ARTEFATTI V3")
print("=" * 96, flush=True)

# LA PARTIZIONE FINALE, non V8: vedi il commento in `collocator.py` e nel README (Trappola 3b).
PART = os.environ.get("MEM", "bolle-eterogeneo-subvoti.npy")
if not K.esiste(PART):
    raise SystemExit(f"manca {PART} in graph/data/")
mem = np.load(K.A(PART))
N = len(mem)
NB = int(mem.max()) + 1
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
C4 = np.load(ML / "04-centroidi.npz")
TUTTE = np.concatenate([C4["bolle_serie"], C4["bolle_film"]])

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
print(f"  token ({time.time()-T0:.0f}s)", flush=True)

df = {}
for s in TOKEN:
    for t in s:
        df[t] = df.get(t, 0) + 1
vocab = {t: i for i, t in enumerate(sorted(t for t, c in df.items() if c >= DF_MIN))}
idf = np.zeros(len(vocab), np.float32)
for t, i in vocab.items():
    idf[i] = min(np.log(N / (1 + df[t])), np.log(N / TETTO))
r_, c_, v_ = [], [], []
for i, s in enumerate(TOKEN):
    for t in s:
        j = vocab.get(t)
        if j is None:
            continue
        r_.append(i)
        c_.append(j)
        v_.append(idf[j] * PESI.get(t[:3], 1.0))
TF = sp.csr_matrix((v_, (r_, c_)), shape=(N, len(vocab)), dtype=np.float32)
TF = TF.multiply(1.0 / (np.sqrt(np.asarray(TF.multiply(TF).sum(1)).ravel()) + 1e-9)[:, None]
                 ).tocsr().astype(np.float32)
sp.save_npz(ML / "05-tfidf.npz", TF)
json.dump(vocab, open(ML / "05-vocab.json", "w", encoding="utf-8"))
np.save(ML / "05-idf.npy", idf)
print(f"  TF-IDF V3: {TF.shape} · {TF.nnz:,} valori · salvata ({time.time()-T0:.0f}s)", flush=True)

r2, c2, v2 = [], [], []
for k, b in enumerate(TUTTE):
    s = np.asarray(TF[MEMBRI[b]].sum(0)).ravel()
    nz = np.nonzero(s)[0]
    r2.extend([k] * len(nz))
    c2.extend(nz.tolist())
    v2.extend(s[nz].tolist())
SUM = sp.csr_matrix((v2, (r2, c2)), shape=(len(TUTTE), len(vocab)), dtype=np.float32)
NORMA = np.sqrt(np.asarray(SUM.multiply(SUM).sum(1)).ravel()).astype(np.float32)
sp.save_npz(ML / "05-centroidi.npz", SUM)
K.segna_partizione(PART, ML / "05-impronte.json")
np.savez_compressed(ML / "05-centroidi-meta.npz", norme=NORMA, bolle_serie=C4["bolle_serie"],
                    bolle_film=C4["bolle_film"], sz=C4["sz"], quota_tv=C4["quota_tv"])
print(f"  centroidi V3: {SUM.shape} · {SUM.nnz:,} valori · norme da {NORMA.min():.2f} a "
      f"{NORMA.max():.2f}", flush=True)

# e una verifica: Verity
from graph import collocator as CF
SS = dict(vocab=vocab, idf=idf, SUM=SUM, NORMA=NORMA, TUTTE=TUTTE,
          bolle_serie=set(int(x) for x in C4["bolle_serie"]),
          bolle_film=set(int(x) for x in C4["bolle_film"]),
          quota_tv=C4["quota_tv"], mem=mem, sz=C4["sz"])
mv = pd.read_parquet(PQ / "movies.parquet")
dd = mv[mv["id"] == 1283515].iloc[0].to_dict()
b, conf, ntok, fuori = CF.colloca(dd, "movie", SS)
TIT, _ = B.titoli_leggibili()
print(f"\n  VERITY con V3: bolla {b} · coseno {conf:.3f} · {ntok} termini, {fuori} fuori vocabolario")
print(f"     dentro: {[TIT[x][:28] for x in np.where(mem == b)[0][:6]]}")
print(f"\n  salvati: 05-tfidf.npz · 05-vocab.json · 05-idf.npy · 05-centroidi.npz")
print(f"FINE ({time.time()-T0:.0f}s)")
