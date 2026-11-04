"""estensione_bolle.py — le bolle come VISTA DETERMINISTICA sul canone esteso (ticket 22).

IL PROBLEMA. Il motore di prodotto serve 66.259 titoli con una partizione a 3.497 bolle; il grafo di
ricerca ne ha 76.497. Rifare il clustering azzererebbe gli ID delle bolle e invaliderebbe centroidi,
mappa e fixture; togliere le bolle richiede di riscrivere metà di `motore.py`.

LA TERZA VIA. L'espansione del canone è stata **append-only**: i primi 66.259 indici sono identici byte
per byte. Quindi:

  1. gli ID delle 3.497 bolle restano intatti per i primi 66.259 nodi;
  2. i 10.238 nuovi prendono la bolla **più votata dai loro vicini già collocati**, col voto pesato
     dall'arco del grafo nuovo;
  3. i pochi isolati cadono su una bolla di riserva dichiarata (non su "la prima", che sarebbe arbitrario
     ma silenzioso).

Nessun rebuild, ID stabili, centroidi e mappa ancora validi.
"""
from __future__ import annotations

import numpy as np
import scipy.sparse as sp


def estendi(mem_old: np.ndarray, S: sp.spmatrix, riserva: int | None = None,
            min_voti: float = 0.0):
    """Estende la partizione a tutti i nodi di `S`. Ritorna (mem_nuova, statistiche).

    `mem_old` copre le prime `len(mem_old)` righe; `S` è il grafo (simmetrico o diretto) su tutti i nodi.
    """
    mem_old = np.asarray(mem_old)
    n_old = len(mem_old)
    n_new_total = S.shape[0]
    if n_new_total < n_old:
        raise ValueError(f'il grafo ha {n_new_total} nodi, meno della partizione ({n_old})')
    nb = int(mem_old.max()) + 1 if n_old else 0
    mem = np.full(n_new_total, -1, dtype=mem_old.dtype)
    mem[:n_old] = mem_old

    S = sp.csr_matrix(S)
    assegnati = per_voto = 0
    for i in range(n_old, n_new_total):
        lo, hi = S.indptr[i], S.indptr[i + 1]
        if hi > lo:
            idx = S.indices[lo:hi]
            w = S.data[lo:hi]
            vecchi = idx < n_old
            if vecchi.any():
                voti = np.bincount(mem[idx[vecchi]], weights=w[vecchi], minlength=nb)
                if voti.max() > min_voti:
                    mem[i] = int(np.argmax(voti))
                    assegnati += 1
                    per_voto += 1
    senza = np.flatnonzero(mem < 0)
    if len(senza):
        # RISERVA DICHIARATA: la bolla più numerosa. Non è "giusto", è esplicito — e si conta.
        r = int(riserva) if riserva is not None else int(np.argmax(np.bincount(mem_old)))
        mem[senza] = r
    stats = {'nodi': int(n_new_total), 'nuovi': int(n_new_total - n_old),
             'assegnati_per_voto': per_voto, 'in_riserva': int(len(senza)),
             'bolle': int(mem.max()) + 1,
             'id_preservati': bool((mem[:n_old] == mem_old).all())}
    return mem, stats


def da_file(mem_path, S, out_path=None):
    """Comodità: legge la partizione, la estende e (se richiesto) la salva accanto all'originale."""
    mem_old = np.load(mem_path)
    mem, stats = estendi(mem_old, S)
    if out_path:
        np.save(out_path, mem)
    return mem, stats
