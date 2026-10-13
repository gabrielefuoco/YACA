"""diag-foglie.py — PERCHE' LE FOGLIE GRANDI NON SI APRONO.

albero.py prova 8 risoluzioni e scarta un figlio per tre motivi:
   (a) k fuori da 2..25       -> troppi figli
   (b) un figlio < 3 titoli   -> frammento
   (c) modularita' < 0.15     -> nessuna struttura
Scendendo la soglia da 40 a 25 NON sono cambiate: 164 foglie sopra i 40 sia prima che dopo.
Quindi la soglia non c'entra: qui si conta QUALE dei tre motivi le blocca, una per una.
"""
import json, pathlib, sys, time
from collections import Counter
import numpy as np
from scipy.sparse import csr_matrix
import igraph as ig
import leidenalg as la

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
NOME = sys.argv[1] if len(sys.argv) > 1 else "albero-s25.json"
SOGLIA = int(sys.argv[2]) if len(sys.argv) > 2 else 25

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
zz = np.load(ML / "leiden-graph.npz")
M = csr_matrix((zz["data"], zz["indices"], zz["indptr"]), shape=(n, n)).tocsr()

al = json.loads((ML / NOME).read_text(encoding="utf-8"))
grandi = []
for f in al["foglie"]:
    if f["size"] > 40:
        righe = [row_of[k] for k in f["members"] if k in row_of]
        grandi.append((f["size"], np.array(righe)))
grandi.sort(key=lambda x: -x[0])
dim = np.array([s for s, _ in grandi])
print(f"albero «{NOME}» (soglia {SOGLIA}) · foglie {len(al['foglie']):,} · sopra i 40: {len(grandi)}")
print(f"  dimensioni: max {dim.max()} · mediana {int(np.median(dim))} · >100: {int((dim>100).sum())}")
print(f"  fascia 41-60: {int(((dim>=41)&(dim<=60)).sum())} · 61-100: {int(((dim>=61)&(dim<=100)).sum())} · 101+: {int((dim>100).sum())}")


def sottografo(mem):
    sub = M[mem][:, mem].tocoo()
    msk = sub.row < sub.col
    if int(msk.sum()) < 5:
        return None, 0
    gs = ig.Graph(n=len(mem), edges=list(zip(sub.row[msk].tolist(), sub.col[msk].tolist())), directed=False)
    gs.es["weight"] = sub.data[msk].tolist()
    return gs, int(msk.sum())


RIS = Counter()
esempi = {}
MODAL = []
t1 = time.time()
for size, mem in grandi:
    gs, narchi = sottografo(mem)
    if gs is None:
        RIS["ZERO archi nel sottografo"] += 1
        continue
    motivi = Counter()
    migliore = None          # miglior taglio STRUTTURALMENTE valido (k e dimensione figli)
    migliore_tutti = None    # miglior taglio a prescindere
    for res in (0.3, 0.5, 0.8, 1.2, 2.0, 3.0, 5.0, 8.0):
        try:
            p = la.find_partition(gs, la.RBConfigurationVertexPartition, weights="weight",
                                  resolution_parameter=res, seed=42)
        except Exception:
            motivi["errore leiden"] += 1
            continue
        sz = np.bincount(p.membership)
        k = len(sz)
        if migliore_tutti is None or p.modularity > migliore_tutti[1]:
            migliore_tutti = (res, p.modularity, k, int(sz.min()))
        if not (2 <= k <= 25):
            motivi["troppi figli (k>25)" if k > 25 else "un figlio solo (k<2)"] += 1
            continue
        if sz.min() < 3:
            motivi["figlio < 3 titoli"] += 1
            continue
        motivi["struttura valida"] += 1
        if migliore is None or p.modularity > migliore[1]:
            migliore = (res, p.modularity, k)
    if migliore is None:
        dominante = motivi.most_common(1)[0][0] if motivi else "?"
        RIS[dominante] += 1
        esempi.setdefault(dominante, []).append((size, narchi))
        MODAL.append((size, np.nan, migliore_tutti[1] if migliore_tutti else np.nan))
    else:
        # la struttura c'e': passa solo se la modularita' arriva a 0.15 (il filtro di albero.py)
        MODAL.append((size, migliore[1], migliore_tutti[1]))
        if migliore[1] >= 0.15:
            RIS["SI APRE e non e' stato aperto -> BUG"] += 1
        else:
            RIS["modularita' < 0.15"] += 1
            esempi.setdefault("modularita' < 0.15", []).append(
                (size, narchi, migliore[1], migliore[0], migliore[2]))
print(f"\n  ({len(grandi)} foglie, {time.time()-t1:.0f}s)")

print("")
print("=" * 82)
print("PERCHE' NON SI APRONO")
print("=" * 82)
tot = sum(RIS.values())
for motivo, c in RIS.most_common():
    print(f"  {motivo:<40} {c:>4} ({100*c/tot:4.1f}%)")
    for e in esempi.get(motivo, [])[:4]:
        if len(e) == 2:
            print(f"      es. {e[0]} titoli / {e[1]} archi")
        else:
            print(f"      es. {e[0]} titoli / {e[1]} archi · mod {e[2]:.3f} a res {e[3]} con {e[4]} figli")

MODAL = np.array([m for m in MODAL if not np.isnan(m[1])])
if len(MODAL):
    print("")
    print("  MODULARITA' DEL MIGLIOR TAGLIO VALIDO (la soglia e' 0.15)")
    for q in (10, 25, 50, 75, 90):
        print(f"    {q:>2}° percentile: {np.percentile(MODAL[:,1],q):.3f}")
    print(f"    sotto 0.15: {int((MODAL[:,1]<0.15).sum())}/{len(MODAL)}")
    print(f"    sotto 0.10: {int((MODAL[:,1]<0.10).sum())} · sotto 0.05: {int((MODAL[:,1]<0.05).sum())}")
    print(f"    sopra 0.15 (bug): {int((MODAL[:,1]>=0.15).sum())}")

# lettura: quali titoli stanno in una foglia grande tipica
print("")
print("=== LA FOGLIA GRANDE PIU' TIPICA, letta ===")
for size, mem in grandi[:3]:
    tv_n = int(is_tv[mem].sum())
    print(f"\n  {size} titoli ({tv_n} serie / {size-tv_n} film)")
print(f"\n({time.time()-t0:.0f}s)")
