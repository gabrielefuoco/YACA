"""test_servizio_scaffali.py — Collaudo dell'endpoint POST /scaffali (Ticket 08 / V45).

Verifiche coperte:
1. Richiesta valida con profilo lungo (warnok) restituisce 200 con 8 scaffali qualificati;
2. Semi vuoti restituisce 200 con lista scaffali vuota e statistiche a zero (non un errore);
3. Corpo o campi malformati restituiscono 400 con messaggio esplicito;
4. Chiave sconosciuta nel dizionario del seme (es. 'play' invece di 'plays') viene RIFIUTATA con 400;
5. Artefatto mancante (transizione o vicini) restituisce 503 (monkeypatch del percorso);
6. Schema della risposta rigoroso: asserzione esatta sulle chiavi di primo livello, statistiche,
   scaffale, semi_rappresentativi, semi_membri e titoli;
7. Chiamata end-to-end su socket HTTP in-process.
"""
from __future__ import annotations

import http.client
import json
import threading
import time
from pathlib import Path
from typing import Any

import pytest

from graph import canon as K
from graph import servizio


@pytest.fixture(autouse=True)
def clean_v45_singletons():
    """Assicura che lo stato dei singleton sia pulito tra i test."""
    yield
    servizio.reset_singletons_v45()


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
def sangam456_seeds() -> list[dict[str, Any]]:
    chiavi, _, plays, eta = K.storia_trakt("sangam456", ordine="recente")
    return [
        {
            "key": str(k),
            "plays": float(pl),
            "eta_giorni": float(et),
        }
        for k, pl, et in zip(chiavi, plays, eta)
    ]


# ------------------------------------------------------------------------------
# 1. Profilo lungo -> 200 con 16 scaffali (8 base + 8 controparti ammesse)
# ------------------------------------------------------------------------------
def test_profilo_lungo_restituisce_200_con_16_scaffali(warnok_seeds):
    status, res = servizio.esegui_scaffali({"semi": warnok_seeds, "n": 8})

    assert status == 200
    assert res["ok"] is True
    assert res["contratto_versione"] == 2
    assert len(res["scaffali"]) == 16

    stat = res["statistiche"]
    assert stat["semi_totali"] == len(warnok_seeds)
    assert stat["semi_coperti"] > 0
    assert stat["righe"] == 16

    # Verifica ordinamento slot 1..16
    slots = [s["slot"] for s in res["scaffali"]]
    assert slots == list(range(1, 17))


# ------------------------------------------------------------------------------
# 2. Semi vuoti -> 200 con lista vuota
# ------------------------------------------------------------------------------
def test_semi_vuoti_restituisce_200_lista_vuota():
    status, res = servizio.esegui_scaffali({"semi": []})

    assert status == 200
    assert res["ok"] is True
    assert res["contratto_versione"] == 2
    assert res["scaffali"] == []
    assert res["statistiche"] == {
        "semi_totali": 0,
        "semi_coperti": 0,
        "righe": 0,
    }


# ------------------------------------------------------------------------------
# 3. Corpo malformato -> 400
# ------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "corpo_malformato",
    [
        "non-un-dizionario",
        [],
        123,
        {"semi": "non-una-lista"},
        {"semi": [123]},  # elemento non dizionario
        {"semi": [{"medium": "movie"}]},  # manca key o tmdbId
        {"semi": [{"key": "chiave_senza_due_punti"}]},
        {"semi": [{"key": "book:123"}]},  # prefisso sconosciuto
        {"semi": [{"tmdbId": "non_numero", "medium": "movie"}]},
        {"semi": [{"tmdbId": 123}]},  # manca medium quando si passa tmdbId
        {"semi": [{"key": "movie:603", "medium": "invalid_medium"}]},
        {"semi": [{"key": "movie:603", "plays": -1.0}]},
        {"semi": [{"key": "movie:603", "frazione": 1.5}]},
        {"semi": [{"key": "movie:603", "eta_giorni": -10}]},
        {"semi": [{"key": "movie:603", "watched": "not_bool"}]},
        {"semi": [{"key": "movie:603", "library_only": "not_bool"}]},
        {"semi": [{"key": "movie:603", "tipo": 123}]},
        {"semi": [{"key": "movie:603", "tipi": 123}]},
        {"semi": [], "medium": "game"},
        {"semi": [], "n": 0},
        {"semi": [], "n": -5},
        {"semi": [], "esclusi": "non-una-lista"},
        {"semi": [], "esclusi": [None]},
    ],
)
def test_corpo_malformato_restituisce_400(corpo_malformato):
    status, res = servizio.esegui_scaffali(corpo_malformato)
    assert status == 400
    assert res["ok"] is False
    assert "errore" in res
    assert isinstance(res["errore"], str)


