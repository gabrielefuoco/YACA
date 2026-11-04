"""Analizza il JSON esportato da test-cieco.html; non mostra i metodi nel questionario."""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
KEY = json.loads((HERE / "chiave-valutazione.json").read_text(encoding="utf-8"))
ANS = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert ANS.get("experiment") == "yaca-spirito-v1", "file risposte non riconosciuto"
ratings = {x["id"]: x["rating"] for x in ANS["ratings"]}
assert set(ratings) <= set(KEY), "risposte con ID non presente nella chiave"


def ndcg(rows, rank_key, k=5):
    judged = [(v[rank_key], int(ratings[q])) for q, v in rows if q in ratings
              and ratings[q] in ("0", "1", "2") and v[rank_key] is not None]
    judged.sort()
    gains = [2 ** rel - 1 for _, rel in judged[:k]]
    dcg = sum(g / math.log2(i + 2) for i, g in enumerate(gains))
    ideal = sorted((2 ** rel - 1 for _, rel in judged), reverse=True)[:k]
    idcg = sum(g / math.log2(i + 2) for i, g in enumerate(ideal))
    return (dcg / idcg if idcg else 0.0), len(judged)

by_seed = defaultdict(list)
for qid, v in KEY.items():
    by_seed[v["seed_title"]].append((qid, v))

print(f"Risposte: {len(ratings)}/{len(KEY)} · giudicabili: "
      f"{sum(r in ('0','1','2') for r in ratings.values())} · non conosco: "
      f"{sum(r == 'x' for r in ratings.values())}")
print("\n| seed | nDCG@5 V18 | nDCG@5 +KWLAT | Δ | giudicati V18/+KWLAT |")
print("|---|---:|---:|---:|---:|")
rows_out = []
for seed, pairs in by_seed.items():
    a, na = ndcg(pairs, "v18_rank")
    b, nb = ndcg(pairs, "kwlat2_rank")
    rows_out.append((seed, a, b, na, nb))
    print(f"| {seed} | {a:.3f} | {b:.3f} | {b-a:+.3f} | {na}/{nb} |")
if rows_out:
    av = sum(x[1] for x in rows_out) / len(rows_out)
    bv = sum(x[2] for x in rows_out) / len(rows_out)
    wins = sum(x[2] > x[1] + 1e-9 for x in rows_out)
    losses = sum(x[2] < x[1] - 1e-9 for x in rows_out)
    print(f"\nMedia macro: V18 {av:.3f} · +KWLAT {bv:.3f} · Δ {bv-av:+.3f} "
          f"· seed: {wins} meglio / {losses} peggio / {len(rows_out)-wins-losses} pari")
print("\nNota: nDCG calcolato solo sui candidati giudicati e presenti nei top-8; "
      "leggere insieme la copertura giudicata per seed.")
