"""07-colloca-bolle-piccole.py — la collocazione su una partizione a bolle piu' piccole.

Ipotesi dell'utente: «prova a vedere se con bolle piu' piccole la situazione un po' migliora».

Due cose da NON ripetere, imparate mezz'ora fa:
  1. **i centroidi vanno costruiti SULLA STESSA PARTIZIONE** che si legge. Le bolle non hanno id
     stabili fra partizioni: con V10 letto contro i centroidi di V8, *Deadpool & Wolverine* finiva
     tra i telefilm americani. La partizione e i centroidi sono un artefatto solo.
  2. la lettura va fatta a occhio, non solo col tasso di successo — perche' il banco misura il
     comportamento e l'occhio il significato, e oggi hanno detto cose diverse cinque volte.

Quindi: si costruiscono i centroidi della partizione nuova (la media dei membri, pesatura V1 che e'
quella che ha vinto), si collocano gli stessi 100 titoli nuovi, e si stampa dove finiscono.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "mappa-pesata"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import colloca_finale as CF
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
PART = sys.argv[1] if len(sys.argv) > 1 else "bolle-eterogeneo-V10-p1.0-r200.npy"
print("=" * 100)
print(f"LA COLLOCAZIONE SU {PART}")
print("=" * 100, flush=True)

mem = np.load(ML / PART)
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
IS_TV = B.IS_TV
q_tv = np.zeros(NB)
np.add.at(q_tv, mem, IS_TV.astype(float))
quota_tv = q_tv / np.maximum(sz, 1)
print(f"  {NB:,} bolle · mediana {int(np.median(sz))} · la piu' grossa {int(sz.max())} · "
      f">=15 {int((sz>=15).sum()):,}", flush=True)

# ---------------------------------------------------------------- i centroidi della partizione NUOVA
# La pesatura V1 (`04-tfidf.npz`): e' quella che ha vinto sul banco, 63,0% contro il 35,3% di V3.
TF = sp.load_npz(ML / "04-tfidf.npz").tocsr()
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
MIN_MEMBRI = 5
bolle_serie = np.where((quota_tv > 0.5) & (sz >= MIN_MEMBRI))[0]
bolle_film = np.where((quota_tv <= 0.5) & (sz >= MIN_MEMBRI))[0]
TUTTE = np.concatenate([bolle_serie, bolle_film])
r_, c_, v_ = [], [], []
for k, b in enumerate(TUTTE):
    m_ = MEMBRI[int(b)]
    s = np.asarray(TF[m_].sum(0)).ravel() / max(len(m_), 1)
    nz = np.nonzero(s)[0]
    r_.extend([k] * len(nz))
    c_.extend(nz.tolist())
    v_.extend(s[nz].tolist())
SUM = sp.csr_matrix((v_, (r_, c_)), shape=(len(TUTTE), TF.shape[1]), dtype=np.float32)
NORMA = np.sqrt(np.asarray(SUM.multiply(SUM).sum(1)).ravel()) + 1e-9
print(f"  centroidi della partizione nuova: {SUM.shape} · {SUM.nnz:,} valori · "
      f"candidate {len(TUTTE):,} ({len(bolle_serie):,} serie + {len(bolle_film):,} film) "
      f"({time.time()-T0:.0f}s)", flush=True)

S = dict(vocab=json.load(open(ML / "04-vocab.json", encoding="utf-8")),
         TFIDF=TF, SUM=SUM, NORMA=NORMA, TUTTE=TUTTE,
         bolle_serie=set(int(x) for x in bolle_serie),
         bolle_film=set(int(x) for x in bolle_film),
         quota_tv=quota_tv, mem=mem, sz=sz)
# l'idf serve a `vettore`: si ricava dai non-zero della matrice, come fa `carica()`
df = np.asarray((TF > 0).sum(0)).ravel()
S["idf"] = np.log(TF.shape[0] / (1 + df)).astype(np.float32)

# ---------------------------------------------------------------- i 100 titoli nuovi
PQ = pathlib.Path(".cache/tmdb")
COLS_TIPO = {
    "movie": ("movies.parquet", "title", "release_date",
              ["keywords", "genres", "production_companies", "production_countries",
               "original_language", "cast", "directors"]),
    "tv": ("tv.parquet", "name", "first_air_date",
           ["keywords", "genres", "networks", "production_companies", "production_countries",
            "original_language", "cast", "created_by"]),
}


def anno_di(dd, col):
    try:
        a = int(str(dd.get(col))[:4])
        return a if 1800 < a < 2100 else 0
    except Exception:
        return 0


righe = []
for typ, (f, col, coldata, extra) in COLS_TIPO.items():
    d = pd.read_parquet(PQ / f, columns=["id", col, "vote_count", coldata] + extra)
    for r in d.itertuples(index=False):
        dd = r._asdict()
        v = int(dd.get("vote_count") or 0)
        if v < 20:
            continue
        righe.append((anno_di(dd, coldata), typ, dd, B.ROW_OF.get(f"{typ}:{int(dd['id'])}")))
recenti = [x for x in righe if x[0] >= 2024]
recenti.sort(key=lambda z: -int(z[2].get("vote_count") or 0))
print(f"  da collocare: {len(recenti):,} uscite 2024+ con >= 20 voti ({time.time()-T0:.0f}s)",
      flush=True)

TIT, VOT = B.titoli_leggibili()
print(f"\n=== dove finiscono, su bolle da mediana {int(np.median(sz))} ===")
print()
for n, (anno, typ, dd, riga) in enumerate(recenti[:100], 1):
    if riga is not None:
        b, conf = int(mem[riga]), None
    else:
        b, conf, _, _ = CF.colloca(dd, typ, S)
    nome = str(dd.get("title") or dd.get("name"))[:44]
    if b is None:
        print(f"{n:>3}. {nome} ({anno}) — NON collocabile")
        continue
    m_ = np.where(mem == b)[0]
    o = np.argsort(-VOT[m_])[:4]
    dentro = " | ".join(TIT[x][:28] for x in m_[o])
    c = f" conf {conf:.2f}" if conf is not None else ""
    print(f"{n:>3}. {nome} ({anno}) -> bolla {b} ({int(sz[b])} tit.){c}")
    print(f"        dentro: {dentro}")
    if n % 25 == 0:
        print(flush=True)

print(f"\nFINE ({time.time()-T0:.0f}s)")
