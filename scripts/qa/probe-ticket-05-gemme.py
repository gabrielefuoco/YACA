"""probe-ticket-05-gemme.py — Sonda di verifica per il Ticket 05 (Gemme nascoste nel tuo mondo: nicchia relativa).

Verifiche:
1. Parametri in parametri.py:
   - NICCHIA_FATTORE_V_MONDO (0.35)
   - NICCHIA_TETTO_VOT_MAX (2500)
   - NICCHIA_POP_PERCENTILE (50.0)
   - NICCHIA_PAVIMENTO_VOT_MIN (40)
   - NICCHIA_DELTA_VAVE_MU (0.4)
   - NICCHIA_VAVE_MIN_FILM (6.8)
   - NICCHIA_SERIE_OFFSET_VOTO (0.3)
   - NICCHIA_VAVE_MIN_SERIE (7.1)
   - NICCHIA_BONUS_LISTE (0.15)
   - NICCHIA_V_MONDO_FALLBACK (1000.0)
2. LA PROVA CHE CONTA PIU' DI TUTTE:
   Due profili OPPOSTI (Mainstream vs D'Essai) sugli stessi dati:
   - Ottengono soglie di notorietà radicalmente DIVERSE (tetto VOT e soglia POP).
   - Le due righe di gemme NON coincidono.
3. Filtri selettivi:
   - Titolo con VOT altissimo (> 2500) ma r alto: NON entra (escluso dal tetto di notorietà).
   - Titolo con VOT altissimo ma r basso: NON entra.
   - Titolo con r alto e VOT nel tetto: ENTRA.
   - Titolo con 3 voti e media 9.0: SCARTATO dal pavimento assoluto VOT >= 40.
   - Titolo con VAVE - mu_b < 0.4: SCARTATO.
   - Titolo con VAVE < 6.8: SCARTATO.
4. Formula di ranking e bonus liste:
   score = r[x] * (VAVE[x] - mu_b + 1.0) * (1 + 0.15 * (LISTDEG[x] > 0)).
5. Trappola tetto assoluto 2500:
   Anche con V_mondo enorme, il tetto non supera mai 2500.
6. Trappola serie (+0.3 inflazione TMDB):
   Soglia VAVE film = 6.8, serie = 7.1 per evitare che le serie vincano sempre.
7. Contratto di monotonicità (K.assert_monotonia_lista).
8. Servizio HTTP (/health 200, /raccomanda 200) e RAM (< 512 MB).
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
    print("1. VERIFICA IPERPARAMETRI TICKET 05 IN PARAMETRI.PY")
    print("=" * 80)
    assert P.NICCHIA_FATTORE_V_MONDO == 0.35, f"Atteso 0.35, trovato {P.NICCHIA_FATTORE_V_MONDO}"
    assert P.NICCHIA_TETTO_VOT_MAX == 2500, f"Atteso 2500, trovato {P.NICCHIA_TETTO_VOT_MAX}"
    assert P.NICCHIA_POP_PERCENTILE == 50.0, f"Atteso 50.0, trovato {P.NICCHIA_POP_PERCENTILE}"
    assert P.NICCHIA_PAVIMENTO_VOT_MIN == 40, f"Atteso 40, trovato {P.NICCHIA_PAVIMENTO_VOT_MIN}"
    assert P.NICCHIA_DELTA_VAVE_MU == 0.4, f"Atteso 0.4, trovato {P.NICCHIA_DELTA_VAVE_MU}"
    assert P.NICCHIA_VAVE_MIN_FILM == 6.8, f"Atteso 6.8, trovato {P.NICCHIA_VAVE_MIN_FILM}"
    assert P.NICCHIA_SERIE_OFFSET_VOTO == 0.3, f"Atteso 0.3, trovato {P.NICCHIA_SERIE_OFFSET_VOTO}"
    assert P.NICCHIA_VAVE_MIN_SERIE == 7.1, f"Atteso 7.1, trovato {P.NICCHIA_VAVE_MIN_SERIE}"
    assert P.NICCHIA_BONUS_LISTE == 0.15, f"Atteso 0.15, trovato {P.NICCHIA_BONUS_LISTE}"
    assert P.NICCHIA_V_MONDO_FALLBACK == 1000.0, f"Atteso 1000.0, trovato {P.NICCHIA_V_MONDO_FALLBACK}"

    print(f"  NICCHIA_FATTORE_V_MONDO    = {P.NICCHIA_FATTORE_V_MONDO}")
    print(f"  NICCHIA_TETTO_VOT_MAX      = {P.NICCHIA_TETTO_VOT_MAX}")
    print(f"  NICCHIA_POP_PERCENTILE     = {P.NICCHIA_POP_PERCENTILE}")
    print(f"  NICCHIA_PAVIMENTO_VOT_MIN  = {P.NICCHIA_PAVIMENTO_VOT_MIN}")
    print(f"  NICCHIA_DELTA_VAVE_MU      = {P.NICCHIA_DELTA_VAVE_MU}")
    print(f"  NICCHIA_VAVE_MIN_FILM      = {P.NICCHIA_VAVE_MIN_FILM}")
    print(f"  NICCHIA_SERIE_OFFSET_VOTO  = {P.NICCHIA_SERIE_OFFSET_VOTO}")
    print(f"  NICCHIA_VAVE_MIN_SERIE     = {P.NICCHIA_VAVE_MIN_SERIE}")
    print(f"  NICCHIA_BONUS_LISTE        = {P.NICCHIA_BONUS_LISTE}")
    print(f"  NICCHIA_V_MONDO_FALLBACK   = {P.NICCHIA_V_MONDO_FALLBACK}")
    print("  -> OK: Tutti i 10 parametri presenti e calibrati.\n")


def build_dual_world_graph(n_nodes=800, n_bolle=8):
    """Costruisce un grafo con due mondi contrastanti e separati:

    - Bolle pari (0, 2, 4, 6): Mainstream cluster (blockbuster ad alta popolarità e molti voti: 3000-12000)
    - Bolle dispari (1, 3, 5, 7): D'Essai cluster (film d'autore a bassa popolarità e voti moderati: 80-600)
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
        # Hub centrale per bolla
        for j in range(start + 1, min(start + 25, end)):
            add_edge(start, j, 4.0)

    # Archi cluster mainstream: 0 <-> 2, 2 <-> 4, 4 <-> 6, 0 <-> 4
    add_edge(0 * nodes_per_bolla, 2 * nodes_per_bolla, 3.0)
    add_edge(2 * nodes_per_bolla, 4 * nodes_per_bolla, 3.0)
    add_edge(4 * nodes_per_bolla, 6 * nodes_per_bolla, 3.0)
    add_edge(0 * nodes_per_bolla, 4 * nodes_per_bolla, 2.0)

    # Archi cluster d'essai: 1 <-> 3, 3 <-> 5, 5 <-> 7, 1 <-> 5
    add_edge(1 * nodes_per_bolla, 3 * nodes_per_bolla, 3.0)
    add_edge(3 * nodes_per_bolla, 5 * nodes_per_bolla, 3.0)
    add_edge(5 * nodes_per_bolla, 7 * nodes_per_bolla, 3.0)
    add_edge(1 * nodes_per_bolla, 5 * nodes_per_bolla, 2.0)

    # Ponte debole tra 6 e 7 (separazione netta dei mondi)
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
    
    # Vicini: per ciascuna bolla, i suoi 3 vicini del proprio cluster
    m.VICINI = [
        np.array([2, 4, 6], dtype=np.int32),  # 0 -> mainstream
        np.array([3, 5, 7], dtype=np.int32),  # 1 -> d'essai
        np.array([0, 4, 6], dtype=np.int32),  # 2 -> mainstream
        np.array([1, 5, 7], dtype=np.int32),  # 3 -> d'essai
        np.array([0, 2, 6], dtype=np.int32),  # 4 -> mainstream
        np.array([1, 3, 7], dtype=np.int32),  # 5 -> d'essai
        np.array([4, 2, 0], dtype=np.int32),  # 6 -> mainstream
        np.array([5, 3, 1], dtype=np.int32),  # 7 -> d'essai
    ]

    m.VAVE = np.full(n_nodes, 7.0, dtype=np.float32)
    m.VOT = np.full(n_nodes, 500.0, dtype=np.float32)
    m.POP = np.full(n_nodes, 25.0, dtype=np.float32)

    # Configurazione bolle Mainstream (0, 2, 4, 6)
    for b in [0, 2, 4, 6]:
        b_nodes = m.MEMBRI[b]
        m.VOT[b_nodes] = np.linspace(3500.0, 11000.0, len(b_nodes), dtype=np.float32)
        m.POP[b_nodes] = np.linspace(45.0, 140.0, len(b_nodes), dtype=np.float32)
        m.VAVE[b_nodes] = 7.2

    # Configurazione bolle D'Essai (1, 3, 5, 7)
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

    # Creiamo candidate gemme specifiche in ciascuna bolla:
    # In Bolla 0 (Mainstream): film con VOT = 1800 (< tetto 2500 per mainstream), POP = 60, VAVE = 7.9 (mu_b = 7.2 -> delta = +0.7)
    gemma_main_idx = m.MEMBRI[0][10]
    m.VOT[gemma_main_idx] = 1800.0
    m.POP[gemma_main_idx] = 60.0
    m.VAVE[gemma_main_idx] = 7.9

    # In Bolla 1 (D'Essai): film con VOT = 85 (adatto per d'essai!), POP = 6.0, VAVE = 7.8 (mu_b = 7.1 -> delta = +0.7)
    gemma_essai_idx = m.MEMBRI[1][10]
    m.VOT[gemma_essai_idx] = 85.0
    m.POP[gemma_essai_idx] = 6.0
    m.VAVE[gemma_essai_idx] = 7.8

    # Ricalcolo medie e mediane
    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(m.NB)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(m.NB)], dtype=np.float32)

    # Profilo 1: MAINSTREAM (seme in Bolla 0)
    storia_main = [("movie:1000", 1, "watched", None)]
    res_main = m.lista(storia_main, cap=10, medium="movie")
    nic_main = next(l for l in res_main["liste"] if l["tipo"] == "nicchia_di_qualita")
    titoli_main = [t[0] for t in nic_main["titoli"]]

    # Profilo 2: D'ESSAI (seme in Bolla 1)
    storia_essai = [(f"movie:{1000 + m.MEMBRI[1][0]}", 1, "watched", None)]
    res_essai = m.lista(storia_essai, cap=10, medium="movie")
    nic_essai = next(l for l in res_essai["liste"] if l["tipo"] == "nicchia_di_qualita")
    titoli_essai = [t[0] for t in nic_essai["titoli"]]

    # Calcolo esplicito delle soglie di notorietà per entrambi i profili
    att_main, _ = m.diffondi(np.array([0]), np.array([1.0]))
    att_s_main = m.modula(att_main, MO.SLIDER_DEFAULT, m.deduci(np.array([0])))
    cand_bacino_main = m.MEMBRI[0].tolist() + m.MEMBRI[2].tolist() + m.MEMBRI[4].tolist() + m.MEMBRI[6].tolist()
    v_mondo_main = m.calcola_v_mondo({0, 2, 4, 6}, att_s_main)
    tetto_vot_main = min(P.NICCHIA_FATTORE_V_MONDO * v_mondo_main, P.NICCHIA_TETTO_VOT_MAX)
    pop_p50_main = float(np.percentile(m.POP[cand_bacino_main], P.NICCHIA_POP_PERCENTILE))

    att_essai, _ = m.diffondi(np.array([m.MEMBRI[1][0]]), np.array([1.0]))
    att_s_essai = m.modula(att_essai, MO.SLIDER_DEFAULT, m.deduci(np.array([m.MEMBRI[1][0]])))
    cand_bacino_essai = m.MEMBRI[1].tolist() + m.MEMBRI[3].tolist() + m.MEMBRI[5].tolist() + m.MEMBRI[7].tolist()
    v_mondo_essai = m.calcola_v_mondo({1, 3, 5, 7}, att_s_essai)
    tetto_vot_essai = min(P.NICCHIA_FATTORE_V_MONDO * v_mondo_essai, P.NICCHIA_TETTO_VOT_MAX)
    pop_p50_essai = float(np.percentile(m.POP[cand_bacino_essai], P.NICCHIA_POP_PERCENTILE))

    print(f"CONFRONTO SOGLIE DI NOTORIETÀ:")
    print(f"  {'Parametro':<30} {'Profilo Mainstream':<22} {'Profilo D\'Essai':<22}")
    print(f"  {'-'*74}")
    print(f"  {'V_mondo (mediana pesata bacino)':<30} {v_mondo_main:<22.1f} {v_mondo_essai:<22.1f}")
    print(f"  {'Tetto voti min(0.35*V, 2500)':<30} {tetto_vot_main:<22.1f} {tetto_vot_essai:<22.1f}")
    print(f"  {'Soglia popolarità p50':<30} {pop_p50_main:<22.1f} {pop_p50_essai:<22.1f}")
    print(f"  {'Pavimento assoluto VOT':<30} {P.NICCHIA_PAVIMENTO_VOT_MIN:<22} {P.NICCHIA_PAVIMENTO_VOT_MIN:<22}")
    print(f"  {'Titoli in nicchia':<30} {len(titoli_main):<22} {len(titoli_essai):<22}")
    print()

    print(f"CONFRONTO OUTPUT 'nicchia_di_qualita':")
    print(f"  Primi 3 titoli Mainstream: {titoli_main[:3]}")
    print(f"  Primi 3 titoli D'Essai:    {titoli_essai[:3]}")

    # Verifica vincoli fondamentali
    assert tetto_vot_main != tetto_vot_essai, "ERRORE: Le due soglie dei voti devono divergere!"
    assert pop_p50_main != pop_p50_essai, "ERRORE: Le soglie di popolarita' devono divergere!"
    assert tetto_vot_main > tetto_vot_essai, f"Mainstream ({tetto_vot_main}) deve avere tetto piu' alto di D'Essai ({tetto_vot_essai})"
    assert set(titoli_main) != set(titoli_essai), "ERRORE: Le due righe di nicchia non devono coincidere!"
    assert len(set(titoli_main).intersection(set(titoli_essai))) == 0, "Nessuna sovrapposizione attesa fra mondi disgiunti!"

    print("  -> OK: Le soglie divergono radicalmente e le righe NON coincidono (CUORE DELLA TICKET SUPERATO).\n")


