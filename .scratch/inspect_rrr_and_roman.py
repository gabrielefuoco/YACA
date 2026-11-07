"""inspect_rrr_and_roman.py — Deep inspection of RRR and Vacanze romane."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
import graph.tassonomia as T

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
meta = K.metadati()
titles = meta.get("TIT")
years = meta.get("ANNO")
extra_info = I._carica_tmdb_extra()
kw_tuple = I._carica_tfidf_keywords()
kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

def get_kws(r_idx):
    if X_kw is None: return set()
    s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
    return set(kw_names[c] for c in X_kw.indices[s:e] if kw_names[c] not in I.NOISE_KEYWORDS)

for k in ["movie:579974", "movie:804"]: # RRR, Vacanze romane
    r = engine.row_of[k]
    tit = str(titles[r])
    yr = int(years[r])
    kws = get_kws(r)
    ex = extra_info.get(k, {})
    print(f"=== {tit} ({yr}) — Key: {k}, Row: {r} ===")
    print(f"Lang: {ex.get('orig_lang')} | Country: {ex.get('orig_country')}")
    print(f"Keywords ({len(kws)}): {sorted(kws)}")

    # Check match against all entries in TASSONOMIA_36
    ev = {
        "size": 1,
        "medium": "movie",
        "anime_pct": 0.0,
        "adult_pct": 0.0,
        "member_kws": [kws],
        "languages": {ex.get("orig_lang"): 1} if ex.get("orig_lang") else {},
        "countries": {ex.get("orig_country"): 1} if ex.get("orig_country") else {},
        "repr_seeds": [tit],
        "is_piccolo": True,
    }
    print("Matches against current taxonomy:")
    for entry in T.TASSONOMIA_36:
        ok, conf = T.valuta_cluster(ev, entry)
        if ok:
            print(f"  -> MATCHED: '{entry.nome}' (conf={conf:.2f})")
    print()
