"""ordine-serie.py — L'ORDINAMENTO DEL CATALOGO SERIE, CHE NON E' MAI STATO FATTO.

Il catalogo serie e' meta' prodotto e non ha nessun ordinamento: il modello del catalogo film
(report 52) e' addestrato sul comportamento MovieLens, che per le serie NON ESISTE — `CF` copre
49.041 film e zero serie. Quindi le caratteristiche comportamentali vanno sostituite con quelle
del pubblico PREVISTO (`CFst`).

Banco: cronologie Trakt, utenti con >=20 film e >=10 serie, split 60/40 (rng 13). Il catalogo
serie si misura DENTRO le serie.

Caratteristiche, tutte serie-specifiche:
  att      il punteggio della camminata
  att_st   la camminata su un grafo di SOLO CFst (il pubblico previsto)
  pop      il percentile di popolarita'
  voto     il voto medio
  cos_prof la similarita' dei metadati col centroide del profilo
  st_cent  la similarita' di CFst col centroide del profilo
  st_voti  quanti vicini CFst sopra 0,35 cadono nel profilo
  temi     la similarita' dei temi col profilo
  covis    quanti vicini di co-visione cadono nel profilo
  toccata  quanti titoli del profilo stanno nella stessa foglia
  dim_fog  la dimensione della foglia
  grado    il grado nel grafo
  anno     la distanza dall'anno mediano del profilo
  curati   quanti legami di curatela ha il candidato

Modello: HistGradientBoostingClassifier, addestrato su meta' utenti e verificato sull'altra
meta'. Si confronta con l'attivazione, la popolarita', e l'ORACOLO dello stesso cesto.
"""
import glob, json, pathlib, sys, time
import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_TV = np.where(is_tv)[0]
print(f"titoli: {n:,} · serie: {len(IDX_TV):,}")

z = np.load(K.ML / "spazi-trakt.npz", allow_pickle=True)
anno = z["year"].astype(np.float32)
votes = z["votes"].astype(np.float32)

CASI = K.banco_trakt(row_of)
print(f"utenti del banco: {len(CASI)} ({time.time()-t0:.0f}s)")

CMP = K.Componenti(n)
C = CMP(60)
PESI = {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}
M = K.costruisci(C, PESI, wc=0.60, beta=0.50)
M_st = K.costruisci(C, {"CFst": 1}, wc=0.0, beta=0.50)   # solo il pubblico previsto
print(f"grafi pronti ({time.time()-t0:.0f}s)", flush=True)

VET = CMP.vettori_normalizzati()
Badj = C["B"]
Temi = C["T"]
grado = np.asarray((M > 0).sum(1)).ravel().astype(np.float32)
n_curati = np.asarray((C["K"] > 0).sum(1)).ravel().astype(np.float32)
pct_pop = np.argsort(np.argsort(votes)).astype(np.float32) / n

# la foglia di appartenenza
al = json.loads((K.ML / "albero.json").read_text(encoding="utf-8"))
foglia = np.full(n, -1, np.int64)
for f in al["foglie"]:
    for kk in f["members"]:
        r = row_of.get(kk)
        if r is not None:
            foglia[r] = f["id"]
maxf = int(foglia.max()) + 1
dim_fog = np.bincount(foglia[foglia >= 0], minlength=maxf).astype(np.float32)

CESTONE = 500
COLS = ["att", "att_st", "pop", "voto", "cos_prof", "st_cent", "st_voti", "temi", "covis",
        "toccata", "dim_fog", "grado", "anno", "curati"]
ACC = {c: [] for c in ["colpito", "split", "pos_att"] + COLS}
print("estrazione ...", flush=True)

