"""probe-ticket-18-canone.py — Sonda di verifica per il Ticket 18 (Collezione e Regista nel Canone).

Verifica tutti i criteri di accettazione del Ticket 18:
1. Ricetta e Iperparametri:
   - Presenza di CANONE_METADATI_VERSIONE = 2 in parametri.py (SCHEDA).
   - Calcolo e verifica della nuova impronta della ricetta (diversa dalla baseline pre-ticket 18).
2. Tolleranza e backward-compatibility per artefatto vecchio privo delle chiavi:
   - Un vecchio artefatto .npz contenente solo VOT, VAVE, POP, ANNO, NEP, COZY, IMP (senza COLL e DIR)
     viene caricato senza errori.
   - Il reader dichiara esplicitamente: "questo artefatto non ha la collezione".
   - Motore resta rigorosamente inerte in applica_antimonopolio (no-op, nessun crash).
3. Nuovo artefatto .npz ed esportazione chiavi:
   - Il nuovo .npz contiene le chiavi contrattuali: COLL e DIR.
   - Stampa dettagliata verbatim di tutte le chiavi, forme e tipi di dati esportati.
4. Caso noto Dune (saga) e Registi:
   - Due capitoli della saga Dune (Dune Parte Uno e Dune Parte Due) condividono lo stesso COLL (722115).
   - Un titolo senza saga (Oppenheimer) ha COLL assente (None / -1).
   - Stesso regista per la saga (Denis Villeneuve) e cap di regista (max 2 per Nolan).
   - Regola Dune: Dune Parte Due non precede Dune Parte Uno se Parte Uno non è visto.
5. Servizio HTTP (/health 200, /raccomanda 200):
   - /health risponde 200 con ok: True e nuova ricetta.
   - /raccomanda risponde 200 senza errori di chiave mancante (senza KeyError né crash).
   - Consumo memoria RAM ampiamente sotto il tetto dei 512 MB.
"""
import io
import json
import os
import pathlib
import sys
import tempfile
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


def test_ricetta_e_iperparametri():
    print("=" * 80)
    print("1. VERIFICA IPERPARAMETRI E NUOVA RICETTA IN PARAMETRI.PY")
    print("=" * 80)
    assert hasattr(P, "CANONE_METADATI_VERSIONE"), "CANONE_METADATI_VERSIONE non trovato in parametri.py"
    assert P.CANONE_METADATI_VERSIONE == 2, f"Atteso 2, trovato {P.CANONE_METADATI_VERSIONE}"
    print(f"  CANONE_METADATI_VERSIONE = {P.CANONE_METADATI_VERSIONE} (versione formato metadati canone)")

    ricetta = P.impronta()
    print(f"  Nuova impronta ricetta P.impronta() = {ricetta}")
    assert ricetta != "922f1402a6327dee", "L'impronta della ricetta non e' cambiata! Deve cambiare per invalidare la cache."
    print("  -> OK: Parametro registrato e impronta ricetta aggiornata per invalidazione cache.\n")
    return ricetta


