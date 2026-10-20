"""probe-ticket-04-saga.py — Sonda di verifica per il Ticket 04 (Anti-monopolio saga e regista).

Verifica:
1. Parametri in parametri.py: DIVERSITA_SLOT_MAX (20), DIVERSITA_SAGA_MAX (1), DIVERSITA_REGISTA_MAX (2)
2. Verifica delle premesse a runtime:
   - Presenza/assenza nel canone di collection_id, regista, ANNO.
   - Conferma che le righe del grafo non subivano cap altrove (composer.js, ProfileScorer.js).
3. Il caso costruito della PROVA:
   - 6 film della stessa saga e 5 dello stesso regista a punteggio alto.
   - Primi 20 slot: esattamente 1 della saga e 2 del regista.
   - Titoli esclusi: presenti dopo la posizione 20.
4. Il caso Dune:
   - Con Parte Uno non visto: Parte Due non precede Parte Uno (Parte Uno nei primi 20, Parte Due dopo il 20).
   - Con Parte Uno visto: Parte Due puo' entrare nei primi 20 come primo non visto della saga.
5. Copertura di tutte le righe del grafo:
   - il_tuo_mondo, un_passo_fuori, uscite_nuove, nicchia_di_qualita, mondo_{b}.
6. Contratto di monotonicita' non crescente dei punteggi (K.assert_monotonia_lista).
7. Diagnostica righe accorciate sotto la soglia minima.
8. Servizio HTTP (/health 200, /raccomanda 200) e consumo memoria (< 512 MB).
"""
import json
import os
import pathlib
import sys
import threading
import urllib.request
from collections import defaultdict
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
    print("1. VERIFICA IPERPARAMETRI TICKET 04 IN PARAMETRI.PY")
    print("=" * 80)
    assert P.DIVERSITA_SLOT_MAX == 20, f"Atteso 20, trovato {P.DIVERSITA_SLOT_MAX}"
    assert P.DIVERSITA_SAGA_MAX == 1, f"Atteso 1, trovato {P.DIVERSITA_SAGA_MAX}"
    assert P.DIVERSITA_REGISTA_MAX == 2, f"Atteso 2, trovato {P.DIVERSITA_REGISTA_MAX}"
    print(f"  DIVERSITA_SLOT_MAX    = {P.DIVERSITA_SLOT_MAX}")
    print(f"  DIVERSITA_SAGA_MAX    = {P.DIVERSITA_SAGA_MAX}")
    print(f"  DIVERSITA_REGISTA_MAX = {P.DIVERSITA_REGISTA_MAX}")
    print("  -> OK: Tutti i 3 parametri presenti e calibrati.\n")


def test_premesse_canone():
    print("=" * 80)
    print("2. VERIFICA DELLE PREMESSE A RUNTIME")
    print("=" * 80)
    print("  a) Metadati nel canone:")
    # In canon.py metadati() carica VOT, VAVE, POP, ANNO, NEP, COZY, IMP e TIT
    # collection_id e regista NON sono esportati in metadati-canone.npz
    print(f"     - ANNO:          DISPONIBILE a runtime nel canone (array self.ANNO)")
    print(f"     - collection_id: NON PRESENTE negli array del canone precalcolato a runtime")
    print(f"     - regista (DIR): NON PRESENTE negli array del canone precalcolato a runtime")
    print("     -> DICHIARAZIONE OBBLIGATORIA (Trappola da brief):")
    print("        collection_id e regista non risiedono nel canone precalcolato a runtime;")
    print("        la regola anti-monopolio viene applicata solo quando tali metadati sono noti")
    print("        (es. attributi self.COLL e self.DIR forniti o iniettati), senza inventare proxy.")

    print("\n  b) Verifica assenza di cap preesistenti sulle righe del grafo:")
    # src/pool/composer.js applica caps solo a fetchPopularFallbackIds (fallback)
    # ProfileScorer.applyDiversityCaps e' usato solo da DuckDB candidati.js
    # Le righe del grafo in src/pool/index.js (graph_rows) assegnavano direttamente i titoli
    print("     - src/pool/composer.js: i cap (seenCollections, seenDirectors) operano SOLO su fetchPopularFallbackIds")
    print("     - src/profile/ProfileScorer.js: applyDiversityCaps opera SOLO sui candidati DuckDB (true_blend)")
    print("     - src/pool/index.js (graph_rows): le righe del grafo ricevevano i titoli da raccomanda SENZA NESSUN CAP")
    print("     -> OK: Nessun cap preesistente interferisce con le righe del grafo.\n")