# ------------------------------------------------------------------------------
# 4. Chiave sconosciuta nel seme -> 400 (bug 'play' vs 'plays')
# ------------------------------------------------------------------------------
def test_chiave_seme_sconosciuta_restituisce_400():
    # 'play' invece di 'plays'
    status, res = servizio.esegui_scaffali({
        "semi": [{"key": "movie:603", "play": 2.0}]
    })
    assert status == 400
    assert res["ok"] is False
    assert "chiave non riconosciuta nel seme" in res["errore"]
    assert "play" in res["errore"]

    # Altra chiave ignota casuale
    status2, res2 = servizio.esegui_scaffali({
        "semi": [{"key": "movie:603", "unsupported_field": True}]
    })
    assert status2 == 400
    assert res2["ok"] is False
    assert "unsupported_field" in res2["errore"]


# ------------------------------------------------------------------------------
# 5. Artefatto mancante -> 503 (monkeypatch)
# ------------------------------------------------------------------------------
def test_artefatto_transizione_mancante_restituisce_503(monkeypatch):
    servizio.reset_singletons_v45()
    monkeypatch.setattr(servizio, "TRANSIZIONE_PATH", "/percorso/inesistente/transizione.npz")

    status, res = servizio.esegui_scaffali({
        "semi": [{"key": "movie:603", "plays": 1.0}]
    })
    assert status == 503
    assert res["ok"] is False
    assert "artefatto mancante" in res["errore"]


def test_artefatto_vicini_mancante_restituisce_503(monkeypatch):
    servizio.reset_singletons_v45()
    monkeypatch.setattr(servizio, "VICINI_PATH", "/percorso/inesistente/vicini.npz")

    status, res = servizio.esegui_scaffali({
        "semi": [{"key": "movie:603", "plays": 1.0}]
    })
    assert status == 503
    assert res["ok"] is False
    assert ("artefatto vicini mancante" in res["errore"] or "artefatto mancante" in res["errore"])


# ------------------------------------------------------------------------------
# 6. Schema esatto della risposta (blocco anti-regressione)
# ------------------------------------------------------------------------------
def test_schema_risposta_esatto(sangam456_seeds):
    status, res = servizio.esegui_scaffali({"semi": sangam456_seeds})
    assert status == 200

    # 1. Chiavi di primo livello ESATTE
    assert set(res.keys()) == {"ok", "contratto_versione", "scaffali", "statistiche"}
    assert res["ok"] is True
    assert res["contratto_versione"] == 2

    # 2. Chiavi di statistiche ESATTE
    assert set(res["statistiche"].keys()) == {"semi_totali", "semi_coperti", "righe"}
    assert isinstance(res["statistiche"]["semi_totali"], int)
    assert isinstance(res["statistiche"]["semi_coperti"], int)
    assert isinstance(res["statistiche"]["righe"], int)

    # 3. Chiavi dello scaffale ESATTE
    assert len(res["scaffali"]) > 0
    EXPECTED_SHELF_KEYS = {
        "catalog_id",
        "nome",
        "nome_display",
        "nome_fonte",
        "confidenza",
        "medium",
        "slot",
        "semi_rappresentativi",
        "semi_membri",
        "titoli",
    }
    EXPECTED_REP_KEYS = {"titolo", "anno", "tmdbId", "plays", "eta_giorni"}
    EXPECTED_TITLE_KEYS = {"key", "tmdbId", "medium", "punteggio"}
    EXPECTED_MEMBER_KEYS = {"titolo", "anno", "tmdbId", "medium"}

    for sh in res["scaffali"]:
        assert set(sh.keys()) == EXPECTED_SHELF_KEYS
        assert isinstance(sh["catalog_id"], str)
        assert isinstance(sh["nome"], str)
        assert isinstance(sh["nome_display"], str)
        assert isinstance(sh["nome_fonte"], str)
        assert isinstance(sh["confidenza"], float)
        assert isinstance(sh["medium"], str)
        assert isinstance(sh["slot"], int)
        assert isinstance(sh["semi_rappresentativi"], list)
        assert isinstance(sh["semi_membri"], list)
        assert isinstance(sh["titoli"], list)

        # 4. Chiavi di ciascun semi_rappresentativi ESATTE
        for sr in sh["semi_rappresentativi"]:
            assert set(sr.keys()) == EXPECTED_REP_KEYS
            assert isinstance(sr["titolo"], str)
            assert isinstance(sr["anno"], int)
            assert isinstance(sr["tmdbId"], int)
            assert isinstance(sr["plays"], float)
            assert isinstance(sr["eta_giorni"], float)

        # 5. Chiavi di ciascun semi_membri ESATTE
        for sm in sh["semi_membri"]:
            assert set(sm.keys()) == EXPECTED_MEMBER_KEYS
            assert isinstance(sm["titolo"], str)
            assert isinstance(sm["anno"], int)
            assert isinstance(sm["tmdbId"], int)
            assert isinstance(sm["medium"], str)

        # 6. Chiavi di ciascun titolo raccomandato ESATTE
        for t in sh["titoli"]:
            assert set(t.keys()) == EXPECTED_TITLE_KEYS
            assert isinstance(t["key"], str)
            assert isinstance(t["tmdbId"], int)
            assert isinstance(t["medium"], str)
            assert isinstance(t["punteggio"], float)


