"""
.scratch/ml-collaborativo/measure-cluster-retrieval.py

COSA STIAMO PARLANDO: il grafo dei film serve come SORGENTE DI CANDIDATI.
Il test non e' il ranking (li' il DNA+gerarchia resta migliore), e' il TETTO DI RICHIAMO
del candidato:

  prendo k titoli visti  →  i loro cluster  →  quanti degli ALTRI titoli visti
  cadono in quei cluster?

Se il tetto e' alto, il grafo e' una buona sorgente di candidati (e il ranking viene dopo).
Se e' basso, non lo e'.

Confronti onesti, sugli stessi semi e sugli stessi titoli nascosti:
  - caso       : Σ(dimensione dei cluster dei semi) / N
  - generi     : titoli che condividono >=1 genere con i semi (quello che il pool usa oggi)
  - keyword    : titoli che condividono >=1 keyword con i semi
  - CLUSTER    : unione dei cluster dei semi  ← la proposta
  - cluster+gen: unione dei cluster dei semi, ristretta a chi condivide un genere

E in piu': TRASFERIMENTO FILM→SERIE — quante delle serie viste cadono nei cluster dei film visti.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/measure-cluster-retrieval.py
"""
import json
import pathlib
from collections import Counter

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
GRAPH = ROOT / ".cache" / "movielens" / "film-graph.npz"
HIST = ROOT / ".cache" / "movielens" / "histories.json"
K_SEEDS, DRAWS = 3, 40
SEED = 20261008

rng = np.random.default_rng(SEED)
def log(m): print(m, flush=True)

log("carico il grafo e i cataloghi...")
g = np.load(GRAPH, allow_pickle=True)
member = g["member"]; ids = g["ids"]; types = g["types"]
log(f"  grafo: {len(member):,} nodi · {len(set(member.tolist()))} cluster")

movies = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "keywords", "genres"])
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "keywords", "genres"])
movies["type"] = "movie"; tv["type"] = "tv"; tv["title"] = tv["name"]
cat = pd.concat([movies[["id", "title", "type", "keywords", "genres"]], tv[["id", "title", "type", "keywords", "genres"]]])
cat["kw"] = cat["keywords"].map(lambda s: frozenset(int(k["id"]) for k in json.loads(s) if isinstance(k, dict) and k.get("id")))
cat["gen"] = cat["genres"].map(lambda s: frozenset(int(x["id"]) for x in json.loads(s)) if s else frozenset())
meta = {(r.type, int(r.id)): (r.kw, r.gen) for r in cat.itertuples()}
title = {(r.type, int(r.id)): r.title for r in cat.itertuples()}
row_of = {(str(t), int(i)): k for k, (t, i) in enumerate(zip(types, ids))}
log(f"  catalogo: {len(meta):,} titoli con metadati · di cui nel grafo {len(row_of):,}")

cluster_members = {}
for node, cl in enumerate(member):
    cluster_members.setdefault(int(cl), []).append(node)
sizes = {cl: len(v) for cl, v in cluster_members.items()}
log(f"  dimensione cluster: mediana {int(np.median(list(sizes.values())))} · min {min(sizes.values())} · max {max(sizes.values())}")

hist = json.loads(HIST.read_text())
profiles = []
for ctx, by in hist.items():
    watched = [("movie", int(x)) for x in by.get("movie", [])] + [("tv", int(x)) for x in by.get("tv", [])]
    inside = [w for w in watched if (w[0], w[1]) in row_of and (w[0], w[1]) in meta]
    profiles.append((ctx, watched, inside))
    log(f"  {ctx}: {len(watched)} visti · {len(inside)} nel grafo ({sum(1 for w in inside if w[0]=='movie')} film, {sum(1 for w in inside if w[0]=='tv')} serie)")

N = len(member)
log("\n================ TETTO DI RICHIAMO DELLE SORGENTI DI CANDIDATI ================\n")
log(f"| fonte | titoli visti recuperabili (tutti) | solo che erano nel grafo |")
log(f"|---|---|---|")