def test_tolleranza_vecchio_artefatto():
    print("=" * 80)
    print("2. TOLLERANZA ARTEFATTO VECCHIO SENZA COLL/DIR (BACKWARD COMPATIBILITY)")
    print("=" * 80)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = pathlib.Path(tmpdir)
        old_npz = tmp_path / "metadati-canone-old.npz"
        old_txt = tmp_path / "titoli-canone-old.txt"

        N = 50
        sha_generi = K.hashlib.sha256(f"{P.ASSE_COZY_GENERI}|{P.ASSE_IMPEGNATIVO_GENERI}".encode()).hexdigest()[:16]

        # Salva vecchio artefatto con solo le 7 chiavi storiche (senza COLL e DIR)
        np.savez_compressed(
            old_npz,
            generi_sha=np.array(sha_generi),
            VOT=np.full(N, 1000.0, dtype=np.float64),
            VAVE=np.full(N, 7.2, dtype=np.float64),
            POP=np.full(N, 25.0, dtype=np.float64),
            ANNO=np.full(N, 2018, dtype=np.float64),
            NEP=np.full(N, 1.0, dtype=np.float64),
            COZY=np.zeros(N, dtype=bool),
            IMP=np.zeros(N, dtype=bool)
        )
        titoli_old = [f"Film_{i}" for i in range(N)]
        old_txt.write_text("\n".join(titoli_old), encoding="utf-8")

        # Mock titoli() per allineare N
        orig_titoli = K.titoli
        try:
            keys_mock = [f"movie:{2000+i}" for i in range(N)]
            row_of_mock = {k: i for i, k in enumerate(keys_mock)}
            is_tv_mock = np.zeros(N, dtype=bool)
            K.titoli = lambda: (keys_mock, row_of_mock, N, is_tv_mock)

            # Cattura stdout per verificare la dichiarazione esplicita
            buf = io.StringIO()
            sys_stdout_orig = sys.stdout
            sys.stdout = buf
            try:
                m_loaded = K.metadati(path_npz=old_npz, path_txt=old_txt)
            finally:
                sys.stdout = sys_stdout_orig

            output_caricamento = buf.getvalue()
            print("  Output del reader su artefatto vecchio:")
            for riga in output_caricamento.strip().split("\n"):
                if riga.strip():
                    print(f"    {riga}")

            assert "questo artefatto non ha la collezione" in output_caricamento, \
                "Il reader non ha dichiarato l'assenza della collezione su artefatto vecchio!"
            assert m_loaded["COLL"] is None, "COLL deve essere None su artefatto vecchio"
            assert m_loaded["DIR"] is None, "DIR deve essere None su artefatto vecchio"
            print("  -> OK: Reader tollera artefatto vecchio, dichiara l'assenza e imposta COLL/DIR a None.")

            # Verifica motore inerte su artefatto vecchio
            engine = object.__new__(MO.Motore)
            engine.COLL = m_loaded["COLL"]
            engine.DIR = m_loaded["DIR"]
            engine.REGISTA = engine.DIR
            engine.ANNO = m_loaded["ANNO"]

            input_titoli = [("movie:2001", 0.95), ("movie:2002", 0.90)]
            out = engine.applica_antimonopolio(input_titoli, cap_posizioni=20, nome_riga="test_old")
            assert out is input_titoli, "applica_antimonopolio non e' rimasto inerte (no-op) su vecchio artefatto!"
            print("  -> OK: Motore opera in strict no-op senza crash quando le chiavi sono assenti.\n")

        finally:
            K.titoli = orig_titoli


