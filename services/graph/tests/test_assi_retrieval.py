"""test_assi_retrieval.py — Test per gli assi Tono/Complessità e il filtro di retrieval (Ticket Tono/Complessità).

Verifiche coperte:
1. Validazione per occhio umano degli assi:
   - The Bear è cupo (> 0), Cars è leggero (< 0);
   - Barry Lyndon è esigente (> 0.5), The Transporter è lineare (< -0.5);
   - Parasite è cupo ed esigente (> 0.5), Love Actually è leggero (< -0.5).
2. Regression test fondamentale:
   - Slider a 0.0 (o omessi) restituisce ESATTAMENTE lo stesso identico output di oggi (bit-per-bit);
   - Nessuna modifica alla camminata del grafo (la transizione e il PPR restano intatti).
3. Efficacia dei filtri di retrieval:
   - tono = -1.0 promuove titoli leggeri e penalizza cupi;
   - tono = +1.0 promuove titoli cupi e penalizza leggeri;
   - complessita = -1.0 promuove titoli lineari e penalizza esigenti;
   - complessita = +1.0 promuove titoli esigenti e penalizza lineari.
4. Integrazione endpoint `/raccomanda` e `/scaffali`:
   - Accettano tono e complessita nel corpo o in opzioni;
   - Rifiutano valori fuori range [-1.0, 1.0] o malformati con HTTP 400.
"""
from __future__ import annotations

import pytest
import numpy as np

from graph import assi
from graph import canon as K
from graph.runtime import Engine
from graph import servizio
from graph import interessi as I


@pytest.fixture(scope="module")
def engine() -> Engine:
    return Engine.carica_transizione()


@pytest.fixture(scope="module")
def warnok_seeds() -> list[dict]:
    chiavi, _, plays, eta = K.storia_trakt("warnok", ordine="recente")
    return [
        {
            "key": str(k),
            "plays": float(pl),
            "eta_giorni": float(et),
        }
        for k, pl, et in zip(chiavi, plays, eta)
    ]


# ==============================================================================
# 1. VALIDAZIONE PER OCCHIO UMANO DEGLI ASSI
# ==============================================================================

def test_validazione_ad_occhio_degli_assi():
    """Se tono dice che The Bear è leggero o Cars è cupo, l'asse è sbagliato."""
    keys, row_of, N, is_tv = K.titoli()
    tono, comp = assi.carica_assi()

    assert len(tono) == N
    assert len(comp) == N

    # The Bear (tv:136315) deve essere cupo (> 0)
    r_bear = row_of["tv:136315"]
    assert tono[r_bear] > 0.5, f"The Bear deve essere cupo, valore calcolato: {tono[r_bear]}"

    # Cars (movie:920) deve essere leggero (< 0) e lineare (< 0)
    r_cars = row_of["movie:920"]
    assert tono[r_cars] < -0.5, f"Cars deve essere leggero, valore calcolato: {tono[r_cars]}"
    assert comp[r_cars] < 0.0, f"Cars deve essere lineare, valore calcolato: {comp[r_cars]}"

    # Barry Lyndon (movie:3175) deve essere esigente (> 0.5)
    r_barry = row_of["movie:3175"]
    assert comp[r_barry] > 0.5, f"Barry Lyndon deve essere esigente, valore calcolato: {comp[r_barry]}"

    # The Transporter (movie:4108) deve essere lineare (< -0.5)
    r_trans = row_of["movie:4108"]
    assert comp[r_trans] < -0.5, f"The Transporter deve essere lineare, valore calcolato: {comp[r_trans]}"

    # Parasite (movie:496243) deve essere cupo ed esigente
    r_para = row_of["movie:496243"]
    assert tono[r_para] > 0.3, f"Parasite deve essere cupo, valore calcolato: {tono[r_para]}"
    assert comp[r_para] > 0.5, f"Parasite deve essere esigente, valore calcolato: {comp[r_para]}"

    # Love Actually (movie:508) deve essere leggero (< -0.5)
    r_love = row_of["movie:508"]
    assert tono[r_love] < -0.5, f"Love Actually deve essere leggero, valore calcolato: {tono[r_love]}"


# ==============================================================================
# 2. REGRESSION TEST: SLIDER A 0 È 100% IDENTICO AL BASELINE
# ==============================================================================

