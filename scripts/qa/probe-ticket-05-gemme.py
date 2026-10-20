"""probe-ticket-05-gemme.py — Sonda di verifica per il Ticket 05 (Gemme nascoste nel tuo mondo: nicchia relativa).

Verifiche:
1. Parametri in parametri.py:
   - NICCHIA_FATTORE_V_MONDO (0.35)
   - NICCHIA_TETTO_VOT_MAX (2500)
   - NICCHIA_PAVIMENTO_VOT_MIN (40)
   - NICCHIA_DELTA_VAVE_MU (0.4)
   - NICCHIA_VAVE_MIN_FILM (6.8)
   - NICCHIA_SERIE_OFFSET_VOTO (0.3)
   - NICCHIA_BONUS_LISTE (0.15)
   - NICCHIA_V_MONDO_FALLBACK (1000.0)
   - Nessun parametro morto (rimossi NICCHIA_POP_PERCENTILE e NICCHIA_VAVE_MIN_SERIE)
2. LA PROVA CHE CONTA PIU' DI TUTTE:
   Due profili OPPOSTI (Mainstream vs D'Essai) sugli stessi dati:
   - Ottengono soglie di notorietà radicalmente DIVERSE (tetto VOT).
   - Le due righe di gemme NON coincidono.
3. CONTEGGIO SOPRAVVISSUTI PER TAGLIO IN SEQUENZA:
   - Misura del passaggio sequenziale su 4 tagli (VOT>=40, VOT<=tetto, VAVE>=6.8, delta>=0.4) sia sul fixture che su profilo realistico.
4. DICHIARAZIONE RIGA CORTA (L'INVARIANTE DEL CANTIERE):
   - "Il pavimento non si abbassa per riempire" E "Ogni riga che non si riesce a riempire lo dichiara".
   - Flag `corta: True`, `totale_sopravvissuti`, `target_dimensione: 20` e log esplicito.
5. DICHIARAZIONE FALLBACK ASSOLUTO:
   - Fallback di calcola_v_mondo non silenzioso: log su stderr e flag `fallback_v_mondo`, `soglia_relativa: False`.
6. NEUTRALIZZAZIONE INFLAZIONE SERIE TV (+0.3 SU TUTTI E 3 I CONFRONTI):
   - Pavimento (VAVE-0.3 >= 6.8 -> VAVE >= 7.1)
   - Delta bolla ((VAVE-0.3)-mu_b >= 0.4 -> VAVE-mu_b >= 0.7)
   - Ranking (diff = (VAVE-0.3)-mu_b)
7. Filtri selettivi (blockbuster escluso, falso cult con 3 voti escluso, ecc.) e bonus liste.
8. Contratto di monotonicità (K.assert_monotonia_lista).
9. Servizio HTTP (/health 200, /raccomanda 200) e RAM (< 512 MB).
"""
import json
import os
import pathlib
import sys
import threading
import urllib.request
import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
ROOT = QUI.parents[1]
sys.path.insert(0, str(ROOT / "services"))

from graph import parametri as P
from graph import camminata as C
from graph import motore as MO
from graph import bubbles as B
from graph import canon as K
from graph import servizio as S


def test_parametri():
    print("=" * 80)
    print("1. VERIFICA IPERPARAMETRI TICKET 05 IN PARAMETRI.PY (ZERO PARAMETRI MORTI)")
    print("=" * 80)
    assert P.NICCHIA_FATTORE_V_MONDO == 0.35, f"Atteso 0.35, trovato {P.NICCHIA_FATTORE_V_MONDO}"
    assert P.NICCHIA_TETTO_VOT_MAX == 2500, f"Atteso 2500, trovato {P.NICCHIA_TETTO_VOT_MAX}"
    assert P.NICCHIA_PAVIMENTO_VOT_MIN == 40, f"Atteso 40, trovato {P.NICCHIA_PAVIMENTO_VOT_MIN}"
    assert P.NICCHIA_DELTA_VAVE_MU == 0.4, f"Atteso 0.4, trovato {P.NICCHIA_DELTA_VAVE_MU}"
    assert P.NICCHIA_VAVE_MIN_FILM == 6.8, f"Atteso 6.8, trovato {P.NICCHIA_VAVE_MIN_FILM}"
    assert P.NICCHIA_SERIE_OFFSET_VOTO == 0.3, f"Atteso 0.3, trovato {P.NICCHIA_SERIE_OFFSET_VOTO}"
    assert P.NICCHIA_BONUS_LISTE == 0.15, f"Atteso 0.15, trovato {P.NICCHIA_BONUS_LISTE}"
    assert P.NICCHIA_V_MONDO_FALLBACK == 1000.0, f"Atteso 1000.0, trovato {P.NICCHIA_V_MONDO_FALLBACK}"

    # Verifica assenza parametri morti o ridondanti
    assert not hasattr(P, "NICCHIA_POP_PERCENTILE"), "ERRORE: NICCHIA_POP_PERCENTILE doveva essere rimosso!"
    assert not hasattr(P, "NICCHIA_VAVE_MIN_SERIE"), "ERRORE: NICCHIA_VAVE_MIN_SERIE doveva essere rimosso (offset serie usato direttamente)!"

    print(f"  NICCHIA_FATTORE_V_MONDO    = {P.NICCHIA_FATTORE_V_MONDO}")
    print(f"  NICCHIA_TETTO_VOT_MAX      = {P.NICCHIA_TETTO_VOT_MAX}")
    print(f"  NICCHIA_PAVIMENTO_VOT_MIN  = {P.NICCHIA_PAVIMENTO_VOT_MIN}")
    print(f"  NICCHIA_DELTA_VAVE_MU      = {P.NICCHIA_DELTA_VAVE_MU}")
    print(f"  NICCHIA_VAVE_MIN_FILM      = {P.NICCHIA_VAVE_MIN_FILM}")
    print(f"  NICCHIA_SERIE_OFFSET_VOTO  = {P.NICCHIA_SERIE_OFFSET_VOTO}")
    print(f"  NICCHIA_BONUS_LISTE        = {P.NICCHIA_BONUS_LISTE}")
    print(f"  NICCHIA_V_MONDO_FALLBACK   = {P.NICCHIA_V_MONDO_FALLBACK}")
    print("  -> OK: Parametri attivi calibrati; zero parametri morti.\n")


