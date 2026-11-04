import sys, json
sys.path.insert(0, '.')
sys.path.insert(0, '.scratch')

from check_seed_lists import B, idx, chiavi, get_meta, ing, test_candidates

SEEDS = {}

# Seed 1: Fast X (2023)
SEEDS["movie:385687"] = [
    {"titolo": "Face/Off", "anno": 1997, "perche": "Operatic melodrama, unrestrained heroic excess and explosive stylized action."},
    {"titolo": "Con Air", "anno": 1997, "perche": "Unabashed macho swagger, bombastic destruction and earnest melodrama."},
    {"titolo": "Crank", "anno": 2006, "perche": "Manic adrenaline, relentless kinetic momentum and absurd cartoon physics."},
    {"titolo": "Speed", "anno": 1994, "perche": "Breathless high-stakes kinetic thrill with relentless, over-the-top momentum."},
    {"titolo": "Bad Boys II", "anno": 2003, "perche": "Maximalist, hyper-destructive spectacle with operatic machismo and excess."},
    {"titolo": "Commando", "anno": 1985, "perche": "Unapologetic macho grandiosity, absurd firepower and self-serious spectacle."},
    {"titolo": "Hard Boiled", "anno": 1992, "perche": "Operatic gun-ballet, extreme kinetic spectacle and earnest brotherhood."},
    {"titolo": "Supercop", "anno": 1992, "perche": "Insane stunt escalation, fearless kinetic bravura and breathless pacing."},
    {"titolo": "Drunken Master II", "anno": 1994, "perche": "Dazzling physical virtuosity, relentless momentum and comedic swagger."},
    {"titolo": "The Killer", "anno": 1989, "perche": "Operatic blood-soaked melodrama, heightened brotherhood and explosive gunplay."},
    {"titolo": "A Better Tomorrow", "anno": 1986, "perche": "Operatic heroic bloodshed, fierce brotherly loyalty and stylized violent poetry."},
    {"titolo": "Taxi", "anno": 1998, "perche": "Frenetic vehicular chases, breezy swagger and cheeky comic bravado."},
    {"titolo": "Banlieue 13", "anno": 2004, "perche": "High-adrenaline physical stunts, kinetic parkour and gritty kinetic rush."},
    {"titolo": "Wasabi", "anno": 2001, "perche": "Over-the-top action beats, culture-clash swagger and explosive comic energy."},
    {"titolo": "Redline", "anno": 2009, "perche": "Maximalist sensory overload, hyper-kinetic racing and pure adrenaline aesthetic."},
    {"titolo": "Versus", "anno": 2000, "perche": "Hyper-stylized zombie-action mashup with defiant swagger and relentless pace."},
    {"titolo": "Ong-Bak - Nato per combattere", "anno": 2003, "perche": "Jaw-dropping physical stunt-work, relentless kinetic energy and fighting bravura."},
    {"titolo": "A Bittersweet Life", "anno": 2005, "perche": "Heightened operatic crime melodrama, lavish style and ferocious kinetic vengeance."},
    {"titolo": "The Man from Nowhere", "anno": 2010, "perche": "Fierce protective fury, bone-crunching combat and relentless emotional drive."},
    {"titolo": "RRR", "anno": 2022, "perche": "Operatic melodrama, physics-defying heroics and unrestrained emotional spectacle."}
]

