import json
import math
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, "services")
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

golden_file = Path(".scratch/golden_10_profiles.json")
if not golden_file.is_file():
    print(f"Error: {golden_file} does not exist!")
    sys.exit(1)

golden = json.loads(golden_file.read_text(encoding="utf-8"))

engine = Engine.carica_transizione()
w_aff = I.carica_matrice_affinita()

users = [
    "sangam456",
    "hammers-lists",
    "sappss",
    "flixinatoor99",
    "moppierhead",
    "castoffcrown",
    "warnok",
    "pepsipex",
    "carverclan",
    "1jacobjohn",
]

all_passed = True
total_shelves = 0
total_titles = 0
max_rel_diff = 0.0
max_abs_diff = 0.0

for u in users:
    chiavi, _, plays, eta = K.storia_trakt(u, ordine="recente")
    semi = [{"key": str(k), "plays": float(pl), "eta_giorni": float(et)} for k, pl, et in zip(chiavi, plays, eta)]
    shelves = I.scaffali(engine=engine, semi=semi, n=8, W_aff=w_aff)

    gold_user = golden[u]
    gold_shelves = gold_user["shelves"]

    if len(shelves) != len(gold_shelves):
        print(f"FAIL [{u}]: shelf count mismatch! Got {len(shelves)}, expected {len(gold_shelves)}")
        all_passed = False
        continue

    for s_idx, (sh, g_sh) in enumerate(zip(shelves, gold_shelves)):
        total_shelves += 1
        if sh.nome != g_sh["nome"]:
            print(f"FAIL [{u} shelf {s_idx}]: name mismatch '{sh.nome}' != '{g_sh['nome']}'")
            all_passed = False

        if sh.medium != g_sh["medium"]:
            print(f"FAIL [{u} shelf {s_idx}]: medium mismatch '{sh.medium}' != '{g_sh['medium']}'")
            all_passed = False

        g_titles = g_sh["titoli"]
        if len(sh.titoli) != len(g_titles):
            print(f"FAIL [{u} shelf {s_idx}]: title count mismatch {len(sh.titoli)} != {len(g_titles)}")
            all_passed = False

        for t_idx, (t, gt) in enumerate(zip(sh.titoli, g_titles)):
            total_titles += 1
            if t["key"] != gt["key"]:
                print(f"FAIL [{u} shelf {s_idx} pos {t_idx}]: title order mismatch! Got {t['key']}, expected {gt['key']}")
                all_passed = False
                break

            s_score = float(t["punteggio"])
            g_score = float(gt["punteggio"])
            abs_diff = abs(s_score - g_score)
            rel_diff = abs_diff / max(abs(g_score), 1e-12)

            if abs_diff > max_abs_diff:
                max_abs_diff = abs_diff
            if rel_diff > max_rel_diff:
                max_rel_diff = rel_diff

            if rel_diff > 1e-6 and abs_diff > 1e-6:
                print(f"WARN [{u} shelf {s_idx} pos {t_idx} {t['key']}]: score diff rel={rel_diff:.2e}, abs={abs_diff:.2e} (s={s_score:.8f}, g={g_score:.8f})")
                if rel_diff > 1e-5:
                    all_passed = False

print("\n================== VERIFICATION SUMMARY ==================")
print(f"Profiles tested: {len(users)}")
print(f"Shelves verified: {total_shelves}")
print(f"Titles checked: {total_titles}")
print(f"Max absolute score diff: {max_abs_diff:.3e}")
print(f"Max relative score diff: {max_rel_diff:.3e}")
if all_passed:
    print("ALL CHECKS PASSED: Top-60 identical across all shelves and 10 profiles! Scores within tolerance.")
else:
    print("VERIFICATION FAILED!")
