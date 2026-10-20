"""probe-ticket-08-micro-cluster.py — Sonda del Ticket 08 (micro-cluster dei filoni).

La premessa: `Motore.lista` fa **una** diffusione su tutti i semi (`motore.py:604`), quindi il filone con
più peso decide `r` per tutti. Questa sonda prova che il rimedio esiste e morde:

1. un profilo con **due filoni netti** (6 semi nel filone A, 20 nel filone B) produce **due** righe
   `micro_cluster_*`, e la riga del filone A **non** è fatta di titoli del filone B;
2. **il «prima»**: la diffusione unica di `il_tuo_mondo` su quegli stessi semi è schiacciata dal filone
   dominante — è il difetto che il ticket cura, mostrato con lo stesso fixture;
3. un profilo **monolitico** produce **una** riga, non due o tre inventate;
4. le righe sono **stabili** fra due richieste identiche (`tipo`, `cluster_id`, `titoli_seme`);
5. il **titolo parlante** porta i due semi più pesanti, e il contratto HTTP li restituisce;
6. il **pavimento** vale anche qui, e il peso dei filoni copre il totale;
7. la latenza non esplode con 180 semi (il ticket chiede di dichiarare oltre i 100 ms).
"""
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

PARI = {0, 2, 4, 6}   # il «filone A» del fixture (bolle mainstream)
DISPARI = {1, 3, 5, 7}  # il «filone B» del fixture (bolle d'essai)


def semi_di(m, bolla, quanti):
    membri = m.MEMBRI[bolla]
    return [B.KEYS[int(x)] for x in membri[:quanti]]


def storia_di(chiavi):
    return [(ch, 1, "watched", None) for ch in chiavi]


def righe_cluster(res):
    return [li for li in res["liste"] if str(li["tipo"]).startswith("micro_cluster")]