# Seed 2: The Last Duel (2021)
SEEDS["movie:617653"] = [
    {"titolo": "Rashomon", "anno": 1950, "perche": "Subjective truth, moral hypocrisy and fragmented perspectives of a brutal crime."},
    {"titolo": "Harakiri", "anno": 1962, "perche": "Lacerating indictment of institutional hypocrisy, bleak ritualism and moral fury."},
    {"titolo": "Ran", "anno": 1985, "perche": "Bleak apocalyptic despair, unforgiving historical scale and human folly."},
    {"titolo": "The Lion in Winter", "anno": 1968, "perche": "Savage psychological combat, poisonous egos and razor-sharp dynastic cruelty."},
    {"titolo": "A Man for All Seasons", "anno": 1966, "perche": "Uncompromising moral conviction confronting corrupt institutional power and doom."},
    {"titolo": "Witchfinder General", "anno": 1968, "perche": "Bleak, unsparing historical cruelty, corrupt authority and harrowing cynicism."},
    {"titolo": "La passione di Giovanna d'Arco", "anno": 1928, "perche": "Devastating spiritual anguish, intense close-ups and harrowing moral persecution."},
    {"titolo": "Michael Kohlhaas", "anno": 2013, "perche": "Rigorous, austere moral obsession and bleak historical tragedy."},
    {"titolo": "Anatomia di una caduta", "anno": 2023, "perche": "Forensic, unsparing dissection of truth, perspective and marital cruelty."},
    {"titolo": "L'armata delle ombre", "anno": 1969, "perche": "Chilling moral austerity, grim clinical tension and unsparing sacrifice."},
    {"titolo": "Il nastro bianco", "anno": 2009, "perche": "Chilling, austere psychological examination of buried institutional cruelty and decay."},
    {"titolo": "La fontana della vergine", "anno": 1960, "perche": "Brutal medieval violence, agonizing moral reckoning and spiritual devastation."},
    {"titolo": "Bastarden", "anno": 2023, "perche": "Austere, punishing historical struggle against brutal feudal entitlement and pride."},
    {"titolo": "Il settimo sigillo", "anno": 1957, "perche": "Bleak existential reckoning with mortality, religious dread and medieval despair."},
    {"titolo": "The Crucible", "anno": 1996, "perche": "Suffocating mass hysteria, moral cowardice and devastating institutional injustice."},
    {"titolo": "Doubt", "anno": 2008, "perche": "Tense, rigorous moral ambiguity and procedural confrontation over hidden truth."},
    {"titolo": "In Cold Blood", "anno": 1967, "perche": "Chilling clinical detachment, procedural grimness and senseless moral horror."},
    {"titolo": "The Assassination of Jesse James by the Coward Robert Ford", "anno": 2007, "perche": "Somber, elegiac deconstruction of myth, betrayal and psychological dread."},
    {"titolo": "Paths of Glory", "anno": 1957, "perche": "Unsparing moral fury against callous military institutional hypocrisy and sacrifice."},
    {"titolo": "Inherit the Wind", "anno": 1960, "perche": "Dogmatic intolerance clashing with intellectual integrity in a tense public trial."}
]

# Seed 3: Sweet Home (2020)
SEEDS["tv:96648"] = [
    {"titolo": "Train to Busan", "anno": 2016, "perche": "Relentless survival panic, tearful melodrama and visceral zombie onslaught."},
    {"titolo": "The Host", "anno": 2006, "perche": "Grotesque monster havoc, chaotic family desperation and satirical horror."},
    {"titolo": "#Alive", "anno": 2020, "perche": "Claustrophobic apartment siege, isolated dread and frantic survival adrenaline."},
    {"titolo": "Goksung", "anno": 2016, "perche": "Visceral demonic corruption, overwhelming dread and agonizing village madness."},
    {"titolo": "All of Us Are Dead", "anno": 2022, "perche": "Frenetic school siege, visceral carnage and emotional adolescent hysterics."},
    {"titolo": "Attack on Titan", "anno": 2013, "perche": "Apocalyptic dread, grotesque body-horror titans and operatic despair."},
    {"titolo": "Parasyte -the maxim-", "anno": 2014, "perche": "Grotesque biological mutations, existential dread and visceral body horror."},
    {"titolo": "Gantz: O", "anno": 2016, "perche": "Nightmarish monster designs, relentless hyper-violent siege and visceral dread."},
    {"titolo": "Tokyo Ghoul", "anno": 2014, "perche": "Tragic monster body-horror, visceral bloodlust and emotional torment."},
    {"titolo": "[REC]", "anno": 2007, "perche": "Terrifying apartment-building quarantine, claustrophobic panic and visceral sensory chaos."},
    {"titolo": "Il buco", "anno": 2019, "perche": "Grotesque visceral brutality, vertical claustrophobia and desperate survival hysteria."},
    {"titolo": "28 Days Later", "anno": 2002, "perche": "Raw, frantic apocalyptic panic, visceral infection and harrowing desperation."},
    {"titolo": "The Girl with All the Gifts", "anno": 2016, "perche": "Bleak fungal apocalypse, visceral tension and eerie biological horror."},
    {"titolo": "La nuée", "anno": 2020, "perche": "Grotesque parasitic locust obsession, bodily horror and escalating agricultural dread."},
    {"titolo": "The Mist", "anno": 2007, "perche": "Claustrophobic siege, grotesque extradimensional monsters and devastating bleak despair."},
    {"titolo": "The Thing", "anno": 1982, "perche": "Unsurpassed paranoia, grotesque biological transformations and freezing claustrophobic siege."},
    {"titolo": "The Fly", "anno": 1986, "perche": "Devastating bodily decay, grotesque biological horror and tragic emotional collapse."},
    {"titolo": "Slither", "anno": 2006, "perche": "Grotesque alien parasite invasion, slimy body-horror and manic energy."},
    {"titolo": "The Cabin in the Woods", "anno": 2011, "perche": "Manic monster chaos, visceral carnage and self-aware apocalyptic dread."},
    {"titolo": "Cloverfield", "anno": 2008, "perche": "Ground-level panic, chaotic monster destruction and breathless survival horror."}
]

