"""test_graph_pipeline.py — i contratti del modulo, in pochi secondi.

NON è la micro-fixture da 100 titoli che il ticket 15 chiedeva per intero: quella richiede che gli step
di `graph/steps/` siano chiamabili su un sottoinsieme, cioè il **ticket 14** (ancora da decidere con il
proprietario) — oggi gli step sono script a livello globale, e non si possono né importare né fermare a
100 titoli. Questa suite copre quello che si può coprire senza, e copre le due cose che più facilmente
si rompono in silenzio:

  1. **l'equivalenza delle nove varianti di diffusione**, ora unificate in `camminata.ppr` (ticket 07).
     Il test le riscrive come erano e verifica che la versione unica le riproduca *bit per bit*: è la
     prova del refactor, e resta come documentazione di quali varianti erano vere e quali no.
  2. **i contratti dell'artefatto che il prodotto legge** (`src/data/bolle.json`) e dei metadati del
     canone. Non sono test di comodo: sono le cose su cui `Bolle.js` costruisce, e se cambiano si vuole
     sapere — non scoprirlo dopo.

Cosa NON c'è, ed è dichiarato: la miscela, la chiusura triangolare, Leiden e la potatura al nucleo (i
passi 0–2 della costruzione) non si provano qui, perché non sono funzioni invocabili su un grafo piccolo.
"""
import json
import pathlib

import numpy as np
import pytest
import scipy.sparse as sp

from graph import camminata as C
from graph import canon as K
from graph import parametri as P

ROOT = pathlib.Path(__file__).resolve().parent.parent


# ------------------------------------------------------------------ 1. la diffusione, una volta sola

def _grafo_finto(n=60, semi=7):
    """Un grafo sparso deterministico, e un seme. Niente artefatti: si prova la matematica."""
    rng = np.random.default_rng(4)
    M = sp.random(n, n, density=0.05, random_state=4, format="csr").astype(np.float64)
    M = (M + M.T).tocsr()
    seme = rng.choice(n, size=semi, replace=False)
    pesi = rng.uniform(0.5, 6.0, size=semi)
    return C.transizione(M), seme, pesi


def test_ppr_riproduce_le_varianti_degli_arbitri():
    """Le nove copie erano quattro varianti. `camminata.ppr` le riproduce tutte, bit per bit.

    Le varianti vere, lette una per una dai nove file prima di cancellarle:
      · seme pesato con `pesi.sum()`      -> `alfa`, `soglia`, `liste`, `lettura`
      · seme pesato con `max(..., 1e-12)` -> `freddo`, `pesi`
      · seme UNIFORME `1/len(seme)`       -> `diffusione`
      · uscita normalizzata `r/r.sum()`   -> `ricetta` (e `diffondi`)
    """
    Tr, seme, pesi = _grafo_finto()
    for alpha in (0.15, 0.6, 0.9):
        for iters in (1, 5, 20):
            atteso = _a_mano(Tr, seme, pesi, alpha, iters, normalizza=False)
            np.testing.assert_array_equal(C.ppr(Tr, seme, pesi, alpha=alpha, iters=iters), atteso)
            atteso_norm = _a_mano(Tr, seme, pesi, alpha, iters, normalizza=True)
            np.testing.assert_array_equal(
                C.ppr(Tr, seme, pesi, alpha=alpha, iters=iters, normalizza=True), atteso_norm)


def _a_mano(Tr, seme, pesi, alpha, iters, normalizza):
    """Il ciclo com'era scritto in ognuna delle nove copie. È la stessa cosa, scritta di nuovo qui:
    se `camminata.ppr` cambia, questo test lo dice invece di lasciarlo passare."""
    e = np.zeros(Tr.shape[0], np.float64)
    e[seme] = np.asarray(pesi, np.float64) / max(float(np.sum(pesi)), 1e-12)
    r = e.copy()
    for _ in range(iters):
        r = alpha * e + (1 - alpha) * (r @ Tr)
    return r / r.sum() if normalizza else r


def test_ppr_seme_uniforme_e_il_caso_di_diffusione_py():
    Tr, seme, _ = _grafo_finto()
    e = np.zeros(Tr.shape[0], np.float64)
    e[seme] = 1.0 / len(seme)
    r = e.copy()
    for _ in range(9):
        r = 0.6 * e + (1 - 0.6) * (r @ Tr)
    np.testing.assert_array_equal(C.ppr(Tr, seme, None, alpha=0.6, iters=9), r)


