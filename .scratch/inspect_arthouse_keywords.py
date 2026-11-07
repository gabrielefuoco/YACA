"""inspect_arthouse_keywords.py — Inspect exact keywords of actual arthouse films."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

from collections import Counter
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
meta = K.metadati()
titles = meta.get("TIT")
years = meta.get("ANNO")
kw_tuple = I._carica_tfidf_keywords()
kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

def get_kws(r_idx):
    if X_kw is None: return set()
    s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
    return set(kw_names[c] for c in X_kw.indices[s:e] if kw_names[c] not in I.NOISE_KEYWORDS)

chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")

arthouse_titles = [
    "Il filo nascosto", "Paterson", "Past Lives", "Perfect Days", "Drive My Car",
    "Parasite", "The Lighthouse", "Licorice Pizza", "Frances Ha", "Synecdoche, New York",
    "Minari", "L'innocenza", "Chiamami col tuo nome", "Beau Travail", "Memorie di un assassino",
    "Frank", "Queer", "Ubriaco d'amore", "Dìdi", "Babyteeth - Tutti i colori di Milla",
    "Love Lies Bleeding", "Goksung - La presenza del diavolo", "Still Walking - Camminando in un giorno d'estate"
]

all_kws = Counter()
for t_target in arthouse_titles:
    for idx, k in enumerate(chiavi):
        r = engine.row_of[k]
        t = str(titles[r])
        if t == t_target:
            kws = get_kws(r)
            print(f"{t} ({years[r]}): {sorted(kws)}")
            for kw in kws: all_kws[kw] += 1

print("\nMost common keywords across core arthouse films:")
for kw, count in all_kws.most_common(30):
    print(f"  {kw:<30}: {count}")
