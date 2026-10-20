"""probe-ticket-06-classici.py — Sonda del Ticket 06 (Classici imperdibili del tuo mondo).

Prova che la riga NON sia la classifica globale travestita:
1. la riga non e' vuota sul fixture costruito per passare (un OK su zero titoli non e' una verifica);
2. i primi 5 titoli sono del micro-genere acceso dal profilo;
3. un titolo famosissimo di un mondo che l'utente NON accende non entra;
4. un titolo noto ma con voto sotto la soglia di consenso non entra.
"""
import pathlib
import sys

import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
ROOT = QUI.parents[1]
sys.path.insert(0, str(ROOT / "services"))

from graph import bubbles as B  # noqa: E402
from graph import canon as K  # noqa: E402

exec(open(QUI / "probe-ticket-05-gemme.py").read().split("def test_due_profili_opposti")[0])  # noqa: S102


def main():
    print("=" * 80)
    print("TICKET 06 — CLASSICI IMPERDIBILI DEL TUO MONDO")
    print("=" * 80)

    m = build_dual_world_graph()
    mondo = m.MEMBRI[0]          # il micro-genere acceso dal profilo
    altro_mondo = m.MEMBRI[3]    # un mondo che l'utente NON accende

    # Il mondo dell'utente: notorieta' moderata (1000), voto medio 7.0.
    # -> V_mondo ~ 1000, soglia = max(1500, 1.5*1000) = 1500.
    m.VOT[mondo] = 1000.0
    m.VAVE[mondo] = 7.0
    m.VOT[altro_mondo] = 1000.0
    m.VAVE[altro_mondo] = 7.0

    # Sei CLASSICI del suo mondo: piu' noti della mediana (2200 >= 1500), voto alto (7.8 >= 7.5).
    classici = [int(mondo[20 + i]) for i in range(6)]
    for x in classici:
        m.VOT[x] = 2200.0
        m.VAVE[x] = 7.8

    # Famosissimo ma in un ALTRO mondo: non deve entrare.
    intruso_altro_mondo = int(altro_mondo[20])
    m.VOT[intruso_altro_mondo] = 9000.0
    m.VAVE[intruso_altro_mondo] = 8.8

    # Noto ma con voto sotto la soglia di consenso (7.2 < 7.5): non deve entrare.
    intruso_voto_basso = int(mondo[30])
    m.VOT[intruso_voto_basso] = 2200.0
    m.VAVE[intruso_voto_basso] = 7.2

    m.VOTMED = np.array([K.mediana_voti(m.VOT[m.MEMBRI[b]]) for b in range(m.NB)], dtype=np.float32)
    m.VAVEMEAN = np.array([float(np.mean(m.VAVE[m.MEMBRI[b]])) for b in range(m.NB)], dtype=np.float32)

    storia = [(B.KEYS[int(mondo[0])], 1, "watched", None)]
    res = m.lista(storia, cap=20, medium="movie")
    cls = next((l for l in res["liste"] if l["tipo"] == "classici_imperdibili"), None)
    assert cls is not None, "FALLITO: la riga classici_imperdibili non esiste nella risposta"

    titoli = [t[0] for t in cls["titoli"]]
    primo5 = titoli[:5]
    attesi = {B.KEYS[x] for x in classici}

    print(f"  riga: {len(titoli)} titoli | corta: {cls.get('corta')} target: {cls.get('target_dimensione')}")
    print(f"  primi 5: {primo5}")
    print()

    assert len(titoli) > 0, (
        "FALLITO: la riga e' VUOTA sul fixture costruito per passare. "
        "Una sonda che dice OK su zero titoli non e' una verifica."
    )
    fuori = [t for t in primo5 if t not in attesi]
    assert not fuori, f"FALLITO: nei primi 5 c'e' roba di un altro mondo: {fuori}"
    assert B.KEYS[intruso_altro_mondo] not in titoli, (
        f"FALLITO: entra {B.KEYS[intruso_altro_mondo]} (9000 voti) che sta in un mondo non acceso: "
        "e' una classifica globale, non 'i tuoi' classici."
    )
    assert B.KEYS[intruso_voto_basso] not in titoli, (
        f"FALLITO: entra {B.KEYS[intruso_voto_basso]} con VAVE 7.2 < 7.5: la soglia di consenso non morde."
    )

    print("  PROVA 1 OK: la riga non e' vuota")
    print("  PROVA 2 OK: i primi 5 sono del micro-genere acceso")
    print("  PROVA 3 OK: il titolo famosissimo di un altro mondo NON entra")
    print("  PROVA 4 OK: il titolo noto con voto sotto soglia NON entra")
    print()
    print("TUTTE LE VERIFICHE TICKET 06 SUPERATE")
    sys.exit(0)


if __name__ == "__main__":
    main()