results = []
for ctx, watched, inside in profiles:
    if len(inside) < K_SEEDS + 3:
        log(f"  {ctx}: troppo pochi titoli nel grafo, salto")
        continue
    for draw in range(DRAWS):
        perm = rng.permutation(len(inside))
        seeds = [inside[i] for i in perm[:K_SEEDS]]
        gold_in = [inside[i] for i in perm[K_SEEDS:]]
        seed_rows = [row_of[s] for s in seeds]
        cluster_union = set()
        for r in seed_rows:
            cluster_union.update(cluster_members[int(member[r])])
        seed_gen = set().union(*[meta[s][1] for s in seeds])
        seed_kw = set().union(*[meta[s][0] for s in seeds])

        def covered(pred):
            hit_in = [g_ for g_ in gold_in if pred(g_)]
            hit_all = [g_ for g_ in watched if g_ != tuple(seeds[0]) and pred(g_)]
            return len(hit_in), len(hit_all)

        def set_of(pred):
            """Insieme dei candidati (per contare gli slot) sugli stessi titoli."""
            return [t for t in meta.keys() if t not in seeds and pred(t)]

        sources = {
            "caso": lambda t: row_of.get(t) in cluster_union,
            "generi (pool di oggi)": lambda t: bool(meta.get(t, (set(), set()))[1] & seed_gen),
            "keyword": lambda t: bool(meta.get(t, (set(), set()))[0] & seed_kw),
            "CLUSTER": lambda t: row_of.get(t) in cluster_union,
            "cluster + generi": lambda t: row_of.get(t) in cluster_union and bool(meta.get(t, (set(), set()))[1] & seed_gen),
        }
        for name, pred in sources.items():
            if name == "caso":
                expected = sum(sizes[int(member[r])] for r in seed_rows) / max(1, N)
                results.append({"ctx": ctx, "source": name, "ceiling_obs": expected, "ceiling": expected,
                                "slots": sum(sizes[int(member[r])] for r in seed_rows), "n_gold": len(gold_in), "n_all": len(watched)})
                continue
            hit_in, hit_all = covered(pred)
            cand = set_of(pred)
            results.append({"ctx": ctx, "source": name,
                            "ceiling_obs": hit_in / max(1, len(gold_in)) if name != "CLUSTER" else len([g_ for g_ in gold_in if row_of.get(g_) in cluster_union]) / max(1, len(gold_in)),
                            "ceiling": hit_all / max(1, len(watched)),
                            "slots": len(cand),
                            "n_gold": len(gold_in), "n_all": len(watched)})

df = pd.DataFrame(results)
log("| fonte | tetto sui visti NEL GRAFO | tetto su TUTTA la cronologia | slot di candidati | **tetto per 1.000 slot** |")
log("|---|---|---|---|---|")
for name in ["caso", "generi (pool di oggi)", "keyword", "CLUSTER", "cluster + generi"]:
    sub = df[df["source"] == name]
    if len(sub) == 0:
        continue
    # tetto normalizzato a 1.000 slot: quanti titoli giusti entrano in 1.000 candidati
    per1000 = 1000 * (sub["ceiling_obs"] / sub["slots"].clip(lower=1))
    log(f"| {name} | {100*sub['ceiling_obs'].mean():.1f}% | {100*sub['ceiling'].mean():.1f}% | {int(sub['slots'].mean()):,} | **{1000*per1000.mean()/1000:.1f}% ({per1000.mean()*100:.0f} per mille)** |")
log("\n(tetto per 1.000 slot = quota di titoli giusti che entrano nei primi 1.000 candidati: misura la QUALITA' per posto,")
log(" non la dimensione dell'insieme. E' il confronto giusto per uno stadio di retrieval con budget fisso.)")

# --- trasferimento film → serie dentro il grafo ---
log("\n================ TRASFERIMENTO FILM → SERIE (nel grafo denso) ================\n")
for ctx, watched, inside in profiles:
    films = [w for w in inside if w[0] == "movie"]
    series = [w for w in inside if w[0] == "tv"]
    if not films or not series:
        log(f"  {ctx}: niente da confrontare")
        continue
    film_clusters = Counter(int(member[row_of[f]]) for f in films)
    in_same = sum(1 for s in series if int(member[row_of[s]]) in film_clusters)
    top3 = [c for c, _ in film_clusters.most_common(3)]
    in_top3 = sum(1 for s in series if int(member[row_of[s]]) in top3)
    share_cluster = sum(sizes[c] for c in top3) / N
    log(f"  {ctx}: {len(series)} serie viste · nei cluster dei film {in_same} ({100*in_same/len(series):.0f}%)"
        f" · nei 3 cluster più frequenti dei film {in_top3} ({100*in_top3/len(series):.0f}%)"
        f" · quei 3 cluster coprono il {100*share_cluster:.1f}% del catalogo → caso {100*share_cluster:.1f}%")
