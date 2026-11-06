"""delta.py — aggiungere titoli nuovi a un grafo diretto senza rompere la simmetrizzazione.

IL PROBLEMA (ticket 10). L'artefatto e' diretto e append-only: si aggiunge solo la riga del titolo
nuovo, quindi la sua colonna resta vuota e `min(W, W.T)` — o `pota((W+W.T), k)` — azzera tutti i suoi
archi. Per questo `aggiorna.py` esiste ma il timer notturno non e' mai stato acceso.

L'IDEA. Per un titolo nuovo gli archi escono da tipi gia' simmetrici (coseno dello studente, TRAMA,
KWSEM, CAST, DIR, COLL): la mancata reciprocita' dipende SOLO dal troncamento top-k delle righe dei
vecchi nodi. Basta conservare, per ogni riga, il peso del k-esimo vicino (`kth`): se l'arco nuovo vale
almeno quello, l'arco reciproco sarebbe nella top-k anche per il vecchio nodo, e si puo' iniettare.
Quando entra, si sfila il piu' debole: cosi' la riga resta di k elementi come in una ricostruzione
completa (senza sfratto le righe crescerebbero di uno a ogni aggiornamento).

    paia(W, k)                 il grafo simmetrizzato e potato, come lo costruisce il motore
    kth_pesi(W, k)             il peso del k-esimo vicino di ogni riga (300 KB su 76k righe)
    aggiungi(W, nuove, k)      (W_esteso, kth_nuovo, n_reciproci) — incrementale
    carica_con_delta(base, delta)

`aggiungi` non ricostruisce le 76k righe: tocca solo le righe dei vecchi vicini che ricevono l'arco.
"""
from __future__ import annotations

import numpy as np
import scipy.sparse as sp


def paia(W: sp.spmatrix, k: int) -> sp.csr_matrix:
    """Il bersaglio dell'incremento: top-k per riga di `W + W.T`, **senza** la risimmetrizzazione
    finale che fa `camminata.pota`.

    La differenza non e' cosmetica: con `D + D.T` finale una riga dipende anche dalle righe dei
    vicini, quindi aggiungere un nodo puo' cambiare righe a due passi di distanza e l'incremento
    smette di essere esatto sulle sole righe toccate. Chi vuole la matrice del motore fa
    `D + D.T` al caricamento: e' una somma, non una potatura, e non cambia l'ordine delle righe.
    """
    S = (W + W.T).tocsr()
    S.setdiag(0)
    S.eliminate_zeros()
    return _topk_per_riga(S, k)


def _topk_per_riga(S: sp.csr_matrix, k: int) -> sp.csr_matrix:
    rows, cols, vals = [], [], []
    for i in range(S.shape[0]):
        lo, hi = S.indptr[i], S.indptr[i + 1]
        if hi <= lo:
            continue
        idx, dat = S.indices[lo:hi], S.data[lo:hi]
        if len(dat) > k:
            # ordinamento stabile per peso decrescente, poi indice: senza il secondo criterio due
            # pesi uguali danno risultati diversi fra ricostruzione e incremento.
            o = np.lexsort((idx, -dat))[:k]
            idx, dat = idx[o], dat[o]
        rows.append(np.full(len(idx), i, np.int32))
        cols.append(idx.astype(np.int32))
        vals.append(dat)
    if not rows:
        return sp.csr_matrix(S.shape, dtype=np.float32)
    return sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
                         shape=S.shape).tocsr()


def kth_pesi(S: sp.csr_matrix, k: int) -> np.ndarray:
    """Peso del k-esimo vicino di ogni riga (0 se la riga ne ha meno di k)."""
    out = np.zeros(S.shape[0], np.float32)
    for i in range(S.shape[0]):
        lo, hi = S.indptr[i], S.indptr[i + 1]
        if hi - lo >= k:
            out[i] = np.partition(S.data[lo:hi], -k)[-k]
        elif hi > lo:
            out[i] = 0.0
    return out


