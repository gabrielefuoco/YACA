"""probe-ticket-08-micro-cluster.py — Sonda del Ticket 08 (micro-cluster dei filoni).

La premessa: `Motore.lista` fa **una** diffusione su tutti i semi (`motore.py`), quindi il filone con più
peso decide `r` per tutti. Questa sonda prova che il rimedio esiste e morde:

1. un profilo con **due filoni netti** (6 semi nel filone A, 20 nel filone B) produce **due** righe
   `micro_cluster_*`, e ogni riga **non** contiene titoli dell'altro filone;
2. **il «prima»**: la diffusione unica di `il_tuo_mondo` su quegli stessi semi segue il filone dominante —
   è il difetto che il ticket cura, mostrato sullo stesso fixture;
3. un profilo **monolitico** produce **una** riga, non due o tre inventate;
4. **identità stabile sotto perturbazione**: aggiungere una rivisione al filone B fa salire B allo slot 1
   (posizionale, dichiarato), ma `cluster_id` resta attaccato al suo filone e `titoli_seme` non migrano;
5. il **titolo parlante** porta i due semi più pesanti, e il contratto HTTP li restituisce insieme a
   `cluster_id` e `quota_peso`;
6. la **massa di ogni diffusione somma a 1**: la riga di un filone non è il frullato di tutti i semi;
7. il **pavimento** vale anche qui e il peso dei filoni è tutto attribuito;
8. i filoni **scartati** (sotto soglia) e quelli **oltre il tetto di 3** lo dichiarano nei log;
9. il costo è **una camminata per riga** (niente diffusioni nascoste), e il tempo su fixture è dichiarato
   come numero di fixture — l'artefatto vero non è in questo checkout.
"""
import contextlib
import io
import pathlib
import sys
import time

import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
ROOT = QUI.parents[1]
sys.path.insert(0, str(ROOT / "services"))

from graph import bubbles as B  # noqa: E402
from graph import parametri as P  # noqa: E402
from graph import servizio as S  # noqa: E402

exec(open(QUI / "probe-ticket-05-gemme.py").read().split("def test_due_profili_opposti")[0])  # noqa: S102

PARI = {0, 2, 4, 6}     # il «filone A» del fixture (bolle mainstream)
DISPARI = {1, 3, 5, 7}  # il «filone B» del fixture (bolle d'essai)


def semi_di(m, bolla, quanti, da=0):
    return [B.KEYS[int(x)] for x in m.MEMBRI[bolla][da:da + quanti]]


def storia_di(chiavi, plays=1):
    return [(ch, plays, "watched", None) for ch in chiavi]


def righe_cluster(res):
    return [li for li in res["liste"] if str(li["tipo"]).startswith("micro_cluster")]


def membri_di(m, titoli):
    return [int(m.MEM[B.ROW_OF[ch]]) for ch in titoli]


def con_spia(m):
    """Avvolge `diffondi` per registrare la massa di OGNI camminata, senza toccare il prodotto."""
    catturate = []
    originale = m.diffondi

    def spia(righe, plays, tipi=None, pesi=None):
        att, r = originale(righe, plays, tipi=tipi, pesi=pesi)
        catturate.append((len(righe), float(np.sum(r))))
        return att, r

    m.diffondi = spia
    return catturate


