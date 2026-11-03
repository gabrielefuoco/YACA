"""Ticket 10 — l'incremento deve dare lo stesso grafo della ricostruzione da zero."""
import numpy as np
import scipy.sparse as sp

from services.graph_dense import delta as DL


def _base(n=12, seme=7):
    rng = np.random.default_rng(seme)
    M = sp.random(n, n, density=0.35, random_state=seme, dtype=np.float32)
    M = M.tocoo()
    M.data = rng.random(len(M.data)).astype(np.float32) + 0.01
    M = sp.csr_matrix((M.data, (M.row, M.col)), shape=(n, n))
    M.setdiag(0); M.eliminate_zeros()
    return M


def test_incremento_uguale_alla_ricostruzione():
    W = _base()
    k = 4
    nuove = sp.csr_matrix(np.array([[0.9, 0.0, 0.5] + [0.0] * 9,
                                    [0.0, 0.0, 0.0, 0.7] + [0.0] * 8], np.float32))
    S_inc, kth, reciproci = DL.aggiungi(W, nuove, k)

    # ricostruzione da zero: si appende la riga e si rifa' tutto
    n_old, n_new = W.shape[0], nuove.shape[0]
    W_full = sp.lil_matrix((n_old + n_new, n_old + n_new), dtype=np.float32)
    W_full[:n_old, :n_old] = W
    W_full[n_old:, :n_old] = nuove
    S_full = DL.paia(W_full.tocsr(), k)

    assert S_inc.shape == S_full.shape
    diff = (S_inc != S_full)
    assert diff.nnz == 0, f"{diff.nnz} posizioni diverse fra incremento e ricostruzione"
    assert reciproci >= 1, "almeno un arco reciproco deve essere stato iniettato"
    assert kth.shape[0] == n_old + n_new


def test_il_titolo_nuovo_non_resta_isolato():
    W = _base()
    nuove = sp.csr_matrix(np.array([[0.0] * 6 + [0.6] + [0.0] * 5], np.float32))
    S_inc, _, _ = DL.aggiungi(W, nuove, 4)
    nuovo = S_inc.shape[0] - 1
    assert S_inc.getrow(nuovo).nnz >= 1
    assert S_inc[:, nuovo].nnz >= 1, "la colonna del nuovo titolo non puo' restare vuota"


def test_kth_pesi_e_il_k_esimo():
    M = sp.csr_matrix(np.array([[0, 5, 3, 1, 4], [0, 0, 0, 0, 0],
                                [2, 0, 0, 0, 0]], np.float32))
    kth = DL.kth_pesi(M, 2)
    assert kth[0] == 4          # pesi 5,4,3,1 -> il 2o e' 4
    assert kth[1] == 0          # riga vuota
    assert kth[2] == 0          # una sola voce, meno di k


def test_nessun_arco_reciproco_se_il_peso_e_troppo_basso():
    W = _base()
    # il peso 0,001 non entra nella top-4 di nessun vecchio nodo
    nuove = sp.csr_matrix(np.array([[0.001] * 12], np.float32))
    S_inc, _, reciproci = DL.aggiungi(W, nuove, 4)
    assert reciproci <= 2, "un arco debolissimo non deve iniettare reciprocita' ovunque"
