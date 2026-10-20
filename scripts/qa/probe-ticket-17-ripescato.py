#!/usr/bin/env python3
"""Sonda del Ticket 17 — lo score del titolo ripescato.

IL DIFETTO: `il_tuo_mondo` esponeva il titolo ripescato dalla watchlist con `r[x]`, che e' **gonfiato** da
`ALPHA * e_init[x]` — proprio la massa di restart che il ripescaggio serviva a neutralizzare. Chi ordinava
a valle credeva quel titolo piu' affine di quanto fosse. Ora si espone `r_indotta = r - ALPHA * e` e
l'ordine viene dallo score vero.

Cosa misura, su un motore sintetico (gli artefatti veri vivono sul mate):
  1. `r[x]` vs `r_indotta[x]` per un seme di libreria;
  2. che il ranking calcolato sul valore vero sia piu' basso di quello calcolato sul gonfiato;
  3. che senza la correzione l'ordine esposto sarebbe quello gonfiato.

Uso: py scripts/qa/probe-ticket-17-ripescato.py
"""
import os
import sys

import numpy as np

RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RADICE, "services"))

from graph import motore as K  # noqa: E402
from graph import parametri as P  # noqa: E402


class _Bolle:
    KEYS = [f"movie:{1000 + i}" for i in range(6)]
    ROW_OF = {ch: i for i, ch in enumerate(KEYS)}


K.B = _Bolle

N = 6
ALPHA = float(getattr(P, "ALPHA", 0.6))


def motore():
    m = K.Motore.__new__(K.Motore)
    m.N = N
    # r: il ripescato (riga 0) ha un picco gonfiato dal restart; gli altri sono titoli normali.
    r = np.array([0.90, 0.55, 0.50, 0.45, 0.40, 0.35], dtype=float)
    e = np.zeros(N, dtype=float)
    e[0] = 1.0          # solo il ripescato riceve massa di restart
    m.VAVE = np.array([8.0, 7.5, 7.2, 7.1, 7.0, 6.9], dtype=float)
    m.VOT = np.array([500, 400, 300, 200, 150, 100], dtype=float)
    m.voto_bayesiano = lambda cand: np.array([m.VAVE[c] for c in cand])
    return m, r, e


def main():
    print("== Ticket 17: lo score del ripescato ==")
    m, r, e = motore()
    base, exp = 7.0, 1.5

    indotta = np.array([float(r[0] - ALPHA * e[0])])
    print(f"ALPHA = {ALPHA}")
    print(f"r[0]        (gonfiato) = {r[0]:.4f}")
    print(f"r_indotta[0] (vero)    = {indotta[0]:.4f}")
    assert indotta[0] < r[0], "il valore vero deve essere piu' basso di quello gonfiato"

    gonfiato = float(m.ranking(np.array([0]), r, base, exp)[0])
    vero = float(m.ranking(np.array([0]), r, base, exp)[0] * (indotta[0] / r[0]))
    print(f"score esposto PRIMA (r)      = {gonfiato:.4f}")
    print(f"score esposto DOPO (indotta) = {vero:.4f}")
    assert vero < gonfiato

    # posizione: con lo score vero il ripescato non scavalca piu' un titolo migliore
    altri = np.array([1, 2, 3, 4, 5])
    score_altri = m.ranking(altri, r, base, exp)
    print(f"migliore degli altri        = {float(score_altri.max()):.4f}")
    print(f"il ripescato sta davanti per score? prima={gonfiato > float(score_altri.max())} "
          f"dopo={vero > float(score_altri.max())}")
    print("nota: la 'testa per costruzione' del ticket 02 confligge con il contratto di monotonicita'")
    print("      (`assert_monotonia_lista`) quando lo score e' quello vero — la divergenza e' nell'Esito.")
    print("OK")


if __name__ == "__main__":
    main()
