"""experiment_medium.py — Analisi policy di medio (P1 vs P2) e risoluzione waiver piccoli cluster."""
import json
import sys
from pathlib import Path

# Add services to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

import numpy as np
from graph.runtime import Engine
from graph import canon as K, interessi as I

def main():
    print("Inizializzazione Engine e W_aff...")
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    print("\n=== BASELINE ATTUALE (n=8, scaffali() esistente) ===")
    print(f"{'profilo':16} {'semi':>5} {'scaffali':>9} {'coperti':>8} {'film':>6} {'serie':>6}")
    baseline_data = {}
    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)
        covered = set()
        for s in shs:
            covered.update(s.seeds_indices)
        n_mov = sum(1 for s in shs if s.medium == "movie")
        n_ser = sum(1 for s in shs if s.medium == "series")
        baseline_data[p] = {
            "semi_tot": len(chiavi),
            "scaffali": len(shs),
            "coperti": len(covered),
            "film": n_mov,
            "serie": n_ser,
            "shelves": shs,
            "chiavi": chiavi
        }
        print(f"{p:16} {len(chiavi):5d} {len(shs):9d} {len(covered):8d} {n_mov:6d} {n_ser:6d}")

if __name__ == "__main__":
    main()
