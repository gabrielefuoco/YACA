"""metrica-nuova.py — LA METRICA RIFATTA.

Il difetto di prima: misuravo la coerenza con lo spazio del contenuto, che e' un INPUT del grafo.
Risultato: i cluster migliori erano il cinema indiano (titoli in devanagari = keyword simili),
non le bolle di gusto migliori.

La metrica nuova:
  n_tipi   = quanti dei 4 tipi di arco hanno un lift interno > 1 (0..4).
             Un cluster e' solido se PIU' FONTI INDIPENDENTI lo confermano.
  tema     = purezza sul tema dominante (i vostri 57 macro-temi, scritti a mano)
  genere   = purezza sul genere TMDB dominante
  lingua   = quota della lingua dominante (per scoprire il bias della grafia)
  cross    = bilanciamento film/serie (1 = meta' e meta')
Ordino per n_tipi, poi per tema, poi per genere. Mostro migliori e peggiori con i titoli.
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
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
n = len(keys)
is_tv = (tipo == "tv")

TIT, GEN, LANG = {}, {}, {}
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "genres", "original_language"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "genres", "original_language"])
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t, gn, lg in zip(df["id"], df[col], df["genres"], df["original_language"]):
        k = f"{typ}:{int(i)}"
        TIT[k] = str(t)
        LANG[k] = str(lg)
        try:
            g0 = json.loads(gn) if isinstance(gn, str) else gn
        except Exception:
            g0 = []
        GEN[k] = (g0[0].get("name", "?") if g0 and isinstance(g0[0], dict) else (str(g0[0]) if g0 else "?"))


def nome(k):
    return f"{TIT.get(k,'?')} ({'S' if k.startswith('tv:') else 'F'})"


zt = np.load(ML / "temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n:
    T = T.T
TEMA = [str(x) for x in zt["keys"]]
tema_arg = np.argmax(T, axis=1) if T.shape[0] == n else np.zeros(n, int)

# i 4 grafi separati (cache della diagnosi)
zz = np.load(ML / "diagnosi-grafi.npz")
TIPI = {
    "C": csr_matrix((zz["dc"], zz["ic"], zz["pc"]), shape=(n, n)),
    "B": csr_matrix((zz["db"], zz["ib"], zz["pb"]), shape=(n, n)),
    "T": csr_matrix((zz["dt"], zz["it"], zz["pt"]), shape=(n, n)),
    "K": csr_matrix((zz["dk"], zz["ik"], zz["pk"]), shape=(n, n)),
}
NOMI_T = {"C": "contenuto", "B": "co-visione", "T": "temi", "K": "curatela"}

# grafo unito e Leiden
zz2 = np.load(ML / "leiden-graph.npz")
M = csr_matrix((zz2["data"], zz2["indices"], zz2["indptr"]), shape=(n, n))
coo = M.tocoo()
mask = coo.row < coo.col
g = ig.Graph(n=n, edges=list(zip(coo.row[mask].tolist(), coo.col[mask].tolist())), directed=False)
g.es["weight"] = coo.data[mask].tolist()

for res in (30.0, 100.0):
    part = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                             resolution_parameter=res, seed=42)
    lab = np.array(part.membership)
    sizes = np.bincount(lab)
    righe = []
    for c in range(len(sizes)):
        mem = np.where(lab == c)[0]
        if len(mem) < 5:
            continue
        # lift per tipo
        lifts = {}
        for k, A in TIPI.items():
            sA = A[mem][:, mem].tocoo()
            msk = sA.row < sA.col
            dentro = int(msk.sum())
            atteso = A.nnz * (len(mem) / n) ** 2 / 2
            lifts[k] = dentro / max(1e-9, atteso)
        n_tipi = sum(1 for v in lifts.values() if v > 1.0)
        temi = Counter(tema_arg[i] for i in mem)
        gen = Counter(GEN.get(keys[i], "?") for i in mem)
        lin = Counter(LANG.get(keys[i], "?") for i in mem)
        righe.append(dict(
            c=c, size=len(mem), n_tipi=n_tipi, lifts=lifts,
            tema=TEMA[temi.most_common(1)[0][0]], tema_q=temi.most_common(1)[0][1] / len(mem),
            gen=gen.most_common(1)[0][0], gen_q=gen.most_common(1)[0][1] / len(mem),
            lingua=lin.most_common(1)[0][0], lingua_q=lin.most_common(1)[0][1] / len(mem),
            cross=1.0 - abs(float(is_tv[mem].mean()) - 0.5) * 2, mem=mem))
    # punteggio: prima le fonti concordanti, poi la purezza umana
    for r in righe:
        r["score"] = r["n_tipi"] + 0.7 * r["tema_q"] + 0.5 * r["gen_q"] + 0.3 * r["cross"]
    righe.sort(key=lambda r: -r["score"])

    print("")
    print(f"########## RISOLUZIONE {res:.0f} — {len(sizes):,} cluster ({len(righe)} con >=5 titoli) ##########")
    dist = Counter(r["n_tipi"] for r in righe)
    print("  distribuzione per numero di tipi concordanti:")
    for k in (4, 3, 2, 1, 0):
        q = dist.get(k, 0)
        print(f"    {k} tipi su 4: {q:>5} cluster ({100*q/len(righe):>5.1f}%)")
    print(f"  purezza tema media {100*np.mean([r['tema_q'] for r in righe]):.0f}% · "
          f"genere media {100*np.mean([r['gen_q'] for r in righe]):.0f}% · "
          f"lingua dominante media {100*np.mean([r['lingua_q'] for r in righe]):.0f}%")
    # bias della grafia: quanto pesa la lingua
    lingue = Counter(r["lingua"] for r in righe)
    print(f"  lingue dominanti piu' frequenti: {', '.join(f'{l}({v})' for l, v in lingue.most_common(5))}")

    print(f"\n  --- I 5 MIGLIORI ---")
    for r in righe[:5]:
        print(f"\n  [{r['score']:.2f}] cluster {r['c']} · {r['size']} titoli "
              f"({int(is_tv[r['mem']].sum())} serie / {int((~is_tv[r['mem']]).sum())} film) · "
              f"{r['n_tipi']}/4 tipi")
        print(f"        tema {r['tema']} ({100*r['tema_q']:.0f}%) · genere {r['gen']} ({100*r['gen_q']:.0f}%) · "
              f"lingua {r['lingua']} ({100*r['lingua_q']:.0f}%)")
        print(f"        lift: " + " ".join(f"{k}:{v:.1f}" for k, v in r["lifts"].items()))
        print(f"        {', '.join(nome(keys[i]) for i in r['mem'][:8])}")
    print(f"\n  --- I 5 PEGGIORI ---")
    for r in righe[-5:]:
        print(f"\n  [{r['score']:.2f}] cluster {r['c']} · {r['size']} titoli · {r['n_tipi']}/4 tipi")
        print(f"        tema {r['tema']} ({100*r['tema_q']:.0f}%) · genere {r['gen']} ({100*r['gen_q']:.0f}%) · "
              f"lingua {r['lingua']} ({100*r['lingua_q']:.0f}%)")
        print(f"        lift: " + " ".join(f"{k}:{v:.1f}" for k, v in r["lifts"].items()))
        print(f"        {', '.join(nome(keys[i]) for i in r['mem'][:8])}")
    # quante bolle "pulite" restano applicando un filtro
    for soglia in (0.6, 0.7, 0.8):
        ok = [r for r in righe if r["n_tipi"] >= 2 and r["tema_q"] >= soglia]
        cop = sum(r["size"] for r in ok) / n
        print(f"\n  filtro: n_tipi>=2 e tema>={soglia:.0%} -> {len(ok)} cluster "
              f"({100*len(ok)/len(righe):.0f}%) che coprono il {100*cop:.0f}% dei titoli")
