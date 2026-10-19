"""probe-ticket-02-watchlist.py — Sonda di verifica per il Ticket 02.

Verifica le 4 prove richieste dal ticket:
(a) Un titolo in watchlist non compare più in `il_tuo_mondo` per il solo fatto di essere in watchlist
(b) Il conteggio dei titoli da watchlist in uscita è <= 2 (regola di ripescaggio controllato)
(c) Con `library` a 1.0 il peso di un titolo in watchlist è <= a un `watched` (prima era 1.5, superiore)
(d) Verifica che PESO_TIPO si applica quando il peso esplicito non è inviato dal pool
"""
import sys
import pathlib
import numpy as np
import scipy.sparse as sp

# Aggiungi cartella services al path per importare graph.*
QUI = pathlib.Path(__file__).resolve().parent
ROOT = QUI.parents[1]
sys.path.insert(0, str(ROOT / "services"))

from graph import parametri as P
from graph import camminata as C
from graph import motore as MO
from graph import bubbles as B


def test_pesi_e_tipo():
    print("=" * 80)
    print("PROVA (c) e (d): PESO_TIPO, PESO_SEMI E CURVE BASE")
    print("=" * 80)

    # 1. Verifica PESO_TIPO["library"] == 1.0
    print(f"1. PESO_TIPO: {P.PESO_TIPO}")
    assert P.PESO_TIPO["library"] == 1.0, f"Atteso library == 1.0, trovato {P.PESO_TIPO['library']}"
    assert P.PESO_TIPO["watched"] == 1.0
    assert P.PESO_TIPO["liked"] == 2.0
    assert P.PESO_TIPO["loved"] == 3.0
    print("   -> OK: PESO_TIPO['library'] == 1.0 (prima era 1.5, cioe' superiore a watched).")

    # 2. Verifica camminata.pesi_semi per film (con NEP <= 1.0)
    # Film con plays: [1, 2, 3, 5]
    righe = np.array([0, 1, 2, 3], dtype=np.int64)
    plays = np.array([1, 2, 3, 5], dtype=float)
    nep = np.array([1.0, 1.0, 1.0, 1.0], dtype=np.float32)

    # Senza tipo (base): tetto film PESO_FILM_MAX = 3.0
    w_base = C.pesi_semi(righe, plays, nep)
    print(f"2. Pesi film base per plays=[1, 2, 3, 5]: {w_base.tolist()}")
    assert np.allclose(w_base, [1.0, 2.0, 3.0, 3.0]), f"Fallito tetto film: {w_base}"
    print("   -> OK: Tetto film min(plays, 3.0) attivo.")

    # Con tipi diversi
    tipi = ["library", "watched", "watched", "loved"]
    w_tipi = C.pesi_semi(righe, plays, nep, tipi=tipi)
    print(f"3. Pesi film combinati con tipi {tipi}: {w_tipi.tolist()}")
    # library con 1 play -> 1.0 * 1.0 = 1.0
    # watched con 2 plays -> 2.0 * 1.0 = 2.0 (superiore a library!)
    # watched con 3 plays -> 3.0 * 1.0 = 3.0
    # loved con 5 plays -> 3.0 * 3.0 = 9.0
    assert w_tipi[0] == 1.0  # library
    assert w_tipi[1] == 2.0  # watched con rewatch > library!
    assert w_tipi[0] <= w_tipi[1]
    print("   -> OK: Contributo library (1.0) <= watched con re-watch (2.0).")

    # 4. Verifica serie: curva 1 + 2*(plays/NEP)
    nep_serie = np.array([10.0, 10.0, 10.0, 10.0], dtype=np.float32)
    plays_serie = np.array([0, 5, 10, 20], dtype=float)
    tipi_serie = ["library", "watched", "watched", "liked"]
    w_serie = C.pesi_semi(righe, plays_serie, nep_serie, tipi=tipi_serie)
    print(f"4. Pesi serie: NEP=10, plays={plays_serie.tolist()}, tipi={tipi_serie}: {w_serie.tolist()}")
    # library (0 play o 1 play non visto) -> (1.0 + 2*0)*1.0 = 1.0
    # watched (5 episodi su 10) -> (1.0 + 2*0.5)*1.0 = 2.0
    # watched (10 episodi su 10) -> (1.0 + 2*1.0)*1.0 = 3.0
    # liked (10 episodi) -> 3.0 * 2.0 = 6.0
    assert w_serie[0] == 1.0
    assert w_serie[1] == 2.0
    assert w_serie[2] == 3.0
    assert w_serie[3] == 6.0
    print("   -> OK: Curva serie 1 + 2*(plays/NEP) applicata con moltiplicatore PESO_TIPO.")

    # 5. Verifica motore.pesi_semi quando pesi=None (opzione scelta: pool non manda pesi)
    # Creiamo un mock leggero di Motore
    motore = object.__new__(MO.Motore)
    motore.NEP = nep_serie
    w_motore_none = motore.pesi_semi(righe, plays_serie, tipi=tipi_serie, pesi=None)
    assert np.allclose(w_motore_none, w_serie)
    print("5. motore.pesi_semi con pesi=None: produce esattamente C.pesi_semi con PESO_TIPO.")
    print("   -> OK: Dimostrato che quando il pool omette 'peso', PESO_TIPO governa pienamente.")
    print()


