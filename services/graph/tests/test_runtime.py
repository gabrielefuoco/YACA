"""Test unitari veloci e offline per il runtime sparso V45 (services/graph/runtime).

VERIFICHE COPERTE:
- caricamento corretto dell'Engine (dimensione n=76.497, percorso esposto, artefatto fingerprint, nep esposto);
- stabilità dell'artefatto fingerprint tra due caricamenti e sensibilità alla potatura (pota);
- simmetria del supporto della matrice di transizione per pota=16 e pota=None (fixture asimmetrica);
- caricamento della transizione precalcolata (carica_transizione) con supporto simmetrico;
- regola 'dichiarare, non ingoiare':
  * peso non valido solleva ValueError (nessun fallback silenzioso);
  * plays o frazione non validi sollevano ValueError;
  * raccomanda senza grafo caricato solleva RuntimeError;
  * conteggio semi ed esclusi fuori canone registrato in Engine.ultimo_scarto;
- pesatura semi canonica tramite camminata.pesi_semi:
  * serie vista per intero (frazione=1.0 o plays=nep) supera una serie vista a metà (frazione=0.5);
  * film con 10 ri-visioni ha tetto a 3 (risultato identico a 3 ri-visioni);
  * peso numerico esplicito continua a sovrascrivere la formula;
  * frazione=1.0 equivale esattamente al passaggio di plays=nep;
- helper profilo freddo Engine.profilo_freddo(n_semi) basato sulla costante FREDDO_SOTTO (3);
- costante di default DEFAULT_CAP = 60 per il cap;
- raccomandazione da seme noto (Matrix, movie:603) con risultati coerenti;
- filtro medium ("movie", "series") che restituisce esclusivamente quel medium;
- applicazione di 'esclusi' prima del cap;
- determinismo (stessi semi producono due volte lo stesso output identico);
- sensibilità ai pesi (un seme con peso o tipo 'loved' batte un seme 'watched');
- casi limite (semi vuoti, cap <= 0, semi inesistenti);
- test a grafo intero escluso di default e attivabile con YACA_SLOW=1.
"""
from __future__ import annotations

import os
from pathlib import Path
import numpy as np
import pytest
import scipy.sparse as sp

from graph.runtime import Engine, DEFAULT_CAP
from graph import provenance as _PV


@pytest.fixture(scope="module")
def engine():
    """Inizializza una sola volta l'Engine con pota=16 per l'intera sessione di test."""
    return Engine.carica(pota=16)


def test_engine_loads(engine):
    """Verifica che l'Engine esponga n, percorso, artefatto (fingerprint), nep e matrice sparsa."""
    assert engine.n == 76497
    assert engine.percorso is not None
    assert engine.percorso.endswith("bolle-eterogeneo-V45-p1.0-triangolo.npz")
    assert engine.artefatto is not None
    assert not engine.artefatto.endswith(".npz")
    assert engine.Tr is not None
    assert engine.Tr.shape == (76497, 76497)
    assert engine.Tr.nnz > 0
    assert engine.nep is not None
    assert len(engine.nep) == 76497


def test_transition_support_is_symmetric(engine, tmp_path):
    """Verifica che il supporto della matrice di transizione sia simmetrico sia per pota=16 sia per pota=None."""
    supp_16 = (engine.Tr != 0).astype(np.int8)
    diff_16 = supp_16 - supp_16.T
    diff_16.eliminate_zeros()
    assert diff_16.nnz == 0, f"Supporto Tr (pota=16) non simmetrico: {diff_16.nnz} asimmetrie"

    row = np.array([0, 1, 2, 3], dtype=np.int32)
    col = np.array([1, 2, 0, 4], dtype=np.int32)
    val = np.array([2.0, 3.0, 1.0, 5.0], dtype=np.float32)
    M_asym = sp.csr_matrix((val, (row, col)), shape=(5, 5))
    fixture_file = tmp_path / "asym_fixture.npz"
    _PV.scrivi(fixture_file, M_asym, step="test_fixture")

    eng_none = Engine.carica(path=fixture_file, pota=None)
    supp_none = (eng_none.Tr != 0).astype(np.int8)
    diff_none = supp_none - supp_none.T
    diff_none.eliminate_zeros()
    assert diff_none.nnz == 0, f"Supporto Tr (pota=None) non simmetrico: {diff_none.nnz} asimmetrie"


