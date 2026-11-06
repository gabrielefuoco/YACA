"""Ticket 05 — il titolo non deve restare dentro l'embedding della trama."""
from services.graph_dense import maschera as M

OVERVIEW = ("Barbie vive a Barbie Land, un mondo perfetto dove tutto e' rosa. "
            "Quando scopre che il suo aspetto non e' piu' perfetto, parte per il mondo umano.")


def test_il_titolo_sparisce():
    k = M.chiavi('Barbie', 'Barbie', 'Barbie', 'Barbie Collection')
    out = M.maschera(OVERVIEW, k)
    assert 'barbie' not in out.lower(), out
    assert out.startswith('The protagonist'), f"il soggetto va sostituito, non cancellato: {out}"


def test_la_storia_resta():
    k = M.chiavi('Barbie')
    out = M.maschera(OVERVIEW, k)
    assert 'mondo perfetto' in out.lower()
    assert 'mondo umano' in out.lower()


def test_parole_corte_non_si_mascherano():
    k = M.chiavi('Up', 'It')
    assert M.maschera('Up is a story about a house.', k) == 'Up is a story about a house.'


def test_collezione_e_titolo_originale_entrano_nelle_chiavi():
    k = M.chiavi('Povere creature!', 'Poor Things', '', 'Poor Things Collection')
    assert {'povere', 'creature', 'poor', 'things', 'collection'} <= k


def test_limite_delle_maschere():
    testo = 'Barbie ' * 30
    out = M.maschera(testo, M.chiavi('Barbie'), max_maschere=6)
    assert out.lower().count('barbie') >= 20, "oltre la soglia si smette di togliere: non deve restare un buco"


def test_input_vuoti():
    assert M.maschera('', {'x'}) == ''
    assert M.maschera(None, {'x'}) == ''
    assert M.maschera('testo', set()) == 'testo'
