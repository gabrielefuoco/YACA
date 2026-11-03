"""Ticket 02 — la chiusura moltiplica, non chiude: i tre modi devono comportarsi come dichiarato."""
import importlib.util
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sp

_spec = importlib.util.spec_from_file_location(
    "chiudi", Path(__file__).resolve().parents[3] / ".scratch" / "distillazione-grafo" / "chiudi.py")
chiudi = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(chiudi)


def _due_cricche():
    """0-1-2 sono una cricca (tutti vicini fra loro); 3 e' collegato solo a 0.

    In una cricca ogni arco ha 1 vicino comune (il terzo nodo); l'arco 0-3 ne ha 0.
    """
    M = sp.csr_matrix(np.array([
        [0, 1, 1, 1],
        [1, 0, 1, 0],
        [1, 1, 0, 0],
        [1, 0, 0, 0]], np.float32))
    return M


def test_nessuna_lascia_la_matrice_identica():
    S = _due_cricche()
    out = chiudi.fattore(S, 'nessuna', 0.1)
    assert (out != S).nnz == 0


def test_attuale_moltiplica_per_i_vicini_comuni_e_non_aggiunge_archi():
    S = _due_cricche()
    out = chiudi.fattore(S, 'attuale', 0.1)
    assert out.nnz == S.nnz, "la chiusura non aggiunge archi: e' un moltiplicatore"
    # 0-1: un vicino comune (2) -> 1 * (0.1 + 1)
    assert abs(out[0, 1] - 1.1) < 1e-6
    # 0-3: nessun vicino comune -> 1 * 0.1
    assert abs(out[0, 3] - 0.1) < 1e-6


def test_adamic_adar_penalizza_meno_le_cricche_dense():
    """Con la stessa cricca, AA e conteggio differiscono: AA usa 1/log(1+deg) e non 1."""
    S = _due_cricche()
    a = chiudi.fattore(S, 'attuale', 0.1)
    b = chiudi.fattore(S, 'adamic-adar', 0.1)
    assert b.nnz == S.nnz
    assert abs(a[0, 1] - b[0, 1]) > 1e-3
    # il rapporto cricca / non-cricca e' piu' mite in AA
    r_att = a[0, 1] / a[0, 3]
    r_aa = b[0, 1] / b[0, 3]
    assert r_aa < r_att


def test_adamic_adar_a_mano():
    """Verifica numerica esplicita: deg = [2,2,2,1] -> w_k = 1/log(1+deg_k)."""
    S = _due_cricche()
    out = chiudi.fattore(S, 'adamic-adar', 0.1)
    w = 1.0 / np.log(3.0)          # deg(2) = 2
    assert abs(out[0, 1] - (0.1 + w)) < 1e-5
    assert abs(out[0, 3] - 0.1) < 1e-6
