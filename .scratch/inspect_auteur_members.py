"""inspect_auteur_members.py — Verify member by member for both auteur shelves in castoffcrown."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))
sys.path.insert(0, str(ROOT / ".scratch"))

from run_full_test import run_experiment, tight_auteur_kws, tight_classic_kws

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

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

results = run_experiment()

res_c = results["castoffcrown"]
print(f"=== CASTOFFCROWN AUTEUR SHELVES INSPECTION ===")

for sh in res_c["chosen"]:
    if sh.nome in ("Cinema d'autore contemporaneo", "Classici d'autore"):
        print(f"\n=======================================================")
        print(f"SHELF: '{sh.nome}' | size={sh.size} | mass={sh.weighted_support:.1f} | fonte={sh.nome_fonte}")
        print(f"=======================================================")
        kws_ref = tight_auteur_kws if sh.nome == "Cinema d'autore contemporaneo" else tight_classic_kws
        
        matches_count = 0
        strays_count = 0
        for idx, m in enumerate(sh.semi_membri, 1):
            tid = m["tmdbId"]
            k = f"{m['medium']}:{tid}" if m['medium'] == 'series' else f"movie:{tid}"
            r_idx = engine.row_of.get(k)
            kws = get_member_kws(r_idx) if r_idx is not None else set()
            ex = extra_info.get(k, {})
            matching = kws & kws_ref
            is_match = bool(matching)
            if is_match:
                matches_count += 1
            
            # Check if stray
            is_stray = False
            t = m['titolo']
            if 'RRR' in t or 'Vacanze romane' in t or 'Godzilla' in t:
                is_stray = True
                strays_count += 1
            
            mark = "[✓ MATCH]" if is_match else "[  info ]"
            if is_stray: mark = "[! STRAY !]"
            
            print(f"  {idx:2d}. {mark} {t} ({m['anno']}) [lang={ex.get('orig_lang')}] | kws={list(matching if matching else kws)[:3]}")
        
        cov_pct = (matches_count / len(sh.semi_membri)) * 100.0
        print(f"\nSummary for '{sh.nome}':")
        print(f"  Total members: {len(sh.semi_membri)}")
        print(f"  Direct keyword matches: {matches_count}/{len(sh.semi_membri)} ({cov_pct:.1f}%) [Requirement >= 50%: {'PASSED' if cov_pct >= 50 else 'FAILED'}]")
        print(f"  Verified Strays: {strays_count}")
        print(f"  Contains RRR: {any('RRR' in m['titolo'] for m in sh.semi_membri)}")
        print(f"  Contains Vacanze romane: {any('Vacanze romane' in m['titolo'] for m in sh.semi_membri)}")