def test_ripescaggio_e_liste():
    print("=" * 80)
    print("PROVA (a) e (b): RIPESCAGGIO WATCHLIST E ASSENZA AUTO-ILLUMINAZIONE")
    print("=" * 80)

    # Costruiamo un mini-grafo controllato a 25 nodi e 2 bolle:
    # Nodi 0..14 nella Bolla 0 (15 nodi)
    # Nodi 15..24 nella Bolla 1 (10 nodi)
    N = 25
    NB = 2

    data = []
    rows = []
    cols = []

    def add_edge(u, v, w):
        rows.append(u); cols.append(v); data.append(w)
        rows.append(v); cols.append(u); data.append(w)

    # Seme 0 (watched) diffonde fortemente su candidati non visti 2, 5, 6, 7, 8
    add_edge(0, 2, 8.0)
    add_edge(0, 5, 8.0)
    add_edge(0, 6, 7.0)
    add_edge(0, 7, 7.0)
    add_edge(0, 8, 6.0)
    add_edge(0, 9, 5.0)

    # Seme 0 diffonde fortemente su nodo 3 (library con VAVE=8.2 >= 7.0)
    add_edge(0, 3, 8.0)
    # Seme 0 diffonde fortemente su nodo 1 (library con VAVE=6.5 < 7.0)
    add_edge(0, 1, 8.0)

    # Nodo 4 (library con VAVE=8.5) è isolato: collegato solo debolmente a nodi periferici 13, 14
    add_edge(4, 13, 0.5)
    add_edge(13, 14, 1.0)
    add_edge(9, 10, 1.0)
    add_edge(10, 11, 1.0)
    add_edge(11, 12, 1.0)

    # Bolla 1 interna
    for b in range(15, 24):
        add_edge(b, b + 1, 2.0)

    W = sp.csr_matrix((data, (rows, cols)), shape=(N, N))
    deg = np.asarray(W.sum(1)).ravel()
    deg[deg <= 0] = 1.0
    Tr = sp.diags(1.0 / deg) @ W

    # Setup del motore sintetico
    m = object.__new__(MO.Motore)
    m.N = N
    m.NB = NB
    m.Tr = Tr
    m.MEM = np.array([0] * 15 + [1] * 10, dtype=np.int32)
    m.SZ = np.array([15, 10], dtype=np.int32)
    m.MEMBRI = [np.arange(0, 15, dtype=np.int32), np.arange(15, 25, dtype=np.int32)]
    m.VICINI = [np.array([1], dtype=np.int32), np.array([0], dtype=np.int32)]
    m.VAVE = np.full(N, 7.2, dtype=np.float32)
    m.VAVE[1] = 6.5  # library con VAVE < 7.0
    m.VAVE[3] = 8.2  # library con VAVE >= 7.0
    m.VAVE[4] = 8.5  # library con VAVE >= 7.0 ma isolato
    m.VOT = np.full(N, 1000.0, dtype=np.float32)
    m.VOTMED = np.array([1000.0, 1000.0], dtype=np.float32)
    m.POP = np.full(N, 50.0, dtype=np.float32)
    m.ANNO = np.full(N, 2020, dtype=np.int32)
    m.NEP = np.full(N, 1.0, dtype=np.float32) # movie
    m.COZY = np.zeros(N, dtype=np.float32)
    m.IMP = np.zeros(N, dtype=np.float32)
    m.QUOTA_TV = np.zeros(NB, dtype=np.float32)
    m.QUOTA_COZY = np.zeros(NB, dtype=np.float32)
    m.QUOTA_IMP = np.zeros(NB, dtype=np.float32)
    m.LISTDEG = np.zeros(N, dtype=np.float32)
    m.artefatto = "test-sha"

    # Mock modulo bubbles per mapping chiavi
    keys_mock = [f"movie:{100+i}" for i in range(N)]
    row_of_mock = {k: i for i, k in enumerate(keys_mock)}
    B.KEYS = keys_mock
    B.ROW_OF = row_of_mock
    B.IS_TV = np.zeros(N, dtype=bool)

    # Storia utente:
    # - Nodo 0: "watched" (plays=1)
    # - Nodo 1: "library" (VAVE=6.5, sotto soglia 7.0)
    # - Nodo 3: "library" (VAVE=8.2, collegato al seme 0 -> r_indotta alta)
    # - Nodo 4: "library" (VAVE=8.5, isolato -> r_indotta ~ 0)
    storia = [
        ("movie:100", 1, "watched", None),
        ("movie:101", 1, "library", None),
        ("movie:103", 1, "library", None),
        ("movie:104", 1, "library", None),
    ]

    esito = m.lista(storia, slider={"largo": 1}, cap=10, medium="movie")
    liste = esito["liste"]
    tuo_mondo = next((l for l in liste if l["tipo"] == "il_tuo_mondo"), None)
    assert tuo_mondo is not None, "il_tuo_mondo mancante!"

    titoli_tuo = [t[0] for t in tuo_mondo["titoli"]]
    print(f"Titoli usciti in 'il_tuo_mondo': {titoli_tuo}")

    # VERIFICA (a):
    # - Il nodo 4 (movie:104) è in watchlist ma isolato (r_indotta non nel top 15%):
    #   NON DEVE comparire per il solo fatto di essere in watchlist!
    assert "movie:104" not in titoli_tuo, "FALLIMENTO (a): movie:104 compare in output pur essendo isolato!"
    print("   -> OK (a): movie:104 (watchlist isolata) NON compare in il_tuo_mondo.")

    # - Il nodo 1 (movie:101) ha r_indotta alta ma VAVE = 6.5 (< 7.0):
    #   NON DEVE comparire!
    assert "movie:101" not in titoli_tuo, "FALLIMENTO: movie:101 con VAVE < 7.0 e' stato ripescato!"
    print("   -> OK: movie:101 con VAVE < 7.0 NON e' stato ripescato.")

    # - Il nodo 3 (movie:103) ha r_indotta nel top 15% E VAVE >= 7.0:
    #   DEVE essere ripescato nelle prime posizioni!
    assert "movie:103" in titoli_tuo, "FALLIMENTO: movie:103 idoneo non e' stato ripescato!"
    idx_3 = titoli_tuo.index("movie:103")
    assert idx_3 == 0, f"Atteso movie:103 nelle prime posizioni (idx 0), trovato a idx {idx_3}"
    print("   -> OK: movie:103 idoneo (r_indotta top 15% + VAVE >= 7.0) e' stato ripescato in testa.")

    # VERIFICA (b):
    # Conteggio totale di titoli da watchlist nell'intero output
    watchlist_set = {"movie:101", "movie:103", "movie:104"}
    totale_watchlist = sum(
        1 for li in liste for t in li["titoli"] if t[0] in watchlist_set
    )
    print(f"Conteggio totale titoli da watchlist usciti: {totale_watchlist}")
    assert totale_watchlist <= 2, f"FALLIMENTO (b): troppi titoli watchlist ({totale_watchlist} > 2)"
    print(f"   -> OK (b): Conteggio titoli watchlist in output ({totale_watchlist}) <= 2.")
    print()


