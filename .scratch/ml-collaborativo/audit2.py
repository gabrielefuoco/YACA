"""audit2.py — TUTTI I LIVELLI (non solo le foglie) + IL RUMORE MISURATO BENE.

Due cose che mancavano:

1. I CLUSTER IN GENERALE. L'albero ha i livelli grossi: L1 (12), L2 (158), L3 (749), L4, L5,
   e le foglie. Sono le stesse community a granularita' diverse. Qui si audita ogni livello.

2. IL RUMORE, misurato bene. "Il 22,8% dei titoli non ha vicini nella propria foglia" e' una
   statistica SBAGLIATA per le foglie piccole: se la foglia ha 5 titoli, l'atteso e' ~0 e lo
   zero e' garantito. La misura giusta e' il PLURALITY: per ogni titolo si guarda in quale
   foglia sta la maggioranza dei suoi 10 vicini di contenuto.
       - se e' la sua -> il titolo e' al posto giusto
       - se e' un'altra -> il titolo e' spostato, e si sa DOVE andrebbe
   Cosi' si conta il rumore e si sa se e' correggibile.
"""
import json, pathlib, sys, time
import numpy as np

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
NOME = sys.argv[1] if len(sys.argv) > 1 else "albero.json"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
Q = Pc.astype(np.float64).copy()
Q[~is_tv] -= Pc[~is_tv].mean(0)
Q[is_tv] -= Pc[is_tv].mean(0)
Pcn = Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)

KNN = 10
NB = np.empty((n, KNN), np.int32)
for i in range(0, n, 1000):
    sim = Pcn[i:i + 1000] @ Pcn.T
    for r in range(sim.shape[0]):
        sim[r, i + r] = -9
    NB[i:i + 1000] = np.argpartition(-sim, KNN, axis=1)[:, :KNN]
print(f"vicini di contenuto: {KNN} per titolo ({time.time()-t0:.0f}s)")

al = json.loads((ML / NOME).read_text(encoding="utf-8"))
nodi = {nd["id"]: nd for nd in al["nodi"]}
foglia_of = np.full(n, -1, np.int64)
for f in al["foglie"]:
    for k in f["members"]:
        r = row_of.get(k)
        if r is not None:
            foglia_of[r] = f["id"]
assert (foglia_of >= 0).all()

# catena foglia -> antenati, per livello
antenati = {}
for L in sorted({nd["level"] for nd in al["nodi"]})[:-1]:
    lab = np.full(n, -1, np.int64)
    for r in range(n):
        nid = foglia_of[r]
        while nid != -1:
            if nodi[nid]["level"] == L:
                lab[r] = nid
                break
            nid = nodi[nid]["parent"]
    antenati[L] = lab
print(f"livelli: " + " · ".join(f"L{L}: {len(np.unique(v))} cluster" for L, v in antenati.items()))


def coerenza_clusteri(lab):
    """coerenza media per cluster. Formula esatta, O(k) invece di O(k^2):
       somma_{i!=j} v_i.v_j = ||somma v_i||^2 - somma ||v_i||^2 = ||S||^2 - k   (vettori unitari)
       coerenza = (||S||^2 - k) / (k(k-1))"""
    out = {}
    for c in np.unique(lab):
        m = np.where(lab == c)[0]
        k = len(m)
        if k < 2:
            out[c] = np.nan
            continue
        S = Pcn[m].sum(0)
        out[c] = (float(S @ S) - k) / (k * (k - 1))
    return out


def pluralita(lab):
    """per ogni titolo, il cluster dove sta la maggioranza dei suoi 10 vicini"""
    vic = lab[NB]
    out = np.empty(n, np.int64)
    for r in range(0, n, 20000):
        blk = vic[r:r + 20000]
        for i in range(blk.shape[0]):
            vals, cnt = np.unique(blk[i], return_counts=True)
            out[r + i] = vals[np.argmax(cnt)]
    return out


print("")
print("=" * 104)
print("OGNI LIVELLO: coerenza, coda di rumore, e quanto si correggerebbe spostando i titoli")
print("=" * 104)
print(f"{'livello':<9} {'cluster':>8} {'mediana':>9} {'dimens.':>9} {'coer.med':>9} {'coer.10°':>9} "
      f"{'<0.20':>7} {'SPOSTATI':>9} {'coer. dopo':>11}")
