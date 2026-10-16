"""freddo.py — quando la storia e' di uno, due, tre titoli.

LA DOMANDA. Un profilo appena nato ha 0-3 titoli. Il meccanismo che abbiamo costruito regge? E con cosa
si deve confrontare? Il controllo giusto non e' «esiste la risposta» (esiste sempre: la diffusione tocca
tutte le 3.497 bolle) ma: **un titolo vero batte un titolo a caso?** Se no, il grafo sta dicendo solo
«questo film assomiglia a se stesso» e la risposta non vale piu' di una tabella di popolarita'.

IL TAGLIO E' TEMPORALE ALL'INDIETRO, come nella vita: i primi K titoli che l'utente ha visto sono il
seme, **tutto il resto e' l'oro** — cioe' esattamente la situazione di chi comincia adesso.

Misura, per K = 1, 2, 3, 5, 10, 20, 50:
  · lift  — quanta piu' massa cade sui titoli futuri che su titoli a caso (misura di densita')
  · copertura — quanti dei 10 mondi mostrati contengono un titolo futuro (misura di ampiezza)
  · testa — la quota del mondo piu' acceso (quanto la risposta e' concentrata in un solo mondo)
  · controprova — le stesse tre cose con K titoli PESCATI A CASO

    python graph/measure/freddo.py          # ~3 minuti
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
from graph import camminata as _cam
from graph import canon as K
from graph import parametri as P

T0 = time.time()
ALPHA = float(os.environ.get("ALPHA", P.ALPHA))
QUANTI_UTENTI = P.BANCO_UTENTI
ITER = P.ITER
K_POTA = P.POTA_PER_RIGA
MIN_TITOLI = P.BANCO_MIN_TITOLI
K_SEMI = (1, 2, 3, 5, 10, 20, 50)
EMIVITA = 365.0


pota = _cam.pota     # la camminata sta in graph/camminata.py (era copiata qui)


def storia(u):
    """(righe, plays) in ordine CRONOLOGICO: il piu' VECCHIO per primo."""
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
            eta.append(int(g))
            plays.append(int(voce.get("plays") or 1))
    o = np.argsort(-np.array(eta))              # eta' grande = vecchio: il piu' vecchio per primo
    return np.array(righe)[o], np.array(plays)[o]


def pesi_spec(righe, plays, NEP):
    nep = NEP[righe]
    pl = plays.astype(float)
    return np.where(nep > 1.0, P.PESO_SERIE_BASE + P.PESO_SERIE_FASCIA * np.minimum(pl / nep, 1.0),
                        np.minimum(pl, P.PESO_FILM_MAX))


def ppr(P, seme, pesi, iters=ITER):
    """Il ciclo sta in `camminata.ppr`. `alpha=ALPHA` perche' qui si puo' sovrascrivere da ambiente."""
    return _cam.ppr(P, seme, pesi, alpha=ALPHA, iters=iters)


def main():
    global NEP
    print("=" * 104)
    print(f"Il FREDDO — che risposta da uno, due, tre titoli · α={ALPHA} · {QUANTI_UTENTI} utenti")
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

    NEP = np.ones(N, np.float32)
    import pandas as pd
    tv = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / "tv.parquet",
                         columns=["id", "number_of_episodes"])
    for i, e in zip(tv["id"], tv["number_of_episodes"]):
        r = B.ROW_OF.get(f"tv:{int(i)}")
        if r is None:
            continue
        e = pd.to_numeric(e, errors="coerce")
        if e is not None and not pd.isna(e) and e > 0:
            NEP[r] = float(e)
    print(f"  grafo potato top-{K_POTA}: {Wp.nnz:,} archi · NEP caricato ({time.time()-T0:.0f}s)",
          flush=True)

    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(101).choice(pool, size=min(QUANTI_UTENTI * 2, len(pool)),
                                               replace=False)

    acc = {k: {"lift": [], "hit": [], "testa": [], "lift_n": [], "hit_n": [], "testa_n": []}
           for k in K_SEMI}
    usati = 0
    for u in utenti:
        if usati >= QUANTI_UTENTI:
            break
        righe, plays = storia(u)
        if len(righe) < MIN_TITOLI:
            continue
        for k in K_SEMI:
            seme = righe[:k]
            oro = righe[k:]
            if len(oro) < 10:
                continue
            bolle_oro = set(MEM[oro].tolist())
            idx_caso = np.random.default_rng(9).choice(N, size=len(oro), replace=False)
            r = ppr(P, seme, pesi_spec(seme, plays[:k], NEP))
            tot = r.sum()
            att = np.bincount(MEM, weights=r, minlength=NB) / tot
            primi = np.argsort(-att)[:10]
            acc[k]["lift"].append(float(r[oro].sum() / max(r[idx_caso].sum(), 1e-12)))
            acc[k]["hit"].append(sum(1 for b in primi if b in bolle_oro) / 10)
            acc[k]["testa"].append(float(att.max()))
            # CONTROPROVA: k titoli PESCATI A CASO
            ran = np.random.default_rng(1000 + k).choice(N, size=k, replace=False)
            rn = ppr(P, ran, np.ones(k))
            totn = rn.sum()
            attn = np.bincount(MEM, weights=rn, minlength=NB) / totn
            primin = np.argsort(-attn)[:10]
            acc[k]["lift_n"].append(float(rn[oro].sum() / max(rn[idx_caso].sum(), 1e-12)))
            acc[k]["hit_n"].append(sum(1 for b in primin if b in bolle_oro) / 10)
            acc[k]["testa_n"].append(float(attn.max()))
        usati += 1
        if usati % 20 == 0:
            print(f"    {usati} utenti ({time.time()-T0:.0f}s)", flush=True)

    print(f"\n  utenti: {usati} · oro = tutto il resto della storia (mediana "
          f"{int(np.median([len(storia(u)[0]) for u in utenti[:15]]))} titoli)\n")
    print(f"  {'semi':>5} {'lift':>9} {'(a caso)':>10} {'copertura':>11} {'(a caso)':>10} "
          f"{'mondo di testa':>15} {'(a caso)':>10}")
    for k in K_SEMI:
        d = acc[k]
        if not d["lift"]:
            continue
        print(f"  {k:>5} {np.median(d['lift']):>8.1f}x {np.median(d['lift_n']):>9.1f}x "
              f"{100*np.median(d['hit']):>10.0f}% {100*np.median(d['hit_n']):>9.0f}% "
              f"{100*np.median(d['testa']):>14.1f}% {100*np.median(d['testa_n']):>9.1f}%")
    print(f"\n  lettura: la colonna «a caso» e' il pavimento. Se le due colonne si toccano, con quella")
    print(f"  quantita' di storia il grafo non sta dicendo niente che una tabella di popolarita' non dica.")
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
