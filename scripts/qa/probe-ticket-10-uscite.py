"""probe-ticket-10-uscite.py — Sonda del Ticket 10 («nuove uscite per te»: il bug e la riparazione).

Il difetto ha tre cause; questa sonda le affronta una per una, senza mai dipendere dai Parquet veri (che
in CI non ci sono):

1. **il canone è storico**: sul fixture non esiste un titolo 2025+, e la riga «prima» è vuota — ma
   **dichiarata**, con fonte e conteggi (dal Ticket 07 non sparisce più in silenzio);
2. **l'imbuto** guarda solo le bolle del profilo: qui si prova che il bacino è `bolle ∪ vicini` e che un
   titolo in un mondo non acceso non entra;
3. **la cache**: si costruisce una cache con un collocatore **finto** (nessun artefatto), la si salva e la
   si ricarica; a runtime la riga si riempie con titoli **realmente recenti**, ordinati per
   `attivazione × confidenza × qualità`.

In più: i pavimenti permissivi del builder mordono (pochi voti, voto basso, titolo vecchio), la confidenza
non è ignorata, la qualità bayesiana preferisce i titoli con più voti, e una cache assente non fa esplodere
niente.
"""
import json
import pathlib
import sys
import tempfile

import numpy as np
import pandas as pd

QUI = pathlib.Path(__file__).resolve().parent
ROOT = QUI.parents[1]
sys.path.insert(0, str(ROOT / "services"))

from graph import bubbles as B  # noqa: E402
from graph import canon as K  # noqa: E402
from graph import parametri as P  # noqa: E402
from graph import servizio as S  # noqa: E402
from graph import uscite as U  # noqa: E402

exec(open(QUI / "probe-ticket-09-punti-incontro.py").read().split("def main(")[0])  # noqa: S102


def dataframe(chiavi, date, voti, voti_medi):
    """Un DataFrame TMDB in miniatura: le colonne che servono al builder e i campi del collocatore."""
    tipi = [c.split(":")[0] for c in chiavi]
    ids = [int(c.split(":")[1]) for c in chiavi]
    return pd.DataFrame({
        "id": ids,
        "vote_count": voti,
        "vote_average": voti_medi,
        "title": [f"Nuovo {i}" for i in ids],
        "name": [f"Nuova {i}" for i in ids],
        "release_date": date,
        "first_air_date": date,
        "keywords": ["[]"] * len(ids),
        "genres": ["[]"] * len(ids),
        "networks": ["[]"] * len(ids),
        "production_companies": ["[]"] * len(ids),
        "production_countries": ["[]"] * len(ids),
        "original_language": ["it"] * len(ids),
        "cast": ["[]"] * len(ids),
        "directors": ["[]"] * len(ids),
        "created_by": ["[]"] * len(ids),
        "_tipo": tipi,
    })


def per_tipo(df, tipo):
    if df is None:
        return None
    return df[df["_tipo"] == tipo].drop(columns=["_tipo"]).reset_index(drop=True)


# Il collocatore finto: niente centroidi, una mappa titolo -> (bolla, confidenza).
COLLOCA = {
    "movie:4001": (0, 0.9),
    "movie:4007": (2, 0.4),
    "tv:4006": (1, 0.7),
}


def colloca_finto(dd, tipo):
    return COLLOCA[f"{tipo}:{int(dd['id'])}"]