# Seed 4: Jojo Rabbit (2019)
SEEDS["movie:515001"] = [
    {"titolo": "La vita è bella", "anno": 1997, "perche": "Childlike innocence shielding against atrocity, tragicomic warmth and heartbreaking sacrifice."},
    {"titolo": "Nuovo Cinema Paradiso", "anno": 1988, "perche": "Lyrical nostalgia, bittersweet sentimentality and heart-swelling emotional warmth."},
    {"titolo": "Mediterraneo", "anno": 1991, "perche": "Gentle anti-war escapism, sunny Aegean whimsy and affectionate camaraderie."},
    {"titolo": "Miracolo a Milano", "anno": 1951, "perche": "Poetic fairy-tale neorealism, whimsical optimism shielding against harsh post-war poverty."},
    {"titolo": "Amarcord", "anno": 1973, "perche": "Nostalgic seaside eccentricity, whimsical childhood memories masking creeping fascist absurdities."},
    {"titolo": "Il favoloso mondo di Amélie", "anno": 2001, "perche": "Whimsical visual inventiveness, eccentric optimism and tender melancholy."},
    {"titolo": "Tre uomini in fuga", "anno": 1966, "perche": "Lighthearted wartime farce, absurd escapades and warm comedic camaraderie."},
    {"titolo": "Il piccolo principe", "anno": 2015, "perche": "Poetic childlike wonder, whimsical innocence confronting grief and loss."},
    {"titolo": "Giù al Nord", "anno": 2008, "perche": "Warm-hearted provincial whimsy, benevolent cultural comedy and affectionate gentle charm."},
    {"titolo": "Mon oncle", "anno": 1958, "perche": "Whimsical visual slapstick, gentle satire of sterile modernity and childlike innocence."},
    {"titolo": "Paddington 2", "anno": 2017, "perche": "Pure whimsical humanist benevolence, gentle slapstick and radiant emotional warmth."},
    {"titolo": "Treni strettamente sorvegliati", "anno": 1966, "perche": "Tender adolescent awkwardness, deadpan absurdity and sudden tragic wartime poignancy."},
    {"titolo": "Good Bye, Lenin!", "anno": 2003, "perche": "Loving deception masking historic collapse, bittersweet whimsy and poignant family tenderness."},
    {"titolo": "La gabbia dorata", "anno": 2013, "perche": "Warm-hearted cultural comedy, lovable immigrant pride and affectionate communal solidarity."},
    {"titolo": "Moonrise Kingdom", "anno": 2012, "perche": "Deadpan storybook whimsy, precocious youthful love and pastel melancholic charm."},
    {"titolo": "The Grand Budapest Hotel", "anno": 2014, "perche": "Elegant nostalgic farce masking the tragic encroachment of brutal fascism."},
    {"titolo": "To Be or Not to Be", "anno": 1942, "perche": "Audacious satirical tightrope walk between theatrical farce and Nazi terror."},
    {"titolo": "The Great Dictator", "anno": 1940, "perche": "Sublime humanist satire, brilliant physical slapstick and impassioned moral plea."},
    {"titolo": "Beasts of the Southern Wild", "anno": 2012, "perche": "Child's mythic perspective, poetic resilience and fierce bittersweet wonder."},
    {"titolo": "Me and Earl and the Dying Girl", "anno": 2015, "perche": "Quirky cinephile whimsy balancing playful eccentricity with devastating emotional heartbreak."}
]