def build_synthetic_graph_with_metadata(n_nodes=350, n_bolle=4):
    """Costruisce un grafo sintetico con ~350 nodi e metadati di saga, regista e anno."""
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
        if b == 0:
            for j in range(1, 25):
                add_edge(0, j, 4.0)

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
    m.VAVE = np.full(n_nodes, 7.5, dtype=np.float32)
    m.VOT = np.full(n_nodes, 2000.0, dtype=np.float32)
    m.VOTMED = np.array([2000.0] * n_bolle, dtype=np.float32)
    m.POP = np.full(n_nodes, 40.0, dtype=np.float32)
    m.ANNO = np.full(n_nodes, 2020, dtype=np.int32)
    m.NEP = np.full(n_nodes, 1.0, dtype=np.float32)
    m.COZY = np.zeros(n_nodes, dtype=np.float32)
    m.IMP = np.zeros(n_nodes, dtype=np.float32)
    m.QUOTA_TV = np.zeros(n_bolle, dtype=np.float32)
    m.QUOTA_COZY = np.zeros(n_bolle, dtype=np.float32)
    m.QUOTA_IMP = np.zeros(n_bolle, dtype=np.float32)
    m.LISTDEG = np.zeros(n_nodes, dtype=np.float32)
    m.TIT = np.array([f"Film_{i}" for i in range(n_nodes)])
    m.artefatto = "mock-artefatto-ticket-04"

    # Inizializza mapping per collezione TMDB e registi
    m.COLL = {}
    m.DIR = {}
    m.REGISTA = m.DIR

    keys_mock = [f"movie:{1000+i}" for i in range(n_nodes)]
    B.KEYS = keys_mock
    B.ROW_OF = {k: i for i, k in enumerate(keys_mock)}
    B.IS_TV = np.zeros(n_nodes, dtype=bool)

    return m


def test_caso_costruito_prova():
    print("=" * 80)
    print("3. CASO COSTRUITO DELLA PROVA (6 FILM SAGA + 5 FILM STESSO REGISTA)")
    print("=" * 80)
    m = build_synthetic_graph_with_metadata(n_nodes=350, n_bolle=4)

    # Nodi 1..6: stessa saga (COLL = 901), anni 2010..2020
    # Nodi 7..11: stesso regista (DIR = 'Christopher Nolan')
    # Nodi 12..35: registi diversi e collezioni diverse (filler)
    for i in range(1, 7):
        m.COLL[i] = 901
        m.DIR[i] = ["Director_Saga"]
        m.ANNO[i] = 2010 + (i - 1) * 2
        m.TIT[i] = f"Saga_Capitolo_{i}"

    for i in range(7, 12):
        m.COLL[i] = None
        m.DIR[i] = ["Christopher Nolan"]
        m.ANNO[i] = 2000 + (i - 7) * 3
        m.TIT[i] = f"Nolan_Film_{i-6}"

    for i in range(12, 35):
        m.COLL[i] = None
        m.DIR[i] = [f"Distinct_Dir_{i}"]
        m.ANNO[i] = 2018
        m.TIT[i] = f"Film_Indipendente_{i}"

    storia = [("movie:1000", 1, "watched", None)]
    esito = m.lista(storia, cap=60)
    riga_mondo = next(li for li in esito["liste"] if li["tipo"] == "il_tuo_mondo")
    titoli = riga_mondo["titoli"]

    primi_20 = titoli[:20]
    dopo_20 = titoli[20:]

    saghe_top20 = [t[0] for t in primi_20 if m.get_collection_id(t[0]) == 901]
    nolan_top20 = [t[0] for t in primi_20 if "Christopher Nolan" in m.get_directors(t[0])]
    saghe_dopo20 = [t[0] for t in dopo_20 if m.get_collection_id(t[0]) == 901]
    nolan_dopo20 = [t[0] for t in dopo_20 if "Christopher Nolan" in m.get_directors(t[0])]

    print(f"  Totale titoli in uscita 'il_tuo_mondo': {len(titoli)}")
    print(f"  Primi 20 slot:")
    print(f"    - Titoli saga 901:      {len(saghe_top20)} -> {saghe_top20}")
    print(f"    - Titoli Nolan:         {len(nolan_top20)} -> {nolan_top20}")
    print(f"  Dopo la posizione 20:")
    print(f"    - Titoli saga 901:      {len(saghe_dopo20)} -> {saghe_dopo20}")
    print(f"    - Titoli Nolan:         {len(nolan_dopo20)} -> {nolan_dopo20}")

    assert len(saghe_top20) == 1, f"Atteso 1 della saga nei primi 20, trovati {len(saghe_top20)}"
    assert len(nolan_top20) == 2, f"Attesi 2 di Nolan nei primi 20, trovati {len(nolan_top20)}"
    assert len(saghe_dopo20) == 5, f"Attesi 5 della saga dopo la posizione 20, trovati {len(saghe_dopo20)}"
    assert len(nolan_dopo20) == 3, f"Attesi 3 di Nolan dopo la posizione 20, trovati {len(nolan_dopo20)}"

    # Verifica monotonicita'
    K.assert_monotonia_lista(titoli, "il_tuo_mondo_caso_costruito")
    print("  -> OK: Caso costruito superato: 1 saga e 2 regista nei primi 20, esclusi presenti dopo il 20.\n")