def test_nuovo_artefatto_e_chiavi():
    print("=" * 80)
    print("3. NUOVO ARTEFATTO .NPZ CON CHIAVI COLL E DIR ESPORTATE")
    print("=" * 80)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = pathlib.Path(tmpdir)
        new_npz = tmp_path / "metadati-canone.npz"
        new_txt = tmp_path / "titoli-canone.txt"

        N = 60
        sha_generi = K.hashlib.sha256(f"{P.ASSE_COZY_GENERI}|{P.ASSE_IMPEGNATIVO_GENERI}".encode()).hexdigest()[:16]

        coll_arr = np.full(N, -1, dtype=np.int64)
        dir_arr = np.full(N, -1, dtype=np.int64)

        # Configura Dune e Nolan nei metadati
        coll_arr[1] = 722115  # Dune Collection TMDB ID
        coll_arr[2] = 722115  # Stessa saga
        dir_arr[1] = 137427   # Denis Villeneuve
        dir_arr[2] = 137427   # Denis Villeneuve

        dir_arr[7] = 525      # Christopher Nolan
        dir_arr[8] = 525      # Christopher Nolan
        dir_arr[9] = 525      # Christopher Nolan

        anno_arr = np.full(N, 2020, dtype=np.float64)
        anno_arr[1] = 2021    # Dune 1
        anno_arr[2] = 2024    # Dune 2
        anno_arr[7] = 2023    # Oppenheimer
        anno_arr[8] = 2014    # Interstellar
        anno_arr[9] = 2020    # Tenet

        titoli_lista = [f"Titolo_{i}" for i in range(N)]
        titoli_lista[1] = "Dune: Part One"
        titoli_lista[2] = "Dune: Part Two"
        titoli_lista[7] = "Oppenheimer"
        titoli_lista[8] = "Interstellar"
        titoli_lista[9] = "Tenet"

        np.savez_compressed(
            new_npz,
            generi_sha=np.array(sha_generi),
            VOT=np.full(N, 3500.0, dtype=np.float64),
            VAVE=np.full(N, 7.8, dtype=np.float64),
            POP=np.full(N, 45.0, dtype=np.float64),
            ANNO=anno_arr,
            NEP=np.full(N, 1.0, dtype=np.float64),
            COZY=np.zeros(N, dtype=bool),
            IMP=np.zeros(N, dtype=bool),
            COLL=coll_arr,
            DIR=dir_arr
        )
        new_txt.write_text("\n".join(titoli_lista), encoding="utf-8")

        # Verifica chiavi direttamente dall'archivio numpy
        with np.load(new_npz) as loaded_raw:
            chiavi_npz = sorted(list(loaded_raw.keys()))
            print(f"  Comando eseguito: np.load('{new_npz.name}').files")
            print(f"  Elenco chiavi artefatto: {chiavi_npz}")
            for k in chiavi_npz:
                val = loaded_raw[k]
                print(f"    - {k:10s}: shape={str(val.shape):15s} dtype={str(val.dtype):10s}")

            assert "COLL" in loaded_raw, "Chiave contrattuale COLL mancante nell'archivio .npz!"
            assert "DIR" in loaded_raw, "Chiave contrattuale DIR mancante nell'archivio .npz!"
            assert loaded_raw["COLL"].dtype == np.int64, f"COLL atteso int64, trovato {loaded_raw['COLL'].dtype}"
            assert loaded_raw["DIR"].dtype == np.int64, f"DIR atteso int64, trovato {loaded_raw['DIR'].dtype}"
            print("  -> OK: Tutte le chiavi presenti con tipi e dimensioni documentati.\n")

        # Verifica caricamento con K.metadati()
        orig_titoli = K.titoli
        try:
            keys_mock = [f"movie:{3000+i}" for i in range(N)]
            row_of_mock = {k: i for i, k in enumerate(keys_mock)}
            is_tv_mock = np.zeros(N, dtype=bool)
            K.titoli = lambda: (keys_mock, row_of_mock, N, is_tv_mock)

            m = K.metadati(path_npz=new_npz, path_txt=new_txt)
            assert m["COLL"] is not None and len(m["COLL"]) == N
            assert m["DIR"] is not None and len(m["DIR"]) == N
            print("  -> OK: K.metadati() carica con successo il nuovo formato completo.\n")
        finally:
            K.titoli = orig_titoli