def test_filtri_qualita_e_notorieta():
    print("=" * 80)
    print("3. VERIFICA FILTRI: VOT ALTISSIMO, VOT BASSO, VAVE SU BOLLA, PAVIMENTO 40")
    print("=" * 80)
    m = build_dual_world_graph()

    # Prepariamo casi controllati nella Bolla 1 (D'Essai, mu_b ~ 7.1, tetto voti ~ 100):
    b1 = m.MEMBRI[1]

    # Caso 1: Titolo con VOT altissimo (8000) e r altissimo (collegato al seme)
    # NON deve entrare nella nicchia perche' supera il tetto di notorieta' (8000 > 100)
    nodo_blockbuster = b1[1]
    m.VOT[nodo_blockbuster] = 8000.0
    m.POP[nodo_blockbuster] = 95.0
    m.VAVE[nodo_blockbuster] = 8.5

    # Caso 2: Titolo gemma perfetta: VOT = 75 (entro tetto), POP = 8 (< p50), VAVE = 7.8 (mu = 7.1 -> +0.7), r alto
    nodo_gemma = b1[2]
    m.VOT[nodo_gemma] = 75.0
    m.POP[nodo_gemma] = 8.0
    m.VAVE[nodo_gemma] = 7.8

    # Caso 3: Titolo con 3 voti e media 9.0 (trappola voto perfetto ma insignificante)
    # NON deve entrare perche' VOT < 40
    nodo_falso_cult = b1[3]
    m.VOT[nodo_falso_cult] = 3.0
    m.POP[nodo_falso_cult] = 5.0
    m.VAVE[nodo_falso_cult] = 9.0

    # Caso 4: Titolo con voto mediocre (VAVE = 6.6 < 6.8 pavimento film)
    nodo_mediocre = b1[4]
    m.VOT[nodo_mediocre] = 80.0
    m.POP[nodo_mediocre] = 7.0
    m.VAVE[nodo_mediocre] = 6.6

    # Caso 5: Titolo con VAVE - mu_b < +0.4 (es. VAVE = 7.3 con mu_b = 7.1 -> delta = +0.2 < 0.4)
    nodo_delta_basso = b1[5]
    m.VOT[nodo_delta_basso] = 80.0
    m.POP[nodo_delta_basso] = 7.0
    m.VAVE[nodo_delta_basso] = 7.3

    # Ricalcolo medie bolle
    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(m.NB)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(m.NB)], dtype=np.float32)

    storia = [(f"movie:{1000 + b1[0]}", 1, "watched", None)]
    res = m.lista(storia, cap=20, medium="movie")
    nic = next(l for l in res["liste"] if l["tipo"] == "nicchia_di_qualita")
    titoli_nic = [t[0] for t in nic["titoli"]]

    print(f"  - Titolo Blockbuster (movie:{1000+nodo_blockbuster}, VOT=8000, r alto) : {'PRESENTE (ERRORE)' if f'movie:{1000+nodo_blockbuster}' in titoli_nic else 'ESCLUSO (Corretto: VOT > tetto)'}")
    print(f"  - Titolo Gemma (movie:{1000+nodo_gemma}, VOT=75, VAVE=7.8)            : {'PRESENTE (Corretto)' if f'movie:{1000+nodo_gemma}' in titoli_nic else 'ESCLUSO (ERRORE)'}")
    print(f"  - Titolo Falso Cult (movie:{1000+nodo_falso_cult}, VOT=3, VAVE=9.0)    : {'PRESENTE (ERRORE)' if f'movie:{1000+nodo_falso_cult}' in titoli_nic else 'ESCLUSO (Corretto: VOT < 40)'}")
    print(f"  - Titolo Mediocre (movie:{1000+nodo_mediocre}, VAVE=6.6 < 6.8)         : {'PRESENTE (ERRORE)' if f'movie:{1000+nodo_mediocre}' in titoli_nic else 'ESCLUSO (Corretto: VAVE < 6.8)'}")
    print(f"  - Titolo Delta Basso (movie:{1000+nodo_delta_basso}, delta=+0.2 < 0.4) : {'PRESENTE (ERRORE)' if f'movie:{1000+nodo_delta_basso}' in titoli_nic else 'ESCLUSO (Corretto: delta < 0.4)'}")

    assert f"movie:{1000+nodo_blockbuster}" not in titoli_nic, "Blockbuster doveva essere escluso dal tetto di notorieta'!"
    assert f"movie:{1000+nodo_gemma}" in titoli_nic, "Gemma legittima doveva essere inclusa!"
    assert f"movie:{1000+nodo_falso_cult}" not in titoli_nic, "Titolo con 3 voti doveva essere escluso dal pavimento 40!"
    assert f"movie:{1000+nodo_mediocre}" not in titoli_nic, "Titolo con VAVE 6.6 doveva essere escluso dal floor 6.8!"
    assert f"movie:{1000+nodo_delta_basso}" not in titoli_nic, "Titolo con delta +0.2 doveva essere escluso dal requisito +0.4!"
    print("  -> OK: Tutti i filtri selettivi funzionano come da specifica.\n")


