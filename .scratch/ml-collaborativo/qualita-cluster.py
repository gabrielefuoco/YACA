"""qualita-cluster.py — QUALITA' DEI CLUSTER: quanti, quanto buoni, i migliori e i peggiori.
Metriche per cluster:
  coerenza  = similarita' media a coppie dentro il cluster / media globale (lift)
  tema      = quota del tema dominante (i vostri 57 macro-temi)
  genere    = quota del genere dominante (TMDB)
  curati    = legami curati interni / attesi a caso (lift)
  misto     = quota di serie (50% = perfettamente bilanciato)
Punteggio composito per ordinare migliori e peggiori. Titoli leggibili, non id.
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import csr_matrix
import igraph as ig
import leidenalg as la
import pandas as pd

ROOT = pathlib.Path(".").resolve()
ML, PQ = ROOT / ".cache" / "movielens", ROOT / ".cache" / "tmdb"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")

# titoli leggibili
TIT = {}
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "genres"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "genres"])
GEN = {}
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t, gn in zip(df["id"], df[col], df["genres"]):
        k = f"{typ}:{int(i)}"
        TIT[k] = str(t)
        try:
            g0 = json.loads(gn) if isinstance(gn, str) else gn
        except Exception:
            g0 = []
        GEN[k] = (g0[0].get("name", "?") if g0 and isinstance(g0[0], dict) else (str(g0[0]) if g0 else "?"))


def nome(k):
    t = TIT.get(k, "?")
    return f"{t} ({'S' if k.startswith('tv:') else 'F'})"


# tema dominante
zt = np.load(ML / "temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n:
    T = T.T
TEMA_NOMI = [str(x) for x in zt["keys"]]
tema_arg = np.argmax(T, axis=1) if T.shape[0] == n else np.zeros(n, int)

# grafo (dalla cache)
zz = np.load(ML / "leiden-graph.npz")
M = csr_matrix((zz["data"], zz["indices"], zz["indptr"]), shape=(n, n))
coo = M.tocoo()
mask = coo.row < coo.col
g = ig.Graph(n=n, edges=list(zip(coo.row[mask].tolist(), coo.col[mask].tolist())), directed=False)
g.es["weight"] = coo.data[mask].tolist()

# legami curati
d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
coppie = []
for s in d["sources"]:
    a = row_of.get(s["id"])
    if a is None:
        continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is not None:
            coppie.append((a, b))
coppie = np.array(coppie)
print(f"grafo: {g.vcount():,} nodi · {g.ecount():,} archi · legami curati {len(coppie):,}")

# similarita' a coppie: campione per cluster (i grandi non si possono fare tutti)
Pc2 = Pc.astype(np.float64).copy()
Pc2[~is_tv] -= Pc[~is_tv].mean(0)
Pc2[is_tv] -= Pc[is_tv].mean(0)
Pc2 = Pc2 / (np.linalg.norm(Pc2, axis=1, keepdims=True) + 1e-9)
rng = np.random.default_rng(0)
samp = rng.choice(n, 4000, replace=False)
GLOB_SIM = float((Pc2[samp] @ Pc2[samp].T).mean())

for res in (30.0, 100.0):
    part = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                             resolution_parameter=res, seed=42)
    lab = np.array(part.membership)
    sizes = np.bincount(lab)
    ncl = len(sizes)
    print("")
    print(f"########## RISOLUZIONE {res:.0f} — {ncl:,} CLUSTER ##########")
    print(f"  dimensione: mediana {int(np.median(sizes))} · min {sizes.min()} · max {sizes.max()} "
          f"· singletons {(sizes==1).sum()} ({(sizes==1).mean()*100:.0f}%)")
    print(f"  copertura: {(sizes>=5).sum()} cluster con >=5 titoli "
          f"({100*(sizes>=5).mean():.0f}% dei cluster, {100*sizes[sizes>=5].sum()/n:.0f}% dei titoli)")

    righe = []
    for c in range(ncl):
        mem = np.where(lab == c)[0]
        if len(mem) < 3:
            continue
        # coerenza
        if len(mem) > 300:
            mm = rng.choice(mem, 300, replace=False)
        else:
            mm = mem
        coerenza = float((Pc2[mm] @ Pc2[mm].T).mean()) / GLOB_SIM
        # tema e genere dominanti
        temi = Counter(tema_arg[i] for i in mem)
        gen = Counter(GEN.get(keys[i], "?") for i in mem)
        tema_dom, tema_quota = temi.most_common(1)[0]
        gen_dom, gen_quota = gen.most_common(1)[0]
        # curati interni
        m = np.isin(lab[coppie[:, 0]], [c]) & np.isin(lab[coppie[:, 1]], [c])
        cur = int(m.sum())
        atteso = len(coppie) * (len(mem) / n) ** 2
        lift_cur = cur / max(1e-9, atteso)
        # misto
        frac_tv = float(is_tv[mem].mean())
        misto = 1.0 - abs(frac_tv - 0.5) * 2  # 1 = bilanciato, 0 = tutto un medium
        righe.append(dict(c=c, size=len(mem), coerenza=coerenza, tema=TEMA_NOMI[tema_dom],
                          tema_q=tema_quota / len(mem), gen=gen_dom, gen_q=gen_quota / len(mem),
                          cur=cur, lift=lift_cur, misto=misto, mem=mem))
    # punteggio: coerenza (log), purezza tema+genere, lift curati (log), misto, penalita' per size
    for r in righe:
        r["score"] = (np.log10(max(1e-9, r["coerenza"])) + 0.5 * (r["tema_q"] + r["gen_q"])
                      + 0.3 * np.log10(max(1e-9, r["lift"])) + 0.2 * r["misto"]
                      + 0.2 * min(1.0, r["size"] / 50))
    righe.sort(key=lambda r: -r["score"])
    print(f"\n  --- I 5 MIGLIORI (su {len(righe)} cluster con >=3 titoli) ---")
    for r in righe[:5]:
        print(f"\n  [{r['score']:.2f}] cluster {r['c']} · {r['size']} titoli "
              f"({int(is_tv[r['mem']].sum())} serie / {int((~is_tv[r['mem']]).sum())} film)")
        print(f"        coerenza {r['coerenza']:.2f}x · tema {r['tema']} ({100*r['tema_q']:.0f}%) · "
              f"genere {r['gen']} ({100*r['gen_q']:.0f}%) · curati {r['cur']} ({r['lift']:.0f}x)")
        print(f"        {', '.join(nome(keys[i]) for i in r['mem'][:8])}")
    print(f"\n  --- I 5 PEGGIORI ---")
    for r in righe[-5:]:
        print(f"\n  [{r['score']:.2f}] cluster {r['c']} · {r['size']} titoli "
              f"({int(is_tv[r['mem']].sum())} serie / {int((~is_tv[r['mem']]).sum())} film)")
        print(f"        coerenza {r['coerenza']:.2f}x · tema {r['tema']} ({100*r['tema_q']:.0f}%) · "
              f"genere {r['gen']} ({100*r['gen_q']:.0f}%) · curati {r['cur']} ({r['lift']:.0f}x)")
        print(f"        {', '.join(nome(keys[i]) for i in r['mem'][:8])}")
    # sintesi
    print(f"\n  --- SINTESI risoluzione {res:.0f} ---")
    print(f"  coerenza media {np.mean([r['coerenza'] for r in righe]):.2f}x · "
          f"purezza tema media {100*np.mean([r['tema_q'] for r in righe]):.0f}% · "
          f"purezza genere media {100*np.mean([r['gen_q'] for r in righe]):.0f}%")
    print(f"  cluster che battono il caso sui curati: "
          f"{sum(1 for r in righe if r['lift']>1)}/{len(righe)} "
          f"({100*sum(1 for r in righe if r['lift']>1)/len(righe):.0f}%)")
    print(f"  cluster bilanciati film/serie (misto>0.6): "
          f"{sum(1 for r in righe if r['misto']>0.6)}/{len(righe)}")
