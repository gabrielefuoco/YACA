"""test_shelf_logic.py — Test completo della logica scaffali con le due policy e confronto diretto."""
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

import numpy as np
from graph.runtime import Engine
from graph import canon as K, interessi as I

def test_shelf_generation():
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    print("Verifica generazione scaffali...")
    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)
        print(f"\n--- {p} ({len(chiavi)} semi) ---")
        for s in shs:
            print(f"  [{s.medium}] {s.nome} | membri: {len(s.semi_membri)} | candidati: {len(s.titoli)}")

if __name__ == "__main__":
    test_shelf_generation()