def aggiungi(W: sp.spmatrix, nuove: sp.spmatrix, k: int):
    """Aggiunge `nuove` (n_new x N, diretto: righe dei titoli nuovi) e restituisce il grafo simmetrico.

    Ritorna `(S, kth, n_reciproci)`: `S` e' il simmetrizzato potato (vecchi + nuovi), `kth` il nuovo
    vettore dei k-esimi pesi (per il prossimo aggiornamento), `n_reciproci` quanti archi reciproci
    sono stati iniettati nei vecchi nodi.

    TRE CORREZIONI (revisione esterna, 2026-11-04, tutte riprodotte con un test):
      · la riga del titolo nuovo va troncata ai suoi top-k (`S[i, j] = w` li inseriva tutti);
      · `kth[j]` va aggiornato DOPO ogni sfratto: con la soglia vecchia il secondo titolo che colpisce
        la stessa riga poteva sfrattare un arco piu' forte di se';  
      · si restituisce `S + S.T`, cosi' il risultato e' *identico* a `camminata.pota(W_full, k)`.
        Non e' un'approssimazione a 2 hop: `paia` produce gia' `D` (top-k di `W + W.T`), e `pota`
        aggiunge solo la trasposta.
    """
    W = W.tocsr()
    n_old = W.shape[0]
    nuove = nuove.tocsr()
    n_new = nuove.shape[0]
    S = paia(W, k).tolil()
    S.resize((n_old + n_new, n_old + n_new))
    kth = kth_pesi(S.tocsr()[:n_old, :n_old], k)
    reciproci = 0
    # ponytail: ciclo Python su LIL, O(nnz(nuove)) con accesso per riga. Per ~200 titoli al giorno
    # sono millisecondi; se il delta diventasse l'intero canone servirebbe una riscrittura in CSR.
    C = nuove.tocoo()
    for i_new, j, w in zip(C.row, C.col, C.data):
        i = n_old + int(i_new); j = int(j); w = float(w)
        if (i, j) not in {(i, q) for q in S.rows[i]}:
            S[i, j] = w
            # la riga nuova si tiene ai suoi top-k: senza questo un titolo nuovo con 100 archi
            # ne conservava 100 mentre la ricostruzione completa ne tiene k
            if len(S.rows[i]) > k:
                pesi_i = S.data[i]
                q = int(np.argmin(pesi_i))
                S[i, S.rows[i][q]] = 0.0
        riga_j = S.rows[j]
        if len(riga_j) < k:
            S[j, i] = w
            reciproci += 1
            if len(S.rows[j]) >= k:
                kth[j] = float(np.min(S.data[j]))     # riga piena: il minimo e' il k-esimo
        elif w >= kth[j]:
            # entra e sfila il piu' debole: la riga resta di k elementi
            pesi_j = S.data[j]
            if len(pesi_j) >= k:
                q = int(np.argmin(pesi_j))
                S[j, riga_j[q]] = 0.0
            S[j, i] = w
            reciproci += 1
            # LA SOGLIA SI AGGIORNA SUBITO: con quella vecchia il prossimo inserimento sulla stessa
            # riga poteva sfrattare un arco piu' forte di se'.
            kth[j] = float(np.min(np.asarray(S.data[j], np.float32)))
    S = S.tocsr()
    S.setdiag(0)
    S.eliminate_zeros()
    kth = kth_pesi(S, k)
    return (S + S.T).tocsr(), kth, reciproci


def carica_con_delta(base: sp.spmatrix, delta: sp.spmatrix) -> sp.csr_matrix:
    """Fonde base (N x N) e delta (n_new x N) in un grafo diretto (N+n_new) x (N+n_new)."""
    base = base.tocsr()
    delta = delta.tocsr()
    n_old, n_new = base.shape[0], delta.shape[0]
    out = sp.lil_matrix((n_old + n_new, n_old + n_new), dtype=np.float32)
    out[:n_old, :n_old] = base
    out[n_old:, :n_old] = delta
    out = out.tocsr()
    return (out + out.T).tocsr()
