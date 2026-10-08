"""
.scratch/ml-collaborativo/posizioni-e-serie.py

Due cose in un giro, piu' l'export che serve al banco.

1. SERIE COME PROXY DI GENERALIZZAZIONE. Il teacher e' cieco sulle serie, quindi non c'e' verita' di
   riferimento. Ma si puo' misurare: (a) la COPERTURA (quante serie hanno vicini FILM col teacher) e
   (b) la STABILITA' della stima: si spezzano i vicini in due meta', si stima la posizione due volte e
   si misura quanto le due stime coincidono. E' l'analogo per le serie dello split-half che ho usato per
   i film: se la stima e' stabile, e' informativa anche senza ground truth.

2. EXPORT DELLE POSIZIONI per il banco Node (il ranker collaborativo): la posizione di ogni titolo =
   media pesata delle posizioni dei suoi vicini col teacher, normalizzata per grado, leave-one-out.
   Output: .cache/movielens/positions.json (arrotondato a 4 decimali).

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/posizioni-e-serie.py
"""
import json
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
CACHE = ROOT / ".cache" / "movielens"
SEED = 20261008

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)

z = np.load(CACHE / "teacher-Z-heldout.npz"); Z, mids = z["Z"], z["mids"]
row_of = {int(m): i for i, m in enumerate(mids)}
links = pd.read_csv(CACHE / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
mid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
fg = np.load(CACHE / "film-graph-heldout.npz", allow_pickle=True)
member, ids, types, edges = fg["member"], fg["ids"], fg["types"], fg["edges"]
key_of = {k: f"{str(t)}:{int(i)}" for k, (t, i) in enumerate(zip(types, ids))}
NEIGH = [[] for _ in range(len(member))]
for a, b in edges:
    NEIGH[int(a)].append(int(b)); NEIGH[int(b)].append(int(a))
log(f"grafo dei film: {len(member):,} nodi · grado mediano {int(np.median([len(x) for x in NEIGH]))}")

# posizione collaborativa per nodo: media pesata dei vicini che hanno il teacher (LOO, normalizzata per grado)
POS = np.zeros((len(member), Z.shape[1]), dtype=np.float32)
has_pos = np.zeros(len(member), dtype=bool)
for nd in range(len(member)):
    vs, ws = [], []
    for nb in NEIGH[nd]:
        t, i = str(types[nb]), int(ids[nb])
        if t != "movie":
            continue
        m = mid_by_tmdb.get(i)
        r = row_of.get(m) if m is not None else None
        if r is None:
            continue
        vs.append(Z[r]); ws.append(1.0 / max(1.0, len(NEIGH[nb]) ** 0.5))
    if vs:
        v = np.average(np.array(vs), axis=0, weights=np.array(ws))
        POS[nd] = v / (np.linalg.norm(v) + 1e-9); has_pos[nd] = True
log(f"posizioni stimate: {int(has_pos.sum()):,} nodi ({100*has_pos.mean():.0f}%)")

# ---------------------------------------------------------------- 1. le serie
is_tv = np.array([str(t) == "tv" for t in types])
n_tv_nb = np.array([sum(1 for nb in NEIGH[nd] if str(types[nb]) == "movie") for nd in range(len(member))])
tv = np.where(is_tv)[0]
log(f"\n=== LE SERIE ({len(tv):,}) ===")
log(f"  con almeno un vicino FILM: {int((n_tv_nb[tv] > 0).sum()):,} ({100*(n_tv_nb[tv]>0).mean():.0f}%)")
log(f"  con una posizione stimata (vicino film col teacher): {int(has_pos[tv].sum()):,} ({100*has_pos[tv].mean():.0f}%)")
log(f"  vicini film per serie: mediana {int(np.median(n_tv_nb[tv]))} · p90 {int(np.percentile(n_tv_nb[tv], 90))}")
film = np.where(~is_tv)[0]
log(f"  (confronto, film: {100*has_pos[film].mean():.0f}% con posizione · mediana vicini film {int(np.median(n_tv_nb[film]))})")

# stabilita' della stima: si spezzano i vicini in due meta' e si stima due volte
def split_half_pos(nd):
    v1, w1, v2, w2 = [], [], [], []
    for j, nb in enumerate(NEIGH[nd]):
        t, i = str(types[nb]), int(ids[nb])
        if t != "movie":
            continue
        m = mid_by_tmdb.get(i)
        r = row_of.get(m) if m is not None else None
        if r is None:
            continue
        (v1 if j % 2 == 0 else v2).append(Z[r]); (w1 if j % 2 == 0 else w2).append(1.0 / max(1.0, len(NEIGH[nb]) ** 0.5))
    out = []
    for vs, ws in ((v1, w1), (v2, w2)):
        if len(vs) >= 2:
            v = np.average(np.array(vs), axis=0, weights=np.array(ws))
            out.append(v / (np.linalg.norm(v) + 1e-9))
    return out

for lbl, group in (("serie", tv), ("film", film)):
    samp = rng.choice(group, size=min(1500, len(group)), replace=False)
    cs = []
    for nd in samp:
        p = split_half_pos(int(nd))
        if len(p) == 2:
            cs.append(float(p[0] @ p[1]))
    if cs:
        log(f"  stabilita' della stima (vicini spezzati a meta') — {lbl}: {np.mean(cs):.3f} ({len(cs):,} campioni)")

# ---------------------------------------------------------------- 2. export per il banco
out = {key_of[nd]: [round(float(x), 4) for x in POS[nd]] for nd in range(len(member)) if has_pos[nd]}
(CACHE / "positions.json").write_text(json.dumps(out))
log(f"\nescritto positions.json: {len(out):,} titoli ({(CACHE/'positions.json').stat().st_size/1e6:.1f} MB)")
