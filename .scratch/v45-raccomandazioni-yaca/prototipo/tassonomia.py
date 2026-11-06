import pickle
import json
from collections import Counter
from dataclasses import dataclass, field
from typing import Any
from pathlib import Path

@dataclass
class TaxonomyEntry:
    nome: str
    tema: str
    priorita: int
    derived_from_data: bool
    data_note: str
    keywords: set[str] = field(default_factory=set)
    medium: str | None = None
    anime: bool | None = None
    adulto: bool | None = None
    languages: set[str] | None = None
    countries: set[str] | None = None
    collections: set[str] | None = None
    min_confidence: float = 0.50

TASSONOMIA_36 = [
    # --- Animazione & Anime (6 voci) ---
    TaxonomyEntry(
        nome="Anime shōnen",
        tema="Animazione & Anime",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: warnok S1, moppierhead S2, castoffcrown S1",
        keywords={"shounen", "super power", "seinen", "ninja", "martial arts"},
        anime=True,
    ),
    TaxonomyEntry(
        nome="Anime romantici & slice of life",
        tema="Animazione & Anime",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: castoffcrown S2 (Gachiakuta, Polar Opposites)",
        keywords={"slice of life", "romance", "school life", "shoujo"},
        anime=True,
    ),
    TaxonomyEntry(
        nome="Animazione d'autore",
        tema="Animazione & Anime",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: film d'autore Studio Ghibli e lungometraggi animati",
        keywords={"studio ghibli", "philosophical", "author animation", "surrealism"},
        anime=True,
        medium="movie",
    ),
    TaxonomyEntry(
        nome="Sitcom animate",
        tema="Animazione & Anime",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: hammers-lists S2, sappss S3, moppierhead S1, 1jacobjohn S3",
        keywords={"dysfunctional family", "adult humor", "family conflict", "sitcom", "parody"},
        anime=False,
        medium="series",
    ),
    TaxonomyEntry(
        nome="Animazione per famiglie",
        tema="Animazione & Anime",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: sappss S1 (Elio, Jumpers, La gang del bosco)",
        keywords={"3d animation", "anthropomorphism", "pixar", "dreamworks", "villain"},
        anime=False,
        medium="movie",
    ),
    TaxonomyEntry(
        nome="Animazione d'azione per adulti",
        tema="Animazione & Anime",
        priorita=75,
        derived_from_data=True,
        data_note="Derivato dai dati: warnok S4 e flixinatoor99 S5 (Invincible, Blue Eye Samurai)",
        keywords={"adult animation", "dark fantasy", "gore", "anti hero", "superhero"},
        anime=False,
        medium="series",
    ),

    # --- Fantascienza & Fantasy (7 voci) ---
    TaxonomyEntry(
        nome="Space opera",
        tema="Fantascienza & Fantasy",
        priorita=95,
        derived_from_data=True,
        data_note="Derivato dai dati: warnok S3 (Star Wars, Mandalorian)",
        keywords={"space opera", "space travel", "galaxy", "spacecraft", "star wars"},
    ),
    TaxonomyEntry(
        nome="Fantascienza d'invasione",
        tema="Fantascienza & Fantasy",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: sangam456 S2 e cluster alieni di warnok",
        keywords={"alien invasion", "alien", "alien monster", "extraterrestrial"},
    ),
    TaxonomyEntry(
        nome="Fantascienza post-apocalittica",
        tema="Fantascienza & Fantasy",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: warnok S2 e franchise Fallout",
        keywords={"post-apocalyptic future", "dystopia", "wasteland", "survival"},
    ),
    TaxonomyEntry(
        nome="Cyberpunk & Futuro distopico",
        tema="Fantascienza & Fantasy",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S2 (Outside the Wire, Upgrade)",
        keywords={"cyberpunk", "transhumanism", "artificial intelligence (a.i.)", "cyborg", "near future"},
    ),
    TaxonomyEntry(
        nome="Magia & Stregoneria",
        tema="Fantascienza & Fantasy",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: moppierhead S3/S4 e flixinatoor99 S6 (Harry Potter, Wicked)",
        keywords={"wizard", "witch", "magic", "spell", "sorcery"},
    ),
    TaxonomyEntry(
        nome="Cinecomic & Supereroi",
        tema="Fantascienza & Fantasy",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S5 e flixinatoor99 S7 (Superman, Avatar)",
        keywords={"superhero", "super power", "based on comic", "marvel cinematic universe (mcu)"},
    ),
    TaxonomyEntry(
        nome="Viaggi nel tempo & Multiverso",
        tema="Fantascienza & Fantasy",
        priorita=80,
        derived_from_data=False,
        data_note="Pattern tematico classico di catalogo fantascientifico",
        keywords={"time travel", "multiverse", "alternate timeline", "alternate reality"},
    ),

    # --- Thriller, Giallo & Crime (6 voci) ---
    TaxonomyEntry(
        nome="Giallo investigativo",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: pepsipex S1, pepsipex S2 e sangam456 S1",
        keywords={"murder mystery", "whodunit", "detective", "investigation", "homicide detective"},
    ),
    TaxonomyEntry(
        nome="Docufiction true crime",
        tema="Crime, Thriller & Mistero",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: sappss S5 e 1jacobjohn S4 / S6",
        keywords={"true crime", "crime documentary", "serial killer", "dramatization"},
    ),
    TaxonomyEntry(
        nome="Spy thriller",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: pepsipex S4 (Slow Horses, Lioness, The Agency)",
        keywords={"spy", "spy thriller", "espionage", "secret agent", "british spy", "central intelligence agency (cia)"},
    ),
    TaxonomyEntry(
        nome="Thriller psicologico",
        tema="Crime, Thriller & Mistero",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: sappss S2 e pepsipex S2",
        keywords={"psychological thriller", "mental illness", "paranoia", "obsession", "hallucination"},
    ),
    TaxonomyEntry(
        nome="Gangster & Criminalità",
        tema="Crime, Thriller & Mistero",
        priorita=75,
        derived_from_data=False,
        data_note="Pattern classico crime / mafia del catalogo",
        keywords={"organized crime", "mafia", "drug cartel", "gangster", "heist"},
    ),
    TaxonomyEntry(
        nome="Horror soprannaturale",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: carverclan S1 (I peccatori, Stranger Things) e pepsipex S5",
        keywords={"supernatural horror", "demon", "possession", "ghost", "haunted house", "supernatural"},
    ),

    # --- Comedy & Sitcom (4 voci) ---
    TaxonomyEntry(
        nome="Sitcom",
        tema="Comedy & Sitcom",
        priorita=75,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S1 (The King of Queens, My Name Is Earl)",
        keywords={"sitcom", "workplace comedy"},
        anime=False,
        medium="series",
    ),
    TaxonomyEntry(
        nome="Commedia satirica",
        tema="Comedy & Sitcom",
        priorita=75,
        derived_from_data=True,
        data_note="Derivato dai dati: flixinatoor99 S3 (Spider-Noir, Parks & Rec, White Lotus)",
        keywords={"satire", "social satire", "political satire", "parody"},
    ),
    TaxonomyEntry(
        nome="Dark comedy",
        tema="Comedy & Sitcom",
        priorita=70,
        derived_from_data=True,
        data_note="Derivato dai dati: sappss S7 (Brassic, This Country)",
        keywords={"dark comedy", "black comedy", "crude comedy"},
    ),
    TaxonomyEntry(
        nome="Commedia romantica",
        tema="Comedy & Sitcom",
        priorita=70,
        derived_from_data=False,
        data_note="Pattern classico commedie romantiche cinematografiche",
        keywords={"romantic comedy", "romance", "friends to lovers", "love triangle"},
        anime=False,
        medium="movie",
    ),

    # --- Drama, Epoca & Internazionale (6 voci) ---
    TaxonomyEntry(
        nome="Dramma d'epoca",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: pepsipex S3 (La valle dell'Eden, The Forsytes)",
        keywords={"period drama", "costume drama", "historical fiction", "19th century", "victorian era"},
    ),
    TaxonomyEntry(
        nome="Medical drama",
        tema="Drama & Internazionale",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: hammers-lists S1 (The Good Doctor, Chicago Med, 9-1-1)",
        keywords={"medical drama", "hospital", "doctor", "nurse", "surgery"},
        medium="series",
    ),
    TaxonomyEntry(
        nome="Thriller coreano",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: titoli thriller/crime K-drama in castoffcrown e warnok",
        keywords={"revenge", "investigation", "murder", "thriller", "serial killer"},
        languages={"ko"},
    ),
    TaxonomyEntry(
        nome="Dramma coreano",
        tema="Drama & Internazionale",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: castoffcrown S4 (Hospital Playlist, Four Hands Two Sonatas)",
        keywords={"romance", "friendship", "melodrama", "family", "bromance"},
        languages={"ko"},
    ),
    TaxonomyEntry(
        nome="Commedia romantica asiatica",
        tema="Drama & Internazionale",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: romance asiatiche televisive e cinematografiche",
        keywords={"romance", "romantic comedy", "first love", "youth"},
        languages={"ko", "ja", "zh"},
    ),
    TaxonomyEntry(
        nome="Cinema d'autore",
        tema="Drama & Internazionale",
        priorita=75,
        derived_from_data=True,
        data_note="Derivato dai dati: castoffcrown S3 (Primetime, Il filo nascosto)",
        keywords={"arthouse", "independent film", "existentialism", "criterion collection"},
        medium="movie",
    ),

    # --- Documentari, Sport & Spettacolo (6 voci) ---
    TaxonomyEntry(
        nome="Wrestling",
        tema="Sport & Documentari",
        priorita=95,
        derived_from_data=True,
        data_note="Derivato dai dati: moppierhead S5 (SmackDown, Raw)",
        keywords={"wrestling", "sports entertainment", "wwe", "professional wrestling"},
    ),
    TaxonomyEntry(
        nome="Documentari naturalistici",
        tema="Sport & Documentari",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: sappss S4 e 1jacobjohn S15 (Big Beasts, Pianeta preistorico)",
        keywords={"nature documentary", "nature", "wildlife", "ocean", "animals", "farm"},
    ),
    TaxonomyEntry(
        nome="Documentari sportivi",
        tema="Sport & Documentari",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S10 (The Redeem Team, Skywalkers)",
        keywords={"sports documentary", "basketball", "olympic games", "athlete"},
    ),
    TaxonomyEntry(
        nome="Motori & Corse automobilistiche",
        tema="Sport & Documentari",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S14 (Car Masters, The Grand Tour)",
        keywords={"automobile", "car race", "classic cars", "car restoration"},
    ),
    TaxonomyEntry(
        nome="Teatro filmato & Musical",
        tema="Sport & Documentari",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: carverclan S2 (Peter Pan Goes Wrong, Great Performances)",
        keywords={"filmed theater", "based on play or musical", "stage musical"},
    ),
    TaxonomyEntry(
        nome="Fede & Spiritualità",
        tema="Sport & Documentari",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S8 (The Chosen, Il re dei re)",
        keywords={"christian faith", "christian film", "religion", "spirituality"},
    ),
]

def valuta_cluster(
    cluster_evidence: dict[str, Any],
    entry: TaxonomyEntry,
) -> tuple[bool, float]:
    """Verifica se il cluster soddisfa la regola dichiarativa dell'entry tassonomica."""
    sz = cluster_evidence["size"]
    if sz <= 0:
        return False, 0.0

    # 1. Filtro medium
    if entry.medium and cluster_evidence["medium"] != entry.medium:
        return False, 0.0

    # 2. Filtro Anime
    if entry.anime is True and cluster_evidence["anime_pct"] < 0.5:
        return False, 0.0
    if entry.anime is False and cluster_evidence["anime_pct"] >= 0.5:
        return False, 0.0

    # 3. Filtro Adulto
    if entry.adulto is True and cluster_evidence["adult_pct"] < 0.5:
        return False, 0.0
    if entry.adulto is False and cluster_evidence["adult_pct"] >= 0.5:
        return False, 0.0

    # 4. Filtro Lingua dominante
    if entry.languages:
        langs = cluster_evidence.get("languages", {})
        tot_langs = sum(langs.values())
        if tot_langs == 0:
            return False, 0.0
        match_l = sum(cnt for l, cnt in langs.items() if l in entry.languages)
        if (match_l / tot_langs) < 0.5:
            return False, 0.0

    # 5. Copertura keyword sui semi del cluster (union coverage)
    member_kws = cluster_evidence.get("member_kws", [])
    if member_kws and entry.keywords:
        covered = sum(1 for kws in member_kws if any(k in entry.keywords for k in kws))
        coverage = covered / sz
    elif entry.keywords:
        kw_counts = cluster_evidence.get("kw_counts", {})
        covered_counts = [kw_counts.get(k, 0) for k in entry.keywords if k in kw_counts]
        coverage = (max(covered_counts) / sz) if covered_counts else 0.0
    else:
        coverage = 1.0

    if coverage < entry.min_confidence:
        return False, coverage

    return True, coverage

def assegna_etichetta_cluster(
    cluster_evidence: dict[str, Any],
    tassonomia: list[TaxonomyEntry] = TASSONOMIA_36,
) -> tuple[str, str, float, TaxonomyEntry | None]:
    """Assegna il nome della tassonomia SOLO se un'entry univoca matcha con confidenza.
    Altrimenti restituisce «Perché hai visto <2-3 semi rappresentativi>».
    """
    candidates: list[tuple[TaxonomyEntry, float]] = []
    for entry in tassonomia:
        ok, conf = valuta_cluster(cluster_evidence, entry)
        if ok:
            candidates.append((entry, conf))

    repr_seeds = cluster_evidence.get("repr_seeds", [])
    def format_phv() -> str:
        if len(repr_seeds) == 1:
            return f"Perché hai visto {repr_seeds[0]}"
        elif len(repr_seeds) == 2:
            return f"Perché hai visto {repr_seeds[0]} e {repr_seeds[1]}"
        elif len(repr_seeds) >= 3:
            return f"Perché hai visto {repr_seeds[0]}, {repr_seeds[1]} e {repr_seeds[2]}"
        return "Perché hai visto i tuoi titoli recenti"

    if not candidates:
        return format_phv(), "perche_hai_visto", 0.0, None

    # Ordina candidati per (-confidenza, -priorità)
    candidates.sort(key=lambda x: (-x[1], -x[0].priorita))
    best_entry, best_conf = candidates[0]

    # Verifica di unicità: se c'è un pareggio perfetto di confidenza e priorità con un'altra voce
    if len(candidates) > 1:
        second_entry, second_conf = candidates[1]
        if best_conf == second_conf and best_entry.priorita == second_entry.priorita:
            return format_phv(), "perche_hai_visto_tie", best_conf, None

    return best_entry.nome, "tassonomia", best_conf, best_entry
