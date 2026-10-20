#!/usr/bin/env python3
"""Sonda del Ticket 23 — la diversità sulla riga SERVITA.

IL DIFETTO (misurato in produzione): l'anti-monopolio (04) mette i titoli della stessa saga oltre la
posizione 20, ma quando una riga più specifica prende dei titoli al waterfall, il ripescaggio pesca
proprio da lì: `il_tuo_mondo` serviva **3 collezioni duplicate** nei primi 20.

Cosa misura, su un motore sintetico con COLL/DIR veri (gli artefatti stanno sul mate):
  1. senza la guardia: quante saghe duplicate finiscono nei primi 20 dopo il ripescaggio;
  2. con la guardia: zero, e i titoli rimandati non spariscono (finiscono dopo lo slot);
  3. la monotonicità resta rispettata (`assert_monotonia_lista`).

Uso: py scripts/qa/probe-ticket-23-diversita.py
"""
import os
import sys

import numpy as np

RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RADICE, "services"))

from graph import motore as K  # noqa: E402

N = 80


class _Bolle:
    KEYS = [f"movie:{1000 + i}" for i in range(N)]
    ROW_OF = {ch: i for i, ch in enumerate(KEYS)}


K.B = _Bolle


def motore(saga_reale=None):
    m = K.Motore.__new__(K.Motore)
    m.N = N
    # una sola saga (id 777) con 6 titoli, e un regista (id 55) con 5 titoli
    coll = np.full(N, -1, np.int64)
    dirs = {}
    for i in range(6):
        coll[i] = 777
    for i in range(2, 7):
        dirs[i] = np.array([55], np.int64)
    m.COLL = coll
    m.DIR = {k: v for k, v in dirs.items()}
    m.ANNO = np.array([2000 + i for i in range(N)], np.float64)
    m.ANNO[:6] = [2001, 2002, 2003, 2004, 2005, 2006]
    m.get_directors = lambda ch: [int(d) for d in m.DIR.get(K.B.ROW_OF.get(ch, -1), [])]
    return m


def liste_fixture(solo_coda=None):
    """Il `_pool` ha la forma che gli dà `applica_antimonopolio`: testa senza i duplicati di saga, coda
    con dentro la saga. Quando una riga più specifica si prende 12 titoli della testa, il ripescaggio
    scende nella coda e — senza guardia — riapre la saga."""
    testa = [(f"movie:{1000 + i}", round(1.0 - i * 0.005, 4)) for i in range(10, 30)]
    saga = [(f"movie:{1000 + i}", round(0.80 - i * 0.002, 4)) for i in range(0, 6)]
    altri = [(f"movie:{1000 + i}", round(0.60 - i * 0.002, 4)) for i in range(40, 60)]
    pool = testa + saga + altri
    specifica = [(ch, sc) for ch, sc in testa[:12]]
    return [
        {"tipo": "classici_imperdibili", "mondo": None, "titoli": list(specifica),
         "target_dimensione": 12, "_pool": list(specifica)},
        {"tipo": "il_tuo_mondo", "mondo": 1, "titoli": pool[:20],
         "target_dimensione": 20, "_pool": list(pool)},
    ]


def conta_duplicati(m, titoli, slot=20):
    colls = [m.get_collection_id(ch) for ch, _ in titoli[:slot]]
    colls = [c for c in colls if c is not None]
    return len(colls) - len(set(colls))


def esegui(usa_guardia, etichetta):
    m = motore()
    if not usa_guardia:
        # simula il mondo PRIMA del ticket 23: nessun cap durante il riempimento
        m.COLL, m.DIR = None, None
        m.get_directors = lambda ch: []
    liste = m.waterfall_righe(liste_fixture(None), 20, partecipanti=None)
    mondo = next(li for li in liste if li["tipo"] == "il_tuo_mondo")
    dup = conta_duplicati(motore(), mondo["titoli"])
    print(f"{etichetta:<46} riga {len(mondo['titoli'])}/20 · duplicati di saga nei primi 20: {dup}"
          f" · rimandati {mondo.get('diversita_rimandati', 0)}")
    return mondo, dup


def main():
    print("== Ticket 23: la diversità sulla riga servita ==")

    _, dup_prima = esegui(False, "A. senza guardia (prima del ticket 23)")
    mondo, dup_dopo = esegui(True, "B. con la guardia (dopo il ticket 23)")

    assert dup_prima > 0, "il fixture deve mostrare il difetto senza guardia"
    assert dup_dopo == 0, "con la guardia non devono restare duplicati nei primi 20"

    # nessun titolo sparice: la riga si riempie fino in fondo
    print(f"\nla riga resta piena: {len(mondo['titoli'])} titoli")
    assert len(mondo["titoli"]) == 20, "i rimandati devono riempire la coda, non sparire"

    # monotonicità del contratto
    punteggi = [sc for _, sc in mondo["titoli"]]
    assert all(punteggi[i] >= punteggi[i + 1] for i in range(len(punteggi) - 1)), "punteggi non monotoni"
    print("monotonicità dei punteggi: rispettata")
    print("OK")


if __name__ == "__main__":
    main()