def test_fingerprint_stability_and_pota_sensitivity(tmp_path):
    """Verifica che Engine.artefatto sia stabile a parità di artefatto e cambi con pota."""
    row = np.array([0, 1, 2], dtype=np.int32)
    col = np.array([1, 2, 0], dtype=np.int32)
    val = np.array([1.0, 2.0, 3.0], dtype=np.float32)
    M = sp.csr_matrix((val, (row, col)), shape=(3, 3))
    fixture_path = tmp_path / "test_fp.npz"
    _PV.scrivi(fixture_path, M, step="fixture")

    e1 = Engine.carica(path=fixture_path, pota=1)
    e2 = Engine.carica(path=fixture_path, pota=1)
    e3 = Engine.carica(path=fixture_path, pota=2)
    e_none = Engine.carica(path=fixture_path, pota=None)

    assert e1.artefatto == e2.artefatto
    assert e1.artefatto != e3.artefatto
    assert e1.artefatto != e_none.artefatto


def test_carica_transizione_precomputed():
    """Verifica il caricamento rapido della transizione precalcolata (avvio a basso impatto di memoria)."""
    trans_path = (
        Path(__file__).resolve().parents[1]
        / "data"
        / "v45-transizione"
        / "transizione-pota16.npz"
    )
    if not trans_path.is_file():
        pytest.skip("Artefatto transizione-pota16.npz non ancora generato")

    eng_trans = Engine.carica_transizione(trans_path, pota=16)
    assert eng_trans.n == 76497
    assert eng_trans.Tr.nnz > 0
    assert eng_trans.percorso == str(trans_path)
    assert eng_trans.artefatto is not None
    assert not eng_trans.artefatto.endswith(".npz")

    supp = (eng_trans.Tr != 0).astype(np.int8)
    diff = supp - supp.T
    diff.eliminate_zeros()
    assert diff.nnz == 0

    res = eng_trans.raccomanda([("movie:603", None, "loved")], cap=10)
    assert len(res) == 10
    top_keys = [r["key"] for r in res]
    assert "movie:604" in top_keys or "movie:605" in top_keys


def test_declare_dont_swallow_invalid_peso(engine):
    """Verifica che pesi, plays e frazioni non validi sollevino ValueError senza fallback silenziosi."""
    with pytest.raises(ValueError):
        engine.raccomanda([("movie:603", "invalido", "loved")])

    with pytest.raises(ValueError):
        engine.raccomanda([{"tmdbId": 603, "medium": "movie", "peso": -2.0}])

    with pytest.raises(ValueError):
        engine.raccomanda([("movie:603", float("nan"), "loved")])

    with pytest.raises(ValueError):
        engine.raccomanda([{"key": "movie:603", "plays": -1}])

    with pytest.raises(ValueError):
        engine.raccomanda([{"key": "tv:1396", "frazione": 1.5}])

    with pytest.raises(ValueError):
        engine.raccomanda([{"key": "tv:1396", "frazione": -0.1}])


def test_declare_dont_swallow_unloaded_engine():
    """Verifica che raccomanda() senza grafo caricato sollevi RuntimeError invece di tornare []."""
    unloaded = Engine()
    with pytest.raises(RuntimeError):
        unloaded.raccomanda([("movie:603", 1.0, "loved")])


def test_declare_dont_swallow_ultimo_scarto(engine):
    """Verifica che i titoli fuori canone vengano tracciati nel dizionario ultimo_scarto."""
    res = engine.raccomanda(
        semi=[
            ("movie:603", 1.0, "loved"),
            ("movie:999999999", 1.0, "loved"),
            ("tv:999999999", 1.0, "loved"),
        ],
        esclusi=["movie:888888888", 777777777],
        cap=10,
    )
    assert len(res) > 0
    assert engine.ultimo_scarto["semi_fuori_canone"] == 2
    assert engine.ultimo_scarto["esclusi_fuori_canone"] == 2


