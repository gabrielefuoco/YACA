"""simulate_policies.py — Simula P1, P2 (varianti) e gestione waiver piccoli cluster."""
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

import numpy as np
from graph.runtime import Engine
from graph import canon as K, interessi as I

def main():
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)
        print(f"\n=================== {p.upper()} ({len(chiavi)} semi, {len(shs)} scaffali) ===================")
        for s in shs:
            member_media = Counter(m["medium"] for m in s.semi_membri)
            print(f"Shelf '{s.nome}' ({s.medium}): {dict(member_media)}")

if __name__ == "__main__":
    main()
