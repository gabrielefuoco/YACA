"""test-cross.py — DOMANDA 1: il segnale scritto a mano si TRASFERISCE?
Teacher costruito dalle serie DISPARI, misurato sui legami delle PARI (mai visti).
Se il sistema li ritrova, il dataset e' una REGOLA. Se no, e' un ELENCO."""
import json, pathlib, sys, os
import numpy as np
from scipy.sparse import csr_matrix, coo_matrix
from sklearn.decomposition import TruncatedSVD
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
d = json.loads((ROOT/".scratch"/"ml-collaborativo"/"gold"/os.environ.get("CROSS","cross-merged.json")).read_text(encoding="utf-8"))
src = d["sources"]
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
keys = [f"{t}:{int(i)}" for t, i in zip(z["tipo"], z["tmdb"])]
row_of = {k: r for r, k in enumerate(keys)}; n = len(keys)
train = [s for i, s in enumerate(src) if i % 2 == 0]
test  = [s for i, s in enumerate(src) if i % 2 == 1]
print(f"sorgenti: {len(src)} -> train {len(train)} · test {len(test)}")
# adiacenza dal solo train (simmetrica, con peso)
r_, c_, v_ = [], [], []
for s in train:
    a = row_of.get(s["id"])
    if a is None: continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None: continue
        r_ += [a, b]; c_ += [b, a]; v_ += [float(l["w"]), float(l["w"])]
A = coo_matrix((v_, (r_, c_)), shape=(n, n)).tocsr()
A.sum_duplicates()
print(f"adiacenza train: {A.nnz:,} archi su {int((A.getnnz(1)>0).sum()):,} titoli")
# SPPMI + SVD (la stessa ricetta del pipeline)
tot = A.sum()
rs = np.asarray(A.sum(1)).ravel(); cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.log((Co.data * tot) / (rs[Co.row] * cs[Co.col] + 1e-9) + 1e-9)
pmi = np.maximum(pmi - np.log(1.0), 0.0)      # SPPMI con k=1
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
svd = TruncatedSVD(n_components=64, random_state=0)
E = svd.fit_transform(P)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
print(f"coordinate: {E.shape} · varianza spiegata {svd.explained_variance_ratio_.sum():.2f}")
pop = np.asarray(A.sum(1)).ravel()
rng = np.random.default_rng(0)
caso = rng.random(n)
nuove = set()
try:
    b = json.loads((ROOT/".scratch"/"ml-collaborativo"/"gold"/"cura-1.json").read_text(encoding="utf-8"))
    nuove = {x["id"] for x in b["sources"]}
except Exception: pass
GRUPPI = {"vecchie": lambda s: s["id"] not in nuove, "NUOVE (blocco 1)": lambda s: s["id"] in nuove}
def misura_gruppo(nome, punteggio, sel):
    tot_l = h10 = h50 = 0; tot_m = h10m = 0
    for s in test:
        if not sel(s): continue
        a = row_of.get(s["id"])
        if a is None: continue
        sc = punteggio(a).copy(); sc[a] = -9
        order = np.argsort(-sc); rank = np.empty(n, np.int32); rank[order] = np.arange(n)
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None: continue
            tot_l += 1; h10 += rank[b] < 10; h50 += rank[b] < 50
            if l["type"] != s["id"].split(":")[0]: tot_m += 1; h10m += rank[b] < 10
    print(f"  {nome:<22} p3@10 {100*h10/max(1,tot_l):5.1f}% ({h10}/{tot_l}) · p1@50 {100*h50/max(1,tot_l):5.1f}% · cross-medium {100*h10m/max(1,tot_m):5.1f}% ({h10m}/{tot_m})")
def misura(nome, punteggio):
    tot_l = h10 = h20 = h50 = 0
    tot_m = h10m = 0
    for s in test:
        a = row_of.get(s["id"])
        if a is None: continue
        sc = punteggio(a).copy(); sc[a] = -9
        order = np.argsort(-sc); rank = np.empty(n, np.int32); rank[order] = np.arange(n)
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None: continue
            tot_l += 1; h10 += rank[b] < 10; h20 += rank[b] < 20; h50 += rank[b] < 50
            if l["type"] != s["id"].split(":")[0]:
                tot_m += 1; h10m += rank[b] < 10
    print(f"  {nome:<26} p3@10 {100*h10/max(1,tot_l):5.1f}% ({h10}/{tot_l}) · p2@20 {100*h20/max(1,tot_l):5.1f}% · p1@50 {100*h50/max(1,tot_l):5.1f}%  |  solo cross-medium: {100*h10m/max(1,tot_m):5.1f}% ({h10m}/{tot_m})")
print("\nDOMANDA 1 — i legami delle serie PARI (mai visti), ritrovati dal teacher costruito sulle DISPARI:")
misura("coordinate (il teacher)", lambda a: E @ E[a])
misura("popolarita' (controllo)", lambda a: pop)
misura("caso (controllo)", lambda a: caso)
print("\nRIFERIMENTO: la pipeline attuale fa 2,2% sul tipo medium; il caso ~0%.")

print("\nPER GRUPPO (solo il teacher):")
for g, sel in GRUPPI.items(): misura_gruppo(g, lambda a: E @ E[a], sel)
