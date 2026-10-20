"""probe-ticket-09-punti-incontro.py — Sonda del Ticket 09 («punti d'incontro», crossover dei gusti).

La regola è `ponte(x) = sqrt(r_a[x] * r_b[x])`, media **geometrica** fra le camminate di due filoni. Questa
sonda prova che è una proprietà vera e non una formula scritta nel commento:

1. con due filoni netti la riga esiste, e i suoi titoli stanno **solo nel mondo che riceve massa da
   entrambi** — un titolo profondo in un filone non entra (il suo `r` nell'altro è ~0, e la geometrica lo
   azzera);
2. **il «prima»**: le righe dei singoli filoni sono fatte dei loro titoli, e non coincidono col ponte;
3. il fallback di un profilo con **un filone solo**: i due mondi più lontani, e `fallback: true` nel
   contratto; se i semi stanno in un mondo solo, la riga lo **dichiara** (vuota + motivo);
4. il pavimento `VAVE >= 6.8` (più il pavimento voti generale) morde, e i cap anti-monopolio passano;
5. il ponte **non costa camminate**: nel caso a due filoni le diffusioni sono le stesse del `08`;
6. il contratto HTTP porta `coppia_id`, `fallback` e la descrizione parlante.
"""
import contextlib
import io
import pathlib
import sys

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
ROOT = QUI.parents[1]
sys.path.insert(0, str(ROOT / "services"))

from graph import bubbles as B  # noqa: E402
from graph import canon as K  # noqa: E402
from graph import motore as MO  # noqa: E402
from graph import parametri as P  # noqa: E402
from graph import servizio as S  # noqa: E402

PER_MONDO = 100
MONDI = 3
NODI = PER_MONDO * MONDI


def build_ponte_graph():
    """Tre mondi: A (0..99), B (100..199), e il PONTE (200..299), vicino a entrambi.

    A e B **non** sono vicini fra loro: senza il ponte sarebbero due filoni chiusi. Il ponte riceve massa da
    tutte e due le camminate, quindi è l'unico posto dove `sqrt(r_A * r_B)` può essere grande.
    """
    rows, cols, vals = [], [], []

    def edge(u, v, w):
        rows.extend([u, v])
        cols.extend([v, u])
        vals.extend([w, w])

    for m in range(MONDI):
        start, end = m * PER_MONDO, (m + 1) * PER_MONDO
        for i in range(start, end - 1):
            edge(i, i + 1, 2.0)
        for j in range(start + 1, start + 20):
            edge(start, j, 4.0)

    # Il ponte tocca A e B con un arco vero, non con un filo: la massa deve arrivare.
    edge(0 * PER_MONDO, 2 * PER_MONDO, 0.8)
    edge(1 * PER_MONDO, 2 * PER_MONDO, 0.8)

    W = sp.csr_matrix((vals, (rows, cols)), shape=(NODI, NODI))
    deg = np.asarray(W.sum(1)).ravel()
    deg[deg <= 0] = 1.0
    Tr = sp.diags(1.0 / deg) @ W

    m = object.__new__(MO.Motore)
    m.N = NODI
    m.NB = MONDI
    m.Tr = Tr
    m.MEM = np.repeat(np.arange(MONDI), PER_MONDO).astype(np.int32)
    m.SZ = np.bincount(m.MEM)
    m.MEMBRI = [np.where(m.MEM == b)[0].astype(np.int32) for b in range(MONDI)]
    m.VICINI = [
        np.array([2], dtype=np.int32),
        np.array([2], dtype=np.int32),
        np.array([0, 1], dtype=np.int32),
    ]

    m.VAVE = np.full(NODI, 7.2, dtype=np.float32)
    m.VOT = np.full(NODI, 400.0, dtype=np.float32)
    m.POP = np.full(NODI, 25.0, dtype=np.float32)
    for b, voti, vave in ((0, 5000.0, 7.2), (1, 400.0, 7.0), (2, 2000.0, 7.4)):
        nodi_b = m.MEMBRI[b]
        m.VOT[nodi_b] = np.linspace(voti * 0.7, voti * 1.3, len(nodi_b), dtype=np.float32)
        m.VAVE[nodi_b] = vave

    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(MONDI)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(MONDI)], dtype=np.float32)
    m.ANNO = np.full(NODI, 2021, dtype=np.int32)
    m.NEP = np.full(NODI, 1.0, dtype=np.float32)
    m.COZY = np.zeros(NODI, dtype=np.float32)
    m.IMP = np.zeros(NODI, dtype=np.float32)
    m.QUOTA_TV = np.zeros(MONDI, dtype=np.float32)
    m.QUOTA_COZY = np.zeros(MONDI, dtype=np.float32)
    m.QUOTA_IMP = np.zeros(MONDI, dtype=np.float32)
    m.LISTDEG = np.zeros(NODI, dtype=np.float32)
    m.TIT = np.array([f"Film_{i}" for i in range(NODI)])
    m.COLL = None
    m.DIR = None
    m.REGISTA = None
    m.artefatto = "mock-artefatto-ticket-09"

    B.KEYS = [f"movie:{1000 + i}" for i in range(NODI)]
    B.ROW_OF = {k: i for i, k in enumerate(B.KEYS)}
    B.IS_TV = np.zeros(NODI, dtype=bool)
    return m


