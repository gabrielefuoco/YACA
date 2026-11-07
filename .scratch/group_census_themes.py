"""group_census_themes.py — Group all unnameable clusters across the 10 timelines into recurring themes."""
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

print(f"Loaded {len(clusters)} unnameable clusters with >= 3 seeds.")

# Let's inspect all clusters and their titles to categorize them
# Let's write out each cluster's profile, medium, size, mass, titles, top keywords
for i, c in enumerate(clusters):
    c['id'] = i

with open(".scratch/clusters_summary.json", "w", encoding="utf-8") as f:
    json.dump(clusters, f, ensure_ascii=False, indent=2)

print("Saved clusters to .scratch/clusters_summary.json")
