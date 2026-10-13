"""ordine-serie-temporale.py — L'ORDINAMENTO DEL CATALOGO SERIE, VALUTATO ONESTAMENTE.

Il report 68 ha mostrato che con lo split temporale la camminata del catalogo serie PERDE contro
la popolarita' (1,98% contro 2,13% al @10). L'ordinamento del report 63/65 era misurato in
CASUALE, dove il modello faceva 5,23% contro l'attivazione 1,87%.

La domanda che decide tutto: **con l'oro nel futuro, il modello batte la popolarita'?**

Protocollo: profilo = il 60% PIU' VECCHIO della cronologia, oro = il 40% PIU' RECENTE.
Ricetta minima: CFst + B a pesi uguali, k=30, beta=0,25, senza curatela.
Modello addestrato su meta' utenti, verificato sull'altra meta'.
"""
import glob, json, pathlib, sys, time
import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
z = np.load(K.ML / "spazi-trakt.npz", allow_pickle=True)
anno = z["year"].astype(np.float32)
votes = z["votes"].astype(np.float32)


def leggi_datati(percorso, chiave):
    try:
        d = json.loads(pathlib.Path(percorso).read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(d, list):
        return []
    out = []
    for v in d:
        o = v.get(chiave) or {}
        t = (o.get("ids") or {}).get("tmdb")
        dt = v.get("last_watched_at") or ""
        if t and dt:
            out.append((int(t), dt))
    return out


UT = {}
for f in sorted(glob.glob(str(K.TK / "movie-*.json"))):
    u = pathlib.Path(f).stem[6:]
    fm = leggi_datati(f, "movie")
    sr = leggi_datati(K.TK / f"show-{u}.json", "show")
    if len(fm) >= 20 and len(sr) >= 10:
        UT[u] = (fm, sr)

CASI = []
for u in sorted(UT):
    fm, sr = UT[u]
    rs = sorted((row_of[f"tv:{t}"], dt) for t, dt in sr if f"tv:{t}" in row_of)
    if len(rs) < 10:
        continue
    t = int(0.6 * len(rs))
    ps = np.array([r for r, _ in rs[:t]])
    gs = set(r for r, _ in rs[t:])
    if not gs:
        continue
    CASI.append((ps, gs))
print(f"banco TEMPORALE (serie): {len(CASI)} utenti ({time.time()-t0:.0f}s)")

CMP = K.Componenti(n)
C = CMP(30)
M = K.costruisci(C, {"CFst": 1, "B": 1}, wc=0.0, beta=0.25)
VET = CMP.vettori_normalizzati()
gr = np.asarray((M > 0).sum(1)).ravel().astype(np.float32)
al = json.loads((K.ML / "albero.json").read_text(encoding="utf-8"))
foglia = np.full(n, -1, np.int64)
for f in al["foglie"]:
    for kk in f["members"]:
        r = row_of.get(kk)
        if r is not None:
            foglia[r] = f["id"]
maxf = int(foglia.max()) + 1
dim_fog = np.bincount(foglia[foglia >= 0], minlength=maxf).astype(np.float32)
n_curati = np.asarray((C["K"] > 0).sum(1)).ravel().astype(np.float32)
pct_pop = np.argsort(np.argsort(votes)).astype(np.float32) / n
Badj, Temi = C["B"], C["T"]
print(f"grafo pronto ({time.time()-t0:.0f}s)", flush=True)

CESTONE = 500
COLS = ["att", "pop", "voto", "cos_prof", "st_cent", "st_voti", "temi", "covis",
        "toccata", "dim_fog", "grado", "anno", "curati"]
ACC = {c: [] for c in ["colpito", "split"] + COLS}
for iu, (ps, gs) in enumerate(CASI):
    E = np.zeros((n, 1), np.float32)
    E[ps, 0] = 1.0
    X = K.rwr(M, E, alpha=0.30)
    X[ps, 0] = -1e9
    cest = np.argpartition(-X[:, 0], CESTONE)[:CESTONE]
    cest = cest[np.argsort(-X[cest, 0])]
    cen = VET["Kc"][ps].sum(0)
    cen = cen / (np.linalg.norm(cen) + 1e-9)
    stc = VET["CFst"][ps].sum(0)
    stc = stc / (np.linalg.norm(stc) + 1e-9)
    tem = np.asarray(Temi[ps].sum(0)).ravel()
    tem = tem / (np.linalg.norm(tem) + 1e-9)
    occ = np.bincount(foglia[ps], minlength=maxf)
    anni = np.median(anno[ps][anno[ps] > 0]) if (anno[ps] > 0).any() else 0.0
    inprof = np.zeros(n, bool)
    inprof[ps] = True
    m = len(cest)
    ACC["colpito"].append(np.fromiter((1 if c in gs else 0 for c in cest), np.int8, m))
    ACC["split"].append(np.full(m, 0 if iu < len(CASI) // 2 else 1, np.int8))
    for col, arr in (("att", X[cest, 0]), ("pop", pct_pop[cest]), ("voto", votes[cest]),
                     ("cos_prof", VET["Kc"][cest] @ cen),
                     ("st_cent", VET["CFst"][cest] @ stc),
                     ("st_voti", (VET["CFst"][cest] @ VET["CFst"][ps].T > 0.35).sum(1)),
                     ("temi", np.asarray(Temi[cest].dot(tem)).ravel()),
                     ("covis", np.asarray((Badj[cest] > 0).dot(inprof.astype(np.float32))).ravel()),
                     ("toccata", occ[foglia[cest]]), ("dim_fog", dim_fog[foglia[cest]]),
                     ("grado", gr[cest]), ("anno", np.abs(anno[cest] - anni)),
                     ("curati", n_curati[cest])):
        ACC[col].append(np.asarray(arr, np.float32).ravel())
    if (iu + 1) % 300 == 0:
        print(f"  {iu+1}/{len(CASI)} ({time.time()-t0:.0f}s)", flush=True)

DF = pd.DataFrame({c: np.concatenate(ACC[c]) for c in ["colpito", "split"] + COLS})
print(f"righe {len(DF):,} · colpi {int(DF.colpito.sum()):,} ({100*DF.colpito.mean():.2f}%)")
NS = (10, 100, 500)


def valuta(sc, etichetta, split):
    tot = 0
    hit = {N: 0 for N in NS}
    for iu, (ps, gs) in enumerate(CASI):
        s = 0 if iu < len(CASI) // 2 else 1
        if s != split:
            continue
        tot += len(gs)
        a = iu * CESTONE
        colpito = DF["colpito"].values[a:a + CESTONE]
        for N in NS:
            hit[N] += int(colpito[np.argsort(-sc[a:a + CESTONE])[:N]].sum())
    out = {N: 100 * hit[N] / max(tot, 1) for N in NS}
    print(f"  {etichetta:<32} " + " · ".join(f"@{N} {v:6.2f}%" for N, v in out.items()), flush=True)
    return out


print("")
print("=" * 100)
print("CATALOGO SERIE, SPLIT TEMPORALE — utenti di VERIFICA")
print("=" * 100)
RIS = {}
RIS["popolarita'"] = valuta(DF["pop"].values, "POPOLARITA' (l'ancora)", 1)
RIS["attivazione"] = valuta(DF["att"].values, "attivazione", 1)
RIS["oracolo"] = valuta(DF["colpito"].values, "ORACOLO del cesto", 1)
for f in ("covis", "st_cent", "cos_prof"):
    RIS[f"una sola: {f}"] = valuta(DF[f].values, f"una sola caratteristica: {f}", 1)

from sklearn.ensemble import HistGradientBoostingClassifier

Xc = DF[COLS].values.astype(np.float32)
y = DF["colpito"].values
mC = (DF.split == 0).values
mV = (DF.split == 1).values
mod = HistGradientBoostingClassifier(max_iter=200, random_state=0)
mod.fit(Xc[mC], y[mC])
sc = np.zeros(len(DF))
sc[mC] = mod.predict_proba(Xc[mC])[:, 1]
sc[mV] = mod.predict_proba(Xc[mV])[:, 1]
RIS["modello"] = valuta(sc, "MODELLO (13 caratteristiche)", 1)
valuta(sc, "MODELLO (calibrazione)", 0)

print("")
print("=" * 100)
print("IL VERDETTO")
print("=" * 100)
m, p, o = RIS["modello"], RIS["popolarita'"], RIS["oracolo"]
for N in NS:
    print(f"  @{N:<4} popolarita' {p[N]:6.2f}% · modello {m[N]:6.2f}% · "
          f"modello/popolarita' {m[N]/max(p[N],1e-9):5.2f}x · modello/oracolo "
          f"{100*m[N]/max(o[N],1e-9):5.1f}%")
print("")
if m[10] > p[10]:
    print("  -> IL MODELLO BATTE LA POPOLARITA' anche in temporale. Il lavoro sull'ordinamento ha valore.")
else:
    print("  -> IL MODELLO NON BATTE LA POPOLARITA' al @10. Il lavoro sull'ordinamento va ripensato.")
print(f"\n({time.time()-t0:.0f}s)")
