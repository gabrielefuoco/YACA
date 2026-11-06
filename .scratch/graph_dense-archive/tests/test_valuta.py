"""Ticket 01 — bootstrap, MDE e denominatore fisso."""
import numpy as np

from services.graph_dense import valuta as V


def test_bootstrap_riconosce_il_rumore():
    rng = np.random.default_rng(1)
    a = rng.random(499) * 0.5
    b = a + rng.normal(0, 0.05, 499)      # differenza media ~0, nessun effetto
    st = V.bootstrap_appaiato(a, b, replichi=2000)
    assert abs(st['delta']) < 0.02
    assert st['mde'] > 0.005


def test_bootstrap_riconosce_un_effetto_grande():
    rng = np.random.default_rng(2)
    a = rng.random(499) * 0.5
    b = np.clip(a + 0.10, 0, 1)           # +0,10: molto sopra l'MDE
    st = V.bootstrap_appaiato(a, b, replichi=2000)
    assert st['delta'] > 0.09
    assert st['significativo'] and st['sopra_mde']


def test_mde_scala_con_la_radice_di_n():
    rng = np.random.default_rng(3)
    base = rng.random(2000)
    m1 = V.bootstrap_appaiato(base[:500], base[:500] + 0.01, replichi=200)
    m2 = V.bootstrap_appaiato(base[:2000], base[:2000] + 0.01, replichi=200)
    assert m2['mde'] < m1['mde']


def test_denominatore_fisso_per_i_link_non_trovati():
    """Un link non raggiungibile vale 0: non si esclude dal denominatore."""
    import scipy.sparse as sp
    M = sp.csr_matrix(np.array([[0, 1, 0], [1, 0, 0], [0, 0, 0]], np.float32))
    # sorgente 0: un link raggiunto (#1) e uno irraggiungibile (riga 2, che non ha archi)
    m = V.metriche_per_sorgente(M, [(0, [(1, 1.0), (2, 1.0)])])
    assert abs(m['r5'][0] - 0.5) < 1e-9, "meta' dei link e' raggiungibile: 0,5, non 1,0"
    assert abs(m['mrr'][0] - 0.5) < 1e-9


def test_recall_conta_i_link_non_i_pesi():
    """Un solo hit con peso 3 vale 1/len, non 3/len: l'unica metrica pesata e' rw20."""
    import scipy.sparse as sp
    M = sp.csr_matrix(np.array([[0, 1], [1, 0]], np.float32))
    m = V.metriche_per_sorgente(M, [(0, [(1, 3.0), (0, 1.0)])])
    assert abs(m['r5'][0] - 0.5) < 1e-9, f"atteso 0,5 (un hit su due link), trovato {m['r5'][0]}"
    assert abs(m['rw20'][0] - 0.75) < 1e-9
