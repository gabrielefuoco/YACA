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
from graph import camminata as _cam
from graph import motore as MO
from graph import canon as K
from graph import parametri as P

T0 = time.time()
QUANTI_UTENTI = int(os.environ.get("UTENTI", 60))
TITOLI_TOTALI = 40
LARGHEZZA_BASE = 4


pota = _cam.pota     # la camminata sta in graph/camminata.py (era copiata qui)


def storia(u):
    """(righe, plays) in ordine CRONOLOGICO — la lettura sta in `canon.storia_trakt`, una sola.

    Qui c'erano ~25 righe che riaprivano i JSON di Trakt e chiamavano `pd.Timestamp` dentro il ciclo,
    per ogni titolo di ogni utente: una delle nove copie della stessa lettura (ticket 30). L'ordine e'
    lo stesso di prima (`-eta`: il piu' vecchio per primo) ma la tie-break e' `stable`, quindi e'
    DETERMINISTICO — prima dipendeva dall'ordinamento instabile di NumPy.
    """
    _chiavi, righe, plays, _eta = K.storia_trakt(u, ordine="cronologico")
    return righe, plays


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
    # L'ASSE NUOVO «cozy / impegnativo»: non e' nella fascia ne' nella distanza, e il meccanismo non
    # ha niente su cui instradarlo — ma i GENERI li abbiamo. Liste PROVVISORIE, e la curatela e' del
    # proprietario: qui servono solo a vedere se l'asse morde e se le liste si svuotano.
    COZY_ID = {35, 10751, 10749, 16}            # commedia · famiglia · romantico · animazione
    IMP_ID = {99, 36, 10752}                    # documentario · storico · guerra
    COZY = np.zeros(N, bool)
    IMP = np.zeros(N, bool)
    for tipo, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", "genres"])
        for i, g in zip(d["id"], d["genres"]):
            r = B.ROW_OF.get(f"{tipo}:{int(i)}")
            if r is None:
                continue
            try:
                voci = json.loads(g) if isinstance(g, str) else (g or [])
            except Exception:
                voci = []
            ids = {int(x["id"]) for x in voci if isinstance(x, dict) and "id" in x}
            COZY[r] = bool(ids & COZY_ID)
            IMP[r] = bool(ids & IMP_ID)
    print(f"  asse cozy/impegnativo (provvisorio): cozy {int(COZY.sum()):,} titoli · "
          f"impegnativo {int(IMP.sum()):,} ({time.time()-T0:.0f}s)", flush=True)
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

    # IL MOTORE VERO, non una sua imitazione. Fino al 16/10/2026 questo arbitro misurava DUE varianti
    # che il prodotto non ha: `att_con_asse` usava la formula lineare `att * (1 + 0.5*(quota-0.5))`
    # invece dell'esponenziale di `Motore.modula`, e la «fascia» RIORDINAVA i mondi per voti mediani
    # invece di modulare l'attivazione con lo slider. Quindi le sue conclusioni — «il cozy cambia un
    # terzo dei titoli», «la fascia fa crollare la copertura» — descrivevano un comportamento che il
    # motore non ha. Adesso si chiama `Motore` (che costa 0,28 s: non c'e' piu' nessuna ragione per
    # ricopiarne le formule), e le varianti di FILTRO restano come CONTROPROVA: sono l'esperimento che
    # ha mostrato che filtrare dentro i mondi svuota le liste, ed e' la ragione per cui il prodotto
    # modula invece di filtrare.
    M = MO.Motore(silenzioso=True)
    print(f"  motore pronto ({time.time()-T0:.0f}s)", flush=True)

    def ppr(seme, plays):
        """Il peso inline era `pesi_semi` senza il fattore di tipo: adesso e' `pesi_semi`."""
        return _cam.ppr(Pm, seme, _cam.pesi_semi(seme, plays, NEP),
                        alpha=P.ALPHA, iters=P.ITER, normalizza=True)

    def titoli(bolle, r_tit, visti, quanti, filtro=None):
        fuori = []
        for b in bolle:
            m = np.setdiff1d(np.where(MEM == b)[0], list(visti))
            if filtro is not None:
                m = m[filtro[m]]
            if len(m):
                fuori.extend(m[np.argsort(-r_tit[m])][:quanti].tolist())
        return set(fuori)

    # LE VARIANTI SONO SLIDER DEL PRODOTTO, non parametri inventati: `modula` per gli assi,
    # `scegli_mondi` per la larghezza e la distanza. `filtro` resta e non e' uno slider: e' la
    # controprova di cosa NON si deve fare.
    varianti = [("base", dict(quante=LARGHEZZA_BASE)),
                ("+ largo", dict(quante=LARGHEZZA_BASE * 2)),
                ("+ lontano", dict(quante=LARGHEZZA_BASE, lontano=1.0)),
                ("+ nicchia", dict(quante=LARGHEZZA_BASE, canone=-1.0)),
                ("+ popolare", dict(quante=LARGHEZZA_BASE, canone=+1.0)),
                ("+ cozy", dict(quante=LARGHEZZA_BASE, filtro=COZY)),
                ("+ impegnativo", dict(quante=LARGHEZZA_BASE, filtro=IMP)),
                ("+ cozy pesato", dict(quante=LARGHEZZA_BASE, cozy=+1.0)),
                ("+ impegn. pesato", dict(quante=LARGHEZZA_BASE, cozy=-1.0))]

    pool = [f.stem[6:] for f in sorted(K.TK.glob("movie-*.json"))
            if (K.TK / f"show-{f.stem[6:]}.json").exists()]
    utenti = np.random.default_rng(404).choice(pool, size=QUANTI_UTENTI * 2, replace=False)
    jac = {n: [] for n, _ in varianti[1:]}
    oro_preso = {n: [] for n, _ in varianti}
    riempimento = {n: [] for n, _ in varianti}
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
        # GLI ASSI DEDOTTI DALLA STORIA: servono al slider `canone`, che sposta la finestra attorno al
        # profilo invece di spingere verso l'estremo (ticket 06).
        dedotto = M.deduci(list(semi))
        # ATTENZIONE, e questo era un bug: dal portafoglio si escludono i SEMI, non tutta la storia.
        # Escludendo anche l'oro, «titoli del futuro presi» risultava strutturalmente zero.
        visti = set(semi.tolist())
        pezzi = {}
        for nome, kw in varianti:
            quante = kw.get("quante", LARGHEZZA_BASE)
            filtro = kw.get("filtro")
            slider = {k: v for k, v in kw.items() if k in ("cozy", "canone")}
            if slider:
                slider["largo"] = quante
                att2 = M.modula(att, slider, dedotto)
            else:
                att2 = att
            bolle = M.scegli_mondi(att2, {"largo": quante, "lontano": kw.get("lontano", 0.0)})
            per = max(TITOLI_TOTALI // max(len(bolle), 1), 2)
            t = titoli(bolle, r_tit, visti, per, filtro)
            pezzi[nome] = t
            riempimento[nome].append(len(t))
            oro_preso[nome].append(len(t & oro) / len(oro))
        for nome in jac:
            jac[nome].append(len(pezzi["base"] & pezzi[nome]) / len(pezzi["base"] | pezzi[nome]))
        if len(esempi) < 2:
            esempi.append((u, {k: v for k, v in pezzi.items()}, len(oro)))
        usati += 1

    print(f"\n  utenti: {usati} · titoli per portafoglio: {TITOLI_TOTALI}\n")
    print(f"  {'variante':>12} {'Jaccard vs base':>17} {'titoli del futuro presi':>26} {'ne restano':>12}")
    for nome, _ in varianti:
        j = f"{np.median(jac[nome]):.2f}" if nome in jac else "— (e' la base)"
        print(f"  {nome:>12} {j:>17} {100*np.median(oro_preso[nome]):>25.1f}% "
              f"{int(np.median(riempimento[nome])):>12}")
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
