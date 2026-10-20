"""probe-ticket-07-ultime-visioni.py — Sonda del Ticket 07 («sul filo delle tue ultime visioni»).

La premessa misurata in parametri.py: la recenza NON funziona come peso (NIENTE_RECENZA, NIENTE_BOOST:
il boost sui punteggi e' vuoto), ma fortissimo come SELEZIONE (i soli ultimi 15 fanno 47,5x contro
18,2x). Questa sonda prova che il motore la usa cosi':

1. i parametri esistono e valgono quello che il ticket dichiara;
2. la riga `ultime_visioni` esiste e non e' vuota su un fixture costruito per passare (un OK su zero
   titoli non e' una verifica);
3. **due giri con gli STESSI semi e la RECENZA INVERTITA danno prime posizioni diverse**: la selezione
   funziona. Attenzione a cosa prova questa sonda e cosa no: qui si prova il passo flag -> riga; il passo
   data -> flag (due giri con le stesse date cambiate di posto) e' provato dai test Node
   `tests/ultimeVisioniRecenza.test.js` e `tests/semiRecenzaFonteVera.test.js`, sull'altro lato del contratto;
4. gli stessi semi mandati SENZA flag danno una `il_tuo_mondo` IDENTICA: la recenza non e' un peso, e la
   diffusione principale non e' stata toccata;
5. con meno di 3 semi recenti la riga **lo dichiara** (motore e contratto HTTP), non sparisce;
6. il pavimento di qualita' vale anche su questa riga.
"""
import json
import pathlib
import sys

import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
ROOT = QUI.parents[1]
sys.path.insert(0, str(ROOT / "services"))

from graph import bubbles as B  # noqa: E402
from graph import parametri as P  # noqa: E402
from graph import servizio as S  # noqa: E402

exec(open(QUI / "probe-ticket-05-gemme.py").read().split("def test_due_profili_opposti")[0])  # noqa: S102


def semi(chiave, recente):
    """Un seme nel formato del contratto del motore: (chiave, plays, tipo, peso, recente)."""
    return (chiave, 1, "watched", None, bool(recente))


def riga(res, ruolo):
    return next((li for li in res["liste"] if li["tipo"] == ruolo), None)


def primi(li, quanti=5):
    return [t[0] for t in (li or {}).get("titoli", [])[:quanti]]


