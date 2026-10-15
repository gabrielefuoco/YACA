"""soglia.py — quando un mondo conta come acceso, e cosa deve portare il pacchetto.

DUE DOMANDE, una misura sola.

1. LA SOGLIA. Oggi «un mondo acceso» e' «sopra lo 0,5%», ed e' una scelta dell'autore: allo 0,1% i
   mondi diventano 241 invece di 22. Va ancorata a qualcosa di esterno. L'ancora e' il NULLO: la
   stessa diffusione da una storia **casuale della stessa dimensione**. Se una storia finta non
   accende nessun mondo sopra una soglia, allora quella soglia distingue davvero; se ne accende
   trenta, sta misurando la dimensione della storia, non il gusto.

2. IL PACCHETTO. Nella prima lettura l'attivazione **grezza** e quella **per film** hanno ordinato i
   mondi in modo diverso, e sembravano dire cose diverse. Qui si misura se e' vero: quante volte i
   primi 10 mondi (per grezzo, e per film) contengono un titolo che l'utente guardera' davvero, e
   quanti dei titoli nascosti ci stanno dentro. Se i due ordinamenti si equivalgono, il campo per
   film e' un di piu' e va tolto; se differiscono, e' un campo che serve e va nel contratto.

    python graph/measure/soglia.py          # ~4 minuti su 120 utenti
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
ALPHA = float(os.environ.get("ALPHA", P.ALPHA))
QUANTI_UTENTI = P.BANCO_UTENTI
ITER = P.ITER
K_POTA = P.POTA_PER_RIGA
MIN_TITOLI = P.BANCO_MIN_TITOLI
EMIVITA = 365.0
SOGLIE = (0.005, 0.002, 0.001, 0.0005, 0.0002, 0.0001)
NULLI = 3


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
    import pandas as pd
    righe, pesi = [], []
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
                eta = (pd.Timestamp.now(tz="UTC") - pd.Timestamp(voce.get("last_watched_at"))).days
            except Exception:
                eta = 3650
            righe.append(r)
            pesi.append((1 + np.log(int(voce.get("plays") or 1))) * 0.5 ** (eta / EMIVITA))
    return np.array(righe, np.int64), np.array(pesi, np.float64)


def ppr(P, seme, pesi, iters=ITER):
    e = np.zeros(P.shape[0], np.float64)
    e[seme] = pesi / pesi.sum()
    r = e.copy()
    for _ in range(iters):
        r = ALPHA * e + (1 - ALPHA) * (r @ P)
    return r


def attivazione(r, MEM, NB):
    nb = np.bincount(MEM, weights=r, minlength=NB)
    return nb / r.sum()


def main():
    print("=" * 104)
    print(f"SOGLIA E PACCHETTO — α={ALPHA} · {QUANTI_UTENTI} utenti · il nullo sono {NULLI} storie casuali")
    print("=" * 104, flush=True)

    q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
    N = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    Ws = (W + W.T).tocsr()
    MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    NB = int(MEM.max()) + 1
    SZ = np.bincount(MEM)
    DaBolla = [np.where(MEM == b)[0] for b in range(NB)]
    Wp = pota(Ws, K_POTA)
    deg = np.asarray(Wp.sum(1)).ravel()
    deg[deg <= 0] = 1
    P = sp.diags(1.0 / deg) @ Wp
    print(f"  grafo potato top-{K_POTA}: {Wp.nnz:,} archi · {NB:,} mondi ({time.time()-T0:.0f}s)",
          flush=True)

    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(31).choice(pool, size=min(QUANTI_UTENTI * 2, len(pool)),
                                              replace=False)

    sopra = {s: {"utente": [], "nullo": []} for s in SOGLIE}
    massimi = {"utente": [], "nullo": [], "nullo_99": []}
    hit = {"grezzo": [], "perfilm": [], "nullo": []}
    rec = {"grezzo": [], "perfilm": []}
    taglia = {"grezzo": [], "perfilm": []}
    usati = 0
    for u in utenti:
        if usati >= QUANTI_UTENTI:
            break
        righe, pesi = storia(u)
        if len(righe) < MIN_TITOLI:
            continue
        perm = np.random.default_rng(7).permutation(len(righe))
        A, Bt = perm[:len(perm) // 2], perm[len(perm) // 2:]
        att_u = attivazione(ppr(P, righe[A], pesi[A]), MEM, NB)
        nascosti = set(righe[Bt].tolist())
        for s in SOGLIE:
            sopra[s]["utente"].append(int((att_u > s).sum()))
        massimi["utente"].append(float(att_u.max()))
        # i primi 10 mondi nei due ordinamenti, e cosa contengono di nascosto
        for nome, ordine in (("grezzo", np.argsort(-att_u)),
                             ("perfilm", np.argsort(-(att_u / np.maximum(SZ, 1))))):
            primi = ordine[:10]
            colpiti = sum(1 for b in primi if nascosti & set(DaBolla[int(b)].tolist()))
            dentro = sum(1 for x in nascosti if int(MEM[x]) in set(int(b) for b in primi))
            hit[nome].append(colpiti / 10)
            rec[nome].append(dentro / max(len(nascosti), 1))
            taglia[nome].append(float(np.median(SZ[primi])))
        # il NULLO: stesse dimensioni, titoli a caso, stessi pesi
        for giro in range(NULLI):
            ran = np.random.default_rng(100 + giro).choice(N, size=len(A), replace=False)
            att_n = attivazione(ppr(P, ran, pesi[A]), MEM, NB)
            for s in SOGLIE:
                sopra[s]["nullo"].append(int((att_n > s).sum()))
            massimi["nullo"].append(float(att_n.max()))
            massimi["nullo_99"].append(float(np.percentile(att_n, 99.9)))
            if giro == 0:
                primi = np.argsort(-att_n)[:10]
                hit["nullo"].append(sum(1 for b in primi
                                        if nascosti & set(DaBolla[int(b)].tolist())) / 10)
        usati += 1
        if usati % 30 == 0:
            print(f"    {usati} utenti ({time.time()-T0:.0f}s)", flush=True)

    print(f"\n  utenti usati: {usati} · titoli che seminano: mediana "
          f"{int(np.median([len(storia(u)[0]) for u in utenti[:20]]))//2} · "
          f"titoli nascosti: mediana {int(np.median([len(righe)]))}\n")
    print("  LA SOGLIA — mondi sopra la soglia, mediana fra gli utenti")
    print(f"  {'soglia':>8} {'UTENTE':>8} {'nullo (max su ' + str(NULLI) + ')':>20} {'rapporto':>10}")
    for s in SOGLIE:
        u_ = np.median(sopra[s]["utente"])
        n_ = np.median(sopra[s]["nullo"])
        print(f"  {100*s:>7.2f}% {u_:>8.0f} {n_:>20.0f} {u_/max(n_, 0.5):>10.1f}x")
    print(f"\n  la bolla PIU' accesa: utente {100*np.median(massimi['utente']):.2f}% · "
          f"nullo {100*np.median(massimi['nullo']):.2f}% (massimo su {NULLI} estrazioni) · "
          f"nullo p99,9 {100*np.median(massimi['nullo_99']):.3f}%")

    print(f"\n  IL PACCHETTO — i primi 10 mondi per GREZZO e per FILM")
    print(f"  {'ordinamento':>12} {'mondi con un titolo nascosto':>30} {'titoli nascosti dentro':>24} "
          f"{'taglia mediana':>15}")
    for nome in ("grezzo", "perfilm", "nullo"):
        h = np.median(hit[nome])
        r_ = f"{100*np.median(rec[nome]):>23.0f}%" if nome in rec else f"{'—':>24}"
        t = f"{np.median(taglia[nome]):>15.0f}" if nome in taglia else f"{'—':>15}"
        print(f"  {nome:>12} {100*h:>29.0f}% {r_} {t}")
    print(f"\n  lettura: se 'perfilm' trova piu' titoli nascosti di 'grezzo', il campo serve;")
    print(f"  se sono uguali, e' un di piu' da togliere.")
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
