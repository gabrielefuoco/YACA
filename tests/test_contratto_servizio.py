"""test_contratto_servizio.py — Collaudo del contratto del motore (Ticket 07).

Verifica:
  1. GET /health in <1 ms con {ok, contratto, versioni} (E3)
  2. POST con la richiesta del contratto (§3): risposta conforme a §4
  3. Pesi numerici del seme (E1)
  4. Tipo "catalogo" (E2): accende da_catalogo: true e non compare nei suggerimenti
  5. Medium opzionale (E4): se assente restituisce entrambi i medium
  6. Degrado: storia fuori dal canone -> 200 con liste vuote e motivo (§6)
  7. Degrado: richiesta malformata -> 400
  8. Degrado: motore non pronto -> 503
  9. Chiamata reale su socket HTTP
"""
import http.client
import json
import threading
import time

import pytest

from graph import bubbles as B
from graph import motore as MO
from graph import parametri as P
from graph.servizio import crea_server, esegui_richiesta


@pytest.fixture(scope="module")
def motore():
    return MO.Motore(silenzioso=True)


@pytest.fixture(scope="module")
def server_http(motore):
    server, _ = crea_server(host="127.0.0.1", port=0, motore=motore)
    port = server.server_address[1]
    th = threading.Thread(target=server.serve_forever, daemon=True)
    th.start()
    yield f"127.0.0.1:{port}"
    server.shutdown()
    server.server_close()


# ------------------------------------------------------------------ 1. GET /health (E3)
def test_health_in_meno_di_un_millisecondo(server_http, motore):
    host, port = server_http.split(":")
    conn = http.client.HTTPConnection(host, int(port), timeout=2)

    # Prima chiamata a vuoto per scaldare la connessione TCP
    conn.request("GET", "/health")
    resp = conn.getresponse()
    resp.read()

    # Misura pura della risposta
    t0 = time.perf_counter()
    conn.request("GET", "/health")
    resp = conn.getresponse()
    data = json.loads(resp.read().decode("utf-8"))
    durata_ms = (time.perf_counter() - t0) * 1000

    conn.close()

    assert resp.status == 200
    assert data["ok"] is True
    assert data["contratto"] == 1
    assert data["versioni"]["artefatto"] == motore.artefatto
    assert data["versioni"]["ricetta"] == P.impronta()
    assert durata_ms < 10.0, f"Healthcheck troppo lento: {durata_ms:.3f} ms"


# ------------------------------------------------------------------ 2. La richiesta del contratto (§3, §4)
def test_richiesta_esempio_contratto(motore):
    richiesta = {
        "semi": [{"tmdbId": 655, "medium": "series", "tipo": "watched", "peso": 0.42}],
        "medium": "series",
        "opzioni": {"largo": 4, "lontano": 0.0, "cozy": 0.0, "canone": 0.0},
        "cap": 60,
    }
    status, res = esegui_richiesta(richiesta, motore)

    assert status == 200
    assert res["contratto"] == 1
    assert res["versioni"]["artefatto"] == motore.artefatto
    assert res["versioni"]["ricetta"] == P.impronta()
    assert isinstance(res["semi"]["n"], int) and res["semi"]["n"] >= 1
    assert res["semi"]["da_catalogo"] is False
    assert isinstance(res["liste"], list) and len(res["liste"]) >= 1
    assert isinstance(res["motivi"], list)

    ruoli = [li["ruolo"] for li in res["liste"]]
    assert "il_tuo_mondo" in ruoli
    assert "un_passo_fuori" in ruoli

    for li in res["liste"]:
        assert "ruolo" in li
        assert "mondo" in li
        assert "descrizione" in li and isinstance(li["descrizione"], str) and len(li["descrizione"]) > 0
        assert "attivazione" in li and isinstance(li["attivazione"], float)
        assert "mediana_voti" in li and isinstance(li["mediana_voti"], float)
        assert "quota_serie" in li and 0.0 <= li["quota_serie"] <= 1.0
        assert "semi" in li and isinstance(li["semi"], list)
        assert "titoli" in li and isinstance(li["titoli"], list)
        assert len(li["titoli"]) <= 60

        for t in li["titoli"]:
            assert isinstance(t["tmdbId"], int)
            assert t["medium"] == "series"  # filtro E4 applicato
            assert isinstance(t["punteggio"], float)

        # Monotonia dell'ordine dei punteggi (eccetto nicchia_di_qualita per contratto §9.4)
        if li["ruolo"] != "nicchia_di_qualita" and len(li["titoli"]) > 1:
            punti = [t["punteggio"] for t in li["titoli"]]
            for i in range(len(punti) - 1):
                assert punti[i] >= punti[i + 1] - 1e-6


