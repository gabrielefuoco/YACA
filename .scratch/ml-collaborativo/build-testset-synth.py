"""
.scratch/ml-collaborativo/build-testset-synth.py

GLI ACCOUNT SINTETICI. Non ci sono utenti reali con cronologie lunghe (verificato: il DB ha 2
proprietari da 100 titoli, uno dei quali simulato). Quindi la verita' si costruisce da MovieLens:
un utente MovieLens diventa un account YACA con la sua cronologia.

Due scelte di disegno, dichiarate:

1. SPLIT TEMPORALE, non casuale. I titoli piu' VECCHI diventano la cronologia (cio' che il sistema
   vede), i piu' NUOVI la verita' (cio' che dovrebbe consigliare). E' come funziona un prodotto: si
   raccomanda il prossimo titolo, non un titolo a caso fra quelli gia' visti. MovieLens ha i
   timestamp: e' la prima volta che li usiamo.

2. PROFILO LUNGO. La cronologia e' di decine di titoli (non 3): e' la condizione perche' il matcher
   collaborativo e il profilo di produzione abbiano il segnale che hanno in produzione vera.

Stratificazione per popolarita' (meta' dal fondo della distribuzione, meta' dal resto), come nel
test set congelato: senza, si misura solo il gusto mainstream.

LIMITE DICHIARATO: MovieLens e' solo film. Gli account sintetici NON coprono le serie (l'80% dell'uso
reale): per quelle resta solo l'account da 100 titoli, che e' debole.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/build-testset-synth.py
"""
import json
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / ".cache" / "movielens" / "ml-32m"
PQ = ROOT / ".cache" / "tmdb"
CACHE = ROOT / ".cache" / "movielens"
OUT = CACHE / "testset-synth.json"
SEED = 20261008
N_ACCOUNTS = 300
MIN_ITEMS = 60            # titoli piaciuti nel catalogo E nel grafo
PROFILE_FRAC = 0.6        # i piu' vecchi 60% = cronologia
MAX_PROFILE = 120         # tetto alla cronologia (oltre non aggiunge)

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)

fg = np.load(CACHE / "film-graph-idf05.npz", allow_pickle=True)
graph_keys = {f"{str(t)}:{int(i)}" for t, i in zip(fg["types"], fg["ids"])}
log(f"nodi nel grafo: {len(graph_keys):,}")

links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
mid_to_tmdb = {int(m): int(t) for t, m in zip(links["tmdbId"], links["movieId"])}
pop = pd.read_parquet(PQ / "movies.parquet", columns=["id", "vote_count"])
popmap = {int(i): float(v or 0) for i, v in zip(pop["id"], pop["vote_count"])}

ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId", "rating", "timestamp"],
                      dtype={"userId": "int32", "movieId": "int32", "rating": "float32", "timestamp": "int64"})
ratings = ratings[ratings["rating"] >= 4.0]
ratings["tmdb"] = ratings["movieId"].map(mid_to_tmdb)
ratings = ratings.dropna(subset=["tmdb"])
ratings["key"] = "movie:" + ratings["tmdb"].astype("int64").astype(str)
ratings = ratings[ratings["key"].isin(graph_keys)]
log(f"voti alti nel catalogo e nel grafo: {len(ratings):,} da {ratings['userId'].nunique():,} utenti")

grp = ratings.groupby("userId")
sizes = grp.size()
eligible = sizes[sizes >= MIN_ITEMS].index
log(f"utenti con >= {MIN_ITEMS} titoli piaciuti: {len(eligible):,}")

# popolarita' mediana per utente (per la stratificazione)
med_pop = {}
for uid in eligible:
    ks = grp.get_group(uid)["tmdb"].astype("int64").to_numpy()
    med_pop[int(uid)] = float(np.median([popmap.get(int(k), 0.0) for k in ks]))
ranked = sorted(med_pop, key=lambda u: med_pop[u])
half = N_ACCOUNTS // 2
low = ranked[: max(half, len(ranked) // 4)][:half]
rest = ranked[max(half, len(ranked) // 4):]
high = [int(x) for x in rng.choice(np.array(rest), size=min(half, len(rest)), replace=False)]
chosen = sorted(set(low) | set(high))
stratum = {u: ("fondo" if u in set(low) else "resto") for u in chosen}
log(f"account: {len(chosen):,} · fondo {len(low)} (popolarita' mediana {int(np.median([med_pop[u] for u in low]))}) · "
    f"resto {len(high)} ({int(np.median([med_pop[u] for u in high]))})")

trials, meta = [], []
for uid in chosen:
    d = grp.get_group(uid).sort_values("timestamp")
    items = list(dict.fromkeys(d["key"].tolist()))          # ordine temporale, senza duplicati
    if len(items) < MIN_ITEMS:
        continue
    cut = int(PROFILE_FRAC * len(items))
    prof = items[:cut][-MAX_PROFILE:]
    gold = items[cut:]
    if len(gold) < 10:
        continue
    trials.append({"user": int(uid), "ctx": f"ml{uid}", "strato": stratum[int(uid)],
                   "seeds": prof, "gold": gold})
    gp = np.array([popmap.get(int(k.split(":")[1]), 0.0) for k in items])
    meta.append({"user": int(uid), "strato": stratum[int(uid)], "n_items": len(items),
                 "pop_mediana": float(np.median(gp))})

log(f"\n=== ACCOUNT SINTETICI (congelati) ===")
log(f"  account          : {len(trials):,}")
log(f"  cronologia       : mediana {int(np.median([len(t['seeds']) for t in trials]))} titoli "
    f"(min {min(len(t['seeds']) for t in trials)}, max {max(len(t['seeds']) for t in trials)})")
log(f"  verita'          : mediana {int(np.median([len(t['gold']) for t in trials]))} titoli")
for st in ("fondo", "resto"):
    sub = [t for t in trials if t["strato"] == st]
    if sub:
        log(f"  {st:<6}: {len(sub)} account · cronologia mediana {int(np.median([len(t['seeds']) for t in sub]))} · "
            f"verita' mediana {int(np.median([len(t['gold']) for t in sub]))}")
OUT.write_text(json.dumps({"version": "1.0", "created": "2026-10-08", "seed": SEED,
                           "protocol": {"split": "temporale", "profile_frac": PROFILE_FRAC,
                                        "min_items": MIN_ITEMS, "max_profile": MAX_PROFILE,
                                        "positive": "rating >= 4.0", "note": "MovieLens: solo film"},
                           "accounts": meta, "trials": trials}, indent=0))
log(f"\nscritto {OUT.name} ({(OUT).stat().st_size/1e6:.1f} MB)")