def test_la_diffusione_del_motore_e_la_stessa_cosa():
    """`C.diffondi` non deve avere un ciclo suo: è `ppr` col seme costruito da `pesi_semi`."""
    Tr, seme, _ = _grafo_finto(n=40, semi=5)
    NEP = np.ones(Tr.shape[0], np.float32)
    NEP[seme[:2]] = 24.0
    plays = np.array([2, 30, 1, 1, 4])
    np.testing.assert_array_equal(
        C.diffondi(Tr, seme, plays, NEP, alpha=0.6, iters=15),
        C.ppr(Tr, seme, C.pesi_semi(seme, plays, NEP), alpha=0.6, iters=15, normalizza=True))


def test_il_ciclo_non_e_duplicato_da_nessuna_parte():
    """Il criterio di chiusura del ticket 07, in una riga: il ciclo esiste in UN posto solo."""
    testo = "\n".join((ROOT / "services" / "graph" / n).read_text(encoding="utf-8")
                      for n in ("camminata.py", "motore.py", "bubbles.py", "collocator.py", "canon.py"))
    for f in sorted((ROOT / "services" / "graph" / "measure").glob("*.py")):
        testo += f.read_text(encoding="utf-8")
    assert testo.count("r = alpha * e + (1 - alpha) * (r @ Tr)") == 1


# ------------------------------------------------------------------ 2. l'artefatto che il prodotto legge

@pytest.fixture(scope="module")
def bolle():
    p = K.DATA / "bolle.json"
    if not p.exists():
        p = ROOT / "src" / "data" / "bolle.json"
    if not p.exists():
        p = ROOT / "tests" / "fixtures" / "bolle_synth.json"
    if not p.exists():
        pytest.skip(
            "Nessun artefatto o fixture trovato (mancano services/graph/data/bolle.json e tests/fixtures/bolle_synth.json)"
        )
    return json.loads(p.read_text(encoding="utf-8"))


def test_le_righe_di_transizione_sono_normalizzate(bolle):
    """`P` è una riga stocastica: se non lo fosse, la diffusione del prodotto perderebbe massa.

    QUESTA TOLLERANZA ERA 5e-3, e allargarla è stato il modo in cui un bug si è nascosto per un giorno.
    L'export arrotondava a 4 decimali senza rinormalizzare e le righe si scostavano da 1 fino a 7e-4:
    io ho visto lo scostamento e ho scelto una tolleranza che lo accogliesse. Adesso l'export
    rinormalizza (e scarta i pesi nulli), quindi la tolleranza può essere quella vera.
    """
    peggiori = [abs(sum(w for _, w in v["P"]) - 1.0) for v in bolle["bolle"].values() if v["P"]]
    assert peggiori and max(peggiori) < 1e-9, f"riga peggiore: {max(peggiori)}"
    zeri = [(b, d) for b, v in bolle["bolle"].items() for d, w in v["P"] if w <= 0.0]
    assert not zeri, f"{len(zeri)} archi con peso nullo: {zeri[:3]}"


def test_i_membri_di_ogni_bolla_sono_il_suo_conteggio(bolle):
    conta = {}
    for _, b in bolle["titoli"].items():
        conta[b] = conta.get(b, 0) + 1
    for b, v in bolle["bolle"].items():
        assert conta.get(int(b), 0) == v["n"], f"bolla {b}: n={v['n']}, membri={conta.get(int(b), 0)}"


def test_gli_id_delle_bolle_sono_validi(bolle):
    n = len(bolle["bolle"])
    fuori = [k for k, b in bolle["titoli"].items() if not (0 <= b < n)]
    assert not fuori, f"{len(fuori)} titoli puntano a bolle inesistenti: {fuori[:3]}"


def test_ogni_bolla_ha_un_nome_o_e_dichiarata_piccola(bolle):
    """Le bolle con centroide hanno `termini`; le 575 piccole no, ed è la verità. Nessuna via di mezzo."""
    senza = [b for b, v in bolle["bolle"].items() if not v.get("termini")]
    for b in senza:
        assert bolle["bolle"][b]["n"] < 40, f"bolla {b} senza termini ma con {bolle['bolle'][b]['n']} titoli"
    assert len(senza) < 700, f"{len(senza)} bolle senza termini: erano 575"


