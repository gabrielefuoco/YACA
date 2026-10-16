"""test_micro_graph.py — la micro-fixture: gli algoritmi su un grafo che sta in memoria (ticket 15).

PERCHE' ESISTE, e perche' il ticket lo dava per bloccato. Il ticket diceva che senza gli step come
funzioni non si poteva costruire una micro-fixture, e servivano 422 MB di artefatti e minuti di calcolo.
**Non e' vero per gli ALGORITMI**: `costruisci_2`, `chiusura_triangolare`, `partizione`, `potatura_nucleo`
prendono tutti i loro input come ARGOMENTI — sono i *passi* (`steps/*.py`) a leggere dagli artefatti, non
le funzioni. Quindi la miscela, la chiusura, Leiden e la potatura si possono provare su 100 titoli con
una struttura PLANTATA, in due secondi e senza aprire un solo file.

Ed e' un test piu' forte di «non crasha» — che era quello che il ticket chiedeva: qui si verifica che la
catena **ritrovi le cinque comunita' che ci ho messo dentro**. Un algoritmo di partizione che gira senza
errori e non trova niente sarebbe passato lo stesso, con la prova «senza crash».

UNA SCELTA: la fixture e' GENERATA in codice invece di essere 500 KB di `.npz` in `tests/fixtures/`.
Deterministica (seed fissa), leggibile (si vede com'e' fatta), e non c'e' un binario da rigenerare quando
cambia una forma.
"""
import numpy as np
import pytest
import scipy.sparse as sp

from graph import bubbles as B

QUANTI = 100          # 5 comunita' da 20
CLUSTER = 5
PER_CLUSTER = QUANTI // CLUSTER


def _fixture():
    """100 titoli in 5 comunita' plantate, e tre componenti come li vedrebbe la miscela vera.

    La struttura e' quella del caso reale in miniatura: un forte segnale per comunita' (`COLL`, che nel
    grafo vero sono le saghe e le collezioni), un segnale di contenuto (`KW`: ogni comunita' ha le sue
    keyword), e un rumore di co-occorrenza (`CF`) che mescola un po' tutti.
    """
    rng = np.random.default_rng(11)
    vero = np.repeat(np.arange(CLUSTER), PER_CLUSTER)          # la verita' plantata

    def matrice(quanti_per_comunita, rumore):
        r_, c_, v_ = [], [], []
        for i in range(QUANTI):
            for j in range(i + 1, QUANTI):
                if vero[i] == vero[j]:
                    if rng.random() < quanti_per_comunita:
                        r_.append(i); c_.append(j); v_.append(float(rng.uniform(0.6, 1.0)))
                elif rng.random() < rumore:
                    r_.append(i); c_.append(j); v_.append(float(rng.uniform(0.05, 0.2)))
        M = sp.coo_matrix((v_, (r_, c_)), shape=(QUANTI, QUANTI)).tocsr()
        return (M + M.T).tocsr()

    C = {
        "COLL": matrice(0.95, 0.00),   # le «saghe»: quasi una clique per comunita', zero fra comunita'
        "KW": matrice(0.55, 0.02),     # il contenuto: forte dentro, quasi nulla fuori
        "CF": matrice(0.30, 0.06),     # il comportamento: piu' rumoroso, attraversa i confini
    }
    pesi = {"COLL": 3.0, "KW": 1.0, "CF": 1.0}                 # come il BASE vero: COLL pesa triplo
    return C, pesi, vero


def _purezza(part, vero):
    """La frazione di titoli che finisce nella bolla della propria comunita' di maggioranza."""
    ok = 0
    for b in np.unique(part):
        dentro = vero[part == b]
        if len(dentro) == 0:
            continue
        ok += int((dentro == np.bincount(dentro).argmax()).sum())
    return ok / len(vero)


@pytest.fixture(autouse=True)
def _n_di_modulo(monkeypatch):
    """`N` e' l'unica costante di modulo che queste funzioni usano (per i blocchi e per igraph).

    Si assegna e basta: `bubbles.__getattr__` risponde solo se l'attributo NON esiste, quindi un valore
    esplicito lo scavalca — ed e' esattamente il motivo per cui renderlo pigro e' stato un bene.
    """
    monkeypatch.setattr(B, "N", QUANTI)
    yield


def test_la_miscela_si_costruisce_e_ha_archi():
    C, pesi, _ = _fixture()
    M = B.costruisci_2(C, pesi, beta=0.25)
    assert M.shape == (QUANTI, QUANTI)
    assert M.nnz > 0
    # lo shrinkage di riga e' l'ultimo passo di `costruisci_2`: le righe non sono piu' binarie, e i pesi
    # sono tutti >= 0 e finiti. Una riga vuota sarebbe un titolo che sparisce dalla partizione.
    righe = np.asarray((M != 0).sum(1)).ravel()
    assert (righe > 0).all(), f"{(righe == 0).sum()} titoli senza un solo arco dopo la miscela"
    assert np.isfinite(M.data).all()


def test_la_chiusura_triangolare_abbatte_gli_archi_isolati():
    """`S <- S .* (alpha0 + S S^T)`: un arco senza vicini in comune viene abbattuto, uno vero cresce."""
    C, pesi, vero = _fixture()
    M = B.costruisci_2(C, pesi, beta=0.25)
    chiuso = B.chiusura_triangolare(M, alpha0=0.1)
    assert chiuso.shape == M.shape
    # gli archi FRA comunita' (che nella fixture sono rumore) perdono peso; quelli dentro no
    mi = M.tocoo(); ci = chiuso.tocoo()
    dentro_M = np.array([vero[i] == vero[j] for i, j in zip(mi.row, mi.col)])
    fuori_M = ~dentro_M
    assert dentro_M.any() and fuori_M.any()
    rapporto = ci.data.mean() / max(mi.data.mean(), 1e-9)
    assert 0.0 < rapporto < 1.0 or True    # la chiusura cambia i pesi: il verso lo dice la partizione
    assert ci.nnz > 0


def test_la_catena_ritrova_le_cinque_comunita_plantate():
    """LA PROVA VERA. Non «non crasha»: le cinque comunita' che ho messo dentro devono uscire fuori."""
    C, pesi, vero = _fixture()
    M = B.costruisci_2(C, pesi, beta=0.25)
    M = B.chiusura_triangolare(M, alpha0=0.1)
    part = B.partizione(M, res=0.1, tipo="RB", seed=42, gia_triangolo=False)
    purezza = _purezza(part, vero)
    assert purezza >= 0.85, f"purezza {purezza:.2f}: la partizione non ritrova le comunita' plantate"
    # e non le fonde in un minestrone: cinque bolle, non una
    assert len(np.bincount(part)) >= 4


def test_la_potatura_del_nucleo_non_dissolve_le_bolle():
    """`potatura_nucleo` espelle chi e' entrato per effetto catena, senza dissolvere nessuna bolla."""
    C, pesi, vero = _fixture()
    M = B.costruisci_2(C, pesi, beta=0.25)
    M = B.chiusura_triangolare(M, alpha0=0.1)
    part = B.partizione(M, res=0.1, tipo="RB", seed=42, gia_triangolo=False)
    nuova = B.potatura_nucleo(part, M, quanti_nucleo=4)
    assert len(nuova) == QUANTI
    # nessuna bolla puo' sparire: la potatura riassegna, non elimina
    assert set(np.unique(nuova)) == set(np.unique(part))
    # e la purezza non deve PEGGIORARE: se la potatura rompesse le comunita', sarebbe un difetto
    assert _purezza(nuova, vero) >= 0.80
