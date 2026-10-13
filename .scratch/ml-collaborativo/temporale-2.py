"""temporale-2.py — lo split temporale con la B NUOVA (related di tutte le serie): LA DOMANDA VERA DEL PRODOTTO.

Tutte le misure della sessione usano uno split CASUALE: il profilo e' un 60% a caso della
cronologia, l'oro il 40% rimasto. Ma il prodotto non chiede "cosa ho gia' visto", chiede
**"cosa guardero' dopo"**. E le date ci sono, sia su Trakt (`last_watched_at`, 100%) sia su
MovieLens (il timestamp nel ratings.csv grezzo, buttato via nella pulizia).

Qui si rifa' la misura con lo split temporale — profilo = il 60% PIU' VECCHIO, oro = il 40%
PIU' RECENTE — e si confronta con lo split casuale sugli stessi utenti.

Ci si aspetta un crollo: con l'oro nel futuro, i titoli d'oro sono piu' POPOLARI (la gente guarda
le uscite nuove), quindi la popolarita' sale e il vantaggio del grafo scende.

LIMITE DICHIARATO: il grafo e' costruito su utenti DISGIUNTI ma con le loro cronologie COMPLETE,
quindi "conosce il futuro" del catalogo. Un test temporale vero dovrebbe ricostruire il grafo a
tempo T. Qui si misura solo l'effetto sullo split.
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]

CMP = K.Componenti(n)
C = CMP(30)
MF = K.costruisci(C, {"CF": 1}, wc=0.0, beta=0.25)
MS = K.costruisci(C, {"CFst": 1, "B": 1}, wc=0.0, beta=0.25)
print(f"grafi pronti ({time.time()-t0:.0f}s)", flush=True)

z = np.load(K.ML / "spazi-trakt.npz", allow_pickle=True)
votes = z["votes"].astype(np.float32)
pop = np.argsort(np.argsort(votes)).astype(np.float32)


# ============================================================ 1. TRACT, SPLIT TEMPORALE
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


import glob
UT = {}
for f in sorted(glob.glob(str(K.TK / "movie-*.json"))):
    u = pathlib.Path(f).stem[6:]
    fm = leggi_datati(f, "movie")
    sr = leggi_datati(K.TK / f"show-{u}.json", "show")
    if len(fm) >= 20 and len(sr) >= 10:
        UT[u] = (fm, sr)
print(f"utenti Trakt con date: {len(UT):,} ({time.time()-t0:.0f}s)")


def righe_di(voci, med):
    out = []
    for tid, dt in voci:
        r = row_of.get(f"{med}:{tid}")
        if r is not None:
            out.append((r, dt))
    return out


CASI_T = []
for u in sorted(UT):
    fm, sr = UT[u]
    rf = righe_di(fm, "movie")
    rs = righe_di(sr, "tv")
    if len(rf) < 20 or len(rs) < 10:
        continue
    rf.sort(key=lambda x: x[1])
    rs.sort(key=lambda x: x[1])
    tf = int(0.6 * len(rf))
    ts = int(0.6 * len(rs))
    pf = np.array([r for r, _ in rf[:tf]])
    gf = set(r for r, _ in rf[tf:])
    ps = np.array([r for r, _ in rs[:ts]])
    gs = set(r for r, _ in rs[ts:])
    if not gf or not gs:
        continue
    CASI_T.append((pf, gf, ps, gs))
print(f"banco temporale: {len(CASI_T)} utenti ({time.time()-t0:.0f}s)")

# lo stesso banco con split CASUALE, per confronto
rng = np.random.default_rng(13)
CASI_C = []
for u in sorted(UT):
    fm, sr = UT[u]
    rf = np.unique([r for r, _ in righe_di(fm, "movie")])
    rs = np.unique([r for r, _ in righe_di(sr, "tv")])
    if len(rf) < 20 or len(rs) < 10:
        continue
    def sp(a):
        p = rng.permutation(len(a))
        t = int(0.6 * len(a))
        return a[p[:t]], set(a[p[t:]].tolist())
    pf, gf = sp(rf)
    ps, gs = sp(rs)
    CASI_C.append((pf, gf, ps, gs))
print(f"banco casuale: {len(CASI_C)} utenti")


def attiva(M, semi_di, alpha=0.30, lotto=150):
    chiavi = list(semi_di)
    X = np.zeros((n, len(chiavi)), np.float32)
    for i in range(0, len(chiavi), lotto):
        ch = chiavi[i:i + lotto]
        E = np.zeros((n, len(ch)), np.float32)
        for j, u in enumerate(ch):
            E[semi_di[u], j] = 1.0
        Y = K.rwr(M, E, alpha)
        for j, u in enumerate(ch):
            Y[semi_di[u], j] = -1e9
        X[:, i:i + len(ch)] = Y
    return X, chiavi


def misura_banco(casi, etichetta):
    PF = {i: c[0] for i, c in enumerate(casi)}
    GF = {i: c[1] for i, c in enumerate(casi)}
    PS = {i: c[2] for i, c in enumerate(casi)}
    GS = {i: c[3] for i, c in enumerate(casi)}
    print("")
    print(f"  --- {etichetta} ({len(casi)} utenti) ---")
    Xf, chf = attiva(MF, PF)
    a = K.recall_catalogo(K.ranghi(Xf, ~is_tv), GF, chf, ~is_tv)
    K.stampa("camminata — catalogo FILM", a, 34)
    ap = K.recall_catalogo(K.ranghi(np.tile(pop[:, None], (1, len(chf)))), GF, chf, ~is_tv)
    K.stampa("popolarita' — catalogo FILM", ap, 34)
    del Xf
    Xs, chs = attiva(MS, PS)
    c = K.recall_catalogo(K.ranghi(Xs, is_tv), GS, chs, is_tv)
    K.stampa("camminata — catalogo SERIE", c, 34)
    cp = K.recall_catalogo(K.ranghi(np.tile(pop[:, None], (1, len(chs)))), GS, chs, is_tv)
    K.stampa("popolarita' — catalogo SERIE", cp, 34)
    return a, ap, c, cp


print("")
print("=" * 100)
print("1. TRACT — TEMPORALE CONTRO CASUALE")
print("=" * 100)
at, apt, ct, cpt = misura_banco(CASI_T, "SPLIT TEMPORALE (profilo = il 60% piu' vecchio)")
ac, apc, cc, cpc = misura_banco(CASI_C, "SPLIT CASUALE")

print("")
print("=" * 100)
print("COSA CAMBIA PASSANDO AL FUTURO")
print("=" * 100)
print(f"  {'':<34} {'@10':>8} {'@100':>8} {'@500':>8}")
for etichetta, (t_, c_) in (("TRACK film — camminata", (at, ac)),
                            ("TRACK film — popolarita'", (apt, apc)),
                            ("TRACK serie — camminata", (ct, cc)),
                            ("TRACK serie — popolarita'", (cpt, cpc)),
                            ("MOVIELENS — camminata", (ap_t, ap_c)),
                            ("MOVIELENS — popolarita'", (app_t, app_c))):
    print(f"  {etichetta:<34} {t_[10]-c_[10]:>+8.2f} {t_[100]-c_[100]:>+8.2f} {t_[500]-c_[500]:>+8.2f}")
print(f"\n({time.time()-t0:.0f}s)")
