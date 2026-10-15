"""pesi.py — cosa pesa un titolo della storia, e quanto costa il tetto dei 15.

DUE DOMANDE, una misura.

1. IL PESO. Il meccanismo prende la storia dell'utente e la usa come seme. Ma un titolo visto tre anni
   fa vale come uno visto ieri? Uno rivisto tre volte vale come uno abbandonato? Oggi la scelta e'
   dell'autore (recenza x ri-visioni) e **non e' mai stata misurata**.

2. IL TETTO DEI 15 (`todo/8`). Il prodotto prende i **15 titoli piu' recenti** e butta il resto
   (`SEED_SIGNAL_LIMITS.watched = 15`). Il report 05 l'aveva misurato sulla *cronologia*: 50 e 100
   visti danno liste identiche. Qui si misura sul MECCANISMO NUOVO: quanti titoli futuri si perdono
   con 15 semi invece che con tutti? E il `todo/8` proponeva un decadimento logaritmico o inverso del
   rango: quale dei due, misurato.

IL TAGLIO E' TEMPORALE, e non e' un dettaglio: i semi sono il PASSATO, il bersaglio e' il FUTURO. E' la
situazione del prodotto, ed e' l'unica in cui la recenza puo' essere giudicata sul suo terreno. Con due
meta' a caso, un peso che privilegia i recenti sarebbe testato contro un oro che contiene anche i
vecchi — cortesia che il prodotto non fa.

    python graph/measure/pesi.py            # ~5 minuti su 100 utenti
"""
import json
import os
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import canon as K

T0 = time.time()
ALPHA = float(os.environ.get("ALPHA", 0.60))
QUANTI_UTENTI = int(os.environ.get("UTENTI", 100))
ITER = int(os.environ.get("ITER", 18))
FRAZIONE = 0.70            # il 70% piu' VECCHIO semina, il 30% piu' NUOVO e' l'oro
K_POTA = 16
MIN_TITOLI = 40
EMIVITA = 365.0


def pota(M, k):
    r_, c_, v_ = [], [], []
    for i in range(M.shape[0]):
        lo, hi = M.indptr[i], M.indptr[i + 1]
        idx, val = M.indices[lo:hi], M.data[lo:hi]
        if len(idx) > k:
            o = np.argpartition(-val, k)[:k]
            idx, val = idx[o], val[o]
        r_.append(np.full(len(idx), i, np.int32))
        c_.append(idx.astype(np.int32))
        v_.append(val)
    P = sp.csr_matrix((np.concatenate(v_), (np.concatenate(r_), np.concatenate(c_))), shape=M.shape)
    return (P + P.T).tocsr()


def storia(u):
    """(righe, eta' in giorni, plays) in ordine di recenza decrescente."""
    import pandas as pd
    righe, eta, plays = [], [], []
    for tipo in ("movie", "show"):
        p = K.TK / f"{tipo}-{u}.json"
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
            try:
                g = (pd.Timestamp.now(tz="UTC") - pd.Timestamp(voce.get("last_watched_at"))).days
            except Exception:
                g = 3650
            righe.append(r)
            eta.append(max(int(g), 0))
            plays.append(int(voce.get("plays") or 1))
    o = np.argsort(eta)                      # il piu' recente per primo
    return np.array(righe)[o], np.array(eta)[o], np.array(plays)[o]


def ppr(P, seme, pesi, iters=ITER):
    e = np.zeros(P.shape[0], np.float64)
    e[seme] = pesi / max(pesi.sum(), 1e-12)
    r = e.copy()
    for _ in range(iters):
        r = ALPHA * e + (1 - ALPHA) * (r @ P)
    return r


def pesi_per(nome, eta, plays, quante):
    """I pesi del seme secondo lo schema. `quante` limita ai piu' recenti."""
    i = np.arange(quante)
    rec = 0.5 ** (eta[:quante] / EMIVITA)
    pl = 1.0 + np.log(plays[:quante].astype(float))
    if nome == "uniforme":
        return np.ones(quante)
    if nome == "recenza":
        return rec
    if nome == "ri-visioni":
        return pl
    if nome == "recenza x ri-visioni":
        return rec * pl
    if nome == "rango inverso 1/i":
        return 1.0 / (i + 1.0)
    if nome == "rango logaritmico":
        return 1.0 / np.log2(2.0 + i)
    if nome == "ultimi 15 (il prodotto)":
        return (rec * pl)[:15]
    if nome == "ultimi 30":
        return (rec * pl)[:30]
    raise ValueError(nome)


