"""cache.py — quanto si muove il portafoglio quando arriva una visione nuova.

LA DECISIONE CHE SERVE. La cache del feed ha un TTL di 12 ore. La domanda e': basta il TEMPO, o serve
invalidare sull'HASH DELLA STORIA? Dipende da una cosa sola, e si misura: **quanto cambia il portafoglio
quando l'utente guarda qualcosa di nuovo**.

  · se cambia poco (i mondi restano quelli, cambia l'ordine) -> il TTL a tempo basta, e si risparmia
    un confronto a ogni richiesta;
  · se cambia molto (i mondi cambiano) -> servirebbe l'hash, perche' 12 ore di portafoglio vecchio
    sarebbero 12 ore di risposta sbagliata.

Misura: per ogni utente si costruisce il portafoglio dalla storia fino a un certo punto, poi si
AGGIUNGONO le visioni successive una alla volta (1, 2, 5, 10) e si guarda quanto si sposta:
  · Jaccard dei 10 mondi di testa (quanto cambia l'INSIEME)
  · correlazione fra gli ordinamenti (quanto cambia l'ORDINE)
  · se il mondo di testa resta lo stesso

    python graph/measure/cache.py          # ~2 minuti
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
QUANTI_UTENTI = P.BANCO_UTENTI
AGGIUNTE = (1, 2, 5, 10)


pota = _cam.pota     # la camminata sta in graph/camminata.py (era copiata qui)


def storia(u):
    """(righe, plays, eta) in ordine CRONOLOGICO: il piu' vecchio per primo."""
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
            try:
                g = (pd.Timestamp.now(tz="UTC") - pd.Timestamp(voce.get("last_watched_at"))).days
            except Exception:
                g = 3650
            righe.append(r)
            plays.append(int(voce.get("plays") or 1))
            eta.append(int(g))
    o = np.argsort(-np.array(eta))
    return np.array(righe)[o], np.array(plays)[o]


def main():
    print("=" * 104)
    print(f"QUANTO SI MUOVE IL PORTAFOGLIO — α={P.ALPHA} · {QUANTI_UTENTI} utenti")
    print("=" * 104, flush=True)

    q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
    N = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    D = pota((W + W.T).tocsr(), P.POTA_PER_RIGA)
    MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    NB = int(MEM.max()) + 1
    deg = np.asarray(D.sum(1)).ravel()
    deg[deg <= 0] = 1
    Pm = sp.diags(1.0 / deg) @ D

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

    def pesi_spec(righe, plays):
        nep = NEP[righe]
        pl = plays.astype(float)
        return np.where(nep > 1.0, P.PESO_SERIE_BASE + P.PESO_SERIE_FASCIA * np.minimum(pl / nep, 1.0),
                        np.minimum(pl, P.PESO_FILM_MAX))

    def ppr(seme, plays):
        e = np.zeros(N, np.float64)
        w = pesi_spec(seme, plays)
        e[seme] = w / w.sum()
        r = e.copy()
        for _ in range(P.ITER):
            r = P.ALPHA * e + (1 - P.ALPHA) * (r @ Pm)
        return np.bincount(MEM, weights=r, minlength=NB) / r.sum()

    def top(att, quanti=10):
        return np.argsort(-att)[:quanti]

    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(202).choice(pool, size=min(QUANTI_UTENTI * 2, len(pool)),
                                               replace=False)
    esiti = {k: {"jac": [], "rho": [], "testa": []} for k in AGGIUNTE}
    usati = 0
    for u in utenti:
        if usati >= QUANTI_UTENTI:
            break
        righe, plays = storia(u)
        if len(righe) < 3 * P.BANCO_MIN_TITOLI:
            continue
        taglio = int(len(righe) * P.TAGLIO_TEMPORALE)
        base_r, base_p = righe[:taglio], plays[:taglio]
        att0 = ppr(base_r, base_p)
        t0 = top(att0)
        for k in AGGIUNTE:
            nuove = righe[taglio:taglio + k]
            if len(nuove) < k:
                continue
            att1 = ppr(np.concatenate([base_r, nuove]), np.concatenate([base_p, plays[taglio:taglio + k]]))
            t1 = top(att1)
            esiti[k]["jac"].append(len(set(t0) & set(t1)) / len(set(t0) | set(t1)))
            # l'ordine: correlazione di Spearman fra i ranghi dei mondi comuni
            comuni = sorted(set(t0) & set(t1))
            if len(comuni) >= 3:
                r0 = np.argsort(np.argsort([list(t0).index(int(b)) for b in comuni]))
                r1 = np.argsort(np.argsort([list(t1).index(int(b)) for b in comuni]))
                esiti[k]["rho"].append(float(np.corrcoef(r0, r1)[0, 1]))
            esiti[k]["testa"].append(float(int(t0[0]) == int(t1[0])))
        usati += 1
        if usati % 25 == 0:
            print(f"    {usati} utenti ({time.time()-T0:.0f}s)", flush=True)

    print(f"\n  utenti: {usati} · semi base: mediana "
          f"{int(np.median([int(len(storia(u)[0]) * P.TAGLIO_TEMPORALE) for u in utenti[:20]]))}\n")
    print(f"  {'visioni nuove':>15} {'Jaccard 10 mondi':>18} {'ordine (Spearman)':>18} "
          f"{'mondo di testa invariato':>26}")
    for k in AGGIUNTE:
        d = esiti[k]
        if not d["jac"]:
            continue
        rho = np.median(d["rho"]) if d["rho"] else float("nan")
        print(f"  {k:>15} {np.median(d['jac']):>18.2f} {rho:>18.2f} "
              f"{100*np.median(d['testa']):>25.0f}%")
    print(f"\n  lettura: Jaccard 1,00 = il portafoglio non si e' mosso. Se dopo 1-2 visioni resta alto,")
    print(f"  il TTL a tempo basta; se crolla, 12 ore di cache sono 12 ore di risposta vecchia.")
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
