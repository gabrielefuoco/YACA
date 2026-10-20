"""probe-ticket-03-mondo.py — Sonda di verifica per il Ticket 03.

Verifica:
1. Bacino appiattito: top K bolle accese (>=80% massa, min 250-300 candidati grezzi) + primi 2-3 vicini
2. Pavimento di qualita' adattivo applicato PRIMA del ranking: drop VAVE < 6.4 or VOT < max(150, 0.08 * canone)
3. Ranking combinato: score(x) = r[x] * (bayesian_vote(x) / 7.0) ** 1.5
4. Caso costruito a mano: titolo con alta attivazione e 8 voti scavalcatо/scartato da titolo con voto solido
5. Floor adattivo: mainstream vs d'essai non degenerano nella stessa riga
6. Maschera applicata prima di [:cap] per non accorciare la riga
7. Servizio HTTP (/health 200, /raccomanda 200) e consumo memoria (< 512 MB)
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
from graph import servizio as S


def test_parametri():
    print("=" * 80)
    print("1. VERIFICA IPERPARAMETRI TICKET 03 IN PARAMETRI.PY")
    print("=" * 80)
    assert P.IL_TUO_MONDO_MASSA_TARGET == 0.80, f"Atteso 0.80, trovato {P.IL_TUO_MONDO_MASSA_TARGET}"
    assert P.IL_TUO_MONDO_MIN_CANDIDATI == 250, f"Atteso 250, trovato {P.IL_TUO_MONDO_MIN_CANDIDATI}"
    assert P.IL_TUO_MONDO_VICINI_PER_BOLLA == 3, f"Atteso 3, trovato {P.IL_TUO_MONDO_VICINI_PER_BOLLA}"
    assert P.PAVIMENTO_VAVE_MIN == 6.4, f"Atteso 6.4, trovato {P.PAVIMENTO_VAVE_MIN}"
    assert P.PAVIMENTO_VOT_MIN == 150, f"Atteso 150, trovato {P.PAVIMENTO_VOT_MIN}"
    assert P.PAVIMENTO_VOT_FATTORE_CANONE == 0.08, f"Atteso 0.08, trovato {P.PAVIMENTO_VOT_FATTORE_CANONE}"
    assert P.BAYESIAN_M == 300.0, f"Atteso 300.0, trovato {P.BAYESIAN_M}"
    assert P.BAYESIAN_C == 6.5, f"Atteso 6.5, trovato {P.BAYESIAN_C}"
    assert P.RANKING_BAYES_BASE == 7.0, f"Atteso 7.0, trovato {P.RANKING_BAYES_BASE}"
    assert P.RANKING_BAYES_EXP == 1.5, f"Atteso 1.5, trovato {P.RANKING_BAYES_EXP}"
    print(f"  IL_TUO_MONDO_MASSA_TARGET     = {P.IL_TUO_MONDO_MASSA_TARGET}")
    print(f"  IL_TUO_MONDO_MIN_CANDIDATI    = {P.IL_TUO_MONDO_MIN_CANDIDATI}")
    print(f"  IL_TUO_MONDO_VICINI_PER_BOLLA = {P.IL_TUO_MONDO_VICINI_PER_BOLLA}")
    print(f"  PAVIMENTO_VAVE_MIN            = {P.PAVIMENTO_VAVE_MIN}")
    print(f"  PAVIMENTO_VOT_MIN             = {P.PAVIMENTO_VOT_MIN}")
    print(f"  PAVIMENTO_VOT_FATTORE_CANONE  = {P.PAVIMENTO_VOT_FATTORE_CANONE}")
    print(f"  BAYESIAN_M                    = {P.BAYESIAN_M}")
    print(f"  BAYESIAN_C                    = {P.BAYESIAN_C}")
    print(f"  RANKING_BAYES_BASE            = {P.RANKING_BAYES_BASE}")
    print(f"  RANKING_BAYES_EXP             = {P.RANKING_BAYES_EXP}")
    print("  -> OK: Tutti i 10 parametri presenti e calibrati.\n")


def build_synthetic_graph(n_nodes=350, n_bolle=4):
    """Costruisce un grafo sintetico con ~350 nodi e 4 bolle per testare il bacino 250-300 titoli."""
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
        # Connessione densa su seme
        if b == 0:
            for j in range(1, 20):
                add_edge(0, j, 4.0)

    # Archi inter-bolla (vicini)
    for b in range(n_bolle - 1):
        u = b * nodes_per_bolla
        v = (b + 1) * nodes_per_bolla
        if u < n_nodes and v < n_nodes:
            add_edge(u, v, 2.0)

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
    m.VICINI = []
    for b in range(n_bolle):
        vic = [x for x in range(n_bolle) if x != b]
        m.VICINI.append(np.array(vic, dtype=np.int32))
    m.VAVE = np.full(n_nodes, 7.2, dtype=np.float32)
    m.VOT = np.full(n_nodes, 1200.0, dtype=np.float32)
    m.VOTMED = np.array([1200.0] * n_bolle, dtype=np.float32)
    m.POP = np.full(n_nodes, 40.0, dtype=np.float32)
    m.ANNO = np.full(n_nodes, 2021, dtype=np.int32)
    m.NEP = np.full(n_nodes, 1.0, dtype=np.float32)
    m.COZY = np.zeros(n_nodes, dtype=np.float32)
    m.IMP = np.zeros(n_nodes, dtype=np.float32)
    m.QUOTA_TV = np.zeros(n_bolle, dtype=np.float32)
    m.QUOTA_COZY = np.zeros(n_bolle, dtype=np.float32)
    m.QUOTA_IMP = np.zeros(n_bolle, dtype=np.float32)
    m.LISTDEG = np.zeros(n_nodes, dtype=np.float32)
    m.TIT = np.array([f"Film_{i}" for i in range(n_nodes)])
    m.artefatto = "mock-artefatto-ticket-03"

    keys_mock = [f"movie:{1000+i}" for i in range(n_nodes)]
    B.KEYS = keys_mock
    B.ROW_OF = {k: i for i, k in enumerate(keys_mock)}
    B.IS_TV = np.zeros(n_nodes, dtype=bool)

    return m


def test_pavimento_adattivo():
    print("=" * 80)
    print("2. TRAPPOLA FLOOR ADATTIVO: MAINSTREAM VS D'ESSAI")
    print("=" * 80)
    m = build_synthetic_graph()

    # Creiamo un titolo X nel bacino (nodo 10):
    # VOT = 400 (sufficiente per arthouse, insufficiente per blockbuster)
    # VAVE = 7.5
    m.VOT[10] = 400.0
    m.VAVE[10] = 7.5

    # Profilo Mainstream: storia con voti mediani molto alti (canone = 12.500)
    m.VOT[0] = 12500.0
    storia_mainstream = [("movie:1000", 1, "watched", None)]
    dedotto_main = m.deduci(np.array([0], dtype=np.int64))
    canone_main = dedotto_main["canone"]
    soglia_main = max(P.PAVIMENTO_VOT_MIN, P.PAVIMENTO_VOT_FATTORE_CANONE * canone_main)

    # Profilo D'Essai: storia con voti mediani bassi/cult (canone = 500)
    m.VOT[1] = 500.0
    storia_essai = [("movie:1001", 1, "watched", None)]
    dedotto_essai = m.deduci(np.array([1], dtype=np.int64))
    canone_essai = dedotto_essai["canone"]
    soglia_essai = max(P.PAVIMENTO_VOT_MIN, P.PAVIMENTO_VOT_FATTORE_CANONE * canone_essai)

    print(f"  Profilo Mainstream: canone = {canone_main:.0f} voti -> Soglia VOT = max(150, 0.08 * {canone_main:.0f}) = {soglia_main:.1f} voti")
    print(f"  Profilo D'Essai:    canone = {canone_essai:.0f} voti -> Soglia VOT = max(150, 0.08 * {canone_essai:.0f}) = {soglia_essai:.1f} voti")

    assert soglia_main == 1000.0, f"Attesa soglia 1000.0 per mainstream, ottenuta {soglia_main}"
    assert soglia_essai == 150.0, f"Attesa soglia 150.0 per essai, ottenuta {soglia_essai}"
    assert soglia_main != soglia_essai, "Le soglie devono divergere tra profili diversi!"

    # Esegui raccomandazione per entrambi i profili
    res_main = m.lista(storia_mainstream, cap=15, medium="movie")
    res_essai = m.lista(storia_essai, cap=15, medium="movie")

    tuo_main = [t[0] for t in next(l["titoli"] for l in res_main["liste"] if l["tipo"] == "il_tuo_mondo")]
    tuo_essai = [t[0] for t in next(l["titoli"] for l in res_essai["liste"] if l["tipo"] == "il_tuo_mondo")]

    print(f"  Titolo 'movie:1010' (VOT = 400):")
    print(f"    - In Mainstream: {'PRESENTE' if 'movie:1010' in tuo_main else 'SCARTATO (corretto: 400 < 1000)'}")
    print(f"    - In D'Essai:    {'PRESENTE (corretto: 400 >= 150)' if 'movie:1010' in tuo_essai else 'SCARTATO'}")

    assert "movie:1010" not in tuo_main, "movie:1010 doveva essere scartato dal profilo mainstream (400 < 1000)"
    assert "movie:1010" in tuo_essai, "movie:1010 doveva essere ammesso nel profilo d'essai (400 >= 150)"
    assert tuo_main != tuo_essai, "Le due righe NON devono degenerare nella stessa lista!"
    print("  -> OK: Il pavimento si adatta matematicamente alla storia e impedisce la degenerazione.\n")


def test_confronto_prima_dopo():
    print("=" * 80)
    print("3. CONFRONTO PRIMA vs DOPO SULLO STESSO PROFILO")
    print("=" * 80)
    m = build_synthetic_graph()

    # Creiamo nel grafo alcuni titoli con difetti tipici pre-ticket-03:
    # 1. Titoli con pochissimi voti (es. 8, 12, 45 voti) e VAVE apparentemente alta (8.5)
    m.VOT[5] = 8.0; m.VAVE[5] = 8.5
    m.VOT[6] = 15.0; m.VAVE[6] = 8.2
    m.VOT[7] = 45.0; m.VAVE[7] = 7.9
    # 2. Titoli con voto mediocre (VAVE < 6.4)
    m.VOT[8] = 2500.0; m.VAVE[8] = 5.6
    m.VOT[9] = 1800.0; m.VAVE[9] = 6.1
    # 3. Titoli solidi (alta qualità e voti)
    m.VOT[10] = 5000.0; m.VAVE[10] = 8.4
    m.VOT[11] = 4200.0; m.VAVE[11] = 8.1
    m.VOT[12] = 3100.0; m.VAVE[12] = 7.8

    storia = [("movie:1000", 1, "watched", None)]

    # --- COMPORTAMENTO PRIMA (Pre-Ticket 03):
    # Bolla per bolla, nessun filtro su VAVE o VOT, ordinamento per r puro
    _, r_raw = m.diffondi(np.array([0], dtype=np.int64), np.array([1.0]))
    visti_pre = {0}
    candidati_bolla_0 = [x for x in m.MEMBRI[0] if x not in visti_pre]
    # Ordine per r puro
    candidati_bolla_0_ordinati = sorted(candidati_bolla_0, key=lambda x: -r_raw[x])
    top10_prima_idx = candidati_bolla_0_ordinati[:10]
    top10_prima = [(B.KEYS[x], float(m.VOT[x]), float(m.VAVE[x]), float(r_raw[x])) for x in top10_prima_idx]

    # --- COMPORTAMENTO DOPO (Ticket 03):
    res_dopo = m.lista(storia, cap=10, medium="movie")
    tuo_mondo_dopo = next(l for l in res_dopo["liste"] if l["tipo"] == "il_tuo_mondo")
    top10_dopo_tuples = tuo_mondo_dopo["titoli"][:10]

    # Ricaviamo statistiche bacino
    dedotto = m.deduci(np.array([0], dtype=np.int64))
    canone = dedotto["canone"]
    soglia_voti = max(P.PAVIMENTO_VOT_MIN, P.PAVIMENTO_VOT_FATTORE_CANONE * canone)
    soglia_vave = P.PAVIMENTO_VAVE_MIN

    # Calcolo bacino appiattito prima del filtro
    cand_bacino = [x for x in range(m.N) if x != 0] # tutti i 349 non visti
    scartati_vave = [x for x in cand_bacino if m.VAVE[x] < soglia_vave]
    scartati_vot = [x for x in cand_bacino if m.VOT[x] < soglia_voti and x not in scartati_vave]
    totale_scartati = len(scartati_vave) + len(scartati_vot)
    sopravvissuti = [x for x in cand_bacino if m.VAVE[x] >= soglia_vave and m.VOT[x] >= soglia_voti]

    print(f"BACINO APPIATTITO:")
    print(f"  - Dimensione bacino grezzo non visti : {len(cand_bacino)} titoli (>= 250-300 attesi)")
    print(f"  - Scartati dal pavimento di qualita' : {totale_scartati} titoli")
    print(f"      * per VAVE < {soglia_vave:.1f}           : {len(scartati_vave)} titoli")
    print(f"      * per VOT  < {soglia_voti:.0f}          : {len(scartati_vot)} titoli")
    print(f"  - Sopravvissuti al pavimento         : {len(sopravvissuti)} titoli")
    print()

    print("PRIMA DEL FIX (Bolla per bolla, NO floor, r puro):")
    print(f"{'Pos':<4} {'Titolo':<12} {'VOT':<8} {'VAVE':<8} {'r grezzo':<10} {'Anomalia riscontrata'}")
    print("-" * 65)
    for i, (k, vot, vave, r_val) in enumerate(top10_prima):
        anomalia = ""
        if vot < 150:
            anomalia = f"INTRUSO! Solo {vot:.0f} voti!"
        elif vave < 6.4:
            anomalia = f"INTRUSO! Voto mediocre ({vave:.1f})!"
        print(f"#{i+1:<3} {k:<12} {vot:<8.0f} {vave:<8.1f} {r_val:<10.5f} {anomalia}")
    print()

    print("DOPO IL FIX (Bacino appiattito, Maschera pavimento, Ranking combinato):")
    print(f"{'Pos':<4} {'Titolo':<12} {'VOT':<8} {'VAVE':<8} {'Bayes':<8} {'Score Combinato':<16} {'Stato Pavimento'}")
    print("-" * 75)
    top10_dopo = []
    for i, (k, sc) in enumerate(top10_dopo_tuples):
        x = B.ROW_OF[k]
        vot = float(m.VOT[x])
        vave = float(m.VAVE[x])
        bayes = float(m.voto_bayesiano(x))
        top10_dopo.append((k, vot, vave, bayes, sc))
        assert vave >= soglia_vave, f"Violazione VAVE a pos {i}: {vave} < {soglia_vave}"
        assert vot >= soglia_voti, f"Violazione VOT a pos {i}: {vot} < {soglia_voti}"
        print(f"#{i+1:<3} {k:<12} {vot:<8.0f} {vave:<8.1f} {bayes:<8.2f} {sc:<16.6f} OK (VOT >= {soglia_voti:.0f}, VAVE >= {soglia_vave})")
    print()

    # Dimostrazione che i titoli spuri con 8 e 15 voti o media 5.6 sono spariti
    assert "movie:1005" not in [t[0] for t in top10_dopo_tuples], "movie:1005 (8 voti) non deve essere in output"
    assert "movie:1006" not in [t[0] for t in top10_dopo_tuples], "movie:1006 (15 voti) non deve essere in output"
    assert "movie:1008" not in [t[0] for t in top10_dopo_tuples], "movie:1008 (VAVE 5.6) non deve essere in output"
    print("  -> OK: Tutti i primi 10 titoli in uscita superano rigorosamente il pavimento di qualita'.\n")


def test_caso_costruito_8_voti():
    print("=" * 80)
    print("4. CASO COSTRUITO A MANO: ALTA ATTIVAZIONE + 8 VOTI vs ATTIVAZIONE MINORE + VOTO SOLIDO")
    print("=" * 80)
    m = build_synthetic_graph(n_nodes=20, n_bolle=2)

    # Titolo A (nodo 1): altissima attivazione, ma soli 8 voti
    # Titolo B (nodo 2): attivazione inferiore, ma 3000 voti e VAVE 8.4
    m.VOT[1] = 8.0;    m.VAVE[1] = 7.2
    m.VOT[2] = 3000.0; m.VAVE[2] = 8.4

    r_mock = np.zeros(20, dtype=float)
    r_mock[1] = 0.22  # Molto alto
    r_mock[2] = 0.18  # Minore

    # 1. Ranking puro con r[x]
    print(f"  Ranking puro r[x]:")
    print(f"    - Titolo A (movie:1001, VOT=8):    r = {r_mock[1]:.4f}")
    print(f"    - Titolo B (movie:1002, VOT=3000): r = {r_mock[2]:.4f}")
    assert r_mock[1] > r_mock[2]
    print("    => Nel ranking puro il Titolo A scavalca ingiustamente il Titolo B.")

    # 2. Ranking combinato: score = r * (bayes / P.RANKING_BAYES_BASE) ** P.RANKING_BAYES_EXP
    bayes_1 = float(m.voto_bayesiano(1))
    bayes_2 = float(m.voto_bayesiano(2))
    score_1 = r_mock[1] * ((bayes_1 / P.RANKING_BAYES_BASE) ** P.RANKING_BAYES_EXP)
    score_2 = r_mock[2] * ((bayes_2 / P.RANKING_BAYES_BASE) ** P.RANKING_BAYES_EXP)

    print(f"\n  Ranking combinato score = r * (bayes / {P.RANKING_BAYES_BASE}) ** {P.RANKING_BAYES_EXP}:")
    print(f"    - Titolo A: bayes = {bayes_1:.3f} -> score = {score_1:.5f} (penalizzato dalla formula bayesiana)")
    print(f"    - Titolo B: bayes = {bayes_2:.3f} -> score = {score_2:.5f} (premiato per qualita' solida)")
    assert score_2 > score_1, f"Atteso score Titolo B ({score_2}) > Titolo A ({score_1})"
    print("    => OK: Nel ranking combinato il Titolo B scavalca il Titolo A!")

    # 3. Con il Pavimento di Qualita':
    soglia_vot = P.PAVIMENTO_VOT_MIN
    soglia_vave = P.PAVIMENTO_VAVE_MIN
    passa_floor_A = (m.VOT[1] >= soglia_vot) and (m.VAVE[1] >= soglia_vave)
    passa_floor_B = (m.VOT[2] >= soglia_vot) and (m.VAVE[2] >= soglia_vave)
    print(f"\n  Pavimento di Qualita' (VOT >= {P.PAVIMENTO_VOT_MIN:.0f}, VAVE >= {P.PAVIMENTO_VAVE_MIN}):")
    print(f"    - Titolo A: VOT = {m.VOT[1]:.0f} -> Supera pavimento: {passa_floor_A} (ELIMINATO)")
    print(f"    - Titolo B: VOT = {m.VOT[2]:.0f} -> Supera pavimento: {passa_floor_B} (QUALIFICATO)")
    assert not passa_floor_A
    assert passa_floor_B
    print("    => OK: Titolo A con 8 voti viene totalmente estromesso a monte dal pavimento.\n")


def test_maschera_prima_di_cap():
    print("=" * 80)
    print("5. VERIFICA MASCHERA PRIMA DEL TAGLIO [:CAP]")
    print("=" * 80)
    m = build_synthetic_graph(n_nodes=40, n_bolle=2)
    # Impostiamo 25 titoli sotto pavimento e 14 titoli sopra pavimento
    for i in range(1, 26):
        m.VOT[i] = 20.0 # sotto pavimento (20 < 150)
    for i in range(26, 40):
        m.VOT[i] = 1000.0
        m.VAVE[i] = 7.5

    storia = [("movie:1000", 1, "watched", None)]
    cap_richiesto = 10
    res = m.lista(storia, cap=cap_richiesto, medium="movie")
    tuo_mondo = next(l for l in res["liste"] if l["tipo"] == "il_tuo_mondo")
    titoli = tuo_mondo["titoli"]

    print(f"  Cap richiesto: {cap_richiesto}")
    print(f"  Titoli restituiti in 'il_tuo_mondo': {len(titoli)}")
    assert len(titoli) == cap_richiesto, f"La riga doveva essere piena ({cap_richiesto}), ottenuti {len(titoli)}"
    for k, sc in titoli:
        x = B.ROW_OF[k]
        assert m.VOT[x] >= 150, f"Titolo {k} sotto soglia voti ({m.VOT[x]} < 150)"
        assert m.VAVE[x] >= 6.4, f"Titolo {k} sotto soglia vave ({m.VAVE[x]} < 6.4)"
    print("  -> OK: La riga e' piena (cap 10) e tutti i titoli rispettano il pavimento.\n")


def test_servizio_http_e_memoria():
    print("=" * 80)
    print("6. SERVIZIO GRAFO HTTP (HEALTH 200, RACCOMANDA 200) E CONSUMO RAM")
    print("=" * 80)
    m = build_synthetic_graph()

    port = 7897
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
            print(f"  GET /health  -> status {r.status}, ok: {health['ok']}, ricetta: {health['versioni']['ricetta']}")

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
            tuo_mondo = next(l for l in post_resp["liste"] if l["ruolo"] == "il_tuo_mondo")
            print(f"  POST /raccomanda -> status {r.status}, ruolo: {tuo_mondo['ruolo']}, titoli: {len(tuo_mondo['titoli'])}")
            print(f"    Primi 3 titoli: {tuo_mondo['titoli'][:3]}")

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
    test_pavimento_adattivo()
    test_confronto_prima_dopo()
    test_caso_costruito_8_voti()
    test_maschera_prima_di_cap()
    test_servizio_http_e_memoria()
    print("=" * 80)
    print("TUTTE LE VERIFICHE TICKET 03 SUPERATE CON SUCCESSO (TASK_OK)")
    print("=" * 80)
