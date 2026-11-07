"""categorize_themes.py — Analyze patterns and map each cluster to a candidate recurring theme."""
from __future__ import annotations
import json
from collections import defaultdict, Counter

with open(".scratch/clusters_summary.json", "r", encoding="utf-8") as f:
    clusters = json.load(f)

# Let's inspect themes mentioned by user:
# 1. cinema indiano
# 2. blockbuster d'azione / action movie / action thriller
# 3. action Netflix / streaming action
# 4. commedia romantica / rom-com
# 5. western Sheridan / neo-western / western moderno
# 6. film di Natale / Christmas movies
# 7. monster / shark movie / creature feature
# 8. animazione occidentale adulta
# 9. documentari sportivi
# 10. cucina & food
# And what other themes appear among the 54 clusters?

for c in clusters:
    # Print cluster id, profile, medium, size, mass, sample titles, and keywords
    tits_str = ", ".join(c["titles"][:5])
    kw_str = ", ".join(k for k, v in c["top_keywords"][:5])
    langs_str = ", ".join(f"{l}:{n}" for l, n in c["languages"].items())
    print(f"ID={c['id']:2d} | {c['profile']:<14} | {c['medium']:<6} | sz={c['size']:2d} | mass={c['mass']:5.1f} | {langs_str:<12} | TITLES: {tits_str}")
    print(f"       KWS: {kw_str}")