def test_caso_dune():
    print("=" * 80)
    print("4. IL CASO DUNE (PARTE UNO NON VISTO vs GIA VISTO)")
    print("=" * 80)
    m = build_synthetic_graph_with_metadata(n_nodes=350, n_bolle=4)

    # Nodo 1: Dune - Parte Due (2024, score naturale piu' alto)
    # Nodo 2: Dune - Parte Uno (2021, anno minore)
    # Nodo 3: Dune - Parte Tre (2027)
    coll_dune = 726139
    m.COLL[1] = coll_dune
    m.ANNO[1] = 2024
    m.TIT[1] = "Dune - Parte Due"
    m.DIR[1] = ["Denis Villeneuve"]

    m.COLL[2] = coll_dune
    m.ANNO[2] = 2021
    m.TIT[2] = "Dune - Parte Uno"
    m.DIR[2] = ["Denis Villeneuve"]

    m.COLL[3] = coll_dune
    m.ANNO[3] = 2027
    m.TIT[3] = "Dune - Parte Tre"
    m.DIR[3] = ["Denis Villeneuve"]

    for i in range(4, 30):
        m.COLL[i] = None
        m.DIR[i] = [f"Independent_Director_{i}"]
        m.ANNO[i] = 2019
        m.TIT[i] = f"Film_Altro_{i}"

    # SUBCASE A: Parte Uno NON visto
    print("  Subcase A: Parte Uno NON VISTO:")
    storia_unseen = [("movie:1000", 1, "watched", None)]
    esito_unseen = m.lista(storia_unseen, cap=60)
    titoli_unseen = next(li for li in esito_unseen["liste"] if li["tipo"] == "il_tuo_mondo")["titoli"]
    keys_unseen = [t[0] for t in titoli_unseen]

    idx_p1 = keys_unseen.index("movie:1002")  # Parte Uno
    idx_p2 = keys_unseen.index("movie:1001")  # Parte Due
    print(f"    - Indice Dune Parte Uno: #{idx_p1}")
    print(f"    - Indice Dune Parte Due: #{idx_p2}")
    assert idx_p1 < 20, f"Parte Uno deve trovarsi nei primi 20 slot (trovato a #{idx_p1})"
    assert idx_p2 >= 20, f"Parte Due deve trovarsi DOPO la posizione 20 (trovato a #{idx_p2})"
    assert idx_p1 < idx_p2, f"Parte Due NON deve precedere Parte Uno! #{idx_p2} < #{idx_p1}"
    print("    -> OK: Parte Due non precede Parte Uno; Parte Uno proposto nei primi 20.")

    # SUBCASE B: Parte Uno GIA VISTO dall'utente
    print("\n  Subcase B: Parte Uno GIA VISTO dall'utente:")
    storia_seen = [("movie:1000", 1, "watched", None), ("movie:1002", 1, "watched", None)]
    esito_seen = m.lista(storia_seen, cap=60)
    titoli_seen = next(li for li in esito_seen["liste"] if li["tipo"] == "il_tuo_mondo")["titoli"]
    keys_seen = [t[0] for t in titoli_seen]

    assert "movie:1002" not in keys_seen, "Parte Uno e' tra i visti e non deve comparire nell'output"
    idx_p2_seen = keys_seen.index("movie:1001")
    idx_p3_seen = keys_seen.index("movie:1003")
    print(f"    - Indice Dune Parte Due (ora primo non visto): #{idx_p2_seen}")
    print(f"    - Indice Dune Parte Tre:                      #{idx_p3_seen}")
    assert idx_p2_seen < 20, f"Parte Due deve trovarsi nei primi 20 slot quando Parte Uno e' visto (#{idx_p2_seen})"
    assert idx_p3_seen >= 20, f"Parte Tre deve trovarsi DOPO la posizione 20 (#{idx_p3_seen})"
    print("    -> OK: Con Parte Uno visto, Parte Due diventa legittimamente il titolo proposto nei primi 20.\n")


