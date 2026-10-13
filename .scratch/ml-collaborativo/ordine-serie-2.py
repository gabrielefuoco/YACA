"""ordine-serie-2.py — L'ORDINAMENTO SERIE, RIFATTO COI PESI PER LE SERIE E CON LA FUSIONE.

Tre configurazioni, misurate nello stesso giro e con lo stesso split (meta' utenti per il
training, meta' per la verifica), cosi' il confronto e' interno:

  A) B1 CFst1, nessuna fusione      -> e' il riferimento del report 63 (5,27 / 23,18 in verifica)
  B) B5 CFst3, nessuna fusione      -> i pesi trovati dal report 64
  C) B5 CFst3, con la fusione       -> la camminata + il teacher dei metadati (report 60: +77% @10)

Per ognuna: l'attivazione, l'oracolo del cesto (quanto si puo' prendere restando nel cesto), e il
modello. Il teacher della fusione e' la similarita' dei metadati col centroide del profilo —
indipendente dalla curatela, quindi non ha l'artefatto del report 58.
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
z = np.load(K.ML / "spazi-trakt.npz", allow_pickle=True)
anno = z["year"].astype(np.float32)
votes = z["votes"].astype(np.float32)

CASI = K.banco_trakt(row_of)
print(f"utenti del banco: {len(CASI)} ({time.time()-t0:.0f}s)")

CMP = K.Componenti(n)
C = CMP(60)
VET = CMP.vettori_normalizzati()
grado = None
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
Badj = C["B"]
Temi = C["T"]
print(f"componenti pronti ({time.time()-t0:.0f}s)", flush=True)

CESTONE = 500
COLS = ["att", "att_w", "pop", "voto", "cos_prof", "st_cent", "st_voti", "temi", "covis",
        "toccata", "dim_fog", "grado", "anno", "curati"]

CONF = {
    "A) B1 CFst1, senza fusione": ({"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, False),
    "B) B5 CFst3, senza fusione": ({"CF": 5, "CFst": 3, "Kc": 1, "B": 5, "T": 1}, False),
    "C) B5 CFst3, CON la fusione": ({"CF": 5, "CFst": 3, "Kc": 1, "B": 5, "T": 1}, True),
}
NS = (10, 100, 500)
RIS = {}

for nome_conf, (pesi, usa_fusione) in CONF.items():
    print("")
    print("=" * 100)
    print(f"{nome_conf}   ({time.time()-t0:.0f}s)")
    print("=" * 100)
    M = K.costruisci(C, pesi, wc=0.60, beta=0.50)
    gr = np.asarray((M > 0).sum(1)).ravel().astype(np.float32)
    ACC = {c: [] for c in ["colpito", "split", "pos_att", "serie_vera"] + COLS}
    for iu, caso in enumerate(CASI):
        ps, gs = caso["ps"], caso["gs"]
        E = np.zeros((n, 1), np.float32)
        E[ps, 0] = 1.0
        X = K.rwr(M, E, alpha=0.30)
        X[ps, 0] = -1e9
        cen = VET["Kc"][ps].sum(0)
        cen = cen / (np.linalg.norm(cen) + 1e-9)
        # la fusione: camminata + teacher dei metadati
        S = X[:, 0].copy()
        if usa_fusione:
            Tt = VET["Kc"] @ cen
            Rt = np.empty(n, np.int32)
            Rt[np.argsort(-Tt)] = np.arange(n)
            Rw = np.empty(n, np.int32)
            Rw[np.argsort(-X[:, 0])] = np.arange(n)
            S = 3.0 / (3000 + Rw) + 0.5 / (3000 + Rt)
        cest = np.argpartition(-S, CESTONE)[:CESTONE]
        cest = cest[np.argsort(-S[cest])]

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
        ACC["pos_att"].append(np.arange(m, dtype=np.int32))
        ACC["serie_vera"].append(np.fromiter((1 if is_tv[c] else 0 for c in cest), np.int8, m))
        for col, arr in (("att", S[cest]), ("att_w", X[cest, 0]), ("pop", pct_pop[cest]),
                         ("voto", votes[cest]), ("cos_prof", VET["Kc"][cest] @ cen),
                         ("st_cent", VET["CFst"][cest] @ stc),
                         ("st_voti", (VET["CFst"][cest] @ VET["CFst"][ps].T > 0.35).sum(1)),
                         ("temi", np.asarray(Temi[cest].dot(tem)).ravel()),
                         ("covis", np.asarray((Badj[cest] > 0).dot(inprof.astype(np.float32))).ravel()),
                         ("toccata", occ[foglia[cest]]), ("dim_fog", dim_fog[foglia[cest]]),
                         ("grado", gr[cest]), ("anno", np.abs(anno[cest] - anni)),
                         ("curati", n_curati[cest])):
            ACC[col].append(np.asarray(arr, np.float32).ravel())
        if (iu + 1) % 120 == 0:
            print(f"  {iu+1}/{len(CASI)} ({time.time()-t0:.0f}s)", flush=True)

    DF = pd.DataFrame({c: np.concatenate(ACC[c]) for c in ["colpito", "split", "pos_att", "serie_vera"] + COLS})
    serie_vera = int(DF.serie_vera.sum())
    print(f"  righe {len(DF):,} · colpi {int(DF.colpito.sum()):,} · serie nel cesto {serie_vera:,} "
          f"({100*serie_vera/len(DF):.1f}%)")

    def valuta(sc, etichetta, split):
        tot = 0
        hit = {N: 0 for N in NS}
        for iu, caso in enumerate(CASI):
            s = 0 if iu < len(CASI) // 2 else 1
            if s != split:
                continue
            tot += len(caso["gs"])
            a = iu * CESTONE
            colpito = DF["colpito"].values[a:a + CESTONE]
            for N in NS:
                ordine = np.argsort(-sc[a:a + CESTONE])[:N]
                hit[N] += int(colpito[ordine].sum())
        out = {N: 100 * hit[N] / max(tot, 1) for N in NS}
        print(f"    {etichetta:<32} " + " · ".join(f"@{N} {v:6.2f}%" for N, v in out.items()), flush=True)
        return out

    valuta(DF["att"].values, "attivazione", 1)
    valuta(DF["colpito"].values, "ORACOLO del cesto", 1)
    valuta(DF["pop"].values, "popolarita'", 1)

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
    RIS[nome_conf] = valuta(sc, "MODELLO (verifica)", 1)
    valuta(sc, "MODELLO (calibrazione)", 0)

print("")
print("=" * 100)
print("IL CONFRONTO — catalogo serie, utenti di verifica")
print("=" * 100)
for k, v in RIS.items():
    print(f"  {k:<34} " + " · ".join(f"@{N} {v[N]:6.2f}%" for N in NS))
print("")
print(f"  riferimento del report 63 (A, senza pesi per le serie):  @10 5,27% · @100 23,18%")
print(f"\n({time.time()-t0:.0f}s)")
