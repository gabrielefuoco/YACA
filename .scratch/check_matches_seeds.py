"""check_matches_seeds.py — Test every seed in castoffcrown against Cinema d'autore and Classici."""
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

chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")

auteur_entry = next(e for e in T.TASSONOMIA_36 if e.nome == "Cinema d'autore contemporaneo")
classic_entry = next(e for e in T.TASSONOMIA_36 if e.nome == "Classici d'autore")

print(f"Keywords in Cinema d'autore contemporaneo ({len(auteur_entry.keywords)}):")
print(sorted(auteur_entry.keywords))
print(f"\nKeywords in Classici d'autore ({len(classic_entry.keywords)}):")
print(sorted(classic_entry.keywords))

matches_auteur = []
matches_classic = []

for idx, k in enumerate(chiavi):
    r = engine.row_of[k]
    kws = get_kws(r)
    tit = str(titles[r])
    med = "series" if k.startswith("tv:") else "movie"
    if med != "movie": continue
    
    m_aut = kws & auteur_entry.keywords
    if m_aut:
        matches_auteur.append((tit, int(years[r]), m_aut))
        
    m_cla = kws & classic_entry.keywords
    if m_cla:
        matches_classic.append((tit, int(years[r]), m_cla))

print(f"\nTotal movies matching Cinema d'autore contemporaneo keywords: {len(matches_auteur)}")
print(f"Total movies matching Classici d'autore keywords: {len(matches_classic)}")

for t, y, kw in matches_auteur[:15]:
    print(f"  Auteur: {t} ({y}) -> {kw}")
print("...")
for t, y, kw in matches_classic[:15]:
    print(f"  Classic: {t} ({y}) -> {kw}")
