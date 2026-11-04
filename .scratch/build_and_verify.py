import json
import re
import pandas as pd

# Load TMDB databases
m_df = pd.read_parquet('.cache/tmdb/movies.parquet', columns=[
    'id', 'title', 'original_title', 'release_date', 'production_countries', 
    'original_language', 'genres', 'directors', 'collection_name'
])
t_df = pd.read_parquet('.cache/tmdb/tv.parquet', columns=[
    'id', 'name', 'original_name', 'first_air_date', 'production_countries', 
    'original_language', 'genres', 'created_by'
])

DATA = [
  # 1. movie:385687 - Fast X (2023)
  {
    "seed": "movie:385687",
    "suggerimenti": [
      {"titolo": "Face/Off", "anno": 1997, "perche": "Operatic melodrama, unrestrained heroic excess and explosive stylized action."},
      {"titolo": "Con Air", "anno": 1997, "perche": "Unabashed macho swagger, bombastic destruction and earnest melodrama."},
      {"titolo": "Crank", "anno": 2006, "perche": "Manic adrenaline, relentless kinetic momentum and absurd cartoon physics."},
      {"titolo": "Speed", "anno": 1994, "perche": "Breathless high-stakes kinetic thrill with relentless, over-the-top momentum."},
      {"titolo": "Bad Boys II", "anno": 2003, "perche": "Maximalist, hyper-destructive spectacle with operatic machismo and excess."},
      {"titolo": "Commando", "anno": 1985, "perche": "Unapologetic macho grandiosity, absurd firepower and self-serious spectacle."},
      {"titolo": "RRR", "anno": 2022, "perche": "Operatic melodrama, physics-defying heroics and unrestrained emotional spectacle."},
      {"titolo": "Baahubali: The Beginning", "anno": 2015, "perche": "Mythic grandiosity, over-the-top kinetic heroics and unabashed melodrama."},
      {"titolo": "Dhoom 2", "anno": 2006, "perche": "Glossy vehicular heists, exaggerated swagger and hyperbolic spectacle."},
      {"titolo": "Hard Boiled", "anno": 1992, "perche": "Operatic gun-ballet, extreme kinetic spectacle and earnest brotherhood."},
      {"titolo": "The Legend of Drunken Master", "anno": 1994, "perche": "Dazzling physical virtuosity, relentless momentum and comedic swagger."},
      {"titolo": "Police Story 3: Supercop", "anno": 1992, "perche": "Insane stunt escalation, fearless kinetic bravura and breathless pacing."},
      {"titolo": "Taxi", "anno": 1998, "perche": "Frenetic vehicular chases, breezy swagger and cheeky comic bravado."},
      {"titolo": "Banlieue 13", "anno": 2004, "perche": "High-adrenaline physical stunts, kinetic parkour and gritty kinetic rush."},
      {"titolo": "Wasabi", "anno": 2001, "perche": "Over-the-top action beats, culture-clash swagger and explosive comic energy."},
      {"titolo": "Redline", "anno": 2009, "perche": "Maximalist sensory overload, hyper-kinetic racing and pure adrenaline aesthetic."},
      {"titolo": "Versus", "anno": 2000, "perche": "Hyper-stylized zombie-action mashup with defiant swagger and relentless pace."},
      {"titolo": "Mad Max: Fury Road", "anno": 2015, "perche": "Relentless kinetic velocity, operatic vehicular warfare and visual excess."},
      {"titolo": "The Raid 2", "anno": 2014, "perche": "Operatic martial arts violence, relentless kinetic drive and expansive soap-opera."},
      {"titolo": "Ong-Bak", "anno": 2003, "perche": "Jaw-dropping physical stunt-work, relentless kinetic energy and fighting bravura."}
    ]
  },
  # 2. movie:617653 - The Last Duel (2021)
  {
    "seed": "movie:617653",
    "suggerimenti": [
      {"titolo": "Rashomon", "anno": 1950, "perche": "Subjective truth, moral hypocrisy and fragmented perspectives of a brutal crime."},
      {"titolo": "Harakiri", "anno": 1962, "perche": "Lacerating indictment of institutional hypocrisy, bleak ritualism and moral fury."},
      {"titolo": "Ran", "anno": 1985, "perche": "Bleak apocalyptic despair, unforgiving historical scale and human folly."},
      {"titolo": "The Lion in Winter", "anno": 1968, "perche": "Savage psychological combat, poisonous egos and razor-sharp dynastic cruelty."},
      {"titolo": "A Man for All Seasons", "anno": 1966, "perche": "Uncompromising moral conviction confronting corrupt institutional power and doom."},
      {"titolo": "The Zone of Interest", "anno": 2023, "perche": "Chilling, detached clinical dissection of evil and bureaucratic moral rot."},
      {"titolo": "Witchfinder General", "anno": 1968, "perche": "Bleak, unsparing historical cruelty, corrupt authority and harrowing cynicism."},
      {"titolo": "La Passion de Jeanne d'Arc", "anno": 1928, "perche": "Devastating spiritual anguish, intense close-ups and harrowing moral persecution."},
      {"titolo": "Michael Kohlhaas", "anno": 2013, "perche": "Rigorous, austere moral obsession and bleak historical tragedy."},
      {"titolo": "Anatomy of a Fall", "anno": 2023, "perche": "Forensic, unsparing dissection of truth, perspective and marital cruelty."},
      {"titolo": "L'Armée des ombres", "anno": 1969, "perche": "Chilling moral austerity, grim clinical tension and unsparing sacrifice."},
      {"titolo": "Das weiße Band", "anno": 2009, "perche": "Chilling, austere psychological examination of buried institutional cruelty and decay."},
      {"titolo": "Jungfrukällan", "anno": 1960, "perche": "Brutal medieval violence, agonizing moral reckoning and spiritual devastation."},
      {"titolo": "Bastarden", "anno": 2023, "perche": "Austere, punishing historical struggle against brutal feudal entitlement and pride."},
      {"titolo": "The Crucible", "anno": 1996, "perche": "Suffocating mass hysteria, moral cowardice and devastating institutional injustice."},
      {"titolo": "Doubt", "anno": 2008, "perche": "Tense, rigorous moral ambiguity and procedural confrontation over hidden truth."},
      {"titolo": "Silence", "anno": 2016, "perche": "Austere, agonizing spiritual torment and uncompromising historical gravitas."},
      {"titolo": "In Cold Blood", "anno": 1967, "perche": "Chilling clinical detachment, procedural grimness and senseless moral horror."},
      {"titolo": "The Assassination of Jesse James by the Coward Robert Ford", "anno": 2007, "perche": "Somber, elegiac deconstruction of myth, betrayal and psychological dread."},
      {"titolo": "Paths of Glory", "anno": 1957, "perche": "Unsparing moral fury against callous military institutional hypocrisy and sacrifice."}
    ]
  },
  # 3. tv:96648 - Sweet Home (2020)
  {
    "seed": "tv:96648",
    "suggerimenti": [
      {"titolo": "Train to Busan", "anno": 2016, "perche": "Relentless survival panic, tearful melodrama and visceral zombie onslaught."},
      {"titolo": "The Host", "anno": 2006, "perche": "Grotesque monster havoc, chaotic family desperation and satirical horror."},
      {"titolo": "All of Us Are Dead", "anno": 2022, "perche": "Frenetic school siege, visceral carnage and emotional adolescent hysterics."},
      {"titolo": "Kingdom", "anno": 2019, "perche": "High-stakes survival dread, visceral undead terror and breathless momentum."},
      {"titolo": "#Alive", "anno": 2020, "perche": "Claustrophobic apartment siege, isolated dread and frantic survival adrenaline."},
      {"titolo": "Attack on Titan", "anno": 2013, "perche": "Apocalyptic dread, grotesque body-horror titans and operatic despair."},
      {"titolo": "Parasyte: The Maxim", "anno": 2014, "perche": "Grotesque biological mutations, existential dread and visceral body horror."},
      {"titolo": "Gantz: O", "anno": 2016, "perche": "Nightmarish monster designs, relentless hyper-violent siege and visceral dread."},
      {"titolo": "Tokyo Ghoul", "anno": 2014, "perche": "Tragic monster body-horror, visceral bloodlust and emotional torment."},
      {"titolo": "[REC]", "anno": 2007, "perche": "Terrifying apartment-building quarantine, claustrophobic panic and visceral sensory chaos."},
      {"titolo": "The Platform", "anno": 2019, "perche": "Grotesque visceral brutality, vertical claustrophobia and desperate survival hysteria."},
      {"titolo": "28 Days Later", "anno": 2002, "perche": "Raw, frantic apocalyptic panic, visceral infection and harrowing desperation."},
      {"titolo": "The Girl with All the Gifts", "anno": 2016, "perche": "Bleak fungal apocalypse, visceral tension and eerie biological horror."},
      {"titolo": "Possessor", "anno": 2020, "perche": "Shocking body-horror mutations, visceral violence and psychological dread."},
      {"titolo": "Raw", "anno": 2016, "perche": "Visceral bodily transformation, grotesque carnality and unsettling emotional dread."},
      {"titolo": "The Mist", "anno": 2007, "perche": "Claustrophobic siege, grotesque extradimensional monsters and devastating bleak despair."},
      {"titolo": "The Thing", "anno": 1982, "perche": "Unsurpassed paranoia, grotesque biological transformations and freezing claustrophobic siege."},
      {"titolo": "The Fly", "anno": 1986, "perche": "Devastating bodily decay, grotesque biological horror and tragic emotional collapse."},
      {"titolo": "Slither", "anno": 2006, "perche": "Grotesque alien parasite invasion, slimy body-horror and manic energy."},
      {"titolo": "The Cabin in the Woods", "anno": 2011, "perche": "Manic monster chaos, visceral carnage and self-aware apocalyptic dread."}
    ]
  },
  # 4. movie:515001 - Jojo Rabbit (2019)
  {
    "seed": "movie:515001",
    "suggerimenti": [
      {"titolo": "La vita è bella", "anno": 1997, "perche": "Childlike innocence shielding against atrocity, tragicomic warmth and heartbreaking sacrifice."},
      {"titolo": "Nuovo Cinema Paradiso", "anno": 1988, "perche": "Lyrical nostalgia, bittersweet sentimentality and heart-swelling emotional warmth."},
      {"titolo": "Mediterraneo", "anno": 1991, "perche": "Gentle anti-war escapism, sunny Aegean whimsy and affectionate camaraderie."},
      {"titolo": "Le Fabuleux Destin d'Amélie Poulain", "anno": 2001, "perche": "Whimsical visual inventiveness, eccentric optimism and tender melancholy."},
      {"titolo": "La Grande Vadrouille", "anno": 1966, "perche": "Lighthearted wartime farce, absurd escapades and warm comedic camaraderie."},
      {"titolo": "The Little Prince", "anno": 2015, "perche": "Poetic childlike wonder, whimsical innocence confronting grief and loss."},
      {"titolo": "Bienvenue chez les Ch'tis", "anno": 2008, "perche": "Warm-hearted provincial whimsy, benevolent cultural comedy and affectionate gentle charm."},
      {"titolo": "The Death of Stalin", "anno": 2017, "perche": "Razor-sharp political absurdity, farcical incompetence masking lethal totalitarian terror."},
      {"titolo": "Hope and Glory", "anno": 1987, "perche": "WWII Blitz seen through childlike delight, whimsical wonder and bittersweet resilience."},
      {"titolo": "Paddington 2", "anno": 2017, "perche": "Pure whimsical humanist benevolence, gentle slapstick and radiant emotional warmth."},
      {"titolo": "Billy Elliot", "anno": 2000, "perche": "Uplifting youthful exuberance, gritty social backdrop and poignant emotional triumph."},
      {"titolo": "Closely Watched Trains", "anno": 1966, "perche": "Tender adolescent awkwardness, deadpan absurdity and sudden tragic wartime poignancy."},
      {"titolo": "Good Bye, Lenin!", "anno": 2003, "perche": "Loving deception masking historic collapse, bittersweet whimsy and poignant family tenderness."},
      {"titolo": "El laberinto del fauno", "anno": 2006, "perche": "Dark fairy-tale innocence clashing with ruthless wartime cruelty and profound tragedy."},
      {"titolo": "Moonrise Kingdom", "anno": 2012, "perche": "Deadpan storybook whimsy, precocious youthful love and pastel melancholic charm."},
      {"titolo": "The Grand Budapest Hotel", "anno": 2014, "perche": "Elegant nostalgic farce masking the tragic encroachment of brutal fascism."},
      {"titolo": "To Be or Not to Be", "anno": 1942, "perche": "Audacious satirical tightrope walk between theatrical farce and Nazi terror."},
      {"titolo": "The Great Dictator", "anno": 1940, "perche": "Sublime humanist satire, brilliant physical slapstick and impassioned moral plea."},
      {"titolo": "Beasts of the Southern Wild", "anno": 2012, "perche": "Child's mythic perspective, poetic resilience and fierce bittersweet wonder."},
      {"titolo": "Me and Earl and the Dying Girl", "anno": 2015, "perche": "Quirky cinephile whimsy balancing playful eccentricity with devastating emotional heartbreak."}
    ]
  },
  # 5. tv:1891 - Roma (2005)
  {
    "seed": "tv:1891",
    "suggerimenti": [
      {"titolo": "I, Claudius", "anno": 1976, "perche": "Machiavellian palace intrigue, poisonous family treachery and biting cynical wit."},
      {"titolo": "Peaky Blinders", "anno": 2013, "perche": "Gritty swagger, ruthless dynastic ambition and stylized violent street power."},
      {"titolo": "Wolf Hall", "anno": 2015, "perche": "Cold calculating statecraft, quiet Machiavellian menace and perilous political tightropes."},
      {"titolo": "Taboo", "anno": 2017, "perche": "Grimy 19th-century brutality, dark visceral swagger and cynical colonial corruption."},
      {"titolo": "Deadwood", "anno": 2004, "perche": "Profane poetic dialogue, brutal muddy frontier realpolitik and raw community building."},
      {"titolo": "Succession", "anno": 2018, "perche": "Ruthless corporate patricide, poisonous familial betrayals and biting profane cynicism."},
      {"titolo": "Spartacus", "anno": 2010, "perche": "Blood-soaked carnality, operatic gladiator violence and treacherous Roman intrigue."},
      {"titolo": "Boardwalk Empire", "anno": 2010, "perche": "Decadent Prohibition corruption, ruthless political bartering and bloody power struggles."},
      {"titolo": "The Godfather Part II", "anno": 1974, "perche": "Cold calculating accumulation of power, moral rot and dynastic tragedy."},
      {"titolo": "House of Cards", "anno": 2013, "perche": "Cynical Machiavellian ambition, fourth-wall breaking malice and ruthless backstabbing."},
      {"titolo": "Gomorra", "anno": 2014, "perche": "Unsparing, bleakly authentic crime syndicate brutality and ruthless power grabs."},
      {"titolo": "Suburra", "anno": 2015, "perche": "Sordid collision of political corruption, mafia muscle and Vatican sleaze."},
      {"titolo": "Il Divo", "anno": 2008, "perche": "Stylized, cynical autopsy of power, corrupt political intrigue and deadpan irony."},
      {"titolo": "Romanzo Criminale", "anno": 2005, "perche": "Fierce 1970s street swagger, brutal gang loyalty and ruthless underworld rise."},
      {"titolo": "Caligola", "anno": 1979, "perche": "Unrestrained imperial decadence, debauched carnality and mad intoxicating despotism."},
      {"titolo": "La Reine Margot", "anno": 1994, "perche": "Blood-drenched Renaissance decadence, passionate carnality and lethal court intrigue."},
      {"titolo": "Un prophète", "anno": 2009, "perche": "Gritty prison underworld machinations, brutal pragmatic rise to power."},
      {"titolo": "Versailles", "anno": 2015, "perche": "Lavish decadent court manipulation, sensual betrayals and paranoid absolute power."},
      {"titolo": "Babylon Berlin", "anno": 2017, "perche": "Weimar decadence, murky political conspiracies, gritty nightlife and creeping extremism."},
      {"titolo": "The Borgias", "anno": 2011, "perche": "Decadent papal corruption, ruthless familial ruthlessness and sensual power games."}
    ]
  },
  # 6. movie:57214 - Project X - Una festa che spacca (2012)
  {
    "seed": "movie:57214",
    "suggerimenti": [
      {"titolo": "Spring Breakers", "anno": 2012, "perche": "Neon-drenched hedonism, hypnotic criminal excess and feverish pop nihilism."},
      {"titolo": "Superbad", "anno": 2007, "perche": "Manic adolescent desperation, raunchy drunken chaos and heartfelt vulgarity."},
      {"titolo": "Can't Hardly Wait", "anno": 1998, "perche": "Sprawling graduation party chaos, chaotic teenage hormones and frenetic revelry."},
      {"titolo": "Animal House", "anno": 1978, "perche": "Uninhibited anarchic frat-house rebellion, raucous vulgarity and joyful destruction."},
      {"titolo": "Dazed and Confused", "anno": 1993, "perche": "Intoxicating youth rebellion, hazy beer-soaked swagger and nostalgic freedom."},
      {"titolo": "Booksmart", "anno": 2019, "perche": "Escalating party madness, breathless comedic momentum and manic youth abandon."},
      {"titolo": "Skins", "anno": 2007, "perche": "Unfiltered teenage hedonism, chaotic party benders and emotional turbulence."},
      {"titolo": "Human Traffic", "anno": 1999, "perche": "Euphoric clubland hedonism, frenetic drug-fueled banter and weekend escapism."},
      {"titolo": "The Inbetweeners Movie", "anno": 2011, "perche": "Crass adolescent debauchery, cringeworthy misadventures and chaotic holiday drunkenness."},
      {"titolo": "Trainspotting", "anno": 1996, "perche": "Manic kinetic rush, dark rebellious energy and unfiltered chemical hedonism."},
      {"titolo": "24 Hour Party People", "anno": 2002, "perche": "Anarchic musical chaos, legendary nightclub excess and madcap swagger."},
      {"titolo": "Babysitting", "anno": 2014, "perche": "Found-footage party devastation, escalating slapstick disasters and anarchic mayhem."},
      {"titolo": "Climax", "anno": 2018, "perche": "Hallucinatory sensory overload, hypnotic dance euphoria descending into manic hysteria."},
      {"titolo": "Victoria", "anno": 2015, "perche": "Breathless one-take nocturnal adrenaline, frantic club buzz escalating into criminal chaos."},
      {"titolo": "Reprise", "anno": 2006, "perche": "Kinetic youthful ambition, punk rock energy and manic emotional velocity."},
      {"titolo": "Wake in Fright", "anno": 1971, "perche": "Sweaty, relentless beer-soaked descent into primal uninhibited madness."},
      {"titolo": "Goon", "anno": 2011, "perche": "Blood-spattered rowdy bravado, vulgar locker-room camaraderie and manic violent glee."},
      {"titolo": "The Young Offenders", "anno": 2016, "perche": "Anarchic adolescent delinquency, chaotic comic energy and madcap schemes."},
      {"titolo": "Wild Zero", "anno": 1999, "perche": "Deafening garage-punk rock-and-roll madness, fiery explosive chaos and pure fun."},
      {"titolo": "Kneecap", "anno": 2024, "perche": "Raucous counter-cultural swagger, drug-fueled rebel energy and propulsive hip-hop velocity."}
    ]
  },
  # 7. tv:81146 - Rosario Tijeras (2010)
  {
    "seed": "tv:81146",
    "suggerimenti": [
      {"titolo": "Amores perros", "anno": 2000, "perche": "Visceral urban collision, tragic fatalistic passion and raw gritty heartbreak."},
      {"titolo": "Sin senos no hay paraíso", "anno": 2008, "perche": "Raw melodramatic desperation, tragic narco-aspiration and devastating heartbreak."},
      {"titolo": "La Reina del Sur", "anno": 2011, "perche": "Operatic crime melodrama, passionate survival stakes and fierce female tenacity."},
      {"titolo": "Y tu mamá también", "anno": 2001, "perche": "Passionate bittersweet journey, erotic tension shadowed by tragic mortality."},
      {"titolo": "Heli", "anno": 2013, "perche": "Brutal, unsparing cartel violence crushing fragile innocent family devotion."},
      {"titolo": "Central do Brasil", "anno": 1998, "perche": "Raw emotional journey through desperate margins toward poignant redemption."},
      {"titolo": "Pixote: A Lei do Mais Fraco", "anno": 1980, "perche": "Unflinching street-kid tragedy, harrowing urban squalor and raw vulnerability."},
      {"titolo": "Jamón Jamón", "anno": 1992, "perche": "Sizzling erotic melodrama, raw macho passion and tragicomic fatalism."},
      {"titolo": "Volver", "anno": 2006, "perche": "Passionate maternal solidarity, melodrama and emotional resilience amid dark secrets."},
      {"titolo": "Celda 211", "anno": 2009, "perche": "High-octane prison desperation, tragic moral decay and fatalistic violence."},
      {"titolo": "Mery per sempre", "anno": 1989, "perche": "Raw juvenile delinquency, emotional desperation and bruised tenderness in Palermo."},
      {"titolo": "La terra dell'abbastanza", "anno": 2018, "perche": "Tragic descent into underworld violence, suffocating guilt and crushed innocence."},
      {"titolo": "37°2 le matin", "anno": 1986, "perche": "Feverish destructive passion, manic erotic devotion and heartbreaking emotional descent."},
      {"titolo": "La Haine", "anno": 1995, "perche": "Tense, explosive urban alienation, boiling street rage and fatalistic dread."},
      {"titolo": "Sicario", "anno": 2015, "perche": "Bleak, suffocating moral abyss, brutal cartel terror and hypnotic despair."},
      {"titolo": "Traffic", "anno": 2000, "perche": "Sprawling, feverish portrait of addiction, moral compromise and tragic helplessness."},
      {"titolo": "True Romance", "anno": 1993, "perche": "Pulp romantic delirium, feverish bloody violence and breathless lovers-on-the-run fervor."},
      {"titolo": "Drive", "anno": 2011, "perche": "Hyper-stylized neon romanticism, sudden explosive violence and melancholic devotion."},
      {"titolo": "Carlito's Way", "anno": 1993, "perche": "Fatalistic romantic tragedy, desperate struggle for redemption and tragic doom."},
      {"titolo": "Scarface", "anno": 1983, "perche": "Operatic, blood-drenched underworld ascent fueled by cocaine madness and paranoia."}
    ]
  },
  # 8. movie:447365 - Guardiani della Galassia Vol. 3 (2023)
  {
    "seed": "movie:447365",
    "suggerimenti": [
      {"titolo": "Cowboy Bebop: Tengoku no Tobira", "anno": 2001, "perche": "Melancholic misfit camaraderie, vibrant jazzy cool and bittersweet existential farewells."},
      {"titolo": "Space Battleship Yamato", "anno": 2010, "perche": "Operatic space sacrifice, emotional heroics and epic sentimental grandeur."},
      {"titolo": "One Piece Film: Red", "anno": 2022, "perche": "High-energy musical emotion, eccentric found-family loyalty and bittersweet operatic spectacles."},
      {"titolo": "Trigun: Badlands Rumble", "anno": 2010, "perche": "Goofy, lovable gunslinger warmth, slapstick action hiding deep humanist compassion."},
      {"titolo": "Le Cinquième Élément", "anno": 1997, "perche": "Colorful eccentric sci-fi exuberance, quirky warmth and over-the-top heart."},
      {"titolo": "La Cité des enfants perdus", "anno": 1995, "perche": "Grotesque steampunk fairy-tale, eccentric orphans and tender melancholic warmth."},
      {"titolo": "The Hitchhiker's Guide to the Galaxy", "anno": 2005, "perche": "Whimsical cosmic absurdity, lovable eccentric eccentrics and philosophical charm."},
      {"titolo": "Attack the Block", "anno": 2011, "perche": "Gritty alien creature-feature with fierce misfit camaraderie and heroic heart."},
      {"titolo": "Time Bandits", "anno": 1981, "perche": "Surreal cosmic fantasy, eccentric misfit band and dark playful whimsy."},
      {"titolo": "Farscape: The Peacekeeper Wars", "anno": 2004, "perche": "Lovable alien oddballs, passionate romance and chaotic space-opera heroics."},
      {"titolo": "Babe: Pig in the City", "anno": 1998, "perche": "Bizarre, visually sumptuous fable with eccentric animals and heartbreaking vulnerability."},
      {"titolo": "Song of the Sea", "anno": 2014, "perche": "Lyrical mythic adventure, poignant family grief and profound gentle tenderness."},
      {"titolo": "A Monster Calls", "anno": 2016, "perche": "Tear-jerking fantasy catharsis, grotesque creature wisdom and raw grief."},
      {"titolo": "Turbo Kid", "anno": 2015, "perche": "Retro-synthwave post-apocalyptic charm, gory comic-book violence and sweet romance."},
      {"titolo": "Serenity", "anno": 2005, "perche": "Ragtag outlaw crew, snappy banter, deep familial devotion and heartbreak."},
      {"titolo": "Star Trek Beyond", "anno": 2016, "perche": "Warm character camaraderie, infectious energetic fun and triumphant pop-fueled heart."},
      {"titolo": "Super 8", "anno": 2011, "perche": "Heartfelt nostalgic adventure, monstrous creature empathy and tearful coming-of-age grief."},
      {"titolo": "The Iron Giant", "anno": 1999, "perche": "Beautiful innocent friendship, misunderstood gentle monster and devastating emotional sacrifice."},
      {"titolo": "E.T. the Extra-Terrestrial", "anno": 1982, "perche": "Pure emotional wonder, vulnerable alien innocence and tear-jerking bittersweet parting."},
      {"titolo": "Lilo & Stitch", "anno": 2002, "perche": "Chaotic alien destructiveness grounded in dysfunctional, fierce found-family love."}
    ]
  },
  # 9. movie:5503 - Il fuggitivo (1993)
  {
    "seed": "movie:5503",
    "suggerimenti": [
      {"titolo": "High and Low", "anno": 1963, "perche": "Razor-sharp police procedural, intense moral dilemma and kinetic pursuit."},
      {"titolo": "Z", "anno": 1969, "perche": "Urgent investigative momentum, relentless procedural rigor and gripping moral indignation."},
      {"titolo": "Tell No One", "anno": 2006, "perche": "Breathless man-on-the-run mystery, desperate emotional drive and intricate suspense."},
      {"titolo": "Point Blank", "anno": 2010, "perche": "Relentless non-stop chase, desperate husband running against corrupt police."},
      {"titolo": "Le Cercle Rouge", "anno": 1970, "perche": "Meticulous procedural coolness, laconic professionalism and fatalistic cat-and-mouse tension."},
      {"titolo": "A Hard Day", "anno": 2014, "perche": "Nail-biting procedural desperation, escalating tight corners and relentless panic."},
      {"titolo": "The Chaser", "anno": 2008, "perche": "Frantic foot-chase urgency, grounded gritty desperation and ticking-clock dread."},
      {"titolo": "Memories of Murder", "anno": 2003, "perche": "Obsessive procedural desperation, gritty rural investigation and haunting unresolved tension."},
      {"titolo": "Lola rennt", "anno": 1998, "perche": "Relentless propulsive kinetic momentum, ticking clock and desperate survival sprint."},
      {"titolo": "La isla mínima", "anno": 2014, "perche": "Gripping, methodical murder investigation, atmospheric tension and simmering dread."},
      {"titolo": "Eye in the Sky", "anno": 2007, "perche": "Methodical police surveillance procedural, razor-sharp cat-and-mouse tension."},
      {"titolo": "The Day of the Jackal", "anno": 1973, "perche": "Methodical, clinical cat-and-mouse hunt between brilliant assassin and tireless investigator."},
      {"titolo": "Eye of the Needle", "anno": 1981, "perche": "Taut wartime suspense, relentless cat-and-mouse pursuit and grim professionalism."},
      {"titolo": "The Ghost Writer", "anno": 2010, "perche": "Crisp, chilly political paranoia, understated tension and claustrophobic dread."},
      {"titolo": "Three Days of the Condor", "anno": 1975, "perche": "Lean paranoid survival, lone analyst hunted by shadowy intelligence operatives."},
      {"titolo": "The French Connection", "anno": 1971, "perche": "Gritty street-level realism, relentless pursuit and obsessive detective drive."},
      {"titolo": "In the Line of Fire", "anno": 1993, "perche": "Taut psychological cat-and-mouse duel, weary integrity and ticking-clock suspense."},
      {"titolo": "Collateral", "anno": 2004, "perche": "Sleek nocturnal momentum, crisp professional precision and high-tension standoff."},
      {"titolo": "Witness", "anno": 1985, "perche": "Grounded moral integrity, tense protective thriller and understated suspense."},
      {"titolo": "No Way Out", "anno": 1987, "perche": "Ticking clock, framed naval officer frantically investigating to save himself."}
    ]
  },
  # 10. movie:598 - City of God (2002)
  {
    "seed": "movie:598",
    "suggerimenti": [
      {"titolo": "Tropa de Elite", "anno": 2007, "perche": "Relentless pulse-pounding intensity, ferocious urban warfare and bleak moral decay."},
      {"titolo": "Tropa de Elite 2", "anno": 2010, "perche": "Visceral political indictment, breathless pacing and tragic corruption."},
      {"titolo": "Bacurau", "anno": 2019, "perche": "Fierce anti-colonial defiance, genre-bending swagger and explosive blood-drenched fury."},
      {"titolo": "Carandiru", "anno": 2003, "perche": "Vibrant kaleidoscopic prison tapestry, vibrant human warmth and sudden tragic massacre."},
      {"titolo": "Güeros", "anno": 2014, "perche": "Energetic youthful rebellion, kinetic visual rhythm and urban drifting."},
      {"titolo": "El Infierno", "anno": 2010, "perche": "Pitch-black satirical savagery, manic bloodshed and grotesque narco-carnival energy."},
      {"titolo": "Les Misérables", "anno": 2019, "perche": "Boiling banlieue tension, relentless kinetic urgency and explosive social powderkeg."},
      {"titolo": "Athena", "anno": 2022, "perche": "Operatic visual virtuosity, breathless continuous tracking shots and tragic civil war."},
      {"titolo": "Snatch", "anno": 2000, "perche": "Dizzying editing rhythms, colorful underworld eccentrics and kinetic comic swagger."},
      {"titolo": "Lock, Stock and Two Smoking Barrels", "anno": 1998, "perche": "Relentless intertwining chaos, punchy street banter and fast-paced criminal luck."},
      {"titolo": "Top Boy", "anno": 2011, "perche": "Gritty estate realism, urgent street pressure and tragic youthful vulnerability."},
      {"titolo": "Sonatine", "anno": 1993, "perche": "Playful beachside absurdity juxtaposed with sudden, deadpan explosive violence."},
      {"titolo": "Dead or Alive", "anno": 1999, "perche": "Insane kinetic montage, frantic underworld mayhem and apocalyptic bravura."},
      {"titolo": "Made in Hong Kong", "anno": 1997, "perche": "Raw youthful nihilism, hyperactive visual grit and tragic urban angst."},
      {"titolo": "Tsotsi", "anno": 2005, "perche": "Raw township desperation, propulsive kwaito beat and agonizing moral awakening."},
      {"titolo": "Pájaros de verano", "anno": 2018, "perche": "Mythic indigenous tragedy, hypnotic visual grandeur and deadly greed."},
      {"titolo": "Goodfellas", "anno": 1990, "perche": "Propulsive voiceover rhythm, seductive underworld glamor and breathless kinetic momentum."},
      {"titolo": "Do the Right Thing", "anno": 1989, "perche": "Vibrant sweltering neighborhood energy, colorful street banter and simmering racial tragedy."},
      {"titolo": "Boyz n the Hood", "anno": 1991, "perche": "Heartfelt neighborhood vitality, authentic street peril and devastating emotional tragedy."},
      {"titolo": "Menace II Society", "anno": 1993, "perche": "Unflinching, fatalistic urban nihilism, raw immediacy and inescapable cycle of violence."}
    ]
  },
  # 11. movie:718789 - Lightyear - La vera storia di Buzz (2022)
  {
    "seed": "movie:718789",
    "suggerimenti": [
      {"titolo": "Avril et le monde truqué", "anno": 2015, "perche": "Sincere retro-steampunk adventure, spirited heroism and whimsical invention."},
      {"titolo": "La Planète sauvage", "anno": 1973, "perche": "Surreal alien world exploration, philosophical sci-fi and eerie atmospheric wonder."},
      {"titolo": "Interstella 5555: The 5tory of the 5ecret 5tar 5ystem", "anno": 2003, "perche": "Melodic retro space-opera, romantic interstellar heroism and vibrant pulp visual joy."},
      {"titolo": "Space Adventure Cobra", "anno": 1982, "perche": "Swashbuckling space heroism, pulp sci-fi swagger and dazzling retro-futurism."},
      {"titolo": "Voices of a Distant Star", "anno": 2002, "perche": "Heartbreaking time-dilation sorrow, interstellar separation and melancholic space duty."},
      {"titolo": "Royal Space Force: The Wings of Honneamise", "anno": 1987, "perche": "Earnest spaceflight idealism, painstaking mechanical craft and philosophical wonder."},
      {"titolo": "Kaze no Tani no Naushika", "anno": 1984, "perche": "Noble environmental heroism, soaring aviation wonder and earnest messianic compassion."},
      {"titolo": "Moon", "anno": 2009, "perche": "Isolated lunar duty, haunting identity melancholy and grounded retro-sci-fi aesthetic."},
      {"titolo": "Flash Gordon", "anno": 1980, "perche": "Unapologetic retro-pulp space bravado, camp heroic spectacle and pure vibrant fun."},
      {"titolo": "First Men in the Moon", "anno": 1964, "perche": "Charming vintage space exploration, Victorian inventiveness and spirited sense of adventure."},
      {"titolo": "Solaris", "anno": 1972, "perche": "Haunting space isolation, melancholic grief and philosophical mystery of deep memory."},
      {"titolo": "The Secret of Kells", "anno": 2009, "perche": "Luminous hand-crafted beauty, earnest heroic quest and mythic innocence."},
      {"titolo": "Ikarie XB 1", "anno": 1963, "perche": "Sincere, thoughtful deep-space voyage, philosophical optimism and retro-futuristic wonder."},
      {"titolo": "The Dish", "anno": 2000, "perche": "Warm, gentle space-race optimism, eccentric small-town pride and understated heart."},
      {"titolo": "The Right Stuff", "anno": 1983, "perche": "Inspiring square-jawed aerospace heroism, earnest pioneer spirit and majestic aerial thrills."},
      {"titolo": "Interstellar", "anno": 2014, "perche": "Grand cosmic ambition, agonizing time-dilation heartbreak and fierce parental devotion."},
      {"titolo": "The Rocketeer", "anno": 1991, "perche": "Radiant retro pulp adventure, unvarnished heroic optimism and high-flying thrills."},
      {"titolo": "The Black Hole", "anno": 1979, "perche": "Moody retro space exploration, cosmic dread and vintage spaceship mystery."},
      {"titolo": "Treasure Planet", "anno": 2002, "perche": "Swashbuckling retro-futuristic adventure, earnest youthful longing and surrogate fatherhood."},
      {"titolo": "Titan A.E.", "anno": 2000, "perche": "Fast-paced pulpy space survival, high-stakes galactic quest and rock-infused adventure."}
    ]
  },
  # 12. movie:7270 - Il genio della truffa (2003)
  {
    "seed": "movie:7270",
    "suggerimenti": [
      {"titolo": "Nueve reinas", "anno": 2000, "perche": "Clever street-level con games, cynical charm and intricate layers of deceit."},
      {"titolo": "De battre mon cœur s'est arrêté", "anno": 2005, "perche": "Neurotic intensity, tender musical longing conflicting with sleazy real-estate ruthlessness."},
      {"titolo": "Sur mes lèvres", "anno": 2001, "perche": "Lonely outsider vulnerability, subtle mutual manipulation and unexpected criminal intimacy."},
      {"titolo": "Bob le flambeur", "anno": 1956, "perche": "Melancholic veteran hustler charm, elegant laconic fatalism and cool gambling romance."},
      {"titolo": "Kisaragi", "anno": 2007, "perche": "Claustrophobic room full of quirky neurotics, peeling back deception and grief."},
      {"titolo": "A Scene at the Sea", "anno": 1991, "perche": "Gentle, quiet eccentricity, tender unspoken devotion and melancholic warmth."},
      {"titolo": "The Ladykillers", "anno": 1955, "perche": "Delightful eccentric criminality, polite facade masking wicked deception and dark comedy."},
      {"titolo": "A Fish Called Wanda", "anno": 1988, "perche": "Neurotic British repression colliding with manic American greed and hilarious duplicity."},
      {"titolo": "Sexy Beast", "anno": 2000, "perche": "Sweltering retirement bliss shattered by terrifying psychotic pressure and nervous anxiety."},
      {"titolo": "Dirty Pretty Things", "anno": 2002, "perche": "Tender bond between desperate immigrants amid shadowy London underworld exploitation."},
      {"titolo": "Castaway on the Moon", "anno": 2009, "perche": "Touching neurotic isolation, quirky agoraphobia and sweet offbeat connection."},
      {"titolo": "I soliti ignoti", "anno": 1958, "perche": "Lovable bumbling thieves, bittersweet poverty and poignant comedic failure."},
      {"titolo": "Il bidone", "anno": 1955, "perche": "Melancholic con artists, moral exhaustion and painful yearning for human dignity."},
      {"titolo": "Dolor y gloria", "anno": 2019, "perche": "Tender vulnerability, chronic physical ailments, neurotic memory and melancholic artistic grace."},
      {"titolo": "Paper Moon", "anno": 1973, "perche": "Bittersweet con-artist duo, cynical hustling softened by tender pseudo-parental love."},
      {"titolo": "As Good as It Gets", "anno": 1997, "perche": "Severe OCD neurosis, abrasive cynicism softened by halting emotional vulnerability."},
      {"titolo": "Punch-Drunk Love", "anno": 2002, "perche": "Anxious sensory overload, repressed rage and delicate surreal romantic tenderness."},
      {"titolo": "The Sting", "anno": 1973, "perche": "Elegant vintage con artistry, snappy charm and graceful camaraderie."},
      {"titolo": "Catch Me If You Can", "anno": 2002, "perche": "Breezy fraudulent escapism masking profound loneliness and desperate longing for family."},
      {"titolo": "The Royal Tenenbaums", "anno": 2001, "perche": "Melancholic family grifters, eccentric neuroses and bittersweet bids for redemption."}
    ]
  },
  # 13. tv:115004 - Omicidio a Easttown (2021)
  {
    "seed": "tv:115004",
    "suggerimenti": [
      {"titolo": "Broadchurch", "anno": 2013, "perche": "Suffocating small-town communal grief, weary dogged detectives and heartbreaking emotional fallout."},
      {"titolo": "Happy Valley", "anno": 2014, "perche": "Unflinching working-class grit, resilient middle-aged policewoman bearing agonizing familial grief."},
      {"titolo": "Unforgotten", "anno": 2015, "perche": "Compassionate historical murder excavation, deep empathy for fragile families and quiet dignity."},
      {"titolo": "The Offence", "anno": 1973, "perche": "Bleak psychological exhaustion, brutal interrogation room despair and shattering moral collapse."},
      {"titolo": "Prime Suspect", "anno": 1991, "perche": "Uncompromising police grit, weary determination fighting institutional decay and harrowing crimes."},
      {"titolo": "Le Bureau des Légendes", "anno": 2015, "perche": "Understated professional tradecraft, quiet personal sacrifice and moral weariness."},
      {"titolo": "Jusqu'à la garde", "anno": 2017, "perche": "Chilling domestic realism, suffocating dread and raw unvarnished tension."},
      {"titolo": "La Trêve", "anno": 2016, "perche": "Gloomy forest gloom, traumatized detective and bleak provincial secrets."},
      {"titolo": "Forbrydelsen", "anno": 2007, "perche": "Relentless rainy gloom, obsessive weary detective and agonizing portrait of grieving parents."},
      {"titolo": "Jagten", "anno": 2012, "perche": "Suffocating small-town hysteria, devastating wrongful accusation and agonizing communal isolation."},
      {"titolo": "Ófærð", "anno": 2015, "perche": "Snowbound small-town isolation, weary burly police chief and claustrophobic local corruption."},
      {"titolo": "Bron/Broen", "anno": 2011, "perche": "Bleak Scandinavian procedural rigor, eccentric prickly partnership and grim social underbelly."},
      {"titolo": "Top of the Lake", "anno": 2013, "perche": "Haunting rural community trauma, bruised female resilience and eerie atmospheric dread."},
      {"titolo": "Mystery Road", "anno": 2018, "perche": "Arid Outback desolation, taciturn detective weariness and entrenched communal tensions."},
      {"titolo": "Blood", "anno": 2018, "perche": "Murky family suspicion, heavy provincial grief and suffocating small-town psychological claustrophobia."},
      {"titolo": "Sharp Objects", "anno": 2018, "perche": "Sweaty Southern Gothic trauma, suffocating family toxicity and self-destructive psychic pain."},
      {"titolo": "True Detective", "anno": 2014, "perche": "Cosmic dread intersecting with weary Louisiana decay, philosophical despair and dogged brotherhood."},
      {"titolo": "Wind River", "anno": 2017, "perche": "Bitter freezing grief, quiet stoic hunter and devastating reservation tragedy."},
      {"titolo": "Manchester by the Sea", "anno": 2016, "perche": "Unbearable suffocating grief, blue-collar Boston authenticity and painfully honest lack of closure."},
      {"titolo": "Mystic River", "anno": 2003, "perche": "Heavy working-class tragedy, childhood trauma poisoning adult friendships and fatalistic grief."}
    ]
  },
  # 14. movie:537996 - La ballata di Buster Scruggs (2018)
  {
    "seed": "movie:537996",
    "suggerimenti": [
      {"titolo": "Relatos salvajes", "anno": 2014, "perche": "Savagely hilarious anthology of escalating vindictive fury and pitch-black comedic karma."},
      {"titolo": "Il buono, il brutto, il cattivo", "anno": 1966, "perche": "Cynical mercenary irony, operatic frontier dust and macabre gallows humor."},
      {"titolo": "I mostri", "anno": 1963, "perche": "Biting satirical anthology, grotesque human venality and cynical comedic sketches."},
      {"titolo": "Il grande silenzio", "anno": 1968, "perche": "Freezing nihilistic snowscape, mute gunslinger and devastating, unapologetic bleakness."},
      {"titolo": "Delicatessen", "anno": 1991, "perche": "Macabre post-apocalyptic absurdity, eccentric dark slapstick and whimsical grotesque fable."},
      {"titolo": "The Banshees of Inisherin", "anno": 2022, "perche": "Bleak, heartbreaking absurdist stubbornness, existential island loneliness and severed fingers."},
      {"titolo": "In Bruges", "anno": 2008, "perche": "Profane existential guilt, macabre fairy-tale melancholy and razor-sharp gallows humor."},
      {"titolo": "Seven Psychopaths", "anno": 2012, "perche": "Meta-pulp absurdity, bizarre eccentric killers and bloody deadpan philosophy."},
      {"titolo": "The Guard", "anno": 2011, "perche": "Subversively cynical, deadpan rural cop with hidden sharp intellect and macabre wit."},
      {"titolo": "The Good, the Bad, the Weird", "anno": 2008, "perche": "Manic cartoonish slapstick, dusty desert chaos and breathless kinetic mayhem."},
      {"titolo": "En duva satt på en gren och funderade på tillvaron", "anno": 2014, "perche": "Deadpan surreal absurdity, pale philosophical vignettes and tragicomic melancholy."},
      {"titolo": "Lemonade Joe", "anno": 1964, "perche": "Parodic Western musical satire, absurd gunslinging and campy capitalist spoof."},
      {"titolo": "Yojimbo", "anno": 1961, "perche": "Cynical masterless ronin manipulating greedy rival gangs with wry, detached amusement."},
      {"titolo": "Slow West", "anno": 2015, "perche": "Surreal frontier folklore, poetic deadpan eccentricity and sudden brutal violence."},
      {"titolo": "Dead Man", "anno": 1995, "perche": "Hallucinatory existential frontier journey, laconic black humor and poetic death march."},
      {"titolo": "Blazing Saddles", "anno": 1974, "perche": "Anarchic fourth-wall shattering parody, fearless satire and wild frontier absurdity."},
      {"titolo": "McCabe & Mrs. Miller", "anno": 1971, "perche": "Muddy, unromanticized frontier desolation, melancholic fatalism and anti-heroic doom."},
      {"titolo": "Barton Fink", "anno": 1991, "perche": "Claustrophobic surreal dread, creative paralysis and fiery apocalyptic grotesque absurdity."},
      {"titolo": "The Sisters Brothers", "anno": 2018, "perche": "Melancholic sibling outlaw bond, philosophical musings and eccentric frontier violence."},
      {"titolo": "Bad Times at the El Royale", "anno": 2018, "perche": "Tense nonlinear anthology pulp, eclectic morally ambiguous strangers and bloody twists."}
    ]
  },
  # 15. movie:3176 - Battle Royale (2000)
  {
    "seed": "movie:3176",
    "suggerimenti": [
      {"titolo": "All About Lily Chou-Chou", "anno": 2001, "perche": "Ethereal, devastating teenage cruelty, suffocating alienation and poetic schoolyard despair."},
      {"titolo": "Confessions", "anno": 2010, "perche": "Chilling, operatic vengeance, stylish visual cruelty and adolescent moral rot."},
      {"titolo": "Lesson of the Evil", "anno": 2012, "perche": "Shocking high-school massacre, darkly satirical sociopathy and manic pop excess."},
      {"titolo": "As the Gods Will", "anno": 2014, "perche": "Absurd sadistic death games, manic visual grotesque and sudden explosive carnage."},
      {"titolo": "Suicide Club", "anno": 2001, "perche": "Shocking generational nihilism, macabre mass hysteria and surreal pop-culture dread."},
      {"titolo": "Tetsuo: The Iron Man", "anno": 1989, "perche": "Frantic cyberpunk frenzy, hyper-kinetic body-horror and breathless industrial madness."},
      {"titolo": "Squid Game", "anno": 2021, "perche": "Desperate playground death games, biting social cruelty and devastating moral collapse."},
      {"titolo": "The Villainess", "anno": 2017, "perche": "Frantic first-person kinetic violence, relentless hyper-stylized revenge and emotional turmoil."},
      {"titolo": "I Saw the Devil", "anno": 2010, "perche": "Unrelenting ferocious savagery, agonizing vengeance and complete moral degradation."},
      {"titolo": "The Raid: Redemption", "anno": 2011, "perche": "Claustrophobic building siege, relentless bone-crunching choreography and pure adrenaline survival."},
      {"titolo": "Riki-Oh: The Story of Ricky", "anno": 1991, "perche": "Splatterpunk cartoon ultraviolence, over-the-top gore and rebellious prison fury."},
      {"titolo": "Dobermann", "anno": 1997, "perche": "Manic cartoonish brutality, hyper-kinetic MTV editing and rebellious criminal swagger."},
      {"titolo": "Calvaire", "anno": 2004, "perche": "Deranged psychological cruelty, rural isolation and harrowing surreal madness."},
      {"titolo": "A Clockwork Orange", "anno": 1971, "perche": "Stylish operatic ultraviolence, chilling satirical sociopathy and dystopian generational rebellion."},
      {"titolo": "Scum", "anno": 1979, "perche": "Brutal juvenile detention savagery, unsparing institutional cruelty and raw street violence."},
      {"titolo": "Eden Lake", "anno": 2008, "perche": "Terrifying, relentless feral adolescent sadism, hopeless panic and suffocating dread."},
      {"titolo": "Lord of the Flies", "anno": 1963, "perche": "Chilling civilized breakdown into primitive tribal cruelty, superstition and hunting frenzy."},
      {"titolo": "The Running Man", "anno": 1987, "perche": "Dystopian televised death-match, satirical 80s excess and high-stakes survival."},
      {"titolo": "The Belko Experiment", "anno": 2016, "perche": "Office-building death mandate, frantic corporate paranoia and sudden bloody savagery."},
      {"titolo": "Heathers", "anno": 1988, "perche": "Pitch-black adolescent cruelty, razor-sharp sociopathic wit and dark high-school satire."}
    ]
  },
  # 16. tv:109958 - The Haunting of Bly Manor (2020)
  {
    "seed": "tv:109958",
    "suggerimenti": [
      {"titolo": "El orfanato", "anno": 2007, "perche": "Heartbreaking maternal devotion, gentle spectral sorrow and tearful emotional catharsis."},
      {"titolo": "The Others", "anno": 2001, "perche": "Chilling foggy claustrophobia, religious rigidity and devastating melancholic revelation."},
      {"titolo": "Crimson Peak", "anno": 2015, "perche": "Lush gothic romance, decaying ancestral mansion and tragic poison of love."},
      {"titolo": "Cronos", "anno": 1993, "perche": "Tender grandfatherly love, melancholic immortality and tragic bodily sacrifice."},
      {"titolo": "The Innocents", "anno": 1961, "perche": "Atmospheric gothic dread, psychological ambiguity and suffocating haunted grandeur."},
      {"titolo": "The Awakening", "anno": 2011, "perche": "Post-WWI grief, rationalist skeptic confronting sorrowful schoolhouse ghosts."},
      {"titolo": "Rebecca", "anno": 1940, "perche": "Lingering ghostly memory of a first wife, aristocratic dread and psychological isolation."},
      {"titolo": "La Belle et la Bête", "anno": 1946, "perche": "Lyrical fairy-tale enchantment, melancholic longing and poetic romantic sadness."},
      {"titolo": "Portrait de la jeune fille en feu", "anno": 2019, "perche": "Heartbreaking unspoken passion, elegiac memory and bittersweet lyrical sorrow."},
      {"titolo": "Ugetsu", "anno": 1953, "perche": "Haunting ghostly romance, tragic delusion and heartbreaking sorrow of lost love."},
      {"titolo": "A Tale of Two Sisters", "anno": 2003, "perche": "Sumptuous gothic dread, repressed family trauma and devastating sisterly grief."},
      {"titolo": "When Marnie Was There", "anno": 2014, "perche": "Gentle ghostly friendship, seaside melancholy and deep familial healing."},
      {"titolo": "Låt den rätte komma in", "anno": 2008, "perche": "Tender melancholic romance, snowy isolation and gentle vampiric devotion."},
      {"titolo": "Nosferatu: Phantom der Nacht", "anno": 1979, "perche": "Somber poetic decay, tragic eternal loneliness and painterly gothic dread."},
      {"titolo": "The Ghost and Mrs. Muir", "anno": 1947, "perche": "Gentle romantic longing, seaside ghostly devotion and bittersweet lifetime ache."},
      {"titolo": "A Ghost Story", "anno": 2017, "perche": "Silent cosmic grief, patient lingering through centuries and heartbreaking longing for connection."},
      {"titolo": "Penny Dreadful", "anno": 2014, "perche": "Lush Victorian gothic sorrow, spiritual torment and tragic romantic outcasts."},
      {"titolo": "The Changeling", "anno": 1980, "perche": "Solitary grief, quiet mournful haunting and tragic injustice of a dead child."},
      {"titolo": "What Dreams May Come", "anno": 1998, "perche": "Sumptuous visual afterlife, unbearable marital grief and mythic romantic devotion."},
      {"titolo": "The Sixth Sense", "anno": 1999, "perche": "Quiet sorrowful ghosts seeking healing, tender mother-son empathy and emotional tearjerker."}
    ]
  },
  # 17. tv:31356 - Big Time Rush (2009)
  {
    "seed": "tv:31356",
    "suggerimenti": [
      {"titolo": "K-On!", "anno": 2009, "perche": "Wholesome musical bonding, sugary school club silliness and adorable sunny camaraderie."},
      {"titolo": "Nodame Cantabile", "anno": 2006, "perche": "Manic cartoon sound-effects, live-action slapstick and exuberant musical passion."},
      {"titolo": "Swing Girls", "anno": 2004, "perche": "Infectious joyful optimism, amateur big-band goofiness and sunny youthful triumph."},
      {"titolo": "Detroit Metal City", "anno": 2008, "perche": "Hilarious pop-vs-metal duality, over-the-top physical comedy and manic farcical energy."},
      {"titolo": "Le Gendarme de Saint-Tropez", "anno": 1964, "perche": "Sunny Mediterranean slapstick, frantic facial gymnastics and cheerful buffoonery."},
      {"titolo": "Les Sous-doués", "anno": 1980, "perche": "High-school loafers inventing ridiculous gadgets, carefree sunny comedic mischief."},
      {"titolo": "Astérix & Obélix: Mission Cléopâtre", "anno": 2002, "perche": "Manic pop-culture parodies, lightning-fast slapstick and joyous cartoonish charm."},
      {"titolo": "A Hard Day's Night", "anno": 1964, "perche": "Playful pop-boyband mania, zany slapstick running around and infectious joyful irreverence."},
      {"titolo": "Help!", "anno": 1965, "perche": "Absurdist comic book adventures, vibrant pop songs and madcap cartoon chases."},
      {"titolo": "Spice World", "anno": 1997, "perche": "Campy pop-group self-parody, breezy girl-power fun and colorful celebrity absurdity."},
      {"titolo": "Spaced", "anno": 1999, "perche": "Hyperactive pop-culture editing, video-game sound cues and lovable eccentric slackers."},
      {"titolo": "Totò a colori", "anno": 1952, "perche": "Kinetic rubber-faced slapstick, vibrant vintage color and boundless comic exuberance."},
      {"titolo": "I clowns", "anno": 1970, "perche": "Whimsical celebration of slapstick circus folly, joyful noise and colorful physical humor."},
      {"titolo": "Pippi Långstrump", "anno": 1969, "perche": "Pure joyful anarchy, superhuman playful mischief and sunny childhood wonder."},
      {"titolo": "Scott Pilgrim vs. the World", "anno": 2010, "perche": "Hyperactive video-game pacing, sound-effect visual gags and vibrant comic exuberance."},
      {"titolo": "The Monkees", "anno": 1966, "perche": "Archetypal manic pop-boyband slapstick, fourth-wall breaking and zany joyful romp."},
      {"titolo": "Drake & Josh", "anno": 2004, "perche": "Classic Nickelodeon live-action slapstick, odd-couple brotherly antics and bubbly physical comedy."},
      {"titolo": "School of Rock", "anno": 2003, "perche": "Infectious rock-and-roll joy, exuberant kid empowerment and irresistible warm humor."},
      {"titolo": "That Thing You Do!", "anno": 1996, "perche": "Sunny, infectious one-hit-wonder pop optimism, endearing bandmates and nostalgic fun."},
      {"titolo": "Pee-wee's Big Adventure", "anno": 1985, "perche": "Pure exuberant childlike whimsy, colorful slapstick contraptions and joyful innocence."}
    ]
  },
  # 18. movie:1725 - West Side Story (1961)
  {
    "seed": "movie:1725",
    "suggerimenti": [
      {"titolo": "Les Parapluies de Cherbourg", "anno": 1964, "perche": "Operatic sung-through lyricism, pastel visual splendor and heartbreaking romantic separation."},
      {"titolo": "Les Demoiselles de Rochefort", "anno": 1967, "perche": "Dazzling choreographic joy, poetic romantic destiny and infectious pastel elegance."},
      {"titolo": "Les Enfants du paradis", "anno": 1945, "perche": "Monumental theatrical romanticism, doomed poetic lovers and sweeping artistic grandiosity."},
      {"titolo": "Double Suicide", "anno": 1969, "perche": "Highly stylized theatrical staging, intense lovers' doomed fate and operatic tragedy."},
      {"titolo": "Lady Snowblood", "anno": 1973, "perche": "Stylized kinetic beauty, operatic tragedy and blood-soaked theatrical poetry."},
      {"titolo": "Goliyon Ki Raasleela Ram-Leela", "anno": 2013, "perche": "Operatic Romeo-and-Juliet passion, breathtaking vibrant choreography and explosive tragic conflict."},
      {"titolo": "Devdas", "anno": 2002, "perche": "Sumptuous visual grandeur, operatic heartbreak and tragic doomed lovers."},
      {"titolo": "The Red Shoes", "anno": 1948, "perche": "Passionate artistic obsession, breathtaking balletic staging and tragic romantic doom."},
      {"titolo": "Romeo and Juliet", "anno": 1968, "perche": "Lyrical youth passion, tragic family feud and gorgeous Renaissance romanticism."},
      {"titolo": "Oliver!", "anno": 1968, "perche": "Dickensian operatic musical staging, vibrant crowd choreography and dark melodramatic tension."},
      {"titolo": "Black Narcissus", "anno": 1947, "perche": "Heightened psychological melodrama, feverish repressed passions and dazzling theatrical color."},
      {"titolo": "Bodas de sangre", "anno": 1981, "perche": "Intense flamenco choreographic duel, fateful passion and tragic destiny."},
      {"titolo": "Carmen", "anno": 1983, "perche": "Flamenco rehearsal transforming into obsessive romantic rivalry and fatal tragedy."},
      {"titolo": "Senso", "anno": 1954, "perche": "Operatic melodrama, lush technicolor passion and devastating romantic betrayal."},
      {"titolo": "Rocco e i suoi fratelli", "anno": 1960, "perche": "Operatic familial melodrama, passionate fraternal rivalry and heartbreaking urban tragedy."},
      {"titolo": "Singin' in the Rain", "anno": 1952, "perche": "Exuberant choreographic perfection, theatrical romantic joy and radiant cinematic energy."},
      {"titolo": "All That Jazz", "anno": 1979, "perche": "Spectacular hallucinatory choreography, feverish theatrical obsession and operatic death reckoning."},
      {"titolo": "Cabaret", "anno": 1972, "perche": "Electric musical staging, seductive cynicism and haunting socio-political doom."},
      {"titolo": "Moulin Rouge!", "anno": 2001, "perche": "Frenetic operatic romance, flamboyant theatrical excess and tragic doomed lovers."},
      {"titolo": "La La Land", "anno": 2016, "perche": "Bittersweet romantic lyricism, colorful nostalgic choreography and wistful dreamland melancholy."}
    ]
  },
  # 19. movie:114150 - Voices (2012)
  {
    "seed": "movie:114150",
    "suggerimenti": [
      {"titolo": "Bend It Like Beckham", "anno": 2002, "perche": "Spirited female camaraderie, uplifting underdog triumphs and breezy cultural wit."},
      {"titolo": "Angus, Thongs and Perfect Snogging", "anno": 2008, "perche": "Cheeky teenage awkwardness, hilarious deadpan diaries and infectious warmth."},
      {"titolo": "Fighting with My Family", "anno": 2019, "perche": "Quirky working-class underdog banter, fierce determination and crowd-pleasing heart."},
      {"titolo": "Sing Street", "anno": 2016, "perche": "Irresistible 80s musical creation, plucky youth camaraderie and triumphant buoyant charm."},
      {"titolo": "Gregory's Girl", "anno": 1981, "perche": "Charming deadpan adolescent eccentricity, quirky Scottish wit and gentle comedic warmth."},
      {"titolo": "La Famille Bélier", "anno": 2014, "perche": "Heartwarming vocal discovery, eccentric family comedy and tear-jerking musical emotionalism."},
      {"titolo": "Populaire", "anno": 2012, "perche": "Snappy retro competition, stylish screwball banter and infectiously charming underdog ambition."},
      {"titolo": "Waterboys", "anno": 2001, "perche": "Hilarious male synchronized swimming, endearing goofballs and buoyant underdog triumph."},
      {"titolo": "Linda Linda Linda", "anno": 2005, "perche": "Gentle high-school girl band camaraderie, deadpan quirky charm and punk-pop joy."},
      {"titolo": "Hula Girls", "anno": 2006, "perche": "Inspiring coal-town dance revival, spirited female solidarity and joyful crowd-pleasing tears."},
      {"titolo": "The Commitments", "anno": 1991, "perche": "Feisty Dublin soul band squabbling, gritty musical swagger and infectious raw energy."},
      {"titolo": "Strictly Ballroom", "anno": 1992, "perche": "Flamboyant camp competition, dazzling eccentric comedy and irresistible underdog romance."},
      {"titolo": "Bottoms", "anno": 2023, "perche": "Absurdist deadpan high-school camp, chaotic female misfits and subversive comedy."},
      {"titolo": "Bandits", "anno": 1997, "perche": "Female prison rock-band rebellion, gritty pop-rock energy and fierce sisterhood."},
      {"titolo": "Bring It On", "anno": 2000, "perche": "Razor-sharp competitive camp, snappy cheerleading rivalry and infectiously energetic pop wit."},
      {"titolo": "Clueless", "anno": 1995, "perche": "Sparkling bubbly satire, iconic California snark and golden-hearted sweetness."},
      {"titolo": "Legally Blonde", "anno": 2001, "perche": "Unstoppable pink optimism, brisk courtroom snark and triumphant underdog empowerment."},
      {"titolo": "Mean Girls", "anno": 2004, "perche": "Razor-sharp satirical wit, quotable high-school politics and biting deadpan humor."},
      {"titolo": "Drop Dead Gorgeous", "anno": 1999, "perche": "Ruthless beauty-pageant mockumentary satire, dark comedic bite and Midwestern camp."},
      {"titolo": "Whip It", "anno": 2009, "perche": "Gritty roller-derby sisterhood, rebellious indie-rock energy and tender coming-of-age heart."}
    ]
  },
  # 20. movie:399366 - Marrowbone (2017)
  {
    "seed": "movie:399366",
    "suggerimenti": [
      {"titolo": "El espíritu de la colmena", "anno": 1973, "perche": "Haunting childhood innocence, quiet gothic rural mystery and poetic melancholy."},
      {"titolo": "El espinazo del diablo", "anno": 2001, "perche": "Mournful orphanage ghost, fragile boyish solidarity and tragic wartime cruelty."},
      {"titolo": "El habitante incierto", "anno": 2004, "perche": "Claustrophobic architectural paranoia, hidden intruder dread and fragile psychology."},
      {"titolo": "¿Quién puede matar a un niño?", "anno": 1976, "perche": "Eerie sun-drenched dread, sinister child solidarity and chilling isolation."},
      {"titolo": "The Secret Garden", "anno": 1993, "perche": "Atmospheric country-estate mystery, fragile grieving children and tender healing bond."},
      {"titolo": "Atonement", "anno": 2007, "perche": "Lyrical country-manor tragedy, devastating childhood misperception and lingering lifelong guilt."},
      {"titolo": "The Cement Garden", "anno": 1993, "perche": "Suffocating suburban isolation, morbid sibling secrecy concealing a dark maternal death."},
      {"titolo": "Whistle Down the Wind", "anno": 1961, "perche": "Poignant rural childhood innocence, fragile sibling secret and bittersweet tragic realism."},
      {"titolo": "Les Diaboliques", "anno": 1955, "perche": "Suffocating psychological claustrophobia, decaying boarding school and morbid dread."},
      {"titolo": "Innocence", "anno": 2004, "perche": "Eerie secluded woodland school, fragile girlhood innocence and dreamlike gothic dread."},
      {"titolo": "Les Yeux sans visage", "anno": 1960, "perche": "Lyrical medical horror, melancholic isolation and fragile masked sorrow."},
      {"titolo": "Dare mo shiranai", "anno": 2004, "perche": "Heartbreaking sibling survival, tender mutual protection hidden in an apartment."},
      {"titolo": "Hotaru no haka", "anno": 1988, "perche": "Devastating sibling devotion, fragile innocence crushed by trauma and unbearable sorrow."},
      {"titolo": "Hausu", "anno": 1977, "perche": "Surreal haunted-house fever-dream, schoolgirl camaraderie and colorful bizarre dread."},
      {"titolo": "Picnic at Hanging Rock", "anno": 1975, "perche": "Eerie Victorian gothic dread, hypnotic sunlight and lingering traumatic disappearance."},
      {"titolo": "Veneno para las hadas", "anno": 1986, "perche": "Dark childhood games, macabre imaginary witchcraft turning into psychological horror."},
      {"titolo": "The Reflecting Skin", "anno": 1990, "perche": "Sunlit rural gothic nightmare, warped childhood perspective and macabre dread."},
      {"titolo": "We Have Always Lived in the Castle", "anno": 2018, "perche": "Agoraphobic sisterly devotion, decaying family mansion and dark poisonous secrets."},
      {"titolo": "The Night of the Hunter", "anno": 1955, "perche": "Somber fairy-tale terror, protective sibling flight and atmospheric gothic shadows."},
      {"titolo": "Something Wicked This Way Comes", "anno": 1983, "perche": "Poetic autumnal dread, fragile boyhood friendship confronting sinister demonic carnival."}
    ]
  }
]

