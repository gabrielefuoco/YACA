"""audit-foglie.py — LE FOGLIE SONO TUTTE BUONE? QUANTO RUMORE C'E'? SONO MIGLIORABILI?

Le medie per fascia nascondono la coda. Qui si va foglia per foglia, su tre fronti:

  A. COERENZA  somiglianza media fra i membri (spazio Pc centrato) — la distribuzione, non la media
  B. COMUNITA' quanti archi del grafo cadono DENTRO la foglia, contro quanti ne cadrebbero
               a caso (la densita' attesa). Una foglia senza archi interni non e' una comunita'
  C. MIGLIORABILITA'  quanto guadagna la coerenza spezzando la foglia in due, CONTRO uno split
               casuale della stessa taglia. Spezzare aumenta sempre la coerenza: senza il nullo
               la misura direbbe "tutte le foglie sono migliorabili", che e' falso per costruzione.
               C'e' guadagno vero solo se la foglia e' internamente BIPARTITA.

  D. RUMORE    per ogni titolo: quanti dei suoi 10 vicini di contenuto stanno nella SUA foglia?
               Atteso a caso = 10 * dimensione_foglia / n. Titoli con 0 vicini = titoli spostati.
"""
import json, pathlib, sys, time
from collections import Counter
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix

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

al = json.loads((ML / NOME).read_text(encoding="utf-8"))
foglie = [np.array([row_of[k] for k in f["members"] if k in row_of]) for f in al["foglie"]]
h = len(foglie)
dim = np.array([len(m) for m in foglie])
grado_foglia = np.full(n, -1, np.int64)
for i, m in enumerate(foglie):
    grado_foglia[m] = i
print(f"albero «{NOME}»: {h:,} foglie · {int(dim.sum()):,} titoli · mediana {int(np.median(dim))} · max {dim.max()}")
print(f"  dimensioni: " + " · ".join(
    f"{lab}: {int(((dim>=lo)&(dim<=hi)).sum())}" for lab, lo, hi in
    (("2-5", 2, 5), ("6-10", 6, 10), ("11-20", 11, 20), ("21-40", 21, 40),
     ("41-80", 41, 80), ("81-150", 81, 150), ("151+", 151, 10 ** 9))))

# ---------- A. coerenza ----------
coer = np.full(h, np.nan)
for i, m in enumerate(foglie):
    if len(m) > 1:
        G = Pcn[m] @ Pcn[m].T
        coer[i] = (G.sum() - np.trace(G)) / (len(m) * (len(m) - 1))
print("")

# ---------- B. comunita': archi interni vs attesi ----------
zzg = np.load(ML / "leiden-graph.npz")
M = csr_matrix((zzg["data"], zzg["indices"], zzg["indptr"]), shape=(n, n)).tocsr()
dens_glob = M.nnz / (n * (n - 1))
interno = np.zeros(h)
for i, m in enumerate(foglie):
    sub = M[m][:, m]
    interno[i] = (sub.nnz - (sub.diagonal() > 0).sum()) / 2.0
atteso = dens_glob * dim * (dim - 1) / 2.0
lift_com = interno / np.maximum(atteso, 1e-9)