def build_dual_world_graph(n_nodes=800, n_bolle=8):
    """Costruisce un grafo con due cluster:
    - Bolle pari (0, 2, 4, 6): Mainstream cluster (blockbuster ad alta notorietà: voti 3500-11000)
    - Bolle dispari (1, 3, 5, 7): D'Essai cluster (film d'autore a notorietà moderata/bassa: voti 80-500)
    """
    nodes_per_bolla = n_nodes // n_bolle
    rows, cols, data = [], [], []

    def add_edge(u, v, w):
        rows.append(u); cols.append(v); data.append(w)
        rows.append(v); cols.append(u); data.append(w)

    for b in range(n_bolle):
        start = b * nodes_per_bolla
        end = (b + 1) * nodes_per_bolla if b < n_bolle - 1 else n_nodes
        for i in range(start, end - 1):
            add_edge(i, i + 1, 2.0)
        for j in range(start + 1, min(start + 25, end)):
            add_edge(start, j, 4.0)

    # Archi cluster mainstream
    add_edge(0 * nodes_per_bolla, 2 * nodes_per_bolla, 3.0)
    add_edge(2 * nodes_per_bolla, 4 * nodes_per_bolla, 3.0)
    add_edge(4 * nodes_per_bolla, 6 * nodes_per_bolla, 3.0)
    add_edge(0 * nodes_per_bolla, 4 * nodes_per_bolla, 2.0)

    # Archi cluster d'essai
    add_edge(1 * nodes_per_bolla, 3 * nodes_per_bolla, 3.0)
    add_edge(3 * nodes_per_bolla, 5 * nodes_per_bolla, 3.0)
    add_edge(5 * nodes_per_bolla, 7 * nodes_per_bolla, 3.0)
    add_edge(1 * nodes_per_bolla, 5 * nodes_per_bolla, 2.0)

    # Ponte debole tra 6 e 7
    add_edge(6 * nodes_per_bolla, 7 * nodes_per_bolla, 0.05)

    W = sp.csr_matrix((data, (rows, cols)), shape=(n_nodes, n_nodes))
    deg = np.asarray(W.sum(1)).ravel()
    deg[deg <= 0] = 1.0
    Tr = sp.diags(1.0 / deg) @ W

    m = object.__new__(MO.Motore)
    m.N = n_nodes
    m.NB = n_bolle
    m.Tr = Tr
    mem = []
    for b in range(n_bolle):
        count = nodes_per_bolla if b < n_bolle - 1 else (n_nodes - b * nodes_per_bolla)
        mem.extend([b] * count)
    m.MEM = np.array(mem, dtype=np.int32)
    m.SZ = np.bincount(m.MEM)
    m.MEMBRI = [np.where(m.MEM == b)[0].astype(np.int32) for b in range(n_bolle)]
    
    m.VICINI = [
        np.array([2, 4, 6], dtype=np.int32),
        np.array([3, 5, 7], dtype=np.int32),
        np.array([0, 4, 6], dtype=np.int32),
        np.array([1, 5, 7], dtype=np.int32),
        np.array([0, 2, 6], dtype=np.int32),
        np.array([1, 3, 7], dtype=np.int32),
        np.array([4, 2, 0], dtype=np.int32),
        np.array([5, 3, 1], dtype=np.int32),
    ]

    m.VAVE = np.full(n_nodes, 7.0, dtype=np.float32)
    m.VOT = np.full(n_nodes, 500.0, dtype=np.float32)
    m.POP = np.full(n_nodes, 25.0, dtype=np.float32)

    for b in [0, 2, 4, 6]:
        b_nodes = m.MEMBRI[b]
        m.VOT[b_nodes] = np.linspace(3500.0, 11000.0, len(b_nodes), dtype=np.float32)
        m.POP[b_nodes] = np.linspace(45.0, 140.0, len(b_nodes), dtype=np.float32)
        m.VAVE[b_nodes] = 7.2

    for b in [1, 3, 5, 7]:
        b_nodes = m.MEMBRI[b]
        m.VOT[b_nodes] = np.linspace(80.0, 500.0, len(b_nodes), dtype=np.float32)
        m.POP[b_nodes] = np.linspace(2.0, 20.0, len(b_nodes), dtype=np.float32)
        m.VAVE[b_nodes] = 7.1

    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(n_bolle)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(n_bolle)], dtype=np.float32)

    m.ANNO = np.full(n_nodes, 2021, dtype=np.int32)
    m.NEP = np.full(n_nodes, 1.0, dtype=np.float32)
    m.COZY = np.zeros(n_nodes, dtype=np.float32)
    m.IMP = np.zeros(n_nodes, dtype=np.float32)
    m.QUOTA_TV = np.zeros(n_bolle, dtype=np.float32)
    m.QUOTA_COZY = np.zeros(n_bolle, dtype=np.float32)
    m.QUOTA_IMP = np.zeros(n_bolle, dtype=np.float32)
    m.LISTDEG = np.zeros(n_nodes, dtype=np.float32)
    m.TIT = np.array([f"Film_{i}" for i in range(n_nodes)])
    m.COLL = None
    m.DIR = None
    m.REGISTA = None
    m.artefatto = "mock-artefatto-ticket-05"

    keys_mock = [f"movie:{1000+i}" for i in range(n_nodes)]
    B.KEYS = keys_mock
    B.ROW_OF = {k: i for i, k in enumerate(keys_mock)}
    B.IS_TV = np.zeros(n_nodes, dtype=bool)

    return m


