"""ricetta.py — gli slider servono a qualcosa, e QUALE dei tre fa il lavoro.

LA DOMANDA IN DUE META', e la prima e' misurabile.

1. **I parametri cambiano cosa si vede?** Se due configurazioni opposte mostrano gli stessi titoli, gli
   slider sono decorativi e l'alternativa onesta e' una lista. (Misurato la prima volta su due poli
   insieme: Jaccard 0,11. Ma cosi' non si sa QUALE parametro lo produce.)
2. **Quale dei tre parametri fa il lavoro?** Larghezza · distanza · fascia. Qui si varia **uno alla
   volta**, e — questa e' la parte metodologica che conta — **a parita' di titoli mostrati**: se una
   configurazione ne mostra di piu', il confronto misura la quantita', non la composizione.

METODO. Da UNA sola attivazione per utente (nessuna diffusione in piu') si costruiscono cinque
portafogli, tutti da 40 titoli:
  base           4 mondi, i più accesi, in qualunque fascia
  + largo        8 mondi invece di 4        (stessa densita' di titoli per mondo)
  + lontano      4 mondi scelti per diversita' di fascia e medium
  + nicchia      4 mondi scelti fra i PIU' OSCURI
  + popolare     4 mondi scelti fra i PIU' VOTATI
Si misura il Jaccard dei TITOLI contro `base`. E, come informazione ausiliaria dichiarata non-verdetto,
quanti titoli del FUTURO dell'utente ci finiscono dentro (seme = il 70% piu' vecchio, oro = il 30% piu'
recente).

    python graph/measure/ricetta.py
"""
import json
import os
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from graph import bubbles as B
from graph import canon as K
from graph import parametri as P

T0 = time.time()
QUANTI_UTENTI = int(os.environ.get("UTENTI", 60))
TITOLI_TOTALI = 40
LARGHEZZA_BASE = 4


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
    D = sp.csr_matrix((np.concatenate(v_), (np.concatenate(r_), np.concatenate(c_))), shape=M.shape)
    return (D + D.T).tocsr()


def storia(u):
    import pandas as pd
    righe, plays, eta = [], [], []
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
            righe.append(r)
            plays.append(int(voce.get("plays") or 1))
            try:
                eta.append((pd.Timestamp.now(tz="UTC") - pd.Timestamp(voce.get("last_watched_at"))).days)
            except Exception:
                eta.append(3650)
    o = np.argsort(-np.array(eta))
    return np.array(righe)[o], np.array(plays)[o]


