"""lettura.py — LA PRIMA LETTURA: uno storico vero dentro, un portafoglio fuori, e il giudizio.

Serve a rispondere a tre domande GUARDANDO, invece di discuterne:
  1. il pacchetto che il grafo restituisce ha i campi giusti? (il "contratto di ritorno")
  2. la luce arriva troppo lontano? (α, provato affiancato)
  3. i mondi accesi sono congrui alla storia dell'utente? (il giudizio vero)

Impianto, come deciso nella mappa `.scratch/suggerimenti/map.md`:
  · il grafo e' POTATO a top-16 per riga (12% degli archi, 8,7x meno lavoro)
  · la diffusione e' PageRank personalizzato sul grafo non orientato
  · i semi sono la storia dell'utente, pesati per RECENZA x ri-visioni
  · i mondi accesi si leggono GREZZI e PER MEMBRO (una bolla da 123 titoli prende piu' luce
    di una da 12 solo perche' e' grande)

Gli utenti non si scelgono a caso fra quelli che funzionano: si prendono i due ESTREMI del banco —
la storia piu' concentrata e la piu' dispersa — perche' il meccanismo va visto dove puo' rompersi.

    python graph/measure/lettura.py
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import camminata as _cam
from graph import canon as K
from graph import parametri as P

T0 = time.time()
ALPHA = (0.15, P.ALPHA, 0.90)   # dai piu' bassi al tetto: per VEDERE la differenza
K_POTA = P.POTA_PER_RIGA
SOGLIA = 0.005          # 0,5% di attivazione grezza: la soglia del portafoglio
QUANTI_MONDI = 6        # quanti mondi stampare per ogni α
EMIVITA_ANNI = 1.0      # il peso di un titolo dimezza ogni anno che passa


# ---------------------------------------------------------------- il grafo
def carica():
    q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
    N = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    Ws = (W + W.T).tocsr()
    return Ws, N


pota = _cam.pota     # la camminata sta in graph/camminata.py (era copiata qui)


def diffondi(M, seme, pesi, alpha, iters=30):
    """Il grafo, la transizione e il ciclo: tutti in `camminata`."""
    return _cam.ppr(_cam.transizione(M), seme, pesi, alpha=alpha, iters=iters)


# ---------------------------------------------------------------- gli utenti Trakt
def storia(u):
    """(righe, pesi, date) di un utente: recenza x ri-visioni. I file sono troncati a 300 voci."""
    righe, pesi, quando, titoli = [], [], [], []
    for tipo, ep in (("movie", "movie"), ("show", "show")):
        p = K.TK / f"{ep}-{u}.json"
        if not p.exists():
            continue
        j = json.load(open(p, encoding="utf-8"))
        for voce in (j["list"] if isinstance(j, dict) else j):
            ids = (voce.get(tipo) or {}).get("ids") or {}
            tmdb = ids.get("tmdb")
            if tmdb is None:
                continue
            r = B.ROW_OF.get(f"{'tv' if tipo == 'show' else 'movie'}:{int(tmdb)}")
            if r is None:
                continue
            data = voce.get("last_watched_at")
            try:
                t = pd.Timestamp(data)
                eta = (pd.Timestamp.now(tz="UTC") - t).days
            except Exception:
                eta = 3650
            plays = int(voce.get("plays") or 1)
            righe.append(r)
            pesi.append((1 + np.log(plays)) * 0.5 ** (eta / (365 * EMIVITA_ANNI)))
            quando.append(eta)
    return np.array(righe, np.int64), np.array(pesi, np.float64), np.array(quando)


def scegli_utenti(quanti=40):
    """I due estremi: storia concentrata e storia dispersa. Non i casi comodi."""
    pool = []
    for f in sorted(K.TK.glob("movie-*.json")):
        u = f.stem[6:]
        if (K.TK / f"show-{u}.json").exists():
            pool.append(u)
    rng = np.random.default_rng(11)
    scelti = rng.choice(pool, size=min(quanti, len(pool)), replace=False)
    righe = []
    for u in scelti:
        rr, pp, _ = storia(u)
        if len(rr) < 30:
            continue
        n_mondi = len(set(MEM[rr].tolist()))
        righe.append((n_mondi, u, len(rr)))
    righe.sort()
    print(f"  campionati {len(righe)} utenti con >= 30 titoli in canone:")
    print(f"    piu' concentrato: {righe[0][1]} — {righe[0][2]} titoli in {righe[0][0]} mondi")
    print(f"    piu' disperso   : {righe[-1][1]} — {righe[-1][2]} titoli in {righe[-1][0]} mondi")
    print(f"    (mediana dei mondi: {int(np.median([x[0] for x in righe]))})")
    return righe[0][1], righe[-1][1]


# ---------------------------------------------------------------- la stampa
def mondi_di(righe):
    return set(MEM[righe].tolist())


def stampa_utente(u, rr, pp, quando):
    print("\n" + "=" * 108)
    print(f"UTENTE {u} — {len(rr)} titoli in canone · {len(mondi_di(rr))} mondi toccati · "
          f"voti mediani {np.median(VOT[rr]):,.0f}")
    print("=" * 108)
    ordine = np.argsort(-pp)[:12]
    print("  la sua storia, dal titolo piu' pesato (recenza x ri-visioni):")
    for i in ordine:
        b = int(MEM[rr[i]])
        es = [TIT[x][:26] for x in np.where(MEM == b)[0] if x != rr[i]][:2]
        print(f"    {TIT[rr[i]][:40]:<42} {int(quando[i]):>5}g  peso {pp[i]:.2f}  "
              f"mondo {b:>4} ({int(SZ[b])} tit.) es. {es}")


def stampa_portafoglio(u, r, seme, alpha):
    tot = r.sum()
    nb = np.bincount(MEM, weights=r, minlength=len(SZ))
    att = nb / tot
    per_membro = att / np.maximum(SZ, 1)
    visibili = np.setdiff1d(np.arange(len(r)), np.array(list(seme)), assume_unique=False)
    print(f"\n  ── α = {alpha:<5} {'(la luce resta vicino)' if alpha >= 0.25 else '(la luce vaga)' if alpha <= 0.08 else ''}")
    print(f"     mondi sopra lo 0,5%: {int((att > SOGLIA).sum()):>4} su {len(SZ):,}  ·  "
          f"massa sui semi: {100*r[seme].sum()/tot:.0f}%  ·  "
          f"titoli sopra 0,1%: {int((r > 0.001*tot).sum()):,}")
    # due ordinamenti, e si vedono insieme: grezzo e per membro
    grezzi = np.argsort(-att)[:QUANTI_MONDI]
    permemb = np.argsort(-per_membro)[:QUANTI_MONDI]
    print(f"     {'mondo':>5} {'acceso':>8} {'per film':>10} {'titoli':>6} {'voti':>8}  "
          f"{'i titoli piu accesi dentro il mondo (non ancora visti)':<46}")
    for b in grezzi:
        m = np.where(MEM == b)[0]
        m = np.intersect1d(m, visibili)
        top = m[np.argsort(-r[m])][:4] if len(m) else []
        es = " · ".join(TIT[x][:22] for x in top)
        print(f"     {int(b):>5} {100*att[b]:>7.1f}% {per_membro[b]*1e5:>9.2f}e-5 {int(SZ[b]):>6} "
              f"{VOTMED[b]:>8,.0f}  {es}")
    diversi = [int(b) for b in permemb if int(b) not in set(int(x) for x in grezzi)]
    if diversi:
        print(f"     (per film, invece, i primi sarebbero: "
              f"{[(int(b), round(float(per_membro[b]*1e5), 1)) for b in diversi[:4]]})")
    return att


def main():
    global MEM, SZ, VOT, VOTMED, TIT
    print("=" * 108)
    print("LA PRIMA LETTURA — uno storico vero dentro, un portafoglio fuori")
    print("=" * 108, flush=True)

    Ws, N = carica()
    MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    SZ = np.bincount(MEM)
    print(f"  grafo: {Ws.nnz:,} archi ({time.time()-T0:.0f}s)", flush=True)
    Wp = pota(Ws, K_POTA)
    print(f"  potato a top-{K_POTA}: {Wp.nnz:,} archi ({100*Wp.nnz/Ws.nnz:.0f}%) — "
          f"{Ws.nnz/Wp.nnz:.1f}x meno lavoro ({time.time()-T0:.0f}s)", flush=True)

    # i voti: per titolo e per mondo
    VOT = np.zeros(N)
    for tipo, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", "vote_count"])
        for i, v in zip(d["id"], d["vote_count"]):
            r = B.ROW_OF.get(f"{tipo}:{int(i)}")
            if r is not None and not pd.isna(v):
                VOT[r] = float(v)
    VOTMED = np.array([np.median(VOT[MEM == b]) if (MEM == b).any() else 0 for b in range(len(SZ))])
    TIT = np.array([""] * N, dtype=object)
    for tipo, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
        for i, t in zip(d["id"], d[col]):
            r = B.ROW_OF.get(f"{tipo}:{int(i)}")
            if r is not None:
                TIT[r] = str(t)
    print(f"  titoli e voti caricati ({time.time()-T0:.0f}s)\n", flush=True)

    u_conc, u_disp = scegli_utenti()
    for u in (u_conc, u_disp):
        rr, pp, quando = storia(u)
        stampa_utente(u, rr, pp, quando)
        seme = np.array(sorted(set(MEM[rr].tolist())))
        for alpha in ALPHA:
            r = diffondi(Wp, rr, pp, alpha)
            stampa_portafoglio(u, r, rr, alpha)
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
