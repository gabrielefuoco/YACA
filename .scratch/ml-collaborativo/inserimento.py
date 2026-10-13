"""inserimento.py — DOVE METTO UN TITOLO NUOVO? (via B)

La richiesta dell'utente: «il sistema dovrebbe essere così robusto da permettere di inserire
nuove serie/film e metterli nel punto giusto del grafo», senza curatela manuale.

PREMESSA CHE CAMBIA IL TEST. Il grafo attuale E' GIA' il risultato di un inserimento via
metadati per il 96% del catalogo: solo 2.378 nodi su 66.259 hanno un legame scritto a mano.
Quindi la capacita' esiste — quello che non si sa e' **quanto e' buona** e **quale regola
mette il titolo nel posto giusto**.

Il test: si nascondono N titoli, si finge che siano nuovi (nessuna curatela, nessuna
co-visione: solo metadati) e si prova a collocarli con 5 regole diverse. Poi si misura
quanto ciascuna regola azzecca, con due riferimenti:
   - il NULLO: una foglia a caso
   - l'ORACOLO: la foglia che l'albero aveva davvero assegnato a quel titolo

MISURA DI "CI STA BENE": il coseno del titolo col centroide della foglia, espresso in
percentile rispetto ai membri gia' presenti. 50° = un membro tipico. Sotto il 10° = corpo estraneo.
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
NOME = sys.argv[1] if len(sys.argv) > 1 else "albero.json"
N_HOLD = int(sys.argv[2]) if len(sys.argv) > 2 else 2000

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

zt = np.load(ML / "temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n:
    T = T.T
Tn = T / (np.linalg.norm(T, axis=1, keepdims=True) + 1e-9)

al = json.loads((ML / NOME).read_text(encoding="utf-8"))
membri = {}
foglia = np.full(n, -1, np.int64)
for f in al["foglie"]:
    m = np.array([row_of[k] for k in f["members"] if k in row_of])
    membri[f["id"]] = m
    foglia[m] = f["id"]
ids = np.array(sorted(membri.keys()))
print(f"albero: {len(ids):,} foglie ({time.time()-t0:.0f}s)")

# centroidi delle foglie (contenuto)
CEN = {c: (Pcn[membri[c]].mean(0) / (np.linalg.norm(Pcn[membri[c]].mean(0)) + 1e-9)) for c in ids}
# quanti FILM ha ogni foglia (per la domanda cross-medium)
film_per = {c: int((~is_tv[membri[c]]).sum()) for c in ids}
serie_per = {c: int(is_tv[membri[c]].sum()) for c in ids}

rng = np.random.default_rng(31)
hold = rng.choice(n, size=N_HOLD, replace=False)
print(f"titoli nascosti: {len(hold):,} (film {int(np.sum(~is_tv[hold])):,} · serie {int(np.sum(is_tv[hold])):,})")

# --- le regole ---
def _plur(lab):
    v, c = np.unique(lab, return_counts=True)
    return [int(v[np.argmax(c)])]


def vicini(vs, idx, k=10):
    """solo la RIGA del titolo, non l'intera matrice (66k x 66k = 32 GB)"""
    sim = vs[idx] @ vs.T
    sim[idx] = -9
    return np.argsort(-sim)[:k]


CENM = np.array([CEN[c] for c in ids])          # (n_foglie x 64), per il centroide piu' vicino
NOMI = ["R1 vicino piu' stretto (k=1)",
        "R2 pluralita' dei 10 vicini di contenuto",
        "R3 centroide piu' vicino",
        "R4 pluralita' contenuto + temi",
        "NULLO foglia a caso",
        "ORACOLO (foglia dell'albero)"]
RIS = {nome: [] for nome in NOMI}
FIT = {nome: [] for nome in NOMI}
CROSS = {nome: [] for nome in NOMI}
for ii, t in enumerate(hold):
    nn_c = vicini(Pcn, t, 10)
    nn_t = vicini(Tn, t, 10)
    c_cen = int(ids[int(np.argmax(CENM @ Pcn[t]))])
    scelte = {
        "R1 vicino piu' stretto (k=1)": _plur(foglia[nn_c[:1]]),
        "R2 pluralita' dei 10 vicini di contenuto": _plur(foglia[nn_c]),
        "R3 centroide piu' vicino": [c_cen],
        "R4 pluralita' contenuto + temi": _plur(foglia[np.r_[nn_c, nn_t]]),
        "NULLO foglia a caso": [int(rng.choice(ids))],
        "ORACOLO (foglia dell'albero)": [int(foglia[t])],
    }
    for nome, (c,) in scelte.items():
        m = membri[c]
        altri = m[m != t]
        if len(altri) == 0:
            continue
        cos_t = float(Pcn[t] @ CEN[c])
        cos_m = Pcn[altri] @ CEN[c]
        perc = 100.0 * float((cos_m < cos_t).mean())
        RIS[nome].append(c)
        FIT[nome].append(perc)
        # il titolo nuovo entra in una foglia che ha film?
        CROSS[nome].append(1 if (film_per[c] > 0 if is_tv[t] else serie_per[c] > 0) else 0)
    if (ii + 1) % 500 == 0:
        print(f"  {ii+1}/{len(hold)} ({time.time()-t0:.0f}s)")

print("")
print("=" * 104)
print(f"COME SI COLLOCA UN TITOLO NUOVO — {len(hold):,} titoli nascosti, {len(ids):,} foglie")
print("=" * 104)
print(f"{'regola':<42} {'50°':>6} {'25°':>6} {'<10°':>7} {'=oracolo':>9} {'mista':>7}")
oracolo = np.array(RIS["ORACOLO (foglia dell'albero)"])
for nome in RIS:
    f = np.array(FIT[nome])
    xs = np.array(CROSS[nome])
    acc = 100 * float((np.array(RIS[nome]) == oracolo).mean()) if len(f) else 0
    print(f"{nome:<42} {np.median(f):>5.0f}° {np.percentile(f,25):>5.0f}° "
          f"{100*np.mean(f<10):>6.1f}% {acc:>8.1f}% {100*xs.mean():>6.1f}%")

print("")
print("  lettura: 'centroide 50°' = il titolo nuovo sta al centro della foglia come un membro tipico.")
print("  '<10°' = corpo estraneo, la foglia non lo contiene. 'foglia mista' = la foglia ha ENTRAMBI i medium.")

# per medium
print("")
print("=" * 104)
print("SE IL TITOLO NUOVO E' UNA SERIE (la meta' che non ha segnale comportamentale)")
print("=" * 104)
ser = np.array([is_tv[t] for t in hold])
print(f"{'regola':<40} {'serie: centroide 50°':>22} {'serie: foglia mista':>21} {'film: centroide 50°':>22}")
for nome in ("R2 pluralita' dei 10 vicini di contenuto", "R4 pluralita' contenuto + temi",
             "R3 centroide piu' vicino", "NULLO foglia a caso", "ORACOLO (foglia dell'albero)"):
    f = np.array(FIT[nome])
    xs = np.array(CROSS[nome])
    if ser.sum() == 0:
        continue
    print(f"{nome:<40} {np.median(f[ser]):>21.0f}° {100*xs[ser].mean():>20.1f}% {np.median(f[~ser]):>21.0f}°")
print(f"\n({time.time()-t0:.0f}s)")