# ------------------------------------------------------------------ 3. i metadati, coi numeri già noti

def test_i_metadati_riproducono_i_numeri_noti():
    """COZY 30.814 e IMP 8.279 sono le prevalenze scritte in `parametri.py`, NEP>1 = 16.529 è quella
    dell'artefatto delle serie: tre incroci indipendenti. Se si sfalsano, la ricostruzione ha perso
    qualcosa per strada — ed è esattamente quello che è successo quando i titoli erano un array `<U`
    da 41 MB invece di un file di righe."""
    try:
        m = K.metadati()
    except FileNotFoundError as e:
        pytest.skip(f"Dati completi del canone non presenti sul disco locale (richiesti ~138 MB in graph/data/): {e}")
    assert len(m["VOT"]) == 66_259
    assert int(m["COZY"].sum()) == 30_814
    assert int(m["IMP"].sum()) == 8_279
    assert int((m["NEP"] > 1).sum()) == 16_529
    assert (m["VOT"] > 0).sum() > 66_000


# ------------------------------------------------------------------ 4. i contratti di `canon` si accendono

def test_il_contratto_di_simmetria_protesta():
    A = sp.csr_matrix(np.array([[0.0, 1.0], [0.0, 0.0]]))
    with pytest.raises(Exception):
        K.assert_simmetrica(A, nome="prova", controlla=True)


def test_i_contratti_nuovi_protestano_sui_casi_corrotti():
    """Ogni contratto deve ACCENDERSI su un caso guasto: un contratto che non protesta mai non e' un
    contratto, e' un commento. Questi quattro nascono da errori veri del 16/10/2026."""
    # 1. massa: una riga che non somma a 1 (era il round a 4 decimali senza rinormalizzazione)
    R = sp.csr_matrix(np.array([[0.5, 0.4993], [0.0, 1.0]]))
    with pytest.raises(Exception):
        K.assert_stocastica(R, nome="prova", tol=1e-9, controlla=True)
    # 2. tempo: eta' in giorni da oggi, il passato ha eta' PIU' GRANDE
    with pytest.raises(Exception):
        K.assert_split_temporale(np.array([2.0, 3.0]), np.array([400.0, 500.0]), controlla=True)
    K.assert_split_temporale(np.array([400.0, 500.0]), np.array([2.0, 3.0]), controlla=True)
    # 3. allineamento: un array slittato di una riga
    with pytest.raises(Exception):
        K.assert_lunghezza_canone(np.array([1.0, 2.0, 3.0]), "prova", atteso=66_259, controlla=True)
    # 4. ordine: una lista "ordinata per attivazione" che non lo e'
    with pytest.raises(Exception):
        K.assert_monotonia_lista([("a", 0.1), ("b", 0.9)], "prova", controlla=True)
    K.assert_monotonia_lista([("a", 0.9), ("b", 0.1)], "prova", controlla=True)


def test_il_contratto_di_ordine_protesta_col_verso_sbagliato():
    """È il bug che è stato fatto TRE volte in una sera: `argsort(argsort(v))` è ASCENDENTE, quindi
    ordina per primi i valori più bassi.

    ATTENZIONE al verso, che ho sbagliato scrivendo questo test: `atteso_positivo=False` è il caso
    normale — `ordine[0]` è il MIGLIORE, quindi il rango correla NEGATIVAMENTE col punteggio. Con
    `atteso_positivo=True` (che chiederebbe al migliore di avere il punteggio più basso) un ordine
    rovesciato risulta perfettamente correlato e il contratto non ha niente da protestare — giustamente.
    """
    valori = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
    sbagliato = np.argsort(np.argsort(valori))        # crescente: il peggiore per primo
    with pytest.raises(Exception):
        K.assert_ordine(sbagliato, valori, nome="prova", atteso_positivo=False, controlla=True)
    giusto = np.argsort(-valori)                      # decrescente: il migliore per primo
    K.assert_ordine(giusto, valori, nome="prova", atteso_positivo=False, controlla=True)


def test_le_costanti_dei_parametri_hanno_una_sola_fonte():
    """`camminata` legge da `parametri`: se qualcuno scrive un numero a mano, questo test non lo prende —
    ma prende il caso in cui il valore non esista più."""
    assert 0.0 < P.ALPHA < 1.0
    assert P.ITER >= 1
    assert P.PESO_FILM_MAX >= 1
    assert P.DELTA_FASCIA > 0


