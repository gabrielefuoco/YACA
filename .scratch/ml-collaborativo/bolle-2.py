"""bolle-2.py — LE BOLLE CON I COMPONENTI NUOVI, DA LEGGERE.

Le varianti si costruiscono aggiungendo un componente per volta alla base del comportamento,
e si stampano 24 bolle per variante in forma compatta — solo i titoli — cosi' che si possa
leggere e giudicare se il minestrone si aggiusta.

  A)  comportamento             CF + CFst + B
  B)  + keyword                 A + KW
  C)  + co-visione Trakt        A + TV
  D)  + keyword + Trakt         A + KW + TV
  E)  + keyword + Trakt + cast + registi + franchise   A + KW + TV + CAST + DIR + COLL

Tutti i componenti sono normalizzati per riga prima del mixing (canone.costruisci).
Risoluzione 100, come il report 71.
"""
import pathlib, sys, time
import numpy as np
import pandas as pd
import igraph as ig
import leidenalg as la

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
PQ = K.ROOT / ".cache" / "tmdb"
TIT, VOT = {}, np.zeros(n, np.float32)
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "vote_count"])
tvp = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "vote_count"])
for typ, df, col in (("movie", mv, "title"), ("tv", tvp, "name")):
    for i, t, vc in zip(df["id"], df[col], df["vote_count"]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)
            VOT[r] = float(vc or 0)

CMP = K.Componenti(n)
C = CMP(30)
print(f"componenti base pronti ({time.time()-t0:.0f}s)", flush=True)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    C[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
    g = np.asarray((C[nome] > 0).sum(1)).ravel()
    print(f"  {nome}: {C[nome].nnz:,} archi · copre {int((g>0).sum()):,} titoli", flush=True)

VARIANTI = {
    "A) comportamento (base)": {"CF": 1, "CFst": 1, "B": 1},
    "B) + keyword": {"CF": 1, "CFst": 1, "B": 1, "KW": 1},
    "C) + co-visione Trakt": {"CF": 1, "CFst": 1, "B": 1, "TV": 1},
    "D) + keyword + Trakt": {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1},
    "E) + keyword + Trakt + cast + registi + franchise": {
        "CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 1},
}
RES = 100
QUANTE = 24

for nome, pesi in VARIANTI.items():
    print("")
    print("=" * 100)
    print(f"{nome}")
    print("=" * 100, flush=True)
    M = K.costruisci(C, pesi, wc=0.0, beta=0.25)
    Mc = M.tocoo()
    msk = Mc.row < Mc.col
    g = ig.Graph(n=n, edges=list(zip(Mc.row[msk].tolist(), Mc.col[msk].tolist())), directed=False)
    g.es["weight"] = Mc.data[msk].tolist()
    p = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                          resolution_parameter=RES, seed=42)
    mem = np.array(p.membership)
    np.save(K.ML / f"bolle2-{nome[0]}.npy", mem)
    sz = np.bincount(mem)
    ids = [i for i in range(len(sz)) if 15 <= sz[i] <= 45]
    print(f"  {len(np.unique(mem)):,} bolle · {len(ids):,} di 15-45 titoli · "
          f"modularita' {p.modularity:.3f} ({time.time()-t0:.0f}s)", flush=True)
    rng = np.random.default_rng(7)
    scelte = rng.choice(len(ids), size=min(QUANTE, len(ids)), replace=False)
    for i in scelte:
        b = ids[i]
        m = np.where(mem == b)[0]
        ordine = m[np.argsort(-VOT[m])]
        testa = [TIT.get(r, "?") for r in ordine[:13]]
        print(f"\n  [{len(m)} titoli · serie {int(is_tv[m].sum())} · voti mediani "
              f"{int(np.median(VOT[m]))}]")
        print("     " + " · ".join(t[:32] for t in testa))
print(f"\nFINE ({time.time()-t0:.0f}s)")
