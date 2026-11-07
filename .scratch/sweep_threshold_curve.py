"""sweep_threshold_curve.py — Calcola la curva delle soglie per il quality-gating delle controparti."""
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

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    print("=== RACCOLTA DATI SCAFFALI E CONTROPARTI SUI 10 PROFILI ===")

    # Per ciascun profilo, otteniamo gli scaffali serviti
    profile_data = {}
    for p in profili:
        ch, _, pl, et = K.storia_trakt(p)
        shs = I.scaffali(engine, ch, n=8, W_aff=W_aff)

        shelves_with_counterpart = []
        for s in shs:
            c_med = "series" if s.medium == "movie" else "movie"
            semi_rac = [{"key": ch[i], "tipo": "watched", "peso": 1.0} for i in s.seeds_indices]
            # Parent walk
            recs_p = engine.raccomanda(semi_rac, cap=20, medium=s.medium, esclusi=set(ch))
            top1_p = recs_p[0]["punteggio"] if recs_p else 0.0

            # Counterpart walk
            recs_c = engine.raccomanda(semi_rac, cap=20, medium=c_med, esclusi=set(ch))
            top1_c = recs_c[0]["punteggio"] if recs_c else 0.0

            ratio = (top1_c / top1_p) if top1_p > 0 else 0.0
            cands_c = [
                f"{titles[engine.row_of[r['key']]]} ({int(years[engine.row_of[r['key']]]) if years is not None else 0})"
                for r in recs_c[:5]
            ]
            shelves_with_counterpart.append({
                "shelf": s,
                "top1_p": top1_p,
                "top1_c": top1_c,
                "ratio": ratio,
                "c_med": c_med,
                "cands_c": cands_c
            })
        profile_data[p] = shelves_with_counterpart

    # Sweep soglie
    thresholds = [0.015, 0.020, 0.025, 0.030, 0.035, 0.040, 0.045, 0.050, 0.075, 0.100, 0.150, 0.200]

    print("\n" + "="*100)
    print(f"{'Soglia tau':>10} | {'Righe Tot':>9} | {'warnok':>6} {'pepsipex':>8} {'castoff':>7} | {'Cinecomic (warnok)':>22} | {'Classici (castoff)':>22}")
    print("="*100)

    for tau in thresholds:
        tot_rows = 0
        p_counts = {}
        cinecomic_status = None
        classici_status = None

        for p in profili:
            shs_data = profile_data[p]
            base_rows = len(shs_data)
            # Counterpart admitted if ratio >= tau
            counterpart_rows = 0
            for item in shs_data:
                admitted = item["ratio"] >= tau
                if admitted:
                    counterpart_rows += 1

                if p == "warnok" and item["shelf"].nome == "Cinecomic & Supereroi":
                    cinecomic_status = f"{'AMMESSA' if admitted else 'SCARTATA'} ({item['ratio']*100:.2f}%)"
                if p == "castoffcrown" and "Classici" in item["shelf"].nome:
                    classici_status = f"{'AMMESSA' if admitted else 'SCARTATA'} ({item['ratio']*100:.2f}%)"

            rows_p = base_rows + counterpart_rows
            p_counts[p] = rows_p
            tot_rows += rows_p

        print(f"{tau*100:9.1f}% | {tot_rows:9d} | {p_counts['warnok']:6d} {p_counts['pepsipex']:8d} {p_counts['castoffcrown']:7d} | {cinecomic_status:>22} | {classici_status:>22}")

    print("\n" + "="*100)
    print("DETTAGLIO ESEMPI A CIASCUNA SOGLIA CHIAVE (tau = 2.0%, 2.5%, 3.0%, 3.5%, 4.0%, 5.0%):")
    print("="*100)

    for tau in [0.020, 0.025, 0.030, 0.035, 0.040, 0.050]:
        print(f"\n>>> SOGLIA tau = {tau*100:.1f}% <<<")
        # Warnok Cinecomic
        item_cin = next(it for it in profile_data["warnok"] if it["shelf"].nome == "Cinecomic & Supereroi")
        cin_adm = item_cin["ratio"] >= tau
        print(f"  * warnok 'Cinecomic & Supereroi' (ratio = {item_cin['ratio']*100:.2f}%): {'AMMESSA -> ' + ', '.join(item_cin['cands_c'][:3]) if cin_adm else 'SCARTATA'}")

        # Castoffcrown Classici
        item_cls = next(it for it in profile_data["castoffcrown"] if "Classici" in it["shelf"].nome)
        cls_adm = item_cls["ratio"] >= tau
        print(f"  * castoffcrown 'Classici d'autore' (ratio = {item_cls['ratio']*100:.2f}%): {'AMMESSA -> ' + ', '.join(item_cls['cands_c'][:3]) if cls_adm else 'SCARTATA'}")

        # Quali altre righe compaiono/scompaiono attorno a questa soglia?
        admitted_list = []
        rejected_list = []
        for p in ["warnok", "castoffcrown", "pepsipex"]:
            for it in profile_data[p]:
                nome = it["shelf"].nome
                if it["ratio"] >= tau:
                    admitted_list.append(f"{p}:{nome} ({it['ratio']*100:.1f}%)")
                else:
                    rejected_list.append(f"{p}:{nome} ({it['ratio']*100:.1f}%)")
        print(f"    Controparti ammesse sui 3 profili lunghi: {len(admitted_list)}/{len(admitted_list)+len(rejected_list)}")

if __name__ == "__main__":
    main()