def test_due_profili_opposti():
    print("=" * 80)
    print("2. LA PROVA CHE CONTA PIU' DI TUTTE: DUE PROFILI OPPOSTI SUI STESSI DATI")
    print("=" * 80)
    m = build_dual_world_graph()

    # Creiamo candidate gemme specifiche:
    # In Bolla 0 (Mainstream): film con VOT = 1800 (< tetto 2500 per mainstream), VAVE = 7.9 (mu_b = 7.2 -> delta = +0.7)
    gemma_main_idx = m.MEMBRI[0][10]
    m.VOT[gemma_main_idx] = 1800.0
    m.VAVE[gemma_main_idx] = 7.9

    # In Bolla 1 (D'Essai): film con VOT = 85 (adatto per d'essai!), VAVE = 7.8 (mu_b = 7.1 -> delta = +0.7)
    gemma_essai_idx = m.MEMBRI[1][10]
    m.VOT[gemma_essai_idx] = 85.0
    m.VAVE[gemma_essai_idx] = 7.8

    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(m.NB)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(m.NB)], dtype=np.float32)

    # Profilo 1: MAINSTREAM
    storia_main = [("movie:1000", 1, "watched", None)]
    res_main = m.lista(storia_main, cap=20, medium="movie")
    nic_main = next(l for l in res_main["liste"] if l["tipo"] == "nicchia_di_qualita")
    titoli_main = [t[0] for t in nic_main["titoli"]]

    # Profilo 2: D'ESSAI
    storia_essai = [(f"movie:{1000 + m.MEMBRI[1][0]}", 1, "watched", None)]
    res_essai = m.lista(storia_essai, cap=20, medium="movie")
    nic_essai = next(l for l in res_essai["liste"] if l["tipo"] == "nicchia_di_qualita")
    titoli_essai = [t[0] for t in nic_essai["titoli"]]

    # Calcolo esplicito delle soglie di notorietà
    att_main, _ = m.diffondi(np.array([0]), np.array([1.0]))
    att_s_main = m.modula(att_main, MO.SLIDER_DEFAULT, m.deduci(np.array([0])))
    v_mondo_main, fb_main = m.calcola_v_mondo({0, 2, 4, 6}, att_s_main, con_stato=True)
    tetto_vot_main = max(P.NICCHIA_PAVIMENTO_VOT_MIN, min(P.NICCHIA_FATTORE_V_MONDO * v_mondo_main, P.NICCHIA_TETTO_VOT_MAX))

    att_essai, _ = m.diffondi(np.array([m.MEMBRI[1][0]]), np.array([1.0]))
    att_s_essai = m.modula(att_essai, MO.SLIDER_DEFAULT, m.deduci(np.array([m.MEMBRI[1][0]])))
    v_mondo_essai, fb_essai = m.calcola_v_mondo({1, 3, 5, 7}, att_s_essai, con_stato=True)
    tetto_vot_essai = max(P.NICCHIA_PAVIMENTO_VOT_MIN, min(P.NICCHIA_FATTORE_V_MONDO * v_mondo_essai, P.NICCHIA_TETTO_VOT_MAX))

    print(f"CONFRONTO SOGLIE DI NOTORIETÀ:")
    print(f"  {'Parametro':<32} {'Profilo Mainstream':<22} {'Profilo D\'Essai':<22}")
    print(f"  {'-'*76}")
    print(f"  {'V_mondo (mediana pesata bacino)':<32} {v_mondo_main:<22.1f} {v_mondo_essai:<22.1f}")
    print(f"  {'Tetto voti min(0.35*V, 2500)':<32} {tetto_vot_main:<22.1f} {tetto_vot_essai:<22.1f}")
    print(f"  {'Pavimento assoluto VOT':<32} {P.NICCHIA_PAVIMENTO_VOT_MIN:<22} {P.NICCHIA_PAVIMENTO_VOT_MIN:<22}")
    print(f"  {'Titoli in nicchia':<32} {len(titoli_main):<22} {len(titoli_essai):<22}")
    print(f"  {'Stato riga dichiarata':<32} {'CORTA' if nic_main.get('corta') else 'PIENA':<22} {'CORTA' if nic_essai.get('corta') else 'PIENA':<22}")
    print()

    print(f"CONFRONTO OUTPUT 'nicchia_di_qualita':")
    print(f"  Primi titoli Mainstream: {titoli_main}")
    print(f"  Primi titoli D'Essai:    {titoli_essai}")

    assert tetto_vot_main != tetto_vot_essai, "ERRORE: Le due soglie dei voti devono divergere!"
    assert tetto_vot_main > tetto_vot_essai, f"Mainstream ({tetto_vot_main}) deve avere tetto piu' alto di D'Essai ({tetto_vot_essai})"
    assert set(titoli_main) != set(titoli_essai), "ERRORE: Le due righe di nicchia non devono coincidere!"
    assert len(set(titoli_main).intersection(set(titoli_essai))) == 0, "Nessuna sovrapposizione attesa fra mondi disgiunti!"

    # Verifica dichiarazione riga corta
    assert nic_main.get("corta") is True, "La riga mainstream con 1 titolo su 20 deve dichiararsi CORTA!"
    assert nic_essai.get("corta") is True, "La riga d'essai con 1 titolo su 20 deve dichiararsi CORTA!"

    print("  -> OK: Le soglie divergono radicalmente, le righe NON coincidono e dichiarano la loro dimensione.\n")