for iu, caso in enumerate(CASI):
    ps, gs = caso["ps"], caso["gs"]
    E = np.zeros((n, 1), np.float32)
    E[ps, 0] = 1.0
    X = K.rwr(M, E, alpha=0.30)
    X[ps, 0] = -1e9
    Y = K.rwr(M_st, E, alpha=0.30)
    Y[ps, 0] = -1e9
    cest = np.argpartition(-X[:, 0], CESTONE)[:CESTONE]
    cest = cest[np.argsort(-X[cest, 0])]

    cen = VET["Kc"][ps].sum(0)
    cen = cen / (np.linalg.norm(cen) + 1e-9)
    stc = VET["CFst"][ps].sum(0)
    stc = stc / (np.linalg.norm(stc) + 1e-9)
    tem = Temi[ps].sum(0)
    tem = np.asarray(tem).ravel()
    tem = tem / (np.linalg.norm(tem) + 1e-9)
    occ = np.bincount(foglia[ps], minlength=maxf)
    anni = np.median(anno[ps][anno[ps] > 0]) if (anno[ps] > 0).any() else 0.0
    inprof = np.zeros(n, bool)
    inprof[ps] = True

    m = len(cest)
    ACC["colpito"].append(np.fromiter((1 if c in gs else 0 for c in cest), np.int8, m))
    ACC["split"].append(np.full(m, 0 if iu < len(CASI) // 2 else 1, np.int8))
    ACC["pos_att"].append(np.arange(m, dtype=np.int32))
    st_sim = VET["CFst"][cest] @ stc
    tem_sim = np.asarray(Temi[cest].dot(tem)).ravel()
    covis = np.asarray((Badj[cest] > 0).dot(inprof.astype(np.float32))).ravel()
    for col, arr in (("att", X[cest, 0]), ("att_st", Y[cest, 0]), ("pop", pct_pop[cest]),
                     ("voto", votes[cest]), ("cos_prof", VET["Kc"][cest] @ cen),
                     ("st_cent", st_sim),
                     ("st_voti", (VET["CFst"][cest] @ VET["CFst"][ps].T > 0.35).sum(1)),
                     ("temi", tem_sim), ("covis", covis),
                     ("toccata", occ[foglia[cest]]), ("dim_fog", dim_fog[foglia[cest]]),
                     ("grado", grado[cest]), ("anno", np.abs(anno[cest] - anni)),
                     ("curati", n_curati[cest])):
        ACC[col].append(np.asarray(arr, np.float32).ravel())
    if (iu + 1) % 100 == 0:
        print(f"  {iu+1}/{len(CASI)} ({time.time()-t0:.0f}s)", flush=True)

DF = pd.DataFrame({c: np.concatenate(ACC[c]) for c in ["colpito", "split", "pos_att"] + COLS})
print(f"righe {len(DF):,} · colpi {int(DF.colpito.sum()):,} ({100*DF.colpito.mean():.2f}%)")

# --- l'oracolo: quanto si puo' prendere restando nello stesso cesto ---
DEN = {0: 0, 1: 0}
for iu, caso in enumerate(CASI):
    s = 0 if iu < len(CASI) // 2 else 1
    DEN[s] += len(caso["gs"])
print(f"  denominatore calib {DEN[0]} · verifica {DEN[1]}")


def valuta(sc, nome, split):
    tot = 0
    hit = {10: 0, 100: 0, 500: 0}
    for iu, caso in enumerate(CASI):
        s = 0 if iu < len(CASI) // 2 else 1
        if s != split:
            continue
        tot += len(caso["gs"])
        a = iu * CESTONE
        colpito = DF["colpito"].values[a:a + CESTONE]
        for N in (10, 100, 500):
            ordine = np.argsort(-sc[a:a + CESTONE])[:N]
            hit[N] += int(colpito[ordine].sum())
    out = {N: 100 * hit[N] / max(tot, 1) for N in (10, 100, 500)}
    print(f"  {nome:<34} " + " · ".join(f"@{N} {v:6.2f}%" for N, v in out.items()), flush=True)
    return out


print("")
print("=" * 96)
print("ORDINAMENTO DEL CATALOGO SERIE — calibrazione")
print("=" * 96)
valuta(DF["att"].values, "attivazione (com'e' ora)", 0)
valuta(DF["att_st"].values, "attivazione sul solo CFst", 0)
valuta(DF["pop"].values, "popolarita'", 0)
valuta(DF["att"].values * 0 + DF["colpito"].values, "ORACOLO dello stesso cesto", 0)

from sklearn.ensemble import HistGradientBoostingClassifier

FEAT = COLS
Xc = DF[FEAT].values.astype(np.float32)
y = DF["colpito"].values
mC = (DF.split == 0).values
mV = (DF.split == 1).values

mod = HistGradientBoostingClassifier(max_iter=200, random_state=0)
mod.fit(Xc[mC], y[mC])
sc = np.zeros(len(DF))
sc[mC] = mod.predict_proba(Xc[mC])[:, 1]
sc[mV] = mod.predict_proba(Xc[mV])[:, 1]

print("")
print("=" * 96)
print("ORDINAMENTO DEL CATALOGO SERIE — il modello")
print("=" * 96)
valuta(sc, "GBM (200 alberi, 14 caratteristiche)", 0)
print("")
print("  --- VERIFICA (utenti che il modello non ha visto) ---")
valuta(DF["att"].values, "attivazione (com'e' ora)", 1)
valuta(DF["att_st"].values, "attivazione sul solo CFst", 1)
valuta(DF["pop"].values, "popolarita'", 1)
valuta(sc, "GBM", 1)

print("")
print("  --- quali caratteristiche contano (importanza per permutazione, split di calib) ---")
base = valuta(sc, "  (riferimento)", 0)[100]
imp = []
for j, f in enumerate(FEAT):
    Xp = Xc.copy()
    Xp[:, j] = np.random.default_rng(0).permutation(Xp[:, j])
    s2 = np.zeros(len(DF))
    s2[mC] = mod.predict_proba(Xp[mC])[:, 1]
    imp.append((f, base - valuta(s2, f"  senza {f}", 0)[100]))
imp.sort(key=lambda x: -x[1])
for f, d in imp[:8]:
    print(f"    {f:<12} {-d:+6.2f} punti al @100")
print(f"\n({time.time()-t0:.0f}s)")