# ------------------------------------------------------------------ 5. il DAG della costruzione

from graph import pipeline as PIPE   # noqa: E402  (serve il modulo intero, non una sua parte)


def _catena_finta():
    """Tre passi finti che si passano i file come quelli veri. Serve a provare la PROPAGAZIONE."""
    return [
        {"nome": "a", "cmd": [], "env": {}, "legge": [], "scrive": ["04-trama-qwen3b.npy"],
         "params": ["MOD_EMBEDDING"], "tempo": ""},
        {"nome": "b", "cmd": [], "env": {}, "legge": ["04-trama-qwen3b.npy"],
         "scrive": ["eterogeneo-TRAMA.npz"], "params": [], "tempo": ""},
        {"nome": "c", "cmd": [], "env": {}, "legge": ["eterogeneo-TRAMA.npz"],
         "scrive": ["mappa-finale-6-2.npz"], "params": [], "tempo": ""},
        {"nome": "isolato", "cmd": [], "env": {}, "legge": [],
         "scrive": ["bolle-eterogeneo-subvoti.npy"], "params": [], "tempo": ""},
    ]


def test_il_piano_rifa_tutto_quando_il_manifest_e_vuoto():
    p = PIPE.piano({}, _catena_finta())
    assert all(d["da_fare"] for d in p.values())
    assert "mai eseguito" in p["a"]["motivi"]


def test_il_piano_non_rifa_niente_quando_e_tutto_in_ordine():
    finte = _catena_finta()
    p = PIPE.piano({n["nome"]: {"stato": PIPE.stato_di(n)} for n in finte}, finte)
    assert not any(d["da_fare"] for d in p.values()), p


def test_un_parametro_cambiato_si_propaga_a_valle_e_non_ai_laterali():
    """E' IL CASO DEL 15/10/2026: un artefatto rigenerato e gli altri no. La propagazione e' PER FILE,
    quindi il passo che legge l'uscita di `a` e' sporco, e quello che non la legge no."""
    finte = _catena_finta()
    man = {n["nome"]: {"stato": PIPE.stato_di(n)} for n in finte}
    man["a"]["stato"]["parametri"]["MOD_EMBEDDING"] = "un-altro-modello"
    p = PIPE.piano(man, finte)
    assert p["a"]["da_fare"] and any("parametro cambiato" in m for m in p["a"]["motivi"])
    assert p["b"]["da_fare"] and any("a monte a" in m for m in p["b"]["motivi"])
    assert p["c"]["da_fare"] and any("a monte" in m for m in p["c"]["motivi"])
    assert not p["isolato"]["da_fare"], "un passo che non legge niente di a non c'entra: e' un falso positivo"


def test_un_uscita_riscritta_fuori_da_qui_e_dichiarata_tale():
    """LA TRAPPOLA DELLA PARTIZIONE, in una riga di piano: se l'uscita di un passo non e' piu' quella
    che il passo aveva scritto, qualcuno l'ha rigenerata altrove — e non e' un dettaglio."""
    finte = _catena_finta()
    man = {n["nome"]: {"stato": PIPE.stato_di(n)} for n in finte}
    man["isolato"]["stato"]["uscite"]["bolle-eterogeneo-subvoti.npy"] = "un-altro-hash"
    p = PIPE.piano(man, finte)
    assert p["isolato"]["da_fare"]
    assert any("RISCRITTA FUORI DA QUI" in m for m in p["isolato"]["motivi"])


def test_il_dag_vero_e_in_ordine_topologico():
    """L'ordine della tabella E' l'ordine dei passi: se un passo leggesse l'uscita di uno che viene dopo,
    la propagazione lo ignorerebbe e il piano mentirebbe. Questo test lo dice subito."""
    for i, p in enumerate(PIPE.PASSO):
        for q in PIPE.PASSO[i + 1:]:
            suoi = {f.name for pat in p["legge"] for f in PIPE._file_di(pat)}
            dopo = {f.name for pat in q["scrive"] for f in PIPE._file_di(pat)}
            assert not (suoi & dopo), (f"{p['nome']} legge {sorted(suoi & dopo)}, "
                                       f"che {q['nome']} scrive ma viene DOPO: ordine sbagliato")
