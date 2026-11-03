"""Ticket 11 — smorzare le appendici di saga dentro gli anime, senza toccare il resto."""
import importlib.util
from pathlib import Path

import numpy as np
import scipy.sparse as sp

_spec = importlib.util.spec_from_file_location(
    "mixer", Path(__file__).resolve().parents[3] / ".scratch" / "distillazione-grafo" / "mixer.py")
mixer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mixer)


def test_smorza_solo_gli_archi_anime_della_stessa_saga():
    # 0 = film anime, 1 = seguitO anime (stessa collezione), 2 = film normale, 3 = anime senza saga
    M = sp.lil_matrix((4, 4), dtype=np.float32)
    M[0, 1] = 1.0     # anime -> anime, stessa collezione: da smorzare
    M[0, 2] = 1.0     # anime -> film normale: NON si tocca
    M[0, 3] = 1.0     # anime -> anime senza saga: NON si tocca
    M = M.tocsr()
    anime = np.array([True, True, False, True])
    coll = np.array([77, 77, 0, 0], np.int64)
    titoli = np.array(['naruto', 'naruto shippuden', 'il padrino', 'akira'], dtype=object)
    out, n = mixer.damp_anime_saga(M, anime, coll, titoli)
    assert out[0, 1] < 0.5, "l'appendice di saga va smorzata"
    assert out[0, 2] == 1.0, "il film non anime non si tocca"
    assert out[0, 3] == 1.0, "un anime senza saga non si tocca"
    assert n >= 1


def test_senza_coppie_non_cambia_niente():
    M = sp.identity(3, dtype=np.float32, format='csr')
    anime = np.array([True, True, True])
    out, n = mixer.damp_anime_saga(M, anime, np.zeros(3, np.int64),
                                   np.array(['a', 'b', 'c'], dtype=object))
    assert n == 0 and (out != M).nnz == 0