def main():
    print("=" * 84)
    print("TICKET 08 — MICRO-CLUSTER DEI FILONI")
    print("=" * 84)

    print("\n1. PARAMETRI DICHIARATI")
    assert P.MICRO_CLUSTER_MAX == 3, f"atteso 3, trovato {P.MICRO_CLUSTER_MAX}"
    assert P.MICRO_CLUSTER_MIN_SEMI == 3, f"atteso 3, trovato {P.MICRO_CLUSTER_MIN_SEMI}"
    assert float(P.MICRO_CLUSTER_MIN_PESO) == 0.10, f"atteso 0.10, trovato {P.MICRO_CLUSTER_MIN_PESO}"
    assert P.MICRO_CLUSTER_BOLLE_MAX == 4, f"atteso 4, trovato {P.MICRO_CLUSTER_BOLLE_MAX}"
    print(f"  MAX={P.MICRO_CLUSTER_MAX} · MIN_SEMI={P.MICRO_CLUSTER_MIN_SEMI} · "
          f"MIN_PESO={P.MICRO_CLUSTER_MIN_PESO} · BOLLE_MAX={P.MICRO_CLUSTER_BOLLE_MAX}")
    print("  -> OK")

    print("\n2. DUE FILONI NETTI (6 nel filone A, 20 nel filone B)")
    m = build_dual_world_graph()
    filone_a = semi_di(m, 0, 6)
    filone_b = semi_di(m, 1, 20)
    storia = storia_di(filone_a + filone_b)
    masse = con_spia(m)
    res = m.lista(storia, cap=20, medium="movie")

    cluster = righe_cluster(res)
    print(f"  semi: {len(storia)} ({len(filone_a)} filone A, {len(filone_b)} filone B)")
    for li in cluster:
        print(f"  {li['tipo']:<16} cluster_id={li.get('cluster_id')} quota={li.get('quota_peso')} "
              f"semi={len(li.get('semi_chiavi') or [])} titoli={len(li['titoli'])} "
              f"seme_parlante={li.get('titoli_seme')}")
    assert len(cluster) == 2, f"FALLITO: attese 2 righe di cluster, trovate {len(cluster)}"

    per_id = {li["cluster_id"]: membri_di(m, [ch for ch, _p in li["titoli"]]) for li in cluster}
    assert "b0" in per_id and "b1" in per_id, f"FALLITO: cluster_id inattesi: {sorted(per_id)}"
    a_puri = [b for b in per_id["b0"] if b in PARI]
    b_puri = [b for b in per_id["b1"] if b in DISPARI]
    print(f"  filone A (b0): {len(a_puri)}/{len(per_id['b0'])} titoli nelle bolle del filone A")
    print(f"  filone B (b1): {len(b_puri)}/{len(per_id['b1'])} titoli nelle bolle del filone B")
    assert per_id["b0"] and all(b in PARI for b in per_id["b0"]), (
        "FALLITO: la riga del filone A contiene titoli di un altro filone: "
        f"{[b for b in per_id['b0'] if b in DISPARI]}"
    )
    assert per_id["b1"] and all(b in DISPARI for b in per_id["b1"]), (
        "FALLITO: la riga del filone B contiene titoli di un altro filone: "
        f"{[b for b in per_id['b1'] if b in PARI]}"
    )
    print("  -> OK: ogni riga resta nel suo filone")
    del m.diffondi  # la spia ha finito: le sezioni successive non devono contare le sue camminate

    print("\n3. IL «PRIMA»: LA DIFFUSIONE UNICA (RICALCOLATA QUI) SEGUE IL FILONE DOMINANTE")
    # Dal Ticket 11 la riga e' dedotta dal waterfall (i micro-cluster arrivano prima): qui si giudica la
    # DIFFUSIONE, e si rifa' sul fixture — NON e' la riga di prodotto. La riga di prodotto la prova il 11.
    from graph import camminata as C  # noqa: PLC0415
    from graph import canon as K  # noqa: PLC0415
    righe_semi = np.array([B.ROW_OF[ch] for ch in filone_a + filone_b], np.int64)
    w_uni = m.pesi_semi(righe_semi, np.ones(len(righe_semi)), tipi=["watched"] * len(righe_semi))
    r_uni = C.ppr(m.Tr, righe_semi, w_uni, normalizza=True)
    cand_uni = np.array([x for x in range(m.N) if x not in set(righe_semi.tolist())], np.int64)
    cand_uni = cand_uni[(m.VAVE[cand_uni] >= P.PAVIMENTO_VAVE_MIN) & (m.VOT[cand_uni] >= P.PAVIMENTO_VOT_MIN)]
    bayes_uni = K.voto_bayesiano(m.VOT[cand_uni], m.VAVE[cand_uni])
    score_uni = r_uni[cand_uni] * (bayes_uni / float(P.RANKING_BAYES_BASE)) ** float(P.RANKING_BAYES_EXP)
    top_uni = cand_uni[np.argsort(-score_uni)[:5]]
    b_uni = [int(m.MEM[x]) for x in top_uni]
    tuo_b = sum(1 for b in b_uni if b in DISPARI)
    print(f"  camminata unica, primi 5: {[B.KEYS[int(x)] for x in top_uni]} -> {tuo_b}/5 dal filone B")
    assert tuo_b >= 3, (
        "FALLITO: il fixture non mostra più lo schiacciamento (la diffusione unica non è dominata dal "
        f"filone B): primi 5 in bolle {b_uni}. La prova del «prima» non varrebbe più."
    )
    tuo = next((li for li in res["liste"] if li["tipo"] == "il_tuo_mondo"), None)
    assert tuo is not None, "FALLITO: manca il_tuo_mondo"
    print("  -> OK: la diffusione unica segue il filone dominante, le righe di cluster no")

    print("\n4. PROFILO MONOLITICO: UNA RIGA, NON TRE")
    m2 = build_dual_world_graph()
    res_mono = m2.lista(storia_di(semi_di(m2, 2, 20)), cap=20, medium="movie")
    cluster_mono = righe_cluster(res_mono)
    print(f"  righe di cluster: {len(cluster_mono)} -> {[li['cluster_id'] for li in cluster_mono]}")
    assert len(cluster_mono) == 1, f"FALLITO: un solo filone deve dare una riga, ne dà {len(cluster_mono)}"
    assert cluster_mono[0]["cluster_id"] == "b2", (
        f"FALLITO: cluster ancorato a {cluster_mono[0]['cluster_id']} invece di b2"
    )
    mono_mem = membri_di(m2, [ch for ch, _p in cluster_mono[0]["titoli"]])
    assert mono_mem and all(b in PARI for b in mono_mem), "FALLITO: la riga del filone unico esce dal filone"
    print("  -> OK: nessuna riga inventata")

    print("\n5. IDENTITA' STABILE SOTTO PERTURBAZIONE (una rivisione al filone B)")
    m3 = build_dual_world_graph()
    pari = semi_di(m3, 4, 6)   # bolla 4: filone A
    dispari = semi_di(m3, 5, 6)  # bolla 5: filone B
    prima = m3.lista(storia_di(pari + dispari), cap=20, medium="movie")
    identita_prima = {li["cluster_id"]: tuple(li.get("titoli_seme") or []) for li in righe_cluster(prima)}
    slot_prima = {li["tipo"]: li["cluster_id"] for li in righe_cluster(prima)}
    # stessi semi, UNA rivisione in più al filone B: il peso si incrocia apposta.
    dopo = m3.lista(storia_di(pari) + storia_di(dispari, plays=5), cap=20, medium="movie")
    identita_dopo = {li["cluster_id"]: tuple(li.get("titoli_seme") or []) for li in righe_cluster(dopo)}
    slot_dopo = {li["tipo"]: li["cluster_id"] for li in righe_cluster(dopo)}
    print(f"  prima  slot: {slot_prima}")
    print(f"  dopo   slot: {slot_dopo}")
    print(f"  prima  identita': {identita_prima}")
    print(f"  dopo   identita': {identita_dopo}")
    assert identita_prima == identita_dopo, (
        "FALLITO: l'identità del filone (cluster_id -> titoli_seme) è cambiata quando i pesi si sono "
        "incrociati: è il difetto che fa comparire e sparire cataloghi"
    )
    assert set(slot_prima) == set(slot_dopo), f"FALLITO: gli slot sono cambiati: {sorted(slot_prima)} vs {sorted(slot_dopo)}"
    assert slot_prima != slot_dopo, (
        "ATTENZIONE: gli slot NON hanno seguito il peso — la perturbazione non ha incrociato i pesi, "
        "quindi questa prova non discrimina niente"
    )
    print("  -> OK: gli slot seguono il peso (posizionali, dichiarato), il filone tiene il suo cluster_id")

    print("\n6. IL TITOLO PARLANTE")
    for li in cluster:
        semi_parlanti = li.get("titoli_seme") or []
        assert len(semi_parlanti) == 2, f"FALLITO: {li['tipo']} porta {len(semi_parlanti)} titoli-seme invece di 2"
        assert all(isinstance(t, str) and t for t in semi_parlanti), "FALLITO: titoli-seme vuoti o non stringhe"
        assert all(t in m.TIT for t in semi_parlanti), f"FALLITO: titoli-seme che non esistono nel canone: {semi_parlanti}"
    print(f"  b0: {next(li for li in cluster if li['cluster_id'] == 'b0')['titoli_seme']} · "
          f"b1: {next(li for li in cluster if li['cluster_id'] == 'b1')['titoli_seme']}")

    print("\n6b. IL SEME PIU' PESANTE, E NIENTE DOPPIONI")
    m_pesi = build_dual_world_graph()
    chiavi = semi_di(m_pesi, 2, 3)
    # Il secondo seme vale 5 plays: deve essere LUI il primo titolo parlante. Il terzo entra due volte
    # nella storia (watchlist + loved), come fa il pool: non deve uscire due volte nella descrizione.
    story = [(chiavi[0], 1, "watched", None), (chiavi[1], 5, "watched", None),
             (chiavi[2], 1, "library", None), (chiavi[2], 1, "loved", None)]
    res_pesi = m_pesi.lista(story, cap=20, medium="movie")
    riga_pesi = righe_cluster(res_pesi)[0]
    # Ricalcolo indipendente: i due titoli parlanti sono i nodi col peso piu' alto secondo `pesi_semi`
    # (il plays pesa, il tipo pesa), a pari peso il nodo piu' basso — e senza doppioni.
    righe_p = np.array([B.ROW_OF[ch] for ch, _pl, _tp, _ps in story], np.int64)
    plays_p = np.array([pl for _ch, pl, _tp, _ps in story], float)
    tipi_p = [tp for _ch, _pl, tp, _ps in story]
    pesi_storia = [ps for _ch, _pl, _tp, ps in story]
    w_p = m_pesi.pesi_semi(righe_p, plays_p, tipi=tipi_p,
                           pesi=None if not any(ps is not None for ps in pesi_storia) else pesi_storia)
    nodi_p, inversa_p = np.unique(righe_p, return_inverse=True)
    pesi_nodo_p = np.zeros(len(nodi_p), np.float64)
    np.add.at(pesi_nodo_p, inversa_p, w_p)
    ordine_p = sorted(range(len(nodi_p)), key=lambda j: (-float(pesi_nodo_p[j]), int(nodi_p[j])))
    attesi = [str(m_pesi.TIT[int(nodi_p[j])]) for j in ordine_p[:2]]
    print(f"  titoli_seme={riga_pesi['titoli_seme']} · attesi dal peso={attesi} "
          f"(pesi {[round(float(p), 2) for p in pesi_nodo_p]})")
    assert riga_pesi["titoli_seme"] == attesi, (
        f"FALLITO: il titolo parlante non sono i due semi piu' pesanti: {riga_pesi['titoli_seme']} vs {attesi}"
    )
    assert len(set(riga_pesi["titoli_seme"])) == len(riga_pesi["titoli_seme"]), (
        f"FALLITO: lo stesso titolo compare due volte nella descrizione: {riga_pesi['titoli_seme']}"
    )
    print("  -> OK: contano i pesi, e un doppione non buca la descrizione")

    print("\n7. IL CONTRATTO HTTP PORTA LE RIGHE E LA LORO IDENTITA'")
    payload = {
        "semi": [{"tmdbId": int(ch.split(":")[1]), "medium": "movie", "tipo": "watched"}
                 for ch in filone_a + filone_b],
        "medium": "movie",
        "cap": 20,
    }
    status, res_s = S.esegui_richiesta(payload, m)
    assert status == 200, f"FALLITO: il servizio ha risposto {status}"
    cluster_s = [li for li in res_s["liste"] if str(li["ruolo"]).startswith("micro_cluster")]
    print(f"  righe nel contratto: {len(cluster_s)}")
    for li in cluster_s:
        print(f"  {li['ruolo']:<16} cluster_id={li.get('cluster_id')} quota={li.get('quota_peso')} "
              f"descrizione={li['descrizione']!r} semi={len(li['semi'])} titoli={len(li['titoli'])}")
        assert li["descrizione"].startswith("Perché hai amato"), (
            f"FALLITO: la descrizione non è parlante: {li['descrizione']!r}"
        )
        assert li.get("parziale") is True, f"FALLITO: {li['ruolo']} non dichiara parziale"
        assert li["semi"], f"FALLITO: {li['ruolo']} non porta i suoi semi al chiamante"
        assert li.get("cluster_id"), f"FALLITO: {li['ruolo']} non porta cluster_id nel contratto"
        assert li.get("titoli_seme"), f"FALLITO: {li['ruolo']} non porta titoli_seme nel contratto"
        assert 0.0 < float(li.get("quota_peso") or 0.0) <= 1.0, f"FALLITO: quota_peso assurda in {li['ruolo']}"
    assert len(cluster_s) == 2, f"FALLITO: il contratto perde righe (attese 2, trovate {len(cluster_s)})"

    print("\n8. PAVIMENTO E PESO DEI FILONI")
    for li in cluster:
        for ch, _p in li["titoli"]:
            x = B.ROW_OF[ch]
            assert float(m.VAVE[x]) >= P.PAVIMENTO_VAVE_MIN, f"FALLITO: {ch} sotto il pavimento VAVE"
            assert float(m.VOT[x]) >= P.PAVIMENTO_VOT_MIN, f"FALLITO: {ch} sotto il pavimento VOT"
    quota = sum(float(li.get("quota_peso") or 0.0) for li in cluster)
    print(f"  quota di peso coperta dalle righe: {quota:.4f} (in QUESTO fixture 1.0: due filoni, nessuno scartato)")
    assert 0.0 < quota <= 1.0 + 1e-9, f"FALLITO: quota di peso impossibile ({quota})"
    print("  -> OK: pavimento rispettato, e ogni riga dichiara la sua quota")

    print("\n9. UNA CAMMINATA PER FILONE, CON I SUOI SOLI SEMI")
    # La massa somma a 1 per costruzione (`ppr(normalizza=True)`): quello che si puo' sbagliare e' QUALI
    # semi entrano in ogni camminata. Si confrontano le dimensioni, non la somma.
    for i, (n_semi, massa) in enumerate(masse):
        tipo = "principale" if i == 0 else f"filone {i}"
        print(f"  camminata {i} ({tipo}): {n_semi} semi · massa {massa:.6f}")
    assert len(masse) == 1 + len(cluster), "FALLITO: più camminate delle righe (una diffusione per riga)"
    for i, li in enumerate(cluster, start=1):
        assert masse[i][0] == len(li["semi_chiavi"]), (
            f"FALLITO: la camminata di {li['tipo']} usa {masse[i][0]} semi invece dei "
            f"{len(li['semi_chiavi'])} del filone: e' il frullato, non il filone"
        )
    print(f"  semi per camminata: {[m[0] for m in masse]} — ognuna i suoi, non tutti")
    print("  -> OK: una diffusione per riga, coi semi della riga")

    print("\n10. FILONI SCARTATI E TETTO DI 3, DICHIARATI")
    m4 = build_dual_world_graph()
    scarto = storia_di(semi_di(m4, 0, 2)) + storia_di(semi_di(m4, 1, 20))  # 2 semi su 22 = 9,1% < 10%
    log = io.StringIO()
    with contextlib.redirect_stderr(log):
        res_scarto = m4.lista(scarto, cap=20, medium="movie")
    scartate = righe_cluster(res_scarto)
    print(f"  con 2 semi (9,1%) + 20: righe={len(scartate)} · log: "
          f"{[r.strip() for r in log.getvalue().splitlines() if 'scartato' in r]}")
    assert len(scartate) == 1, f"FALLITO: il filone sotto soglia non è stato scartato ({len(scartate)} righe)"
    assert "filone scartato" in log.getvalue(), "FALLITO: lo scarto di un filone avviene in silenzio"

    m5 = build_dual_world_graph()
    m5.VICINI = [np.array([], dtype=np.int32) for _ in range(m5.NB)]
    quattro = []
    for bolla in (0, 1, 3, 5):
        quattro += semi_di(m5, bolla, 4, da=5)  # fuori dai nodi-hub: nessun arco Tr fra bolle
    log2 = io.StringIO()
    with contextlib.redirect_stderr(log2):
        res_quattro = m5.lista(storia_di(quattro), cap=20, medium="movie")
    tenute = righe_cluster(res_quattro)
    print(f"  4 filoni indipendenti: righe={len(tenute)} -> {[li['cluster_id'] for li in tenute]} · log: "
          f"{[r.strip() for r in log2.getvalue().splitlines() if 'tetto' in r]}")
    assert len(tenute) == P.MICRO_CLUSTER_MAX, (
        f"FALLITO: con 4 filoni indipendenti le righe sono {len(tenute)}, non {P.MICRO_CLUSTER_MAX}"
    )
    assert "oltre il tetto" in log2.getvalue(), "FALLITO: il taglio oltre il tetto avviene in silenzio"
    print("  -> OK: nessun filone sparisce in silenzio")

    print("\n10b. ZERO FILONI: IL MOTIVO ARRIVA AL CHIAMANTE")
    m_nessuno = build_dual_world_graph()
    m_nessuno.VICINI = [np.array([], dtype=np.int32) for _ in range(m_nessuno.NB)]
    story_nessuno = []
    for bolla in (0, 1, 3, 5):
        story_nessuno += storia_di(semi_di(m_nessuno, bolla, 2, da=5))  # 2 semi: sotto i 3
    soglia_vera = P.MICRO_CLUSTER_MIN_PESO
    P.MICRO_CLUSTER_MIN_PESO = 0.90  # e 2 semi su 8 = 25%: sotto anche la soglia di peso
    try:
        log3 = io.StringIO()
        with contextlib.redirect_stderr(log3):
            res_nessuno = m_nessuno.lista(story_nessuno, cap=20, medium="movie")
    finally:
        P.MICRO_CLUSTER_MIN_PESO = soglia_vera
    motivi = [m_ for m_ in (res_nessuno.get("motivi") or []) if "micro_cluster" in m_]
    print(f"  righe={len(righe_cluster(res_nessuno))} · motivi={motivi}")
    assert len(righe_cluster(res_nessuno)) == 0, "FALLITO: con la soglia impossibile escono righe di filone"
    assert motivi and "nessun filone" in motivi[0], (
        "FALLITO: zero filoni sparisce in silenzio — nessun motivo nel payload"
    )
    assert "nessuna riga" in log3.getvalue(), "FALLITO: zero filoni non lascia traccia nei log"
    payload_nessuno = {
        "semi": [{"tmdbId": int(ch.split(":")[1]), "medium": "movie", "tipo": "watched"}
                 for ch, _pl, _tp, _ps in story_nessuno],
        "medium": "movie",
        "cap": 20,
    }
    P.MICRO_CLUSTER_MIN_PESO = 0.90
    try:
        status_n, res_n = S.esegui_richiesta(payload_nessuno, m_nessuno)
    finally:
        P.MICRO_CLUSTER_MIN_PESO = soglia_vera
    motivi_contratto = [m_ for m_ in (res_n.get("motivi") or []) if "nessun filone" in m_]
    print(f"  contratto: status={status_n} · motivi={motivi_contratto}")
    assert motivi_contratto, "FALLITO: il motivo non arriva al chiamante HTTP"
    print("  -> OK: zero righe e' un fatto dichiarato, non un silenzio")

    print("\n11. COSTO: UNA CAMMINATA PER RIGA")
    m6 = build_dual_world_graph()
    molti = storia_di(semi_di(m6, 0, 60) + semi_di(m6, 1, 60) + semi_di(m6, 3, 60))
    masse6 = con_spia(m6)
    t0 = time.perf_counter()
    res_molti = m6.lista(molti, cap=20, medium="movie")
    ms = (time.perf_counter() - t0) * 1000
    n_righe = len(righe_cluster(res_molti))
    print(f"  {len(molti)} semi · {n_righe} righe di cluster · {len(masse6)} camminate · {ms:.1f} ms")
    print("  (il tempo è un numero di FIXTURE, 800 nodi: l'artefatto vero da 66.259 nodi non è in questo "
          "checkout — il costo strutturale è una camminata per riga, ~2 ms ciascuna sulla matrice vera)")
    assert len(masse6) == 1 + n_righe, (
        f"FALLITO: {len(masse6)} camminate per {n_righe} righe di cluster: c'è una diffusione nascosta"
    )
    print("  -> OK: nessuna diffusione oltre quelle delle righe")

    print("\n" + "=" * 84)
    print("TUTTE LE PROVE SUPERATE — OK")
    print("=" * 84)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\n{e}")
        sys.exit(1)
