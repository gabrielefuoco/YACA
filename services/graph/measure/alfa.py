"""alfa.py — quanto lontano deve viaggiare la luce: α misurato su MOLTI utenti, non su due.

PERCHE' ESISTE. La prima lettura (`lettura.py`) ha mostrato che α=0,30 ordina meglio di α=0,15 — i
mondi *suoi* salgono, i mondi generici scendono. Ma era **un utente**. Con due utenti non si distingue
«α=0,3 e' meglio» da «quei due utenti sono fatti cosi'»: e' un azzardo, e il proprietario l'ha detto.

QUINDI: N utenti veri, e due misure OGGETTIVE — nessun giudizio da dare a occhio, nessuna soglia
arbitraria da scegliere:

  1. **LA LUCE CADE DOVE GUARDERAI?** Meta' storia e' il seme, l'altra meta' e' il bersaglio nascosto.
     Si misura quanta massa cade sui titoli nascosti, contro quanta ne cade su un insieme CASUALE della
     stessa dimensione: `lift = massa(nascosti) / massa(casuali)`. Se il lift e' ~1, la diffusione non
     distingue il tuo futuro da titoli a caso. E' la domanda piu' diretta che esista, e non ha soglie.
  2. **IL PORTAFOGLIO E' RIPRODUCIBILE?** Due meta' diverse della stessa storia devono accendere gli
     stessi mondi: Jaccard dei 10 mondi di testa. Una manopola che rende il risultato instabile non e'
     regolata bene, qualunque cosa mostri.

Un avvertimento che va scritto: i titoli nascosti **sono nel grafo** (i loro archi esistono). Questo
test misura «la diffusione trova i mondi che l'utente vive», non «indovina titoli mai visti». La
seconda cosa e' un test diverso, e non e' questo.

    python graph/measure/alfa.py            # ~10 minuti su 120 utenti
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
ALPHA = tuple(float(x) for x in os.environ.get("ALPHAS", f"0.15,0.30,0.45,{P.ALPHA}").split(","))
QUANTI_UTENTI = P.BANCO_UTENTI
ITER = P.ITER
MIN_TITOLI = P.BANCO_MIN_TITOLI
K_POTA = P.POTA_PER_RIGA
EMIVITA = 365.0


pota = _cam.pota     # la camminata sta in graph/camminata.py (era copiata qui)


def storia(u):
    """(righe, pesi) — il peso e' recenza x ri-visioni, ma la lettura sta in `canon.storia_trakt`.

    Il peso e' LA STESSA formula di prima (1 + log(plays)) x 0,5^(eta/EMIVITA), ricostruita dall'eta' che
    `storia_trakt` restituisce. Quello che cambia e' l'ORDINE: prima era l'ordine del file — tutti i film
    e poi tutte le serie — e questo banco ci misurava sopra il taglio passato/futuro.
    """
    _ch, righe, plays, eta = K.storia_trakt(u, ordine="cronologico")
    pesi = (1 + np.log(plays.astype(float))) * 0.5 ** (eta / EMIVITA)
    return righe, pesi


def ppr(P, seme, pesi, alpha, iters=ITER):
    """Il ciclo sta in `camminata.ppr`: qui solo la firma, perche' i punti di chiamata non cambino."""
    return _cam.ppr(P, seme, pesi, alpha=alpha, iters=iters)


def top10(r, MEM):
    nb = np.bincount(MEM, weights=r, minlength=int(MEM.max()) + 1)
    return set(np.argsort(-nb)[:10].tolist())


def stampa_tabella(dati, usati, finale=False):
    print(f"\n  ── utenti usati finora: {usati}" + ("" if not finale else " (finale)"), flush=True)
    print(f"  {'α':>5} {'lift titoli':>12} {'lift bolle':>11} {'rango bolle':>12} "
          f"{'testa':>7} {'sopra 0,5%':>11} {'stabilita':>10}", flush=True)
    for a in ALPHA:
        d = dati[a]
        if not d["testa"]:
            continue
        print(f"  {a:>5.2f} {np.median(d['lift_titoli']):>11.2f}x {np.median(d['lift_bolle']):>10.2f}x "
              f"{np.median(d['rango_bolle']):>12.0f} {100*np.median(d['testa']):>6.1f}% "
              f"{np.median(d['sopra05']):>11.0f} {np.median(d['stab']):>10.2f} "
              f"{100*np.median(d['semi']):>11.0f}%", flush=True)