SCHEMI = ("uniforme", "recenza", "ri-visioni", "recenza x ri-visioni",
          "rango inverso 1/i", "rango logaritmico", "ultimi 30", "ultimi 15 (il prodotto)",
          "15 a caso, peso pieno", "15 a caso, uniformi", "30 a caso, peso pieno")


def main():
    print("=" * 104)
    print(f"COSA PESA UN TITOLO — e quanto costa il tetto dei 15 · α={ALPHA} · taglio TEMPORALE")
    print("=" * 104, flush=True)

    q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
    N = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    Ws = (W + W.T).tocsr()
    MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    NB = int(MEM.max()) + 1
    Wp = pota(Ws, K_POTA)
    deg = np.asarray(Wp.sum(1)).ravel()
    deg[deg <= 0] = 1
    P = sp.diags(1.0 / deg) @ Wp
    print(f"  grafo potato top-{K_POTA}: {Wp.nnz:,} archi ({time.time()-T0:.0f}s)", flush=True)

    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(41).choice(pool, size=min(QUANTI_UTENTI * 2, len(pool)),
                                              replace=False)

    acc = {s: {"lift_t": [], "lift_b": [], "hit10": [], "semi": []} for s in SCHEMI}
    base = {"lift_t": [], "hit10": []}
    usati = 0
    for u in utenti:
        if usati >= QUANTI_UTENTI:
            break
        righe, eta, plays = storia(u)
        if len(righe) < MIN_TITOLI:
            continue
        taglio = int(len(righe) * FRAZIONE)
        A, Bt = righe[:taglio], righe[taglio:]           # il passato semina, il futuro e' l'oro
        if len(A) < 10 or len(Bt) < 5:
            continue
        bolle_B = set(MEM[Bt].tolist())
        idx_caso = np.random.default_rng(9).choice(N, size=len(Bt), replace=False)
        for s in SCHEMI:
            if "a caso" in s:                      # LA CONTROPROVA: stesso conteggio, titoli pescati
                quanti = 15 if s.startswith("15") else 30
                sel = np.random.default_rng(5).choice(len(A), size=min(quanti, len(A)),
                                                       replace=False)
                seme = A[sel]
                pesi = (pesi_per("recenza x ri-visioni", eta, plays, len(A))[sel]
                        if "peso pieno" in s else np.ones(len(sel)))
            else:
                pesi = pesi_per(s, eta, plays, len(A))
                seme = A[:len(pesi)]
            r = ppr(P, seme, pesi)
            tot = r.sum()
            acc[s]["lift_t"].append(float(r[Bt].sum() / max(r[idx_caso].sum(), 1e-12)))
            nb = np.bincount(MEM, weights=r, minlength=NB)
            att = nb / tot
            acc[s]["lift_b"].append(float(att[list(bolle_B)].sum() /
                                          max(len(bolle_B) / NB, 1e-12)))
            primi = np.argsort(-att)[:10]
            acc[s]["hit10"].append(sum(1 for b in primi if b in bolle_B) / 10)
            acc[s]["semi"].append(int(len(seme)))
        ran = np.random.default_rng(77).choice(N, size=len(A), replace=False)
        rn = ppr(P, ran, np.ones(len(A)))
        base["lift_t"].append(float(rn[Bt].sum() / max(rn[idx_caso].sum(), 1e-12)))
        nbn = np.bincount(MEM, weights=rn, minlength=NB)
        base["hit10"].append(sum(1 for b in np.argsort(-nbn)[:10] if b in bolle_B) / 10)
        usati += 1
        if usati % 25 == 0:
            print(f"    {usati} utenti ({time.time()-T0:.0f}s)", flush=True)

    print(f"\n  utenti: {usati} · semi: {int(np.median(acc[SCHEMI[0]]['semi']))} "
          f"(il 70% piu' vecchio) · oro: il 30% piu' recente\n")
    print(f"  {'schema':>22} {'lift titoli':>12} {'lift bolle':>11} {'primi 10 mondi':>15}")
    for s in SCHEMI:
        print(f"  {s:>22} {np.median(acc[s]['lift_t']):>11.2f}x {np.median(acc[s]['lift_b']):>10.2f}x "
              f"{100*np.median(acc[s]['hit10']):>14.0f}%")
    print(f"  {'SEMI A CASO (nullo)':>22} {np.median(base['lift_t']):>11.2f}x {'—':>10} "
          f"{100*np.median(base['hit10']):>14.0f}%")
    print(f"\n  lift titoli = quante volte piu' massa cade sui titoli del FUTURO che su titoli a caso")
    print(f"  primi 10 mondi = quanti dei 10 mondi accesi contengono un titolo del futuro")
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