# ------------------------------------------------------------------------------
# 7. Omogeneità rigorosa del medium per riga (senza eccezioni)
# ------------------------------------------------------------------------------
def test_omogeneita_rigorosa_medium_nessuna_eccezione(warnok_seeds):
    status, res = servizio.esegui_scaffali({"semi": warnok_seeds, "n": 8})
    assert status == 200
    assert len(res["scaffali"]) > 0

    engine = servizio.get_engine_v45()

    for sh in res["scaffali"]:
        m_row = sh["medium"]
        for rep in sh["semi_rappresentativi"]:
            pref = "tv" if m_row == "series" else "movie"
            k = f"{pref}:{rep['tmdbId']}"
            assert k in engine.row_of, f"Seme rappresentativo {k} non trovato nel canone per riga {m_row}"
        for memb in sh["semi_membri"]:
            assert memb["medium"] == m_row, f"Seme membro {memb} ha medium misto rispetto a riga {m_row}"
        for cand in sh["titoli"]:
            assert cand["medium"] == m_row, f"Titolo raccomandato {cand} medium errato in riga {m_row}"


# ------------------------------------------------------------------------------
# 8. GAP 3: Profili minuscoli tornano a servire righe (carverclan = 4 righe)
# ------------------------------------------------------------------------------
def test_profilo_corto_serve_scaffali(carverclan_seeds):
    status, res = servizio.esegui_scaffali({"semi": carverclan_seeds})
    assert status == 200
    assert res["ok"] is True
    assert res["contratto_versione"] == 2
    # carverclan: 2 scaffali base + 2 controparti ammesse
    assert len(res["scaffali"]) == 4
    assert res["statistiche"]["semi_totali"] == 7
    assert res["statistiche"]["semi_coperti"] == 4
    assert res["statistiche"]["righe"] == 4

    # Verifica omogeneità rigorosa del medium
    for sh in res["scaffali"]:
        m_row = sh["medium"]
        for memb in sh["semi_membri"]:
            assert memb["medium"] == m_row
        for cand in sh["titoli"]:
            assert cand["medium"] == m_row
        assert 20 <= len(sh["titoli"]) <= 60


# ------------------------------------------------------------------------------
# 9. Chiamata HTTP end-to-end su socket
# ------------------------------------------------------------------------------
def test_chiamata_http_scaffali_su_socket(sangam456_seeds):
    server, _ = servizio.crea_server(host="127.0.0.1", port=0, carica_motore=False)
    port = server.server_address[1]
    th = threading.Thread(target=server.serve_forever, daemon=True)
    th.start()

    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    payload = json.dumps({"semi": sangam456_seeds}).encode("utf-8")
    conn.request("POST", "/scaffali", body=payload, headers={"Content-Type": "application/json"})
    resp = conn.getresponse()
    data = json.loads(resp.read().decode("utf-8"))
    conn.close()

    server.shutdown()
    server.server_close()

    assert resp.status == 200
    assert data["ok"] is True
    assert data["contratto_versione"] == 2
    # sangam456: 2 base + 2 controparti ammesse = 4
    assert len(data["scaffali"]) == 4
    assert data["statistiche"]["semi_totali"] == 10