def main():
    print("=" * 106)
    print("QUALE DEI TRE PARAMETRI FA IL LAVORO — a parita' di titoli mostrati")
    print("=" * 106, flush=True)

    q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
    N = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    D = pota((W + W.T).tocsr(), P.POTA_PER_RIGA)
    MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    NB = int(MEM.max()) + 1
    M = np.load(K.A("mappa-finale-6-2.npz"), allow_pickle=True)
    INTRA = M["intra"]
    deg = np.asarray(D.sum(1)).ravel()
    deg[deg <= 0] = 1
    Pm = sp.diags(1.0 / deg) @ D

    VOT = np.zeros(N)
    import pandas as pd
    for tipo, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", "vote_count"])
        for i, v in zip(d["id"], d["vote_count"]):
            r = B.ROW_OF.get(f"{tipo}:{int(i)}")
            if r is not None and not pd.isna(v):
                VOT[r] = float(v)
    VOTMED = np.array([np.median(VOT[MEM == b]) if (MEM == b).any() else 0.0 for b in range(NB)])
    VOTMED_CAT = float(np.median(VOTMED[VOTMED > 0]))
    NEP = np.ones(N, np.float32)
    tv = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / "tv.parquet",
                         columns=["id", "number_of_episodes"])
    for i, e in zip(tv["id"], tv["number_of_episodes"]):
        r = B.ROW_OF.get(f"tv:{int(i)}")
        if r is not None:
            e = pd.to_numeric(e, errors="coerce")
            if e is not None and not pd.isna(e) and e > 0:
                NEP[r] = float(e)
    print(f"  artefatti pronti · mediana voti dei mondi: {VOTMED_CAT:,.0f} ({time.time()-T0:.0f}s)",
          flush=True)

    def ppr(seme, plays):
        e = np.zeros(N, np.float64)
        nep = NEP[seme]
        pl = plays.astype(float)
        w = np.where(nep > 1.0, P.PESO_SERIE_BASE + P.PESO_SERIE_FASCIA * np.minimum(pl / nep, 1.0),
                     np.minimum(pl, P.PESO_FILM_MAX))
        e[seme] = w / w.sum()
        r = e.copy()
        for _ in range(P.ITER):
            r = P.ALPHA * e + (1 - P.ALPHA) * (r @ Pm)
        return r / r.sum()

    def scegli_mondi(att, quante, distanza=False, fascia=None):
        """I mondi, con UN parametro variato alla volta. La fascia riordina, non filtra."""
        o = list(np.argsort(-att)[:40])
        if fascia == "nicchia":
            o.sort(key=lambda b: VOTMED[b])
        elif fascia == "popolare":
            o.sort(key=lambda b: -VOTMED[b])
        scelti = []
        for cb in o:
            cb = int(cb)
            if distanza:
                meio = B.IS_TV[MEM == cb].mean() > 0.5
                if not all(abs(np.log(max(VOTMED[cb], 1) / max(VOTMED[bb], 1)))
                           > P.MONDI_DIVERSI_SOGLIA_FASCIA
                           or meio != (B.IS_TV[MEM == bb].mean() > 0.5) for bb in scelti):
                    continue
            scelti.append(cb)
            if len(scelti) == quante:
                break
        return scelti

    def titoli(bolle, r_tit, visti, quanti):
        fuori = []
        for b in bolle:
            m = np.setdiff1d(np.where(MEM == b)[0], list(visti))
            if len(m):
                fuori.extend(m[np.argsort(-r_tit[m])][:quanti].tolist())
        return set(fuori)

    varianti = [("base", dict(quante=LARGHEZZA_BASE)),
                ("+ largo", dict(quante=LARGHEZZA_BASE * 2)),
                ("+ lontano", dict(quante=LARGHEZZA_BASE, distanza=True)),
                ("+ nicchia", dict(quante=LARGHEZZA_BASE, fascia="nicchia")),
                ("+ popolare", dict(quante=LARGHEZZA_BASE, fascia="popolare"))]

    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(404).choice(pool, size=QUANTI_UTENTI * 2, replace=False)
    jac = {n: [] for n, _ in varianti[1:]}
    oro_preso = {n: [] for n, _ in varianti}
    usati = 0
    esempi = []
    for u in utenti:
        if usati >= QUANTI_UTENTI:
            break
        righe, plays = storia(u)
        if len(righe) < P.BANCO_MIN_TITOLI:
            continue
        taglio = int(len(righe) * P.TAGLIO_TEMPORALE)
        semi, oro = righe[:taglio], set(righe[taglio:].tolist())
        if len(oro) < 10:
            continue
        r_tit = ppr(semi, plays[:taglio])
        att = np.bincount(MEM, weights=r_tit, minlength=NB) / r_tit.sum()
        # ATTENZIONE, e questo era un bug: dal portafoglio si escludono i SEMI, non tutta la storia.
        # Escludendo anche l'oro, «titoli del futuro presi» risultava strutturalmente zero.
        visti = set(semi.tolist())
        pezzi = {}
        for nome, kw in varianti:
            bolle = scegli_mondi(att, kw.get("quante", LARGHEZZA_BASE), kw.get("distanza", False),
                                 kw.get("fascia"))
            per = max(TITOLI_TOTALI // max(len(bolle), 1), 2)
            t = titoli(bolle, r_tit, visti, per)
            pezzi[nome] = t
            oro_preso[nome].append(len(t & oro) / len(oro))
        for nome in jac:
            jac[nome].append(len(pezzi["base"] & pezzi[nome]) / len(pezzi["base"] | pezzi[nome]))
        if len(esempi) < 2:
            esempi.append((u, {k: v for k, v in pezzi.items()}, len(oro)))
        usati += 1

    print(f"\n  utenti: {usati} · titoli per portafoglio: {TITOLI_TOTALI}\n")
    print(f"  {'variante':>12} {'Jaccard vs base':>17} {'titoli del futuro presi':>26}")
    for nome, _ in varianti:
        j = f"{np.median(jac[nome]):.2f}" if nome in jac else "— (e' la base)"
        print(f"  {nome:>12} {j:>17} {100*np.median(oro_preso[nome]):>25.1f}%")
    print(f"\n  lettura: Jaccard alto (0,8-1,0) = quel parametro NON cambia cosa si vede.")
    print(f"  Basso (0,1-0,4) = lo cambia. E «titoli del futuro» e' informazione, NON verdetto:")
    print(f"  il banco guarda il comportamento, e una scelta di prodotto non si arbitra con quello.")
    print(f"  (a caso, 40 titoli su {N:,}, coprirebbero ~{100*40/N:.2f}% dell'oro: e' il pavimento)")
    print(f"\n  E DUE ESEMPI DA LEGGERE (non da misurare) — il primo utente incontrato:")
    for u, pezzi, n_oro in esempi[:2]:
        print(f"\n    UTENTE {u} · oro {n_oro} titoli")
        print(f"      base      : {' · '.join(TIT[x][:24] for x in list(pezzi['base'])[:6])}")
        print(f"      + lontano : {' · '.join(TIT[x][:24] for x in list(pezzi['+ lontano'])[:6])}")
        print(f"      + nicchia : {' · '.join(TIT[x][:24] for x in list(pezzi['+ nicchia'])[:6])}")
    print(f"\nFINE ({time.time()-T0:.0f}s)")


TIT = {}


if __name__ == "__main__":
    for tipo, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
        for i, t in zip(d["id"], d[col]):
            r = B.ROW_OF.get(f"{tipo}:{int(i)}")
            if r is not None:
                TIT[r] = str(t)
    main()