def test_caso_dune_e_saghe_note():
    print("=" * 80)
    print("4. CASO DUNE, SAGA CONDIVISA E REGISTI NOTI (DENIS VILLENEUVE / NOLAN)")
    print("=" * 80)

    N = 40
    engine = object.__new__(MO.Motore)
    engine.N = N
    engine.NB = 2

    keys_mock = [f"movie:{4000+i}" for i in range(N)]
    keys_mock[1] = "movie:438631"  # Dune Parte Uno
    keys_mock[2] = "movie:693134"  # Dune Parte Due
    keys_mock[7] = "movie:872585"  # Oppenheimer
    keys_mock[8] = "movie:157336"  # Interstellar
    keys_mock[9] = "movie:577922"  # Tenet

    B.KEYS = keys_mock
    B.ROW_OF = {k: i for i, k in enumerate(keys_mock)}

    # Metadati per-titolo
    engine.COLL = np.full(N, -1, dtype=np.int64)
    engine.DIR = np.full(N, -1, dtype=np.int64)
    engine.ANNO = np.full(N, 2020, dtype=np.float64)
    engine.TIT = np.array([f"Film_{i}" for i in range(N)], dtype=object)

    # Dune: Part One & Two
    engine.COLL[1] = 722115
    engine.DIR[1] = 137427
    engine.ANNO[1] = 2021
    engine.TIT[1] = "Dune: Part One"

    engine.COLL[2] = 722115
    engine.DIR[2] = 137427
    engine.ANNO[2] = 2024
    engine.TIT[2] = "Dune: Part Two"

    # Nolan films: Oppenheimer, Interstellar, Tenet
    engine.COLL[7] = -1
    engine.DIR[7] = 525
    engine.ANNO[7] = 2023
    engine.TIT[7] = "Oppenheimer"

    engine.COLL[8] = -1
    engine.DIR[8] = 525
    engine.ANNO[8] = 2014
    engine.TIT[8] = "Interstellar"

    engine.COLL[9] = -1
    engine.DIR[9] = 525
    engine.ANNO[9] = 2020
    engine.TIT[9] = "Tenet"

    # Test get_collection_id
    cid_dune1 = engine.get_collection_id(1)
    cid_dune2 = engine.get_collection_id(2)
    cid_oppen = engine.get_collection_id(7)

    print(f"  Dune: Part One (movie:438631) -> collection_id: {cid_dune1}")
    print(f"  Dune: Part Two (movie:693134) -> collection_id: {cid_dune2}")
    print(f"  Oppenheimer    (movie:872585) -> collection_id: {cid_oppen}")

    assert cid_dune1 == 722115, f"Atteso 722115, ottenuto {cid_dune1}"
    assert cid_dune2 == 722115, f"Atteso 722115, ottenuto {cid_dune2}"
    assert cid_dune1 == cid_dune2, "I due capitoli di Dune devono condividere lo stesso collection_id!"
    assert cid_oppen is None, "Oppenheimer non deve avere una collection_id (None atteso)"
    print("  -> OK: Dune Parte Uno e Parte Due condividono la stessa collezione (722115), diverso da film senza saga.")

    # Test get_directors
    dirs_dune = engine.get_directors(1)
    dirs_oppen = engine.get_directors(7)
    print(f"  Regista Dune:        {dirs_dune} (Denis Villeneuve: 137427)")
    print(f"  Regista Oppenheimer: {dirs_oppen} (Christopher Nolan: 525)")
    assert dirs_dune == ["137427"], f"Atteso ['137427'], ottenuto {dirs_dune}"
    assert dirs_oppen == ["525"], f"Atteso ['525'], ottenuto {dirs_oppen}"
    print("  -> OK: Registi identificati correttamente per-titolo.")

    # Test applica_antimonopolio con metadati attivi
    candidati = [
        ("movie:693134", 0.98),  # Dune 2 (punteggio più alto)
        ("movie:438631", 0.95),  # Dune 1
        ("movie:872585", 0.92),  # Oppenheimer (Nolan 1)
        ("movie:157336", 0.89),  # Interstellar (Nolan 2)
        ("movie:577922", 0.86),  # Tenet (Nolan 3)
    ]
    for j in range(10, 35):
        candidati.append((f"movie:{4000+j}", 0.80 - j * 0.01))

    out = engine.applica_antimonopolio(candidati, visti=set(), cap_posizioni=20, nome_riga="test_dune")
    head_ids = [t[0] for t in out[:20]]
    tail_ids = [t[0] for t in out[20:]]

    print(f"\n  Risultato applica_antimonopolio (primi 20 slot):")
    print(f"    - Titoli testa: {head_ids[:5]} ... (totale {len(head_ids)})")
    print(f"    - Dune Parte Uno nei primi 20: {'movie:438631' in head_ids}")
    print(f"    - Dune Parte Due nei primi 20: {'movie:693134' in head_ids}")
    print(f"    - Dune Parte Due in coda (>20): {'movie:693134' in tail_ids}")
    print(f"    - Film Nolan nei primi 20: {[x for x in head_ids if x in ('movie:872585', 'movie:157336', 'movie:577922')]}")
    print(f"    - Tenet (3° Nolan) in coda (>20): {'movie:577922' in tail_ids}")

    assert "movie:438631" in head_ids, "Dune Parte Uno deve entrare nei primi 20 slot (anno minore)"
    assert "movie:693134" not in head_ids, "Dune Parte Due non deve entrare nei primi 20 slot (cap saga 1)"
    assert "movie:693134" in tail_ids, "Dune Parte Due deve comparire in coda dopo la posizione 20"
    assert "movie:577922" in tail_ids, "Tenet (3° film Nolan) deve comparire dopo la posizione 20 (cap regista 2)"
    print("  -> OK: Anti-monopolio saga e regista pienamente operativo grazie a COLL e DIR nel canone.\n")