# ------------------------------------------------------------------------------
# 10. GAP 2: Ogni riga servita deve restituire tra 20 e cap candidati
# ------------------------------------------------------------------------------
def test_candidati_per_riga_tra_20_e_cap(warnok_seeds):
    # Verifica su profilo lungo con cap di default (60)
    status, res = servizio.esegui_scaffali({"semi": warnok_seeds, "n": 8, "cap": 60})
    assert status == 200
    assert len(res["scaffali"]) == 16
    for sh in res["scaffali"]:
        assert 20 <= len(sh["titoli"]) <= 60, f"Riga '{sh['nome']}' ({sh['medium']}) ha {len(sh['titoli'])} candidati"

    # Verifica su profilo giustificato da un singolo seme (The Matrix)
    status_single, res_single = servizio.esegui_scaffali({
        "semi": [{"key": "movie:603", "plays": 1.0, "eta_giorni": 0.0}],
        "cap": 60,
    })
    assert status_single == 200
    assert len(res_single["scaffali"]) >= 1
    for sh in res_single["scaffali"]:
        assert 20 <= len(sh["titoli"]) <= 60, f"Riga da singolo seme ha {len(sh['titoli'])} candidati"

    # Verifica con cap personalizzato (es. cap = 25)
    status_custom, res_custom = servizio.esegui_scaffali({
        "semi": [{"key": "movie:603", "plays": 1.0, "eta_giorni": 0.0}],
        "cap": 25,
    })
    assert status_custom == 200
    assert len(res_custom["scaffali"]) >= 1
    for sh in res_custom["scaffali"]:
        assert 20 <= len(sh["titoli"]) <= 25, f"Riga con cap=25 ha {len(sh['titoli'])} candidati"


# ------------------------------------------------------------------------------
# 11. DEFECT 1 & 2: Adiacenza controparti, nome_display e limite <= 16 righe
# ------------------------------------------------------------------------------
def test_adiacenza_controparti_e_nome_display(warnok_seeds):
    """Verifica che primario e controparte siano adiacenti e che nome_display contenga il suffisso."""
    status, res = servizio.esegui_scaffali({"semi": warnok_seeds, "n": 8, "cap": 60})
    assert status == 200
    scaffali = res["scaffali"]
    assert len(scaffali) <= 16

    # Verifica adiacenza: a coppie (primario, controparte) condividono il prefisso di catalog_id
    for i in range(0, len(scaffali) - 1, 2):
        s1 = scaffali[i]
        s2 = scaffali[i + 1]
        pref1 = s1["catalog_id"].rsplit("_", 1)[0]
        pref2 = s2["catalog_id"].rsplit("_", 1)[0]
        if pref1 == pref2:
            assert s1["medium"] != s2["medium"], f"Coppia adiacente {s1['nome']} ha stesso medium"
            assert s1["nome_display"].endswith("(film)") or s1["nome_display"].endswith("(serie)")
            assert s2["nome_display"].endswith("(film)") or s2["nome_display"].endswith("(serie)")
            assert s1["nome"] == s2["nome"]
            expected_s1 = f"{s1['nome']} ({'film' if s1['medium'] == 'movie' else 'serie'})"
            expected_s2 = f"{s2['nome']} ({'film' if s2['medium'] == 'movie' else 'serie'})"
            assert s1["nome_display"] == expected_s1
            assert s2["nome_display"] == expected_s2

    # Verifica che con filtro medium esplicito non ci sia suffisso
    status_m, res_m = servizio.esegui_scaffali({"semi": warnok_seeds, "n": 8, "medium": "movie"})
    assert status_m == 200
    for sh in res_m["scaffali"]:
        assert sh["nome_display"] == sh["nome"]
        assert not sh["nome_display"].endswith("(film)")
        assert not sh["nome_display"].endswith("(serie)")