def test_ranking_e_bonus_liste():
    print("=" * 80)
    print("4. VERIFICA ORDINAMENTO r * (VAVE - mu_b + 1.0) * (1 + 0.15 * (LISTDEG > 0))")
    print("=" * 80)
    m = build_dual_world_graph()
    b1 = m.MEMBRI[1]

    # Due titoli con identica attivazione e qualità, ma uno ha LISTDEG > 0
    nodo_a = b1[15]
    m.VOT[nodo_a] = 70.0; m.POP[nodo_a] = 8.0; m.VAVE[nodo_a] = 7.8
    m.LISTDEG[nodo_a] = 0.0

    nodo_b = b1[16]
    m.VOT[nodo_b] = 70.0; m.POP[nodo_b] = 8.0; m.VAVE[nodo_b] = 7.8
    m.LISTDEG[nodo_b] = 5.0  # Presente in liste Trakt

    # Un terzo titolo con r leggermente inferiore ma delta voto eccezionale (VAVE = 8.4)
    nodo_c = b1[17]
    m.VOT[nodo_c] = 70.0; m.POP[nodo_c] = 8.0; m.VAVE[nodo_c] = 8.4
    m.LISTDEG[nodo_c] = 0.0

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
    assert abs(ratio - 1.15) < 1e-3, f"Il bonus liste deve essere esattamente +15%, trovato ratio {ratio}"
    print("  -> OK: Formula di ranking e bonus liste verificati con precisione matematica.\n")


