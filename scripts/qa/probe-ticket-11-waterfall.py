"""probe-ticket-11-waterfall.py — Sonda del Ticket 11 (waterfall dedup).

Il difetto: le righe sono additive e lo stesso titolo può stare in più righe hero. Questa sonda prova:

1. un titolo idoneo a **più righe** (recente per le uscite, alto per i classici, nel bacino di «il tuo
   mondo» e nel filone di un micro-cluster) compare **una volta sola**;
2. i **doppioni prima/dopo** misurati sulla stessa risposta: `prima` = quelli tolti dal waterfall più le
   sovrapposizioni rimaste, `dopo` = solo l'unica sovrapposizione ammessa (il tuo mondo × micro-cluster);
3. la **specificità è un dato**: ogni riga porta un intero, e l'ordine è quello della tabella — non
   l'ordine accidentale del codice;
4. il dedup **non svuota in silenzio**: ogni riga che perde titoli o resta corta lo dichiara;
5. il contratto porta `specificita` e `doppioni_tolti`.
"""
import pathlib
import sys
from collections import Counter

import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
ROOT = QUI.parents[1]
sys.path.insert(0, str(ROOT / "services"))

from graph import bubbles as B  # noqa: E402
from graph import canon as K  # noqa: E402
from graph import motore as MO  # noqa: E402
from graph import parametri as P  # noqa: E402
from graph import servizio as S  # noqa: E402

exec(open(QUI / "probe-ticket-05-gemme.py").read().split("def test_due_profili_opposti")[0])  # noqa: S102


def righe_di(res):
    return [li for li in res["liste"]]


def doppi_di(res):
    conta = Counter(ch for li in righe_di(res) for ch, _p in li["titoli"])
    return {ch: n for ch, n in conta.items() if n > 1}


