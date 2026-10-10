import json, pathlib
import numpy as np
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo, votes = z["Pc"], z["tmdb"], z["tipo"], z["votes"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}; n = len(keys)
is_tv = (tipo == "tv")
ts = json.loads((ML/"testset-synth.json").read_text(encoding="utf-8"))
t = ts["trials"][0]
sg = [row_of[k] for k in t["seeds"] if k in row_of]
gd = [row_of[k] for k in t["gold"] if k in row_of]
print(f"account {t['ctx']} ({t['strato']}): seeds {len(sg)} · gold {len(gd)}")
print(f"gold che sono film: {sum(1 for r in gd if not is_tv[r])} · gold serie: {sum(1 for r in gd if is_tv[r])}")
print(f"gold gia' nei seed? {len(set(gd) & set(sg))}")
# candidati = film non visti
cand = (~is_tv) & ~np.isin(np.arange(n), sg)
print(f"candidati: {cand.sum():,} · caso atteso p3@10: {100*10*len(gd)/cand.sum():.2f}%")
# contenuto: profilo = media dei seed
def centra(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0); Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
Pc2 = centra(Pc)
prof = Pc2[sg].mean(0)
sc = Pc2 @ prof
sc[~cand] = -1e9
order = np.argsort(-sc)
rank = np.empty(n, np.int32); rank[order] = np.arange(n)
rk = rank[gd]
print(f"contenuto: p3@10 {100*(rk<10).mean():.1f}% · mediana rank {np.median(rk):.0f} · top-10 rank {sorted(rk)[:5]}")
print(f"  il gold sta in testa? rank minimo {rk.min()} · quanti nel top-100: {(rk<100).sum()}")
# e la popolarita' sulla stessa maschera
sc2 = votes.astype(float).copy(); sc2[~cand] = -1e9
o2 = np.argsort(-sc2); r2 = np.empty(n, np.int32); r2[o2] = np.arange(n)
print(f"popolarita': p3@10 {100*(r2[gd]<10).mean():.1f}% · mediana rank {np.median(r2[gd]):.0f}")
# quante volte il gold e' tra i 10 film PIU' popolari non visti?
print(f"  i 10 film piu' popolari non visti: {[keys[i] for i in o2[:10]]}")
print(f"  gold: {[keys[i] for i in gd[:10]]}")