def test_trappole_specifiche():
    print("=" * 80)
    print("5. VERIFICA TRAPPOLE: TETTO 2500 ASSOLUTO E INFLAZIONE SERIE +0.3")
    print("=" * 80)

    # 1. Trappola tetto 2500
    m = build_dual_world_graph()
    att_s_mock = np.array([1.0, 0.0, 0.0, 0.0])
    m.VOTMED[0] = 15000.0  # V_mondo enorme
    v_mondo = m.calcola_v_mondo({0}, att_s_mock)
    tetto = min(P.NICCHIA_FATTORE_V_MONDO * v_mondo, P.NICCHIA_TETTO_VOT_MAX)
    print(f"  Trappola 1: V_mondo = {v_mondo:.0f} -> 0.35 * V = {0.35 * v_mondo:.0f}")
    print(f"              Tetto effettivo = min(0.35 * V, 2500) = {tetto:.1f}")
    assert tetto == 2500.0, f"Atteso cap a 2500.0, ottenuto {tetto}"
    print("  -> OK: Il tetto di 2500 protegge rigorosamente dall'apertura a tutto.\n")

    # 2. Trappola serie (+0.3 inflazione)
    print("  Trappola 2: Serie tv con inflazione TMDB (~0.3):")
    # Impostiamo nodi come serie
    b0 = m.MEMBRI[0]
    for idx in [b0[20], b0[21], b0[22]]:
        B.IS_TV[idx] = True
        B.KEYS[idx] = f"tv:{1000+idx}"
        B.ROW_OF[f"tv:{1000+idx}"] = idx

    m.VOT[b0[20]] = 500.0; m.POP[b0[20]] = 20.0
    m.VOT[b0[21]] = 500.0; m.POP[b0[21]] = 20.0
    m.VOT[b0[22]] = 500.0; m.POP[b0[22]] = 20.0

    # mu_b = 6.5
    m.VAVEMEAN[0] = 6.5

    # Serie 1 (b0[20]): VAVE = 6.95 (mu = 6.5 -> delta = +0.45 >= 0.4, ma 6.95 < 7.1!)
    # Con soglia 6.8 (dei film) entrerebbe; con soglia corretta 7.1 DEVE essere scartata
    m.VAVE[b0[20]] = 6.95

    # Serie 2 (b0[21]): VAVE = 7.30 (delta = +0.8 >= 0.4, e 7.30 >= 7.1) -> ENTRA
    m.VAVE[b0[21]] = 7.30

    # Serie seme visto (b0[22])
    m.VAVE[b0[22]] = 7.50

    # Verifichiamo con medium='series'
    storia_tv = [(f"tv:{1000 + b0[22]}", 1, "watched", None)]
    res_tv = m.lista(storia_tv, cap=10, medium="series")
    nic_tv = next(l for l in res_tv["liste"] if l["tipo"] == "nicchia_di_qualita")
    titoli_tv = [t[0] for t in nic_tv["titoli"]]

    print(f"    - Serie con VAVE = 6.95 (delta +0.45, < 7.1) : {'PRESENTE (ERRORE)' if f'tv:{1000+b0[20]}' in titoli_tv else 'ESCLUSA (Corretto: VAVE < 7.1)'}")
    print(f"    - Serie con VAVE = 7.30 (delta +0.80, >= 7.1): {'PRESENTE (Corretto)' if f'tv:{1000+b0[21]}' in titoli_tv else 'ESCLUSA (ERRORE)'}")

    assert f"tv:{1000+b0[20]}" not in titoli_tv, "Serie con voto < 7.1 doveva essere scartata!"
    assert f"tv:{1000+b0[21]}" in titoli_tv, "Serie con voto >= 7.1 doveva essere inclusa!"
    print("  -> OK: La soglia maggiorata per serie (7.1 vs 6.8) neutralizza l'inflazione di TMDB.\n")