def test_conteggio_sopravvissuti_per_taglio():
    print("=" * 80)
    print("3. CONTEGGIO SOPRAVVISSUTI PER TAGLIO IN SEQUENZA (FIXTURE E REALISTICO)")
    print("=" * 80)

    # A) Sul fixture originale
    m = build_dual_world_graph()
    gemma_main_idx = m.MEMBRI[0][10]
    m.VOT[gemma_main_idx] = 1800.0; m.VAVE[gemma_main_idx] = 7.9
    gemma_essai_idx = m.MEMBRI[1][10]
    m.VOT[gemma_essai_idx] = 85.0; m.VAVE[gemma_essai_idx] = 7.8
    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(m.NB)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(m.NB)], dtype=np.float32)

    def misura_sequenza(m_obj, semi_idx, bolle_cluster, label):
        att, _ = m_obj.diffondi(np.array([semi_idx]), np.array([1.0]))
        att_s = m_obj.modula(att, MO.SLIDER_DEFAULT, m_obj.deduci(np.array([semi_idx])))
        v_mondo = m_obj.calcola_v_mondo(set(bolle_cluster), att_s)
        tetto_voti = max(P.NICCHIA_PAVIMENTO_VOT_MIN, min(P.NICCHIA_FATTORE_V_MONDO * v_mondo, P.NICCHIA_TETTO_VOT_MAX))
        pavimento_voti = float(P.NICCHIA_PAVIMENTO_VOT_MIN)
        vave_min = float(P.NICCHIA_VAVE_MIN_FILM)
        delta_min = float(P.NICCHIA_DELTA_VAVE_MU)
        offset_serie = float(P.NICCHIA_SERIE_OFFSET_VOTO)

        cand_bacino = [x for b in bolle_cluster for x in m_obj.MEMBRI[b] if x != semi_idx]
        cand_arr = np.array(cand_bacino, dtype=np.int32)
        n0 = len(cand_arr)

        # Taglio 1: VOT >= 40
        m1 = m_obj.VOT[cand_arr] >= pavimento_voti
        s1 = cand_arr[m1]
        n1 = len(s1)

        # Taglio 2: VOT <= tetto_voti
        m2 = m_obj.VOT[s1] <= tetto_voti
        s2 = s1[m2]
        n2 = len(s2)

        # Taglio 3: VAVE_eff >= 6.8 (pavimento assoluto qualità)
        is_tv_s2 = B.IS_TV[s2]
        vave_eff_s2 = np.where(is_tv_s2, m_obj.VAVE[s2] - offset_serie, m_obj.VAVE[s2])
        m3 = vave_eff_s2 >= vave_min
        s3 = s2[m3]
        n3 = len(s3)

        # Taglio 4: (VAVE_eff - mu_b) >= 0.4 (delta relativo bolla)
        is_tv_s3 = B.IS_TV[s3]
        vave_eff_s3 = np.where(is_tv_s3, m_obj.VAVE[s3] - offset_serie, m_obj.VAVE[s3])
        mu_b_s3 = m_obj.VAVEMEAN[m_obj.MEM[s3]]
        m4 = (vave_eff_s3 - mu_b_s3) >= delta_min
        s4 = s3[m4]
        n4 = len(s4)

        return [n0, n1, n2, n3, n4]

    seq_main = misura_sequenza(m, 0, [0, 2, 4, 6], "Mainstream (Fixture)")
    seq_essai = misura_sequenza(m, m.MEMBRI[1][0], [1, 3, 5, 7], "D'Essai (Fixture)")

    print("A) MISURA SUL FIXTURE DUAL-WORLD (4 tagli sequenziali):")
    print(f"  {'Fase di taglio':<42} {'Mainstream':<16} {'D\'Essai':<16}")
    print(f"  {'-'*74}")
    print(f"  {'Bacino appiattito iniziale':<42} {seq_main[0]:<16} {seq_essai[0]:<16}")
    print(f"  {'1. Pavimento voti (VOT >= 40)':<42} {seq_main[1]:<16} {seq_essai[1]:<16}")
    print(f"  {'2. Tetto notorieta\' (VOT <= ceiling)':<42} {seq_main[2]:<16} {seq_essai[2]:<16}")
    print(f"  {'3. Pavimento qualita\' (VAVE_eff >= 6.8)':<42} {seq_main[3]:<16} {seq_essai[3]:<16}")
    print(f"  {'4. Delta su bolla (VAVE_eff - mu_b >= 0.4)':<42} {seq_main[4]:<16} {seq_essai[4]:<16}")
    print()

    # B) Su profilo e catalogo con distribuzione realistica
    # Creiamo un catalogo realistico di 400 titoli nel cluster con varianza naturale
    m_real = build_dual_world_graph()
    np.random.seed(42)
    b_real = [0, 2, 4, 6]
    all_real_nodes = [x for b in b_real for x in m_real.MEMBRI[b]]
    # VOT distribuito log-normalmente (da 30 a 6000)
    vots = np.random.lognormal(mean=6.2, sigma=1.0, size=len(all_real_nodes)).clip(25, 8000)
    m_real.VOT[all_real_nodes] = vots
    # VAVE distribuito normalmente attorno a 6.8 con std 0.7
    vaves = np.random.normal(loc=6.8, scale=0.7, size=len(all_real_nodes)).clip(4.5, 9.2)
    m_real.VAVE[all_real_nodes] = vaves

    m_real.VOTMED = np.array([K.mediana_voti(m_real.VOT[m_real.MEMBRI[b]]) for b in range(m_real.NB)], dtype=np.float32)
    m_real.VAVEMEAN = np.array([float(np.mean(m_real.VAVE[m_real.MEMBRI[b]])) for b in range(m_real.NB)], dtype=np.float32)

    seq_real = misura_sequenza(m_real, all_real_nodes[0], b_real, "Profilo Realistico")

    print("B) MISURA SU DISTRIBUZIONE REALISTICA (4 tagli sequenziali):")
    print(f"  {'Fase di taglio':<42} {'Sopravvissuti':<16} {'Perdita':<16}")
    print(f"  {'-'*74}")
    print(f"  {'Bacino appiattito iniziale':<42} {seq_real[0]:<16} {'-':<16}")
    print(f"  {'1. Pavimento voti (VOT >= 40)':<42} {seq_real[1]:<16} {f'-{seq_real[0]-seq_real[1]}':<16}")
    print(f"  {'2. Tetto notorieta\' (VOT <= ceiling)':<42} {seq_real[2]:<16} {f'-{seq_real[1]-seq_real[2]}':<16}")
    print(f"  {'3. Pavimento qualita\' (VAVE_eff >= 6.8)':<42} {seq_real[3]:<16} {f'-{seq_real[2]-seq_real[3]}':<16}")
    print(f"  {'4. Delta su bolla (VAVE_eff - mu_b >= 0.4)':<42} {seq_real[4]:<16} {f'-{seq_real[3]-seq_real[4]}':<16}")
    print()

    # Verifica riga su motore completo
    storia_real = [("movie:1000", 1, "watched", None)]
    res_real = m_real.lista(storia_real, cap=20, medium="movie")
    nic_real = next(l for l in res_real["liste"] if l["tipo"] == "nicchia_di_qualita")
    titoli_real_n = len(nic_real["titoli"])
    print(f"  Dimensione riga finale nicchia: {titoli_real_n} titoli (target: 20)")
    print(f"  Dichiarazione 'corta': {nic_real.get('corta')} (totale_sopravvissuti={nic_real.get('totale_sopravvissuti')})")

    assert nic_real.get("corta") == (titoli_real_n < 20), "Il flag corta deve corrispondere all'effettivo riempimento!"
    print("  -> OK: Misura sequenziale completata; il pavimento non si abbassa e la riga si dichiara corta.\n")