def test_fully_watched_series_outranks_half_watched(engine):
    """Verifica che una serie vista per intero (frazione=1.0) superi una serie vista a metà (frazione=0.5)."""
    # Usiamo Breaking Bad (tv:1396) e Mad Men (tv:1104)
    # Nel primo caso: Breaking Bad è a frazione=1.0 (peso base 3.0), Mad Men a frazione=0.5 (peso base 2.0)
    res_a = engine.raccomanda(
        [{"key": "tv:1396", "frazione": 1.0}, {"key": "tv:1104", "frazione": 0.5}],
        cap=60,
    )
    scores_a = {r["key"]: r["punteggio"] for r in res_a}
    assert scores_a["tv:1396"] > scores_a["tv:1104"]

    # Nel secondo caso invertito: Mad Men a frazione=1.0 (peso base 3.0), Breaking Bad a frazione=0.5 (peso base 2.0)
    res_b = engine.raccomanda(
        [{"key": "tv:1396", "frazione": 0.5}, {"key": "tv:1104", "frazione": 1.0}],
        cap=60,
    )
    scores_b = {r["key"]: r["punteggio"] for r in res_b}
    assert scores_b["tv:1104"] > scores_b["tv:1396"]


def test_film_plays_cap_at_three(engine):
    """Verifica che un film con 10 ri-visioni abbia tetto a 3 (PESO_FILM_MAX=3), equivalente a 3 ri-visioni."""
    seme_film = "movie:603"
    seme_compagno = "movie:550"

    res_3 = engine.raccomanda(
        [{"key": seme_film, "plays": 3}, {"key": seme_compagno, "plays": 1}],
        cap=20,
    )
    res_10 = engine.raccomanda(
        [{"key": seme_film, "plays": 10}, {"key": seme_compagno, "plays": 1}],
        cap=20,
    )
    res_1 = engine.raccomanda(
        [{"key": seme_film, "plays": 1}, {"key": seme_compagno, "plays": 1}],
        cap=20,
    )

    # Con cap a 3, 3 ri-visioni e 10 ri-visioni producono esattamente gli stessi punteggi
    assert res_3 == res_10
    # Invece con 1 sola ri-visione i punteggi differiscono
    assert res_3 != res_1


def test_explicit_numeric_peso_overrides_formula(engine):
    """Verifica che un peso numerico esplicito sovrascriva completamente il calcolo della formula."""
    seme_a = "movie:603"
    seme_b = "movie:550"

    # Con peso esplicito 10.0 (superiore al cap naturale di 3.0)
    res_explicit = engine.raccomanda(
        [{"key": seme_a, "peso": 10.0, "plays": 1}, {"key": seme_b, "plays": 1}],
        cap=20,
    )
    # Senza peso esplicito, con plays=1 (peso naturale = 1.0)
    res_formula = engine.raccomanda(
        [{"key": seme_a, "plays": 1}, {"key": seme_b, "plays": 1}],
        cap=20,
    )

    scores_explicit = {r["key"]: r["punteggio"] for r in res_explicit}
    scores_formula = {r["key"]: r["punteggio"] for r in res_formula}
    assert scores_explicit[seme_a] > scores_formula[seme_a]

    # Verifica backward compatibility con tupla (key, peso, tipo)
    res_tuple = engine.raccomanda([(seme_a, 10.0, None), (seme_b, 1.0, None)], cap=20)
    assert res_tuple == res_explicit


def test_frazione_one_equals_plays_nep(engine):
    """Verifica che per una serie frazione=1.0 sia esattamente equivalente a plays=nep."""
    bb_key = "tv:1396"
    nep_bb = engine.nep[engine.row_of[bb_key]]
    assert nep_bb > 1.0

    res_frazione = engine.raccomanda(
        [{"key": bb_key, "frazione": 1.0}, {"key": "movie:603", "plays": 1}],
        cap=30,
    )
    res_nep = engine.raccomanda(
        [{"key": bb_key, "plays": nep_bb}, {"key": "movie:603", "plays": 1}],
        cap=30,
    )

    assert res_frazione == res_nep


