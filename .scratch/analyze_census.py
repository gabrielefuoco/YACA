"""analyze_census.py — Aggregation of all unnameable clusters across 10 profiles into recurring themes."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

import json
from collections import Counter, defaultdict
import numpy as np

from census_script import run_census

clusters = run_census()

print(f"Total unnameable clusters collected: {len(clusters)}")

# Let's inspect each cluster and group them by shared evidence / theme
# We will print all 54 clusters with profile, size, mass, medium, top titles, top keywords, languages, countries
for idx, c in enumerate(clusters, 1):
    kws = [f"{k}:{v}" for k, v in c["top_keywords"][:5]]
    print(f"[{idx:2d}] {c['profile']:<14} | {c['medium']:<6} | sz={c['size']:2d} | mass={c['mass']:5.1f} | {c['nome'][:45]:<45} | kws={','.join(kws)} | langs={c['languages']} | countries={c['countries']}")
