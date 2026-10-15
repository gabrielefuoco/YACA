"""09-connettivita-e-voti.py — due domande dell'utente.

1. **Quanto sono collegate all'esterno le bolle grandi, e quanto forti sono quei legami?**
   Per ogni bolla: quanta parte del suo peso totale sta DENTRO (fra i suoi membri) e quanta FUORI (verso
   le altre bolle). Una bolla grande e incoerente dovrebbe avere tanto peso esterno e poco interno — e
   se il peso esterno e' forte, quella bolla non e' un mondo: e' un incrocio.

2. **Impedire che nella bolla grande finisca roba buona.** *Il conte di Montecristo* (2024, 1.453 voti)
   e' finito con *Les Tuche* e *Brive de Nice*: il segnale «francese» e' giusto, il mondo no.
   L'idea da provare: nella collocazione, i candidati si filtrano per **compatibilita' di voti** — un
   titolo molto votato non va in una bolla di titoli oscuri.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
print("=" * 100)
print("CONNETTIVITA' ESTERNA DELLE BOLLE GRANDI, E LA REGOLA DEI VOTI")
print("=" * 100, flush=True)

mem = np.load(ML / "bolle-eterogeneo-V10-p1.0-r200.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
VOT = np.zeros(N, np.float32)
PQ = pathlib.Path(".cache/tmdb")
for typ, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
    d = pd.read_parquet(PQ / f, columns=["id", "vote_count"])
    for r in d.itertuples(index=False):
        riga = B.ROW_OF.get(f"{typ}:{int(r.id)}")
        if riga is not None:
            VOT[int(riga)] = r.vote_count or 0
print(f"  partizione: {NB:,} bolle · mediana {int(np.median(sz))} · la piu' grossa {int(sz.max())}",
      flush=True)

# il grafo dei titoli (il triangolo di V10, che e' la miscela di Leiden)
    # ATTENZIONE AL NOME: il triangolo e' il grafo PRIMA di Leiden, quindi NON dipende dalla
    # risoluzione. Il file salvato si chiama `r100` perche' un rilancio non ha passato RES=200, ma e'
    # lo stesso grafo da cui viene la partizione r200. La risoluzione cambia solo Leiden.
q = np.load(ML / "bolle-eterogeneo-V10-p1.0-triangolo.npz") \
    if (ML / "bolle-eterogeneo-V10-p1.0-triangolo.npz").exists() else None
if q is None:
    cand = sorted(ML.glob("*r200*triangolo*.npz")) + sorted(ML.glob("*V10*triangolo*.npz"))
    print(f"  triangoli trovati: {[c.name for c in cand]}")
    q = np.load(cand[0]) if cand else None
if q is None:
    raise SystemExit("serve il triangolo della miscela V10")
Ws = None
if q is not None:
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    Ws = (W + W.T).tocsr()
    print(f"  grafo dei titoli: {Ws.nnz:,} archi ({time.time()-T0:.0f}s)", flush=True)
else:
    print("  IL TRIANGOLO NON C'E': salto la parte 1 (connettivita') e faccio la parte 2 sui voti.")
    print("  Va salvato da `02-v10.py`, che ora lo fa. Per V8 esisteva, per V10 l'avevo perso.")

# ============================================================ 1. dentro / fuori
print("\n" + "=" * 100)
print("1. QUANTA PARTE DEL PESO STA DENTRO LA BOLLA, E QUANTA FUORI")
print("=" * 100, flush=True)
S1 = sp.csr_matrix((np.ones(N, np.float32), (np.arange(N), mem)), shape=(N, NB))
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
dentro_peso = np.zeros(NB, np.float32)
fuori_peso = np.zeros(NB, np.float32)
fuori_gradi = np.zeros(NB, np.int32)
for b in range(NB):
    idx = np.where(mem == b)[0]
    if len(idx) == 0:
        continue
    sub = Ws[idx][:, idx].tocoo()
    dentro_peso[b] = sub.data.sum()
    tot = float(Ws[idx].sum())
    fuori_peso[b] = max(tot - dentro_peso[b], 0.0)
    fuori_gradi[b] = int((BB.getrow(b) > 0).sum())
quota = dentro_peso / (dentro_peso + fuori_peso + 1e-9)
vot_med = np.zeros(NB, np.float32)
for b in range(NB):
    m_ = np.where(mem == b)[0]
    vot_med[b] = np.median(VOT[m_]) if len(m_) else 0

print(f"  {'fascia':<16} {'bolle':>6} {'peso dentro':>12} {'vicini esterni':>15} {'voti mediani':>13}")
for lo, hi in ((200, 10**6), (100, 200), (60, 100), (30, 60), (15, 30), (5, 15), (0, 5)):
    m = (sz >= lo) & (sz < hi)
    if not m.sum():
        continue
    print(f"  {lo:>3}-{hi if hi < 10**6 else '∞':<11} {int(m.sum()):>6} "
          f"{100*quota[m].mean():>11.1f}% {fuori_gradi[m].mean():>15.1f} "
          f"{int(np.median(vot_med[m])):>13,}")
print("\n  ^ 'peso dentro' e' la frazione del peso della bolla che resta fra i suoi membri.")
print("    Le bolle grandi hanno MENO peso interno e PIU' vicini esterni: sono incroci, non mondi.")

print(f"\n  LE DIECI PIU' SBILANCIATE VERSO L'ESTERNO (fra le bolle con 60+ titoli):")
grandi = np.where(sz >= 60)[0]
for b in sorted(grandi, key=lambda z: quota[z])[:10]:
    print(f"    bolla {b:>5} · {int(sz[b]):>3} tit. · dentro {100*quota[b]:>5.1f}% · "
          f"{int(fuori_gradi[b]):>4} vicini esterni · voti mediani {int(vot_med[b]):>6,}")

# ============================================================ 2. la regola dei voti
print("\n" + "=" * 100)
print("2. LA REGOLA DEI VOTI: un titolo molto votato non va in una bolla di titoli oscuri")
print("=" * 100, flush=True)
sys.path.insert(0, str(QUI.parent / "mappa-pesata"))
import colloca_finale as CF

TF = sp.load_npz(ML / "04-tfidf.npz").tocsr()
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
IS_TV = B.IS_TV
q_tv = np.zeros(NB)
np.add.at(q_tv, mem, IS_TV.astype(float))
quota_tv = q_tv / np.maximum(sz, 1)
MIN = 5
bolle_serie = np.where((quota_tv > 0.5) & (sz >= MIN))[0]
bolle_film = np.where((quota_tv <= 0.5) & (sz >= MIN))[0]
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
df = np.asarray((TF > 0).sum(0)).ravel()
S = dict(vocab=json.load(open(ML / "04-vocab.json", encoding="utf-8")),
         idf=np.log(TF.shape[0] / (1 + df)).astype(np.float32), TFIDF=TF, SUM=SUM, NORMA=NORMA,
         TUTTE=TUTTE, bolle_serie=set(int(x) for x in bolle_serie),
         bolle_film=set(int(x) for x in bolle_film), quota_tv=quota_tv, mem=mem, sz=sz)
VOT_BOLLA = np.array([np.median(VOT[MEMBRI[int(b)]]) if len(MEMBRI[int(b)]) else 0 for b in TUTTE])

# i titoli nuovi da provare: le uscite 2024+ piu' votate
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


nuovi = []
for typ, (f, col, coldata, extra) in COLS_TIPO.items():
    d = pd.read_parquet(PQ / f, columns=["id", col, "vote_count", coldata] + extra)
    for r in d.itertuples(index=False):
        dd = r._asdict()
        v = int(dd.get("vote_count") or 0)
        if v < 20 or anno_di(dd, coldata) < 2024:
            continue
        nuovi.append((v, typ, dd, B.ROW_OF.get(f"{typ}:{int(dd['id'])}")))
nuovi.sort(key=lambda z: -z[0])
print(f"  da provare: {len(nuovi):,} uscite 2024+ ({time.time()-T0:.0f}s)", flush=True)

TIT, _ = B.titoli_leggibili()


def colloca_con_voti(dd, typ, fattore=None):
    """Come `colloca`, ma i candidati si filtrano per compatibilita' di voti.

    Un titolo con V voti non puo' finire in una bolla i cui membri hanno mediane fuori da
    `[V/fattore, V*fattore]`. `fattore=None` = nessun filtro, come adesso.
    """
    v_, _ = CF.vettore(CF.tokenizza(dd, typ), S)
    if v_ is None:
        return None, 0.0
    cos = np.asarray((v_ @ SUM.T).todense()).ravel() / NORMA
    preferito = bolle_serie if typ == "tv" else bolle_film
    solo = np.array([b in set(int(x) for x in preferito) for b in TUTTE])
    Vv = float(dd.get("vote_count") or 0)
    if fattore:
        ok = (VOT_BOLLA >= Vv / fattore) & (VOT_BOLLA <= Vv * fattore)
    else:
        ok = np.ones(len(TUTTE), bool)
    punteggi = np.where(solo & ok, cos, -np.inf)
    if not np.isfinite(punteggi).any():
        punteggi = np.where(solo, cos, -np.inf)      # nessun candidato compatibile: si ripiega
    j = int(np.argmax(punteggi))
    return int(TUTTE[j]), float(cos[j])


print(f"\n  LE VENTI PIU' VOTATE, collocate con e senza la regola:")
print(f"  {'titolo':<40} {'voti':>7} {'senza':>22} {'con filtro x10':>22}")
for v, typ, dd, riga in nuovi[:20]:
    b0, _ = colloca_con_voti(dd, typ, None)
    b1, _ = colloca_con_voti(dd, typ, 10.0)
    nome = str(dd.get("title") or dd.get("name"))[:38]

    def desc(b):
        if b is None:
            return "—"
        return f"b{b} ({int(sz[b])} t., v{int(VOT_BOLLA[list(TUTTE).index(b)]) if b in TUTTE else 0})"
    print(f"  {nome:<40} {v:>7,} {desc(b0):>22} {desc(b1):>22}")
print(f"\nFINE ({time.time()-T0:.0f}s)")