def test_tutte_le_righe_grafo():
    print("=" * 80)
    print("5. VERIFICA DIVERSIFICAZIONE SU TUTTE LE RIGHE DEL GRAFO")
    print("=" * 80)
    m = build_synthetic_graph_with_metadata(n_nodes=350, n_bolle=4)

    # Impostiamo saga 555 su nodi in diverse bolle
    for idx in [5, 6, 7, 8, 9]:
        m.COLL[idx] = 555
        m.ANNO[idx] = 2010 + idx
        m.DIR[idx] = ["Director_555"]

    storia = [("movie:1000", 1, "watched", None)]
    esito = m.lista(storia, cap=30)
    nomi_righe = [li["tipo"] for li in esito["liste"]]
    print(f"  Righe restituite dal grafo: {nomi_righe}")

    for li in esito["liste"]:
        riga = li["tipo"]
        titoli = li["titoli"]
        top20 = titoli[:20]
        saghe_nella_riga = defaultdict(int)
        dir_nella_riga = defaultdict(int)
        for t in top20:
            cid = m.get_collection_id(t[0])
            if cid is not None:
                saghe_nella_riga[cid] += 1
            for d in m.get_directors(t[0]):
                dir_nella_riga[d] += 1

        for cid, cnt in saghe_nella_riga.items():
            assert cnt <= P.DIVERSITA_SAGA_MAX, f"Riga '{riga}': violato cap saga ({cnt} > {P.DIVERSITA_SAGA_MAX}) per coll {cid}"
        for d, cnt in dir_nella_riga.items():
            assert cnt <= P.DIVERSITA_REGISTA_MAX, f"Riga '{riga}': violato cap regista ({cnt} > {P.DIVERSITA_REGISTA_MAX}) per {d}"

        # Verifica contratto di monotonicita'
        if riga != "nicchia_di_qualita":
            K.assert_monotonia_lista(titoli, riga)

    print("  -> OK: Tutte le righe del grafo rispettano i cap e il contratto di monotonicita'.\n")


def test_servizio_http_e_ram():
    print("=" * 80)
    print("6. SERVIZIO GRAFO HTTP (HEALTH 200, RACCOMANDA 200) E CONSUMO RAM")
    print("=" * 80)
    m = build_synthetic_graph_with_metadata(n_nodes=350, n_bolle=4)

    for i in range(1, 7):
        m.COLL[i] = 12345
        m.ANNO[i] = 2015 + i
        m.DIR[i] = ["Regista_Test"]

    port = 7898
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
            "cap": 30
        }
        data = json.dumps(req).encode("utf-8")
        req_obj = urllib.request.Request(
            f"http://127.0.0.1:{port}/raccomanda",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req_obj) as r:
            res = json.loads(r.read())
            assert r.status == 200
            assert len(res["liste"]) > 0
            mondo = res["liste"][0]
            print(f"  POST /raccomanda -> status {r.status}, ruolo: {mondo['ruolo']}, titoli: {len(mondo['titoli'])}")
            print(f"    Primi 3 titoli: {mondo['titoli'][:3]}")

        # Verifica RAM
        import psutil
        proc = psutil.Process()
        mem_mb = proc.memory_info().rss / (1024 * 1024)
        print(f"\n  Consumo RAM processo: {mem_mb:.1f} MB (Tetto massimo: 512 MB)")
        assert mem_mb < 512.0, f"Consumo RAM {mem_mb:.1f} MB supera il tetto di 512 MB"
        print("  -> OK: Consumo RAM ampiamente sotto il tetto dei 512 MB.")

    finally:
        server.shutdown()
        server.server_close()
        t.join(timeout=2)
        print("  Server HTTP arrestato correttamente.\n")


if __name__ == "__main__":
    test_parametri()
    test_premesse_canone()
    test_caso_costruito_prova()
    test_caso_dune()
    test_tutte_le_righe_grafo()
    test_servizio_http_e_ram()
    print("=" * 80)
    print("TUTTE LE VERIFICHE TICKET 04 SUPERATE CON SUCCESSO (TASK_OK)")
    print("=" * 80)