def membri_di(m, titoli):
    return [int(m.MEM[B.ROW_OF[ch]]) for ch in titoli]


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
    res = m.lista(storia, cap=20, medium="movie")

    cluster = righe_cluster(res)
    print(f"  semi: {len(storia)} ({len(filone_a)} filone A, {len(filone_b)} filone B)")
    for li in cluster:
        print(f"  {li['tipo']:<16} cluster_id={li.get('cluster_id')} quota={li.get('quota_peso')} "
              f"semi={li.get('semi_chiavi') and len(li['semi_chiavi'])} titoli={len(li['titoli'])} "
              f"seme_parlante={li.get('titoli_seme')}")
    assert len(cluster) == 2, f"FALLITO: attese 2 righe di cluster, trovate {len(cluster)}"

    per_id = {}
    for li in cluster:
        mem = membri_di(m, [ch for ch, _p in li["titoli"]])
        per_id[li["cluster_id"]] = mem

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

    print("\n3. IL «PRIMA»: LA DIFFUSIONE UNICA E' SCHIACCIATA DAL FILONE DOMINANTE")
    tuo = next((li for li in res["liste"] if li["tipo"] == "il_tuo_mondo"), None)
    assert tuo is not None, "FALLITO: manca il_tuo_mondo"
    tuo_mem = membri_di(m, [ch for ch, _p in tuo["titoli"][:5]])
    tuo_b = sum(1 for b in tuo_mem if b in DISPARI)
    print(f"  il_tuo_mondo, primi 5: {tuo_b}/5 vengono dal filone B (quello con 20 semi su 26)")
    assert tuo_b >= 3, (
        "FALLITO: il fixture non mostra più lo schiacciamento (la diffusione unica non è dominata dal "
        f"filone B): primi 5 in bolle {tuo_mem}. La prova del «prima» non varrebbe più."
    )
    print("  -> OK: la riga unica segue il filone dominante, le righe di cluster no")

    print("\n4. PROFILO MONOLITICO: UNA RIGA, NON TRE")
    m2 = build_dual_world_graph()
    mono = storia_di(semi_di(m2, 2, 20))
    res_mono = m2.lista(mono, cap=20, medium="movie")
    cluster_mono = righe_cluster(res_mono)
    print(f"  righe di cluster: {len(cluster_mono)} -> {[li['cluster_id'] for li in cluster_mono]}")
    assert len(cluster_mono) == 1, f"FALLITO: un solo filone deve dare una riga, ne dà {len(cluster_mono)}"
    assert cluster_mono[0]["cluster_id"] == "b2", f"FALLITO: cluster ancorato a {cluster_mono[0]['cluster_id']} invece di b2"
    mono_mem = membri_di(m2, [ch for ch, _p in cluster_mono[0]["titoli"]])
    assert mono_mem and all(b in PARI for b in mono_mem), "FALLITO: la riga del filone unico esce dal filone"
    print("  -> OK: nessuna riga inventata")

    print("\n5. STABILITA' FRA DUE RICHIESTE IDENTICHE")
    res_bis = m.lista(storia_di(filone_a + filone_b), cap=20, medium="movie")
    firma = lambda r: [(li["tipo"], li.get("cluster_id"), tuple(li.get("titoli_seme") or [])) for li in righe_cluster(r)]  # noqa: E731
    print(f"  prima : {firma(res)}")
    print(f"  seconda: {firma(res_bis)}")
    assert firma(res) == firma(res_bis), "FALLITO: le righe cambiano identità fra due richieste identiche"
    print("  -> OK: stesso filone, stesso id")

    print("\n6. IL TITOLO PARLANTE")
    for li in cluster:
        semi_parlanti = li.get("titoli_seme") or []
        assert len(semi_parlanti) == 2, f"FALLITO: {li['tipo']} porta {len(semi_parlanti)} titoli-seme invece di 2"
        assert all(isinstance(t, str) and t for t in semi_parlanti), "FALLITO: titoli-seme vuoti o non stringhe"
        assert all(t in m.TIT for t in semi_parlanti), f"FALLITO: titoli-seme che non esistono nel canone: {semi_parlanti}"
    print(f"  cluster[0] ({cluster[0]['cluster_id']}): {cluster[0].get('titoli_seme')} · "
          f"cluster[1] ({cluster[1]['cluster_id']}): {cluster[1].get('titoli_seme')}")

    print("\n7. IL CONTRATTO HTTP PORTA LE RIGHE")
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
        print(f"  {li['ruolo']:<16} descrizione={li['descrizione']!r} semi={len(li['semi'])} "
              f"titoli={len(li['titoli'])} parziale={li.get('parziale')}")
        assert li["descrizione"].startswith("Perché hai amato"), (
            f"FALLITO: la descrizione non è parlante: {li['descrizione']!r}"
        )
        assert li.get("parziale") is True, f"FALLITO: {li['ruolo']} non dichiara parziale"
        assert li["semi"], f"FALLITO: {li['ruolo']} non porta i suoi semi al chiamante"
    assert len(cluster_s) == 2, f"FALLITO: il contratto perde righe (attese 2, trovate {len(cluster_s)})"

    print("\n8. PAVIMENTO E PESO DEI FILONI")
    for li in cluster:
        for ch, _p in li["titoli"]:
            x = B.ROW_OF[ch]
            assert float(m.VAVE[x]) >= P.PAVIMENTO_VAVE_MIN, f"FALLITO: {ch} sotto il pavimento VAVE"
            assert float(m.VOT[x]) >= P.PAVIMENTO_VOT_MIN, f"FALLITO: {ch} sotto il pavimento VOT"
    quota = sum(float(li.get("quota_peso") or 0.0) for li in cluster)
    print(f"  quota di peso coperta dalle righe: {quota:.4f}")
    assert abs(quota - 1.0) < 1e-6, f"FALLITO: le righe non coprono il 100% del peso dei semi ({quota})"
    print("  -> OK: pavimento rispettato, peso dei filoni tutto attribuito")

    print("\n9. LATENZA CON 180 SEMI")
    m3 = build_dual_world_graph()
    molti = storia_di(semi_di(m3, 0, 60) + semi_di(m3, 1, 60) + semi_di(m3, 3, 60))
    t0 = time.perf_counter()
    res_molti = m3.lista(molti, cap=20, medium="movie")
    ms = (time.perf_counter() - t0) * 1000
    print(f"  {len(molti)} semi · {len(righe_cluster(res_molti))} righe di cluster · {ms:.1f} ms (fixture)")
    assert ms < 100.0, f"FALLITO: {ms:.1f} ms con 180 semi è oltre il tetto di 100 ms del ticket"

    print("\n" + "=" * 84)
    print("TUTTE LE PROVE SUPERATE — OK")
    print("=" * 84)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\n{e}")
        sys.exit(1)
