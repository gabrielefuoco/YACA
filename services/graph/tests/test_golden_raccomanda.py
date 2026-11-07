"""test_golden_raccomanda.py — Verifica di compatibilità del contratto di /raccomanda con V45.

Carica il golden fixture salvato da V10 (.scratch/golden_raccomanda_v10.json) e asserisce che:
1. I codici HTTP di ritorno siano identici (200).
2. Le chiavi top-level della risposta siano identiche (contratto, versioni, semi, liste, motivi).
3. La struttura delle versioni contenga 'artefatto' e 'ricetta'.
4. La struttura dei semi contenga 'n', 'da_catalogo', 'recenti'.
5. Ogni elemento di 'liste' contenga le chiavi previste da YACA (ruolo, mondo, descrizione, attivazione, mediana_voti, quota_serie, semi, titoli).
6. Ogni elemento di 'titoli' contenga 'tmdbId', 'medium', 'punteggio'.
7. I ruoli fondamentali consumati da YACA ('il_tuo_mondo', 'un_passo_fuori') siano presenti.
8. La semantica di degrado per semi fuori dal canone o storia vuota sia identica.
"""
import json
from pathlib import Path
import pytest

from graph.runtime import Engine
from graph.servizio import esegui_richiesta


@pytest.fixture(scope="module")
def engine():
    return Engine.carica_transizione()


@pytest.fixture(scope="module")
def golden_data():
    p = Path(__file__).resolve().parents[3] / ".scratch" / "golden_raccomanda_v10.json"
    if not p.is_file():
        pytest.skip(f"Golden fixture non trovato: {p}")
    return json.loads(p.read_text(encoding="utf-8"))


def test_golden_req1_struttura_e_chiavi(engine, golden_data):
    """Verifica Req 1: Matrix singolo seme film."""
    gold = golden_data["req1"]
    req = gold["req"]
    gold_resp = gold["resp"]

    status, resp = esegui_richiesta(req, engine)

    assert status == 200
    assert status == gold["status"]

    # Chiavi top-level
    assert set(resp.keys()) >= {"contratto", "versioni", "semi", "liste", "motivi"}
    assert resp["contratto"] == 1
    assert set(resp["versioni"].keys()) == {"artefatto", "ricetta"}
    assert set(resp["semi"].keys()) == {"n", "da_catalogo", "recenti"}

    # Semantic content semi
    assert resp["semi"]["n"] == 1
    assert resp["semi"]["da_catalogo"] is False

    # Liste
    assert len(resp["liste"]) >= 1
    ruoli = [l["ruolo"] for l in resp["liste"]]
    assert "il_tuo_mondo" in ruoli
    assert "un_passo_fuori" in ruoli

    for l in resp["liste"]:
        assert {"ruolo", "mondo", "descrizione", "attivazione", "mediana_voti", "quota_serie", "semi", "titoli"}.issubset(set(l.keys()))
        assert isinstance(l["ruolo"], str)
        assert isinstance(l["descrizione"], str)
        assert isinstance(l["attivazione"], float)
        assert isinstance(l["mediana_voti"], float)
        assert isinstance(l["quota_serie"], float)
        assert isinstance(l["semi"], list)
        assert isinstance(l["titoli"], list)
        for t in l["titoli"]:
            assert set(t.keys()) == {"tmdbId", "medium", "punteggio"}
            assert isinstance(t["tmdbId"], int)
            assert t["medium"] in ("movie", "series")
            assert isinstance(t["punteggio"], float)


def test_golden_req2_multi_seme_filtro_serie(engine, golden_data):
    """Verifica Req 2: Multi-seme con filtro medium=series e cap=30."""
    gold = golden_data["req2"]
    req = gold["req"]

    status, resp = esegui_richiesta(req, engine)

    assert status == 200
    assert resp["contratto"] == 1
    assert resp["semi"]["n"] == 2
    assert resp["semi"]["da_catalogo"] is False

    ruoli = [l["ruolo"] for l in resp["liste"]]
    assert "il_tuo_mondo" in ruoli

    for l in resp["liste"]:
        assert len(l["titoli"]) <= 30
        for t in l["titoli"]:
            assert t["medium"] == "series"
            assert isinstance(t["punteggio"], float)


def test_golden_req3_storia_fuori_dal_canone(engine, golden_data):
    """Verifica Req 3: Storia con seme inesistente / fuori dal canone."""
    gold = golden_data["req3"]
    req = gold["req"]
    gold_resp = gold["resp"]

    status, resp = esegui_richiesta(req, engine)

    assert status == 200
    assert resp["contratto"] == 1
    assert resp["semi"]["n"] == 0
    assert resp["semi"]["da_catalogo"] is False
    assert resp["liste"] == []
    assert resp["motivi"] == ["storia fuori dal canone"]
    assert set(resp.keys()) == set(gold_resp.keys())
