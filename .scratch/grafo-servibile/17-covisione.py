"""17-covisione.py — TICKET 17: la co-visione nel grafo di RECUPERO, con la cross-validazione.

Il componente TV (le cronologie Trakt) vive oggi solo nel grafo delle bolle. E' l'UNICO segnale
comportamentale che attraversa il confine film <-> serie: il catalogo film usa solo il comportamento
(che copre i film e zero serie), il catalogo serie usa il pubblico previsto e il `related` (che e'
mono-medium). Il ponte fra i due medium nel recupero e' oggi solo una predizione da metadati.

LA CONTAMINAZIONE E' IL PROBLEMA, E SI ESCLUDE PER COSTRUZIONE. TV e' costruito dalle cronologie
degli utenti Trakt — che sono GLI STESSI utenti del banco. Un guadagno misurato cosi' non dice «la
co-visione serve», dice «la co-visione sa gia' cosa ha visto quell'utente».

Quindi 5 fold: TV si costruisce sui 4/5 degli utenti e si valuta sull'1/5 tenuto fuori. Nessuna
cronologia del fold di banco ha contribuito al componente che lo valuta. La varianza fra i fold si
riporta: un fold solo non e' un risultato.

TRE CASI, non due — perche' il cross-medium e' il punto del ticket:
  film   semi FILM  -> catalogo film   (il controllo: la co-visione tocca li'?)
  serie  semi SERIE -> catalogo serie
  CROSS  semi SERIE -> catalogo FILM   (il ponte che oggi non esiste)

Uso:  python .scratch/grafo-servibile/17-covisione.py
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


def leggi(u, pref, chiave):
    try:
        d = json.loads((K.TK / f"{pref}-{u}.json").read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(d, list):
        return []
    out = []
    for v in d:
        t = (v.get(chiave) or {}).get("ids", {}).get("tmdb")
        if t:
            out.append(int(t))
    return out


# ------------------------------------------------------------------ 1. il banco, CON l'utente
# Riscritto da `canone.banco_trakt` perche' serve l'identita' dell'utente: senza, il fold non si
# assegna e la cross-validazione non si puo' fare. Stessa logica, stesso seme, stessa soglia.
print("leggo le cronologie e costruisco il banco ...", flush=True)


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
    tutti = np.array([row_of[f"{tp}:{int(t)}"] for tp, t in
                      [("movie", x) for x in fm] + [("tv", x) for x in sr]
                      if f"{tp}:{int(t)}" in row_of], np.int64)
    if len(tutti):
        STORIA[u] = np.unique(tutti)
    if len(fm) < 20 or len(sr) < 10:
        continue
    pf, gf = dividi([("movie", t) for t in fm], rng13)
    ps, gs = dividi([("tv", t) for t in sr], rng13)
    if pf is None or ps is None or not gf or not gs:
        continue
    CASI.append({"u": u, "pf": pf, "gf": gf, "ps": ps, "gs": gs})
print(f"  banco: {len(CASI)} utenti · cronologie utili: {len(STORIA):,} "
      f"({time.time()-t0:.0f}s)")

rng29 = np.random.default_rng(29)
fold_di = {u: int(rng29.integers(0, FOLD)) for u in sorted(STORIA)}
print("  fold: " + " · ".join(
    f"{k}: {sum(1 for c in CASI if fold_di.get(c['u'], -1) == k)} utenti del banco"
    for k in range(FOLD)))

# ------------------------------------------------------------------ 2. i grafi base
CMP = K.Componenti(n)
C = CMP(30)
MS = K.costruisci(C, {"CFst": 1, "B": 1}, wc=0.0, beta=0.25)      # catalogo serie
MF = K.costruisci(C, {"CF": 1}, wc=0.0, beta=0.25)                # catalogo film
print(f"  grafi base pronti ({time.time()-t0:.0f}s)", flush=True)


def tv_da(utenti):
    righe, cols = [], []
    for uid, u in enumerate(utenti):
        for r in STORIA[u]:
            righe.append(uid)
            cols.append(r)
    U = sp.csr_matrix((np.ones(len(righe), np.float32), (righe, cols)),
                      shape=(len(utenti), n)).tocsr()
    U.sum_duplicates()
    U.data[:] = 1.0
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


def tre_casi(g_film, g_serie, sel):
    """I tre casi con il grafo GIUSTO per ciascuno: il catalogo film non deve passare da CFst+B."""
    PF = {i: c["pf"] for i, c in enumerate(sel)}
    GF = {i: c["gf"] for i, c in enumerate(sel)}
    PS = {i: c["ps"] for i, c in enumerate(sel)}
    GS = {i: c["gs"] for i, c in enumerate(sel)}
    Xf, chf = cammina(g_film, PF)
    a = K.recall_catalogo(K.ranghi(Xf, ~is_tv), GF, chf, ~is_tv, NS)          # film
    Xs, chs = cammina(g_serie, PS)
    b = K.recall_catalogo(K.ranghi(Xs, is_tv), GS, chs, is_tv, NS)            # serie
    c = K.recall_catalogo(K.ranghi(Xs, ~is_tv), GF, chs, ~is_tv, NS)          # CROSS
    return a, b, c


# ------------------------------------------------------------------ 3. i 5 fold
print("")
print("=" * 108)
print("LA CO-VISIONE NEL RECUPERO — 5 fold, componente costruito su 4/5 degli utenti")
print("=" * 108)
ris = {"senza TV": {"film": [], "serie": [], "cross": []},
       "con TV": {"film": [], "serie": [], "cross": []}}
for k in range(FOLD):
    fuori = [u for u in sorted(STORIA) if fold_di[u] == k]
    dentro = [u for u in sorted(STORIA) if fold_di[u] != k]
    sel = [c for c in CASI if fold_di.get(c["u"], -1) == k]
    if not sel:
        print(f"  fold {k}: nessun utente del banco — saltato")
        continue
    TV = tv_da(dentro)
    MF_tv = K.costruisci({**C, "TV": TV}, {"CF": 1, "TV": 1}, wc=0.0, beta=0.25)
    MS_tv = K.costruisci({**C, "TV": TV}, {"CFst": 1, "B": 1, "TV": 1}, wc=0.0, beta=0.25)
    print(f"  fold {k}: {len(sel)} utenti del banco tenuti fuori · {len(dentro)} hanno costruito TV "
          f"· {TV.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)
    for et, g_film, g_serie in (("senza TV", MF, MS), ("con TV", MF_tv, MS_tv)):
        a, b, c = tre_casi(g_film, g_serie, sel)
        ris[et]["film"].append(a)
        ris[et]["serie"].append(b)
        ris[et]["cross"].append(c)
        print(f"    {et:<10} film " + " · ".join(f"@{N} {a[N]:5.2f}%" for N in NS)
              + "   serie " + " · ".join(f"@{N} {b[N]:5.2f}%" for N in NS)
              + "   cross " + " · ".join(f"@{N} {c[N]:5.2f}%" for N in NS), flush=True)

print("")
print("=" * 108)
print("MEDIA SUI FOLD (deviazione standard fra i fold)")
print("=" * 108)
for cat in ("film", "serie", "cross"):
    v0 = np.array([[d[N] for N in NS] for d in ris["senza TV"][cat]])
    v1 = np.array([[d[N] for N in NS] for d in ris["con TV"][cat]])
    if not len(v0):
        continue
    print(f"  --- {cat} ---")
    print(f"    {'senza TV':<12} " + " · ".join(f"@{N} {v0[:,i].mean():5.2f}±{v0[:,i].std():4.2f}"
                                               for i, N in enumerate(NS)))
    print(f"    {'con TV':<12} " + " · ".join(f"@{N} {v1[:,i].mean():5.2f}±{v1[:,i].std():4.2f}"
                                               for i, N in enumerate(NS)))
    d = v1 - v0
    print(f"    {'DIFERENZA':<12} " + " · ".join(f"@{N} {d[:,i].mean():+5.2f}±{d[:,i].std():4.2f}"
                                                  for i, N in enumerate(NS))
          + f"   ({sum(1 for x in d[:,0] if x>0)}/{len(d)} fold migliorano al @10)")
print(f"\nFINE ({time.time()-t0:.0f}s)")