def test_dichiarazione_fallback_assoluto():
    print("=" * 80)
    print("4. VERIFICA DICHIARAZIONE FALLBACK ASSOLUTO (NON SILENZIOSO)")
    print("=" * 80)
    m = build_dual_world_graph()

    # Caso 1: bacino vuoto -> deve dichiarare fallback assoluto
    v_fb, is_fb = m.calcola_v_mondo(set(), np.zeros(m.NB), con_stato=True)
    assert is_fb is True, "Bacino vuoto deve restituire is_fallback=True!"
    assert v_fb == P.NICCHIA_V_MONDO_FALLBACK, f"Atteso fallback {P.NICCHIA_V_MONDO_FALLBACK}, ottenuto {v_fb}"
    print(f"  Bacino vuoto  -> V_mondo={v_fb}, fallback={is_fb} (dichiarato)")

    # Caso 2: bacino normale con pesi -> soglia relativa
    att_mock = np.zeros(m.NB)
    att_mock[0] = 1.0
    v_norm, is_fb_norm = m.calcola_v_mondo({0}, att_mock, con_stato=True)
    assert is_fb_norm is False, "Bacino valido non deve andare in fallback!"
    print(f"  Bacino valido -> V_mondo={v_norm:.1f}, fallback={is_fb_norm} (relativo)")

    # Caso 3: test integrazione con servizio.py su riga con fallback o corta
    gemma = m.MEMBRI[0][10]
    m.VOT[gemma] = 1200.0
    m.VAVE[gemma] = 7.8
    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(m.NB)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(m.NB)], dtype=np.float32)

    status, res_serv = S.esegui_richiesta({
        "semi": [{"tmdbId": 1000, "medium": "movie", "tipo": "watched"}],
        "medium": "movie",
        "cap": 10
    }, m)
    # Verifichiamo che esegui_richiesta traduca correttamente i metadati della nicchia
    nic_serv = next(l for l in res_serv["liste"] if l["ruolo"] == "nicchia_di_qualita")
    print(f"  Servizio contratto nicchia: desc='{nic_serv['descrizione']}', corta={nic_serv.get('corta')}")
    assert "riga corta" in nic_serv["descrizione"]
    assert nic_serv.get("corta") is True
    print("  -> OK: Il fallback assoluto non e' silenzioso, dichiara il proprio stato al chiamante.\n")