for L, lab in antenati.items():
    co = coerenza_clusteri(lab)
    arr = np.array(list(co.values()))
    dim_l = np.array([(lab == c).sum() for c in co])
    pl = pluralita(lab)
    spostati = pl != lab
    # coerenza dopo lo spostamento (un giro)
    lab2 = np.where(spostati, pl, lab)
    co2 = coerenza_clusteri(lab2)
    arr2 = np.array(list(co2.values()))
    print(f"L{L:<8} {len(co):>8} {np.nanmedian(arr):>9.3f} {int(np.median(dim_l)):>9} "
          f"{np.nanmedian(arr):>9.3f} {np.nanpercentile(arr,10):>9.3f} "
          f"{100*np.nanmean(arr<0.20):>6.1f}% {100*spostati.mean():>8.1f}% "
          f"{np.nanmedian(arr2):>11.3f}")

print("")
print("=" * 104)
print("LE FOGLIE: il rumore per fascia di dimensione, con la misura giusta (plurality)")
print("=" * 104)
lab = foglia_of
co = coerenza_clusteri(lab)
ids = np.array(sorted(co.keys()))
dim_of = np.array([(lab == c).sum() for c in ids])
arr = np.array([co[c] for c in ids])
pl = pluralita(lab)
spostati = pl != lab
lab2 = np.where(spostati, pl, lab)
co2 = coerenza_clusteri(lab2)
arr2 = np.array([co2.get(c, np.nan) for c in ids])
print(f"{'dimensione':<13} {'foglie':>7} {'titoli':>8} {'coer.med':>9} {'SPOSTATI':>9} {'coer. dopo':>11}")
for lo, hi in ((1, 5), (6, 10), (11, 20), (21, 40), (41, 80), (81, 150), (151, 10 ** 9)):
    m = (dim_of >= lo) & (dim_of <= hi)
    if m.sum() == 0:
        continue
    tit = np.isin(lab, ids[m])
    lab_ = f"{lo}-{hi}" if hi < 10 ** 9 else f"{lo}+"
    print(f"{lab_:<13} {int(m.sum()):>7} {int(tit.sum()):>8,} {np.nanmedian(arr[m]):>9.3f} "
          f"{100*spostati[tit].mean():>8.1f}% {np.nanmedian(arr2[m]):>11.3f}")

print("")
print("=" * 104)
print("IL TETTO: quanto sono lontane le foglie da un gruppo 'ideale'?")
print("=" * 104)
print("  gruppo ideale = un titolo + i suoi 10 vicini di contenuto più stretti (11 titoli)")
t1 = time.time()
ideale = np.empty(n)
for r in range(n):
    m = np.r_[r, NB[r]]
    S = Pcn[m].sum(0)
    k = len(m)
    ideale[r] = (float(S @ S) - k) / (k * (k - 1))
print(f"  coerenza media del gruppo ideale (11 titoli): {ideale.mean():.3f} · mediana {np.median(ideale):.3f}")
fo = lab
dim_map = np.zeros(int(ids.max()) + 1, np.int64)
for c in ids:
    dim_map[c] = (lab == c).sum()
arr_of_titolo = np.array([co[c] for c in fo])
print(f"  coerenza media della foglia in cui il titolo sta:   {arr_of_titolo.mean():.3f}")
print(f"  rapporto ideale/foglia: {ideale.mean()/arr_of_titolo.mean():.2f}x  "
      f"(ma i gruppi ideali hanno 11 titoli: va confrontato a parita' di taglia)")
print("")
print("  per fascia di dimensione della FOGLIA (dove sta il titolo):")
for lo, hi in ((1, 5), (6, 10), (11, 20), (21, 40), (41, 80), (81, 150), (151, 10 ** 9)):
    m = (dim_map[fo] >= lo) & (dim_map[fo] <= hi)
    if m.sum() == 0:
        continue
    lab_ = f"{lo}-{hi}" if hi < 10 ** 9 else f"{lo}+"
    print(f"    foglia {lab_:<8} n={int(m.sum()):>6,} · ideale {ideale[m].mean():.3f} "
          f"· foglia {arr_of_titolo[m].mean():.3f} · rapporto {ideale[m].mean()/max(arr_of_titolo[m].mean(),1e-9):.2f}x")
print(f"  ({time.time()-t1:.0f}s)")

print(f"\n({time.time()-t0:.0f}s)")