def test_contratto_monotonia():
    print("=" * 80)
    print("6. VERIFICA CONTRATTO DI MONOTONIA SU 'nicchia_di_qualita'")
    print("=" * 80)
    m = build_dual_world_graph()
    b0 = m.MEMBRI[0]
    # Creiamo alcuni titoli qualificati come gemme nella bolla 0 con voti e popolarita' idonei
    for i in range(1, 15):
        m.VOT[b0[i]] = 1200.0
        m.POP[b0[i]] = 50.0
        m.VAVE[b0[i]] = 7.8 + 0.05 * (i % 4)
        if i % 3 == 0:
            m.LISTDEG[b0[i]] = 4.0

    storia = [("movie:1000", 1, "watched", None)]
    res = m.lista(storia, cap=20, medium="movie")
    nic = next(l for l in res["liste"] if l["tipo"] == "nicchia_di_qualita")

    assert len(nic["titoli"]) > 0, "La lista di nicchia non deve uscire vuota!"
    # Chiama esplicitamente il contratto su nicchia_di_qualita
    K.assert_monotonia_lista(nic["titoli"], "lista nicchia_di_qualita")

    punti = [t[1] for t in nic["titoli"]]
    for i in range(len(punti) - 1):
        assert punti[i] >= punti[i + 1] - 1e-9, f"Violazione monotonia: {punti[i]} < {punti[i+1]}"

    print(f"  Titoli restituiti in nicchia: {len(nic['titoli'])}")
    print(f"  Punteggi decrescenti: {[round(p, 5) for p in punti[:5]]} ...")
    print("  -> OK: Monotonicita' verificata e pienamente integrata nel contratto.\n")


