"""camminata.py — LA CAMMINATA: potare, pesare, diffondere. Senza artefatti, senza I/O.

PERCHE' ESISTE. Prima di questo file la diffusione era **riscritta in dodici posti** — il motore piu' gli
undici arbitri — con tre varianti della stessa funzione di potatura (differenze cosmetiche: nomi di
variabile). Un cambiamento alla camminata andava fatto dodici volte, e ognuna poteva divergere.

**Importare il motore non era la risposta**: `Motore()` carica tutti gli artefatti in ~50 secondi, e un
arbitro non ne ha bisogno. Qui stanno le tre cose che servono a chi cammina, e **nessuna carica niente**:
le matrici, i pesi e i parametri arrivano da fuori.

    pota(M, k)                          la potatura: top-k archi per riga, poi simmetrizza
    transizione(M)                      la matrice di transizione (righe che sommano a 1)
    transizione_pronta(nome, k)         la stessa, cachata su disco (le due impronte dentro)
    pesi_semi(righe, plays, NEP)        il peso dei semi: film min(plays,3), serie 1+2x(frazione episodi)
    diffondi(Tr, righe, pesi, ...)      PageRank personalizzato: l'attivazione PER TITOLO
    attiva_per_mondo(r, MEM, NB)        la somma sui membri: l'attivazione PER MONDO
"""
from typing import Any
import numpy as np
import scipy.sparse as sp

from graph import canon as K
from graph import parametri as P


def pota(M, k=None):
    """Top-k archi per riga per peso, poi simmetrizza. Il k viene da `parametri.POTA_PER_RIGA`."""
    k = P.POTA_PER_RIGA if k is None else k
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


def transizione_pronta(nome=None, k=None):
    """LA TRANSIZIONE POTATA, CACHATA SU DISCO — 1,52M archi invece di 13,2M da riportare in giro.

    Il costo dell'avvio era qui: caricare il triangolo (6,6M archi), simmetrizzarlo (13,2M) e potarlo
    con un ciclo Python su 66.259 righe. Il risultato dipende SOLO dal triangolo e da `POTA_PER_RIGA`,
    quindi si salva — e l'artefatto porta le DUE IMPRONTE: se il triangolo cambia, o se cambia la
    potatura, si ricostruisce da solo invece di servire in silenzio una transizione vecchia. E' lo
    stesso patto di `canon.metadati()` e di `bolle.json`, e serve perche' la classe di errore che questo
    modulo combatte e' sempre la stessa: un artefatto vecchio e un parametro nuovo che si disallineano
    senza far crashare niente.
    """
    # IL NOME VIENE DAI PARAMETRI: era un default scritto nella firma, e cambiare artefatto voleva dire
    # modificare il codice invece di un parametro (e la cache restava buona per l'artefatto sbagliato).
    nome = nome or P.TRIANGOLO
    k = P.POTA_PER_RIGA if k is None else k
    z = K.DATA / "transizione-potata.npz"
    # LA CHIAVE E' LA PROVENIENZA, NON LO SHA DEL FILE (ticket 12). Lo sha del file cambia anche per
    # un riordino degli archi a parita' di contenuto, e NON cambia quando cambia cio' che il file
    # significa: la chiusura si applica DOPO il mixer e trasforma i pesi senza toccare la topologia,
    # quindi un artefatto "chiuso" e uno "non chiuso" hanno lo stesso numero di archi e cache diverse
    # solo se qualcuno se ne ricorda. Con la provenienza la cache si invalida da sola.
    from . import provenance as _PV
    sha = _PV.chiave_cache(K.A(nome), pota=int(k))
    if z.exists():
        d = np.load(z)
        if str(d["triangolo_sha"]) == sha and int(d["k"]) == int(k):
            return sp.csr_matrix((d["data"], d["indices"], d["indptr"]),
                                 shape=tuple(int(x) for x in d["shape"])).tocsr()
        print("  transizione-potata: il triangolo o la potatura sono cambiati, ricostruisco", flush=True)
    q = np.load(K.A(nome))
    n = int(q["indptr"].shape[0]) - 1
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n)).tocsr()
    Tr = transizione(pota((W + W.T).tocsr(), k))
    np.savez_compressed(z, data=Tr.data, indices=Tr.indices, indptr=Tr.indptr,
                        shape=np.array(Tr.shape), triangolo_sha=np.array(sha), k=np.array(int(k)))
    print(f"  transizione-potata: costruita e salvata ({z.stat().st_size/1e6:.1f} MB)", flush=True)
    return Tr