def build_mondi_graph(n_mondi=12, per_mondo=20):
    """Un grafo con molti mondi a anello: serve a provare che i VICINI entrano nelle uscite.

    Con tre mondi `bolle` li prende tutti e l'allargamento ai vicini non si vede. Qui i mondi sono 12,
    `bolle` si ferma ai primi quattro, e il vicino del primo (l'ultimo dell'anello) resta fuori.
    """
    import scipy.sparse as sp

    nodi = n_mondi * per_mondo
    rows, cols, vals = [], [], []

    def edge(u, v, w):
        rows.extend([u, v])
        cols.extend([v, u])
        vals.extend([w, w])

    for b in range(n_mondi):
        s, e = b * per_mondo, (b + 1) * per_mondo
        for i in range(s, e - 1):
            edge(i, i + 1, 2.0)
        for j in range(s + 1, min(s + 6, e)):
            edge(s, j, 4.0)

    W = sp.csr_matrix((vals, (rows, cols)), shape=(nodi, nodi))
    deg = np.asarray(W.sum(1)).ravel()
    deg[deg <= 0] = 1.0
    Tr = sp.diags(1.0 / deg) @ W

    m = object.__new__(MO.Motore)
    m.N = nodi
    m.NB = n_mondi
    m.Tr = Tr
    m.MEM = np.repeat(np.arange(n_mondi), per_mondo).astype(np.int32)
    m.SZ = np.bincount(m.MEM)
    m.MEMBRI = [np.where(m.MEM == b)[0].astype(np.int32) for b in range(n_mondi)]
    # anello: il mondo b ha per vicini b-1 e b+1 (e il mondo 0 tocca l'ultimo)
    m.VICINI = [np.array(sorted({(b - 1) % n_mondi, (b + 1) % n_mondi}), np.int32) for b in range(n_mondi)]
    m.VAVE = np.full(nodi, 7.2, dtype=np.float32)
    m.VOT = np.full(nodi, 800.0, dtype=np.float32)
    m.POP = np.full(nodi, 25.0, dtype=np.float32)
    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(n_mondi)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(n_mondi)], dtype=np.float32)
    m.ANNO = np.full(nodi, 2021, dtype=np.int32)
    m.NEP = np.full(nodi, 1.0, dtype=np.float32)
    m.COZY = np.zeros(nodi, dtype=np.float32)
    m.IMP = np.zeros(nodi, dtype=np.float32)
    m.QUOTA_TV = np.zeros(n_mondi, dtype=np.float32)
    m.QUOTA_COZY = np.zeros(n_mondi, dtype=np.float32)
    m.QUOTA_IMP = np.zeros(n_mondi, dtype=np.float32)
    m.LISTDEG = np.zeros(nodi, dtype=np.float32)
    m.TIT = np.array([f"Film_{i}" for i in range(nodi)])
    m.COLL = None
    m.DIR = None
    m.REGISTA = None
    m.artefatto = "mock-artefatto-ticket-10"
    B.KEYS = [f"movie:{1000 + i}" for i in range(nodi)]
    B.ROW_OF = {k: i for i, k in enumerate(B.KEYS)}
    B.IS_TV = np.zeros(nodi, dtype=bool)
    m.USCITE = None
    return m


