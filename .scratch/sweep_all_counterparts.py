"""sweep_all_counterparts.py — Misura tutte le controparti sui 10 profili per tarare la soglia di qualità."""
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

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    all_cases = []

    for p in profili:
        ch, _, pl, et = K.storia_trakt(p)
        shs = I.scaffali(engine, ch, n=8, W_aff=W_aff)
        for s in shs:
            c_med = "series" if s.medium == "movie" else "movie"
            semi_rac = [{"key": ch[i], "tipo": "watched", "peso": 1.0} for i in s.seeds_indices]
            # Parent walk
            recs_p = engine.raccomanda(semi_rac, cap=10, medium=s.medium, esclusi=set(ch))
            top1_p = recs_p[0]["punteggio"] if recs_p else 0.0

            # Counterpart walk
            recs_c = engine.raccomanda(semi_rac, cap=10, medium=c_med, esclusi=set(ch))
            top1_c = recs_c[0]["punteggio"] if recs_c else 0.0

            ratio = (top1_c / top1_p) if top1_p > 0 else 0.0
            top1_tit = titles[engine.row_of[recs_c[0]["key"]]] if recs_c else "None"
            top2_tit = titles[engine.row_of[recs_c[1]["key"]]] if len(recs_c) > 1 else ""

            all_cases.append({
                "profilo": p,
                "shelf_nome": s.nome,
                "shelf_medium": s.medium,
                "counterpart_medium": c_med,
                "top1_p": top1_p,
                "top1_c": top1_c,
                "ratio": ratio,
                "top_cands": f"{top1_tit}, {top2_tit}",
            })

    # Ordina per ratio decrescente
    all_cases.sort(key=lambda x: -x["ratio"])

    print(f"{'Profilo':13} {'Scaffale':30} {'Med':5} -> {'Cnt':6} | {'Top1_P':>10} {'Top1_C':>10} {'Ratio %':>8} | {'Top Candidati Controparte'}")
    print("="*120)
    for c in all_cases:
        print(f"{c['profilo']:13} {c['shelf_nome'][:30]:30} {c['shelf_medium']:5} -> {c['counterpart_medium']:6} | {c['top1_p']:10.6f} {c['top1_c']:10.6f} {c['ratio']*100:7.2f}% | {c['top_cands'][:45]}")

if __name__ == "__main__":
    main()
