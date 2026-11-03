"""Ticket 06 — carriera LOO: il film stesso non deve entrare nel proprio centroide."""
import numpy as np
import scipy.sparse as sp

from services.graph_dense import crewprop as CP


def test_persone_top3_per_il_cast():
    cell = ('[{"id":1,"order":2},{"id":2,"order":0},{"id":3,"order":1},{"id":4,"order":3}]')
    assert CP._persone(cell, 'ca') == [2, 3, 1], "il cast si prende per ordine, primi 3"
    assert set(CP._persone(cell, 'dir')) == {1, 2, 3, 4}


def test_persone_regge_input_sporchi():
    assert CP._persone(None, 'ca') == []
    assert CP._persone('', 'dir') == []
    assert CP._persone('non json', 'dir') == []


def test_leave_one_out_nel_centroide():
    """Un film con una sola persona e nessun altro lavoro non ha candidati: niente auto-link."""
    B = {'N': 3, 'VOT': np.array([100.0, 50.0, 10.0]), 'row_of': {}}
    z = np.eye(3, dtype=np.float32)[:, :2]          # 2 dimensioni, vettori ortogonali
    per = {0: [(0, 1.0)], 1: [(1, 1.0), (2, 1.0)]}
    A = sp.csr_matrix((np.array([1.0, 1.0, 1.0], np.float32),
                       (np.array([0, 1, 2], np.int32), np.array([0, 1, 1], np.int32))),
                      shape=(3, 2))
    M = CP.costruisci(B=B, k=5, z=z, _per=per, _A=A, _col2p=[0, 1])
    # il film 0 ha una persona con un solo film: nessun candidato, quindi nessun arco
    assert M.getrow(0).nnz == 0
    # i film 1 e 2 condividono la persona 8: devono essere collegati
    assert M[1, 2] > 0 or M[2, 1] > 0
