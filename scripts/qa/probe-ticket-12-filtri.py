#!/usr/bin/env python3
"""Sonda del Ticket 12 — i filtri a monte, non a valle.

IL DIFETTO: la politica anime e il kids-mode si applicavano **a valle**, nel taglio delle card. Se i primi
venti titoli di una riga sono in gran parte non idonei, la riga serve una pagina monca: il taglio a valle
butta via i non idonei **dopo** averli occupati, invece di lasciare il posto agli idonei che stavano piu'
sotto. La maschera qui si applica ai **candidati**, prima del `[:cap]`.

Cosa misura, su un motore sintetico (gli artefatti veri vivono sul mate):
  1. senza la maschera: quanti idonei restano in pagina dopo il taglio a valle di 20;
  2. con la maschera a monte: quanti idonei restano (devono essere 20, presi dal pool intero);
  3. artefatto senza i flag: la dichiarazione dice che i filtri restano inerti.

Uso: py scripts/qa/probe-ticket-12-filtri.py
"""
import os
import sys

import numpy as np

RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RADICE, "services"))

from graph import motore as K  # noqa: E402

N = 200
PAGINA = 20


class _Bolle:
    """Il minimo di `graph.bubbles` che serve: l'indice chiave -> riga e le chiavi."""
    KEYS = [f"movie:{1000 + i}" for i in range(N)]
    ROW_OF = {ch: i for i, ch in enumerate(KEYS)}


# Gli artefatti veri non ci sono in locale: le bolle si sostituiscono con l'indice sintetico.
K.B = _Bolle

# Un motore sintetico con i flag: i primi 30 titoli sono anime, i titoli 40-44 adulti, gli altri neutrali.
def motore_con_flag():
    m = K.Motore.__new__(K.Motore)
    m.N = N
    m.ANIME = np.zeros(N, bool)
    m.ANIME[:30] = True
    m.ADULTO = np.zeros(N, bool)
    m.ADULTO[40:45] = True
    return m


def motore_senza_flag():
    m = K.Motore.__new__(K.Motore)
    m.N = N
    m.ANIME = None
    m.ADULTO = None
    return m


def candidati():
    """200 candidati, punteggio decrescente: i migliori sono proprio quelli non idonei."""
    return [(f"movie:{1000 + i}", round(1.0 - i * 0.001, 4)) for i in range(N)]


def idonei_di(cand, m):
    return sum(1 for ch, _ in cand if m.IDONEI[K.B.ROW_OF[ch]])


def main():
    print("== Ticket 12: i filtri a monte ==")
    print(f"canone sintetico: {N} titoli · 30 anime · 5 adulti · pagina = {PAGINA}")
    print()

    m = motore_con_flag()
    dich = m.filtri_a_monte(anime="exclude", kids=True)
    print(f"maschera: anime=exclude kids=True -> applicato={dich['applicato']} "
          f"scartati={dich['scartati']} (atteso 35)")

    tutti = candidati()
    # A. taglio a valle (come oggi): si serve la pagina, poi si buttano i non idonei
    pagina_valle = [v for v in tutti[:PAGINA] if m.IDONEI[K.B.ROW_OF[v[0]]]]
    # B. filtro a monte (Ticket 12): si filtrano i candidati, poi si taglia
    pagina_monte = m.filtra_idonei(tutti)[:PAGINA]
    print(f"A. taglio a valle:  {len(pagina_valle)}/{PAGINA} idonei in pagina (il resto e' buco)")
    print(f"B. filtro a monte:  {len(pagina_monte)}/{PAGINA} idonei in pagina")
    assert len(pagina_valle) < PAGINA, "senza il filtro a monte la pagina deve restare monca"
    assert len(pagina_monte) == PAGINA, "con il filtro a monte la pagina si riempie di idonei"
    assert all(m.IDONEI[K.B.ROW_OF[ch]] for ch, _ in pagina_monte), "nessun non idoneo in pagina"

    # C. nessun idoneo in meno: si prendono i primi 20 disponibili, non i primi 20 in assoluto
    print(f"   primo idoneo servito: {pagina_monte[0][0]} (prima era {tutti[0][0]}, non idoneo)")

    print()
    m2 = motore_senza_flag()
    dich2 = m2.filtri_a_monte(anime="exclude", kids=True)
    print(f"artefatto senza flag -> applicato={dich2['applicato']} · motivo: {dich2['motivo']}")
    assert dich2["applicato"] is False, "senza i flag il filtro non si applica"
    assert m2.filtra_idonei(candidati()) == candidati(), "senza maschera i candidati restano intatti"

    print()
    solo_kids = motore_con_flag().filtri_a_monte(anime=None, kids=True)
    solo_anime = motore_con_flag().filtri_a_monte(anime="only", kids=False)
    print(f"confronto: kids=True scarta {solo_kids['scartati']} · anime=only tiene {N - solo_anime['scartati']}")
    print("OK")


if __name__ == "__main__":
    main()