def transizione(M):
    """La matrice riga-stocastica: ogni nodo distribuisce 1,0 di massa fra i suoi archi."""
    deg = np.asarray(M.sum(1)).ravel()
    deg[deg <= 0] = 1
    return sp.diags(1.0 / deg) @ M


PESO_TIPO_FATTORI = P.PESO_TIPO
"""I fattori del tipo di segnale. LA FONTE E' `parametri.PESO_TIPO` (un dizionario in tabella): qui
resta solo il nome con cui questo modulo lo chiama, perche' `pipeline.py` lo importa da qui."""


def calcola_peso_segnale(base_val: float, t: Any) -> float:
    """Calcola il peso effettivo del seme applicando le regole canoniche sui segnali:
    - only in library, never watched -> 1
    - watched (any plays) -> base, library ignored even if present
    - liked -> 2, library ignored
    - loved -> 3, library ignored
    - loved + watched 3x -> min(5, base+2) = 5
    - loved + watched 3x + library -> 5 (library ignored)

    La libreria è un segnale alternativo: decade non appena il titolo ha qualsiasi altro segnale.
    """
    if t is None:
        return float(base_val)

    if isinstance(t, str):
        t_low = t.lower()
        if t_low == "library":
            return 1.0
        elif t_low == "watched":
            return float(base_val)
        elif t_low == "liked":
            return 2.0
        elif t_low == "loved":
            return 3.0
        else:
            return float(base_val) * PESO_TIPO_FATTORI.get(t_low, 1.0)

    signals: set[str] = set()
    watched_flag: bool | None = None
    library_only = False

    items = t if isinstance(t, (list, tuple, set)) else [t]
    for it in items:
        if isinstance(it, dict):
            s_name = it.get("type", it.get("tipo"))
            if s_name:
                signals.add(str(s_name).lower())
            if "signals" in it and isinstance(it["signals"], (list, tuple, set)):
                for sub in it["signals"]:
                    sub_name = sub.get("type", sub.get("tipo")) if isinstance(sub, dict) else sub
                    if sub_name:
                        signals.add(str(sub_name).lower())
            if it.get("watched") is False:
                watched_flag = False
                if not s_name and "signals" not in it:
                    signals.add("library")
            elif it.get("watched") is True:
                watched_flag = True
            if it.get("library_only"):
                library_only = True
                signals.add("library")
        elif it is not None:
            signals.add(str(it).lower())

    other_signals = signals - {"library"}
    if other_signals:
        # Library is an alternative signal, dropped as soon as the title has any other signal!
        has_watched = ("watched" in other_signals) or (watched_flag is True)
        has_loved = "loved" in other_signals
        has_liked = "liked" in other_signals

        if has_watched:
            bonus = 0.0
            if has_loved:
                bonus += 2.0
            elif has_liked:
                bonus += 1.0
            return min(5.0, float(base_val) + bonus)
        elif has_loved:
            bonus = 3.0
            if has_liked:
                bonus = min(5.0, bonus + 1.0)
            return bonus
        elif has_liked:
            return 2.0
        else:
            return max(PESO_TIPO_FATTORI.get(s, 1.0) for s in other_signals)

    if "library" in signals:
        # Only in library, never watched -> 1
        return 1.0

    return float(base_val)


def pesi_semi(righe, plays, NEP, tipi=None):
    """Il peso di ogni titolo della storia (§3b della mappa, esteso ai TIPI di segnale).

    film:  min(plays, PESO_FILM_MAX)                       «i plays vanno limitati»
    serie: 1 + 2 x (frazione di episodi visti)             le puntate NON contano come play

    `tipi` (facoltativo) e' un array di stringhe o liste di segnali ("loved", "liked", "watched", "library").
    Regola dei segnali e della libreria (Capitolo 5):
    - only in library, never watched -> 1
    - watched (any plays) -> base, library ignored even if present
    - liked -> 2, library ignored
    - loved -> 3, library ignored
    - loved + watched 3x -> min(5, base+2) = 5
    - loved + watched 3x + library -> 5 (library ignored)
    """
    nep = NEP[righe]
    pl = np.asarray(plays, float)
    base = np.where(nep > 1.0,
                    P.PESO_SERIE_BASE + P.PESO_SERIE_FASCIA * np.minimum(pl / nep, 1.0),
                    np.minimum(pl, P.PESO_FILM_MAX))
    if tipi is None:
        return base

    out = np.empty(len(righe), dtype=float)
    for i, t in enumerate(tipi):
        out[i] = calcola_peso_segnale(base[i], t)
    return out