def semi(m, bolla, quanti, da=0):
    return [B.KEYS[int(x)] for x in m.MEMBRI[bolla][da:da + quanti]]


def storia(chiavi):
    return [(ch, 1, "watched", None) for ch in chiavi]


def righe(res, prefisso):
    return [li for li in res["liste"] if str(li["tipo"]).startswith(prefisso)]


def bolle_di(m, titoli):
    return [int(m.MEM[B.ROW_OF[ch]]) for ch in titoli]


def main():
    print("=" * 84)
    print("TICKET 09 — PUNTI D'INCONTRO (crossover dei gusti)")
    print("=" * 84)

    print("\n1. PARAMETRI DICHIARATI")
    assert float(P.PUNTI_INCONTRO_VAVE_MIN) == 6.8, f"atteso 6.8, trovato {P.PUNTI_INCONTRO_VAVE_MIN}"
    assert int(P.PUNTI_INCONTRO_MONDI_FALLBACK) == 2
    print(f"  VAVE_MIN={P.PUNTI_INCONTRO_VAVE_MIN} · MONDI_FALLBACK={P.PUNTI_INCONTRO_MONDI_FALLBACK}")
    print("  -> OK")

    print("\n2. DUE FILONI NETTI: IL PONTE VIVE SOLO DOVE ARRIVANO ENTRAMBE LE CAMMINATE")
    m = build_ponte_graph()
    a_semi = semi(m, 0, 6)
    b_semi = semi(m, 1, 6)
    res = m.lista(storia(a_semi + b_semi), cap=20, medium="movie")

    clusters = righe(res, "micro_cluster")
    ponti = righe(res, "punti_incontro")
    print(f"  filoni: {[li['cluster_id'] for li in clusters]} · ponti: {[li['coppia_id'] for li in ponti]}")
    assert len(clusters) == 2, f"FALLITO: attesi 2 filoni, trovati {len(clusters)}"
    assert len(ponti) == 1, f"FALLITO: atteso 1 ponte per 2 filoni, trovati {len(ponti)}"
    ponte = ponti[0]
    assert ponte["titoli"], "FALLITO: il ponte è vuoto su un fixture costruito per passare"
    assert ponte.get("fallback") is False, "FALLITO: due filoni non sono un fallback"

    b_ponti = bolle_di(m, [ch for ch, _p in ponte["titoli"]])
    print(f"  titoli del ponte: {len(b_ponti)} · mondi: {sorted(set(b_ponti))} · primi 5: "
          f"{[ch for ch, _p in ponte['titoli'][:5]]}")

    # Le due camminate, ricalcolate qui: la sonda non si fida della formula, la rifà.
    from graph import camminata as C  # noqa: PLC0415
    r_a = C.ppr(m.Tr, np.array([B.ROW_OF[c] for c in a_semi]), np.ones(len(a_semi)), normalizza=True)
    r_b = C.ppr(m.Tr, np.array([B.ROW_OF[c] for c in b_semi]), np.ones(len(b_semi)), normalizza=True)

    def equilibrio(chiave):
        x = B.ROW_OF[chiave]
        return float(min(r_a[x], r_b[x]) / max(r_a[x], r_b[x])) if max(r_a[x], r_b[x]) > 0 else 0.0

    # 1) Ogni titolo della riga riceve massa da ENTRAMBE le camminate: e' la definizione di ponte.
    assert all(r_a[B.ROW_OF[ch]] > 0 and r_b[B.ROW_OF[ch]] > 0 for ch, _p in ponte["titoli"]), (
        "FALLITO: nel ponte c'e' un titolo assente da una delle due camminate (prodotto zero)"
    )

    # 2) I primi titoli NON sono tutti del filone dominante (la prova che chiede il ticket): un ponte
    #    fatto di un filone solo sarebbe la media aritmetica travestita.
    primi5_bolle = b_ponti[:5]
    print(f"  mondi dei primi 5: {primi5_bolle} · equilibrio del primo: {equilibrio(ponte['titoli'][0][0]):.4f}")
    assert len(set(primi5_bolle)) >= 2, (
        f"FALLITO: i primi 5 vengono tutti dallo stesso filone ({primi5_bolle}): e' la media aritmetica"
    )
    assert b_ponti[0] == 2, (
        f"FALLITO: il primo titolo del ponte vive nel mondo {b_ponti[0]}, non in quello che riceve massa da entrambi"
    )

    # 3) La geometrica preferisce l'EQUILIBRIO: il primo del ponte e' piu' bilanciato del primo di un filone.
    primo_filone = clusters[0]["titoli"][0][0]
    eq_ponte = equilibrio(ponte["titoli"][0][0])
    eq_filone = equilibrio(primo_filone)
    print(f"  equilibrio primo del ponte {eq_ponte:.4f} vs primo di un filone {eq_filone:.4f}")
    assert eq_ponte > eq_filone, (
        "FALLITO: il ponte non preferisce i titoli bilanciati: e' la somma dei filoni, non il loro incontro"
    )

    # 4) Un titolo profondo in un filone (fortissimo la', quasi assente nell'altro) NON entra.
    profondo_a = B.KEYS[int(m.MEMBRI[0][90])]
    profondo_b = B.KEYS[int(m.MEMBRI[1][90])]
    assert profondo_a not in [ch for ch, _p in ponte["titoli"]], (
        "FALLITO: entra un titolo forte in UN solo filone: è la media aritmetica travestita"
    )
    assert profondo_b not in [ch for ch, _p in ponte["titoli"]], "FALLITO: entra un titolo forte in un solo filone"
    print("  -> OK: solo chi riceve massa da entrambi, e il primo posto è un titolo bilanciato")

    print("\n3. LE RIGHE DEI SINGOLI FILONI NON SONO IL PONTE")
    mondo_di = {li["cluster_id"]: sorted(set(bolle_di(m, [ch for ch, _p in li["titoli"]]))) for li in clusters}
    print(f"  b0 (filone A) tocca i mondi {mondo_di.get('b0')}")
    print(f"  b1 (filone B) tocca i mondi {mondo_di.get('b1')}")
    assert mondo_di.get("b0") and all(b in (0, 2) for b in mondo_di["b0"]), "FALLITO: il filone A esce dal suo mondo"
    assert mondo_di.get("b1") and all(b in (1, 2) for b in mondo_di["b1"]), "FALLITO: il filone B esce dal suo mondo"
    assert [ch for ch, _p in ponte["titoli"]] != [ch for ch, _p in clusters[0]["titoli"]], (
        "FALLITO: il ponte è il doppione del filone dominante"
    )
    print("  -> OK: il ponte non è il doppione di nessuno dei due filoni")

    print("\n4. IL PONTE NON COSTA CAMMINATE (riusa le r_k del 08)")
    chiamate = []
    originale = m.diffondi

    def spia(righe_semi, plays, tipi=None, pesi=None):
        chiamate.append(len(righe_semi))
        return originale(righe_semi, plays, tipi=tipi, pesi=pesi)

    m.diffondi = spia
    res_bis = m.lista(storia(a_semi + b_semi), cap=20, medium="movie")
    del m.diffondi
    print(f"  semi per camminata: {chiamate} (attese: 1 principale + 2 filoni)")
    assert chiamate == [12, 6, 6], f"FALLITO: camminate inattese: {chiamate}"
    assert [li["coppia_id"] for li in righe(res_bis, "punti_incontro")] == [ponte["coppia_id"]], (
        "FALLITO: il ponte non è stabile fra due richieste identiche"
    )
    print("  -> OK: zero diffusioni in più")

    print("\n5. FALLBACK: UN FILONE SOLO, DUE MONDI LONTANI, DICHIARATO")
    m2 = build_ponte_graph()
    # Semi in A e nel ponte: A e il ponte sono vicini, quindi UN filone solo. I due mondi differiscono di
    # notorietà, quindi `scegli_mondi` con lontano=1.0 li sceglie davvero.
    res_fb = m2.lista(storia(semi(m2, 0, 5) + semi(m2, 2, 5)), cap=20, medium="movie")
    ponti_fb = righe(res_fb, "punti_incontro")
    print(f"  filoni: {[li['cluster_id'] for li in righe(res_fb, 'micro_cluster')]} · "
          f"ponti: {[(li['coppia_id'], li.get('fallback'), len(li['titoli'])) for li in ponti_fb]}")
    assert len(ponti_fb) == 1, f"FALLITO: attesa una riga di ponte, trovate {len(ponti_fb)}"
    assert ponti_fb[0].get("fallback") is True, "FALLITO: il fallback non è dichiarato"
    assert ponti_fb[0]["coppia_id"] == "b0_b2", f"FALLITO: mondi scelti {ponti_fb[0]['coppia_id']} invece di b0_b2"
    assert ponti_fb[0]["titoli"], "FALLITO: il fallback esce vuoto dove due mondi con semi esistono"
    assert ponti_fb[0]["titoli_seme"], "FALLITO: il fallback non porta i semi dei due mondi"
    print("  -> OK: fallback dichiarato, e la riga si riempie")

    print("\n6. FALLBACK IMPOSSIBILE: TUTTI I SEMI IN UN MONDO, LA RIGA LO DICE")
    m3 = build_ponte_graph()
    log = io.StringIO()
    with contextlib.redirect_stderr(log):
        res_unico = m3.lista(storia(semi(m3, 0, 8)), cap=20, medium="movie")
    ponti_unico = righe(res_unico, "punti_incontro")
    motivi = [m_ for m_ in (res_unico.get("motivi") or []) if "punti_incontro" in m_]
    print(f"  righe di ponte: {[(li['tipo'], len(li['titoli']), li.get('motivo')) for li in ponti_unico]}")
    print(f"  motivi: {motivi}")
    assert len(ponti_unico) == 1, "FALLITO: la riga di ponte sparisce invece di dichiararsi"
    assert ponti_unico[0]["titoli"] == [] and ponti_unico[0].get("motivo"), "FALLITO: riga vuota senza motivo"
    assert motivi, "FALLITO: un ponte impossibile non finisce nei motivi del payload"
    print("  -> OK: nessun ponte inventato, e il motivo arriva al chiamante")

    print("\n7. IL CONTRATTO HTTP")
    coppia_a, coppia_b = [int(x.lstrip("b")) for x in ponte["coppia_id"].split("_")]
    assert coppia_a == 0 and coppia_b == 1, f"FALLITO: coppia inattesa {ponte['coppia_id']}"
    payload = {
        "semi": [{"tmdbId": int(ch.split(":")[1]), "medium": "movie", "tipo": "watched"}
                 for ch in a_semi + b_semi],
        "medium": "movie",
        "cap": 20,
    }
    status, res_s = S.esegui_richiesta(payload, m)
    ponte_s = [li for li in res_s["liste"] if str(li["ruolo"]).startswith("punti_incontro")]
    print(f"  status={status} · righe={len(ponte_s)}")
    for li in ponte_s:
        print(f"  {li['ruolo']:<18} coppia={li.get('coppia_id')} fallback={li.get('fallback')} "
              f"descrizione={li['descrizione']!r} semi={len(li['semi'])} titoli={len(li['titoli'])}")
        assert li["descrizione"].startswith("Tra «"), f"FALLITO: descrizione non parlante: {li['descrizione']!r}"
        assert li.get("coppia_id"), "FALLITO: coppia_id non arriva al chiamante"
        assert li.get("fallback") is False, "FALLITO: fallback sbagliato nel contratto"
        assert li.get("parziale") is True, "FALLITO: la riga non dichiara parziale"
        assert li["semi"], "FALLITO: la riga non porta i semi delle due sponde"

    print("\n8. PAVIMENTO E ANTI-MONOPOLIO")
    for ch, _p in ponte["titoli"]:
        x = B.ROW_OF[ch]
        assert float(m.VAVE[x]) >= float(P.PUNTI_INCONTRO_VAVE_MIN), f"FALLITO: {ch} sotto il pavimento VAVE 6.8"
        assert float(m.VOT[x]) >= float(P.PAVIMENTO_VOT_MIN), f"FALLITO: {ch} sotto il pavimento VOT"
    punteggi = [p for _ch, p in ponte["titoli"]]
    assert punteggi == sorted(punteggi, reverse=True), "FALLITO: punteggi non monotoni"
    print(f"  {len(punteggi)} titoli, tutti sopra i due pavimenti, punteggi monotoni")
    print("  -> OK")

    print("\n" + "=" * 84)
    print("TUTTE LE PROVE SUPERATE — OK")
    print("=" * 84)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\n{e}")
        sys.exit(1)