# Verification logic
with open('.scratch/banco-casi/semi-02.json', 'r', encoding='utf-8') as f:
    semi = json.load(f)

assert len(DATA) == 20, f"Expected 20 seeds, got {len(DATA)}"
for idx, (s_exp, d) in enumerate(zip(semi, DATA)):
    assert s_exp['key'] == d['seed'], f"Seed mismatch at {idx}: expected {s_exp['key']}, got {d['seed']}"
    assert len(d['suggerimenti']) == 20, f"Seed {d['seed']} has {len(d['suggerimenti'])} items, expected 20"

print("Seeds and suggestion counts verified OK.")

all_titles = []
for d in DATA:
    for item in d['suggerimenti']:
        all_titles.append((item['titolo'].lower(), item['anno']))

print(f"Total suggestions: {len(all_titles)}")
import collections
counts = collections.Counter(all_titles)
duplicates = [k for k, v in counts.items() if v > 1]
print(f"Duplicates across entire file: {len(duplicates)}")
if duplicates:
    print("Duplicate titles:", duplicates)

def lookup(title, year):
    # Try movie
    m = m_df[((m_df.title.str.lower() == title.lower()) | (m_df.original_title.str.lower() == title.lower()))]
    if year:
        m_year = m[m.release_date.str.startswith(str(year), na=False)]
        if not m_year.empty:
            return 'movie', m_year.iloc[0]
        # Allow +/- 1 year
        m_near = m[m.release_date.str.slice(0, 4).astype(float, errors='ignore').isin([year-1, year, year+1])]
        if not m_near.empty:
            return 'movie_near_year', m_near.iloc[0]
        if not m.empty:
            return 'movie_other_year', m.iloc[0]

    # Try tv
    t = t_df[((t_df.name.str.lower() == title.lower()) | (t_df.original_name.str.lower() == title.lower()))]
    if year:
        t_year = t[t.first_air_date.str.startswith(str(year), na=False)]
        if not t_year.empty:
            return 'tv', t_year.iloc[0]
        t_near = t[t.first_air_date.str.slice(0, 4).astype(float, errors='ignore').isin([year-1, year, year+1])]
        if not t_near.empty:
            return 'tv_near_year', t_near.iloc[0]
        if not t.empty:
            return 'tv_other_year', t.iloc[0]
            
    return None, None

unmatched = []
for d in DATA:
    seed_key = d['seed']
    seed_suggs = d['suggerimenti']
    decades = set()
    non_en_count = 0
    country_counts = collections.Counter()
    
    for item in seed_suggs:
        t, y, p = item['titolo'], item['anno'], item['perche']
        # Word count check
        words = len(p.split())
        assert words <= 12, f"Seed {seed_key} - '{t}' perche too long ({words} words): '{p}'"
        
        # Match lookup
        kind, row = lookup(t, y)
        if kind is None:
            unmatched.append((seed_key, t, y))
            continue
            
        # Check year & decade
        decades.add((y // 10) * 10)
        
        # Check language
        lang = row.get('original_language', '')
        if lang != 'en':
            non_en_count += 1
            
        # Check country
        p_countries = json.loads(row.get('production_countries') or '[]')
        for c in p_countries:
            country_counts[c] += 1
            
    print(f"Seed {seed_key}: {len(decades)} decades ({sorted(decades)}), {non_en_count} non-EN, top countries: {country_counts.most_common(3)}")

print(f"Unmatched items: {len(unmatched)}")
if unmatched:
    for u in unmatched:
        print("Unmatched:", u)
