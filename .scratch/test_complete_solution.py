"""test_complete_solution.py — Full simulation of extended taxonomy, tightened auteur shelves, and weighted support."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

import numpy as np
import scipy.sparse as sp
from collections import Counter, defaultdict

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TaxonomyEntry, TASSONOMIA_36, assegna_etichetta_cluster, valuta_cluster

# 1. Define new and tightened taxonomy entries
tight_auteur_kws = frozenset({
    "arthouse", "independent film", "criterion collection", "slow cinema",
    "mumblecore", "magic realism", "social commentary", "character study",
    "existentialism", "slice of life", "semi autobiographical", "surrealism",
    "woman director", "philosophical", "neo-noir", "poetry", "fictional biography",
    "meditative", "absurdist", "dark comedy"
})

tight_classic_kws = frozenset({
    "film noir", "neo realism", "italian neo realism", "french new wave",
    "nouvelle vague", "german expressionism", "expressionism", "new german cinema",
    "new hollywood", "pre-code", "poetic realism", "criterion collection",
    "world war ii", "french resistance", "holocaust (shoah)", "fascism",
    "road movie", "psychological drama", "existentialism"
})

# Exclusions
auteur_excluded_kws = frozenset({
    "superhero", "marvel cinematic universe (mcu)", "giant monster", "kaiju",
    "space opera", "freedom fighter", "action hero", "shark", "dinosaur", "holiday"
})
auteur_excluded_langs = frozenset({"te", "ta", "kn", "ml"})

classic_excluded_kws = frozenset({
    "romantic comedy", "romcom", "screwball comedy", "forbidden love", "superhero", "freedom fighter",
    "action hero", "giant monster", "kaiju", "space opera", "holiday", "christmas"
})

# Build complete updated taxonomy
# Start with base TASSONOMIA_36 and update / replace / add entries
new_entries = []
for e in TASSONOMIA_36:
    if e.nome in ("Cinema d'autore", "Cinema d'autore contemporaneo", "Classici d'autore"):
        continue
    elif e.nome == "Commedia romantica":
        new_entries.append(TaxonomyEntry(
            nome="Commedia romantica",
            tema="Comedy & Sitcom",
            priorita=80,
            derived_from_data=True,
            data_note="Derivato dai dati: commedie romantiche classiche e moderne (es. Vacanze romane, One Day, Maxton Hall)",
            keywords=frozenset({"romantic comedy", "romcom", "friends to lovers", "love triangle", "first love", "screwball comedy"}),
            anime=False,
            medium=None,  # Ammette sia film che serie
        ))
    elif e.nome == "Animazione d'azione per adulti":
        new_entries.append(TaxonomyEntry(
            nome="Animazione per adulti",
            tema="Animazione & Anime",
            priorita=85,
            derived_from_data=True,
            data_note="Derivato dai dati: serie animate occidentali adulte (Adventure Time, BoJack, Bob's Burgers, Invincible)",
            keywords=frozenset({"adult animation", "dark fantasy", "satire", "absurdist humor", "cartoon"}),
            anime=False,
            medium="series",
        ))
    elif e.nome == "Documentari sportivi":
        new_entries.append(TaxonomyEntry(
            nome="Documentari sportivi",
            tema="Sport & Documentari",
            priorita=85,
            derived_from_data=True,
            data_note="Derivato dai dati: Formula 1, MotoGP, calcio, basket e atleti",
            keywords=frozenset({"sports documentary", "athlete", "racing", "formula 1", "car race", "football (soccer)", "soccer", "tennis", "olympic games", "basketball", "boxing"}),
        ))
    elif e.nome == "Wrestling":
        new_entries.append(TaxonomyEntry(
            nome="Wrestling",
            tema="Sport & Documentari",
            priorita=95,
            derived_from_data=True,
            data_note="Derivato dai dati: WWE, Sumo e wrestling professionale",
            keywords=frozenset({"wrestling", "sports entertainment", "wwe", "professional wrestling", "sumo", "prowrestling"}),
        ))
    elif e.nome == "Animazione d'autore":
        new_entries.append(TaxonomyEntry(
            nome="Animazione d'autore",
            tema="Animazione & Anime",
            priorita=80,
            derived_from_data=True,
            data_note="Derivato dai dati: Studio Ghibli, Satoshi Kon, stop motion e lungometraggi animati d'autore",
            keywords=frozenset({"studio ghibli", "philosophical", "author animation", "surrealism", "stop motion", "independent animation", "adult animation"}),
            anime=None,
            medium="movie",
        ))
    else:
        new_entries.append(e)

# Add the new census-driven entries
new_entries.extend([
    # 1. Cinema d'autore contemporaneo (tightened)
    TaxonomyEntry(
        nome="Cinema d'autore contemporaneo",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: Kore-eda, PTA, Wenders, Jarmusch, Hamaguchi, Baker, Bong Joon-ho",
        keywords=tight_auteur_kws,
        medium="movie",
        anime=False,
    ),
    # 2. Classici d'autore (tightened)
    TaxonomyEntry(
        nome="Classici d'autore",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: Kurosawa, Ozu, Antonioni, Melville, Lang, Tarkovsky, Hitchcock, Scorsese",
        keywords=tight_classic_kws,
        medium="movie",
        anime=False,
    ),
    # 3. Cinema indiano
    TaxonomyEntry(
        nome="Cinema indiano",
        tema="Drama & Internazionale",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: produzioni Bollywood, Tollywood e Kollywood (RRR, Jawan, KGF, Dangal, Pathaan)",
        languages=frozenset({"hi", "te", "ta", "kn", "ml"}),
    ),
    # 4. Western & Frontiera (Sheridan)
    TaxonomyEntry(
        nome="Western contemporaneo & Frontiera",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: universo Yellowstone / Taylor Sheridan e neo-western (1883, 1923, Mayor of Kingstown)",
        keywords=frozenset({"neo-western", "western", "montana", "ranch", "cowboy", "frontier"}),
    ),
    # 5. Blockbuster d'azione & Action thriller
    TaxonomyEntry(
        nome="Blockbuster d'azione",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: franchise action e thriller (John Wick, Sisu, The Accountant, Bullet Train, The Gray Man)",
        keywords=frozenset({"assassin", "hitman", "revenge", "secret agent", "hand to hand combat", "action hero"}),
        medium="movie",
    ),
    # 6. Action comedy streaming (Netflix action)
    TaxonomyEntry(
        nome="Action comedy & Avventura",
        tema="Comedy & Sitcom",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: blockbuster d'azione comica streaming (Red Notice, The Adam Project, The Man from Toronto, Uncharted)",
        keywords=frozenset({"action comedy", "buddy comedy", "caper", "heist", "treasure hunt"}),
        medium="movie",
    ),
    # 7. Monster movie & Creature feature
    TaxonomyEntry(
        nome="Monster movie & Creature feature",
        tema="Fantascienza & Fantasy",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: creature marine, kaiju e dinosauri (Shark, Meg, Jurassic Park, Godzilla e Kong, Crawl)",
        keywords=frozenset({"shark", "giant monster", "creature feature", "dinosaur", "kaiju", "monster attack", "monster"}),
        medium="movie",
    ),
    # 8. Film di Natale
    TaxonomyEntry(
        nome="Film di Natale",
        tema="Comedy & Sitcom",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: commedie e pellicole natalizie (Nutcrackers, Family Switch, Qualcuno salvi il Natale, Il Grinch)",
        keywords=frozenset({"christmas", "santa claus", "holiday", "christmas party"}),
        medium="movie",
    ),
    # 9. Cinema samurai & Jidaigeki
    TaxonomyEntry(
        nome="Cinema samurai & Jidaigeki",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: drammi storici feudali giapponesi (Shōgun, Sanjuro, La sfida del samurai, Rurouni Kenshin)",
        keywords=frozenset({"samurai", "jidaigeki", "bakumatsu", "feudal japan", "swordplay", "katana", "ronin"}),
    ),
    # 10. Poliziesco britannico
    TaxonomyEntry(
        nome="Poliziesco britannico",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: serie poliziesche e procedurali UK (Vera, Unforgotten, Happy Valley, McDonald & Dodds)",
        keywords=frozenset({"police detective", "police procedural", "murder investigation", "british crime", "scotland yard"}),
        medium="series",
    ),
    # 11. Dramma & Romance LGBTQ+
    TaxonomyEntry(
        nome="Dramma & Romance LGBTQ+",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: serie e film a tematica queer (Young Royals, Uno di noi sta mentendo, Heartstopper, Fellow Travelers)",
        keywords=frozenset({"lgbt", "gay theme", "boys' love (bl)", "queer", "lesbian theme"}),
    ),
    # 12. Giallo classico & Cozy crime
    TaxonomyEntry(
        nome="Giallo classico & Cozy crime",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: adattamenti Agatha Christie e gialli deduttivi leggeri (Ludwig, Professor T, Towards Zero)",
        keywords=frozenset({"cosy crime", "whodunit", "agatha christie", "amateur detective"}),
    ),
    # 13. Cucina & Food
    TaxonomyEntry(
        nome="Cucina & Food",
        tema="Sport & Documentari",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: serie e documentari gastronomici, chef e food",
        keywords=frozenset({"cooking", "culinary", "food", "chef", "restaurant", "baking", "gastronomy", "foodie", "cuisine"}),
    ),
])

FULL_TAXONOMY = tuple(new_entries)
print(f"Total entries in FULL_TAXONOMY: {len(FULL_TAXONOMY)}")

# Helper to check if a title is excluded from a taxonomy entry
def is_seed_excluded_from_entry(seed_kws: set[str], seed_lang: str | None, entry_name: str) -> bool:
    if entry_name == "Cinema d'autore contemporaneo":
        if seed_lang in auteur_excluded_langs:
            return True
        if any(k in auteur_excluded_kws for k in seed_kws):
            return True
    elif entry_name == "Classici d'autore":
        if any(k in classic_excluded_kws for k in seed_kws):
            return True
    return False

print("Setup completed successfully.")
