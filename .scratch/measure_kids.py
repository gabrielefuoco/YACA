import sys
import numpy as np

sys.path.insert(0, "services")
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph import kids as _kids

engine = Engine.carica_transizione()
w_aff = I.carica_matrice_affinita()

profiles = ["warnok", "castoffcrown", "moppierhead", "carverclan"]

print("=== MEASURING KIDS FILTER: BEFORE VS AFTER CUT ===\n")

for u in profiles:
    chiavi, _, plays, eta = K.storia_trakt(u, ordine="recente")
    semi = [{"key": str(k), "plays": float(pl), "eta_giorni": float(et)} for k, pl, et in zip(chiavi, plays, eta)]

    # 1. Non-kids baseline
    sh_baseline = I.scaffali(engine=engine, semi=semi, n=8, W_aff=w_aff, kids=False)

    # 2. Kids mode before cut
    sh_kids = I.scaffali(engine=engine, semi=semi, n=8, W_aff=w_aff, kids=True)

    print(f"--- Profile: {u} (seeds: {len(semi)}) ---")
    print(f"Shelves count: baseline={len(sh_baseline)}, kids={len(sh_kids)}")

    # Analyze post-cut hypothetical survival on baseline top-60
    post_cut_below_20 = 0
    post_cut_survivals = []
    for s_idx, sh in enumerate(sh_baseline):
        survived = sum(1 for t in sh.titoli if engine.kids_ok[engine.row_of[t["key"]]])
        post_cut_survivals.append(survived)
        if survived < 20:
            post_cut_below_20 += 1
            print(f"  [POST-CUT DEFECT] Shelf '{sh.nome}' ({sh.medium}): only {survived}/60 survive post-cut! (< 20)")

    # Analyze before-cut actual results
    before_cut_below_20 = 0
    before_cut_counts = []
    bad_titles_in_kids = 0
    for s_idx, sh in enumerate(sh_kids):
        cnt = len(sh.titoli)
        before_cut_counts.append(cnt)
        if cnt < 20:
            before_cut_below_20 += 1
            print(f"  [BEFORE-CUT WARN] Shelf '{sh.nome}' ({sh.medium}): only {cnt} titles (< 20)")
        for t in sh.titoli:
            if not engine.kids_ok[engine.row_of[t["key"]]]:
                bad_titles_in_kids += 1

    print(f"  Post-cut simulation: avg {np.mean(post_cut_survivals):.1f}/60 survived; min={min(post_cut_survivals)}; shelves < 20: {post_cut_below_20}/{len(sh_baseline)}")
    print(f"  Before-cut reality: avg {np.mean(before_cut_counts):.1f}/60 titles served; min={min(before_cut_counts)}; shelves < 20: {before_cut_below_20}/{len(sh_kids)}")
    print(f"  Blacklisted titles leaked into kids shelves: {bad_titles_in_kids}\n")
