"""inspect_two_offenders.py — Inspect members of Cinema d'autore contemporaneo and Classici d'autore."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

import numpy as np
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
import graph.tassonomia as T

from importlib.machinery import SourceFileLoader
mod = SourceFileLoader('mass_comp', '.scratch/run_mass_comparison.py').load_module()
res = mod.run_mass_comparison()

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
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

for p in ["castoffcrown", "warnok"]:
    print(f"\n=======================================================")
    print(f"PROFILE: {p}")
    print(f"=======================================================")
    for sh in res[p]["weighted"]["chosen"]:
        if "autore" in sh.nome.lower():
            print(f"\nShelf: '{sh.nome}' | size={sh.size} | mass={sh.weighted_support:.1f} | fonte={sh.nome_fonte}")
            for idx, m in enumerate(sh.semi_membri, 1):
                tid = m["tmdbId"]
                k = f"{m['medium']}:{tid}" if m['medium'] == 'series' else f"movie:{tid}"
                r_idx = engine.row_of.get(k)
                kws = get_member_kws(r_idx) if r_idx is not None else set()
                ex = extra_info.get(k, {})
                print(f"  {idx:2d}. {m['titolo']} ({m['anno']}) [lang={ex.get('orig_lang')}, country={ex.get('orig_country')}] | kws={list(kws)[:4]}")
