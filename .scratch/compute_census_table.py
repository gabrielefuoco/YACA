"""compute_census_table.py — Exact seed counts and masses for all recurring themes across 10 profiles."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

import json
from collections import Counter, defaultdict
import numpy as np

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
import graph.tassonomia as T

PROFILI_10 = [
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

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
W = I.carica_matrice_affinita()
meta = K.metadati()
titles = meta.get("TIT")
years = meta.get("ANNO")
extra_info = I._carica_tmdb_extra()
kw_tuple = I._carica_tfidf_keywords()
kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

def get_member_kws(r_idx: int) -> set[str]:
    if X_kw is None: return set()
    s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
    cols = X_kw.indices[s:e]
    return set(kw_names[c] for c in cols if kw_names[c] not in I.NOISE_KEYWORDS)

with open(".scratch/base_unnameable.json", "r", encoding="utf-8") as f:
    unnameable_clusters = json.load(f)

print(f"Total unnameable base clusters: {len(unnameable_clusters)}")

# Let's inspect each cluster and tag it with a theme candidate
# We will define theme detection rules to classify each unnameable cluster
def detect_cluster_theme(c):
    titles_lower = [t.lower() for t in c["titles"]]
    kws = set(k for k, v in c["top_kws"])
    langs = c["langs"]
    
    # 1. Cinema indiano
    if any(l in ("hi", "te", "ta", "kn", "ml") for l in langs) or any("india" in k for k in kws):
        return "Cinema indiano"
        
    # 2. Western & Sheridan
    if any("western" in k or "montana" in k or "ranch" in k for k in kws) or any("yellowstone" in t or "kingstown" in t or "1883" in t or "1923" in t for t in titles_lower):
        return "Western contemporaneo & Sheridan"
        
    # 3. Film di Natale
    if any("christmas" in k or "holiday" in k or "santa" in k for k in kws) or any("natale" in t or "grinch" in t or "christmas" in t for t in titles_lower):
        return "Film di Natale"
        
    # 4. Monster & Shark movie
    if any(k in ("shark", "giant monster", "creature feature", "dinosaur", "monster") for k in kws) or any("shark" in t or "jurassic" in t or "godzilla" in t or "meg" in t or "crawl" in t for t in titles_lower):
        return "Monster & Shark movie"
        
    # 5. Samurai & Jidaigeki
    if any(k in ("samurai", "jidaigeki", "bakumatsu", "feudal japan") for k in kws) or any("shōgun" in t or "sanjuro" in t or "kenshin" in t for t in titles_lower):
        return "Cinema samurai & Jidaigeki"
        
    # 6. Animazione occidentale adulta
    if c["medium"] == "series" and any(k == "adult animation" for k in kws) and not any(l == "ja" for l in langs):
        return "Animazione occidentale adulta"
        
    # 7. Mecha & Anime robot
    if any(k in ("mecha", "real robot", "gundam") for k in kws):
        return "Anime mecha & robot"
        
    # 8. Blockbuster d'azione / Action thriller / Action Netflix
    if c["medium"] == "movie" and (
        any(k in ("assassin", "hitman", "agent", "action comedy", "hand to hand combat", "heist", "central intelligence agency (cia)") for k in kws) or
        any(t in ("red notice", "the gray man", "bullet train", "sisu: il vendicatore", "john wick", "the accountant", "deadpool 2") for t in titles_lower)
    ):
        # Disambiguate Netflix action / Action comedy vs Action thriller
        if any("action comedy" in k for k in kws) or any(t in ("red notice", "the adam project", "the man from toronto") for t in titles_lower):
            return "Action comedy & Streaming"
        return "Blockbuster d'azione & Action thriller"
        
    # 9. British Crime & Police Procedural
    if c["medium"] == "series" and (
        any(k in ("police", "police detective", "police investigation", "murder investigation") for k in kws) or
        any(t in ("vera", "unforgotten", "happy valley", "line of duty") for t in titles_lower)
    ):
        return "Poliziesco & Procedural britannico"
        
    # 10. Giallo classico & Cozy crime
    if c["medium"] == "series" and any("cosy crime" in k for k in kws):
        return "Giallo classico & Cozy crime"
        
    # 11. Nordic Noir
    if any("nordic noir" in k for k in kws):
        return "Nordic Noir"
        
    # 12. LGBTQ+ Romance & Drama
    if any(k in ("lgbt", "gay theme", "boys' love (bl)") for k in kws):
        return "Dramma & Romance LGBTQ+"
        
    # 13. Commedia romantica / Teen romance
    if any(k in ("romance", "romcom", "romantic comedy", "wedding", "first love") for k in kws):
        return "Commedia romantica & Teen romance"
        
    # 14. Doc / Architecture / Manufacturing
    if any(k in ("factory", "architecture", "manufacturing") for k in kws):
        return "Documentari di scoperta & Ingegneria"
        
    # 15. Teen sitcom / Nickelodeon
    if any(k in ("child star", "double life", "popstar") for k in kws):
        return "Teen sitcom & Disney/Nickelodeon"
        
    # 16. Late night & Satire comedy
    if any(k in ("hilarious", "mockumentary", "talk show", "political satire") for k in kws):
        return "Commedia satirica & Talk show"

    return "Altro non classificato"

theme_stats = defaultdict(lambda: {"total_seeds": 0, "total_mass": 0.0, "profiles": set(), "clusters": []})

for c in unnameable_clusters:
    theme = detect_cluster_theme(c)
    theme_stats[theme]["total_seeds"] += c["size"]
    theme_stats[theme]["total_mass"] += c["mass"]
    theme_stats[theme]["profiles"].add(c["profile"])
    theme_stats[theme]["clusters"].append(c)

print("\n" + "=" * 90)
print(f"{'Tema ricorrente':<40} | {'Semi':<6} | {'Massa':<8} | {'Profili':<25}")
print("=" * 90)

sorted_themes = sorted(theme_stats.items(), key=lambda x: -x[1]["total_mass"])
for th, st in sorted_themes:
    profs = ", ".join(sorted(st["profiles"]))
    print(f"{th:<40} | {st['total_seeds']:<6d} | {st['total_mass']:<8.1f} | {profs:<25}")
