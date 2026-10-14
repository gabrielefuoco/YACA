"""05-peso-token.py — TICKET 05: perché il vettore sbaglia, e come si cura.

Obiezione dell'utente su Verity (14/10/2026): «non c'entra niente con Fight Club, Inception; e' un
thriller psicologico con qualche jump scare e tensione costante». La diagnosi e' in `verity.py`, e ha
trovato DUE cause, tutte e due nel vettore TF-IDF e nessuna nel centroide:

  1. **Il cast domina.** I venti titoli piu' vicini a Verity sono Cinquanta sfumature di grigio
     (stessa attrice: Dakota Johnson) e WeCrashed (Anne Hathaway). Un film nuovo viene collocato
     perche' ha gli stessi ATTORI, non perche' racconta la stessa cosa.
  2. **Le keyword rare e inutili dominano.** `kw:baffled`, `kw:dreary`, `kw:tragic` hanno df 1-3,
     quindi idf quasi massimo, quindi pesano piu' di `kw:psychological thriller`. Sono il libero
     testo di TMDB, non una tassonomia.

Conseguenza misurata: i 25 vicini di Verity stanno in **24 bolle diverse**. Il segnale non e' solo
rumoroso, e' **incoerente**: punta in ventiquattro direzioni.

Qui si misura sul banco dei 600 (la stessa macchina del ticket 06c, leave-one-out esatto) quali
correzioni servono davvero, e non a intuito:

  V0  com'e' adesso: df >= 2, idf = log(N/(1+df)), tutti i tipi pari                  (35,3%)
  V1  df >= 3                     — toglie il libero testo che appare una volta sola
  V2  V1 + idf con TETTO           — un token in 2 documenti non deve valere 5 volte uno in 50
  V3  V2 + PESI PER TIPO           — generi ×1,5, keyword ×1,0, cast ×0,4, case ×0,4
  V4  V3 + il cast fuori           — la prova che il cast era la causa
  V5  V3 con i generi a ×2,5       — spinto apposta, per vedere dove peggiora
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
print("=" * 104)
print("TICKET 05 — IL PESO DEI TOKEN: PERCHE' VERITY FINISCE CON CINQUANTA SFUMATURE")
print("=" * 104, flush=True)

mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
IS_TV = B.IS_TV
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
q_tv = np.zeros(NB)
np.add.at(q_tv, mem, IS_TV.astype(float))
quota_tv = q_tv / np.maximum(sz, 1)
C4 = np.load(ML / "04-centroidi.npz")
bolle_serie, bolle_film = C4["bolle_serie"], C4["bolle_film"]
TUTTE = np.concatenate([bolle_serie, bolle_film])
pos_tutte = {b: k for k, b in enumerate(TUTTE)}
pos_serie = {b: k for k, b in enumerate(bolle_serie)}
col_s = [pos_tutte[b] for b in bolle_serie]

# ---------------------------------------------------------------- i token (con il tipo)
TOKEN = [set() for _ in range(N)]
COLS = {
    "movie": ["id", "keywords", "genres", "production_companies", "production_countries",
              "original_language", "cast", "directors"],
    "tv": ["id", "keywords", "genres", "networks", "production_companies", "production_countries",
           "original_language", "cast", "created_by"],
}
PREF = {"keywords": "kw:", "genres": "ge:", "networks": "rt:", "production_companies": "co:",
        "production_countries": "pa:", "original_language": "lg:",
        "cast": "ca:", "directors": "di:", "created_by": "di:"}


def leggi(s):
    try:
        v = json.loads(s) if isinstance(s, str) else (s or [])
        return [x for x in v if isinstance(x, (dict, str))]
    except Exception:
        return []


def nome(x):
    return x if isinstance(x, str) else str(x.get("name") or x.get("iso_3166_1") or "")


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
    print(f"  {typ} letto ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- il banco
Bcsr = K.carica_csr("boot-B.npz", N)
serie = np.where(IS_TV & (np.asarray((Bcsr > 0).sum(1)).ravel() > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
vere = np.array([int(mem[i]) for i in tolti])
print(f"  banco: {len(tolti)} serie (seed 13)", flush=True)

# ---------------------------------------------------------------- le varianti
PESI_TIPO = {"ge:": 1.5, "kw": 1.0, "rt:": 1.5, "pa:": 1.0, "lg:": 1.0,
             "co:": 0.4, "ca:": 0.4, "di:": 0.8}
VARIANTI = [
    ("V0 com'e' adesso", dict(df_min=2, tetto=False, pesi=None, senza_cast=False)),
    ("V1 df>=3", dict(df_min=3, tetto=False, pesi=None, senza_cast=False)),
    ("V2 V1 + tetto idf", dict(df_min=3, tetto=True, pesi=None, senza_cast=False)),
    ("V3 V2 + pesi per tipo", dict(df_min=3, tetto=True, pesi=PESI_TIPO, senza_cast=False)),
    ("V4 V3 senza cast", dict(df_min=3, tetto=True, pesi=PESI_TIPO, senza_cast=True)),
    ("V5 V3 generi x2.5", dict(df_min=3, tetto=True,
                               pesi={**PESI_TIPO, "ge:": 2.5}, senza_cast=False)),
]
RIS = {}
for nome_v, cfg in VARIANTI:
    # vocabolario
    df = {}
    for s in TOKEN:
        for t in s:
            if cfg["senza_cast"] and t.startswith("ca:"):
                continue
            df[t] = df.get(t, 0) + 1
    vocab = {t: i for i, t in enumerate(sorted(t for t, c in df.items() if c >= cfg["df_min"]))}
    idf = np.zeros(len(vocab), np.float32)
    for t, i in vocab.items():
        v = np.log(N / (1 + df[t]))
        if cfg["tetto"]:
            v = min(v, np.log(N / 20.0))       # un token in 2 doc non vale 5 volte uno in 50
        idf[i] = v
    r_, c_, v_ = [], [], []
    for i, s in enumerate(TOKEN):
        for t in s:
            j = vocab.get(t)
            if j is None:
                continue
            w = cfg["pesi"].get(t[:3], 1.0) if cfg["pesi"] else 1.0
            r_.append(i)
            c_.append(j)
            v_.append(idf[j] * w)
    TF = sp.csr_matrix((v_, (r_, c_)), shape=(N, len(vocab)), dtype=np.float32)
    TF = TF.multiply(1.0 / (np.sqrt(np.asarray(TF.multiply(TF).sum(1)).ravel()) + 1e-9)[:, None]
                     ).tocsr().astype(np.float32)
    # centroidi (sparsi) e norme
    r2, c2, v2 = [], [], []
    for k, b in enumerate(TUTTE):
        s = np.asarray(TF[MEMBRI[b]].sum(0)).ravel()
        nz = np.nonzero(s)[0]
        r2.extend([k] * len(nz))
        c2.extend(nz.tolist())
        v2.extend(s[nz].tolist())
    SUM = sp.csr_matrix((v2, (r2, c2)), shape=(len(TUTTE), len(vocab)), dtype=np.float32)
    NORMA = np.sqrt(np.asarray(SUM.multiply(SUM).sum(1)).ravel())
    # i punteggi, col leave-one-out esatto
    V = np.asarray((TF[tolti] @ SUM.T).todense())
    COS = V / (NORMA[None, :] + 1e-9)
    for k, i in enumerate(tolti):
        b = vere[k]
        kk = pos_tutte[b]
        nl = np.sqrt(max(float(NORMA[kk] ** 2 - 2 * V[k, kk] + 1.0), 1e-12))
        COS[k, kk] = (V[k, kk] - 1.0) / max(nl, 1e-9)
    a = np.array([int(TUTTE[int(np.argmax(COS[k, col_s]))]) for k in range(600)])   # regola A
    ok = int((a == vere).sum())
    RIS[nome_v] = ok
    print(f"  {nome_v:<24} termini {len(vocab):>7,} · propria bolla {ok:>3}/600 "
          f"({100*ok/600:5.1f}%) ({time.time()-T0:.0f}s)", flush=True)

    if nome_v.startswith("V3"):
        # e Verity, per vedere se Dakota Johnson sparisce
        vv = pd.read_parquet(PQ / "movies.parquet")
        ddv = vv[vv["id"] == 1283515].iloc[0].to_dict()
        tokv = CF.tokenizza(ddv, "movie")
        idx, val = [], []
        for t in tokv:
            j = vocab.get(t)
            if j is not None:
                w = cfg["pesi"].get(t[:3], 1.0) if cfg["pesi"] else 1.0
                idx.append(j)
                val.append(idf[j] * w)
        vec = sp.csr_matrix((val, ([0] * len(idx), idx)), shape=(1, len(vocab)), dtype=np.float32)
        vec = vec.multiply(1.0 / (float(np.sqrt(vec.multiply(vec).sum())) + 1e-9))
        cosv = np.asarray((vec @ TF.T).todense()).ravel()
        top = np.argsort(-cosv)[:15]
        TIT0, _ = B.titoli_leggibili()
        print(f"     e i 15 vicini di VERITY con questa variante:")
        for x in top:
            if cosv[x] > 0:
                print(f"       {cosv[x]:.3f}  {TIT0[x][:46]:<48} bolla {int(mem[x]):>5} "
                      f"({int(sz[mem[x]]):>3} tit.)")
        print(flush=True)

print("\n" + "=" * 104)
print("RIASSUNTO")
print("=" * 104)
base = RIS["V0 com'e' adesso"]
for k, v in RIS.items():
    print(f"  {k:<24} {v:>3}/600 ({100*v/600:5.1f}%) · {'+' if v >= base else ''}{100*(v-base)/600:+.1f} punti")
print(f"\nFINE ({time.time()-T0:.0f}s)")
