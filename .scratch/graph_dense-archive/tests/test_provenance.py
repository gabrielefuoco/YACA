"""Ticket 12 — la provenienza deve impedire le build sbagliate in silenzio."""
import json
from pathlib import Path

import numpy as np
import pytest
import scipy.sparse as sp

from services.graph_dense import provenance as P


def _mat(n=4):
    return sp.csr_matrix(np.array([[0, 1, 0, 0], [1, 0, 2, 0], [0, 2, 0, 3], [0, 0, 3, 0]], np.float32))


def test_andata_e_ritorno(tmp_path):
    f = tmp_path / "a.npz"
    prov = P.scrivi(f, _mat(), step="mixer", params={"COVISION": 1.0}, inputs={"TRAMA": "abc"})
    M, letto = P.leggi(f)
    assert P.sha256_obj(prov) == P.sha256_obj(letto)
    assert letto["step"] == "mixer"
    assert M.shape == (4, 4) and M.nnz == 6


def test_artefatto_senza_provenienza_e_rifiutato(tmp_path):
    f = tmp_path / "nudo.npz"
    M = _mat()
    np.savez_compressed(f, indptr=M.indptr, indices=M.indices, data=M.data,
                        shape=np.array(M.shape))
    with pytest.raises(ValueError, match="senza provenienza"):
        P.verifica(f)


def test_step_sbagliato_e_rifiutato(tmp_path):
    f = tmp_path / "c.npz"
    P.scrivi(f, _mat(), step="chiusura")
    with pytest.raises(ValueError, match="step"):
        P.verifica(f, step="mixer")


def test_input_cambiato_e_rifiutato(tmp_path):
    f = tmp_path / "d.npz"
    P.scrivi(f, _mat(), step="mixer", inputs={"TRAMA": "vecchio"})
    with pytest.raises(ValueError, match="cambiato"):
        P.verifica(f, inputs_attesi={"TRAMA": "nuovo"})


def test_chiave_cache_cambia_col_contenuto(tmp_path):
    a, b = tmp_path / "a.npz", tmp_path / "b.npz"
    P.scrivi(a, _mat(), step="mixer", params={"k": 1})
    P.scrivi(b, _mat(), step="mixer", params={"k": 2})
    assert P.chiave_cache(a) != P.chiave_cache(b)
    assert P.chiave_cache(a) == P.chiave_cache(a)
    assert P.chiave_cache(a, k=15) != P.chiave_cache(a, k=16)


def test_sha_dei_parametri_indipendente_dall_ordine():
    a = P.sha256_obj({"x": 1, "y": 2})
    b = P.sha256_obj({"y": 2, "x": 1})
    assert a == b
    assert json.dumps({"x": 1}) is not None


def test_chiave_cache_di_un_file_assente_e_vuota(tmp_path):
    """Stesso contratto di canon.sha_file: '' senza artefatto, senza eccezioni."""
    assert P.chiave_cache(tmp_path / "manca.npz", pota=16) == ""
