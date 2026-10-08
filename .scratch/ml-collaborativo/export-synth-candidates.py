"""Esporta i candidati per gli ACCOUNT SINTETICI (split temporale gia' fatto: non si risplitta)."""
import json, os, pathlib
import numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[2]; CACHE = ROOT / ".cache" / "movielens"
MAX_TRIALS = int(os.environ.get("MAX_TRIALS", "80"))
CAP_TWO, CAP_CLU = 1200, 3000
g = np.load(CACHE / "film-graph-idf05.npz", allow_pickle=True)
member, ids, types, edges = g["member"], g["ids"], g["types"], g["edges"]
row_of = {f"{str(t)}:{int(i)}": k for k, (t, i) in enumerate(zip(types, ids))}
NEIGH = [set() for _ in range(len(member))]
for a, b in edges:
    NEIGH[int(a)].add(int(b)); NEIGH[int(b)].add(int(a))
cl_members = {}
for node, cl in enumerate(member.tolist()):
    cl_members.setdefault(int(cl), []).append(node)
ts = json.loads((CACHE / "testset-synth.json").read_text())
trials = [t for t in ts["trials"] if len(t["seeds"]) >= 20 and len(t["gold"]) >= 10]
rng = np.random.default_rng(20261008)
out = []
for st in ("fondo", "resto"):
    sub = [t for t in trials if t["strato"] == st]
    idx = rng.permutation(len(sub))[: MAX_TRIALS // 2]
    for i in idx:
        t = sub[i]
        srows = [row_of[k] for k in t["seeds"] if k in row_of]
        if len(srows) < 5:
            continue
        one, two, clus = set(), set(), set()
        for r in srows:
            one |= NEIGH[r]
            for nb in NEIGH[r]:
                two |= NEIGH[nb]
            clus.update(cl_members[int(member[r])])
            for nb in list(NEIGH[r])[:5]:
                clus.update(cl_members[int(member[nb])])
        to_keys = lambda nodes: [f"{types[n]}:{int(ids[n])}" for n in nodes]
        two_l = to_keys(two); clu_l = to_keys(clus)
        out.append({"ctx": t["ctx"], "strato": t["strato"], "seeds": t["seeds"], "gold": t["gold"],
                    "onehop": to_keys(one), "twohop": two_l[:CAP_TWO], "cluster": clu_l[:CAP_CLU]})
print(f"trial esportati: {len(out)} (di {len(trials)} disponibili)")
for st in ("fondo", "resto"):
    s = [t for t in out if t["strato"] == st]
    if s:
        print(f"  {st}: {len(s)} · cronologia mediana {int(np.median([len(t['seeds']) for t in s]))} · verita' {int(np.median([len(t['gold']) for t in s]))}")
(CACHE / "graph-candidates-synth.json").write_text(json.dumps(out))
print("scritto graph-candidates-synth.json")
