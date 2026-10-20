#!/usr/bin/env python3
"""Sonda del Ticket 22 — la guardia del waterfall.

IL DIFETTO: il waterfall del Ticket 11 deduplica in ordine di specificita', ma una riga senza catalogo
servito non la vede nessuno: togliere titoli a una riga visibile per riempire una riga invisibile e' un
guadagno pari a zero. Sul fixture del Ticket 11, `il_tuo_mondo` perdeva 59/60 titoli (tutta la top-10)
verso `micro_cluster_1`.

Cosa misura:
  1. senza guardia (tutte le righe partecipano): quanti titoli di `il_tuo_mondo` restano;
  2. con la guardia (partecipano solo le righe servite): quanti ne restano;
  3. che quando TUTTE le righe sono servite non cambi niente rispetto al §9.1.

Uso: py scripts/qa/probe-ticket-22-guardia.py
"""
import os
import sys

RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RADICE, "services"))

from graph.motore import Motore  # noqa: E402


def titoli(prefix, quanti, base):
    """Titoli finti: `(chiave, punteggio)` come li consegna il motore."""
    return [(f"movie:{base + i}", round(1.0 - i * 0.01, 4)) for i in range(quanti)]


def liste_fixture():
    """Il fixture del Ticket 11: il mondo (bacino largo, 60 titoli) e un micro-cluster che contiene i
    PRIMI TRENTA titoli del mondo (sono i suoi, e sono anche i migliori del mondo). Il micro-cluster e'
    piu' specifico, quindi senza guardia si prende la top-10 del mondo e la riga visibile viene servita
    con i titoli 31-40."""
    mondo = titoli("m", 60, 1000)
    filone = list(mondo[:30])
    # Il contratto del waterfall: `titoli == _pool[:target]`, e `_pool` ha i candidati interi.
    return [
        {"tipo": "micro_cluster_1", "mondo": 2, "titoli": filone[:10],
         "target_dimensione": 10, "_pool": list(filone)},
        {"tipo": "il_tuo_mondo", "mondo": 1, "titoli": mondo[:10],
         "target_dimensione": 10, "_pool": list(mondo)},
    ]


def esegui(partecipanti, etichetta):
    motore = Motore.__new__(Motore)  # il waterfall non usa lo stato dell'istanza
    liste = motore.waterfall_righe(liste_fixture(), 10, partecipanti=partecipanti)
    mondo = next(li for li in liste if li["tipo"] == "il_tuo_mondo")
    filone = next(li for li in liste if li["tipo"] == "micro_cluster_1")
    # La metrica che conta: quanti dei 10 titoli MIGLIORI del mondo restano serviti nel mondo.
    migliori = {ch for ch, _ in titoli("m", 60, 1000)[:10]}
    serviti = {ch for ch, _ in mondo["titoli"]}
    print(f"{etichetta:<52} top-10 del mondo servita: {len(migliori & serviti)}/10 "
          f"· riga {len(mondo['titoli'])}/10 · copie evitate {mondo['doppioni_tolti']}")
    return mondo, filone


def main():
    print("== Ticket 22: la guardia del waterfall ==")
    print("fixture: il mondo ha 60 titoli; il micro-cluster contiene i primi 30 (i migliori del mondo)")
    print()

    # 1. lezione del Ticket 11: senza guardia il mondo perde quasi tutto
    senza = esegui(None, "A. nessuna guardia (tutte le righe partecipano)")
    # 2. con la guardia: il micro-cluster non e' servito, quindi non partecipa
    con = esegui(["il_tuo_mondo"], "B. guardia: solo le righe servite (micro-cluster spento)")
    # 3. tutte servite: identico al §9.1
    tutte = esegui(["il_tuo_mondo", "micro_cluster_1"], "C. guardia ma tutte servite (identico a A)")

    print()
    print()
    print("la riga visibile, senza guardia, viene servita con i titoli 31-40: stessa lunghezza, qualità")
    print("peggiore. Il confronto giusto e' sui titoli, non sulla lunghezza.")
    print("in nessun caso una riga sparisce: le righe fuori dal dedup restano, con i loro titoli.")
    assert [ch for ch, _ in tutte[0]["titoli"]] == [ch for ch, _ in senza[0]["titoli"]], "C deve coincidere con A"
    assert [ch for ch, _ in con[0]["titoli"]] == [f"movie:{1000 + i}" for i in range(10)], "con la guardia il mondo tiene la sua top-10"
    assert motore_fuori_ok(), "le righe fuori dal dedup devono essere dichiarate"
    print("OK")


def motore_fuori_ok():
    motore = Motore.__new__(Motore)
    motore.waterfall_righe(liste_fixture(), 10, partecipanti=["il_tuo_mondo"])
    return motore.waterfall_fuori == ["micro_cluster_1"]


if __name__ == "__main__":
    main()