def main():
    print("=" * 84)
    print("TICKET 11 — WATERFALL DEDUP")
    print("=" * 84)

    print("\n1. LA SPECIFICITA' E' UN DATO, E L'ORDINE E' QUELLO")
    assert MO.SPECIFICITA["uscite_nuove"] < MO.SPECIFICITA["il_tuo_mondo"], (
        "FALLITO: le uscite (bacino stretto) devono pescare prima di il tuo mondo"
    )
    assert MO.famiglia_riga("micro_cluster_2") == "micro_cluster"
    assert MO.famiglia_riga("mondo_3379") == "mondo"
    print(f"  tabella: {MO.SPECIFICITA}")
    print(f"  sovrapposizioni ammesse col micro-cluster: {P.WATERFALL_SOVRAPPOSIZIONE_MICRO}")

    print("\n2. UN TITOLO IDONEO A PIU' RIGHE: NEI POOL PRIMA, IN UNA RIGA SOLA DOPO")

    def fixture_righe_multiple():
        """Un titolo recente, alto-consenso e nel bacino: idoneo a piu' righe."""
        fixt = build_dual_world_graph()
        w0 = fixt.MEMBRI[0]
        x = int(w0[30])
        fixt.VOT[x] = 3000.0
        fixt.VAVE[x] = 7.9
        fixt.POP[x] = 5.0
        fixt.ANNO[x] = 2026
        fixt.VOTMED = np.array([K.mediana_voti(fixt.VOT[fixt.MEMBRI[b]]) for b in range(fixt.NB)], dtype=np.float32)
        fixt.VAVEMEAN = np.array([float(np.mean(fixt.VAVE[fixt.MEMBRI[b]])) for b in range(fixt.NB)], dtype=np.float32)
        fixt.USCITE = None
        st = [(B.KEYS[int(w0[i])], 1, "watched", None) for i in range(6)]
        return fixt, st, B.KEYS[x]

    # IL «PRIMA» si misura sul campo: stesso codice, stesso fixture, waterfall spento (identita'). I pool
    # restano nel dict, e sono la prova che il titolo era idoneo a piu' righe — non un commento.
    m_prima, storia, chiave = fixture_righe_multiple()
    m_prima.waterfall_righe = lambda liste, cap: liste
    res_prima = m_prima.lista(storia, cap=20, medium="movie")
    prima = Counter(ch for li in righe_di(res_prima) for ch, _p in li["titoli"])
    nei_pool = [li["tipo"] for li in righe_di(res_prima)
                if chiave in [ch for ch, _ in (li.get("_pool") or li["titoli"])]]
    print(f"  senza waterfall, {chiave} e' idoneo a {len(nei_pool)} righe (nei pool): {nei_pool}")
    assert len(nei_pool) >= 2, (
        f"FALLITO: la prova non ha materia — il titolo scelto era in {len(nei_pool)} pool"
    )

    print("\n2b. IL «DOPO»: CON IL WATERFALL COMPARE UNA VOLTA SOLA")
    m, storia_dopo, chiave_dopo = fixture_righe_multiple()
    assert chiave_dopo == chiave
    res = m.lista(storia_dopo, cap=20, medium="movie")
    dove = [li["tipo"] for li in righe_di(res) if chiave in [ch for ch, _p in li["titoli"]]]
    righe = {li["tipo"]: len(li["titoli"]) for li in righe_di(res)}
    print(f"  con waterfall, {chiave} sta in {len(dove)} righe: {dove}")
    print(f"  righe: {righe}")
    assert len(dove) == 1, f"FALLITO: il titolo idoneo a piu' righe compare in {len(dove)}: {dove}"

    print("\n2c. UNA RIGA CHE PERDE TUTTI I TITOLI LO DICHIARA (NON SPARISCE)")
    m2 = build_dual_world_graph()
    w2 = m2.MEMBRI[0]
    y = int(w2[40])
    # Una gemma (nicchia: VOT basso in assoluto, VAVE sopra la media della bolla) che e' anche **recente**:
    # idonea a `nicchia_di_qualita` (20) e a `uscite_nuove` (10). Le uscite pescano prima e la prendono.
    m2.VOT[y] = 300.0
    m2.VAVE[y] = 7.9
    m2.ANNO[y] = 2026
    m2.VOTMED = np.array([K.mediana_voti(m2.VOT[m2.MEMBRI[b]]) for b in range(m2.NB)], dtype=np.float32)
    m2.VAVEMEAN = np.array([float(np.mean(m2.VAVE[m2.MEMBRI[b]])) for b in range(m2.NB)], dtype=np.float32)
    m2.USCITE = None
    res2 = m2.lista([(B.KEYS[int(w2[i])], 1, "watched", None) for i in range(6)], cap=20, medium="movie")
    uv2 = next(li for li in res2["liste"] if li["tipo"] == "uscite_nuove")
    nic2 = next(li for li in res2["liste"] if li["tipo"] == "nicchia_di_qualita")
    print(f"  gemma recente {B.KEYS[y]}: uscite={[ch for ch, _p in uv2['titoli']]} · "
          f"nicchia={len(nic2['titoli'])} titoli, copie evitate={nic2['doppioni_tolti']}, motivo={nic2.get('motivo')!r}")
    assert B.KEYS[y] in [ch for ch, _p in uv2["titoli"]], (
        "FALLITO: la gemma recente non e' finita nelle uscite"
    )
    assert B.KEYS[y] not in [ch for ch, _p in nic2["titoli"]], (
        "FALLITO: la stessa gemma e' in due righe (uscite e nicchia)"
    )
    assert nic2["doppioni_tolti"] >= 1 and nic2.get("motivo"), (
        "FALLITO: la riga svuotata dal dedup non dichiara di aver perso i titoli"
    )

    print("\n3. COPIE DOPPIE PRIMA / DOPO, MISURATE SULLE DUE RISPOSTE")
    doppi_prima = {ch: n for ch, n in prima.items() if n > 1}
    doppi = doppi_di(res)
    tolti = sum(int(li.get("doppioni_tolti", 0)) for li in righe_di(res))
    print(f"  prima: {len(doppi_prima)} titoli in piu' righe "
          f"({sum(n - 1 for n in doppi_prima.values())} copie in eccesso)")
    print(f"  dopo : {len(doppi)} titoli in piu' righe ({sum(n - 1 for n in doppi.values())} copie in eccesso)")
    print(f"  copie evitate dichiarate dal waterfall: {tolti} (non e' il «prima»: conta anche i candidati)")
    assert doppi_prima, "FALLITO: senza waterfall non c'erano doppioni: la prova del dedup non ha materia"
    assert len(doppi) <= int(P.WATERFALL_SOVRAPPOSIZIONE_MICRO), (
        f"FALLITO: restano {len(doppi)} doppioni, il ticket ne ammette {P.WATERFALL_SOVRAPPOSIZIONE_MICRO}"
    )
    for ch, n in doppi.items():
        righe_con = [li["tipo"] for li in righe_di(res) if ch in [c for c, _p in li["titoli"]]]
        assert n == 2 and "il_tuo_mondo" in righe_con and any(t.startswith("micro_cluster") for t in righe_con), (
            f"FALLITO: doppione non ammesso {ch} in {righe_con}"
        )
    if doppi:
        print(f"  l'unica sovrapposizione: {list(doppi.items())[:3]} (il tuo mondo x micro-cluster)")

    print("\n4. LA SPECIFICITA' E' UN DATO, E IL PROPRIETARIO E' LA RIGA PIU' SPECIFICA")
    for li in righe_di(res):
        fam = MO.famiglia_riga(li["tipo"])
        assert fam in P.SPECIFICITA, f"FALLITO: famiglia senza voce in tabella: {fam}"
        assert li["specificita"] == int(P.SPECIFICITA[fam]), (
            f"FALLITO: {li['tipo']} porta specificita' {li['specificita']}, la tabella dice {P.SPECIFICITA[fam]}"
        )
    ordinate = sorted(righe_di(res), key=lambda li: (li["specificita"], li["tipo"]))
    print(f"  ordine: {[(li['tipo'], li['specificita']) for li in ordinate]}")
    # La proprieta' vera: per ogni titolo che prima stava in piu' righe, il proprietario e' la famiglia a
    # specificita' MINIMA fra quelle che lo avevano (unica eccezione: la sovrapposizione ammessa).
    famiglie_prima = {}
    for li in righe_di(res_prima):
        for ch, _p in li["titoli"]:
            famiglie_prima.setdefault(ch, set()).add(MO.famiglia_riga(li["tipo"]))
    proprietario = {ch: MO.famiglia_riga(li["tipo"]) for li in righe_di(res) for ch, _p in li["titoli"]}
    violazioni = []
    for ch, fams in famiglie_prima.items():
        if len(fams) < 2 or ch not in proprietario:
            continue
        attesa = min(fams, key=lambda f: P.SPECIFICITA.get(f, P.SPECIFICITA_DEFAULT))
        if proprietario[ch] != attesa:
            violazioni.append((ch, proprietario[ch], attesa))
    condivisi = sum(1 for fams in famiglie_prima.values() if len(fams) > 1)
    print(f"  titoli che prima stavano in piu' righe: {condivisi} · proprietario sbagliato: {len(violazioni)}")
    assert len(violazioni) <= int(P.WATERFALL_SOVRAPPOSIZIONE_MICRO), (
        f"FALLITO: il titolo non va alla riga piu' specifica: {violazioni[:5]}"
    )
    for li in righe_di(res):
        if li.get("doppioni_tolti"):
            assert len(li["titoli"]) == int(li.get("target_dimensione", 0)) or li.get("motivo"), (
                f"FALLITO: {li['tipo']} ha perso titoli e non lo dichiara"
            )
    il_tuo = next(li for li in righe_di(res) if li["tipo"] == "il_tuo_mondo")
    assert len(il_tuo["titoli"]) == int(il_tuo["target_dimensione"]), (
        f"FALLITO: il tuo mondo e' rimasto a {len(il_tuo['titoli'])}/{il_tuo['target_dimensione']}"
    )
    print(f"  il tuo mondo pieno: {len(il_tuo['titoli'])}/{il_tuo['target_dimensione']}")

    print("\n5. IL CONTRATTO PORTA SPECIFICITA' E DOPPIONI")
    payload = {"semi": [{"tmdbId": int(ch.split(":")[1]), "medium": "movie", "tipo": "watched"}
                        for ch, _pl, _tp, _ps in storia_dopo],
               "medium": "movie", "cap": 20}
    status, res_s = S.esegui_richiesta(payload, m)
    assert status == 200, f"FALLITO: servizio {status}"
    for li in res_s["liste"]:
        assert "specificita" in li, f"FALLITO: {li['ruolo']} senza specificita' nel contratto"
        assert "doppioni_tolti" in li, f"FALLITO: {li['ruolo']} senza doppioni_tolti nel contratto"
    ruoli = [(li["ruolo"], li["specificita"]) for li in res_s["liste"]]
    print(f"  contratto: {ruoli}")

    print("\n6. LE RIGHE SPECIALISTICHE TENGONO IL LORO TITOLO MIGLIORE")
    primo_uv = next((li for li in righe_di(res) if li["tipo"] == "uscite_nuove"), None)
    assert primo_uv is not None, "FALLITO: manca uscite_nuove"
    assert chiave in [ch for ch, _p in primo_uv["titoli"]], (
        "FALLITO: il titolo recente migliore non e' nella riga delle uscite: l'ha preso una riga meno specifica"
    )
    print(f"  uscite_nuove: {[ch for ch, _p in primo_uv['titoli']]}")

    print("\n" + "=" * 84)
    print("TUTTE LE PROVE SUPERATE — OK")
    print("=" * 84)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\n{e}")
        sys.exit(1)