def main():
    print("=" * 84)
    print("TICKET 07 — SUL FILO DELLE TUE ULTIME VISIONI (recenza come selezione)")
    print("=" * 84)

    print("\n1. PARAMETRI DICHIARATI")
    assert P.ULTIME_VISIONI_MIN_SEMI == 3, f"atteso 3, trovato {P.ULTIME_VISIONI_MIN_SEMI}"
    assert P.ULTIME_VISIONI_BOLLE_MAX == 4, f"atteso 4, trovato {P.ULTIME_VISIONI_BOLLE_MAX}"
    assert P.ALPHA == 0.60, f"ALPHA e' cambiato: {P.ALPHA} — questa e' una seconda camminata, non un peso"
    assert P.NIENTE_RECENZA is True and P.NIENTE_BOOST is True, "le misure che hanno bocciato la recenza come peso non ci sono piu'"
    print(f"  ULTIME_VISIONI_MIN_SEMI  = {P.ULTIME_VISIONI_MIN_SEMI}")
    print(f"  ULTIME_VISIONI_BOLLE_MAX = {P.ULTIME_VISIONI_BOLLE_MAX}")
    print(f"  ALPHA (diffusione principale) = {P.ALPHA} — intatto")
    print("  -> OK")

    m = build_dual_world_graph()
    w2, w6 = m.MEMBRI[2], m.MEMBRI[6]          # due mondi mainstream distinti
    semi_w2 = [B.KEYS[int(w2[5 + i])] for i in range(3)]
    semi_w6 = [B.KEYS[int(w6[5 + i])] for i in range(3)]
    storia = [semi(ch, False) for ch in semi_w2 + semi_w6]

    print("\n2. DUE GIRI, STESSI SEMI, RECENZA INVERTITA")
    print(f"  semi totali: {len(storia)} | recenti nel giro A: i 3 di mondo 2 | nel giro B: i 3 di mondo 6")
    giro_a = [semi(ch, ch in semi_w2) for ch in semi_w2 + semi_w6]
    giro_b = [semi(ch, ch in semi_w6) for ch in semi_w2 + semi_w6]
    res_a = m.lista(giro_a, cap=20, medium="movie")
    res_b = m.lista(giro_b, cap=20, medium="movie")

    uv_a, uv_b = riga(res_a, "ultime_visioni"), riga(res_b, "ultime_visioni")
    assert uv_a is not None, "FALLITO: la riga ultime_visioni non esiste nella risposta (giro A)"
    assert uv_b is not None, "FALLITO: la riga ultime_visioni non esiste nella risposta (giro B)"

    titoli_a = [t[0] for t in uv_a["titoli"]]
    titoli_b = [t[0] for t in uv_b["titoli"]]
    print(f"  giro A: {len(titoli_a)} titoli | primi 5: {primi(uv_a)}")
    print(f"  giro B: {len(titoli_b)} titoli | primi 5: {primi(uv_b)}")

    assert len(titoli_a) > 0 and len(titoli_b) > 0, (
        "FALLITO: la riga e' VUOTA sul fixture costruito per passare. "
        "Una sonda che dice OK su zero titoli non e' una verifica."
    )
    assert primi(uv_a) != primi(uv_b), (
        "FALLITO: con date invertite le prime posizioni NON cambiano: la recenza non sta selezionando niente"
    )

    mondo_di = {B.KEYS[int(x)]: int(m.MEM[x]) for x in range(m.N)}
    a_del_mondo_2 = [t for t in titoli_a[:5] if mondo_di[t] == 2]
    b_del_mondo_6 = [t for t in titoli_b[:5] if mondo_di[t] == 6]
    print(f"  giro A: {len(a_del_mondo_2)}/5 nei primi 5 vengono dal mondo dei semi recenti (2)")
    print(f"  giro B: {len(b_del_mondo_6)}/5 nei primi 5 vengono dal mondo dei semi recenti (6)")
    assert len(a_del_mondo_2) >= 3, "FALLITO: i primi 5 del giro A non seguono il filone recente"
    assert len(b_del_mondo_6) >= 3, "FALLITO: i primi 5 del giro B non seguono il filone recente"
    print("  -> OK: la riga cambia appena le ultime visioni cambiano filone")

    print("\n3. LA RECENZA NON E' UN PESO: IL TUO MONDO NON SI MUOVE")
    senza_flag = [semi(ch, False) for ch in semi_w2 + semi_w6]
    res_c = m.lista(senza_flag, cap=20, medium="movie")
    tuo_a = [t[0] for t in riga(res_a, "il_tuo_mondo")["titoli"]]
    tuo_c = [t[0] for t in riga(res_c, "il_tuo_mondo")["titoli"]]
    print(f"  il_tuo_mondo con i flag  : {tuo_a[:5]} ({len(tuo_a)} titoli)")
    print(f"  il_tuo_mondo senza flag  : {tuo_c[:5]} ({len(tuo_c)} titoli)")
    assert tuo_a == tuo_c, (
        "FALLITO: i flag di recenza hanno cambiato la diffusione PRINCIPALE. "
        "La recenza e' una selezione: una seconda camminata, non un peso sul resto."
    )
    print("  -> OK: identica, bit per bit")

    print("\n4. CON MENO DI 3 SEMI RECENTI LA RIGA LO DICHIARA")
    storta = [semi(ch, i == 0) for i, ch in enumerate(semi_w2 + semi_w6)]
    res_d = m.lista(storta, cap=20, medium="movie")
    uv_d = riga(res_d, "ultime_visioni")
    assert uv_d is not None, "FALLITO: la riga sparisce quando non ci sono abbastanza semi recenti (silenzio)"
    print(f"  motore  : titoli={len(uv_d['titoli'])} corta={uv_d.get('corta')} "
          f"recenti={uv_d.get('semi_recenti')} motivo={uv_d.get('motivo')!r}")
    assert uv_d["titoli"] == [] and uv_d.get("corta") is True, "FALLITO: la riga esce non vuota con 1 solo seme recente"
    assert uv_d.get("motivo") and "semi recenti" in uv_d["motivo"], "FALLITO: la riga vuota non dichiara il motivo"

    payload = {
        "semi": [{"tmdbId": int(ch.split(":")[1]), "medium": "movie", "tipo": "watched",
                  "recente": i == 0} for i, ch in enumerate(semi_w2 + semi_w6)],
        "medium": "movie",
        "cap": 20,
    }
    status, res_s = S.esegui_richiesta(payload, m)
    assert status == 200, f"FALLITO: il servizio ha risposto {status}"
    uv_s = next((li for li in res_s["liste"] if li["ruolo"] == "ultime_visioni"), None)
    assert uv_s is not None, "FALLITO: il contratto HTTP sopprime la riga vuota invece di restituirla"
    print(f"  contratto: vuota={uv_s.get('vuota')} motivo={uv_s.get('motivo')!r}")
    assert uv_s.get("vuota") is True and uv_s.get("motivo"), "FALLITO: il contratto non dichiara la riga vuota"
    assert any("ultime_visioni" in m_ for m_ in res_s.get("motivi", [])), "FALLITO: la riga vuota non finisce nei motivi"
    print("  -> OK: nessuna lista sparisce in silenzio")

    print("\n5. CON TRE SEMI RECENTI IL CONTRATTO PORTA LA RIGA PIENA")
    payload_ok = {
        "semi": [{"tmdbId": int(ch.split(":")[1]), "medium": "movie", "tipo": "watched",
                  "recente": ch in semi_w2} for ch in semi_w2 + semi_w6],
        "medium": "movie",
        "cap": 20,
    }
    status, res_ok = S.esegui_richiesta(payload_ok, m)
    uv_ok = next((li for li in res_ok["liste"] if li["ruolo"] == "ultime_visioni"), None)
    assert status == 200 and uv_ok is not None, f"FALLITO: contratto {status} senza la riga ultime_visioni"
    print(f"  titoli: {len(uv_ok['titoli'])} | descrizione: {uv_ok['descrizione']!r}")
    print(f"  semi recenti dichiarati dal motore: {res_ok['semi'].get('recenti')}")
    assert len(uv_ok["titoli"]) > 0, "FALLITO: con 3 semi recenti la riga esce vuota"
    assert "ultime visioni" in uv_ok["descrizione"], "FALLITO: la descrizione della riga non la nomina"
    assert res_ok["semi"].get("recenti") == 3, (
        f"FALLITO: il motore dichiara {res_ok['semi'].get('recenti')} semi recenti invece di 3"
    )

    print("\n6. IL PAVIMENTO DI QUALITA' VALE ANCHE QUI")
    for li in (uv_a, uv_b):
        assert li["titoli"], "FALLITO: riga vuota dove il fixture doveva passare"
        for ch, _p in li["titoli"]:
            x = B.ROW_OF[ch]
            assert float(m.VAVE[x]) >= P.PAVIMENTO_VAVE_MIN, f"FALLITO: {ch} ha VAVE {m.VAVE[x]} sotto il pavimento"
            assert float(m.VOT[x]) >= P.PAVIMENTO_VOT_MIN, f"FALLITO: {ch} ha VOT {m.VOT[x]} sotto il pavimento"
    print(f"  tutti i titoli delle due righe hanno VAVE >= {P.PAVIMENTO_VAVE_MIN} e VOT >= {P.PAVIMENTO_VOT_MIN}")
    print("  -> OK: il pavimento non si abbassa per riempire")

    print("\n" + "=" * 84)
    print("TUTTE LE PROVE SUPERATE — OK")
    print("=" * 84)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\n{e}")
        sys.exit(1)
