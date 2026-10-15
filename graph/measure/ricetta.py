"""ricetta.py — gli slider servono a qualcosa? Due profili con la STESSA storia e tipo opposto.

L'ULTIMA ASSUNZIONE NON MISURATA. La mappa dice che gli slider sono una *ricetta*: scelgono quante
liste, quanto lontane, a che altezza del canone — e l'output restano i mondi di quell'utente. Ma
nessuno ha mai dimostrato che **la ricetta cambi qualcosa**. Se due parametri opposti producono le
stesse liste, gli slider sono decorativi e l'alternativa onesta e' una lista.

MISURA SOLO LA PRIMA META' DELLA DOMANDA — la piu' importante, e quella che si misura davvero:
  **i due portafogli sono diversi?** (Jaccard sui TITOLI mostrati, non sui mondi)
La seconda — *sono migliori per quell'utente?* — richiede un giudizio, e non si misura con un banco
che guarda il comportamento. Quella resta al proprietario.

Costi: nessuna diffusione in piu'. Si calcola UNA attivazione per utente, e poi si seleziona in due
modi opposti dallo stesso vettore — che e' anche la prova che la selezione e' leggera.

    python graph/measure/ricetta.py
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
from graph import parametri as P

T0 = time.time()
QUANTI_UTENTI = int(os.environ.get("UTENTI", 60))
TITOLI_PER_LISTA = 10         # quanti titoli per mondo


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
    righe, plays = [], []
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
    return np.array(righe, np.int64), np.array(plays, np.float64)


def main():
    print("=" * 104)
    print("LA RICETTA CAMBIA QUALCOSA? Due parametri opposti, la stessa storia")
    print("=" * 104, flush=True)

    q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
    N = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    D = pota((W + W.T).tocsr(), P.POTA_PER_RIGA)
    MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    NB = int(MEM.max()) + 1
    SZ = np.bincount(MEM)
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
    NEP = np.ones(N, np.float32)
    tv = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / "tv.parquet", columns=["id", "number_of_episodes"])
    for i, e in zip(tv["id"], tv["number_of_episodes"]):
        r = B.ROW_OF.get(f"tv:{int(i)}")
        if r is not None:
            e = pd.to_numeric(e, errors="coerce")
            if e is not None and not pd.isna(e) and e > 0:
                NEP[r] = float(e)
    print(f"  grafo e artefatti pronti ({time.time()-T0:.0f}s)", flush=True)

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
        return np.bincount(MEM, weights=r, minlength=NB) / r.sum(), r / r.sum()

    def titoli_di(bolle, r_tit, visti, quanti=TITOLI_PER_LISTA):
        """I titoli non visti di queste bolle, ordinati dall'attivazione PER TITOLO (non della bolla)."""
        fuori = []
        for b in bolle:
            m = np.setdiff1d(np.where(MEM == b)[0], list(visti))
            if len(m):
                fuori.extend(m[np.argsort(-r_tit[m])][:quanti].tolist())
        return set(fuori)

    def stretto(att, r_tit, visti):
        """«non uscire dal tuo mondo»: la bolla di testa + i vicini immediati."""
        b1 = int(np.argmax(att))
        vicini = [int(x) for x in INTRA[b1] if x >= 0][:2]
        return titoli_di([b1] + vicini, r_tit, visti)

    def largo(att, r_tit, visti):
        """«voglio uscire»: otto mondi scelti per diversita' di FASCIA e MEDIUM, anche di nicchia."""
        ordine = np.argsort(-att)[:30]
        scelti = []
        for cb in ordine:
            cb = int(cb)
            meio = B.IS_TV[MEM == cb].mean() > 0.5
            if all(abs(np.log(max(VOTMED[cb], 1) / max(VOTMED[bb], 1))) > P.MONDI_DIVERSI_SOGLIA_FASCIA
                   or meio != (B.IS_TV[MEM == bb].mean() > 0.5) for bb in scelti):
                scelti.append(cb)
            if len(scelti) == 8:
                break
        return titoli_di(scelti, r_tit, visti)

    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(303).choice(pool, size=QUANTI_UTENTI * 2, replace=False)
    jac, dimensioni = [], {"stretto": [], "largo": []}
    usati = 0
    for u in utenti:
        if usati >= QUANTI_UTENTI:
            break
        righe, plays = storia(u)
        if len(righe) < P.BANCO_MIN_TITOLI:
            continue
        att, r_tit = ppr(righe, plays)
        visti = set(righe.tolist())
        a, b = stretto(att, r_tit, visti), largo(att, r_tit, visti)
        if not a or not b:
            continue
        jac.append(len(a & b) / len(a | b))
        dimensioni["stretto"].append(len(a))
        dimensioni["largo"].append(len(b))
        usati += 1
    print(f"\n  utenti: {usati} · titoli mostrati: stretto mediana "
          f"{int(np.median(dimensioni['stretto']))} · largo mediana "
          f"{int(np.median(dimensioni['largo']))}")
    print(f"\n  QUANTO SI SOMIGLIANO I DUE PORTAFOGLI (Jaccard sui TITOLI mostrati):")
    print(f"    mediana {np.median(jac):.2f} · p10 {np.percentile(jac, 10):.2f} · "
          f"p90 {np.percentile(jac, 90):.2f}")
    print(f"\n  lettura: Jaccard 1,00 = i due parametri opposti mostrano GLI STESSI TITOLI e gli slider")
    print(f"  sono decorativi. Vicino a 0,2-0,4 = la ricetta cambia davvero cosa si vede.")
    print(f"\n  E LA SECONDA META' DELLA DOMANDA NON E' MISURATA QUI: che siano MIGLIORI per quell'utente")
    print(f"  richiede un giudizio, e il banco che guarda il comportamento non lo puo' dare.")
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
