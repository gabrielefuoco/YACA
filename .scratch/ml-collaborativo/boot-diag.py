"""boot-diag.py — NUMERI PER IL BOOTSTRAP. Niente esperimenti: solo misure.

Serve a decidere il disegno del ciclo, non a provarlo. Misura:
  1. copertura: distribuzione del grado nel grafo unito (chi e' "a bassa copertura")
  2. composizione per medium degli archi di CONTENUTO (quanti attraversano film/serie)
  3. quanti titoli hanno curatela a 1 e 2 salti (la copertura vera, non il grado)
  4. statische dell'albero (foglie, livelli, dimensione)
  5. il protocollo di parita': quanti legami di test, quanti raggiungibili

Nessun numero qui e' un risultato: sono le misure che servono a NON sbagliare il disegno.
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
import pandas as pd

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, Pb, tmdb, tipo, year = z["Pc"], z["Pb"], z["tmdb"], z["tipo"], z["year"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
assert len(row_of) == n, "chiavi duplicate: il namespace non e' pulito"
print(f"nodi {n:,} · serie {int(is_tv.sum()):,} · film {int((~is_tv).sum()):,}\n")

# ---- 1. grado nel grafo unito ----------------------------------------------
zz = np.load(ML / "leiden-graph.npz")
M = csr_matrix((zz["data"], zz["indices"], zz["indptr"]), shape=(n, n))
nz = (M > 0)
grado = np.asarray(nz.sum(1)).ravel()
wdeg = np.asarray(M.sum(1)).ravel()
print("=" * 78)
print("1. GRADO NEL GRAFO UNITO")
print("=" * 78)
for q in (1, 5, 10, 25, 50, 75, 90, 99):
    print(f"  {q:>2}° percentile: grado {int(np.percentile(grado,q)):>4} · grado pesato {np.percentile(wdeg,q):>7.3f}")
print(f"  grado medio {grado.mean():.1f} · mediana {int(np.median(grado))}")
for lim in (5, 10, 20, 30, 50):
    m = grado <= lim
    print(f"  titoli con grado <= {lim:>3}: {int(m.sum()):>6} ({100*m.mean():4.1f}%)"
          f"  · di cui serie {int((m & is_tv).sum()):>6} · film {int((m & ~is_tv).sum()):>6}")

# ---- 2. cross-medium degli archi di contenuto ------------------------------
print("")
print("=" * 78)
print("2. GLI ARCHI DI CONTENUTO ATTRAVERSANO I MEDIUM?  (campione 4.000 nodi)")
print("=" * 78)


def centra(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


Pc2 = centra(Pc)
rng = np.random.default_rng(11)
samp = rng.choice(n, 4000, replace=False)
Pcn = Pc2 / (np.linalg.norm(Pc2, axis=1, keepdims=True) + 1e-9)
X = Pcn[samp]
cross = np.zeros(len(samp), int)
for i in range(0, len(samp), 1000):
    sim = X[i:i + 1000] @ Pcn.T
    for r in range(sim.shape[0]):
        sim[r, samp[i + r]] = -9
    idx = np.argpartition(-sim, 15, axis=1)[:, :15]
    cross[i:i + 1000] = (is_tv[idx] != is_tv[samp[i:i + 1000]][:, None]).sum(1)
print(f"  mediana di vicini cross-medium su 15: {int(np.median(cross))}")
print(f"  distribuzione: " + " · ".join(f"{k}→{int((cross==k).sum())}" for k in range(0, 16) if (cross == k).sum()))
serie_cross = cross[is_tv[samp]]
film_cross = cross[~is_tv[samp]]
print(f"  serie: mediana {int(np.median(serie_cross))}/15 cross-medium"
      f" · film: mediana {int(np.median(film_cross))}/15")
print(f"  quota di archi di contenuto cross-medium: {100*cross.sum()/(15*len(samp)):.1f}%")

# --- verifica con titoli veri: il controllo che non si puo' barare ---
TIT = {}
mv = pd.read_parquet(ROOT / ".cache" / "tmdb" / "movies.parquet", columns=["id", "title"])
tv = pd.read_parquet(ROOT / ".cache" / "tmdb" / "tv.parquet", columns=["id", "name"])
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t in zip(df["id"], df[col]):
        TIT[f"{typ}:{int(i)}"] = str(t)

for etichetta, sel in (("una SERIE", np.where(is_tv)[0][0:1]), ("un FILM", np.where(~is_tv)[0][0:1])):
    for r in sel:
        sim = (Pcn[r] @ Pcn.T)
        sim[r] = -9
        top = np.argsort(-sim)[:8]
        print(f"  vicini di {etichetta} «{TIT.get(keys[r],'?')}»:")
        for j in top:
            print(f"      {'serie' if is_tv[j] else 'film '} {sim[j]:+.3f}  {TIT.get(keys[j],'?')}")

# ---- 3. copertura di curatela: 1 e 2 salti ---------------------------------
d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
sorgenti = d["sources"]
print(f"\n  sorgenti curate: {len(sorgenti)} · id unici {len(set(s['id'] for s in sorgenti))}")
for i, s in enumerate(sorgenti[:2000]):
    if s["id"] not in row_of:
        print(f"  !!! sorgente fuori catalogo: {s['id']}")
        break
nleg = sum(len(s["links"]) for s in sorgenti)
fuori = sum(1 for s in sorgenti for l in s["links"] if l["id"] not in row_of)
print(f"  legami totali {nleg} · fuori catalogo {fuori}")

def cur_mat(sel):
    rows, cols = [], []
    for s in sel:
        a = row_of.get(s["id"])
        if a is None:
            continue
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None:
                continue
            rows += [a, b]
            cols += [b, a]
    return coo_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(n, n)).tocsr()


par, dis = [s for i, s in enumerate(sorgenti) if i % 2 == 1], [s for i, s in enumerate(sorgenti) if i % 2 == 0]
KT, KE = cur_mat(par), cur_mat(dis)
print(f"  train (dispari): {len(par)} sorgenti · {KT.nnz//2} legami")
print(f"  test  (pari):    {len(dis)} sorgenti · {KE.nnz//2} legami")

# quanti nodi sono a 1 / 2 salti da una sorgente di train
uno = np.asarray((KT > 0).sum(1)).ravel()
# chiusura a 2 salti: nodi raggiungibili in <=2 passi da una sorgente di train
sorg_rows = np.array([row_of[s["id"]] for s in par if s["id"] in row_of])
frontiera = np.zeros(n, bool)
frontiera[sorg_rows] = True
for _ in range(2):
    frontiera = frontiera | ((frontiera.astype(np.float32) @ nz.astype(np.float32)) > 0)
print(f"  nodi a <=2 salti da una sorgente di train: {int(frontiera.sum()):,} ({100*frontiera.mean():.1f}%)")

# ---- 4. l'albero -----------------------------------------------------------
print("")
print("=" * 78)
print("4. L'ALBERO")
print("=" * 78)
al = json.loads((ML / "albero.json").read_text(encoding="utf-8"))
nodi = {nd["id"]: nd for nd in al["nodi"]}
leaf_of = np.full(n, -1, np.int64)
for f in al["foglie"]:
    for k in f["members"]:
        r = row_of.get(k)
        if r is not None:
            leaf_of[r] = f["id"]
print(f"  nodi {len(al['nodi']):,} · foglie {len(al['foglie']):,} · copertura {100*(leaf_of>=0).mean():.1f}%")
prof = Counter(nodi[nd["id"]]["level"] for nd in al["nodi"])
print(f"  nodi per livello: " + " · ".join(f"L{k}:{v}" for k, v in sorted(prof.items())))
sizes = np.array([f["size"] for f in al["foglie"]])
print(f"  foglie: mediana {int(np.median(sizes))} · min {sizes.min()} · max {sizes.max()}"
      f" · >40 titoli: {int((sizes>40).sum())} ({100*(sizes>40).mean():.1f}%)")

# la dimensione della foglia MEDIA in cui sta un titolo qualsiasi
fog_size_of = np.zeros(n, int)
for f in al["foglie"]:
    for k in f["members"]:
        r = row_of.get(k)
        if r is not None:
            fog_size_of[r] = f["size"]
print(f"  la foglia tipica (per titolo) ha {int(np.median(fog_size_of))} titoli · media {fog_size_of.mean():.0f}")

# ---- 5. chi toccherebbe il bootstrap ---------------------------------------
print("")
print("=" * 78)
print("5. CHI E' IL BERSAGLIO DEL BOOTSTRAP")
print("=" * 78)
bassa = grado <= 10
print(f"  titoli a grado <=10:              {int(bassa.sum()):>6}")
print(f"  di cui FUORI dal raggio curato:   {int((bassa & ~frontiera).sum()):>6}")
print(f"  titoli fuori dal raggio curato:   {int((~frontiera).sum()):>6} ({100*(~frontiera).mean():.1f}%)")
print(f"    di cui serie {int((~frontiera & is_tv).sum()):,} · film {int((~frontiera & ~is_tv).sum()):,}")

# le sorgenti di test: quante hanno un legame di test con un titolo gia' raggiungibile?
coppie_test = []
for s in dis:
    a = row_of.get(s["id"])
    if a is None:
        continue
    pos = [row_of[l["id"]] for l in s["links"] if l["id"] in row_of]
    if pos:
        coppie_test.append((a, pos))
tot = sum(len(p) for _, p in coppie_test)
rag = sum(int(frontiera[p].sum()) for _, p in coppie_test)
print(f"\n  test: {len(coppie_test)} sorgenti · {tot} legami")
print(f"  sorgenti di test che sono serie: {sum(1 for a, _ in coppie_test if is_tv[a])}/{len(coppie_test)}")
xm = [(a, p) for a, p in coppie_test if is_tv[a]]
print(f"  legami emessi da una SERIE: {sum(len(p) for _, p in xm)}")
print(f"    di cui verso un FILM: {sum(int((~is_tv[p]).sum()) for _, p in xm)}")
print(f"    di cui verso un'altra SERIE: {sum(int(is_tv[p].sum()) for _, p in xm)}")
print(f"  legami il cui bersaglio e' raggiungibile in <=2 salti: {rag} ({100*rag/tot:.1f}%)")
print(f"\n({time.time()-t0:.0f}s)")
