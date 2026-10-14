"""verifica-popolare.py — LA BASELINE «POPOLARITA'» ARCHIVIATA ERA INVERTITA?

In `temporale.py` la baseline si costruisce cosi':

    pop = np.argsort(np.argsort(votes))
    ...   K.recall_catalogo(K.ranghi(np.tile(pop[:, None], ...)), ...)

`np.argsort(np.argsort(v))` da' il rango ASCENDENTE: rango 0 al valore piu' PICCOLO, cioe' al titolo
MENO votato. E `K.ranghi(S)` assegna il rango 0 al valore piu' GRANDE di S. La catena prende come
«primi N» i titoli con `pop` piu' piccolo = i **meno votati**.

Cioe': quella che nei report 68 e 69 e' chiamata «popolarita'» sarebbe la baseline **ANTI-popolare**.
E' un claim importante — «sul catalogo serie il grafo non batte la popolarita' al @10» e' finito
nella specifica — quindi va misurato, non dedotto.

Qui si misurano ENTRAMBE le baseline sulle stesse teste d'oro, senza costruire nessun grafo.

NOTA su un errore che ho fatto scrivendo questo script: al primo giro confrontavo i titoli d'oro con
`np.searchsorted` sull'insieme dei primi 500. Ma `searchsorted` NON dice se un elemento e' presente:
restituisce la posizione di inserimento, che sta in [0, 500] anche per un titolo assente — e il
risultato erano «95%» e «100%», cioe' impossibile. Qui i ranghi si calcolano per intero.
"""
import glob, json, pathlib, sys, time
import numpy as np
import pandas as pd

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

GIORNO = 86_400
NS = (10, 100, 500)
ESCLUSO = np.int64(2 ** 40)
t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
voti = K.voti()
uscite = np.load(K.ML / "uscite.npz")["giorni"]

print("=" * 100)
print("LA PROVA CHE `argsort(argsort())` E' ASCENDENTE")
print("=" * 100)
v = np.array([3.0, 1.0, 2.0])
print(f"  valori {v} -> argsort(argsort(v)) = {np.argsort(np.argsort(v))}  "
      f"(al 3,0 tocca 2, cioe' l'ULTIMO posto: il rango 0 e' il piu' PICCOLO)")
print("  e `K.ranghi` assegna 0 al valore piu' GRANDE: la catena prende i MENO votati")


def ordine_popolare(ascendente):
    """Il rango di ogni titolo per numero di voti: 0 = il primo servito."""
    v2 = np.where(~is_tv, np.asarray(voti, np.float64), -np.inf)
    o = np.argsort(v2 if ascendente else -v2, kind="stable")
    R = np.empty(n, np.int64)
    R[o] = np.arange(n, dtype=np.int64)
    return R


def recall_con(Rbase, gold_list, escl_per_utente, semi_list, idx_cat):
    """La recall a @N della classifica fissa `Rbase`, per utente, sul catalogo `idx_cat`."""
    in_cat = np.zeros(n, bool)
    in_cat[idx_cat] = True
    base = np.where(in_cat, Rbase, ESCLUSO)          # il filtro di catalogo, calcolato una volta
    m = np.zeros(len(NS), np.float64)
    den = 0
    for j, g in enumerate(gold_list):
        s = base.copy()
        s[escl_per_utente[j]] = ESCLUSO
        s[semi_list[j]] = ESCLUSO
        o = np.argsort(s, kind="stable")
        rank = np.empty(n, np.int64)
        rank[o] = np.arange(n, dtype=np.int64)
        gg = np.fromiter(g, np.int64, len(g))
        rk = rank[gg]
        for i, N in enumerate(NS):
            m[i] += float((rk < N).sum())
        den += len(g)
    return {N: 100 * m[i] / max(den, 1) for i, N in enumerate(NS)}


# ---------------------------------------------------------------- MovieLens (film)
print("")
print("=" * 100)
print("1. MOVIELENS — banco temporale, catalogo FILM")
print("=" * 100)
RR = pd.read_parquet(K.ML / "tempi-ml.parquet")
GOLD, SEMI, ESCL = [], [], []
for u, g in RR.groupby("userId"):
    g = g.sort_values("timestamp")
    righe = g["row"].values.astype(np.int64)
    ts = g["timestamp"].values.astype(np.int64)
    if len(righe) < 20:
        continue
    t = int(0.6 * len(righe))
    SEMI.append(righe[:t])
    GOLD.append(set(righe[t:].tolist()))
    ESCL.append(np.unique(righe[uscite[righe] > ts[-1] // GIORNO]))
print(f"  {len(GOLD)} utenti · {sum(len(g) for g in GOLD):,} titoli d'oro")
idx_f = np.where(~is_tv)[0]
for et, asc in (("popolarita' VERA (piu' votati primi)", False),
                ("ANTI-popolare (meno votati primi)", True)):
    d = recall_con(ordine_popolare(asc), GOLD, ESCL, SEMI, idx_f)
    print(f"  {et:<34} " + " · ".join(f"@{N} {d[N]:6.2f}%" for N in NS))

# ---------------------------------------------------------------- Trakt (serie)
print("")
print("=" * 100)
print("2. TRACK — banco temporale, catalogo SERIE")
print("=" * 100)


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


G2, S2 = [], []
for f in sorted(glob.glob(str(K.TK / "movie-*.json"))):
    u = pathlib.Path(f).stem[6:]
    fm = leggi_datati(f, "movie")
    sr = leggi_datati(K.TK / f"show-{u}.json", "show")
    if len(fm) < 20 or len(sr) < 10:
        continue
    rs = sorted((row_of[f"tv:{t}"], d) for t, d in sr if f"tv:{t}" in row_of)
    if len(rs) < 10:
        continue
    t = int(0.6 * len(rs))
    S2.append(np.array([r for r, _ in rs[:t]]))
    G2.append(set(r for r, _ in rs[t:]))
print(f"  {len(G2)} utenti · {sum(len(g) for g in G2):,} titoli d'oro (serie)")
idx_s = np.where(is_tv)[0]
for et, asc in (("popolarita' VERA (piu' votati primi)", False),
                ("ANTI-popolare (meno votati primi)", True)):
    d = recall_con(ordine_popolare(asc), G2, [np.array([], np.int64)] * len(G2), S2, idx_s)
    print(f"  {et:<34} " + " · ".join(f"@{N} {d[N]:6.2f}%" for N in NS))
print("")
print("  Riferimento archiviato (report 69, temporale, catalogo serie):")
print("    camminata 2,07 / 13,62 / 38,59   ·   «popolarita'» 2,13 / 12,51 / 33,27")
print(f"\nFINE ({time.time()-t0:.0f}s)")