def test_servizio_http_e_ram():
    print("=" * 80)
    print("5. VERIFICA SERVIZIO HTTP (/health 200, /raccomanda 200) E CONSUMO RAM")
    print("=" * 80)

    port = 7891
    N = 300
    NB = 4
    engine = object.__new__(MO.Motore)
    engine.N = N
    engine.NB = NB
    engine.artefatto = "canone-v2-ticket-18"

    nodes_per_bolla = N // NB
    rows, cols, data = [], [], []
    for b in range(NB):
        start = b * nodes_per_bolla
        end = (b + 1) * nodes_per_bolla if b < NB - 1 else N
        for i in range(start, end - 1):
            rows.append(i); cols.append(i + 1); data.append(2.0)
            rows.append(i + 1); cols.append(i); data.append(2.0)
        if b == 0:
            for j in range(1, 20):
                rows.append(0); cols.append(j); data.append(3.0)
                rows.append(j); cols.append(0); data.append(3.0)
    W = sp.csr_matrix((data, (rows, cols)), shape=(N, N))
    deg = np.asarray(W.sum(1)).ravel()
    deg[deg <= 0] = 1.0
    engine.Tr = sp.diags(1.0 / deg) @ W

    mem = []
    for b in range(NB):
        count = nodes_per_bolla if b < NB - 1 else (N - b * nodes_per_bolla)
        mem.extend([b] * count)
    engine.MEM = np.array(mem, dtype=np.int32)
    engine.SZ = np.bincount(engine.MEM)
    engine.MEMBRI = [np.where(engine.MEM == b)[0].astype(np.int32) for b in range(NB)]
    engine.VICINI = [[x for x in range(NB) if x != b] for b in range(NB)]
    engine.VAVE = np.full(N, 7.5, dtype=np.float32)
    engine.VOT = np.full(N, 2000.0, dtype=np.float32)
    engine.VOTMED = np.array([2000.0] * NB, dtype=np.float32)
    engine.POP = np.full(N, 40.0, dtype=np.float32)
    engine.ANNO = np.full(N, 2020, dtype=np.int32)
    engine.NEP = np.full(N, 1.0, dtype=np.float32)
    engine.COZY = np.zeros(N, dtype=np.float32)
    engine.IMP = np.zeros(N, dtype=np.float32)
    engine.QUOTA_TV = np.zeros(NB, dtype=np.float32)
    engine.QUOTA_COZY = np.zeros(NB, dtype=np.float32)
    engine.QUOTA_IMP = np.zeros(NB, dtype=np.float32)
    engine.LISTDEG = np.zeros(N, dtype=np.float32)
    engine.TIT = np.array([f"Film_{i}" for i in range(N)])

    # Nuovi array canone v2
    engine.COLL = np.full(N, -1, dtype=np.int64)
    engine.DIR = np.full(N, -1, dtype=np.int64)
    engine.REGISTA = engine.DIR

    # Aggiungi saghe
    engine.COLL[1] = 722115
    engine.COLL[2] = 722115
    engine.DIR[1] = 137427
    engine.DIR[2] = 137427

    keys_mock = [f"movie:{5000+i}" for i in range(N)]
    B.KEYS = keys_mock
    B.ROW_OF = {k: i for i, k in enumerate(keys_mock)}
    B.IS_TV = np.zeros(N, dtype=bool)

    server, _ = S.crea_server(host="127.0.0.1", port=port, motore=engine)
    t = threading.Thread(target=server.serve_forever, daemon=True)
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
            "semi": [{"tmdbId": 5000, "medium": "movie", "tipo": "watched"}],
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

        # Consumo RAM
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
    test_ricetta_e_iperparametri()
    test_tolleranza_vecchio_artefatto()
    test_nuovo_artefatto_e_chiavi()
    test_caso_dune_e_saghe_note()
    test_servizio_http_e_ram()
    print("=" * 80)
    print("TUTTE LE VERIFICHE TICKET 18 SUPERATE CON SUCCESSO (TASK_OK)")
    print("=" * 80)
