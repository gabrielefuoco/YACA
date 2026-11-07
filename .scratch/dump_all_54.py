"""dump_all_54.py — Dump all 54 unnameable clusters with full title lists."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

from census_script import run_census

clusters = run_census()

for idx, c in enumerate(clusters, 1):
    print(f"\n================================================================================")
    print(f"[{idx}] {c['profile']} | {c['medium']} | size={c['size']} | mass={c['mass']:.1f}")
    print(f"Label: {c['nome']}")
    print(f"Titles: {c['titles']}")
    print(f"Top kws: {c['top_keywords']}")
    print(f"Langs: {c['languages']} | Countries: {c['countries']}")
