"""Ticket 22 — le bolle come vista deterministica sul canone esteso."""
import numpy as np
import scipy.sparse as sp

from services.graph import estensione_bolle as EB


def _grafo():
    # 0..3 vecchi (bolle 0,0,1,1), 4..6 nuovi
    # 4 vede 0 e 1 (bolla 0) e 2 (bolla 1): vince la bolla 0
    # 5 vede solo 3 (bolla 1)
    # 6 non vede nessuno: riserva
    S = sp.lil_matrix((7, 7), dtype=np.float32)
    S[4, 0] = 0.9; S[4, 1] = 0.8; S[4, 2] = 0.5
    S[5, 3] = 0.7
    return S.tocsr()


def test_id_vecchi_preservati_e_nuovi_assegnati():
    mem_old = np.array([0, 0, 1, 1], np.int32)
    mem, st = EB.estendi(mem_old, _grafo())
    assert st['id_preservati'], "gli ID dei primi nodi non devono cambiare"
    assert mem[4] == 0, "vince la bolla con più peso, non la prima incontrata"
    assert mem[5] == 1
    assert st['assegnati_per_voto'] == 2


def test_isolati_vanno_in_riserva_dichiarata():
    mem_old = np.array([0, 0, 1, 1], np.int32)
    mem, st = EB.estendi(mem_old, _grafo())
    assert st['in_riserva'] == 1
    assert mem[6] == 0, "la bolla di riserva è la più numerosa, e il fatto è contato"


def test_numero_di_bolle_invariato():
    mem_old = np.array([0, 0, 1, 1], np.int32)
    mem, st = EB.estendi(mem_old, _grafo())
    assert st['bolle'] == 2 and mem.max() == 1


def test_grafo_piu_corto_della_partizione_e_un_errore():
    try:
        EB.estendi(np.array([0, 1, 2], np.int32), sp.identity(2, format='csr'))
    except ValueError:
        return
    raise AssertionError('doveva sollevare')