# Seed 5: Roma (2005)
SEEDS["tv:1891"] = [
    {"titolo": "I, Claudius", "anno": 1976, "perche": "Machiavellian palace intrigue, poisonous family treachery and biting cynical wit."},
    {"titolo": "Peaky Blinders", "anno": 2013, "perche": "Gritty swagger, ruthless dynastic ambition and stylized violent street power."},
    {"titolo": "The Shadow Line", "anno": 2011, "perche": "Murky moral compromises, cynical procedural tension and lethal underworld power games."},
    {"titolo": "Deadwood", "anno": 2004, "perche": "Profane poetic dialogue, brutal muddy frontier realpolitik and raw community building."},
    {"titolo": "Succession", "anno": 2018, "perche": "Ruthless corporate patricide, poisonous familial betrayals and biting profane cynicism."},
    {"titolo": "Spartacus", "anno": 2010, "perche": "Blood-soaked carnality, operatic gladiator violence and treacherous Roman intrigue."},
    {"titolo": "Boardwalk Empire", "anno": 2010, "perche": "Decadent Prohibition corruption, ruthless political bartering and bloody power struggles."},
    {"titolo": "The Godfather Part II", "anno": 1974, "perche": "Cold calculating accumulation of power, moral rot and dynastic tragedy."},
    {"titolo": "The Wire", "anno": 2002, "perche": "Unsparing institutional autopsy, pragmatic survival and ruthless systemic power dynamics."},
    {"titolo": "Gomorra - La serie", "anno": 2014, "perche": "Unsparing, bleakly authentic crime syndicate brutality and ruthless power grabs."},
    {"titolo": "Suburra", "anno": 2015, "perche": "Sordid collision of political corruption, mafia muscle and Vatican sleaze."},
    {"titolo": "Il Divo", "anno": 2008, "perche": "Stylized, cynical autopsy of power, corrupt political intrigue and deadpan irony."},
    {"titolo": "Romanzo Criminale", "anno": 2005, "perche": "Fierce 1970s street swagger, brutal gang loyalty and ruthless underworld rise."},
    {"titolo": "Indagine su un cittadino al di sopra di ogni sospetto", "anno": 1970, "perche": "Arrogant authoritarian cynicism, grotesque impunity and Kafkaesque abuse of power."},
    {"titolo": "Il conformista", "anno": 1970, "perche": "Decadent fascist cowardice, psychological rot and operatic moral degradation."},
    {"titolo": "La Reine Margot", "anno": 1994, "perche": "Blood-drenched Renaissance decadence, passionate carnality and lethal court intrigue."},
    {"titolo": "Un prophète", "anno": 2009, "perche": "Gritty prison underworld machinations, brutal pragmatic rise to power."},
    {"titolo": "Engrenages", "anno": 2005, "perche": "Cynical legal machinery, gritty Parisian corruption and morally compromised detectives."},
    {"titolo": "Babylon Berlin", "anno": 2017, "perche": "Weimar decadence, murky political conspiracies, gritty nightlife and creeping extremism."},
    {"titolo": "Das Boot", "anno": 1981, "perche": "Claustrophobic militaristic sweat, cynical disillusionment and harrowing procedural pressure."}
]

for s_key in ["movie:385687", "movie:617653", "tv:96648", "movie:515001", "tv:1891"]:
    errs, matched, countries, decs, non_en = test_candidates(s_key, SEEDS[s_key])
    print(f"=== {s_key} ===")
    if errs:
        for e in errs:
            print("  ERROR:", e)
    else:
        print("  CLEAN! 0 errors.")
    print(f"  Decades ({len(decs)}): {sorted(decs)} | Non-EN: {non_en}")
    print(f"  Top countries: {dict(countries.most_common(4))}")