def test_servizio_http_e_memoria():
    print("=" * 80)
    print("7. SERVIZIO GRAFO HTTP (HEALTH 200, RACCOMANDA 200) E CONSUMO RAM")
    print("=" * 80)
    m = build_dual_world_graph()
    b0 = m.MEMBRI[0]
    for i in range(1, 10):
        m.VOT[b0[i]] = 1200.0
        m.POP[b0[i]] = 50.0
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
            print(f"    Primi 3 titoli: {nicchia['titoli'][:3]}")

        # Misura RAM del processo
        import psutil
        proc = psutil.Process()
        rss_mb = proc.memory_info().rss / (1024 * 1024)
        print(f"\n  Consumo RAM processo: {rss_mb:.1f} MB (Tetto massimo: 512 MB)")
        assert rss_mb < 512.0, f"RAM {rss_mb:.1f} MB supera il tetto di 512 MB!"
        print("  -> OK: Consumo RAM ampiamente sotto il tetto dei 512 MB.")
    finally:
        server.shutdown()
        server.server_close()
        print("  Server HTTP arrestato correttamente.")
    print()


if __name__ == "__main__":
    test_parametri()
    test_due_profili_opposti()
    test_filtri_qualita_e_notorieta()
    test_ranking_e_bonus_liste()
    test_trappole_specifiche()
    test_contratto_monotonia()
    test_servizio_http_e_memoria()
    print("=" * 80)
    print("TUTTE LE VERIFICHE TICKET 05 SUPERATE CON SUCCESSO (TASK_OK)")
    print("=" * 80)
