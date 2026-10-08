"""
.scratch/ml-collaborativo/build-testset.py

IL TEST SET CONGELATO. Da qui in avanti ogni miglioria o regressione si misura QUI, sulle stesse
persone e sugli stessi trial, scritti una volta su disco.

Perche' il banco attuale non bastava:
  - poggia su UN utente reale (REOZrGNRr3) e 5 contesti, ricampionati 15 volte: 75 angolazioni della
    stessa persona. Ogni decisione presa su quel banco e' una decisione presa su di lui.
  - il teacher e' costruito con TUTTI i 200.948 utenti MovieLens: usare un utente MovieLens per
    valutare significa valutare su qualcuno che il teacher ha GIA' visto (leakage).

Regola del disegno (dichiarata prima):
  1. gli utenti di valutazione sono DISGIUNTI dagli utenti che costruiranno il teacher;
  2. il test set si scrive UNA VOLTA, con un seme fisso, e non si ricampiona mai piu';
  3. ogni trial: K semi presi dalla cronologia = il profilo che il sistema vede, il RESTO = la verita';
  4. si annota la popolarita' media della verita' di ogni utente (serve per il banco appaiato, ticket 10).

ATTENZIONE: finche' il teacher non e' ricostruito SENZA questi utenti, questo test set NON e'
utilizzabile (il leakage c'e' tutto). L'ordine e': costruire il set -> ricostruire teacher e grafo
senza gli utenti di valutazione -> solo allora misurare.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/build-testset.py
"""
import json
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / ".cache" / "movielens" / "ml-32m"
PQ = ROOT / ".cache" / "tmdb"
OUT = ROOT / ".cache" / "movielens" / "testset.json"
ADJ_OUT = ROOT / ".cache" / "movielens" / "testset-users.json"      # la lista da ESCLUDERE dal teacher

SEED = 20261008
N_USERS = 200          # utenti di valutazione
DRAWS = 2              # trial per utente (semi diversi, stessa persona)
K_SEEDS = 3            # quanti titoli la "cronologia" mostra al sistema
MIN_RATINGS = 25       # voti utili minimi (profilo + verita' con margine)
MIN_GOLD = 15          # verita' minima perche' il recall sia una misura stabile

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)

# ---------------------------------------------------------------- 1. gli item che il sistema conosce
links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
mid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "keywords"])
mv = mv[mv["keywords"].map(lambda s: isinstance(s, str) and len(json.loads(s)) > 0)]
our_movies = {int(x) for x in mv["id"]}
log(f"film nel catalogo con keyword: {len(our_movies):,}")

# gli item che il GRAFO conosce (quelli per cui esiste una riga in film-graph.npz)
g = np.load(ROOT / ".cache" / "movielens" / "film-graph.npz", allow_pickle=True)
graph_keys = {f"{str(t)}:{int(i)}" for t, i in zip(g["types"], g["ids"])}     # stringhe 'movie:123', non tuple:
log(f"nodi nel grafo dei film: {len(graph_keys):,}")                                 # la chiave di `key` e' la stessa forma

# ---------------------------------------------------------------- 2. i voti, ristretti al nostro catalogo
ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId", "rating"], dtype={"userId": "int32", "movieId": "int32", "rating": "float32"})
mid_to_tmdb = {int(m): int(t) for t, m in mid_by_tmdb.items()}
ratings["tmdb"] = ratings["movieId"].map(mid_to_tmdb)
r = ratings.dropna(subset=["tmdb"])
r = r[r["tmdb"].astype("int64").isin(our_movies)]
r["key"] = "movie:" + r["tmdb"].astype("int64").astype(str)
r["key"] = r["key"].astype(str)
r = r[r["key"].isin(graph_keys)]          # solo cio' che il grafo conosce
log(f"voti sul nostro catalogo (e nel grafo): {len(r):,} da {r['userId'].nunique():,} utenti")

# positive = voto alto. La verita' e' "cosa gli e' piaciuto", non "cosa ha visto".
pos = r[r["rating"] >= 4.0]
by_user = pos.groupby("userId")["key"].apply(list)
by_user = by_user[by_user.map(len) >= MIN_RATINGS]
log(f"utenti con >= {MIN_RATINGS} titoli piaciuti nel catalogo: {len(by_user):,}")

# popolarita' (voti TMDB) per la stratificazione e per il banco appaiato
pop = pd.read_parquet(PQ / "movies.parquet", columns=["id", "vote_count"])
popmap = {f"movie:{int(i)}": float(v or 0) for i, v in zip(pop["id"], pop["vote_count"])}

