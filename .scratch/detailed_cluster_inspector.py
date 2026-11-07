"""detailed_cluster_inspector.py — Inspect all 54 clusters and their titles."""
from __future__ import annotations
import json

with open(".scratch/clusters_summary.json", "r", encoding="utf-8") as f:
    clusters = json.load(f)

for c in clusters:
    print(f"=== ID {c['id']}: {c['profile']} ({c['medium']}, size={c['size']}, mass={c['mass']:.1f}) ===")
    print(f"Label: {c['nome']}")
    print(f"Titles: {c['titles']}")
    print(f"Keywords: {c['top_keywords'][:6]}")
    print(f"Langs: {c['languages']} | Countries: {c['countries']}\n")
