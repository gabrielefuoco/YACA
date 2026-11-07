"""test_tight_auteur.py — Test tightened keywords for Cinema d'autore and Classici d'autore."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

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

def get_kws(r_idx):
    if X_kw is None: return set()
    s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
    return set(kw_names[c] for c in X_kw.indices[s:e] if kw_names[c] not in I.NOISE_KEYWORDS)

chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")

tight_auteur_kws = frozenset({
    "arthouse", "independent film", "criterion collection", "slow cinema",
    "mumblecore", "magic realism", "social commentary", "character study",
    "existentialism", "slice of life", "semi autobiographical", "surrealism",
    "woman director", "philosophical"
})

tight_classic_kws = frozenset({
    "film noir", "neo realism", "italian neo realism", "french new wave",
    "nouvelle vague", "german expressionism", "expressionism", "new german cinema",
    "new hollywood", "pre-code", "poetic realism", "criterion collection",
    "world war ii", "french resistance", "holocaust (shoah)", "fascism"
})

blockbuster_exclusion_kws = frozenset({
    "superhero", "marvel cinematic universe (mcu)", "giant monster", "kaiju",
    "space opera", "romantic comedy", "romcom", "freedom fighter", "action hero"
})

print(f"Tight Auteur Keywords ({len(tight_auteur_kws)}): {sorted(tight_auteur_kws)}")
print(f"Tight Classic Keywords ({len(tight_classic_kws)}): {sorted(tight_classic_kws)}")

test_titles = [
    "Il filo nascosto", "Paterson", "Past Lives", "Perfect Days", "Drive My Car",
    "Parasite", "The Lighthouse", "Licorice Pizza", "Frances Ha", "Synecdoche, New York",
    "Minari", "L'innocenza", "Chiamami col tuo nome", "Beau Travail", "Memorie di un assassino",
    "Frank", "Queer", "Ubriaco d'amore", "Dìdi", "Babyteeth - Tutti i colori di Milla",
    "Love Lies Bleeding", "Goksung - La presenza del diavolo", "Still Walking - Camminando in un giorno d'estate",
    "M - Il mostro di Düsseldorf", "Lo sconosciuto del terzo piano", "Stranger Than Paradise",
    "Velluto blu", "Toro scatenato", "Anche i boia muoiono", "La morte corre sul fiume",
    "Paris, Texas", "L'altro uomo", "Il tesoro della Sierra Madre", "Detour: deviazione per l'inferno",
    "Taxi Driver", "L'odio", "Delicatessen", "Arrivederci ragazzi", "Una giornata particolare",
    # Counter-examples / Strays to verify:
    "RRR", "Vacanze romane", "Godzilla Minus One", "Collateral", "Ocean's Eleven - Fate il vostro gioco"
]

print("\n" + "=" * 90)
print(f"{'Titolo':<35} | {'Auteur Match':<15} | {'Classic Match':<15} | {'Exclusion':<15}")
print("=" * 90)

for target in test_titles:
    found = False
    for idx, k in enumerate(chiavi):
        r = engine.row_of[k]
        t = str(titles[r])
        if t == target:
            found = True
            kws = get_kws(r)
            m_aut = kws & tight_auteur_kws
            m_cla = kws & tight_classic_kws
            m_exc = kws & blockbuster_exclusion_kws
            print(f"{t:<35} | {str(list(m_aut)[:2]):<15} | {str(list(m_cla)[:2]):<15} | {str(list(m_exc)[:2]):<15}")
            break
    if not found:
        print(f"{target:<35} | NOT IN HISTORY")