def test_series_unknown_nep_frazione_uses_declared_series_formula(engine):
    """Verifica che una serie con nep forzato a 1 e frazione=0.5 pesi esattamente 2.0 (1 + 2*0.5).

    Risolve la mappatura inventata: non deve usare fr * PESO_FILM_MAX (1.5), ma la formula
    dichiarata delle serie P.PESO_SERIE_BASE + P.PESO_SERIE_FASCIA * fr = 2.0.
    """
    from graph import parametri as P

    bb_key = "tv:1396"
    companion_key = "movie:603"

    # Test con nep forzato a 1.0 e frazione 0.5
    res_tested = engine.raccomanda(
        [{"key": bb_key, "nep": 1.0, "frazione": 0.5}, {"key": companion_key, "plays": 1}],
        cap=20,
    )
    # Benchmark con peso esplicito calcolato secondo la formula dichiarata (1 + 2*0.5 = 2.0)
    peso_atteso = P.PESO_SERIE_BASE + P.PESO_SERIE_FASCIA * 0.5  # 2.0
    res_expected_2_0 = engine.raccomanda(
        [{"key": bb_key, "peso": peso_atteso}, {"key": companion_key, "plays": 1}],
        cap=20,
    )
    # Vecchio valore inventato errato (0.5 * 3.0 = 1.5)
    res_old_1_5 = engine.raccomanda(
        [{"key": bb_key, "peso": 1.5}, {"key": companion_key, "plays": 1}],
        cap=20,
    )

    # Deve coincidere esattamente con il benchmark a 2.0
    assert res_tested == res_expected_2_0
    # E fallirebbe contro il vecchio 1.5
    assert res_tested != res_old_1_5
    scores_tested = {r["key"]: r["punteggio"] for r in res_tested}
    scores_old = {r["key"]: r["punteggio"] for r in res_old_1_5}
    assert scores_tested[bb_key] > scores_old[bb_key]


def test_profilo_freddo_helper(engine):
    """Verifica l'helper Engine.profilo_freddo basato sulla soglia dichiarata FREDDO_SOTTO (3)."""
    assert Engine.FREDDO_SOTTO == 3
    assert Engine.profilo_freddo(0) is True
    assert Engine.profilo_freddo(1) is True
    assert Engine.profilo_freddo(2) is True
    assert Engine.profilo_freddo(3) is False
    assert Engine.profilo_freddo(4) is False
    assert Engine.profilo_freddo(10) is False

    # Verificabile anche come metodo sull'istanza
    assert engine.profilo_freddo(2) is True
    assert engine.profilo_freddo(3) is False


def test_default_cap_constant(engine):
    """Verifica che DEFAULT_CAP sia 60 e che raccomanda() lo usi come default."""
    assert DEFAULT_CAP == 60
    semi = [("movie:603", None, "loved")]
    res = engine.raccomanda(semi)
    assert len(res) == DEFAULT_CAP


def test_known_seed_returns_results(engine):
    """Verifica che un seme noto (The Matrix, movie:603) produca raccomandazioni coerenti."""
    semi_tupla = [("movie:603", None, "loved")]
    res_tupla = engine.raccomanda(semi_tupla, cap=60)

    semi_dict = [{"tmdbId": 603, "medium": "movie", "tipo": "loved"}]
    res_dict = engine.raccomanda(semi_dict, cap=60)

    assert len(res_tupla) == 60
    assert res_tupla == res_dict

    for r in res_tupla:
        assert "key" in r
        assert "tmdbId" in r
        assert "medium" in r
        assert "punteggio" in r
        assert isinstance(r["tmdbId"], int)
        assert r["medium"] in ("movie", "series")
        assert isinstance(r["punteggio"], float)

    scores = [r["punteggio"] for r in res_tupla]
    assert scores == sorted(scores, reverse=True)

    top_keys = [r["key"] for r in res_tupla[:10]]
    assert "movie:604" in top_keys
    assert "movie:605" in top_keys


def test_medium_filter_returns_only_that_medium(engine):
    """Verifica che il filtro per medium restituisca solo il medium richiesto."""
    semi = [("movie:603", None, "loved")]

    res_movie = engine.raccomanda(semi, cap=20, medium="movie")
    assert len(res_movie) == 20
    assert all(r["medium"] == "movie" for r in res_movie)
    assert all(r["key"].startswith("movie:") for r in res_movie)

    res_series = engine.raccomanda(semi, cap=20, medium="series")
    assert len(res_series) == 20
    assert all(r["medium"] == "series" for r in res_series)
    assert all(r["key"].startswith("tv:") for r in res_series)

    with pytest.raises(ValueError):
        engine.raccomanda(semi, cap=10, medium="anime")


