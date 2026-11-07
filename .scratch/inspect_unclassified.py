"""inspect_unclassified.py — Inspect clusters currently in 'Altro non classificato'."""
from __future__ import annotations
import json
from compute_census_table import detect_cluster_theme

with open(".scratch/base_unnameable.json", "r", encoding="utf-8") as f:
    unnameable_clusters = json.load(f)

unclass = [c for c in unnameable_clusters if detect_cluster_theme(c) == "Altro non classificato"]
print(f"Total unclassified clusters: {len(unclass)}")

for idx, c in enumerate(unclass, 1):
    tits = ", ".join(c["titles"][:5])
    kws = ", ".join(f"{k}:{v}" for k, v in c["top_kws"][:5])
    langs = ", ".join(f"{l}:{n}" for l, n in c["langs"].items())
    print(f"[{idx:2d}] {c['profile']:<14} | {c['medium']:<6} | sz={c['size']:2d} | mass={c['mass']:5.1f} | {langs:<10} | TITLES: {tits}")
    print(f"     KWS: {kws}\n")
