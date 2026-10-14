"""820.py — la bolla 820 per intero, e la tesi dell'utente verificata.

L'utente (14/10/2026): «mi sembra molto coerente: è una serie di film d'autore con ampio successo sul
pubblico, roba grossa a livello mediatico ma non schifezze. Film che piacciono tanto al cinefilo
quanto al grande pubblico.»

E' una tesi verificabile, e se regge **ribalta una mia conclusione**. Avevo chiamato la 820 «un
minestrone di prestigio contorto»: un giudizio dato sul SOTTOTEMA (sci-fi onirica, thriller
domestico, satira) e non su quello che tiene insieme la bolla. Se la bolla e' invece il **canone** —
film insieme popolari e rispettabili — allora:

  · l'indice di chimera aveva ragione (PMI mediana +0,880: i token sono d'accordo), e il minestrone
    ero io a vederlo, con un criterio mio;
  · la collocazione di Verity in 820 potrebbe essere **giusta**, non sbagliata.

Si misura: i voti (contro il catalogo), la popolarita', i registi, i generi, e i vicini sulla mappa.
"""
import json
import pathlib
import sys

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

B0 = 820
mem = np.load(K.ML / "bolle-nitrile-V8.npy")
sz = np.bincount(mem)
PQ = pathlib.Path(".cache/tmdb")
print("=" * 100)
print(f"LA BOLLA {B0} PER INTERO")
print("=" * 100, flush=True)

# ---------------------------------------------------------------- i metadati
mv = pd.read_parquet(PQ / "movies.parquet")
tv = pd.read_parquet(PQ / "tv.parquet")
PER_ID = {}
for d, tipo in ((mv, "movie"), (tv, "tv")):
    for r in d.itertuples(index=False):
        dd = r._asdict()
        PER_ID[(tipo, int(dd["id"]))] = dd

TIT = np.array([""] * len(mem), dtype=object)
for (tipo, i), dd in PER_ID.items():
    r = B.ROW_OF.get(f"{tipo}:{i}")
    if r is not None:
        TIT[r] = str(dd.get("title") or dd.get("name") or "")


def leggi(s):
    try:
        v = json.loads(s) if isinstance(s, str) else (s or [])
        return [x for x in v if isinstance(x, (dict, str))]
    except Exception:
        return []


def riga_di(r):
    for (tipo, i), dd in PER_ID.items():
        if B.ROW_OF.get(f"{tipo}:{i}") == r:
            return dd, tipo
    return None, None


membri = np.where(mem == B0)[0]
dati = []
for r in membri:
    dd, tipo = riga_di(r)
    if dd is None:
        dati.append((r, TIT[r], 0, "", "", "", ""))
        continue
    gen = [x["name"] for x in leggi(dd.get("genres"))]
    reg = [x.get("name") for x in leggi(dd.get("directors") if "directors" in dd
                                        else dd.get("created_by"))]
    dati.append((r, TIT[r], int(dd.get("vote_count") or 0),
                 str(dd.get("release_date") or dd.get("first_air_date") or "")[:4],
                 ", ".join(gen), ", ".join(reg[:2]),
                 f"{float(dd.get('vote_average') or 0):.1f}"))

dati.sort(key=lambda z: -z[2])
print(f"\n  {'titolo':<46} {'anno':>5} {'voti':>8} {'voto':>5}  {'regista':<24} generi")
for r, nome, voti, anno, gen, reg, voto in dati:
    print(f"  {nome[:44]:<46} {anno:>5} {voti:>8,} {voto:>5}  {reg[:22]:<24} {gen[:38]}")

# ---------------------------------------------------------------- la tesi, misurata
voti_b = np.array([d[2] for d in dati if d[2] > 0], float)
VOT = np.zeros(len(mem))
for (tipo, i), dd in PER_ID.items():
    r = B.ROW_OF.get(f"{tipo}:{i}")
    if r is not None:
        VOT[r] = dd.get("vote_count") or 0