def ppr(Tr, seme, pesi=None, alpha=None, iters=None, normalizza=False, tol=None):
    """PageRank personalizzato su una matrice di transizione GIA' PRONTA (vedi `transizione`).

    Delega a `ppr_multi` con colonna singola per garantire identità matematica di calcolo,
    early stopping e gestione del dtype (`Tr.dtype`).
    """
    dtype = Tr.dtype
    E = np.zeros((Tr.shape[0], 1), dtype=dtype)
    if pesi is None:
        np.add.at(E[:, 0], seme, dtype.type(1.0))
    else:
        np.add.at(E[:, 0], seme, np.asarray(pesi, dtype))
    e_sum = float(E[:, 0].sum())
    if e_sum >= 1e-12:
        E[:, 0] /= e_sum
    R = ppr_multi(Tr, E, alpha=alpha, iters=iters, normalizza=normalizza, tol=tol)
    return R[:, 0]


def ppr_multi(Tr, E, alpha=None, iters=None, normalizza=False, tol=None, TrT=None):
    """PageRank personalizzato batched per B vettori di riavvio (colonne della matrice densa E).

    Args:
        Tr: Matrice di transizione riga-stocastica CSR (n, n).
        E: Matrice densa (n, B) dei vettori di riavvio (ciascuna colonna normalizzata a somma 1).
        alpha: Probabilità di riavvio (default P.ALPHA).
        iters: Numero massimo di iterazioni (default P.ITER, hard-capped a P.ITER).
        normalizza: Se True, normalizza ciascuna colonna a somma 1 in uscita.
        tol: Tolleranza di convergenza L1 (default P.PPR_TOL). Se <= 0, esegue tutte le iterazioni.
        TrT: Matrice trasposta CSR opzionale precalcolata per efficienza del kernel (Tr.T.tocsr()).

    Returns:
        Matrice densa R di dimensione (n, B) con le distribuzioni stazionarie per colonna.
    """
    alpha = P.ALPHA if alpha is None else float(alpha)
    max_iters = P.ITER if iters is None else min(int(iters), P.ITER)
    tol_val = getattr(P, "PPR_TOL", 1e-5) if tol is None else float(tol)

    dtype = Tr.dtype
    if E.dtype != dtype:
        E = E.astype(dtype, copy=False)

    if TrT is None:
        TrT = Tr.T.tocsr()
    elif TrT.dtype != dtype:
        TrT = TrT.astype(dtype, copy=False)

    B = E.shape[1]
    if B == 0:
        return E.copy()

    alpha_val = dtype.type(alpha)
    beta_val = dtype.type(1.0 - alpha)
    alpha_E = alpha_val * E

    R = E.copy()
    if tol_val > 0.0:
        active = np.ones(B, dtype=bool)
        diff = np.empty_like(R)
        for _ in range(max_iters):
            R_next = TrT @ R
            R_next *= beta_val
            R_next += alpha_E

            np.subtract(R_next, R, out=diff)
            np.abs(diff, out=diff)
            deltas = np.sum(diff, axis=0)

            R[:, active] = R_next[:, active]
            active[active] = deltas[active] >= tol_val
            if not active.any():
                break
    else:
        for _ in range(max_iters):
            R_next = TrT @ R
            R_next *= beta_val
            R_next += alpha_E
            R = R_next

    if normalizza:
        col_sums = np.sum(R, axis=0, dtype=np.float64)
        col_sums[col_sums < 1e-12] = 1.0
        R = (R / col_sums).astype(dtype, copy=False)

    return R


def diffondi(Tr, righe, plays, NEP, alpha=None, iters=None, tipi=None):
    """PageRank personalizzato. Restituisce l'attivazione **per titolo**, normalizzata a somma 1.

    `Tr` e' la matrice di transizione (vedi `transizione`), `NEP` il numero di episodi per titolo.
    Il restart `alpha` viene da `parametri.ALPHA` — misurato su 120 utenti.
    """
    w = pesi_semi(righe, plays, NEP, tipi)
    return ppr(Tr, righe, w, alpha=alpha, iters=iters, normalizza=True)


def attiva_per_mondo(r, MEM, NB):
    """L'attivazione PER MONDO: una somma sui membri, che e' anche il motivo per cui si legge."""
    return np.bincount(MEM, weights=r, minlength=NB) / r.sum()
