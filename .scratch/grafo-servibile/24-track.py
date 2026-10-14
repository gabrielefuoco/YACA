"""24-track.py — TICKET 24, parte B: il banco Trakt STRATIFICATO.

Il guadagno piu' celebrato della fase — «la co-visione porta il catalogo serie da 2,86% a 5,04% al
@10, +77%» — e' una recall GLOBALE, e **non e' mai stato stratificato**. Se anche lui alza la testa e
abbassa la coda, allora vale la stessa cosa che vale per le liste e per il gating, e la conclusione
piu' solida della fase va ridimensionata.

Protocollo del ticket 17: TV costruito sui 4/5 degli utenti, valutato sull'1/5 mai visto, 5 fold.
Qui si misurano le TRE metriche: globale, mezzo+coda, auto-informazione — sul catalogo serie e sul
film, e sul caso cross.
"""
import glob, json, pathlib, sys, time
import numpy as np
import scipy.sparse as sp
from scipy.sparse.linalg import svds

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

NS = (10, 100, 500)
FOLD = 5
t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
IDX_SERIE = np.where(is_tv)[0]
voti = K.voti()
fas_film = np.full(n, -1, np.int8)
fas_film[IDX_FILM] = K.fasce(voti[IDX_FILM])
si_film = np.zeros(n)
si_film[IDX_FILM] = K.auto_informazione(voti[IDX_FILM])
fas_serie = np.full(n, -1, np.int8)
fas_serie[IDX_SERIE] = K.fasce(voti[IDX_SERIE])
si_serie = np.zeros(n)
si_serie[IDX_SERIE] = K.auto_informazione(voti[IDX_SERIE])


