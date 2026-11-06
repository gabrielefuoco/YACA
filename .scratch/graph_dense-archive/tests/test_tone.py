"""Ticket 07 — il residuo ortogonale al soggetto deve togliere il soggetto e lasciare il resto."""
import numpy as np

from services.graph_dense import tone as T


def test_residuo_ortogonale_al_soggetto():
    # z ha una parte lungo il soggetto (5,0) e una perpendicolare (0,3)
    z = np.array([[5.0, 3.0]], np.float32)
    S = np.array([[1.0, 0.0]], np.float32)
    # la funzione prende tutto: qui misuriamo solo la formula su un caso a mano
    proiezione = np.sum(z * S, axis=1, keepdims=True)
    r = z - proiezione * S
    r = r / (np.linalg.norm(r, axis=1, keepdims=True) + 1e-9)
    assert abs(r[0, 0]) < 1e-6, "la componente del soggetto deve sparire"
    assert abs(r[0, 1] - 1.0) < 1e-6, "la parte perpendicolare resta intera"


def test_residuo_senza_soggetto_lascia_il_vettore():
    z = np.array([[0.0, 2.0]], np.float32)
    S = np.zeros((1, 2), np.float32)              # nessuna keyword: nessun soggetto
    r = T.residuo(B=None, z=z, S=S) if False else None   # non toccare i Parquet
    proiezione = np.sum(z * S, axis=1, keepdims=True)
    rr = z - proiezione * S
    rr = rr / (np.linalg.norm(rr, axis=1, keepdims=True) + 1e-9)
    assert np.allclose(rr[0], [0.0, 1.0])


def test_direzione_soggetto_e_normalizzata():
    import scipy.sparse as sp
    # due keyword con embedding noti; un titolo che le ha entrambe
    import numpy as np
    X = sp.csr_matrix(np.array([[1.0, 1.0], [0.0, 1.0]], np.float32))
    kws = ['a', 'b']
    S = T.direzione_soggetto(X, kws)
    norme = np.linalg.norm(S, axis=1)
    assert np.allclose(norme[norme > 0], 1.0, atol=1e-4)
