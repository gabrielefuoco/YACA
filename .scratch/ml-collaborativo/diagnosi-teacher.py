"""diagnosi-teacher.py — PERCHE' 166 SORGENTI HANNO IL TEACHER A ZERO?

Il teacher del report 41 = SVD(PMI(curatela_train)). 166 delle 249 sorgenti di test hanno
vettore nullo. Tre spiegazioni possibili, e vanno distinte perche' portano a rimedi diversi:

  A) la soglia PMI (`- log(10)`) azzera i pesi -> la riga sparisce
  B) le sorgenti non compaiono in nessun arco del train (nessun link in entrata ne' in uscita)
  C) l'SVD non riesce a rappresentarle (rango insufficiente)

Si misura tutto, e si guarda anche se la differenza fra le due popolazioni (28,5% vs 2,4% @10
della camminata) e' spiegata dalla stessa causa.
"""
import json, pathlib, sys, time
import numpy as np
import scipy.sparse as sp
from scipy.sparse import coo_matrix

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
d = json.loads((K.GOLD / "cross-merged.json").read_text(encoding="utf-8"))
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
    return coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr()


Mc_raw = archi_curatela(train)
print(f"curatela del train: {Mc_raw.nnz:,} archi ({time.time()-t0:.0f}s)")

A = Mc_raw.copy()
A.data = np.ones_like(A.data)
tot = A.sum()
rs = np.asarray(A.sum(1)).ravel()
cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi_grezzo = np.log((Co.data * tot) / (rs[Co.row] * cs[Co.col] + 1e-9) + 1e-9)
pmi = np.maximum(pmi_grezzo - np.log(10.0), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()

# --- A) la soglia PMI ---
righe_raw = np.asarray((Mc_raw > 0).sum(1)).ravel()
righe_pmi = np.asarray((P > 0).sum(1)).ravel()
# --- B) compaiono come BERSAGLIO di un legame di train? ---
tgt_train = np.zeros(n, bool)
for s in train:
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is not None:
            tgt_train[b] = True

print("")
print("=" * 96)
print("DIAGNOSI SULLE 246 SORGENTI DI TEST")
print("=" * 96)
print(f"  con almeno un arco nella curatela del train (riga non vuota): {int((righe_raw[US]>0).sum())}/{len(US)}")
print(f"  con almeno un peso PMI SOPRAVVISUTO alla soglia:              {int((righe_pmi[US]>0).sum())}/{len(US)}")
print(f"  che compaiono come BERSAGLIO di un legame di train:           {int(tgt_train[US].sum())}/{len(US)}")
print("")
print(f"  PMI grezzo dei pesi: mediana {np.median(pmi_grezzo):.3f} · sopra log(10)={np.log(10):.3f}: "
      f"{100*float((pmi_grezzo > np.log(10)).mean()):.1f}% dei pesi")
print(f"  archi sopravvissuti alla soglia: {P.nnz:,} su {A.nnz:,} ({100*P.nnz/A.nnz:.1f}%)")

# --- la relazione con la difficolta' della camminata ---
CMP = K.Componenti(n)
C = CMP(60)
M = K.costruisci(C, {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, wc=0.60, beta=0.50)
EC = np.zeros((n, len(US)), np.float32)
EC[US, np.arange(len(US))] = 1.0
XC = K.rwr(M, EC, alpha=0.70)
XC[US, np.arange(len(US))] = -1e9
Rs = K.ranghi(XC)
rk = Rs[BERS, COL]

print("")
print("=" * 96)
print("LA CAMMINATA, SEGMENTATA PER CAUSA")
print("=" * 96)
for nome, maschera in (("riga non vuota nel train", righe_raw[US] > 0),
                       ("riga vuota nel train", righe_raw[US] == 0),
                       ("PMI sopra soglia", righe_pmi[US] > 0),
                       ("PMI sotto soglia", righe_pmi[US] == 0),
                       ("e' bersaglio di un legame", tgt_train[US]),
                       ("non e' bersaglio", ~tgt_train[US])):
    m = maschera[COL]
    if m.sum() == 0:
        continue
    print(f"  {nome:<28} sorgenti {int(maschera.sum()):>4} · legami {int(m.sum()):>4} · "
          f"@10 {100*float((rk[m]<10).mean()):5.2f}% · @100 {100*float((rk[m]<100).mean()):5.2f}% · "
          f"@500 {100*float((rk[m]<500).mean()):5.2f}%")

# --- quante delle sorgenti 'difficili' sono serie? e quante hanno pochi link? ---
print("")
print(f"  le sorgenti sono tutte serie: {bool(is_tv[US].all())}")
nlink = np.array([int((SOGG == u).sum()) for u in US])
for nome, maschera in (("riga non vuota nel train", righe_raw[US] > 0),
                       ("riga vuota nel train", righe_raw[US] == 0)):
    print(f"  {nome:<28} link per sorgente: mediana {np.median(nlink[maschera]):.0f} · "
          f"min {nlink[maschera].min()} · max {nlink[maschera].max()}")
print(f"\n({time.time()-t0:.0f}s)")
