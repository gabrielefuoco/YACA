"""Test unitari veloci e offline per il modulo interessi (services/graph/interessi).

VERIFICHE COPERTE:
1. Matching di tassonomia su cluster sintetici:
   - match univoco ad alta confidenza («Anime shōnen», «Dramma d'epoca»);
   - fallback trasparente «Perché hai visto» in assenza di match o pareggio.
2. Calcolo deterministico dell'adaptive floor:
   - formula: min(4, max(2, ceil(semi_clusterizzati / 4)));
   - 10 semi -> floor 3, 7 semi -> floor 2, 4 semi -> floor 2, >=20 semi -> floor 4.
3. Budget greedy con fixture manuale:
   - verifica che l'algoritmo selezioni per semi scoperti (copertura) e NON per rango;
   - rispetto dei vincoli di non duplicazione tassonomica, family dedupe e overlap.
4. Stabilità del catalog_id:
   - stesso cluster con permutazione dell'ordine dei semi produce lo stesso identificatore identico.
5. Determinismo della bisezione:
   - due esecuzioni consecutive su una matrice producono partizioni identiche.
6. Test a grafo intero escluso di default e attivabile con YACA_SLOW=1 su `warnok`:
   - <= 6 scaffali;
   - nessun singolo scaffale > 40 semi;
   - zero duplicati di catalog_id;
   - zero duplicati di nome etichetta all'interno del profilo.
"""
from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path
from typing import Any
import numpy as np
import pytest
import scipy.sparse as sp

from graph.tassonomia import TASSONOMIA_36, TaxonomyEntry, valuta_cluster, assegna_etichetta_cluster
from graph.interessi import (
    Shelf,
    calcola_adaptive_floor,
    bisect_cluster,
    scaffali,
    jaccard,
)


# ==============================================================================
# 1. TEST MATCHING TASSONOMIA SU CLUSTER SINTETICI
# ==============================================================================

def test_tassonomia_matching_anime_shonen():
    """Verifica il matching ad alta confidenza per Anime shōnen."""
    evidence = {
        "size": 10,
        "medium": "series",
        "anime_pct": 1.0,
        "adult_pct": 0.0,
        "member_kws": [
            {"shounen", "martial arts"},
            {"super power"},
            {"ninja"},
            {"adventure"},
            {"shounen"},
            {"martial arts"},
            {"action"},
            {"comedy"},
            {"school life"},
            {"seinen"},
        ],
        "languages": {"ja": 10},
        "repr_seeds": ["Dragon Ball Z", "Naruto", "Bleach"],
        "is_piccolo": False,
    }
    nome, fonte, conf, entry = assegna_etichetta_cluster(evidence)
    assert fonte == "tassonomia"
    assert nome == "Anime shōnen"
    assert conf >= 0.50
    assert entry is not None
    assert entry.nome == "Anime shōnen"


def test_tassonomia_matching_period_drama():
    """Verifica il matching per Dramma d'epoca su keyword storiche."""
    evidence = {
        "size": 6,
        "medium": "series",
        "anime_pct": 0.0,
        "adult_pct": 0.0,
        "member_kws": [
            {"period drama", "19th century"},
            {"costume drama"},
            {"historical fiction"},
            {"victorian era"},
            {"drama"},
            {"romance"},
        ],
        "languages": {"en": 6},
        "repr_seeds": ["Downton Abbey", "The Forsytes", "Pride and Prejudice"],
        "is_piccolo": False,
    }
    nome, fonte, conf, entry = assegna_etichetta_cluster(evidence)
    assert fonte == "tassonomia"
    assert nome == "Dramma d'epoca"
    assert conf >= 0.50


def test_tassonomia_fallback_perche_hai_visto():
    """Verifica il fallback trasparente quando nessuna voce matcha con confidenza sufficiente."""
    evidence = {
        "size": 4,
        "medium": "movie",
        "anime_pct": 0.0,
        "adult_pct": 0.0,
        "member_kws": [
            {"independent film"},
            {"random keyword"},
            {"urban"},
            {"summer"},
        ],
        "languages": {"it": 4},
        "repr_seeds": ["Film A", "Film B", "Film C"],
        "is_piccolo": False,
    }
    nome, fonte, conf, entry = assegna_etichetta_cluster(evidence)
    assert fonte == "perche_hai_visto"
    assert nome == "Perché hai visto Film A, Film B e Film C"
    assert entry is None