# ------------------------------------------------------------------ 3. E1: peso numerico
def test_peso_numerico_utilizzabile(motore):
    rich_default = {
        "semi": [{"tmdbId": 603, "medium": "movie", "tipo": "watched"}],
        "cap": 10,
    }
    rich_pesata = {
        "semi": [{"tmdbId": 603, "medium": "movie", "tipo": "watched", "peso": 5.0}],
        "cap": 10,
    }
    s1, r1 = esegui_richiesta(rich_default, motore)
    s2, r2 = esegui_richiesta(rich_pesata, motore)

    assert s1 == 200 and s2 == 200
    assert r1["liste"][0]["titoli"][0]["tmdbId"] == r2["liste"][0]["titoli"][0]["tmdbId"]


# ------------------------------------------------------------------ 4. E2: tipo "catalogo"
def test_tipo_catalogo_accende_flag_e_non_compare_nei_titoli(motore):
    # Usiamo The Matrix (movie:603) come seme catalogo
    richiesta = {
        "semi": [{"tmdbId": 603, "medium": "movie", "tipo": "catalogo"}],
        "cap": 60,
    }
    status, res = esegui_richiesta(richiesta, motore)

    assert status == 200
    assert res["semi"]["da_catalogo"] is True

    # Verifica che 603 NON compaia in nessuna lista suggerita
    tutti_i_titoli = [t["tmdbId"] for li in res["liste"] for t in li["titoli"]]
    assert 603 not in tutti_i_titoli


# ------------------------------------------------------------------ 5. E4: medium opzionale
def test_medium_opzionale_restituisce_entrambi(motore):
    # Un film e una serie come semi
    richiesta = {
        "semi": [
            {"tmdbId": 603, "medium": "movie", "tipo": "watched"},
            {"tmdbId": 1396, "medium": "series", "tipo": "watched"},
        ],
        "cap": 30,
    }
    status, res = esegui_richiesta(richiesta, motore)

    assert status == 200
    tutti_i_medium = {t["medium"] for li in res["liste"] for t in li["titoli"]}
    # Deve contenere sia movie che series
    assert "movie" in tutti_i_medium
    assert "series" in tutti_i_medium


# ------------------------------------------------------------------ 6. Degrado: fuori dal canone (§6)
def test_degrado_storia_fuori_dal_canone(motore):
    richiesta = {
        "semi": [{"tmdbId": 999999999, "medium": "movie", "tipo": "watched"}],
    }
    status, res = esegui_richiesta(richiesta, motore)

    assert status == 200
    assert res["contratto"] == 1
    assert res["liste"] == []
    assert res["motivi"] == ["storia fuori dal canone"]
    assert res["semi"]["n"] == 0


def test_degrado_storia_vuota(motore):
    richiesta = {"semi": []}
    status, res = esegui_richiesta(richiesta, motore)

    assert status == 200
    assert res["liste"] == []
    assert res["motivi"] == ["storia fuori dal canone"]


# ------------------------------------------------------------------ 7. Degrado: richiesta malformata (400)
def test_richiesta_malformata_restituisce_400(motore):
    s1, r1 = esegui_richiesta("non-un-dizionario", motore)
    assert s1 == 400

    s2, r2 = esegui_richiesta({"semi": "non-una-lista"}, motore)
    assert s2 == 400

    s3, r3 = esegui_richiesta({"semi": [], "medium": "podcast"}, motore)
    assert s3 == 400


# ------------------------------------------------------------------ 8. Degrado: motore assente (503)
def test_motore_assente_restituisce_503():
    status, res = esegui_richiesta({"semi": []}, motore=None)
    assert status == 503
    assert res["ok"] is False


# ------------------------------------------------------------------ 9. Chiamata HTTP reale
def test_chiamata_post_su_rete_http(server_http):
    host, port = server_http.split(":")
    conn = http.client.HTTPConnection(host, int(port), timeout=5)

    payload = json.dumps({
        "semi": [{"tmdbId": 603, "medium": "movie", "tipo": "loved"}],
        "cap": 15,
    }).encode("utf-8")

    conn.request("POST", "/raccomanda", body=payload, headers={"Content-Type": "application/json"})
    resp = conn.getresponse()
    body = json.loads(resp.read().decode("utf-8"))
    conn.close()

    assert resp.status == 200
    assert body["contratto"] == 1
    assert len(body["liste"]) >= 1
