"""riferimento41-2.py — IL RIFERIMENTO DEL REPORT 41, DECOMPOSTO.

Trovato: il teacher del report 41 (SVD del PMI della curatela del train) e' REALE, ma 166 delle
249 sorgenti di test hanno vettore ZERO in quello spazio (non compaiono in nessun arco del train)
— e per quelle il teacher degenera nell'ordine di indice, cioe' nell'artefatto del report 58.

Quindi il 18,90% @10 / 36,90% @100 e' un MISTO. Qui si decompone:
  A) la fusione sulle 83 sorgenti con teacher VERO
  B) la fusione sulle 166 con teacher NULLO (= artefatto)
e si guarda se la fusione con la camminata canonica lo riproduce.
"""
import json, pathlib, sys, time
import numpy as np
import scipy.sparse as sp
from scipy.sparse import coo_matrix
from sklearn.decomposition import TruncatedSVD

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
G = K.GOLD
d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
src = d["sources"]
train = [s for i, s in enumerate(src) if i % 2 == 0]
test = [s for i, s in enumerate(src) if i % 2 == 1]

SOGG, BERS = [], []
for s in test:
    a = row_of.get(s["id"])
    if a is None:
        continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None or l["type"] == s["id"].split(":")[0]:
            continue
        SOGG.append(a)
        BERS.append(b)
SOGG, BERS = np.array(SOGG), np.array(BERS)
US = np.unique(SOGG)
col_of = {int(u): i for i, u in enumerate(US)}
COL = np.array([col_of[int(x)] for x in SOGG])


def archi_curatela(sorgenti):
    rows, cols, vals = [], [], []
    for s in sorgenti:
        a = row_of.get(s["id"])
        if a is None:
            continue
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None:
                continue
            rows += [a, b]
            cols += [b, a]
            vals += [float(l.get("w", 1))] * 2
    return K.normalizza(coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr())


Mc = archi_curatela(train)
A = Mc.copy()
A.data = np.ones_like(A.data)
tot = A.sum()
rs = np.asarray(A.sum(1)).ravel()
cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.maximum(np.log((Co.data * tot) / (rs[Co.row] * cs[Co.col] + 1e-9) + 1e-9) - np.log(10.0), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
E = TruncatedSVD(n_components=256, random_state=0).fit_transform(P).astype(np.float32)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
nrm = np.linalg.norm(E, axis=1)
print(f"teacher report 41: {E.shape} ({time.time()-t0:.0f}s)")

# quali sorgenti hanno un teacher vero?
ha_teacher = nrm[US] > 0
print(f"sorgenti con teacher VERO: {int(ha_teacher.sum())}/{len(US)} · "
      f"con teacher NULLO: {int((~ha_teacher).sum())}")

# --- il grafo canonico e la camminata ---
CMP = K.Componenti(n)
C = CMP(60)
M = K.costruisci(C, {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, wc=0.60, beta=0.50)
print(f"grafo canonico ({time.time()-t0:.0f}s)")
EC = np.zeros((n, len(US)), np.float32)
EC[US, np.arange(len(US))] = 1.0
XC = K.rwr(M, EC, alpha=0.70)
XC[US, np.arange(len(US))] = -1e9
Rs = K.ranghi(XC)
Rt = K.ranghi(E @ E[US].T)
print(f"camminata fatta ({time.time()-t0:.0f}s)")


def misura(R, nome, maschera=None):
    rk = R[BERS, COL]
    if maschera is not None:
        m = maschera[COL]
        rk = rk[m]
    out = {N: 100 * float((rk < N).mean()) for N in (10, 50, 100, 500, 2000)}
    K.stampa(nome, out)
    return out


print("")
print("=" * 104)
print("TUTTE LE SORGENTI (249)")
print("=" * 104)
w = misura(Rs, "camminata canonica sola (mascherata)")
t = misura(Rt, "teacher report 41 solo")
for k0 in (60, 3000):
    f = misura(K.ranghi(3.0 / (k0 + Rs) + 0.5 / (k0 + Rt)), f"RRF camminata+teacher41 k={k0}")
    print(f"     (il report 41 diceva: @10 18,90% · @50 32,50% · @100 36,90% · @500 50,00% · @2000 67,60%)")

print("")
print("=" * 104)
print("DECOMPOSIZIONE — dove nasce il guadagno")
print("=" * 104)
for etichetta, m in (("A) 83 sorgenti con teacher VERO", ha_teacher),
                     ("B) 166 sorgenti con teacher NULLO (= artefatto)", ~ha_teacher)):
    print(f"  --- {etichetta} ---")
    misura(Rs, "    camminata sola", m)
    misura(Rt, "    teacher solo", m)
    for k0 in (3000,):
        misura(K.ranghi(3.0 / (k0 + Rs) + 0.5 / (k0 + Rt)), f"    RRF k={k0}", m)

print("")
print("=" * 104)
print("VERDETTO")
print("=" * 104)
m = ha_teacher
a = misura(K.ranghi(3.0 / (3000 + Rs) + 0.5 / (3000 + Rt)), "RRF k=3000 sulle 83 con teacher vero", m)
b = misura(K.ranghi(3.0 / (3000 + Rs) + 0.5 / (3000 + Rt)), "RRF k=3000 sulle 166 con teacher nullo", ~m)
print("")
print(f"  Sulle sorgenti col teacher NULLO la fusione porta il @10 da "
      f"{misura(Rs,'camminata sola (166)',~m)[10]:.2f}% a {b[10]:.2f}%: e' l'artefatto.")
print(f"  Sulle sorgenti col teacher VERO la fusione porta il @10 da "
      f"{a['x'] if False else misura(Rs,'camminata sola (83)',m)[10]:.2f}% a {a[10]:.2f}%.")
print(f"\n({time.time()-t0:.0f}s)")
