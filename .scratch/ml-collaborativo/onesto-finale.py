"""onesto-finale.py — LA MISURA CHE CONTA: NUOVO CONTRO VECCHIO, ENTRAMBI IN TEMPORALE.

Tutte le misure della sessione confrontano la ricetta nuova con SÉ STESSA (ablation, pesi, k, beta).
Il confronto con **il sistema che gira oggi** esiste solo in split CASUALE — dove tutto e' gonfiato.

Qui si misura:
  VECCHIO = il grafo di oggi: contenuto contaminato (Pc) + co-visione + temi + curatela, pesi 0,88/0,25
  NUOVO   = la ricetta minima: CF da solo (film) · CFst+B (serie), senza curatela, k=30, beta=0,25
su tre banchi, in split TEMPORALE e in CASUALE, piu' la POPOLARITA' come ancora.

Questa e' la risposta a "quanto abbiamo guadagnato davvero".
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
ML = K.ML
CMP = K.Componenti(n)
C30 = CMP(30)
print(f"componenti k=30 pronti ({time.time()-t0:.0f}s)", flush=True)

# --- il grafo di OGGI: contenuto contaminato + co-visione + temi + curatela ---
Cpc = K.carica_csr("boot-C.npz", n)
B_old = K.carica_csr("boot-B-3k.npz", n)      # la co-visione dei 3.000, quella di allora
Tm = C30["T"]
Kp = C30["K"]
WT, WC = 0.25, 0.88
M_VECCHIO = K.normalizza((1 - WC) * (1 - WT) * (0.5 * Cpc + 0.5 * B_old) + (1 - WC) * WT * Tm + WC * Kp)
M_NUOVO_F = K.costruisci(C30, {"CF": 1}, wc=0.0, beta=0.25)
M_NUOVO_S = K.costruisci(C30, {"CFst": 1, "B": 1}, wc=0.0, beta=0.25)
print(f"grafi pronti ({time.time()-t0:.0f}s)", flush=True)

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
votes = z["votes"].astype(np.float32)
pop = np.argsort(np.argsort(votes)).astype(np.float32)


def leggi_datati(p, ch):
    try:
        d = json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(d, list):
        return []
    return [(int((v.get(ch) or {}).get("ids", {}).get("tmdb")), v.get("last_watched_at") or "")
            for v in d if (v.get(ch) or {}).get("ids", {}).get("tmdb")]


import glob
UT = {}
for f in sorted(glob.glob(str(K.TK / "movie-*.json"))):
    u = pathlib.Path(f).stem[6:]
    fm = leggi_datati(f, "movie")
    sr = leggi_datati(K.TK / f"show-{u}.json", "show")
    if len(fm) >= 20 and len(sr) >= 10:
        UT[u] = (fm, sr)


def banco_temporale():
    casi = []
    for u in sorted(UT):
        fm, sr = UT[u]
        rf = sorted((row_of[f"movie:{t}"], d) for t, d in fm if f"movie:{t}" in row_of and d)
        rs = sorted((row_of[f"tv:{t}"], d) for t, d in sr if f"tv:{t}" in row_of and d)
        if len(rf) < 20 or len(rs) < 10:
            continue
        tf, ts = int(0.6 * len(rf)), int(0.6 * len(rs))
        casi.append((np.array([r for r, _ in rf[:tf]]), set(r for r, _ in rf[tf:]),
                     np.array([r for r, _ in rs[:ts]]), set(r for r, _ in rs[ts:])))
    return casi


def banco_casuale():
    rng = np.random.default_rng(13)
    casi = []
    for u in sorted(UT):
        fm, sr = UT[u]
        rf = np.unique([row_of[f"movie:{t}"] for t, _ in fm if f"movie:{t}" in row_of])
        rs = np.unique([row_of[f"tv:{t}"] for t, _ in sr if f"tv:{t}" in row_of])
        if len(rf) < 20 or len(rs) < 10:
            continue
        def sp(a):
            p = rng.permutation(len(a))
            t = int(0.6 * len(a))
            return a[p[:t]], set(a[p[t:]].tolist())
        pf, gf = sp(rf)
        ps, gs = sp(rs)
        casi.append((pf, gf, ps, gs))
    return casi


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


def misura(casi, etichetta):
    PF = {i: c[0] for i, c in enumerate(casi)}
    GF = {i: c[1] for i, c in enumerate(casi)}
    PS = {i: c[2] for i, c in enumerate(casi)}
    GS = {i: c[3] for i, c in enumerate(casi)}
    print("")
    print(f"  ===== {etichetta} ({len(casi)} utenti) =====")
    out = {}
    for nome, M, semi, cat, gold, largo in (
        ("FILM  vecchio", M_VECCHIO, PF, ~is_tv, GF, 30),
        ("FILM  nuovo", M_NUOVO_F, PF, ~is_tv, GF, 30),
        ("SERIE vecchio", M_VECCHIO, PS, is_tv, GS, 30),
        ("SERIE nuovo", M_NUOVO_S, PS, is_tv, GS, 30),
    ):
        X, ch = attiva(M, semi)
        out[nome] = K.recall_catalogo(K.ranghi(X, cat), gold, ch, cat)
        K.stampa(nome, out[nome], largo)
        del X
    for nome, semi, cat, gold in (("FILM  popolarita'", PF, ~is_tv, GF), ("SERIE popolarita'", PS, is_tv, GS)):
        ch = list(semi)
        out[nome] = K.recall_catalogo(K.ranghi(np.tile(pop[:, None], (1, len(ch)))), gold, ch, cat)
        K.stampa(nome, out[nome], 30)
    return out


print("")
print("=" * 100)
print("BANCO TRACT")
print("=" * 100)
T_CAS = misura(banco_casuale(), "SPLIT CASUALE")
T_TMP = misura(banco_temporale(), "SPLIT TEMPORALE")
