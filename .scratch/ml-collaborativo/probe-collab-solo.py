"""I vicini collaborativi da SOLI, come lista (non come generatore da aggiungere): battono il ranker
sulla nicchia? Misura il recall@50/@200 del top-N collaborativo su TUTTO il catalogo, per strato,
con il controllo a caso della stessa ampiezza."""
import json, pathlib
import numpy as np
CACHE = pathlib.Path(__file__).resolve().parents[2] / ".cache" / "movielens"
POS = json.loads((CACHE / "positions.json").read_text())
keys = list(POS.keys())
M = np.asarray([POS[k] for k in keys], dtype=np.float32)
M /= (np.linalg.norm(M, axis=1, keepdims=True) + 1e-9)
idx = {k: i for i, k in enumerate(keys)}
trials = json.loads((CACHE / "graph-candidates-full.json").read_text())
rng = np.random.default_rng(20261008)
res = {}
for t in trials:
    gold = [k for k in t["gold"] if k in idx]
    srows = [idx[k] for k in t["seeds"] if k in idx]
    if not srows or not gold:
        continue
    p = M[srows].mean(0); p /= (np.linalg.norm(p) + 1e-9)
    order = [keys[i] for i in np.argsort(-(M @ p)) if keys[i] not in set(t["seeds"])]
    rnd = [keys[i] for i in rng.choice(len(keys), size=200, replace=False)]
    g = set(gold)
    for name, lst in (("collab top-N (tutto il catalogo)", order), ("caso (200 dal catalogo)", rnd)):
        for st in (t["strato"], "tutti"):
            d = res.setdefault((st, name), {"t": 0, "r50": 0.0, "r200": 0.0})
            d["t"] += 1
            d["r50"] += sum(1 for k in lst[:50] if k in g) / len(g)
            d["r200"] += sum(1 for k in lst[:200] if k in g) / len(g)
print("| strato | ordinamento | @50 | @200 |")
print("|---|---|---|---|")
for st in ("tutti", "fondo", "resto"):
    for name in ("collab top-N (tutto il catalogo)", "caso (200 dal catalogo)"):
        d = res.get((st, name))
        if not d or not d["t"]:
            continue
        print(f"| {st} | {name} | {100*d['r50']/d['t']:.1f}% | {100*d['r200']/d['t']:.1f}% |")
