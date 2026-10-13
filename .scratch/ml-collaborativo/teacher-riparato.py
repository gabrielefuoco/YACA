"""teacher-riparato.py — IL TEACHER SULLE DUE POPOLAZIONI, SEPARATE.

Diagnosi (diagnosi-teacher.py): le 246 sorgenti di test sono due popolazioni, e la differenza
non e' il numero di link (mediana 4 per entrambe) ne' la soglia PMI (sopravvive il 100% dei pesi).
E' che 83 sorgenti compaiono anche come BERSAGLIO di un legame delle sorgenti di train: hanno
archi di curatela in entrata nel grafo (che e' simmetrico), quindi NON sono cold start. Le 163
non hanno nessun arco: sono cold start veri.

Sono due domande di prodotto diverse, e vanno misurate separate:
   CALDE  (83)  un titolo che il mondo curato gia' tocca
   FREDDE (163) un titolo nuovo, che nessuno ha mai collegato

E il teacher va scelto di conseguenza: sulle FREDDE nessun teacher derivato dalla curatela puo'
funzionare (non hanno archi). Restano i metadati, CFst, la co-visione.

Ogni teacher viene verificato: la sua norma deve essere > 0 per OGNI sorgente della popolazione.
E ogni fusione viene confrontata con i due controlli (ordine di indice, permutazione casuale),
che su una popolazione con teacher nullo gonfiano — e' l'artefatto del report 58/61.
"""
import json, pathlib, sys, time
import numpy as np

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

tgt = np.zeros(n, bool)
for s in train:
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is not None:
            tgt[b] = True
CALDE = tgt[US]
print(f"sorgenti: {len(US)} · CALDE {int(CALDE.sum())} · FREDDE {int((~CALDE).sum())}")

CMP = K.Componenti(n)
C = CMP(60)
M = K.costruisci(C, {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, wc=0.60, beta=0.50)
print(f"grafo canonico ({time.time()-t0:.0f}s)", flush=True)

EC = np.zeros((n, len(US)), np.float32)
EC[US, np.arange(len(US))] = 1.0
XC = K.rwr(M, EC, alpha=0.70)
XC[US, np.arange(len(US))] = -1e9
Rs = K.ranghi(XC)
print(f"camminata fatta ({time.time()-t0:.0f}s)", flush=True)

VET = CMP.vettori_normalizzati()
Badj = K.normalizza(C["B"] + C["B"].T)

TEACHER = {
    "metadati (Kc)": VET["Kc"] @ VET["Kc"][US].T,
    "CFst": VET["CFst"] @ VET["CFst"][US].T,
    "co-visione": np.asarray(Badj[US].todense()).T,
    "metadati+CFst": 0.5 * (VET["Kc"] @ VET["Kc"][US].T) + 0.5 * (VET["CFst"] @ VET["CFst"][US].T),
}
rnd = np.random.default_rng(3)
CONTROLLI = {
    "INDICE (ctrl)": np.tile(np.arange(n, dtype=np.int32)[:, None], (1, len(US))),
    "CASUALE (ctrl)": np.tile(rnd.permutation(n).astype(np.int32)[:, None], (1, len(US))),
}


def misura(R, nome, maschera, larghezza=34):
    rk = R[BERS, COL][maschera[COL]]
    out = {N: 100 * float((rk < N).mean()) for N in (10, 50, 100, 500)}
    print(f"  {nome:<{larghezza}} " + " · ".join(f"@{N} {v:6.2f}%" for N, v in out.items()), flush=True)
    return out


# --- la verifica che OGNI teacher copra OGNI sorgente della popolazione ---
print("")
print("=" * 100)
print("COPERTURA DEI TEACHER (norma del vettore della sorgente)")
print("=" * 100)
print(f"  {'teacher':<20} {'zero su CALDE':>14} {'zero su FREDDE':>15}   (dev'essere 0 e 0)")
for nome, T in TEACHER.items():
    nn = np.linalg.norm(T, axis=0)
    print(f"  {nome:<20} {int((nn[CALDE]==0).sum()):>6}/{int(CALDE.sum()):<7} "
          f"{int((nn[~CALDE]==0).sum()):>6}/{int((~CALDE).sum()):<8}")

for pop, maschera in (("CALDE (83) — il titolo e' gia' nel mondo curato", CALDE),
                      ("FREDDE (163) — cold start vero", ~CALDE)):
    print("")
    print("=" * 100)
    print(f"{pop}")
    print("=" * 100)
    misura(Rs, "camminata sola", maschera)
    print("  --- teacher da soli ---")
    for nome, T in TEACHER.items():
        misura(K.ranghi(T), f"teacher solo — {nome}", maschera)
    for nome, T in CONTROLLI.items():
        misura(T, f"teacher solo — {nome}", maschera)
    print("  --- fusioni ---")
    for nome, T in TEACHER.items():
        Rk = K.ranghi(T)
        for k0 in (60, 3000):
            misura(K.ranghi(3.0 / (k0 + Rs) + 0.5 / (k0 + Rk)), f"RRF +{nome} k={k0}", maschera)
    for nome, T in CONTROLLI.items():
        Rk = K.ranghi(T) if T.dtype != np.int32 else T
        misura(K.ranghi(3.0 / (3000 + Rs) + 0.5 / (3000 + Rk)), f"RRF +{nome} k=3000", maschera)

print(f"\n({time.time()-t0:.0f}s)")
