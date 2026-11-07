"""print_all_66_base.py — Print all 66 base unnameable clusters."""
from __future__ import annotations
import json

with open(".scratch/base_unnameable.json", "r", encoding="utf-8") as f:
    clusters = json.load(f)

for idx, c in enumerate(clusters, 1):
    tits_str = ", ".join(c["titles"][:5])
    kw_str = ", ".join(f"{k}:{v}" for k, v in c["top_kws"][:5])
    langs_str = ", ".join(f"{l}:{n}" for l, n in c["langs"].items())
    print(f"[{idx:2d}] {c['profile']:<14} | {c['medium']:<6} | sz={c['size']:2d} | mass={c['mass']:5.1f} | {langs_str:<12} | TITLES: {tits_str}")
    print(f"     KWS: {kw_str}")
