"""test_kids.py — Test per il filtro della modalità Bambini nel grafo V45 (Ticket 10 / Ticket 11).

Verifiche coperte:
1. All'avvio dell'Engine, viene costruito il vettore booleano `kids_ok` (76.497 elementi);
2. GET /health segnala la presenza e il caricamento dell'artefatto 'blacklist' con SHA congelato (42a9792074d9c6e2...);
3. Se blacklist.json manca:
   - startup warning rumoroso con percorso e comando di rigenerazione;
   - /health segnala assenza (present=False, loaded=False);
   - richiesta con kids=True restituisce 503 con messaggio esplicito (nessun 500 né catalogo non filtrato);
   - richiesta con kids=False continua a funzionare con 200;
4. Richiesta kids=True su profilo con storia adulta restituisce ZERO titoli vietati dalla blacklist;
5. Richiesta non-kids (kids=False o assente) produce risultati byte-identici.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from graph import canon as K
from graph import kids as _kids
from graph import servizio
from graph.runtime import Engine


@pytest.fixture(autouse=True)
def clean_v45_singletons():
    """Assicura che lo stato dei singleton e della cache sia pulito prima e dopo ogni test."""
    servizio.reset_singletons_v45()
    _kids.reset_cache_kids()
    yield
    servizio.reset_singletons_v45()
    _kids.reset_cache_kids()


@pytest.fixture(scope="module")
def carverclan_seeds() -> list[dict[str, Any]]:
    chiavi, _, plays, eta = K.storia_trakt("carverclan", ordine="recente")
    return [
        {
            "key": str(k),
            "plays": float(pl),
            "eta_giorni": float(et),
        }
        for k, pl, et in zip(chiavi, plays, eta)
    ]


@pytest.fixture(scope="module")
def warnok_seeds() -> list[dict[str, Any]]:
    chiavi, _, plays, eta = K.storia_trakt("warnok", ordine="recente")
    return [
        {
            "key": str(k),
            "plays": float(pl),
            "eta_giorni": float(et),
        }
        for k, pl, et in zip(chiavi, plays, eta)
    ]


def test_kids_ok_vector_build():
    """Verifica la costruzione corretta del vettore kids_ok di dimensione canone (76.497)."""
    kok, err = _kids.carica_kids_ok(76497)
    assert err is None
    assert kok is not None
    assert isinstance(kok, np.ndarray)
    assert kok.dtype == bool
    assert len(kok) == 76497

    # Conteggi congelati da Ticket 10: 9.042 esclusi, 67.455 ammessi
    n_ok = int(np.sum(kok))
    n_bad = int(np.sum(~kok))
    assert n_bad == 9042
    assert n_ok == 67455


def test_health_artefatto_blacklist():
    """Verifica che /health includa 'blacklist' con provenance e caricamento."""
    engine = servizio.get_engine_v45()
    assert engine.kids_ok is not None

    payload = servizio.costruisci_health_payload(engine=engine)
    arts = payload["artefatti"]
    assert "blacklist" in arts
    bl = arts["blacklist"]
    assert bl["present"] is True
    assert bl["loaded"] is True
    assert bl["sha"] is not None
    assert bl["sha"].startswith("42a9792074d9c6e2")


def test_missing_blacklist_loud_degradation(monkeypatch, tmp_path, warnok_seeds):
    """Verifica che l'assenza di blacklist.json:
    1. Generi un warning di avvio con percorso e comando di rigenerazione;
    2. Venga segnalata in /health (present=False, loaded=False);
    3. Una richiesta kids=True venga rifiutata con 503 ed errore esplicito (NON 500);
    4. Una richiesta kids=False risponda normalmente con 200.
    """
    falso_percorso = tmp_path / "blacklist_non_esiste.json"
    monkeypatch.setenv("BLACKLIST_BAMBINI_PATH", str(falso_percorso))
    servizio.reset_singletons_v45()
    _kids.reset_cache_kids()

    # 1. Health check segnala assenza
    payload = servizio.costruisci_health_payload()
    bl_entry = payload["artefatti"]["blacklist"]
    assert bl_entry["present"] is False
    assert bl_entry["loaded"] is False
    assert bl_entry["sha"] is None

    # 2. Warning a startup con comando di rigenerazione
    warnings: list[str] = []
    servizio.verifica_startup_e_avvertimenti(logger_fn=lambda msg, *a, **kw: warnings.append(msg))
    testo_warnings = "\n".join(warnings)
    assert "blacklist.json" in testo_warnings
    assert "keyword-bambini/congelamento.py" in testo_warnings

    # 3. Richiesta kids=True su /scaffali -> rifiuto esplicito 503 (NON 500)
    status_scaffali, res_scaffali = servizio.esegui_scaffali({
        "semi": warnok_seeds[:10],
        "kids": True,
    })
    assert status_scaffali == 503
    assert res_scaffali["ok"] is False
    assert "blacklist.json" in res_scaffali["errore"]

    # 3b. Richiesta kids=True via opzioni.filtri.kids su /raccomanda -> rifiuto esplicito 503 (NON 500)
    status_racc, res_racc = servizio.esegui_richiesta({
        "semi": warnok_seeds[:10],
        "opzioni": {"filtri": {"kids": True}},
    })
    assert status_racc == 503
    assert res_racc["ok"] is False
    assert "blacklist.json" in res_racc["errore"]

    # 4. Richiesta kids=False -> risponde 200 normalmente
    status_ok, res_ok = servizio.esegui_scaffali({
        "semi": warnok_seeds[:10],
        "kids": False,
    })
    assert status_ok == 200
    assert res_ok["ok"] is True


def test_kids_filter_zero_blacklisted_titles_on_adult_profile(carverclan_seeds):
    """Verifica che un profilo adulto con kids=True restituisca ZERO titoli vietati."""
    engine = servizio.get_engine_v45()
    assert engine.kids_ok is not None

    status, res = servizio.esegui_scaffali({
        "semi": carverclan_seeds,
        "n": 8,
        "kids": True,
    })
    assert status == 200
    assert res["ok"] is True
    assert len(res["scaffali"]) > 0

    bl_data = json.load(open(_kids.risolvi_percorso_blacklist(), encoding="utf-8"))
    blacklist_set = set(bl_data["blacklist"])
    v_p, t_p = _kids.risolvi_percorso_kw_tfidf()
    vocab = json.load(open(v_p, encoding="utf-8"))
    bl_cols = [vocab["kw:" + kw] for kw in blacklist_set if ("kw:" + kw) in vocab]
    import scipy.sparse as sp
    X = sp.load_npz(t_p)
    X_bl = X[:, bl_cols]
    has_bad = np.diff(X_bl.indptr) > 0

    total_titles_checked = 0
    for sh in res["scaffali"]:
        titoli = sh["titoli"]
        assert len(titoli) >= 20, f"Lo scaffale {sh['nome']} ha solo {len(titoli)} titoli (< 20)"
        for t in titoli:
            k = t["key"]
            r = engine.row_of[k]
            assert engine.kids_ok[r], f"Titolo {k} non idoneo per kids_ok"
            assert not has_bad[r], f"Titolo {k} contiene keyword blacklisted"
            total_titles_checked += 1

    assert total_titles_checked > 0


def test_non_kids_request_unchanged(carverclan_seeds):
    """Verifica che una richiesta senza kids (kids=False) sia identica nei punteggi."""
    engine = servizio.get_engine_v45()

    recs_default = engine.raccomanda(carverclan_seeds[:20], cap=30)
    recs_explicit_false = engine.raccomanda(carverclan_seeds[:20], cap=30, kids=False)

    assert len(recs_default) == len(recs_explicit_false)
    for a, b in zip(recs_default, recs_explicit_false):
        assert a["key"] == b["key"]
        assert abs(a["punteggio"] - b["punteggio"]) < 1e-12