def test_neutralizzazione_serie_tv():
    print("=" * 80)
    print("5. VERIFICA OFFSET SERIE TV (+0.3) SU TUTTI I 3 CONFRONTI")
    print("=" * 80)
    m = build_dual_world_graph()
    b0 = m.MEMBRI[0]

    # Convertiamo 3 nodi in serie tv
    idx_s1, idx_s2, idx_s3 = b0[30], b0[31], b0[32]
    for idx in [idx_s1, idx_s2, idx_s3]:
        B.IS_TV[idx] = True
        B.KEYS[idx] = f"tv:{1000+idx}"
        B.ROW_OF[f"tv:{1000+idx}"] = idx
        m.VOT[idx] = 500.0

    # mu_b = 6.5
    m.VAVEMEAN[0] = 6.5

    # 1. Confronto FLOOR:
    # Serie S1: VAVE = 7.0. Se non ci fosse offset passerebbe (7.0 >= 6.8).
    # Con offset coerente, vave_eff = 7.0 - 0.3 = 6.7 < 6.8 -> SCARTATA!
    m.VAVE[idx_s1] = 7.0

    # 2. Confronto DELTA BOLLA:
    # Serie S2: VAVE = 7.15 (supera floor 7.15 - 0.3 = 6.85 >= 6.8).
    # Ma delta su mu_b=6.5: vave_eff - mu_b = 6.85 - 6.5 = +0.35 < 0.4 -> SCARTATA dal delta!
    # (Senza offset coerente sul delta, VAVE - mu_b sarebbe 7.15 - 6.5 = +0.65 >= 0.4 e passerebbe ingiustamente!)
    m.VAVE[idx_s2] = 7.15

    # 3. Serie S3: VAVE = 7.6 (vave_eff = 7.3, delta = +0.8 >= 0.4) -> PASSA!
    m.VAVE[idx_s3] = 7.6

    storia_tv = [(f"tv:{1000+b0[33]}", 1, "watched", None)]
    B.IS_TV[b0[33]] = True
    B.KEYS[b0[33]] = f"tv:{1000+b0[33]}"
    B.ROW_OF[f"tv:{1000+b0[33]}"] = b0[33]

    res_tv = m.lista(storia_tv, cap=10, medium="series")
    nic_tv = next(l for l in res_tv["liste"] if l["tipo"] == "nicchia_di_qualita")
    titoli_tv = [t[0] for t in nic_tv["titoli"]]
    punti_tv = {t[0]: t[1] for t in nic_tv["titoli"]}

    print(f"  - Serie S1 (VAVE=7.0, vave_eff=6.7 < 6.8 floor) : {'PRESENTE (ERRORE)' if f'tv:{1000+idx_s1}' in titoli_tv else 'ESCLUSA (Corretto: vave_eff < floor)'}")
    print(f"  - Serie S2 (VAVE=7.15, delta_eff=+0.35 < 0.4)    : {'PRESENTE (ERRORE)' if f'tv:{1000+idx_s2}' in titoli_tv else 'ESCLUSA (Corretto: delta_eff < 0.4)'}")
    print(f"  - Serie S3 (VAVE=7.6, vave_eff=7.3, delta=+0.8)  : {'PRESENTE (Corretto)' if f'tv:{1000+idx_s3}' in titoli_tv else 'ESCLUSA (ERRORE)'}")

    assert f"tv:{1000+idx_s1}" not in titoli_tv, "S1 doveva essere esclusa dal floor con offset!"
    assert f"tv:{1000+idx_s2}" not in titoli_tv, "S2 doveva essere esclusa dal delta bolla con offset!"
    assert f"tv:{1000+idx_s3}" in titoli_tv, "S3 doveva essere inclusa!"

    # 4. Confronto RANKING:
    # Verifichiamo che il punteggio di S3 usi (vave_eff - mu_b + 1.0) = (7.3 - 6.5 + 1.0) = 1.8
    # e NON (7.6 - 6.5 + 1.0) = 2.1
    score_s3 = punti_tv[f"tv:{1000+idx_s3}"]
    _, r_s3 = m.diffondi(np.array([b0[33]]), np.array([1.0]))
    att_val = r_s3[idx_s3]
    atteso_score = att_val * (7.3 - 6.5 + 1.0) * 1.0
    print(f"  - Punteggio ranking calcolato: {score_s3:.6f} vs atteso debiasato: {atteso_score:.6f}")
    assert abs(score_s3 - atteso_score) < 1e-5, "Il ranking delle serie deve usare vave_eff!"

    print("  -> OK: Offset serie 0.3 applicato rigorosamente su floor, delta e ranking.\n")


