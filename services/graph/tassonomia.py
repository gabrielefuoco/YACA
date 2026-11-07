"""tassonomia.py — Vocabolario controllato a 36 voci e motore di matching semantico.

PERCHÉ ESISTE.
Le euristiche legacy generavano nomi fragili basati su percentuali numeriche («87% Dramma»),
token inglesi non tradotti («Period Drama», «Action & Adventure») o pattern autorali forzati («Regia di X»).
Questo modulo realizza la denominazione semantica deterministica degli scaffali YACA:
- un vocabolario controllato di 36 voci tematiche curate in italiano (6 macro-aree tematiche);
- regole dichiarative per voce con filtri su medium, flag anime, flag adulto, lingua dominante e keyword;
- soglia di confidenza minima dichiarata (min_confidence >= 0.50);
- fallback trasparente e onesto «Perché hai visto <2-3 titoli>» quando nessun'entry supera la soglia
  o in caso di pareggio perfetto (nessuna forzatura di etichetta non attendibile).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class TaxonomyEntry:
    """Definizione dichiarativa di una voce della tassonomia controllata YACA."""
    nome: str
    tema: str
    priorita: int
    derived_from_data: bool
    data_note: str
    keywords: frozenset[str] = field(default_factory=frozenset)
    medium: str | None = None
    anime: bool | None = None
    adulto: bool | None = None
    languages: frozenset[str] | None = None
    countries: frozenset[str] | None = None
    collections: frozenset[str] | None = None
    min_confidence: float = 0.50
    excluded_keywords: frozenset[str] = field(default_factory=frozenset)
    excluded_languages: frozenset[str] | None = None


# ==============================================================================
# VOCABOLARIO CONTROLLATO: 36 VOCI TEMATICHE IN ITALIANO
# ==============================================================================

TASSONOMIA_36: tuple[TaxonomyEntry, ...] = (
    # --- Animazione & Anime (6 voci) ---
    TaxonomyEntry(
        nome="Anime shōnen",
        tema="Animazione & Anime",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: warnok S1, moppierhead S2, castoffcrown S1",
        keywords=frozenset({"shounen", "super power", "seinen", "ninja", "martial arts"}),
        anime=True,
    ),
    TaxonomyEntry(
        nome="Anime romantici & slice of life",
        tema="Animazione & Anime",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: castoffcrown S2 (Gachiakuta, Polar Opposites)",
        keywords=frozenset({"slice of life", "romance", "school life", "shoujo"}),
        anime=True,
    ),
    TaxonomyEntry(
        nome="Animazione d'autore",
        tema="Animazione & Anime",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: film d'autore Studio Ghibli, Satoshi Kon e lungometraggi animati d'autore",
        keywords=frozenset({"studio ghibli", "philosophical", "author animation", "surrealism", "stop motion", "independent animation", "adult animation"}),
        anime=None,
        medium="movie",
    ),
    TaxonomyEntry(
        nome="Sitcom animate",
        tema="Animazione & Anime",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: hammers-lists S2, sappss S3, moppierhead S1, 1jacobjohn S3",
        keywords=frozenset({"dysfunctional family", "adult humor", "family conflict", "sitcom", "parody"}),
        anime=False,
        medium="series",
    ),
    TaxonomyEntry(
        nome="Animazione per famiglie",
        tema="Animazione & Anime",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: sappss S1 (Elio, Jumpers, La gang del bosco)",
        keywords=frozenset({"3d animation", "anthropomorphism", "pixar", "dreamworks", "villain"}),
        anime=False,
        medium="movie",
    ),
    TaxonomyEntry(
        nome="Animazione per adulti",
        tema="Animazione & Anime",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: warnok S4, castoffcrown e flixinatoor99 (Invincible, Blue Eye Samurai, BoJack, Bob's Burgers)",
        keywords=frozenset({"adult animation", "dark fantasy", "satire", "absurdist humor", "cartoon"}),
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
        keywords=frozenset({"space opera", "space travel", "galaxy", "spacecraft", "star wars"}),
    ),
    TaxonomyEntry(
        nome="Fantascienza d'invasione",
        tema="Fantascienza & Fantasy",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: sangam456 S2 e cluster alieni di warnok",
        keywords=frozenset({"alien invasion", "alien", "alien monster", "extraterrestrial"}),
    ),
    TaxonomyEntry(
        nome="Fantascienza post-apocalittica",
        tema="Fantascienza & Fantasy",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: warnok S2 e franchise Fallout",
        keywords=frozenset({"post-apocalyptic future", "dystopia", "wasteland", "survival"}),
    ),
    TaxonomyEntry(
        nome="Cyberpunk & Futuro distopico",
        tema="Fantascienza & Fantasy",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S2 (Outside the Wire, Upgrade)",
        keywords=frozenset({"cyberpunk", "transhumanism", "artificial intelligence (a.i.)", "cyborg", "near future"}),
    ),
    TaxonomyEntry(
        nome="Magia & Stregoneria",
        tema="Fantascienza & Fantasy",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: moppierhead S3/S4 e flixinatoor99 S6 (Harry Potter, Wicked)",
        keywords=frozenset({"wizard", "witch", "magic", "spell", "sorcery"}),
    ),
    TaxonomyEntry(
        nome="Cinecomic & Supereroi",
        tema="Fantascienza & Fantasy",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S5 e flixinatoor99 S7 (Superman, Avatar)",
        keywords=frozenset({"superhero", "super power", "based on comic", "marvel cinematic universe (mcu)"}),
    ),
    TaxonomyEntry(
        nome="Viaggi nel tempo & Multiverso",
        tema="Fantascienza & Fantasy",
        priorita=80,
        derived_from_data=False,
        data_note="Pattern tematico classico di catalogo fantascientifico",
        keywords=frozenset({"time travel", "multiverse", "alternate timeline", "alternate reality"}),
    ),

    # --- Thriller, Giallo & Crime (6 voci) ---
    TaxonomyEntry(
        nome="Giallo investigativo",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: pepsipex S1, pepsipex S2 e sangam456 S1",
        keywords=frozenset({"murder mystery", "whodunit", "detective", "investigation", "homicide detective"}),
    ),
    TaxonomyEntry(
        nome="Docufiction true crime",
        tema="Crime, Thriller & Mistero",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: sappss S5 e 1jacobjohn S4 / S6",
        keywords=frozenset({"true crime", "crime documentary", "serial killer", "dramatization"}),
    ),
    TaxonomyEntry(
        nome="Spy thriller",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: pepsipex S4 (Slow Horses, Lioness, The Agency)",
        keywords=frozenset({"spy", "spy thriller", "espionage", "secret agent", "british spy", "central intelligence agency (cia)"}),
    ),
    TaxonomyEntry(
        nome="Thriller psicologico",
        tema="Crime, Thriller & Mistero",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: sappss S2 e pepsipex S2",
        keywords=frozenset({"psychological thriller", "mental illness", "paranoia", "obsession", "hallucination"}),
    ),
    TaxonomyEntry(
        nome="Gangster & Criminalità",
        tema="Crime, Thriller & Mistero",
        priorita=75,
        derived_from_data=False,
        data_note="Pattern classico crime / mafia del catalogo",
        keywords=frozenset({"organized crime", "mafia", "drug cartel", "gangster", "heist"}),
    ),
    TaxonomyEntry(
        nome="Horror soprannaturale",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: carverclan S1 (I peccatori, Stranger Things) e pepsipex S5",
        keywords=frozenset({"supernatural horror", "demon", "possession", "ghost", "haunted house", "supernatural"}),
    ),

    # --- Comedy & Sitcom (4 voci) ---
    TaxonomyEntry(
        nome="Sitcom",
        tema="Comedy & Sitcom",
        priorita=75,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S1 (The King of Queens, My Name Is Earl)",
        keywords=frozenset({"sitcom", "workplace comedy"}),
        anime=False,
        medium="series",
    ),
    TaxonomyEntry(
        nome="Commedia satirica",
        tema="Comedy & Sitcom",
        priorita=75,
        derived_from_data=True,
        data_note="Derivato dai dati: flixinatoor99 S3 (Spider-Noir, Parks & Rec, White Lotus)",
        keywords=frozenset({"satire", "social satire", "political satire", "parody"}),
    ),
    TaxonomyEntry(
        nome="Dark comedy",
        tema="Comedy & Sitcom",
        priorita=70,
        derived_from_data=True,
        data_note="Derivato dai dati: sappss S7 (Brassic, This Country)",
        keywords=frozenset({"dark comedy", "black comedy", "crude comedy"}),
    ),
    TaxonomyEntry(
        nome="Commedia romantica",
        tema="Comedy & Sitcom",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: commedie romantiche classiche e moderne (es. Vacanze romane, One Day, Maxton Hall)",
        keywords=frozenset({"romantic comedy", "romcom", "friends to lovers", "love triangle", "first love", "screwball comedy"}),
        anime=False,
        medium=None,
    ),

    # --- Drama, Epoca & Internazionale (6 voci) ---
    TaxonomyEntry(
        nome="Dramma d'epoca",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: pepsipex S3 (La valle dell'Eden, The Forsytes)",
        keywords=frozenset({"period drama", "costume drama", "historical fiction", "19th century", "victorian era"}),
    ),
    TaxonomyEntry(
        nome="Medical drama",
        tema="Drama & Internazionale",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: hammers-lists S1 (The Good Doctor, Chicago Med, 9-1-1)",
        keywords=frozenset({"medical drama", "hospital", "doctor", "nurse", "surgery"}),
        medium="series",
    ),
    TaxonomyEntry(
        nome="Thriller coreano",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: titoli thriller/crime K-drama in castoffcrown e warnok",
        keywords=frozenset({"revenge", "investigation", "murder", "thriller", "serial killer"}),
        languages=frozenset({"ko"}),
    ),
    TaxonomyEntry(
        nome="Dramma coreano",
        tema="Drama & Internazionale",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: castoffcrown S4 (Hospital Playlist, Four Hands Two Sonatas)",
        keywords=frozenset({"romance", "friendship", "melodrama", "family", "bromance"}),
        languages=frozenset({"ko"}),
    ),
    TaxonomyEntry(
        nome="Commedia romantica asiatica",
        tema="Drama & Internazionale",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: romance asiatiche televisive e cinematografiche",
        keywords=frozenset({"romance", "romantic comedy", "first love", "youth"}),
        languages=frozenset({"ko", "ja", "zh"}),
    ),
    TaxonomyEntry(
        nome="Cinema d'autore contemporaneo",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: castoffcrown arthouse contemporaneo (Kore-eda, PTA, Wenders, Jarmusch, Hamaguchi, Reichardt, Baker, Bong Joon-ho)",
        keywords=frozenset({
            "arthouse", "independent film", "criterion collection", "slow cinema",
            "mumblecore", "magic realism", "social commentary", "character study",
            "existentialism", "slice of life", "semi autobiographical", "surrealism",
            "woman director", "philosophical", "neo-noir", "poetry", "fictional biography",
            "meditative", "absurdist", "dark comedy",
        }),
        medium="movie",
        anime=False,
        excluded_keywords=frozenset({
            "superhero", "marvel cinematic universe (mcu)", "giant monster", "kaiju",
            "space opera", "freedom fighter", "action hero", "shark", "dinosaur", "holiday",
        }),
        excluded_languages=frozenset({"te", "ta", "kn", "ml"}),
    ),
    TaxonomyEntry(
        nome="Classici d'autore",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: castoffcrown classici d'autore (Kurosawa, Ozu, Antonioni, Godard, Melville, Kassovitz, Scorsese, Lang, Malle, Tarkovsky, Hitchcock)",
        keywords=frozenset({
            "film noir", "neo realism", "italian neo realism", "french new wave",
            "nouvelle vague", "german expressionism", "expressionism", "new german cinema",
            "new hollywood", "pre-code", "poetic realism", "criterion collection",
            "world war ii", "french resistance", "holocaust (shoah)", "fascism",
            "road movie", "psychological drama", "existentialism",
        }),
        medium="movie",
        anime=False,
        excluded_keywords=frozenset({
            "romantic comedy", "romcom", "screwball comedy", "forbidden love", "superhero", "freedom fighter",
            "action hero", "giant monster", "kaiju", "space opera", "holiday", "christmas",
        }),
    ),

    # --- Documentari, Sport & Spettacolo (7 voci) ---
    TaxonomyEntry(
        nome="Wrestling",
        tema="Sport & Documentari",
        priorita=95,
        derived_from_data=True,
        data_note="Derivato dai dati: moppierhead S5 (SmackDown, Raw, Sumo)",
        keywords=frozenset({"wrestling", "sports entertainment", "wwe", "professional wrestling", "sumo", "prowrestling"}),
    ),
    TaxonomyEntry(
        nome="Documentari naturalistici",
        tema="Sport & Documentari",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: sappss S4 e 1jacobjohn S15 (Big Beasts, Pianeta preistorico)",
        keywords=frozenset({"nature documentary", "nature", "wildlife", "ocean", "animals", "farm"}),
    ),
    TaxonomyEntry(
        nome="Documentari sportivi",
        tema="Sport & Documentari",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: Formula 1, MotoGP, basket, calcio e grandi atleti",
        keywords=frozenset({
            "sports documentary", "athlete", "racing", "formula 1", "car race", "football (soccer)",
            "soccer", "tennis", "olympic games", "basketball", "motorcycle race", "extreme sport",
            "championship", "world cup", "boxing",
        }),
    ),
    TaxonomyEntry(
        nome="Cucina & Food",
        tema="Sport & Documentari",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: serie e documentari gastronomici, chef e food",
        keywords=frozenset({"cooking", "culinary", "food", "chef", "restaurant", "baking", "gastronomy", "foodie", "cuisine"}),
    ),
    TaxonomyEntry(
        nome="Motori & Corse automobilistiche",
        tema="Sport & Documentari",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S14 (Car Masters, The Grand Tour)",
        keywords=frozenset({"automobile", "car race", "classic cars", "car restoration"}),
    ),
    TaxonomyEntry(
        nome="Teatro filmato & Musical",
        tema="Sport & Documentari",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: carverclan S2 (Peter Pan Goes Wrong, Great Performances)",
        keywords=frozenset({"filmed theater", "based on play or musical", "stage musical"}),
    ),
    TaxonomyEntry(
        nome="Fede & Spiritualità",
        tema="Sport & Documentari",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: 1jacobjohn S8 (The Chosen, Il re dei re)",
        keywords=frozenset({"christian faith", "christian film", "religion", "spirituality"}),
    ),

    # --- Estensioni tematiche basate sul censimento dei cluster ---
    TaxonomyEntry(
        nome="Cinema indiano",
        tema="Drama & Internazionale",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: produzioni Bollywood, Tollywood e Kollywood (RRR, Jawan, KGF, Dangal, Pathaan)",
        languages=frozenset({"hi", "te", "ta", "kn", "ml"}),
    ),
    TaxonomyEntry(
        nome="Western contemporaneo & Frontiera",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: universo Yellowstone / Taylor Sheridan e neo-western (1883, 1923, Mayor of Kingstown)",
        keywords=frozenset({"neo-western", "western", "montana", "ranch", "cowboy", "frontier"}),
    ),
    TaxonomyEntry(
        nome="Blockbuster d'azione",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: franchise action e thriller (John Wick, Sisu, The Accountant, Bullet Train, The Gray Man)",
        keywords=frozenset({"assassin", "hitman", "revenge", "secret agent", "hand to hand combat", "action hero"}),
        medium="movie",
    ),
    TaxonomyEntry(
        nome="Action comedy & Avventura",
        tema="Comedy & Sitcom",
        priorita=80,
        derived_from_data=True,
        data_note="Derivato dai dati: blockbuster d'azione comica streaming (Red Notice, The Adam Project, The Man from Toronto, Uncharted)",
        keywords=frozenset({"action comedy", "buddy comedy", "caper", "heist", "treasure hunt"}),
        medium="movie",
    ),
    TaxonomyEntry(
        nome="Monster movie & Creature feature",
        tema="Fantascienza & Fantasy",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: creature marine, kaiju e dinosauri (Shark, Meg, Jurassic Park, Godzilla e Kong, Crawl)",
        keywords=frozenset({"shark", "giant monster", "creature feature", "dinosaur", "kaiju", "monster attack", "monster"}),
        medium="movie",
    ),
    TaxonomyEntry(
        nome="Film di Natale",
        tema="Comedy & Sitcom",
        priorita=90,
        derived_from_data=True,
        data_note="Derivato dai dati: commedie e pellicole natalizie (Nutcrackers, Family Switch, Qualcuno salvi il Natale, Il Grinch)",
        keywords=frozenset({"christmas", "santa claus", "holiday", "christmas party"}),
        medium="movie",
    ),
    TaxonomyEntry(
        nome="Cinema samurai & Jidaigeki",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: drammi storici feudali giapponesi (Shōgun, Sanjuro, La sfida del samurai, Rurouni Kenshin)",
        keywords=frozenset({"samurai", "jidaigeki", "bakumatsu", "feudal japan", "swordplay", "katana", "ronin"}),
    ),
    TaxonomyEntry(
        nome="Poliziesco britannico",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: serie poliziesche e procedurali UK (Vera, Unforgotten, Happy Valley, McDonald & Dodds)",
        keywords=frozenset({"police detective", "police procedural", "murder investigation", "british crime", "scotland yard"}),
        medium="series",
    ),
    TaxonomyEntry(
        nome="Dramma & Romance LGBTQ+",
        tema="Drama & Internazionale",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: serie e film a tematica queer (Young Royals, Uno di noi sta mentendo, Heartstopper, Fellow Travelers)",
        keywords=frozenset({"lgbt", "gay theme", "boys' love (bl)", "queer", "lesbian theme"}),
    ),
    TaxonomyEntry(
        nome="Giallo classico & Cozy crime",
        tema="Crime, Thriller & Mistero",
        priorita=85,
        derived_from_data=True,
        data_note="Derivato dai dati: adattamenti Agatha Christie e gialli deduttivi leggeri (Ludwig, Professor T, Towards Zero)",
        keywords=frozenset({"cosy crime", "whodunit", "agatha christie", "amateur detective"}),
    ),
)


# ==============================================================================
# VALUTAZIONE E ASSEGNAZIONE ETICHETTA
# ==============================================================================

def valuta_cluster(
    cluster_evidence: dict[str, Any],
    entry: TaxonomyEntry,
) -> tuple[bool, float]:
    """Verifica deterministica se il cluster soddisfa i requisiti della voce tassonomica."""
    sz = int(cluster_evidence.get("size", 0))
    if sz <= 0:
        return False, 0.0

    # 1. Filtro medium
    if entry.medium and cluster_evidence.get("medium") != entry.medium:
        return False, 0.0

    # 2. Filtro Anime
    anime_pct = float(cluster_evidence.get("anime_pct", 0.0))
    if entry.anime is True and anime_pct < 0.5:
        return False, 0.0
    if entry.anime is False and anime_pct >= 0.5:
        return False, 0.0

    # 3. Filtro Adulto
    adult_pct = float(cluster_evidence.get("adult_pct", 0.0))
    if entry.adulto is True and adult_pct < 0.5:
        return False, 0.0
    if entry.adulto is False and adult_pct >= 0.5:
        return False, 0.0

    # 4. Filtro Lingua dominante
    if entry.languages:
        langs: dict[str, int] = cluster_evidence.get("languages", {})
        tot_langs = sum(langs.values())
        if tot_langs == 0:
            return False, 0.0
        match_l = sum(cnt for l, cnt in langs.items() if l in entry.languages)
        if (match_l / tot_langs) < 0.5:
            return False, 0.0

    # 4b. Filtro Lingue escluse
    if entry.excluded_languages:
        langs_ex: dict[str, int] = cluster_evidence.get("languages", {})
        tot_langs_ex = sum(langs_ex.values())
        if tot_langs_ex > 0:
            match_ex = sum(cnt for l, cnt in langs_ex.items() if l in entry.excluded_languages)
            if (match_ex / tot_langs_ex) > 0.15:
                return False, 0.0

    # 4c. Filtro Keyword escluse
    if entry.excluded_keywords:
        member_kws_ex: list[set[str]] = cluster_evidence.get("member_kws", [])
        if member_kws_ex:
            match_ex_k = sum(1 for kws in member_kws_ex if any(k in entry.excluded_keywords for k in kws))
            if (match_ex_k / float(sz)) > 0.15:
                return False, 0.0
        else:
            kw_counts_ex: dict[str, int] = cluster_evidence.get("kw_counts", {})
            match_ex_k = sum(kw_counts_ex.get(k, 0) for k in entry.excluded_keywords)
            if (match_ex_k / float(sz)) > 0.15:
                return False, 0.0

    # 5. Copertura keyword sui membri del cluster
    member_kws: list[set[str]] = cluster_evidence.get("member_kws", [])
    if member_kws and entry.keywords:
        covered = sum(1 for kws in member_kws if any(k in entry.keywords for k in kws))
        coverage = float(covered) / float(sz)
    elif entry.keywords:
        kw_counts: dict[str, int] = cluster_evidence.get("kw_counts", {})
        covered_counts = [kw_counts.get(k, 0) for k in entry.keywords if k in kw_counts]
        coverage = (max(covered_counts) / float(sz)) if covered_counts else 0.0
    else:
        coverage = 1.0

    if coverage < entry.min_confidence:
        return False, coverage

    return True, coverage


def assegna_etichetta_cluster(
    cluster_evidence: dict[str, Any],
    tassonomia: Iterable[TaxonomyEntry] | None = None,
) -> tuple[str, str, float, TaxonomyEntry | None]:
    """Assegna l'etichetta al cluster: tassonomia se match univoco con confidenza, altrimenti fallback trasparente.

    Returns:
        (nome_etichetta, nome_fonte, confidenza, matched_entry_or_None)
        dove nome_fonte è 'tassonomia' oppure 'perche_hai_visto'.
    """
    if tassonomia is None:
        tassonomia = TASSONOMIA_36

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

    # Verifica di unicità: se c'è un pareggio perfetto di confidenza e priorità tra due voci concorrenti
    if len(candidates) > 1:
        second_entry, second_conf = candidates[1]
        if best_conf == second_conf and best_entry.priorita == second_entry.priorita:
            return format_phv(), "perche_hai_visto", best_conf, None

    return best_entry.nome, "tassonomia", best_conf, best_entry