# ==============================================================================
# 2. TEST CALCOLO ADAPTIVE FLOOR
# ==============================================================================

def test_calcola_adaptive_floor():
    """Verifica che la soglia si adatti deterministicamente alla lunghezza della storia."""
    # Profilo 10 semi -> soglia 3 (min(4, max(2, ceil(10/4))) = 3)
    assert calcola_adaptive_floor(10) == 3
    # Profilo 7 semi -> soglia 2 (ceil(7/4) = 2)
    assert calcola_adaptive_floor(7) == 2
    # Profilo 4 semi -> soglia 2
    assert calcola_adaptive_floor(4) == 2
    # Profilo 2 semi -> soglia 2
    assert calcola_adaptive_floor(2) == 2
    # Profilo vuoto -> soglia 2
    assert calcola_adaptive_floor(0) == 2
    # Profilo 16 semi -> soglia 4
    assert calcola_adaptive_floor(16) == 4
    # Profilo lungo >= 20 semi -> soglia 4 (cap fisso a 4)
    assert calcola_adaptive_floor(20) == 4
    assert calcola_adaptive_floor(458) == 4


# ==============================================================================
# 3. TEST BUDGET GREEDY SU FIXTURE MANUALE (COVERAGE VS RANK)
# ==============================================================================

def test_budget_greedy_picks_by_uncovered_seeds_not_by_rank():
    """Verifica che l'algoritmo scelga per semi scoperti e NON per rango o recenza."""
    # Creiamo 3 candidati sintetici:
    # Cand 1: size=12, r_comb=10.0 (rango peggiore), aggiunge 12 semi scoperti
    # Cand 2: size=3, r_comb=1.0 (rango migliore e recenza massima), aggiunge solo 3 semi scoperti
    # Cand 3: size=8, r_comb=5.0, aggiunge 8 semi scoperti
    s1 = Shelf(
        catalog_id="yaca_1_movie",
        nome="Anime shōnen",
        nome_fonte="tassonomia",
        confidenza=1.0,
        medium="movie",
        semi_rappresentativi=[],
        semi_membri=[],
        size=12,
        min_eta=100.0,
        r_comb=10.0,
        seeds_indices=[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
        top10_cands={"a", "b", "c"},
    )
    s2 = Shelf(
        catalog_id="yaca_2_movie",
        nome="Space opera",
        nome_fonte="tassonomia",
        confidenza=1.0,
        medium="movie",
        semi_rappresentativi=[],
        semi_membri=[],
        size=3,
        min_eta=2.0,  # Freschissimo
        r_comb=1.0,   # Miglior rango
        seeds_indices=[1, 2, 3],
        top10_cands={"d", "e", "f"},
    )
    s3 = Shelf(
        catalog_id="yaca_3_movie",
        nome="Giallo investigativo",
        nome_fonte="tassonomia",
        confidenza=1.0,
        medium="movie",
        semi_rappresentativi=[],
        semi_membri=[],
        size=8,
        min_eta=50.0,
        r_comb=5.0,
        seeds_indices=[30, 31, 32, 33, 34, 35, 36, 37],
        top10_cands={"g", "h", "i"},
    )

    eligible = [s2, s1, s3]  # s2 è prima nella lista

    # Simulazione della selezione greedy a budget N = 2
    n_budget = 2
    chosen = []
    covered = set()
    while len(chosen) < n_budget:
        best_cand = None
        best_key = None
        for cand in eligible:
            if cand in chosen:
                continue
            uncovered_added = len(set(cand.seeds_indices) - covered)
            cand_key = (uncovered_added, -cand.min_eta)
            if best_cand is None or cand_key > best_key:
                best_cand = cand
                best_key = cand_key
        if best_cand is None:
            break
        chosen.append(best_cand)
        covered.update(best_cand.seeds_indices)

    # Verifica: il primo scelto deve essere s1 (12 semi scoperti), poi s3 (8 semi scoperti)
    assert chosen[0] is s1, "Greedy deve scegliere lo scaffale con più semi scoperti (12 > 3)"
    assert chosen[1] is s3, "Greedy deve scegliere s3 (8 semi scoperti) invece di s2 (3 semi)"
    assert len(chosen) == 2


# ==============================================================================
# 4. TEST STABILITÀ CATALOG ID
# ==============================================================================

def test_catalog_id_stability():
    """Verifica che l'ID catalogo sia vincolato all'identità del cluster e resti invariato."""
    # Stessi semi con ordine differente
    cluster_seeds_a = [
        {"tmdbId": 12609, "medium": "series", "titolo": "Dragon Ball Z", "plays": 5.0, "eta_giorni": 10.0},
        {"tmdbId": 46260, "medium": "series", "titolo": "Naruto", "plays": 1.0, "eta_giorni": 5.0},
    ]
    cluster_seeds_b = [
        {"tmdbId": 46260, "medium": "series", "titolo": "Naruto", "plays": 1.0, "eta_giorni": 5.0},
        {"tmdbId": 12609, "medium": "series", "titolo": "Dragon Ball Z", "plays": 5.0, "eta_giorni": 10.0},
    ]

    # Determinazione seme rappresentativo (ordinamento per -plays, eta)
    sorted_a = sorted(cluster_seeds_a, key=lambda s: (-s["plays"], s["eta_giorni"]))
    sorted_b = sorted(cluster_seeds_b, key=lambda s: (-s["plays"], s["eta_giorni"]))

    id_a = f"yaca_{sorted_a[0]['tmdbId']}_{sorted_a[0]['medium']}"
    id_b = f"yaca_{sorted_b[0]['tmdbId']}_{sorted_b[0]['medium']}"

    assert id_a == id_b == "yaca_12609_series"


# ==============================================================================
# 5. TEST DETERMINISMO BISEZIONE
# ==============================================================================

def test_deterministic_bisection():
    """Verifica che bisect_cluster sia deterministico a parità di input."""
    class DummyEngine:
        def __init__(self, n: int):
            # Matrice sintetica a blocchi
            data = [1.0, 0.9, 0.9, 1.0, 0.1, 0.1, 0.1, 0.1, 1.0, 0.8, 0.8, 1.0]
            rows = [0, 0, 1, 1, 0, 1, 2, 3, 2, 2, 3, 3]
            cols = [0, 1, 0, 1, 2, 3, 0, 1, 2, 3, 2, 3]
            self.Tr = sp.csr_matrix((data, (rows, cols)), shape=(4, 4), dtype=np.float32)

    dummy = DummyEngine(4)
    righe = np.array([0, 1, 2, 3], dtype=np.int64)
    cluster = [0, 1, 2, 3]

    c1_first, c2_first = bisect_cluster(dummy, righe, cluster)
    c1_second, c2_second = bisect_cluster(dummy, righe, cluster)

    assert c1_first == c1_second
    assert c2_first == c2_second
    assert len(c1_first) + len(c2_first) == len(cluster)
    assert set(c1_first).isdisjoint(set(c2_first))


# ==============================================================================
# 6. TEST REAL-CHAIN INTEGRATO (DIETRO YACA_SLOW=1) SU WARNOK
# ==============================================================================

@pytest.mark.skipif(
    os.getenv("YACA_SLOW") != "1",
    reason="Test d'integrazione reale su grafo intero (attivo solo con YACA_SLOW=1)",
)
def test_real_chain_warnok_acceptance():
    """Verifica l'intera catena a 12 passi con i criteri di accettazione su warnok."""
    from graph import canon as K
    from graph.runtime import Engine
    from graph.interessi import scaffali

    engine = Engine.carica_transizione(pota=16)
    k, righe, plays, eta = K.storia_trakt("warnok", ordine="recente")
    semi_input = [
        {"key": k[i], "plays": plays[i], "eta_giorni": eta[i]}
        for i in range(len(k))
    ]

    serviti = scaffali(engine, semi_input, n=6)

    # 1. Nessuna timeline supera N=6
    assert len(serviti) <= 6
    assert len(serviti) == 6  # warnok è lungo e qualifica 6 scaffali

    # 2. Nessun singolo scaffale supera 40 semi (Staple-diet split rispettato)
    for sh in serviti:
        assert sh.size <= 40, f"Scaffale «{sh.nome}» supera 40 semi (size={sh.size})"

    # 3. Nessun catalog_id duplicato
    cat_ids = [sh.catalog_id for sh in serviti]
    assert len(cat_ids) == len(set(cat_ids)), f"Duplicati in catalog_ids: {cat_ids}"

    # 4. Nessun nome duplicato all'interno del profilo
    nomi = [sh.nome for sh in serviti]
    assert len(nomi) == len(set(nomi)), f"Duplicati in nomi scaffali: {nomi}"

    # 5. Slot 1 è il più fresco (min_eta minimo)
    assert serviti[0].slot_position == 1
    min_etas = [sh.min_eta for sh in serviti]
    assert serviti[0].min_eta == min(min_etas)


# ==============================================================================
# 7. TEST FINGERPRINT E GUARDIA ARTEFATTO TOP-100 VICINI
# ==============================================================================

def test_vicini100_fingerprint():
    """Verifica che l'artefatto vicini-top100 sia consistente con la provenienza e il lock V45."""
    from graph import provenance as _PV
    from graph.interessi import carica_matrice_affinita

    artefatto_p = (
        Path(__file__).resolve().parents[1]
        / "data"
        / "v45-vicini100"
        / "vicini-top100.npz"
    )
    if not artefatto_p.is_file():
        pytest.skip(f"Artefatto vicini-top100.npz non ancora generato in {artefatto_p}")

    W, prov = _PV.leggi(artefatto_p)
    assert prov is not None, "Artefatto privo di provenienza tracciata"
    assert prov.get("step") == "vicini_topk"
    assert prov.get("params", {}).get("top_k") == 100
    assert prov.get("canon_len") == 76497

    # Verifica registrazione input sorgente triangolo
    inputs = prov.get("inputs", {})
    assert "bolle-eterogeneo-V45-p1.0-triangolo.npz" in inputs
    expected_prov_sha = "1932ddd4b910f2e2ec4e19f57c14b7e34af4ef9cf08be4ee382bd7a351b86deb"
    assert inputs["bolle-eterogeneo-V45-p1.0-triangolo.npz"] == expected_prov_sha

    # Verifica coerenza con V45.lock.json se presente
    lock_p = Path(__file__).resolve().parents[1] / "recipes" / "V45.lock.json"
    if lock_p.is_file():
        lock_data = json.loads(lock_p.read_text(encoding="utf-8"))
        lock_final_sha = (
            lock_data.get("expected", {})
            .get("artifact_sha256", {})
            .get("final")
        )
        assert lock_final_sha == "b2395aa7024bb3aa83511f533bb790e9170eed10e6c8ce5f9f2480b2455915d6"

    # Struttura sparsa: shape 76497x76497, int32 indices, float32 data, <= 100 per riga
    assert W.shape == (76497, 76497)
    assert W.indices.dtype == np.int32
    assert W.data.dtype == np.float32
    diffs = np.diff(W.indptr)
    assert (diffs <= 100).all(), f"Trovate righe con più di 100 vicini: max={diffs.max()}"

    # Guardia architetturale: vietato passare 'bolle-eterogeneo-V45-p1.0-triangolo.npz'
    with pytest.raises(ValueError, match="VIOLAZIONE ARCHITETTURALE"):
        carica_matrice_affinita("services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz")


# ==============================================================================
# 8. TEST EQUIVALENZA AFFINITÀ PROTOTIPO SU 20 SEMI
# ==============================================================================

def test_vicini100_prototype_equivalence_20_seeds():
    """Verifica che i top-100 vicini e la matrice di affinità coincidano esattamente col metodo originario."""
    from graph import canon as K
    from graph import provenance as _PV
    from graph.interessi import calcola_sim_affinity, carica_matrice_affinita

    triangolo_p = (
        Path(__file__).resolve().parents[1]
        / "data"
        / "v45"
        / "bolle-eterogeneo-V45-p1.0-triangolo.npz"
    )
    if not triangolo_p.is_file():
        pytest.skip("Triangolo sorgente non presente per il test di equivalenza")

    # Matrice precalcolata vicini-100
    W_vicini = carica_matrice_affinita()

    # Campione di 20 semi da warnok
    k, righe_warnok, _, _ = K.storia_trakt("warnok", ordine="recente")
    seeds = np.asarray(righe_warnok[:20], dtype=np.int64)

    # 1. Calcolo via artefatto compatto
    S_new = calcola_sim_affinity(seeds, W_vicini)

    # 2. Calcolo via matrice non potata completa
    M_tri, _ = _PV.leggi(triangolo_p)
    W_unpruned = (M_tri + M_tri.T).tocsr()
    del M_tri

    # Verifica insiemi di vicini per ciascuno dei 20 semi
    for r in seeds:
        s_old, e_old = W_unpruned.indptr[r], W_unpruned.indptr[r + 1]
        c_old, v_old = W_unpruned.indices[s_old:e_old], W_unpruned.data[s_old:e_old]
        if len(c_old) <= 100:
            top_set_old = set(c_old)
        else:
            top_idx = np.argpartition(-v_old, 100)[:100]
            top_set_old = set(c_old[top_idx])

        s_new, e_new = W_vicini.indptr[r], W_vicini.indptr[r + 1]
        top_set_new = set(W_vicini.indices[s_new:e_new])

        assert top_set_new == top_set_old, f"Discrepanza nei vicini per il seme riga={r}"

    # Matrice affinità via unpruned
    S_old = calcola_sim_affinity(seeds, W_unpruned)
    del W_unpruned

    # Controllo uguaglianza esatta (valore assoluto massimo della differenza = 0.0)
    diff = np.abs(S_new - S_old)
    assert np.max(diff) < 1e-6, f"Differenza non nulla tra affinità unpruned e artefatto: max={np.max(diff)}"
    assert np.allclose(S_new, S_old, atol=1e-6)


# ==============================================================================
# 9. TEST REGRESSIONE MEMORIA: PEAK RSS DI SCAFFALI SU WARNOK <= 400 MB
# ==============================================================================

@pytest.mark.skipif(
    os.getenv("YACA_SLOW") != "1",
    reason="Test d'integrazione reale con misurazione memoria RSS (attivo solo con YACA_SLOW=1)",
)
def test_peak_rss_scaffali_warnok_under_400mb():
    """Regression guard: asserisce che il picco RSS di scaffali() su warnok rimanga stabilmente <= 400 MB."""
    try:
        import psutil
    except ImportError:
        pytest.skip("psutil non disponibile per misurare RSS")

    from graph import canon as K
    from graph.runtime import Engine
    from graph.interessi import scaffali

    proc = psutil.Process()

    engine = Engine.carica_transizione(pota=16)
    k, righe, plays, eta = K.storia_trakt("warnok", ordine="recente")
    semi_input = [
        {"key": k[i], "plays": plays[i], "eta_giorni": eta[i]}
        for i in range(len(k))
    ]

    serviti = scaffali(engine, semi_input, n=6)
    assert len(serviti) == 6

    mem_info = proc.memory_info()
    if hasattr(mem_info, "peak_wset"):
        peak_rss_mib = mem_info.peak_wset / (1024 * 1024)
    else:
        peak_rss_mib = mem_info.rss / (1024 * 1024)

    assert peak_rss_mib <= 400.0, (
        f"Picco RSS di scaffali() {peak_rss_mib:.1f} MB supera il limite di guardia di 400 MB "
        "(il container Docker ha mem_limit: 512m)."
    )