def test_filtri_qualita_e_notorieta():
    print("=" * 80)
    print("6. VERIFICA FILTRI SELETTIVI (BLOCKBUSTER, FALSO CULT, MEDIOCRE)")
    print("=" * 80)
    m = build_dual_world_graph()
    b1 = m.MEMBRI[1]

    nodo_blockbuster = b1[1]
    m.VOT[nodo_blockbuster] = 8000.0; m.VAVE[nodo_blockbuster] = 8.5

    nodo_gemma = b1[2]
    m.VOT[nodo_gemma] = 75.0; m.VAVE[nodo_gemma] = 7.8

    nodo_falso_cult = b1[3]
    m.VOT[nodo_falso_cult] = 3.0; m.VAVE[nodo_falso_cult] = 9.0

    nodo_mediocre = b1[4]
    m.VOT[nodo_mediocre] = 80.0; m.VAVE[nodo_mediocre] = 6.6

    nodo_delta_basso = b1[5]
    m.VOT[nodo_delta_basso] = 80.0; m.VAVE[nodo_delta_basso] = 7.3

    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(m.NB)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(m.NB)], dtype=np.float32)

    storia = [(f"movie:{1000 + b1[0]}", 1, "watched", None)]
    res = m.lista(storia, cap=20, medium="movie")
    nic = next(l for l in res["liste"] if l["tipo"] == "nicchia_di_qualita")
    titoli_nic = [t[0] for t in nic["titoli"]]

    print(f"  - Blockbuster (VOT=8000 > tetto) : {'ESCLUSO (Corretto)' if f'movie:{1000+nodo_blockbuster}' not in titoli_nic else 'PRESENTE (ERRORE)'}")
    print(f"  - Gemma (VOT=75, VAVE=7.8)       : {'PRESENTE (Corretto)' if f'movie:{1000+nodo_gemma}' in titoli_nic else 'ESCLUSO (ERRORE)'}")
    print(f"  - Falso Cult (VOT=3 < 40)        : {'ESCLUSO (Corretto)' if f'movie:{1000+nodo_falso_cult}' not in titoli_nic else 'PRESENTE (ERRORE)'}")
    print(f"  - Mediocre (VAVE=6.6 < 6.8)      : {'ESCLUSO (Corretto)' if f'movie:{1000+nodo_mediocre}' not in titoli_nic else 'PRESENTE (ERRORE)'}")
    print(f"  - Delta Basso (delta=+0.2 < 0.4) : {'ESCLUSO (Corretto)' if f'movie:{1000+nodo_delta_basso}' not in titoli_nic else 'PRESENTE (ERRORE)'}")

    assert f"movie:{1000+nodo_blockbuster}" not in titoli_nic
    assert f"movie:{1000+nodo_gemma}" in titoli_nic
    assert f"movie:{1000+nodo_falso_cult}" not in titoli_nic
    assert f"movie:{1000+nodo_mediocre}" not in titoli_nic
    assert f"movie:{1000+nodo_delta_basso}" not in titoli_nic
    print("  -> OK: Tutti i filtri selettivi funzionano come da specifica.\n")


def test_ranking_e_bonus_liste():
    print("=" * 80)
    print("7. VERIFICA ORDINAMENTO r * (vave_eff - mu_b + 1.0) * (1 + 0.15 * (LISTDEG > 0))")
    print("=" * 80)
    m = build_dual_world_graph()
    b1 = m.MEMBRI[1]

    nodo_a = b1[15]
    m.VOT[nodo_a] = 70.0; m.VAVE[nodo_a] = 7.8; m.LISTDEG[nodo_a] = 0.0

    nodo_b = b1[16]
    m.VOT[nodo_b] = 70.0; m.VAVE[nodo_b] = 7.8; m.LISTDEG[nodo_b] = 5.0

    nodo_c = b1[17]
    m.VOT[nodo_c] = 70.0; m.VAVE[nodo_c] = 8.4; m.LISTDEG[nodo_c] = 0.0

    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(m.NB)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(m.NB)], dtype=np.float32)

    storia = [(f"movie:{1000 + b1[0]}", 1, "watched", None)]
    res = m.lista(storia, cap=20, medium="movie")
    nic = next(l for l in res["liste"] if l["tipo"] == "nicchia_di_qualita")
    punteggi = {t[0]: t[1] for t in nic["titoli"]}

    print(f"  Punteggi calcolati:")
    print(f"    - Titolo A (LISTDEG = 0)  : {punteggi.get(f'movie:{1000+nodo_a}', 'N/D')}")
    print(f"    - Titolo B (LISTDEG = 5)  : {punteggi.get(f'movie:{1000+nodo_b}', 'N/D')}")
    print(f"    - Titolo C (VAVE = 8.4)   : {punteggi.get(f'movie:{1000+nodo_c}', 'N/D')}")

    assert f"movie:{1000+nodo_b}" in punteggi and f"movie:{1000+nodo_a}" in punteggi
    ratio = punteggi[f"movie:{1000+nodo_b}"] / punteggi[f"movie:{1000+nodo_a}"]
    print(f"  Ratio Titolo B / Titolo A: {ratio:.4f} (atteso: ~1.15)")
    assert abs(ratio - 1.15) < 1e-3
    print("  -> OK: Ranking combinato e bonus liste matematicamente verificati.\n")


def test_contratto_monotonia():
    print("=" * 80)
    print("8. VERIFICA CONTRATTO DI MONOTONIA SU 'nicchia_di_qualita'")
    print("=" * 80)
    m = build_dual_world_graph()
    b0 = m.MEMBRI[0]
    for i in range(1, 15):
        m.VOT[b0[i]] = 1200.0
        m.VAVE[b0[i]] = 7.8 + 0.05 * (i % 4)
        if i % 3 == 0:
            m.LISTDEG[b0[i]] = 4.0

    storia = [("movie:1000", 1, "watched", None)]
    res = m.lista(storia, cap=20, medium="movie")
    nic = next(l for l in res["liste"] if l["tipo"] == "nicchia_di_qualita")

    assert len(nic["titoli"]) > 0
    K.assert_monotonia_lista(nic["titoli"], "lista nicchia_di_qualita")

    punti = [t[1] for t in nic["titoli"]]
    for i in range(len(punti) - 1):
        assert punti[i] >= punti[i + 1] - 1e-9

    print(f"  Titoli restituiti in nicchia: {len(nic['titoli'])}")
    print(f"  Punteggi decrescenti: {[round(p, 5) for p in punti[:5]]} ...")
    print("  -> OK: Monotonicita' verificata e integrata nel contratto.\n")


