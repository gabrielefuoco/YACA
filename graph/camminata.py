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


def transizione_pronta(nome="bolle-eterogeneo-V10-p1.0-triangolo.npz", k=None):
    """LA TRANSIZIONE POTATA, CACHATA SU DISCO — 1,52M archi invece di 13,2M da riportare in giro.

    Il costo dell'avvio era qui: caricare il triangolo (6,6M archi), simmetrizzarlo (13,2M) e potarlo
    con un ciclo Python su 66.259 righe. Il risultato dipende SOLO dal triangolo e da `POTA_PER_RIGA`,
    quindi si salva — e l'artefatto porta le DUE IMPRONTE: se il triangolo cambia, o se cambia la
    potatura, si ricostruisce da solo invece di servire in silenzio una transizione vecchia. E' lo
    stesso patto di `canon.metadati()` e di `bolle.json`, e serve perche' la classe di errore che questo
    modulo combatte e' sempre la stessa: un artefatto vecchio e un parametro nuovo che si disallineano
    senza far crashare niente.
    """
    k = P.POTA_PER_RIGA if k is None else k
    z = K.DATA / "transizione-potata.npz"
    sha = K.sha_file(nome)
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
    # `np.add.at` INVECE DI `e[seme] = ...`. Con un indice duplicato l'assegnamento indicizzato di NumPy
    # SOVRASCRIVE, non somma: `e[[i,i]] = [3,7]` da' 7, non 10 — e la massa delle occorrenze precedenti
    # sparisce. Oggi le storie non hanno duplicati (verificato: zero su 60 utenti e 19.218 righe), quindi
    # e' un difetto LATENTE — ma e' il tipo che si accende il giorno che una storia arriva da un'altra
    # strada (un `--file` costruito a mano, un merge di liste, un tipo di segnale doppio) e che allora
    # produce pesi arbitrari invece che sbagliati in modo visibile.
    if pesi is None:
        np.add.at(e, seme, 1.0)
    else:
        np.add.at(e, seme, np.asarray(pesi, np.float64))
    e /= max(float(e.sum()), 1e-12)
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