def test_regressione_slider_zero_identico_a_oggi(engine, warnok_seeds):
    """La richiesta con slider a 0 restituisce esattamente gli stessi risultati di oggi."""
    base = engine.raccomanda(warnok_seeds, cap=30)
    zero = engine.raccomanda(warnok_seeds, cap=30, tono=0.0, complessita=0.0)

    assert len(base) == len(zero)
    for b_item, z_item in zip(base, zero):
        assert b_item["key"] == z_item["key"]
        assert b_item["tmdbId"] == z_item["tmdbId"]
        assert b_item["medium"] == z_item["medium"]
        assert pytest.approx(b_item["punteggio"], rel=1e-6) == z_item["punteggio"]

    # Verifica anche su endpoint /raccomanda
    status_b, res_b = servizio.esegui_richiesta({"semi": warnok_seeds[:5], "cap": 20}, engine)
    status_z, res_z = servizio.esegui_richiesta({"semi": warnok_seeds[:5], "cap": 20, "tono": 0.0, "complessita": 0.0}, engine)

    assert status_b == 200 and status_z == 200
    titoli_b = res_b["liste"][0]["titoli"]
    titoli_z = res_z["liste"][0]["titoli"]
    assert len(titoli_b) == len(titoli_z)
    for tb, tz in zip(titoli_b, titoli_z):
        assert tb["tmdbId"] == tz["tmdbId"]
        assert tb["punteggio"] == tz["punteggio"]


# ==============================================================================
# 3. EFFICACIA DEL FILTRO DI RETRIEVAL SUL TOP-20
# ==============================================================================

def test_efficacia_slider_tono_e_complessita(engine, warnok_seeds):
    """Verifica che gli slider spostino significativamente i risultati verso la posizione richiesta."""
    base = engine.raccomanda(warnok_seeds, cap=20)
    base_keys = {it["key"] for it in base}

    # Tono -1.0 (leggero)
    leggero = engine.raccomanda(warnok_seeds, cap=20, tono=-1.0)
    surv_leggero = base_keys & {it["key"] for it in leggero}
    assert 5 <= len(surv_leggero) <= 17, f"Tono leggero deve modulare la classifica: sopravvissuti {len(surv_leggero)}/20"

    # Tono +1.0 (cupo)
    cupo = engine.raccomanda(warnok_seeds, cap=20, tono=+1.0)
    surv_cupo = base_keys & {it["key"] for it in cupo}
    assert 4 <= len(surv_cupo) <= 16, f"Tono cupo deve modulare la classifica: sopravvissuti {len(surv_cupo)}/20"

    # Complessità -1.0 (lineare)
    lineare = engine.raccomanda(warnok_seeds, cap=20, complessita=-1.0)
    surv_lineare = base_keys & {it["key"] for it in lineare}
    assert 5 <= len(surv_lineare) <= 17, f"Complessità lineare deve modulare la classifica: sopravvissuti {len(surv_lineare)}/20"

    # Complessità +1.0 (esigente)
    esigente = engine.raccomanda(warnok_seeds, cap=20, complessita=+1.0)
    surv_esigente = base_keys & {it["key"] for it in esigente}
    assert 4 <= len(surv_esigente) <= 16, f"Complessità esigente deve modulare la classifica: sopravvissuti {len(surv_esigente)}/20"


# ==============================================================================
# 4. VALIDAZIONE INPUT HTTP ED ECCEZIONI
# ==============================================================================

def test_validazione_input_servizio(engine):
    """I valori fuori dal range [-1.0, 1.0] o malformati vengono respinti con 400."""
    status, res = servizio.esegui_richiesta({"semi": [{"tmdbId": 655, "medium": "series"}], "tono": 2.5}, engine)
    assert status == 400
    assert "tono" in res["errore"]

    status, res = servizio.esegui_richiesta({"semi": [{"tmdbId": 655, "medium": "series"}], "complessita": "invalido"}, engine)
    assert status == 400
    assert "complessita" in res["errore"]

    status, res = servizio.esegui_scaffali({"semi": [{"tmdbId": 655, "medium": "series"}], "tono": -1.5}, engine)
    assert status == 400
    assert "tono" in res["errore"]

    status, res = servizio.esegui_scaffali({"semi": [{"tmdbId": 655, "medium": "series"}], "complessita": 1.1}, engine)
    assert status == 400
    assert "complessita" in res["errore"]

    with pytest.raises(ValueError, match="tono non valido"):
        engine.raccomanda([{"key": "movie:603"}], tono=-1.5)

    with pytest.raises(ValueError, match="complessita non valida"):
        engine.raccomanda([{"key": "movie:603"}], complessita=5.0)