def test_servizio_http_e_memoria():
    print("=" * 80)
    print("9. SERVIZIO GRAFO HTTP (HEALTH 200, RACCOMANDA 200) E CONSUMO RAM")
    print("=" * 80)
    m = build_dual_world_graph()
    b0 = m.MEMBRI[0]
    for i in range(1, 10):
        m.VOT[b0[i]] = 1200.0
        m.VAVE[b0[i]] = 7.8 + 0.05 * (i % 4)

    port = 7899
    server, _ = S.crea_server(host="127.0.0.1", port=port, motore=m)
    t = threading.Thread(target=server.serve_forever)
    t.daemon = True
    t.start()

    try:
        # GET /health
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health") as r:
            health = json.loads(r.read())
            assert r.status == 200
            assert health["ok"] is True
            print(f"  GET /health      -> status {r.status}, ok: {health['ok']}, ricetta: {health['versioni']['ricetta']}")

        # POST /raccomanda
        req = {
            "semi": [{"tmdbId": 1000, "medium": "movie", "tipo": "watched"}],
            "medium": "movie",
            "opzioni": {"largo": 1},
            "cap": 10
        }
        req_bytes = json.dumps(req).encode("utf-8")
        http_req = urllib.request.Request(
            f"http://127.0.0.1:{port}/raccomanda",
            data=req_bytes,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(http_req) as r:
            post_resp = json.loads(r.read())
            assert r.status == 200
            nicchia = next(l for l in post_resp["liste"] if l["ruolo"] == "nicchia_di_qualita")
            print(f"  POST /raccomanda -> status {r.status}, ruolo: {nicchia['ruolo']}, titoli: {len(nicchia['titoli'])}")
            print(f"    Descrizione riga: '{nicchia['descrizione']}'")
            print(f"    Flag dichiarati: corta={nicchia.get('corta')}, target={nicchia.get('target_dimensione')}")
            print(f"    Primi 3 titoli: {nicchia['titoli'][:3]}")

        # Misura RAM del processo
        import psutil
        proc = psutil.Process()
        rss_mb = proc.memory_info().rss / (1024 * 1024)
        print(f"\n  Consumo RAM processo: {rss_mb:.1f} MB (Tetto massimo: 512 MB)")
        assert rss_mb < 512.0
        print("  -> OK: Consumo RAM ampiamente sotto il tetto dei 512 MB.")
    finally:
        server.shutdown()
        server.server_close()
        print("  Server HTTP arrestato correttamente.")
    print()




def test_intervallo_vuoto_v_mondo_100():
    print("=" * 80)
    print("X. CASO V_MONDO = 100: INTERVALLO [40, ceiling] NON VUOTO")
    print("=" * 80)
    m = build_dual_world_graph()
    # Forza V_mondo = 100 sul bacino acceso (bolla 0)
    m.VOTMED[0] = 100.0
    att_mock = np.zeros(m.NB)
    att_mock[0] = 1.0
    v_mondo, is_fb = m.calcola_v_mondo({0}, att_mock, con_stato=True)
    print(f"  V_mondo forzato = {v_mondo:.1f} (fallback={is_fb})")
    tetto = max(P.NICCHIA_PAVIMENTO_VOT_MIN, min(P.NICCHIA_FATTORE_V_MONDO * v_mondo, P.NICCHIA_TETTO_VOT_MAX))
    pav = float(P.NICCHIA_PAVIMENTO_VOT_MIN)
    print(f"  Pavimento assoluto = {pav:.0f}; Tetto = max({pav:.0f}, min(0.35*{v_mondo:.0f}, 2500)) = {tetto:.1f}")
    assert tetto >= pav, "Il tetto deve essere >= pavimento (intervallo non vuoto)"
    print(f"  Intervallo [40, {tetto:.1f}] non vuoto: {tetto >= pav}")

    # Prepara un titolo con VOT=40 (sulla soglia) in bolla 0 con qualita' sufficiente
    gemma_idx = m.MEMBRI[0][5]
    m.VOT[gemma_idx] = 40.0
    m.VAVE[gemma_idx] = 8.0
    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(m.NB)], dtype=np.float32)
    m.VOTMED[0] = 100.0
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(m.NB)], dtype=np.float32)

    semi_idx = m.MEMBRI[0][0]
    storia = [(f"movie:{1000+semi_idx}", 1, "watched", None)]
    res = m.lista(storia, cap=20, medium="movie")
    nic = next(l for l in res["liste"] if l["tipo"] == "nicchia_di_qualita")
    titoli = [t[0] for t in nic["titoli"]]
    print(f"  Titoli sopravvissuti in nicchia: {len(titoli)}")
    assert len(titoli) >= 1, "Almeno un titolo deve sopravvivere con V_mondo=100"



if __name__ == "__main__":
    test_parametri()
    test_due_profili_opposti()
    test_conteggio_sopravvissuti_per_taglio()
    test_dichiarazione_fallback_assoluto()
    test_neutralizzazione_serie_tv()
    test_filtri_qualita_e_notorieta()
    test_ranking_e_bonus_liste()
    test_contratto_monotonia()
    test_intervallo_vuoto_v_mondo_100()
    test_servizio_http_e_memoria()
    print("=" * 80)
    print("TUTTE LE VERIFICHE TICKET 05 SUPERATE CON SUCCESSO (TASK_OK)")
    print("=" * 80)