def test_max_due_ripescaggi():
    print("=" * 80)
    print("PROVA (b): TETTO RIGIDO MAX 2 QUANDO 4 TITOLI WATCHLIST QUALIFICANO")
    print("=" * 80)

    N = 25
    NB = 2
    data = []
    rows = []
    cols = []

    def add_edge(u, v, w):
        rows.append(u); cols.append(v); data.append(w)
        rows.append(v); cols.append(u); data.append(w)

    # Nodo 0 (watched) diffonde su 4 nodi library (1, 2, 3, 4), tutti con VAVE >= 7.0
    for i in [1, 2, 3, 4]:
        add_edge(0, i, 10.0 - i)

    # E nodi candidati non visti 5..14
    for j in range(5, 15):
        add_edge(0, j, 2.0)

    # Bolla 1 interna
    for b in range(15, 24):
        add_edge(b, b + 1, 2.0)

    W = sp.csr_matrix((data, (rows, cols)), shape=(N, N))
    deg = np.asarray(W.sum(1)).ravel()
    deg[deg <= 0] = 1.0
    Tr = sp.diags(1.0 / deg) @ W

    m = object.__new__(MO.Motore)
    m.N = N
    m.NB = NB
    m.Tr = Tr
    m.MEM = np.array([0] * 15 + [1] * 10, dtype=np.int32)
    m.SZ = np.array([15, 10], dtype=np.int32)
    m.MEMBRI = [np.arange(0, 15, dtype=np.int32), np.arange(15, 25, dtype=np.int32)]
    m.VICINI = [np.array([1], dtype=np.int32), np.array([0], dtype=np.int32)]
    m.VAVE = np.full(N, 7.8, dtype=np.float32)  # tutti con VAVE >= 7.0
    m.VOT = np.full(N, 1000.0, dtype=np.float32)
    m.VOTMED = np.array([1000.0, 1000.0], dtype=np.float32)
    m.POP = np.full(N, 50.0, dtype=np.float32)
    m.ANNO = np.full(N, 2020, dtype=np.int32)
    m.NEP = np.full(N, 1.0, dtype=np.float32)
    m.COZY = np.zeros(N, dtype=np.float32)
    m.IMP = np.zeros(N, dtype=np.float32)
    m.QUOTA_TV = np.zeros(NB, dtype=np.float32)
    m.QUOTA_COZY = np.zeros(NB, dtype=np.float32)
    m.QUOTA_IMP = np.zeros(NB, dtype=np.float32)
    m.LISTDEG = np.zeros(N, dtype=np.float32)
    m.artefatto = "test-sha"

    keys_mock = [f"movie:{100+i}" for i in range(N)]
    B.KEYS = keys_mock
    B.ROW_OF = {k: i for i, k in enumerate(keys_mock)}
    B.IS_TV = np.zeros(N, dtype=bool)

    storia = [
        ("movie:100", 1, "watched", None),
        ("movie:101", 1, "library", None),
        ("movie:102", 1, "library", None),
        ("movie:103", 1, "library", None),
        ("movie:104", 1, "library", None),
    ]

    esito = m.lista(storia, slider={"largo": 1}, cap=10, medium="movie")
    liste = esito["liste"]
    tuo_mondo = next((l for l in liste if l["tipo"] == "il_tuo_mondo"), None)
    titoli_tuo = [t[0] for t in tuo_mondo["titoli"]]

    watchlist_in_uscita = [t for t in titoli_tuo if t in {"movie:101", "movie:102", "movie:103", "movie:104"}]
    print(f"Titoli watchlist qualificati (4 totali), usciti in il_tuo_mondo: {watchlist_in_uscita}")
    assert len(watchlist_in_uscita) == 2, f"Attesi esattamente 2 ripescati, trovati {len(watchlist_in_uscita)}"
    assert watchlist_in_uscita == ["movie:101", "movie:102"], f"Attesi i 2 con r_indotta maggiore (101 e 102), trovati {watchlist_in_uscita}"
    print("   -> OK (b): Tetto max 2 rigorosamente rispettato (selezionati i 2 con r_indotta maggiore).")
    print()


if __name__ == "__main__":
    test_pesi_e_tipo()
    test_ripescaggio_e_liste()
    test_max_due_ripescaggi()
    print("=" * 80)
    print("TUTTE LE VERIFICHE SUPERATE CON SUCCESSO (TASK_OK)")
    print("=" * 80)