def test_esclusi_applied_before_cap(engine):
    """Verifica che gli esclusi vengano rimossi PRIMA del cap, consentendo ai titoli successivi di salire."""
    semi = [("movie:603", None, "loved")]
    base = engine.raccomanda(semi, cap=5)
    assert len(base) == 5

    primo_key = base[0]["key"]
    secondo_key = base[1]["key"]
    quinto_key = base[4]["key"]

    filtrati = engine.raccomanda(semi, cap=5, esclusi=[primo_key])
    assert len(filtrati) == 5
    assert primo_key not in [r["key"] for r in filtrati]

    assert filtrati[0]["key"] == secondo_key
    assert filtrati[3]["key"] == quinto_key
    assert filtrati[4]["key"] not in [r["key"] for r in base]

    filtrati_id = engine.raccomanda(semi, cap=5, esclusi=[base[0]["tmdbId"]])
    assert len(filtrati_id) == 5
    assert base[0]["tmdbId"] not in [r["tmdbId"] for r in filtrati_id]


def test_determinism(engine):
    """Verifica che identici semi producano esattamente gli stessi risultati."""
    semi = [("movie:603", 2.5, "loved"), ("tv:1396", 1.0, "liked")]
    r1 = engine.raccomanda(semi, cap=30)
    r2 = engine.raccomanda(semi, cap=30)

    assert r1 == r2
    assert [x["key"] for x in r1] == [x["key"] for x in r2]
    assert [x["punteggio"] for x in r1] == [x["punteggio"] for x in r2]


def test_heavier_seed_weight_behaves_sanely(engine):
    """Verifica che l'assegnazione di un peso maggiore a un seme ne aumenti l'influenza relativa."""
    seme_matrix = "movie:603"
    seme_bb = "tv:1396"

    res_matrix_heavy = engine.raccomanda(
        [(seme_matrix, 10.0, None), (seme_bb, 1.0, None)], cap=60
    )
    scores_a = {r["key"]: r["punteggio"] for r in res_matrix_heavy}

    res_bb_heavy = engine.raccomanda(
        [(seme_matrix, 1.0, None), (seme_bb, 10.0, None)], cap=60
    )
    scores_b = {r["key"]: r["punteggio"] for r in res_bb_heavy}

    assert scores_a[seme_matrix] > scores_a[seme_bb]
    assert scores_b[seme_bb] > scores_b[seme_matrix]

    res_tipo_matrix = engine.raccomanda(
        [(seme_matrix, None, "loved"), (seme_bb, None, "watched")], cap=60
    )
    res_tipo_bb = engine.raccomanda(
        [(seme_matrix, None, "watched"), (seme_bb, None, "loved")], cap=60
    )

    t_scores_a = {r["key"]: r["punteggio"] for r in res_tipo_matrix}
    t_scores_b = {r["key"]: r["punteggio"] for r in res_tipo_bb}

    ratio_matrix_loved = t_scores_a[seme_matrix] / t_scores_a[seme_bb]
    ratio_matrix_watched = t_scores_b[seme_matrix] / t_scores_b[seme_bb]
    assert ratio_matrix_loved > ratio_matrix_watched


def test_edge_cases(engine):
    """Verifica la robustezza sui casi limite."""
    assert engine.raccomanda([], cap=10) == []
    assert engine.raccomanda([("movie:603", None, "loved")], cap=0) == []
    assert engine.raccomanda([("movie:603", None, "loved")], cap=-5) == []
    assert engine.raccomanda([("movie:999999999", 1.0, "loved")], cap=10) == []


@pytest.mark.skipif(
    os.environ.get("YACA_SLOW") != "1",
    reason="Il test a grafo intero (pota=None) richiede YACA_SLOW=1 (salta di default)",
)
def test_full_graph_slow():
    """Test opzionale di caricamento del grafo completo (74,4M archi simmetrici)."""
    full_engine = Engine.carica(pota=None)
    assert full_engine.n == 76497
    assert full_engine.Tr.nnz == 74409922
    res = full_engine.raccomanda([("movie:603", None, "loved")], cap=10)
    assert len(res) == 10
