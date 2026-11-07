"""test_p2_implementation.py — Test dell'implementazione di P2 con membri rigorosamente omogenei."""
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

import numpy as np
from graph.runtime import Engine
from graph import canon as K, interessi as I

def test_on_all_profiles():
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    print("Verifica profili con implementazione P2 e membri omogenei...")
    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)

        for s in shs:
            for m in s.semi_membri:
                assert m["medium"] == s.medium, f"VIOLAZIONE: membro {m} ha medium {m['medium']} diverso da shelf {s.medium}!"
            for t in s.titoli:
                assert t["medium"] == s.medium, f"VIOLAZIONE: candidato {t} ha medium {t['medium']} diverso da shelf {s.medium}!"

        covered = set()
        for s in shs:
            covered.update(s.seeds_indices)

        print(f"{p:16}: {len(shs)} scaffali, {len(covered)} semi coperti su {len(chiavi)} totali.")

if __name__ == "__main__":
    test_on_all_profiles()
