"""
.scratch/ml-collaborativo/audit-tmdb-recs.py

LE RACCOMANDAZIONI TMDB PREDICONO LA CO-VISIONE REALE?

Perche' questa misura decide se usarle. Il teacher MovieLens copre le serie allo 0% e le serie sono
l'80% delle cronologie reali (ticket 12): le raccomandazioni TMDB sono l'unico segnale comportamentale
disponibile li'. Ma sono un output algoritmico proprietario, opaco e probabilmente popolarita'-biased:
si GUADAGNANO il diritto di essere usate sulle serie solo se, sui film (dove il teacher c'e'),
predicono la co-visione.

Protocollo, coi controlli che la giornata ha insegnato:
  1. per ogni film: i suoi 10 "simili" TMDB, coseno medio coi loro vettori collaborativi;
  2. CONTROLLO APPAIATO PER POPOLARITA': per ogni raccomandato, un film a caso della STESSA fascia di
     voti TMDB (senza appaiare si misurerebbe la popolarita', non il segnale);
  3. RIFERIMENTO ALTO: i 10 vicini collaborativi veri (il massimo chiedibile);
  4. precision@10 contro i top-100 collaborativi, contro il tasso del caso.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/audit-tmdb-recs.py
"""
import json
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
CACHE = ROOT / ".cache" / "movielens"
SEED = 20261008
N_FILMS = 5000
TOP_REFS = 100
BANDS = 10

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)

def auc(x, y):
    x = np.sort(x)
    lt = np.searchsorted(x, y, side="left").sum(); le = np.searchsorted(x, y, side="right").sum()
    return float((len(x) * len(y) - le + 0.5 * (le - lt)) / (len(x) * len(y)))

# ---------------------------------------------------------------- teacher e mappe
z = np.load(CACHE / "teacher-Z-heldout.npz"); Z, mids = z["Z"], z["mids"]
row_of = {int(m): i for i, m in enumerate(mids)}
links = pd.read_csv(CACHE / "ml-32m" / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
mid_by_tmdb = {int(t): int(m) for t, m in zip(links["tmdbId"], links["movieId"])}
log(f"teacher: {Z.shape[0]:,} film")

mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "recommendations", "vote_count"])
votes_by_tmdb = {int(i): float(v or 0) for i, v in zip(mv["id"], mv["vote_count"])}
recs_by_tmdb = {int(i): r for i, r in zip(mv["id"], mv["recommendations"]) if isinstance(r, str)}
log(f"film nel catalogo con raccomandazioni: {len(recs_by_tmdb):,}")

# fascia di popolarita' di ogni film COL TEACHER (per l'appaiamento)
v_teacher = np.array([votes_by_tmdb.get(int(m) if False else 0, 0.0) for m in mids])   # placeholder
# i voti sono per tmdbId: si ricostruisce la mappa movieId -> tmdbId
tmdb_by_mid = {v: k for k, v in mid_by_tmdb.items()}
v_teacher = np.array([votes_by_tmdb.get(int(tmdb_by_mid.get(int(m), -1)), 0.0) for m in mids])
edges = np.quantile(v_teacher, np.linspace(0, 1, BANDS + 1))[1:-1]
band_of = np.searchsorted(edges, v_teacher, side="right")
pools = {b: np.where(band_of == b)[0] for b in range(BANDS)}
log(f"fasce di popolarita': {[len(pools[b]) for b in range(BANDS)]}")

# ---------------------------------------------------------------- i film da analizzare
cands = [int(i) for i in mv["id"] if int(i) in mid_by_tmdb and mid_by_tmdb[int(i)] in row_of and int(i) in recs_by_tmdb]
sample = rng.choice(np.array(cands), size=min(N_FILMS, len(cands)), replace=False)
log(f"film analizzati: {len(sample):,}")

cos_recs, cos_rand, cos_ref, prec, prec_chance, pop_src, pop_recs = [], [], [], [], [], [], []
for tid in sample:
    src = row_of[mid_by_tmdb[int(tid)]]
    rec_ids = [int(x) for x in json.loads(recs_by_tmdb[int(tid)])]
    rows, rv = [], []
    for r in rec_ids:
        m = mid_by_tmdb.get(r)
        if m is not None and m in row_of:
            rows.append(row_of[m]); rv.append(votes_by_tmdb.get(r, 0.0))
    if not rows:
        continue
    v = Z[src]
    cos_recs.append(float(np.mean(Z[rows] @ v)))
    ctrl = []
    for r, rv_ in zip(rows, rv):
        pool = pools.get(int(np.searchsorted(edges, rv_, side="right")))
        if pool is None or len(pool) == 0:
            continue
        for _ in range(5):
            j = int(rng.choice(pool))
            if j != src:
                ctrl.append(float(Z[j] @ v)); break
    if ctrl:
        cos_rand.append(float(np.mean(ctrl)))
    sims = Z @ v
    order = [int(i) for i in np.argsort(-sims) if int(i) != src]
    cos_ref.append(float(np.mean(sims[order[:10]])))
    ref100 = set(order[:TOP_REFS])
    prec.append(len(set(rows) & ref100) / len(rows))
    prec_chance.append(len(ref100) / len(mids))
    pop_src.append(votes_by_tmdb.get(int(tid), 0.0)); pop_recs.append(float(np.median(rv)) if rv else 0.0)

cos_recs = np.array(cos_recs); cos_rand = np.array(cos_rand); cos_ref = np.array(cos_ref)
log(f"\n=== LE RACCOMANDAZIONI TMDB DAVANTI ALLA CO-VISIONE REALE ({len(cos_recs):,} film) ===")
log(f"  coseno collaborativo — raccomandazioni TMDB : {cos_recs.mean():+.3f}   (mediana {np.median(cos_recs):+.3f})")
log(f"  coseno collaborativo — controllo appaiato   : {cos_rand.mean():+.3f}   (mediana {np.median(cos_rand):+.3f})")
log(f"  coseno collaborativo — vicini collaborativi : {cos_ref.mean():+.3f}   <- il massimo chiedibile")
log(f"  ** AUC = P(raccomandazione batte controllo appaiato) = {auc(cos_recs, cos_rand):.3f} **  (0,500 = inutile)")
log(f"\n  precision@10 contro i top-100 collaborativi : {100*np.mean(prec):.1f}%   (caso: {100*np.mean(prec_chance):.2f}%)")
log(f"  -> le raccomandazioni TMDB azzeccano {np.mean(prec)/np.mean(prec_chance):.0f} volte il caso")
log(f"\n  popolarita': sorgente mediana {np.median(pop_src):,.0f} voti · raccomandati {np.median(pop_recs):,.0f} voti (controllo appaiato)")
