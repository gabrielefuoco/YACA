"""test_vicini.py — Collaudo dell'endpoint POST /vicini (26/11/2026).

`/vicini` sostituisce `POST /raccomanda` (v1, rimosso): legge la matrice precalcolata
`vicini-top100.npz` invece di calcolare PageRank. Verifiche coperte:

1. un seme valido restituisce i vicini, ordinati per punteggio decrescente, senza il seme stesso;
2. più semi si sommano: chi è vicino a più semi sale;
3. `medium` filtra il risultato;
4. semi fuori canone: 200 con `motivi`, non un errore;
5. input malformati: 400 esplicito;
6. artefatto mancante: 503 con il comando di rigenerazione;
7. **allineamento**: la matrice ha una riga per ogni titolo del canone e la sua provenienza
   dichiara lo stesso sha del triangolo v46 servito — se il grafo cambia e la matrice no, questo
   test lo dice.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from graph import canon as K
from graph import servizio


@pytest.fixture(autouse=True)
def clean_v45_singletons():
    yield
    servizio.reset_singletons_v45()


@pytest.fixture(scope="module")
def un_seme():
    return {"tmdbId": 157336, "medium": "movie"}   # Interstellar


def test_vicini_di_un_seme_ordinati_e_senza_il_seme(un_seme):
    status, res = servizio.esegui_vicini({"semi": [un_seme], "medium": "movie", "cap": 10})

    assert status == 200
    assert res["contratto"] == 2
    assert len(res["vicini"]) == 10
    punteggi = [v["punteggio"] for v in res["vicini"]]
    assert punteggi == sorted(punteggi, reverse=True)
    assert all(v["medium"] == "movie" for v in res["vicini"])
    assert all(v["tmdbId"] != 157336 for v in res["vicini"])


def test_piu_semi_si_sommano(un_seme):
    _, singolo = servizio.esegui_vicini({"semi": [un_seme], "medium": "movie", "cap": 5})
    _, doppio = servizio.esegui_vicini({
        "semi": [un_seme, {"tmdbId": 27205, "medium": "movie"}],
        "medium": "movie",
        "cap": 5,
    })

    # Un vicino comune ai due semi vale più di quanto valesse con un seme solo.
    comuni = set(v["tmdbId"] for v in singolo["vicini"]) & set(v["tmdbId"] for v in doppio["vicini"])
    assert comuni, "i due semi devono avere almeno un vicino in comune"
    primo = doppio["vicini"][0]
    corrispondente = next((v for v in singolo["vicini"] if v["tmdbId"] == primo["tmdbId"]), None)
    if corrispondente:
        assert primo["punteggio"] > corrispondente["punteggio"]


def test_medium_filtra():
    # Con un seme serie e medium "series" i vicini sono serie: Game of Thrones → altre serie.
    status, res = servizio.esegui_vicini({"semi": [{"tmdbId": 1399, "medium": "series"}], "medium": "series", "cap": 10})

    assert status == 200
    assert res["vicini"]
    assert all(v["medium"] == "series" for v in res["vicini"])


def test_medium_incrociato_puo_essere_vuoto(un_seme):
    # I vicini di un film sono quasi tutti film: il grafo è omogeneo per medium per costruzione
    # (policy P2), e la matrice conserva i 100 archi più forti. Chiedere le *serie* vicine di un
    # film quindi può dare zero — è una proprietà del dato, non un guasto. Per le controparti
    # dell'altro medium il motore usa l'affinità (`calcola_sim_affinity`), non questa rotta.
    status, res = servizio.esegui_vicini({"semi": [un_seme], "medium": "series", "cap": 10})

    assert status == 200
    assert res["vicini"] == []


def test_semi_fuori_canone_non_e_un_errore():
    status, res = servizio.esegui_vicini({"semi": [{"tmdbId": 999999999, "medium": "movie"}]})

    assert status == 200
    assert res["vicini"] == []
    assert res["motivi"] == ["semi fuori dal canone"]
    assert res["semi"] == {"n": 0, "scartati": 1}


@pytest.mark.parametrize("corpo,parola", [
    ({}, "semi"),
    ({"semi": "movie:603"}, "semi"),
    ({"semi": []}, "semi"),
    ({"semi": [{"tmdbId": 603, "medium": "movie"}], "medium": "podcast"}, "medium"),
    ({"semi": [{"tmdbId": 603, "medium": "movie"}], "cap": 0}, "cap"),
    ({"semi": [{"tmdbId": 603, "medium": "movie"}], "cap": "molti"}, "cap"),
])
def test_input_malformati(corpo, parola):
    status, res = servizio.esegui_vicini(corpo)
    assert status == 400
    assert parola in res["errore"]


def test_artefatto_mancante_restituisce_503(monkeypatch):
    servizio.reset_singletons_v45()
    monkeypatch.setattr(servizio, "VICINI_PATH", Path("/percorso/inesistente/vicini.npz"))
    monkeypatch.delenv("V45_VICINI_PATH", raising=False)

    status, res = servizio.esegui_vicini({"semi": [{"tmdbId": 603, "medium": "movie"}]})

    assert status == 503
    assert "vicini-top100.npz" in res["errore"]
    assert "prepara --target vicini" in res["errore"]


def test_matrice_allineata_al_canone_e_al_triangolo_servito():
    from graph.runtime import prepara as _prepara  # noqa: F401  (documenta da dove nasce)

    path_vicini = servizio.risolvi_percorso_vicini()
    percorso_triangolo = Path(__file__).resolve().parents[1] / "data" / "v46" / "v46-triangolo.npz"

    z_vicini = np.load(path_vicini, allow_pickle=False)
    prov_vicini = json.loads(str(z_vicini["_provenance"]))
    z_triangolo = np.load(percorso_triangolo, allow_pickle=False)
    prov_triangolo = json.loads(str(z_triangolo["_provenance"]))

    chiavi, _, n_canone, _ = K.titoli()
    assert tuple(int(x) for x in z_vicini["shape"]) == (n_canone, n_canone)
    assert prov_vicini["canon_len"] == n_canone
    assert prov_vicini["params"]["top_k"] == 100

    # L'input dichiarato dalla matrice è il triangolo che il servizio serve: stesso sha256.
    assert prov_vicini["inputs"] == {"v45-triangolo.npz": prov_triangolo["sha256"]}
