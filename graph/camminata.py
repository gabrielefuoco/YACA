"""camminata.py — LA CAMMINATA: potare, pesare, diffondere. Senza artefatti, senza I/O.

PERCHE' ESISTE. Prima di questo file la diffusione era **riscritta in dodici posti** — il motore piu' gli
undici arbitri — con tre varianti della stessa funzione di potatura (differenze cosmetiche: nomi di
variabile). Un cambiamento alla camminata andava fatto dodici volte, e ognuna poteva divergere.

**Importare il motore non era la risposta**: `Motore()` carica tutti gli artefatti in ~50 secondi, e un
arbitro non ne ha bisogno. Qui stanno le tre cose che servono a chi cammina, e **nessuna carica niente**:
le matrici, i pesi e i parametri arrivano da fuori.

    pota(M, k)                          la potatura: top-k archi per riga, poi simmetrizza
    transizione(M)                      la matrice di transizione (righe che sommano a 1)
    pesi_semi(righe, plays, NEP)        il peso dei semi: film min(plays,3), serie 1+2x(frazione episodi)
    diffondi(Tr, righe, pesi, ...)      PageRank personalizzato: l'attivazione PER TITOLO
    attiva_per_mondo(r, MEM, NB)        la somma sui membri: l'attivazione PER MONDO
"""
import numpy as np
import scipy.sparse as sp

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


def transizione(M):
    """La matrice riga-stocastica: ogni nodo distribuisce 1,0 di massa fra i suoi archi."""
    deg = np.asarray(M.sum(1)).ravel()
    deg[deg <= 0] = 1
    return sp.diags(1.0 / deg) @ M


PESO_TIPO_FATTORI = {"loved": 3.0, "liked": 2.0, "library": 1.5, "watched": 1.0}
"""I fattori del tipo di segnale, letti da PESO_TIPO (una stringa, per stare nella tabella)."""


def pesi_semi(righe, plays, NEP, tipi=None):
    """Il peso di ogni titolo della storia (§3b della mappa, esteso ai TIPI di segnale).

    film:  min(plays, PESO_FILM_MAX)                       «i plays vanno limitati»
    serie: 1 + 2 x (frazione di episodi visti)             le puntate NON contano come play

    `tipi` (facoltativo) e' un array di stringhe: "loved", "liked", "watched", "library". Il peso di
    base viene **moltiplicato** per il fattore del tipo. Senza `tipi` il comportamento e' quello di
    prima, bit per bit: e' il contratto della regressione.
    """
    nep = NEP[righe]
    pl = np.asarray(plays, float)
    base = np.where(nep > 1.0,
                    P.PESO_SERIE_BASE + P.PESO_SERIE_FASCIA * np.minimum(pl / nep, 1.0),
                    np.minimum(pl, P.PESO_FILM_MAX))
    if tipi is None:
        return base
    fattore = np.array([PESO_TIPO_FATTORI.get(str(t), 1.0) for t in tipi], float)
    return base * fattore


def ppr(Tr, seme, pesi=None, alpha=None, iters=None, normalizza=False):
    """PageRank personalizzato su una matrice di transizione GIA' PRONTA (vedi `transizione`).

    **L'unico posto dove sta il ciclo.** Prima era riscritto in NOVE arbitri (`alfa`, `cache`,
    `diffusione`, `freddo`, `lettura`, `liste`, `pesi`, `ricetta`, `soglia`), ognuno col suo. Il nucleo
    era identico parola per parola (`r = alpha*e + (1-alpha)*(r @ P)`), ma il giorno che uno di quelli
    avesse cambiato una riga, quel banco avrebbe misurato una VARIANTE del motore credendo di misurare
    il motore — la classe di errore che questo modulo ha gia' pagato piu' volte.

    Le tre varianti che gli arbitri usavano davvero, e che qui sono parametri invece che copie:
      · `pesi=None` -> seme **uniforme** (1/len). Serve a `diffusione.py`, che vuole il comportamento di
        un seme scelto a caso;
      · `normalizza=True` -> `r / r.sum()` in uscita, come faceva `ricetta.py` (e `diffondi`);
      · `alpha=None` -> `parametri.ALPHA`, ma gli arbitri passano il LORO valore, perche' alcuni lo
        leggono da una variabile d'ambiente (`ALPHA=0.9 python graph/measure/freddo.py`).
    """
    alpha = P.ALPHA if alpha is None else float(alpha)
    iters = P.ITER if iters is None else int(iters)
    e = np.zeros(Tr.shape[0], np.float64)
    if pesi is None:
        e[seme] = 1.0 / max(len(seme), 1)
    else:
        e[seme] = np.asarray(pesi, np.float64) / max(float(np.sum(pesi)), 1e-12)
    r = e.copy()
    for _ in range(iters):
        r = alpha * e + (1 - alpha) * (r @ Tr)
    return r / r.sum() if normalizza else r


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