def leggi(u, pref, chiave):
    try:
        d = json.loads((K.TK / f"{pref}-{u}.json").read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(d, list):
        return []
    return [int((v.get(chiave) or {}).get("ids", {}).get("tmdb"))
            for v in d if (v.get(chiave) or {}).get("ids", {}).get("tmdb")]


def dividi(voci, rng, frazione=0.6):
    righe = np.array([row_of[f"{tp}:{int(tid)}"] for tp, tid in voci
                      if f"{tp}:{int(tid)}" in row_of], dtype=np.int64)
    if len(righe) == 0:
        return None, None
    righe = np.unique(righe)
    perm = rng.permutation(len(righe))
    t = int(frazione * len(righe))
    return righe[perm[:t]], set(righe[perm[t:]].tolist())


rng13 = np.random.default_rng(13)
CASI, STORIA = [], {}
for f in sorted(glob.glob(str(K.TK / "movie-*.json"))):
    u = pathlib.Path(f).stem[6:]
    fm, sr = leggi(u, "movie", "movie"), leggi(u, "show", "show")
    tutti = [row_of[f"{tp}:{int(t)}"] for tp, t in
             [("movie", x) for x in fm] + [("tv", x) for x in sr] if f"{tp}:{int(t)}" in row_of]
    if tutti:
        STORIA[u] = np.unique(np.array(tutti, np.int64))
    if len(fm) < 20 or len(sr) < 10:
        continue
    pf, gf = dividi([("movie", t) for t in fm], rng13)
    ps, gs = dividi([("tv", t) for t in sr], rng13)
    if pf is None or ps is None or not gf or not gs:
        continue
    CASI.append({"u": u, "pf": pf, "gf": gf, "ps": ps, "gs": gs})
print(f"banco: {len(CASI)} utenti · cronologie utili {len(STORIA):,} ({time.time()-t0:.0f}s)")

rng29 = np.random.default_rng(29)
fold_di = {u: int(rng29.integers(0, FOLD)) for u in sorted(STORIA)}
CMP = K.Componenti(n)
C = CMP(30)
MS = K.costruisci(C, {"CFst": 1, "B": 1}, wc=0.0, beta=0.25)
MF = K.costruisci(C, {"CF": 1}, wc=0.0, beta=0.25)
print(f"grafi base pronti ({time.time()-t0:.0f}s)", flush=True)


def tv_da(utenti):
    righe, cols = [], []
    for uid, u in enumerate(utenti):
        for r in STORIA[u]:
            righe.append(uid); cols.append(r)
    U = sp.csr_matrix((np.ones(len(righe), np.float32), (righe, cols)),
                      shape=(len(utenti), n)).tocsr()
    U.sum_duplicates(); U.data[:] = 1.0
    Vs, _, _ = svds(U.T.astype(np.float64), k=min(128, max(2, len(utenti) - 1)), random_state=0)
    return K.topk_edges(np.asarray(Vs, np.float32), 30)


def cammina(M, semi_di, alpha=0.30, lotto=120):
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


def tre(R, gold_di, chiavi, cat, fas, si, etichetta):
    """globale / mezzo+coda / auto-informazione, sul catalogo servito."""
    idx = np.where(cat)[0]
    g = K.recall_catalogo(R, gold_di, chiavi, cat, NS)
    rk, fb, sv = [], [], []
    for j, u in enumerate(chiavi):
        gg = gold_di.get(u)
        if not gg:
            continue
        a = np.fromiter(gg, np.int64, len(gg))
        rk.append(R[a, j]); fb.append(fas[a]); sv.append(si[a])
    rk, fb, sv = np.concatenate(rk), np.concatenate(fb), np.concatenate(sv)
    mc = K.per_fascia(rk, fb, NS)["mezzo+coda"]
    ai = K.recall_si(rk, sv, 1.0, NS)
    print(f"    {etichetta:<22} globale " + " · ".join(f"@{N} {g[N]:5.2f}" for N in NS)
          + "   coda " + " · ".join(f"@{N} {mc[N]:5.2f}" for N in NS), flush=True)
    return {"g": g, "mc": mc, "si": ai}


RIS = {"film": {"senza TV": [], "con TV": []}, "serie": {"senza TV": [], "con TV": []}}
print("")
print("=" * 118)
print("IL BANCO TRACK STRATIFICATO — 5 fold, TV costruito sui 4/5 degli utenti")
print("=" * 118)
for k in range(FOLD):
    fuori = [u for u in sorted(STORIA) if fold_di[u] == k]
    dentro = [u for u in sorted(STORIA) if fold_di[u] != k]
    sel = [c for c in CASI if fold_di.get(c["u"], -1) == k]
    if not sel:
        continue
    TV = tv_da(dentro)
    MF_tv = K.costruisci({**C, "TV": TV}, {"CF": 1, "TV": 1}, wc=0.0, beta=0.25)
    MS_tv = K.costruisci({**C, "TV": TV}, {"CFst": 1, "B": 1, "TV": 1}, wc=0.0, beta=0.25)
    PF = {i: c["pf"] for i, c in enumerate(sel)}
    GF = {i: c["gf"] for i, c in enumerate(sel)}
    PS = {i: c["ps"] for i, c in enumerate(sel)}
    GS = {i: c["gs"] for i, c in enumerate(sel)}
    print(f"  fold {k}: {len(sel)} utenti del banco tenuti fuori ({time.time()-t0:.0f}s)", flush=True)
    for et, g_film, g_serie in (("senza TV", MF, MS), ("con TV", MF_tv, MS_tv)):
        Xf, chf = cammina(g_film, PF)
        RIS["film"][et].append(tre(K.ranghi(Xf, ~is_tv), GF, chf, ~is_tv, fas_film, si_film,
                                   f"{et} film"))
        Xs, chs = cammina(g_serie, PS)
        RIS["serie"][et].append(tre(K.ranghi(Xs, is_tv), GS, chs, is_tv, fas_serie, si_serie,
                                    f"{et} serie"))

print("")
print("=" * 118)
print("MEDIA SUI FOLD — e la domanda: la co-visione alza la testa o anche la coda?")
print("=" * 118)
for cat in ("film", "serie"):
    print(f"  --- catalogo {cat} ---")
    for et in ("senza TV", "con TV"):
        for chiave, nome in (("g", "GLOBALE"), ("mc", "MEZZO+CODA")):
            v = np.array([[d[chiave][N] for N in NS] for d in RIS[cat][et]])
            print(f"    {et + ' TV':<9} {nome:<12} " + " · ".join(
                f"@{N} {v[:,i].mean():5.2f}±{v[:,i].std():4.2f}" for i, N in enumerate(NS)))
    for chiave, nome in (("g", "GLOBALE"), ("mc", "MEZZO+CODA")):
        a = np.array([[d[chiave][N] for N in NS] for d in RIS[cat]["con TV"]])
        b = np.array([[d[chiave][N] for N in NS] for d in RIS[cat]["senza TV"]])
        d_ = a - b
        print(f"    DIFF      {nome:<12} " + " · ".join(
            f"@{N} {d_[:,i].mean():+5.2f}±{d_[:,i].std():4.2f}" for i, N in enumerate(NS)))
print(f"\nFINE ({time.time()-t0:.0f}s)")