# ---------- C. migliorabilita': split vero contro split casuale ----------
rng = np.random.default_rng(17)
guad = np.full(h, np.nan)
guad_null = np.full(h, np.nan)
for i, m in enumerate(foglie):
    k = len(m)
    if k < 8:
        continue
    V = Pcn[m]
    G = V @ V.T
    tot_c = k * (k - 1) / 2.0
    base = (G.sum() - np.trace(G)) / (k * (k - 1))

    def coerenza_parti(gruppi):
        num = 0.0
        for g in gruppi:
            if len(g) < 2:
                continue
            Gg = V[g] @ V[g].T
            num += (Gg.sum() - np.trace(Gg)) / 2.0
        return num / tot_c

    # split spettrale: segno della seconda componente principale
    U, S, Vt = np.linalg.svd(V - V.mean(0), full_matrices=False)
    for tent in range(3):
        p = U[:, min(1 + tent, U.shape[1] - 1)]
        a = np.where(p >= 0)[0]
        b = np.where(p < 0)[0]
        if len(a) < 2 or len(b) < 2:
            continue
        guad[i] = max(guad[i] if not np.isnan(guad[i]) else -9, coerenza_parti([a, b]) - base)
    # nullo: 5 split casuali della stessa forma
    nulli = []
    for _ in range(5):
        perm = rng.permutation(k)
        a, b = perm[:k // 2], perm[k // 2:]
        nulli.append(coerenza_parti([a, b]) - base)
    guad_null[i] = float(np.mean(nulli))
ecc = guad - guad_null
print(f"  ({time.time()-t0:.0f}s)")

# ---------- D. rumore: i vicini di contenuto stanno nella stessa foglia? ----------
t1 = time.time()
KNN = 10
NB = np.empty((n, KNN), np.int32)
for i in range(0, n, 1000):
    sim = Pcn[i:i + 1000] @ Pcn.T
    for r in range(sim.shape[0]):
        sim[r, i + r] = -9
    NB[i:i + 1000] = np.argpartition(-sim, KNN, axis=1)[:, :KNN]
vicini_in_foglia = (grado_foglia[NB] == grado_foglia[:, None]).sum(1)
atteso_vicini = KNN * dim[grado_foglia] / n
print(f"  vicini di contenuto calcolati ({time.time()-t1:.0f}s)")

print("")
print("=" * 100)
print("A · LA DISTRIBUZIONE DELLA COERENZA (le medie non la mostrano)")
print("=" * 100)
for q in (1, 5, 10, 25, 50, 75, 90, 99):
    print(f"  {q:>2}° percentile: {np.nanpercentile(coer, q):.3f}")
print(f"  foglie sotto 0.10: {int(np.nansum(coer<0.10)):>5} ({100*np.nanmean(coer<0.10):4.1f}%)"
      f" · sotto 0.20: {int(np.nansum(coer<0.20)):>5} ({100*np.nanmean(coer<0.20):4.1f}%)"
      f" · sotto 0.30: {int(np.nansum(coer<0.30)):>5} ({100*np.nanmean(coer<0.30):4.1f}%)")
print(f"  (titoli presi a caso: 0.004 · una foglia sotto 0.10 e' quasi un raggruppamento casuale)")

print("")
print("=" * 100)
print("B · SONO COMUNITA' VERE? archi interni / archi attesi a caso  (densita' globale {:.2e})".format(dens_glob))
print("=" * 100)
print(f"{'dimensione':<14} {'foglie':>7} {'lift mediano':>13} {'sotto 1x':>9} {'sotto 5x':>9} {'sotto 20x':>10}")
for lo, hi in ((2, 5), (6, 10), (11, 20), (21, 40), (41, 80), (81, 150), (151, 10 ** 9)):
    m = (dim >= lo) & (dim <= hi)
    if m.sum() == 0:
        continue
    lab = f"{lo}-{hi}" if hi < 10 ** 9 else f"{lo}+"
    print(f"{lab:<14} {int(m.sum()):>7} {np.median(lift_com[m]):>13,.0f} "
          f"{100*np.mean(lift_com[m]<1):>8.1f}% {100*np.mean(lift_com[m]<5):>8.1f}% "
          f"{100*np.mean(lift_com[m]<20):>9.1f}%")

print("")
print("=" * 100)
print("C · SONO MIGLIORABILI? guadagno dello split VERO meno guadagno dello split CASUALE")
print("=" * 100)
ok = ~np.isnan(ecc)
print(f"  foglie con >=8 titoli: {int(ok.sum()):,} su {h:,}")
for q in (10, 25, 50, 75, 90, 99):
    print(f"  {q:>2}° percentile del guadagno eccedente: {np.percentile(ecc[ok], q):+.3f}")
print(f"  foglie che guadagnerebbero oltre +0.10: {int((ecc[ok]>0.10).sum()):>5} ({100*np.mean(ecc[ok]>0.10):4.1f}%)")
print(f"  foglie che guadagnerebbero oltre +0.20: {int((ecc[ok]>0.20).sum()):>5} ({100*np.mean(ecc[ok]>0.20):4.1f}%)")
print(f"  foglie che NON guadagnano niente (<0.02): {int((ecc[ok]<0.02).sum()):>5} ({100*np.mean(ecc[ok]<0.02):4.1f}%)")

print("")
print("=" * 100)
print("D · QUANTO RUMORE? quanti dei 10 vicini di contenuto stanno nella stessa foglia")
print("=" * 100)
print(f"  media: {vicini_in_foglia.mean():.2f} su 10 · atteso a caso {atteso_vicini.mean():.2f} "
      f"· lift {vicini_in_foglia.mean()/atteso_vicini.mean():.1f}x")
print(f"{'vicini in foglia':<20} {'titoli':>9} {'quota':>7} {'atteso a caso':>14}")
for k in range(0, 11):
    m = vicini_in_foglia == k
    if m.sum() == 0:
        continue
    print(f"{k:<20} {int(m.sum()):>9,} {100*m.mean():>6.1f}% {100*np.mean(atteso_vicini[m]>=k):>13.1f}%")
print(f"\n  titoli con ZERO vicini nella propria foglia: {int((vicini_in_foglia==0).sum()):,} "
      f"({100*np.mean(vicini_in_foglia==0):.1f}%) <- quelli spostati")
print(f"  la loro coerenza media: {np.nanmean(coer[grado_foglia[vicini_in_foglia==0]]):.3f} "
      f"contro {np.nanmean(coer[grado_foglia[vicini_in_foglia>0]]):.3f} delle altre foglie")
np.savez_compressed(ML / "audit-foglie.npz", coer=coer, lift_com=lift_com, ecc=ecc,
                    guad=guad, guad_null=guad_null, vicini=vicini_in_foglia, dim=dim)
print(f"\n({time.time()-t0:.0f}s)")
