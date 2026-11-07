"""Test suite per camminata.pesi_semi e regole dei segnali / libreria."""
from __future__ import annotations
import numpy as np
import pytest

from graph import camminata as C
from graph import parametri as P


def test_library_rule_exact_table():
    """Implementazione esatta della tabella dei segnali richiesta:
    - only in library, never watched -> 1
    - watched (any plays) -> base, library ignored even if present
    - liked -> 2, library ignored
    - loved -> 3, library ignored
    - loved + watched 3x -> min(5, base+2) = 5
    - loved + watched 3x + library -> 5 (library ignored)
    """
    righe = np.array([0, 1, 2, 3, 4, 5, 6, 7], dtype=np.int64)
    # Film con plays: [1, 2, 3, 1, 1, 3, 3, 1]
    plays = np.array([1.0, 2.0, 3.0, 1.0, 1.0, 3.0, 3.0, 1.0], dtype=float)
    nep = np.ones(len(righe), dtype=np.float32)

    tipi = [
        # 0: only in library, never watched -> 1
        "library",
        # 1: watched 2 plays -> base (2.0), library ignored even if present
        ["watched", "library"],
        # 2: watched 3 plays -> base (3.0), library ignored even if present
        ["watched", "library"],
        # 3: liked -> 2, library ignored
        ["liked", "library"],
        # 4: loved -> 3, library ignored
        ["loved", "library"],
        # 5: loved + watched 3x -> min(5, base+2) = 5
        ["watched", "loved"],
        # 6: loved + watched 3x + library -> 5 (library ignored)
        ["watched", "loved", "library"],
        # 7: only in library dict con watched=False esplicito -> 1
        {"tipo": "library", "watched": False},
    ]

    w = C.pesi_semi(righe, plays, nep, tipi=tipi)

    # 0: only in library, never watched -> 1
    assert w[0] == 1.0
    # 1: watched 2 plays -> 2.0 (library ignored)
    assert w[1] == 2.0
    # 2: watched 3 plays -> 3.0 (library ignored)
    assert w[2] == 3.0
    # 3: liked -> 2 (library ignored)
    assert w[3] == 2.0
    # 4: loved -> 3 (library ignored)
    assert w[4] == 3.0
    # 5: loved + watched 3x -> 5
    assert w[5] == 5.0
    # 6: loved + watched 3x + library -> 5 (library ignored)
    assert w[6] == 5.0
    # 7: only in library con watched=False -> 1
    assert w[7] == 1.0


def test_series_with_signals_and_library():
    """Verifica serie tv con NEP > 1: la formula base è 1 + 2*(plays/NEP), library ignorata se altri segnali."""
    righe = np.array([0, 1, 2, 3], dtype=np.int64)
    # Serie con NEP=10
    nep = np.array([10.0, 10.0, 10.0, 10.0], dtype=np.float32)
    # 0 ep, 5 ep, 10 ep, 10 ep
    plays = np.array([0.0, 5.0, 10.0, 10.0], dtype=float)

    tipi = [
        # only in library (mai visto) -> 1.0
        {"tipo": "library", "watched": False},
        # watched a metà (5/10 ep -> base 2.0) + library -> 2.0 (library ignored)
        ["watched", "library"],
        # watched intero (10/10 ep -> base 3.0) + liked + library -> min(5, 3+1) = 4.0
        ["watched", "liked", "library"],
        # watched intero (10/10 ep -> base 3.0) + loved + library -> min(5, 3+2) = 5.0
        ["watched", "loved", "library"],
    ]

    w = C.pesi_semi(righe, plays, nep, tipi=tipi)
    assert w[0] == 1.0
    assert w[1] == 2.0
    assert w[2] == 4.0
    assert w[3] == 5.0


def test_explicit_never_watched_flag_and_marker():
    """L'API deve rendere esplicito «never watched» (flag watched=False o marker library_only),

    e NON inferirlo da plays=0 (un titolo in libreria non ha alcuna voce in cronologia).
    """
    righe = np.array([0, 1, 2, 3], dtype=np.int64)
    plays = np.array([0.0, 0.0, 0.0, 0.0], dtype=float)
    nep = np.array([1.0, 1.0, 1.0, 1.0], dtype=np.float32)

    tipi = [
        # 0: flag esplicito watched=False
        {"tipo": "library", "watched": False},
        # 1: marker esplicito library_only=True
        {"library_only": True},
        # 2: watched con plays=0 senza flag library -> resta peso base da plays (0.0)
        {"tipo": "watched"},
        # 3: liked con plays=0 -> peso liked (2.0)
        {"tipo": "liked"},
    ]

    w = C.pesi_semi(righe, plays, nep, tipi=tipi)
    assert w[0] == 1.0
    assert w[1] == 1.0
    # non deve diventare 1.0 solo perché plays=0: un titolo visto con 0 plays ha base=0.0
    assert w[2] == 0.0
    assert w[3] == 2.0
