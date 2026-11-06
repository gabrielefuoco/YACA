import numpy as np
import scipy.sparse as sp

from services.graph_dense.tribu_gusto import profilo_svd


def test_profilo_svd_is_reproducible_for_fixed_seed():
    X = sp.csr_matrix(np.random.default_rng(91).random((24, 13), dtype=np.float32))
    a = profilo_svd(X, k=5, seme=20261105)
    b = profilo_svd(X, k=5, seme=20261105)
    assert np.array_equal(a, b)
    assert a.shape == (13, 5)
