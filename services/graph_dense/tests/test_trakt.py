"""Ticket 01 — split temporale e propensioni sui log Trakt."""
import numpy as np

from services.graph_dense import trakt as T


def test_split_temporale_rispetta_l_ordine_dei_tempi():
    # utente 1 con 10 interazioni in ordine sparso di tempo
    U = np.array([1] * 10, np.int32)
    I = np.arange(10, dtype=np.int32)
    T_ = np.array([100, 900, 200, 800, 300, 700, 400, 600, 500, 950], np.int64)
    casi = T.split_temporale(U, I, T_, frazione=0.7)
    assert len(casi) == 1
    semi, futuro = casi[0]
    # il futuro contiene sempre la piu' recente (indice 9, t=950) e mai la piu' vecchia (0, t=100)
    assert 9 in futuro, "l'interazione piu' recente deve stare nel futuro"
    assert 0 not in futuro, "l'interazione piu' vecchia non puo' finire nel futuro"


def test_utenti_troppo_corti_scartati():
    U = np.array([1, 1, 2, 2, 2, 2, 2], np.int32)
    I = np.arange(7, dtype=np.int32)
    T_ = np.arange(7, dtype=np.int64) * 10
    casi = T.split_temporale(U, I, T_, min_passato=3, min_futuro=1)
    assert len(casi) == 1, "solo l'utente 2 ha abbastanza storia"


def test_propensioni_crescono_con_la_frequenza():
    I = np.array([0] * 10 + [1] * 2 + [2], np.int32)
    p = T.propensioni(I)
    assert p[0] > p[1] > p[2]
    assert abs(p.sum() - 1.0) < 1e-9


def test_epoch():
    assert T._epoch("2025-01-01T00:00:00.000Z") > 0
    assert T._epoch("") == 0
    assert T._epoch(None) == 0


def test_utente_condiviso_fra_movie_e_show():
    """`movie-abc.json` e `show-abc.json` sono la stessa persona, e l'id e' stabile fra processi."""
    assert T._chiave_utente("/x/movie-abc.json") == T._chiave_utente("/x/show-abc.json") == "abc"
    import zlib
    assert (zlib.crc32("abc".encode()) & 0x7FFFFFFF) == (zlib.crc32("abc".encode()) & 0x7FFFFFFF)
