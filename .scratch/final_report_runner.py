"""final_report_runner.py — Produce all data required for the user report."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

from collections import Counter, defaultdict
import numpy as np
import scipy.sparse as sp

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster, valuta_cluster

def generate_report_data():
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

    # 1. Castoffcrown inspection
    k_cast, r_cast, p_cast, e_cast = K.storia_trakt("castoffcrown")
    cast_shelves = I.scaffali(engine, k_cast, W_aff=W)

    print("=== CASTOFFCROWN SERVED SHELVES ===")
    for idx, sh in enumerate(cast_shelves, 1):
        print(f"{idx}. {sh.nome} (semi={sh.size}, mass={getattr(sh, 'weighted_support', 0):.1f}) [{sh.nome_fonte}]")

    print("\n=== WARNOK SERVED SHELVES ===")
    k_warn, r_warn, p_warn, e_warn = K.storia_trakt("warnok")
    warn_shelves = I.scaffali(engine, k_warn, W_aff=W)
    for idx, sh in enumerate(warn_shelves, 1):
        print(f"{idx}. {sh.nome} (semi={sh.size}, mass={getattr(sh, 'weighted_support', 0):.1f}) [{sh.nome_fonte}]")

    # Inspect members of Cinema d'autore contemporaneo in castoffcrown
    auteur_entry = [e for e in TASSONOMIA_36 if e.nome == "Cinema d'autore contemporaneo"][0]
    classic_entry = [e for e in TASSONOMIA_36 if e.nome == "Classici d'autore"][0]

    auteur_sh = [s for s in cast_shelves if s.nome == "Cinema d'autore contemporaneo"][0]
    classic_sh = [s for s in cast_shelves if s.nome == "Classici d'autore"][0]

    print("\n" + "=" * 90)
    print(f"CINEMA D'AUTORE CONTEMPORANEO (MEMBERS: {len(auteur_sh.semi_membri)})")
    print("=" * 90)
    auteur_matches = 0
    auteur_strays = 0
    for idx, m in enumerate(auteur_sh.semi_membri, 1):
        k_seme = f"{m['medium']}:{m['tmdbId']}"
        r_idx = engine.row_of.get(k_seme, -1)
        kws = get_member_kws(r_idx)
        lang = extra_info.get(k_seme, {}).get("orig_lang")
        matched_kws = kws & auteur_entry.keywords
        is_match = len(matched_kws) > 0
        if is_match: auteur_matches += 1
        
        # Check stray criteria (e.g. blockbuster / mainstream / Indian / rom-com)
        is_stray = False
        if lang in auteur_entry.excluded_languages: is_stray = True
        if any(k in auteur_entry.excluded_keywords for k in kws): is_stray = True
        if is_stray: auteur_strays += 1

        mark = "✓ MATCH" if is_match else "  info "
        print(f"{idx:>2}. [{mark}] {m['titolo']} ({m['anno']}) [lang={lang}] | matched={sorted(matched_kws)} | kws={sorted(kws)[:4]}")

    print(f"\nAuteur Summary:")
    print(f"  Total: {len(auteur_sh.semi_membri)}")
    print(f"  Keyword Matches: {auteur_matches}/{len(auteur_sh.semi_membri)} ({auteur_matches/len(auteur_sh.semi_membri)*100:.1f}%)")
    print(f"  Strays: {auteur_strays}")
    print(f"  Contains RRR: {any('RRR' in m['titolo'] for m in auteur_sh.semi_membri)}")
    print(f"  Contains Vacanze romane: {any('Vacanze' in m['titolo'] or 'Roman' in m['titolo'] for m in auteur_sh.semi_membri)}")

    print("\n" + "=" * 90)
    print(f"CLASSICI D'AUTORE (MEMBERS: {len(classic_sh.semi_membri)})")
    print("=" * 90)
    classic_matches = 0
    classic_strays = 0
    for idx, m in enumerate(classic_sh.semi_membri, 1):
        k_seme = f"{m['medium']}:{m['tmdbId']}"
        r_idx = engine.row_of.get(k_seme, -1)
        kws = get_member_kws(r_idx)
        lang = extra_info.get(k_seme, {}).get("orig_lang")
        matched_kws = kws & classic_entry.keywords
        is_match = len(matched_kws) > 0
        if is_match: classic_matches += 1
        
        is_stray = False
        if any(k in classic_entry.excluded_keywords for k in kws): is_stray = True
        if is_stray: classic_strays += 1

        mark = "✓ MATCH" if is_match else "  info "
        print(f"{idx:>2}. [{mark}] {m['titolo']} ({m['anno']}) [lang={lang}] | matched={sorted(matched_kws)} | kws={sorted(kws)[:4]}")

    print(f"\nClassic Summary:")
    print(f"  Total: {len(classic_sh.semi_membri)}")
    print(f"  Keyword Matches: {classic_matches}/{len(classic_sh.semi_membri)} ({classic_matches/len(classic_sh.semi_membri)*100:.1f}%)")
    print(f"  Strays: {classic_strays}")
    print(f"  Contains RRR: {any('RRR' in m['titolo'] for m in classic_sh.semi_membri)}")
    print(f"  Contains Vacanze romane: {any('Vacanze' in m['titolo'] or 'Roman' in m['titolo'] for m in classic_sh.semi_membri)}")

if __name__ == "__main__":
    generate_report_data()