# ---------------------------------------------------------------- 3. stratificazione: il meno mainstream possibile
# MovieLens e' un dataset di film POPOLARI: campionando a caso si ottengono utenti con popolarita'
# mediana ~5.700 voti TMDB, cioe' mainstream. Un test set cosi' misurerebbe soltanto il gusto
# mainstream. Qui si prende la meta' dal fondo della distribuzione e la meta' dal resto, e si dichiara
# la popolarita' reale di ogni strato: se MovieLens non sa dare nicchia, va detto, non nascosto.
stats = {}
for uid in np.array(sorted(by_user.index.tolist())):
    items = sorted(set(by_user[int(uid)]))
    if len(items) < K_SEEDS + MIN_GOLD:
        continue
    gp = np.array([popmap.get(k, 0.0) for k in items])
    stats[int(uid)] = (len(items), float(np.median(gp)), float(np.mean(gp)), float((gp >= 1000).mean()))
ranked = sorted(stats, key=lambda u: stats[u][1])          # per popolarita' mediana crescente
half = N_USERS // 2
niche = ranked[:half]
rest = ranked[half:]
mainstream = list(rng.choice(np.array(rest), size=min(half, len(rest)), replace=False))
taken = np.array(sorted(niche + [int(x) for x in mainstream]))
stratum = {int(u): ("fondo" if u in set(niche) else "resto") for u in taken}
log(f"utenti disponibili: {len(stats):,} · di valutazione: {len(taken):,}")
log(f"  strato 'fondo' della distribuzione ({len(niche)}): popolarita' mediana {int(np.median([stats[u][1] for u in niche]))} voti")
log(f"  strato 'resto' ({len(mainstream)}): popolarita' mediana {int(np.median([stats[u][1] for u in mainstream]))} voti")
log(f"  (minimo assoluto fra gli utenti disponibili: {int(min(s[1] for s in stats.values()))} voti mediani)")

trials, users_meta = [], []
for uid in taken:
    items = sorted(set(by_user[int(uid)]))
    if len(items) < K_SEEDS + MIN_GOLD:
        continue
    for d in range(DRAWS):
        perm = rng.permutation(len(items))
        seeds = [items[i] for i in perm[:K_SEEDS]]
        gold = [items[i] for i in perm[K_SEEDS:]]
        trials.append({"user": int(uid), "ctx": f"ml{int(uid)}_{d}", "seeds": seeds, "gold": gold})
    gp = np.array([popmap.get(k, 0.0) for k in items])
    users_meta.append({"user": int(uid), "strato": stratum[int(uid)], "n_items": len(items),
                       "pop_mediana": float(np.median(gp)), "pop_media": float(np.mean(gp)),
                       "quota_popolari": float((gp >= 1000).mean())})
log(f"trial costruiti: {len(trials):,} da {len(users_meta):,} utenti")

meta_pop = np.array([u["pop_mediana"] for u in users_meta])
log(f"\n=== IL TEST SET (congelato) ===")
log(f"  utenti                 : {len(users_meta):,}")
log(f"  trial (utente x {DRAWS})   : {len(trials):,}")
log(f"  titoli piaciuti/utente : mediana {int(np.median([u['n_items'] for u in users_meta]))} "
    f"(min {min(u['n_items'] for u in users_meta)}, max {max(u['n_items'] for u in users_meta)})")
log(f"  verita' per trial      : mediana {int(np.median([len(t['gold']) for t in trials]))}")
log(f"  popolarita' mediana    : {int(np.median(meta_pop))} voti TMDB")
log(f"  stratificazione        : {int((meta_pop < 100).sum())} utenti di nicchia (<100 voti mediani) · "
    f"{int((meta_pop >= 500).sum())} mainstream (>=500)")

out = {
    "version": "1.0",
    "created": "2026-10-08",
    "seed": SEED,
    "protocol": {"K_SEEDS": K_SEEDS, "DRAWS": DRAWS, "MIN_RATINGS": MIN_RATINGS, "MIN_GOLD": MIN_GOLD,
                 "positive": "rating >= 4.0", "catalogue": "film con keyword, presenti nel grafo dei film"},
    "users": users_meta,
    "trials": trials,
}
OUT.write_text(json.dumps(out), encoding="utf-8")
ADJ_OUT.write_text(json.dumps({"eval_users": [int(u) for u in taken]}), encoding="utf-8")
log(f"\nscritto {OUT.name} ({OUT.stat().st_size/1e6:.1f} MB) e {ADJ_OUT.name}")
log("  -> gli utenti in testset-users.json vanno ESCLUSI dalla costruzione del teacher, altrimenti c'e' leakage.")
