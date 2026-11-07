"""evaluate_policies.py — Valutazione dettagliata di P1, P2 e waiver piccoli cluster."""
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

import numpy as np
from graph.runtime import Engine
from graph import canon as K, interessi as I

def run_evaluation():
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    # Let's inspect the selected shelves from baseline for each profile
    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)

        prof_has_movie = any(k.startswith("movie:") for k in chiavi)
        prof_has_series = any(k.startswith("tv:") for k in chiavi)

        print(f"\n=================== {p} (has_mov={prof_has_movie}, has_ser={prof_has_series}) ===================")
        for idx, s in enumerate(shs, 1):
            mov_members = [m for m in s.semi_membri if m["medium"] == "movie"]
            ser_members = [m for m in s.semi_membri if m["medium"] == "series"]
            print(f"Shelf {idx}: '{s.nome}' ({s.medium}, {s.nome_fonte}) | Membri: {len(mov_members)} mov, {len(ser_members)} ser")

if __name__ == "__main__":
    run_evaluation()