def main():
    print("=" * 104)
    print("QUANTO LONTANO DEVE VIAGGIARE LA LUCE — α su molti utenti, con due misure oggettive")
    print("=" * 104, flush=True)

    q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
    N = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    Ws = (W + W.T).tocsr()
    MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    NB = int(MEM.max()) + 1
    Wp = pota(Ws, K_POTA)
    print(f"  grafo potato top-{K_POTA}: {Wp.nnz:,} archi ({time.time()-T0:.0f}s)", flush=True)
    deg = np.asarray(Wp.sum(1)).ravel()
    deg[deg <= 0] = 1
    P = sp.diags(1.0 / deg) @ Wp

    pool = []
    for f in sorted(K.TK.glob("movie-*.json")):
        u = f.stem[6:]
        if (K.TK / f"show-{u}.json").exists():
            pool.append(u)
    rng = np.random.default_rng(23)
    utenti = rng.choice(pool, size=min(QUANTI_UTENTI * 2, len(pool)), replace=False)

    dati = {a: {"lift_titoli": [], "lift_bolle": [], "rango_bolle": [], "testa": [],
                "sopra05": [], "stab": [], "nascosti": [], "semi": []} for a in ALPHA}
    usati = 0
    for u in utenti:
        if usati >= QUANTI_UTENTI:
            break
        righe, pesi = storia(u)
        if len(righe) < MIN_TITOLI:
            continue
        # due meta' DISGIUNTE: A semina, B e' il bersaglio nascosto (e A2 serve alla stabilita')
        perm = np.random.default_rng(7).permutation(len(righe))
        A, B_ = perm[:len(perm) // 2], perm[len(perm) // 2:]
        A2 = np.random.default_rng(8).permutation(len(righe))[:len(perm) // 2]
        bolle_A = set(MEM[righe[A]].tolist())
        bolle_B = np.array(sorted(set(MEM[righe[B_]].tolist())))
        # un insieme CASUALE della stessa dimensione di B: il termine di paragone
        idx_caso = np.random.default_rng(9).choice(N, size=len(B_), replace=False)
        for a in ALPHA:
            r = ppr(P, righe[A], pesi[A], a)
            tot = r.sum()
            d = dati[a]
            d["lift_titoli"].append(float(r[righe[B_]].sum() / max(r[idx_caso].sum(), 1e-12)))
            nb = np.bincount(MEM, weights=r, minlength=NB)
            att = nb / tot
            d["lift_bolle"].append(float(att[bolle_B].sum() / max(len(bolle_B) / NB, 1e-12)))
            o = np.argsort(-att)
            pos = {int(b): i for i, b in enumerate(o)}
            d["rango_bolle"].append(float(np.median([pos[int(b)] for b in bolle_B])))
            d["testa"].append(float(att.max()))
            d["sopra05"].append(int((att > 0.005).sum()))
            d["nascosti"].append(len(bolle_B))
            d["stab"].append(len(top10(r, MEM) & top10(ppr(P, righe[A2], pesi[A2], a), MEM)) /
                             len(top10(r, MEM) | top10(ppr(P, righe[A2], pesi[A2], a), MEM)))
            # LA LUCE CHE SI SPRECA: quella che resta sui titoli GIA' VISTI. Nei risultati quei titoli
            # sono esclusi, quindi ogni punto di massa che li tocca e' massa che non produce nulla.
            d["semi"].append(float(r[righe[A]].sum() / tot))
        usati += 1
        if usati % 20 == 0:
            print(f"    {usati} utenti ({time.time()-T0:.0f}s)", flush=True)
            stampa_tabella(dati, usati)

    print(f"\n  utenti usati: {usati} (con >= {MIN_TITOLI} titoli in canone) · "
          f"titoli nascosti per utente: mediana {int(np.median(dati[ALPHA[0]]['nascosti']))}\n")
    print(f"  {'α':>5} {'lift titoli':>12} {'lift bolle':>11} {'rango bolle':>12} "
          f"{'testa':>7} {'sopra 0,5%':>11} {'stabilita':>10} {'sui visti':>10}")
    for a in ALPHA:
        d = dati[a]
        print(f"  {a:>5.2f} {np.median(d['lift_titoli']):>11.2f}x {np.median(d['lift_bolle']):>10.2f}x "
              f"{np.median(d['rango_bolle']):>12.0f} {100*np.median(d['testa']):>6.1f}% "
              f"{np.median(d['sopra05']):>11.0f} {np.median(d['stab']):>10.2f} "
              f"{100*np.median(d['semi']):>9.0f}%")
    print(f"\n  lift titoli  = quanta PIU' massa cade sui titoli che l'utente guardera' che su titoli a caso")
    print(f"  lift bolle   = la stessa cosa sui MONDI (bolle), contro un insieme casuale di pari numero")
    print(f"  rango bolle  = posizione mediana dei mondi nascosti nella classifica (basso = meglio)")
    print(f"  stabilita'   = Jaccard dei 10 mondi di testa fra due meta' diverse della stessa storia")
    print(f"\nFINE ({time.time()-T0:.0f}s)")


if __name__ == "__main__":
    main()
