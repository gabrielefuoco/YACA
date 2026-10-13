"""medium-archi.py — I 4 TIPI DI ARCO ATTRAVERSANO I MEDIUM?

La tesi dell'utente: «tra serie e film non cambia molto e i metadati diversi sono
discretizzabili e mappabili». Se e' vero, il ponte cross-medium NON deve reggersi sui
3.512 archi scritti a mano: deve poter uscire dai metadati.

I 4 tipi di arco, gia' cachati e gia' normalizzati:
  C  contenuto  k-NN dello spazio Pc (keyword)          <- il candidato naturale
  B  co-visione related di Trakt                         <- mono-medium per costruzione
  T  temi       i 57 macro-temi scritti a mano            <- un vocabolario COMUNE ai due medium
  K  curatela   i legami scritti a mano                  <- l'unico ponte oggi

Si misura per ciascuno: quanti archi attraversano film<->serie, e gli esempi.
"""
import pathlib, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")

TIT = {}
mv = pd.read_parquet(ROOT / ".cache" / "tmdb" / "movies.parquet", columns=["id", "title"])
tv = pd.read_parquet(ROOT / ".cache" / "tmdb" / "tv.parquet", columns=["id", "name"])
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t in zip(df["id"], df[col]):
        TIT[f"{typ}:{int(i)}"] = str(t)


def carica(nome):
    q = np.load(ML / nome)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


def analizza(A, nome):
    coo = A.tocoo()
    m = coo.row < coo.col
    r, c = coo.row[m], coo.col[m]
    cross = is_tv[r] != is_tv[c]
    da_serie = is_tv[r] & ~is_tv[c]
    print(f"\n  {nome}")
    print(f"    archi (senza doppi): {len(r):,} · cross-medium: {int(cross.sum()):,} ({100*cross.mean():5.2f}%)")
    print(f"    serie->film: {int(da_serie.sum()):,} · film->serie: {int((~is_tv[r] & is_tv[c]).sum()):,}")
    # quanti nodi hanno ALMENO un arco cross-medium
    toccati = np.zeros(n, bool)
    toccati[r[cross]] = True
    toccati[c[cross]] = True
    print(f"    nodi toccati da almeno un arco cross-medium: {int(toccati.sum()):,} "
          f"({100*toccati.mean():.1f}%) · di cui serie {int((toccati & is_tv).sum()):,}")
    return r, c, cross


print("=" * 96)
print("QUANTI ARCHI ATTRAVERSANO I MEDIUM, PER TIPO")
print("=" * 96)
C = carica("boot-C.npz")
rC, cC, crossC = analizza(C, "C · CONTENUTO (k-NN dello spazio Pc, keyword)")
B = carica("boot-B.npz")
analizza(B, "B · CO-VISIONE (related di Trakt)")
Tm = carica("boot-T.npz")
rT, cT, crossT = analizza(Tm, "T · TEMI (i 57 macro-temi scritti a mano)")
K = carica("boot-Kall.npz")
analizza(K, "K · CURATELA (i legami scritti a mano)")

print("")
print("=" * 96)
print("GLI ARCHI CROSS-MEDIUM DI CONTENUTO SONO SENSATI? (16 esempi, a caso)")
print("=" * 96)
rng = np.random.default_rng(5)
idx = np.where(crossC)[0]
for i in rng.choice(idx, size=16, replace=False):
    a, b = rC[i], cC[i]
    wa, wb = float(C[a, b]), float(C[b, a])
    print(f"    {'serie' if is_tv[a] else 'film '} {TIT.get(keys[a],'?')[:44]:<44} "
          f"<-> {'serie' if is_tv[b] else 'film '} {TIT.get(keys[b],'?')[:44]:<44}")

print("")
print("=" * 96)
print("GLI ARCHI CROSS-MEDIUM DEI TEMI SONO SENSATI? (16 esempi)")
print("=" * 96)
idxT = np.where(crossT)[0]
if len(idxT):
    for i in rng.choice(idxT, size=min(16, len(idxT)), replace=False):
        a, b = rT[i], cT[i]
        print(f"    {'serie' if is_tv[a] else 'film '} {TIT.get(keys[a],'?')[:44]:<44} "
              f"<-> {'serie' if is_tv[b] else 'film '} {TIT.get(keys[b],'?')[:44]:<44}")

# quante SERIE hanno almeno un vicino film nello spazio Pc?
print("")
print("=" * 96)
print("QUANTE SERIE HANNO ALMENO UN VICINO FILM, PER TIPO DI ARCO?")
print("=" * 96)
for nome, A in (("contenuto", C), ("co-visione", B), ("temi", Tm), ("curatela", K)):
    coo = A.tocoo()
    m = coo.row < coo.col
    r, c = coo.row[m], coo.col[m]
    ha = np.zeros(n, bool)
    cross = is_tv[r] != is_tv[c]
    ha[r[cross]] = True
    ha[c[cross]] = True
    serie_cross = ha[is_tv]
    print(f"  {nome:<12}: serie con >=1 vicino film: {int(serie_cross.sum()):>6}/{int(is_tv.sum()):,} "
          f"({100*serie_cross.mean():5.1f}%)")
print(f"\n({time.time()-t0:.0f}s)")
