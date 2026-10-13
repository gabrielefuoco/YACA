"""bolle.py — LE BOLLE SU QUATTRO GRAFI, E IL CAMPIONE DA LEGGERE.

Il giudizio sulle bolle e' mio: le leggo. Questo script costruisce le bolle su grafi diversi e
stampa un campione leggibile — titoli, anno, voti, generi dominanti, tema dominante — cosi' che
si possa dire se una bolla e' "una cosa sola" o un minestrone.

I quattro grafi (tutti normalizzati, senza la contaminazione Pc):
  A) COMPORTAMENTO   CF (film) + CFst + B (serie)          <- la ricetta minima
  B) CONTENUTO       Kc (metadati puliti) + T (temi)
  C) TUTTO           CF + CFst + B + Kc + T + curatela      <- "tutto fa brodo"
  D) TUTTO SENZA CURATELA  CF + CFst + B + Kc + T
"""
import json, pathlib, sys, time
from collections import Counter
import numpy as np
import pandas as pd
import igraph as ig
import leidenalg as la

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
PQ = K.ROOT / ".cache" / "tmdb"

print("carico titoli, generi, voti ...", flush=True)
TIT, GEN, VOT, ANN = {}, {}, np.zeros(n, np.float32), np.zeros(n, np.int32)
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "genres", "vote_count", "release_date"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "genres", "vote_count", "first_air_date"])
for typ, df, col, dcol in (("movie", mv, "title", "release_date"), ("tv", tv, "name", "first_air_date")):
    for i, t, g, vc, dt in zip(df["id"], df[col], df["genres"], df["vote_count"], df[dcol]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is None:
            continue
        TIT[r] = str(t)
        VOT[r] = float(vc or 0)
        s = str(dt or "")[:4]
        ANN[r] = int(s) if s.isdigit() else 0
        try:
            gs = json.loads(g) if isinstance(g, str) else (g or [])
            GEN[r] = [x.get("name") for x in gs if isinstance(x, dict)]
        except Exception:
            GEN[r] = []

zt = np.load(K.ML / "temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n:
    T = T.T
TEMA = [str(x) for x in zt["keys"]]
print(f"  titoli {len(TIT):,} · con generi {sum(1 for v in GEN.values() if v):,} "
      f"· temi {T.shape[1]} ({time.time()-t0:.0f}s)", flush=True)

CMP = K.Componenti(n)
C = CMP(30)


def grafo(pesi, wc=0.0):
    return K.costruisci(C, pesi, wc=wc, beta=0.25)


VARIANTI = {
    "A) COMPORTAMENTO": grafo({"CF": 1, "CFst": 1, "B": 1}),
    "B) CONTENUTO": grafo({"Kc": 1, "T": 1}),
    "C) TUTTO (con curatela)": grafo({"CF": 1, "CFst": 1, "B": 1, "Kc": 1, "T": 1}, wc=0.30),
    "D) TUTTO senza curatela": grafo({"CF": 1, "CFst": 1, "B": 1, "Kc": 1, "T": 1}),
}
print(f"grafi pronti ({time.time()-t0:.0f}s)", flush=True)


def leiden(M, res):
    M = M.tocoo()
    msk = M.row < M.col
    g = ig.Graph(n=n, edges=list(zip(M.row[msk].tolist(), M.col[msk].tolist())), directed=False)
    g.es["weight"] = M.data[msk].tolist()
    p = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                          resolution_parameter=res, seed=42)
    return np.array(p.membership), float(p.modularity)


def leggi_bolle(mem, quante=18):
    """stampa un campione leggibile: bolle piccole, medie e grandi."""
    sz = np.bincount(mem)
    ids = [i for i in range(len(sz)) if sz[i] >= 4]
    piccole = [i for i in ids if sz[i] <= 15]
    medie = [i for i in ids if 16 <= sz[i] <= 45]
    grandi = [i for i in ids if sz[i] > 45]
    rng = np.random.default_rng(0)
    scelte = []
    for gruppo, k in ((piccole, 6), (medie, 8), (grandi, 4)):
        if not gruppo:
            continue
        idx = rng.choice(len(gruppo), size=min(k, len(gruppo)), replace=False)
        scelte += [gruppo[i] for i in idx]
    for b in scelte:
        m = np.where(mem == b)[0]
        v = VOT[m]
        ordine = m[np.argsort(-v)]
        gen = Counter(g for r in m for g in GEN.get(r, []))
        tem = Counter(int(np.argmax(T[r])) for r in m if T[r].sum() > 0)
        tt = tem.most_common(1)
        etichetta = TEMA[tt[0][0]] if tt else "—"
        print("")
        print(f"  ── bolla {b} · {len(m)} titoli · serie {int(is_tv[m].sum())} · "
              f"voti mediani {int(np.median(v))} · tema «{etichetta}»")
        print(f"     generi: " + " · ".join(f"{g} {100*c/len(m):.0f}%" for g, c in gen.most_common(4)))
        for r in ordine[:10]:
            print(f"       {TIT.get(r,'?')[:52]:<52} {int(ANN[r]) if ANN[r] else '    '} "
                  f"v{int(VOT[r]):>7,} {'[S]' if is_tv[r] else '   '}")
        resto = [r for r in m if r not in set(ordine[:10])]
        if resto:
            rng2 = np.random.default_rng(int(b))
            for r in rng2.choice(len(resto), size=min(4, len(resto)), replace=False):
                r = resto[int(r)]
                print(f"       {TIT.get(r,'?')[:52]:<52} {int(ANN[r]) if ANN[r] else '    '} "
                      f"v{int(VOT[r]):>7,} {'[S]' if is_tv[r] else '   '}  (a caso)")


for nome, M in VARIANTI.items():
    print("")
    print("=" * 108)
    print(f"{nome}")
    print("=" * 108)
    migliore = None
    for res in (10, 30, 100, 300):
        mem, mod = leiden(M, res)
        sz = np.bincount(mem)
        sz = sz[sz >= 4]
        med = float(np.median(sz)) if len(sz) else 0
        print(f"  res {res:<4} · {len(np.unique(mem)):,} bolle · mediana {med:.0f} · "
              f"max {int(sz.max()) if len(sz) else 0:,} · modularita' {mod:.3f}  ({time.time()-t0:.0f}s)",
              flush=True)
        if migliore is None or abs(med - 25) < abs(migliore[1] - 25):
            migliore = (mem, med, res)
    mem = migliore[0]
    print(f"\n  CAMPIONE alla risoluzione {migliore[2]} (mediana {migliore[1]:.0f}):")
    leggi_bolle(mem)
    np.save(K.ML / f"bolle-{nome[0]}.npy", mem)
print(f"\nFINE ({time.time()-t0:.0f}s)")