def main():
    print("=" * 84)
    print("TICKET 10 — NUOVE USCITE PER TE")
    print("=" * 84)

    print("\n1. PARAMETRI E FUNZIONI")
    assert int(P.USCITE_COLLOCATE_VOTI_MIN) == 30, P.USCITE_COLLOCATE_VOTI_MIN
    assert float(P.USCITE_COLLOCATE_VOTO_MIN) == 6.2, P.USCITE_COLLOCATE_VOTO_MIN
    assert U.SCHEMA == int(P.USCITE_COLLOCATE_SCHEMA), (
        f"FALLITO: il modulo usa schema {U.SCHEMA}, la tabella dichiara {P.USCITE_COLLOCATE_SCHEMA}"
    )
    print(f"  DAL={P.USCITE_NUOVE_DAL} · VOTI_MIN={P.USCITE_COLLOCATE_VOTI_MIN} · "
          f"VOTO_MIN={P.USCITE_COLLOCATE_VOTO_MIN} · SCHEMA={P.USCITE_COLLOCATE_SCHEMA}")

    print("\n2. IL «PRIMA»: SENZA CACHE LA RIGA E' VUOTA, E LO DICHIARA")
    m = build_ponte_graph()          # ANNO = 2021: nessuna uscita 2025+ nel canone
    m.USCITE = None
    res_prima = m.lista(storia(semi(m, 0, 6)), cap=20, medium="movie")
    riga_prima = righe(res_prima, "uscite_nuove")[0]
    print(f"  fonte={riga_prima['fonte']} candidati={riga_prima['candidati']} "
          f"nel_bacino={riga_prima['nel_bacino']} titoli={len(riga_prima['titoli'])}")
    print(f"  motivo: {riga_prima.get('motivo')!r}")
    assert riga_prima["titoli"] == [], "FALLITO: il fixture ha uscite 2025+ dove non dovrebbe"
    assert riga_prima["fonte"] == "canone"
    assert riga_prima.get("motivo") and "cache" in riga_prima["motivo"], (
        "FALLITO: la riga vuota non dichiara che manca la cache"
    )

    print("\n2b. L'IMBUTO: I VICINI DEL MONDO ACCESO ENTRANO, I MONDI LONTANI NO")
    ml = build_mondi_graph()
    vicino = int(ml.MEMBRI[ml.VICINI[0][-1]][3])   # un titolo dell'ultimo vicino del mondo 0
    lontano = int(ml.MEMBRI[5][3])                 # un titolo di un mondo che non e' ne' acceso ne' vicino
    ml.ANNO[vicino] = 2026
    ml.ANNO[lontano] = 2026
    res_imb = ml.lista(storia(semi(ml, 0, 6)), cap=20, medium="movie")
    riga_imb = righe(res_imb, "uscite_nuove")[0]
    chiavi_imb = [ch for ch, _p in riga_imb["titoli"]]
    print(f"  vicino={B.KEYS[vicino]} (mondo {int(ml.MEM[vicino])}) · lontano={B.KEYS[lontano]} "
          f"(mondo {int(ml.MEM[lontano])}) · riga={chiavi_imb}")
    assert B.KEYS[vicino] in chiavi_imb, (
        "FALLITO: un'uscita in un mondo VICINO non entra: l'imbuto guarda ancora solo le bolle del profilo"
    )
    assert B.KEYS[lontano] not in chiavi_imb, (
        "FALLITO: entra un'uscita di un mondo ne' acceso ne' vicino"
    )
    print("  -> OK: l'allargamento ai vicini e' vero, e resta un imbuto")

    print("\n3. IL BUILDER: I PAVIMENTI MORDONO E IL CANONE SI LEGGE")
    # Il fixture di 2b ha cambiato i globali di `bubbles` (chiavi e IS_TV): si riparte dal grafo del 09.
    m = build_ponte_graph()
    # 4005 è già nel canone (nodo 5 del fixture) e recentissimo; gli altri sono nuovi.
    chiavi = ["movie:4005", "movie:4001", "movie:4002", "movie:4003", "movie:4004", "tv:4006", "movie:4007"]
    date = ["2026-06-01", "2026-05-01", "2026-04-01", "2020-01-01", "2026-02-01", "2026-03-01", "2026-01-01"]
    voti = [500, 120, 20, 400, 300, 250, 50]
    voti_medi = [7.5, 7.0, 7.8, 7.6, 6.0, 7.2, 6.5]
    df = dataframe(chiavi, date, voti, voti_medi)
    # per il titolo già nel canone il fixture deve conoscerne la chiave: `movie:4005` non c'è (il fixture
    # ha 1000..1299), quindi si usa una chiave del canone per davvero.
    chiavi[0] = B.KEYS[5]
    df.loc[0, "id"] = int(B.KEYS[5].split(":")[1])

    with tempfile.TemporaryDirectory() as tmp:
        percorso = pathlib.Path(tmp) / "uscite.npz"
        n = U.costruisci(percorso=percorso, movie=per_tipo(df, "movie"), tv=per_tipo(df, "tv"),
                         colloca_fn=colloca_finto,
                         mem=m.MEM, generato="2026-10-20T00:00:00+00:00")
        print(f"  collocati: {n}")
        assert n == 4, f"FALLITO: attesi 4 collocati (1 vecchio, 1 con pochi voti, 1 con voto basso), trovati {n}"
        cache = U.carica(percorso)
        assert cache is not None, "FALLITO: la cache appena scritta non si carica"
        print(f"  chiavi: {cache['chiavi']}")
        print(f"  bolle: {cache['bolle'].tolist()} · confidenze: "
              f"{[round(float(c), 2) for c in cache['confidenza']]} · anni: {cache['anno'].tolist()}")
        assert cache["meta"]["dal"] == int(P.USCITE_NUOVE_DAL)
        assert cache["meta"]["scartati"]["vecchi"] == 1, cache["meta"]["scartati"]
        assert cache["meta"]["scartati"]["pochi_voti"] == 1, cache["meta"]["scartati"]
        assert cache["meta"]["scartati"]["voto_basso"] == 1, cache["meta"]["scartati"]
        assert all(int(a) >= int(P.USCITE_NUOVE_DAL) for a in cache["anno"]), (
            "FALLITO: nella cache c'è un titolo vecchio"
        )
        # Il titolo che era già nel canone prende la sua bolla e confidenza 1: la stima non serve.
        i_canone = cache["chiavi"].index(B.KEYS[5])
        print(f"  {B.KEYS[5]} (già nel canone): bolla={int(cache['bolle'][i_canone])} "
              f"confidenza={float(cache['confidenza'][i_canone])}")
        assert int(cache["bolle"][i_canone]) == int(m.MEM[5])
        assert float(cache["confidenza"][i_canone]) == 1.0

        print("\n4. IL «DOPO»: LA RIGA SI RIEMPIE DI USCITE VERE")
        m.USCITE = cache
        res_dopo = m.lista(storia(semi(m, 0, 6)), cap=20, medium="movie")
        riga_dopo = righe(res_dopo, "uscite_nuove")[0]
        titoli_dopo = [(ch, round(p, 8)) for ch, p in riga_dopo["titoli"]]
        print(f"  fonte={riga_dopo['fonte']} candidati={riga_dopo['candidati']} "
              f"nel_bacino={riga_dopo['nel_bacino']} scartati_pavimento={riga_dopo['scartati_pavimento']} "
              f"riga={len(titoli_dopo)}")
        assert riga_dopo["candidati"] == 3, f"FALLITO: candidati {riga_dopo['candidati']} invece di 3"
        assert riga_dopo["nel_bacino"] == 3, f"FALLITO: nel_bacino {riga_dopo['nel_bacino']} invece di 3"
        assert riga_dopo["scartati_pavimento"] == 3, (
            f"FALLITO: gli scarti del pavimento non arrivano alla riga ({riga_dopo['scartati_pavimento']})"
        )
        print(f"  titoli: {titoli_dopo[:5]}")
        assert riga_dopo["titoli"], "FALLITO: con la cache la riga resta vuota"
        assert riga_dopo["fonte"] == "collocate"
        assert all(ch in cache["chiavi"] for ch, _p in titoli_dopo), "FALLITO: entra un titolo che non è nella cache"
        anni = [int(cache["anno"][cache["chiavi"].index(ch)]) for ch, _p in titoli_dopo]
        assert all(a >= int(P.USCITE_NUOVE_DAL) for a in anni), f"FALLITO: uscite non recenti: {anni}"
        punteggi = [p for _ch, p in titoli_dopo]
        assert punteggi == sorted(punteggi, reverse=True), "FALLITO: punteggi non monotoni"
        # Il titolo non-film (tv:4006) non deve comparire in una richiesta movie.
        assert all(not ch.startswith("tv:") for ch, _p in titoli_dopo), (
            "FALLITO: una serie entra nella riga film"
        )

        print("\n5. CONFIDENZA E QUALITA' CONTANO, NON SONO DECORAZIONE")
        # Due titoli nella stessa bolla, stessi voti: vince la confidenza piu' alta.
        bolle = np.array([0, 0], np.int32)
        att = np.array([1.0, 0.0, 0.0])
        finta = {"chiavi": ["movie:5001", "movie:5002"], "bolle": bolle,
                 "confidenza": np.array([0.9, 0.2], np.float32),
                 "voti": np.array([100.0, 100.0]), "voto": np.array([7.0, 7.0]),
                 "anno": np.array([2026, 2026]), "meta": {"schema": 1}}
        out, _st = U.candidati(finta, att, {0}, "movie", set())
        print(f"  stessa bolla, voti uguali, confidenza 0.9 vs 0.2 -> {[c for c, _ in out]}")
        assert [c for c, _ in out] == ["movie:5001", "movie:5002"], "FALLITO: la confidenza non entra nel punteggio"

        # Stessa bolla, stessa confidenza: vince chi ha piu' voti (qualita' bayesiana, non la media secca).
        finta2 = {"chiavi": ["movie:5003", "movie:5004"], "bolle": bolle,
                  "confidenza": np.array([0.5, 0.5], np.float32),
                  "voti": np.array([30.0, 3000.0]), "voto": np.array([6.5, 7.6]),
                  "anno": np.array([2026, 2026]), "meta": {"schema": 1}}
        out2, _st2 = U.candidati(finta2, att, {0}, "movie", set())
        print(f"  30 voti/6.5 vs 3000 voti/7.6 -> {[c for c, _ in out2]}")
        assert [c for c, _ in out2] == ["movie:5004", "movie:5003"], "FALLITO: la qualita' non ordina"

        print("\n6. L'IMBUTO: SOLO I MONDI ACCESI (E I VICINI), MAI TUTTI")
        tre = {"chiavi": ["movie:6000", "movie:6001", "movie:6002"], "bolle": np.array([0, 1, 2], np.int32),
               "confidenza": np.ones(3, np.float32), "voti": np.array([100.0] * 3),
               "voto": np.array([7.5] * 3), "anno": np.array([2026] * 3), "meta": {"schema": 1}}
        att3 = np.array([0.5, 0.3, 0.2])
        out3, st3 = U.candidati(tre, att3, {0}, "movie", set())
        print(f"  bacino {{0}}: {[c for c, _ in out3]} · stato={st3}")
        assert [c for c, _ in out3] == ["movie:6000"], "FALLITO: entra un titolo fuori dal bacino"
        out4, _st4 = U.candidati(tre, att3, {0, 1}, "movie", set())
        assert [c for c, _ in out4] == ["movie:6000", "movie:6001"], "FALLITO: i vicini non entrano"
        assert out4[0][1] > out4[1][1], "FALLITO: l'attivazione del mondo non pesa"
        print("  vicini: entrano, e pesano quanto il loro mondo")

        print("\n7. I VISTI RESTANO FUORI")
        seed_key = B.KEYS[int(m.MEMBRI[0][0])]
        con_visto = dict(tre)
        con_visto["chiavi"] = ["movie:6000", seed_key]
        con_visto["bolle"] = np.array([0, 0], np.int32)
        con_visto["confidenza"] = np.ones(2, np.float32)
        con_visto["voti"] = np.array([100.0, 100.0])
        con_visto["voto"] = np.array([7.5, 7.5])
        con_visto["anno"] = np.array([2026, 2026])
        visti = {int(m.MEMBRI[0][0])}
        out5, st5 = U.candidati(con_visto, att3, {0}, "movie", visti)
        print(f"  con un seme nel bacino: {[c for c, _ in out5]} · gia_visti={st5['gia_visti']}")
        assert seed_key not in [c for c, _ in out5], "FALLITO: un titolo già visto entra nelle uscite"
        assert st5["gia_visti"] == 1, "FALLITO: il conteggio dei già visti non è dichiarato"
        out6, st6 = U.candidati(con_visto, np.zeros(3), {0}, "movie", set())
        assert out6 == [] and st6["senza_attivazione"] == 2 and "senza attivazione" in st6["motivo"], (
            f"FALLITO: 'nessuna attivazione' non è distinto dai visti: {st6}"
        )
        print(f"  attivazione zero: motivi distinti -> {st6['motivo']!r}")

        print("\n8. IL CONTRATTO PORTA FONTE E CONTEGGI")
        payload = {"semi": [{"tmdbId": int(ch.split(":")[1]), "medium": "movie", "tipo": "watched"}
                            for ch in semi(m, 0, 6)], "medium": "movie", "cap": 20}
        status, res_s = S.esegui_richiesta(payload, m)
        riga_s = [li for li in res_s["liste"] if li["ruolo"] == "uscite_nuove"][0]
        print(f"  status={status} fonte={riga_s.get('fonte')} candidati={riga_s.get('candidati')} "
              f"nel_bacino={riga_s.get('nel_bacino')} parziale={riga_s.get('parziale')} titoli={len(riga_s['titoli'])}")
        assert riga_s.get("fonte") == "collocate"
        assert isinstance(riga_s.get("candidati"), int) and isinstance(riga_s.get("nel_bacino"), int)
        assert riga_s.get("parziale") is True

    print("\n9. CACHE ASSENTE E DATI ASSENTI: SI DICHIARA, NON SI ESPLODE")
    with tempfile.TemporaryDirectory() as tmp:
        vuoto = pathlib.Path(tmp) / "vuota.npz"
        n = U.costruisci(percorso=vuoto, movie=pd.DataFrame(), tv=pd.DataFrame(), colloca_fn=None)
        print(f"  builder senza dati: collocati={n} · cache scritta={vuoto.exists()}")
        assert n == 0 and not vuoto.exists(), "FALLITO: un builder senza dati scrive una cache"
        assert U.carica(vuoto) is None, "FALLITO: una cache assente non torna None"
        storta = pathlib.Path(tmp) / "schema.npz"
        np.savez_compressed(storta, chiavi=np.array(["movie:1"], object), bolle=np.array([0], np.int32),
                            confidenza=np.array([1.0], np.float32), voti=np.array([10], np.int32),
                            voto=np.array([7.0], np.float32), anno=np.array([2026], np.int32),
                            meta=np.array('{"schema": 99}'))
        assert U.carica(storta) is None, "FALLITO: una cache con schema sbagliato non viene ignorata"
    print("  -> OK: degrada dichiarandolo")

    print("\n10. I CASI CHE FANNO MALE: MEDIUM ASSENTE, PARTIZIONE VECCHIA, CACHE ROTTA, DATE")
    doppia = {"chiavi": ["movie:7001", "tv:7002"], "bolle": np.array([0, 0], np.int32),
              "confidenza": np.ones(2, np.float32), "voti": np.array([100.0, 100.0]),
              "voto": np.array([7.5, 7.5]), "anno": np.array([2026, 2026]),
              "meta": {"schema": U.SCHEMA}}
    out7, _s7 = U.candidati(doppia, np.array([0.5]), {0}, None, set())
    print(f"  medium=None -> {[c for c, _ in out7]}")
    assert [c for c, _ in out7] == ["movie:7001", "tv:7002"], (
        "FALLITO: con medium=None le serie spariscono (era il comportamento del canone: entrambi)"
    )

    fuori = dict(doppia)
    fuori["chiavi"] = ["movie:7003"]
    fuori["bolle"] = np.array([9], np.int32)
    out8, _s8 = U.candidati(fuori, np.array([0.5]), set(range(20)), "movie", set())
    print(f"  bolla 9 con att_s di 1 mondo -> {out8} (scartata, non IndexError)")
    assert out8 == [], "FALLITO: una bolla fuori partizione non viene scartata"

    with tempfile.TemporaryDirectory() as tmp:
        pv = pathlib.Path(tmp) / "partizione.npz"
        np.savez_compressed(pv, chiavi=np.array(["movie:7004"], str), bolle=np.array([0], np.int32),
                            confidenza=np.array([1.0], np.float32), voti=np.array([100], np.int32),
                            voto=np.array([7.5], np.float32), anno=np.array([2026], np.int32),
                            meta=np.array(json.dumps({"schema": U.SCHEMA, "impronta_partizione": "VECCHIA"})))
        vera = U.impronta_partizione
        U.impronta_partizione = lambda: "NUOVA"
        try:
            assert U.carica(pv) is None, "FALLITO: una cache di un'altra partizione non viene ignorata"
        finally:
            U.impronta_partizione = vera
        print("  partizione cambiata -> cache ignorata")

        rotta = pathlib.Path(tmp) / "rotta.npz"
        np.savez_compressed(rotta, chiavi=np.array(["movie:7005"], str), bolle=np.array([0], np.int32),
                            meta=np.array(json.dumps({"schema": U.SCHEMA})))
        assert U.carica(rotta) is None, "FALLITO: una cache senza membri solleva invece di dichiararsi"
        print("  cache con membri mancanti -> None, dichiarato")

    dfd = dataframe(["movie:8001", "tv:8002"], ["2026-01-01", ""], [100, 100], [7.5, 7.5])
    dfd.loc[1, "first_air_date"] = "2026-01-01"
    with tempfile.TemporaryDirectory() as tmp:
        pd_path = pathlib.Path(tmp) / "date.npz"
        nd = U.costruisci(percorso=pd_path, movie=per_tipo(dfd, "movie"), tv=per_tipo(dfd, "tv"),
                          colloca_fn=lambda dd, tipo: (0, 0.5), mem=None)
        print(f"  date sulle colonne giuste (release_date / first_air_date): collocati={nd}")
        assert nd == 2, "FALLITO: le date sono lette dalla colonna sbagliata"

    import time as _t
    grande = {"chiavi": [f"movie:{i}" for i in range(1000)], "bolle": np.zeros(1000, np.int32),
              "confidenza": np.ones(1000, np.float32), "voti": np.full(1000, 100.0),
              "voto": np.full(1000, 7.5), "anno": np.full(1000, 2026), "meta": {"schema": U.SCHEMA}}
    t0 = _t.perf_counter()
    for _ in range(20):
        U.candidati(grande, np.ones(3), {0}, "movie", set())
    ms_seg = (_t.perf_counter() - t0) / 20 * 1000
    print(f"  1000 titoli in cache: {ms_seg:.2f} ms per chiamata")
    assert ms_seg < 5.0, f"FALLITO: {ms_seg:.2f} ms per chiamata e' troppo"
    print("  -> OK: casi cattivi dichiarati, e il costo resta di un ordinamento")

    print("\n" + "=" * 84)
    print("TUTTE LE PROVE SUPERATE — OK")
    print("=" * 84)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\n{e}")
        sys.exit(1)
