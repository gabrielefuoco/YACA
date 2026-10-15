"""08-senza-trama-e-bolle-grandi.py — tre domande dell'utente.

1. **COSA sono i titoli senza trama?** Roba scadente che non ci interessa, o titoli veri? Si guarda
   la distribuzione dei voti, gli anni, e i piu' votati senza trama — per nome.
2. **Gli altri componenti li coprono?** Il componente di trama e' UNO dei dieci. Kw, CAST, DIR, CF, B,
   TV, LIST non hanno bisogno della trama: si misura quanti dei titoli senza trama hanno archi negli
   altri componenti, che e' la domanda vera.
3. **Le bolle ancora grandi a RB 200.** Il tetto e' sceso da 543 a 341 ma non e' sparito: si guardano
   la distribuzione e le dieci piu' grosse, per nome e per coerenza.
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
PQ = pathlib.Path(".cache/tmdb")
print("=" * 100)
print("SENZA TRAMA, E LE BOLLE ANCORA GRANDI")
print("=" * 100, flush=True)

# ---------------------------------------------------------------- i metadati, una volta
RIGA = {}          # riga del canone -> (titolo, tipo, id, voti, anno, ha_trama)
TRAMA = set()
COLS_TIPO = {"movie": ("movies.parquet", "title", "release_date"),
             "tv": ("tv.parquet", "name", "first_air_date")}
for typ, (f, col, coldata) in COLS_TIPO.items():
    d = pd.read_parquet(PQ / f, columns=["id", col, coldata, "overview", "vote_count"])
    for r in d.itertuples(index=False):
        riga = B.ROW_OF.get(f"{typ}:{int(r.id)}")
        if riga is None:
            continue
        o = str(r.overview or "").strip()
        try:
            a = int(str(getattr(r, coldata))[:4])
            a = a if 1800 < a < 2100 else 0
        except Exception:
            a = 0
        RIGA[int(riga)] = (str(getattr(r, col) or ""), typ, int(r.id),
                           int(r.vote_count or 0), a, len(o) > 40)
        if len(o) > 40:
            TRAMA.add(int(riga))
print(f"  canone: {len(RIGA):,} titoli coi metadati · con una trama {len(TRAMA):,} "
      f"({100*len(TRAMA)/len(RIGA):.1f}%) ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- 1. cosa sono, senza trama
print("\n" + "=" * 100)
print("1. COSA SONO I TITOLI SENZA TRAMA")
print("=" * 100)
con = np.array([RIGA[r][3] for r in RIGA if r in TRAMA])
sen = np.array([RIGA[r][3] for r in RIGA if r not in TRAMA])
print(f"  CON trama: {len(con):,} titoli · voti mediani {int(np.median(con)):,} · "
      f"oltre 1000 voti {100*(con>1000).mean():.1f}%")
print(f"  SENZA    : {len(sen):,} titoli · voti mediani {int(np.median(sen)):,} · "
      f"oltre 1000 voti {100*(sen>1000).mean():.1f}%")
anni_con = np.array([RIGA[r][4] for r in RIGA if r in TRAMA and RIGA[r][4] > 0])
anni_sen = np.array([RIGA[r][4] for r in RIGA if r not in TRAMA and RIGA[r][4] > 0])
print(f"  anno mediano: con trama {int(np.median(anni_con))} · senza {int(np.median(anni_sen))}")

print(f"\n  I VENTI SENZA TRAMA PIU' VOTATI — roba scadente o titoli veri?")
senza = sorted([r for r in RIGA if r not in TRAMA], key=lambda z: -RIGA[z][3])
for r in senza[:20]:
    t, typ, i, v, a, _ = RIGA[r]
    print(f"    {v:>7,} voti  {a}  [{typ}] {t[:52]}")
print(f"\n  e i venti CON trama piu' votati, per confronto:")
for r in sorted(TRAMA, key=lambda z: -RIGA[z][3])[:5]:
    t, typ, i, v, a, _ = RIGA[r]
    print(f"    {v:>7,} voti  {a}  [{typ}] {t[:52]}")

# ---------------------------------------------------------------- 2. gli altri componenti li coprono?
print("\n" + "=" * 100)
print("2. GLI ALTRI COMPONENTI COPRONO CHI NON HA LA TRAMA?")
print("=" * 100, flush=True)
N = B.N
print(f"  {'componente':<10} {'copre (con trama)':>18} {'copre (senza trama)':>20}")
for nome in ("KW", "CAST", "DIR", "PROD"):
    f = ML / f"bolle-nitrile-{nome}.npz"
    if not f.exists():
        continue
    # `K.carica_csr` legge ENTRAMBI i formati: `carica_componenti` salva con `np.savez_compressed`,
    # che `sp.load_npz` non legge. E' lo stesso inciampo di `eterogeneo-TRAMA.npz` di un'ora fa.
    M = K.carica_csr(f.name, N)
    M = M.tocsr() if not sp.issparse(M) else M
    g = np.asarray((M > 0).sum(1)).ravel()
    ha = g > 0
    con_ = np.mean([ha[r] for r in RIGA if r in TRAMA])
    sen_ = np.mean([ha[r] for r in RIGA if r not in TRAMA])
    print(f"  {nome:<10} {100*con_:>17.1f}% {100*sen_:>19.1f}%")
# CF/B/TV/LIST vengono da K.Componenti e dai file `nuovo-*`: si guarda la copertura dei file
for nome in ("TV", "LIST", "COLL"):
    f = ML / f"nuovo-{nome}.npz"
    if not f.exists():
        continue
    try:
        M = K.carica_csr(f"nuovo-{nome}.npz", N)
        g = np.asarray((M > 0).sum(1)).ravel()
        ha = g > 0
        con_ = np.mean([ha[r] for r in RIGA if r in TRAMA])
        sen_ = np.mean([ha[r] for r in RIGA if r not in TRAMA])
        print(f"  {nome:<10} {100*con_:>17.1f}% {100*sen_:>19.1f}%")
    except Exception as e:
        print(f"  {nome}: {type(e).__name__}")

# ---------------------------------------------------------------- 3. le bolle ancora grandi
print("\n" + "=" * 100)
print("3. LE BOLLE ANCORA GRANDI A RB 200")
print("=" * 100, flush=True)
mem = np.load(ML / "bolle-eterogeneo-V10-p1.0-r200.npy")
sz = np.bincount(mem)
print(f"  {len(sz):,} bolle · mediana {int(np.median(sz))} · la piu' grossa {int(sz.max())}")
print(f"  distribuzione delle code:")
for lo, hi in ((200, 10**6), (150, 200), (120, 150), (100, 120), (60, 100), (30, 60)):
    m = (sz >= lo) & (sz < hi)
    print(f"    da {lo:>3} a {hi if hi < 10**6 else '∞':>3} titoli: {int(m.sum()):>4,} bolle · "
          f"{int(sz[m].sum()):>6,} titoli ({100*sz[m].sum()/sz.sum():4.1f}% del canone)")

TIT = {r: RIGA[r][0] for r in RIGA}
VOT = {r: RIGA[r][3] for r in RIGA}
print(f"\n  LE DIECI PIU' GROSSE, coi cinque titoli piu' votati di ognuna:")
for b in np.argsort(-sz)[:10]:
    m_ = np.where(mem == b)[0]
    o = sorted(m_, key=lambda z: -VOT.get(z, 0))[:5]
    cop = 100 * np.mean([r in TRAMA for r in m_])
    print(f"\n    bolla {b:>5} · {int(sz[b])} titoli · {cop:.0f}% con trama")
    print(f"       {' | '.join(TIT.get(r, '?')[:30] for r in o)}")
print(f"\nFINE ({time.time()-T0:.0f}s)")
