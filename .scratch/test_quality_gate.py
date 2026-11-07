"""test_quality_gate.py — Esamina metriche di qualità per il Quality-Gating delle controparti."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

import numpy as np
from graph.runtime import Engine
from graph import canon as K, interessi as I

def main():
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    # 1. Inspect warnok Cinecomic
    ch_w, _, pl_w, et_w = K.storia_trakt("warnok")
    shs_w = I.scaffali(engine, ch_w, n=8, W_aff=W_aff)
    cinecomic = next(s for s in shs_w if s.nome == "Cinecomic & Supereroi")

    # Parent (movie) walk
    semi_parent_w = [{"key": ch_w[i], "tipo": "watched", "peso": 1.0} for i in cinecomic.seeds_indices]
    recs_parent_w = engine.raccomanda(semi_parent_w, cap=20, medium="movie", esclusi=set(ch_w))
    top1_parent_w = recs_parent_w[0]["punteggio"]

    # Counterpart (series) walk
    recs_count_w = engine.raccomanda(semi_parent_w, cap=20, medium="series", esclusi=set(ch_w))
    top1_count_w = recs_count_w[0]["punteggio"]
    ratio_w = top1_count_w / top1_parent_w

    print("=== WARNOK CINECOMIC ===")
    print(f"Parent (movie) top1 score:     {top1_parent_w:.6f} ({titles[engine.row_of[recs_parent_w[0]['key']]]})")
    print(f"Counterpart (series) top1:     {top1_count_w:.6f} ({titles[engine.row_of[recs_count_w[0]['key']]]})")
    print(f"Ratio counterpart/parent:      {ratio_w:.4f} ({ratio_w*100:.2f}%)")
    print(f"Top 5 series: {[titles[engine.row_of[r['key']]] for r in recs_count_w[:5]]}")

    # 2. Inspect castoffcrown Classici
    ch_c, _, pl_c, et_c = K.storia_trakt("castoffcrown")
    shs_c = I.scaffali(engine, ch_c, n=8, W_aff=W_aff)
    classici = next(s for s in shs_c if "Classici" in s.nome)

    semi_parent_c = [{"key": ch_c[i], "tipo": "watched", "peso": 1.0} for i in classici.seeds_indices]
    recs_parent_c = engine.raccomanda(semi_parent_c, cap=20, medium="movie", esclusi=set(ch_c))
    top1_parent_c = recs_parent_c[0]["punteggio"]

    recs_count_c = engine.raccomanda(semi_parent_c, cap=20, medium="series", esclusi=set(ch_c))
    top1_count_c = recs_count_c[0]["punteggio"]
    ratio_c = top1_count_c / top1_parent_c

    print("\n=== CASTOFFCROWN CLASSICI ===")
    print(f"Parent (movie) top1 score:     {top1_parent_c:.6f} ({titles[engine.row_of[recs_parent_c[0]['key']]]})")
    print(f"Counterpart (series) top1:     {top1_count_c:.6f} ({titles[engine.row_of[recs_count_c[0]['key']]]})")
    print(f"Ratio counterpart/parent:      {ratio_c:.4f} ({ratio_c*100:.2f}%)")
    print(f"Top 5 series: {[titles[engine.row_of[r['key']]] for r in recs_count_c[:5]]}")

if __name__ == "__main__":
    main()