print("\n" + "=" * 100)
print("LA TESI DELL'UTENTE, MISURATA")
print("=" * 100)
print(f"  'film d'autore con ampio successo sul pubblico'")
print(f"  voti nella bolla {B0}: mediana {int(np.median(voti_b)):,} · minimo {int(voti_b.min()):,}")
print(f"  voti nel catalogo (titoli nei grafi): mediana {int(np.median(VOT[VOT > 0])):,}")
print(f"  -> la mediana della bolla e' {np.median(voti_b)/np.median(VOT[VOT>0]):.1f} volte quella "
      f"del catalogo")
q = np.percentile(VOT[VOT > 0], [50, 90, 99])
print(f"  e il minimo della bolla ({int(voti_b.min()):,}) sta al "
      f"{100*(VOT[VOT>0] < voti_b.min()).mean():.1f}° percentile del catalogo")

# i registi
registi = {}
for r, nome, voti, anno, gen, reg, voto in dati:
    for x in [y.strip() for y in reg.split(",") if y.strip()]:
        registi[x] = registi.get(x, 0) + 1
print(f"\n  registi diversi: {len(registi)} su {len([d for d in dati if d[5]])} titoli con regista")
for x, n in sorted(registi.items(), key=lambda z: -z[1])[:12]:
    print(f"    {x} ({n})", end="")
print()

# i generi
gen_c = {}
for r, nome, voti, anno, gen, reg, voto in dati:
    for g in [y.strip() for y in gen.split(",") if y.strip()]:
        gen_c[g] = gen_c.get(g, 0) + 1
print(f"\n  generi: {sorted(gen_c.items(), key=lambda z: -z[1])}")

# gli anni
anni = np.array([int(d[3]) if d[3].isdigit() and len(d[3]) == 4 else 0 for d in dati])
anni = anni[anni > 0]
print(f"\n  anni: da {anni.min()} a {anni.max()} · mediana {int(np.median(anni))}")

# ---------------------------------------------------------------- i termini del centroide
SUM = sp.load_npz(K.ML / "05-centroidi.npz").tocsr()
META = np.load(K.ML / "05-centroidi-meta.npz")
TUTTE = np.concatenate([META["bolle_serie"], META["bolle_film"]])
vocab = json.load(open(K.ML / "05-vocab.json", encoding="utf-8"))
inv = {i: t for t, i in vocab.items()}
j = int(np.where(TUTTE == B0)[0][0])
v = SUM[j].toarray().ravel()
top = np.argsort(-v)[:30]
print("\n  I TRENTA TERMINI CHE DEFINISCONO LA BOLLA:")
print("    " + " · ".join(inv[int(t)] for t in top if v[t] > 0))
print("\n  (e i kw: e ge: fra questi dicono se c'e' un tema, o solo 'film famosi')")
solo_tem = [inv[int(t)] for t in np.argsort(-v)[:60] if v[t] > 0 and inv[int(t)][:3] in ("kw:", "ge:")]
print("    tematici: " + " · ".join(solo_tem[:18]))

# ---------------------------------------------------------------- i vicini sulla mappa
C = sp.load_npz(K.ML / "mappa-coerente.npz")
M8 = sp.csr_matrix((C["data"], C["indices"], C["indptr"]), shape=(len(sz),) * 2)
q = np.load(K.ML / "bolle-nitrile-V8-triangolo.npz")
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(len(mem),) * 2)
Ws = (Ws + Ws.T).tocsr()
S1 = sp.csr_matrix((np.ones(len(mem), np.float32), (np.arange(len(mem)), mem)),
                   shape=(len(mem), len(sz)))
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
print("\n" + "=" * 100)
print("I VICINI DELLA 820 — sulla mappa, e sono altri 'canoni'?")
print("=" * 100)
riga = BB.getrow(B0)
o = np.argsort(-riga.data)[:8]
for t in o:
    j2 = int(riga.indices[t])
    m_ = np.where(mem == j2)[0]
    voti_v = int(np.median([VOT[x] for x in m_])) if len(m_) else 0
    print(f"  bolla {j2:>4} ({int(sz[j2]):>3} tit., voti mediani {voti_v:>7,}): "
          f"{[TIT[x][:26] for x in m_[:5]]}")
