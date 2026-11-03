"""Ticket 11, lato retrieval: la maschera si accende solo sui semi anime."""
import numpy as np

from services.graph import anime as A


def _mondo():
    anime = np.array([True, True, True, True, False, False, True, True, True, True, True, True])
    voti = np.array([500, 80, 400, 300, 900, 900, 700, 650, 600, 550, 500, 450], float)
    coll = np.array([0, 0, 0, 77, 0, 0, 0, 0, 0, 0, 0, 0])
    is_tv = np.array([True, False, False, False, False, False, False, False, False, True, False, False])
    coll_of = {77: [3, 9]}          # il film 3 e' nella stessa collezione della serie 9
    return anime, voti, coll, is_tv, coll_of


def test_su_semi_non_anime_non_si_accende():
    anime, voti, coll, is_tv, coll_of = _mondo()
    out, attiva = A.maschera([4, 5, 0], [4, 5], anime=anime, voti=voti, coll=coll, is_tv=is_tv,
                             visti=set(), coll_of_cand=coll_of)
    assert not attiva
    assert out == [4, 5, 0]


def test_su_semi_anime_scarta_i_non_anime_e_le_appendici():
    anime, voti, coll, is_tv, coll_of = _mondo()
    cand = [0, 2, 3, 6, 7, 4, 1]
    out, attiva = A.maschera(cand, [0, 2, 6, 7], anime=anime, voti=voti, coll=coll, is_tv=is_tv,
                             visti=set(), coll_of_cand=coll_of)
    assert attiva
    assert out[:4] == [0, 2, 6, 7], "prima gli anime utili, nell'ordine originale"
    assert 4 in out[4:], "il film non anime finisce in fondo, non sparisce"
    assert 1 in out[4:], "l'anime con 80 voti e' un'appendice"
    assert 3 in out[4:], "il film di una serie non vista finisce in fondo"


def test_serie_madre_gia_vista_lascia_passare_il_film():
    anime, voti, coll, is_tv, coll_of = _mondo()
    out, _ = A.maschera([3, 0, 2, 6, 7], [0, 2, 6, 7], anime=anime, voti=voti, coll=coll,
                        is_tv=is_tv, visti={9}, coll_of_cand=coll_of)
    assert out[0] == 3, "se la serie e' stata vista, il film e' un seguito legittimo"


def test_lista_magra_non_si_smonta():
    anime, voti, coll, is_tv, coll_of = _mondo()
    cand = [0, 4, 5]
    out, attiva = A.maschera(cand, [0, 1], anime=anime, voti=voti, coll=coll, is_tv=is_tv,
                             visti=set(), coll_of_cand=coll_of)
    assert attiva and out == cand, "meno di 5 titoli buoni: si tiene l'ordine originale"


def test_quota_anime():
    anime = np.array([True, False, True, True])
    assert A.quota_anime([0, 2, 3], anime) == 1.0
    assert A.quota_anime([0, 1], anime) == 0.5
    assert A.quota_anime([], anime) == 0.0
