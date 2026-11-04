import json

# Let's write the draft structure and test all criteria
data = [
  # Seed 1: movie:2011 Persepolis (2007)
  {
    "seed": "movie:2011",
    "meta": {"titolo": "Persepolis", "anno": 2007},
    "suggerimenti": [
      {"titolo": "Waltz with Bashir", "anno": 2008, "country": "Israel", "lang": "Hebrew", "perche": "Graphic animated memory confronting political trauma with surreal, haunting introspection."},
      {"titolo": "Ghost World", "anno": 2001, "country": "US", "lang": "English", "perche": "Cynical, alienated youth navigating personal disillusionment with biting deadpan wit."},
      {"titolo": "Irma Vep", "anno": 1996, "country": "France", "lang": "French", "perche": "Restless, artistic disorientation captured with chaotic yet deeply affectionate irony."},
      {"titolo": "The Spirit of the Beehive", "anno": 1973, "country": "Spain", "lang": "Spanish", "perche": "Poetic childlike gaze processing political silence and historical trauma."},
      {"titolo": "Aparajito", "anno": 1956, "country": "India", "lang": "Bengali", "perche": "Poignant, bittersweet generational growth and maternal sorrow amid changing worlds."},
      {"titolo": "The 400 Blows", "anno": 1959, "country": "France", "lang": "French", "perche": "Restless youth rebellion and poignant vulnerability against rigid institutional conformity."},
      {"titolo": "Submarine", "anno": 2010, "country": "UK", "lang": "English", "perche": "Sardonic, stylistically eccentric adolescent angst mixed with tender melancholia."},
      {"titolo": "Welcome to the Dollhouse", "anno": 1995, "country": "US", "lang": "English", "perche": "Unsparingly awkward, painfully funny portrait of youthful isolation and defiance."},
      {"titolo": "Flee", "anno": 2021, "country": "Denmark", "lang": "Danish", "perche": "Intimate animated testimony blending displacement trauma with resilient personal truth."},
      {"titolo": "Mary and Max", "anno": 2009, "country": "Australia", "lang": "English", "perche": "Tragicomic, quirky animated melancholy exploring loneliness, connection, and oddity."},
      {"titolo": "American Splendor", "anno": 2003, "country": "US", "lang": "English", "perche": "Grumpy, candid graphic memoir balancing existential gloom with dry humor."},
      {"titolo": "C.R.A.Z.Y.", "anno": 2005, "country": "Canada", "lang": "French", "perche": "Energetic, conflicted coming-of-age marked by rock defiance and familial warmth."},
      {"titolo": "We Are the Best!", "anno": 2013, "country": "Sweden", "lang": "Swedish", "perche": "Joyously anarchic, spirited adolescent rebellion laughing in the face of gloom."},
      {"titolo": "Jojo Rabbit", "anno": 2019, "country": "New Zealand", "lang": "English", "perche": "Satirical whimsy colliding with poignant historical heartbreak and youthful innocence."},
      {"titolo": "Gregory's Girl", "anno": 1981, "country": "UK", "lang": "English", "perche": "Gentle, delightfully awkward adolescent yearning with dry, quirky warmth."},
      {"titolo": "The Squid and the Whale", "anno": 2005, "country": "US", "lang": "English", "perche": "Acerbic, cringe-inducing family breakdown rendered with stinging literary intimacy."},
      {"titolo": "Turtles Can Fly", "anno": 2004, "country": "Iran", "lang": "Kurdish", "perche": "Tragic yet darkly resilient youthful survival amid war's devastation."},
      {"titolo": "My Life as a Courgette", "anno": 2016, "country": "Switzerland", "lang": "French", "perche": "Tender, poignant animated resilience dealing with childhood grief without sentimentality."},
      {"titolo": "A Cock and Bull Story", "anno": 2005, "country": "UK", "lang": "English", "perche": "Playful, self-referential literary wit dissecting memory and artistic neurosis."},
      {"titolo": "Hope and Glory", "anno": 1987, "country": "UK", "lang": "English", "perche": "Bittersweet, delightfully subversive childhood perspective observing wartime chaos with wonder."}
    ]
  },

  # Seed 2: tv:63639 The Expanse (2015)
  {
    "seed": "tv:63639",
    "meta": {"titolo": "The Expanse", "anno": 2015},
    "suggerimenti": [
      {"titolo": "Das Boot", "anno": 1981, "country": "Germany", "lang": "German", "perche": "Claustrophobic, grimy procedural tension under unrelenting pressure and existential peril."},
      {"titolo": "Tinker Tailor Soldier Spy", "anno": 2011, "country": "UK", "lang": "English", "perche": "Methodical, bleak bureaucratic paranoia and cold geopolitical maneuvering."},
      {"titolo": "Edge of Darkness", "anno": 1985, "country": "UK", "lang": "English", "perche": "Bleak nuclear conspiracy thriller delving into institutional deceit and eco-existential dread."},
      {"titolo": "Battlestar Galactica", "anno": 2004, "country": "Canada", "lang": "English", "perche": "Gritty survivalism, agonizing moral compromises, and relentless military tension."},
      {"titolo": "Sicario", "anno": 2015, "country": "US", "lang": "English", "perche": "Cold, uncompromising moral ambiguity and oppressive institutional dread."},
      {"titolo": "Gomorra - La serie", "anno": 2014, "country": "Italy", "lang": "Italian", "perche": "Relentlessly bleak, gritty power struggles devoid of romanticism."},
      {"titolo": "The Wire", "anno": 2002, "country": "US", "lang": "English", "perche": "Dense institutional realism, interlocking factions, and unsparing sociopolitical critique."},
      {"titolo": "Fail Safe", "anno": 1964, "country": "US", "lang": "English", "perche": "Chilling, claustrophobic procedural dread as bureaucratic systems spiral toward catastrophe."},
      {"titolo": "The Battle of Algiers", "anno": 1966, "country": "Italy", "lang": "French", "perche": "Hyper-realistic, morally complex depiction of asymmetric warfare and insurgency."},
      {"titolo": "Chernobyl", "anno": 2019, "country": "UK", "lang": "English", "perche": "Grim, dread-soaked procedural exposure of systemic decay and institutional deceit."},
      {"titolo": "Babylon Berlin", "anno": 2017, "country": "Germany", "lang": "German", "perche": "Gritty noir cynicism amidst volatile sociopolitical decay and factional unrest."},
      {"titolo": "Andor", "anno": 2022, "country": "US", "lang": "English", "perche": "Grounded, gritty insurrectionist tension and suffocating bureaucratic tyranny."},
      {"titolo": "Crimson Tide", "anno": 1995, "country": "US", "lang": "English", "perche": "Taut, sweaty tactical standoff fueled by conflicting duties and procedural crisis."},
      {"titolo": "Shin Godzilla", "anno": 2016, "country": "Japan", "lang": "Japanese", "perche": "Frantic, realistic bureaucratic crisis management confronting an unprecedented existential disaster."},
      {"titolo": "The Bureau", "anno": 2015, "country": "France", "lang": "French", "perche": "Ultra-grounded, cerebral espionage highlighting quiet tension and psychological exhaustion."},
      {"titolo": "The Day of the Jackal", "anno": 1973, "country": "UK", "lang": "English", "perche": "Meticulous, ice-cold procedural chess match between ruthless pursuit and evasion."},
      {"titolo": "State of Siege", "anno": 1972, "country": "France", "lang": "French", "perche": "Clinical, gripping political thriller interrogating ideology, statecraft, and covert violence."},
      {"titolo": "The Shadow Line", "anno": 2011, "country": "UK", "lang": "English", "perche": "Murky, brooding conspiratorial neo-noir soaked in moral decay and fatalism."},
      {"titolo": "Memories of Murder", "anno": 2003, "country": "South Korea", "lang": "Korean", "perche": "Bleak, frustrated procedural obsession unravelling against a turbulent political backdrop."},
      {"titolo": "Sorcerer", "anno": 1977, "country": "US", "lang": "English", "perche": "Sweaty, unrelenting existential dread and desperate survival against impossible odds."}
    ]
  },

  # Seed 3: movie:34647 Enter the Void (2010)
  {
    "seed": "movie:34647",
    "meta": {"titolo": "Enter the Void", "anno": 2010},
    "suggerimenti": [
      {"titolo": "Requiem for a Dream", "anno": 2000, "country": "US", "lang": "English", "perche": "Relentless sensory overload, spiraling chemical despair, and visceral audiovisual frenzy."},
      {"titolo": "Under the Skin", "anno": 2013, "country": "UK", "lang": "English", "perche": "Hypnotic, alien detachment, uncanny predatory dread, and haunting sonic immersion."},
      {"titolo": "The Holy Mountain", "anno": 1973, "country": "Mexico", "lang": "Spanish", "perche": "Visually overwhelming surreal mysticism and psychedelic spiritual pilgrimage."},
      {"titolo": "Altered States", "anno": 1980, "country": "US", "lang": "English", "perche": "Primal hallucinatory terror, biological regression, and feverish consciousness expansion."},
      {"titolo": "Mandy", "anno": 2018, "country": "Belgium", "lang": "English", "perche": "Phantasmagoric neon nightmare drenched in heavy-metal grief and psychedelic vengeance."},
      {"titolo": "Possession", "anno": 1981, "country": "France", "lang": "English", "perche": "Hysterical emotional convulsion, visceral madness, and grotesque psychological unraveling."},
      {"titolo": "Beyond the Black Rainbow", "anno": 2010, "country": "Canada", "lang": "English", "perche": "Hypnotic, synth-drenched sensory trance capturing cold, clinical esoteric dread."},
      {"titolo": "Inland Empire", "anno": 2006, "country": "US", "lang": "English", "perche": "Terrifyingly fractured, hallucinatory descent into identity dissolution and nocturnal delirium."},
      {"titolo": "Nowhere", "anno": 1997, "country": "US", "lang": "English", "perche": "Hyper-saturated, apocalyptic neon angst, sensory overload, and nihilistic youthful despair."},
      {"titolo": "Fear and Loathing in Las Vegas", "anno": 1998, "country": "US", "lang": "English", "perche": "Grotesque, drug-fueled delirium capturing the monstrous rotting underbelly of hedonism."},
      {"titolo": "Titane", "anno": 2021, "country": "France", "lang": "French", "perche": "Visceral, body-bending sensory shock exploring feverish physical transformation and grief."},
      {"titolo": "Fantastic Planet", "anno": 1973, "country": "France", "lang": "French", "perche": "Surreal, psychedelic visual alienation exploring cosmic subjugation with uncanny detachment."},
      {"titolo": "Uncle Boonmee Who Can Recall His Past Lives", "anno": 2010, "country": "Thailand", "lang": "Thai", "perche": "Hypnotic, liminal spiritual drift dissolving boundaries between life, death, and ghosts."},
      {"titolo": "2001: A Space Odyssey", "anno": 1968, "country": "UK", "lang": "English", "perche": "Cold, majestic cosmic transcendence and hypnotic sensory stargate abstraction."},
      {"titolo": "Dead Man", "anno": 1995, "country": "US", "lang": "English", "perche": "Hallucinatory, poetic death-trip through a bleak, spectral purgatorial landscape."},
      {"titolo": "Hausu", "anno": 1977, "country": "Japan", "lang": "Japanese", "perche": "Delirious, candy-colored psychedelic nightmare exploding with joyful macabre hallucinations."},
      {"titolo": "Tetsuo: The Iron Man", "anno": 1989, "country": "Japan", "lang": "Japanese", "perche": "Frenetic, hyper-kinetic sensory assault fusing industrial metal, flesh, and hysteria."},
      {"titolo": "Valhalla Rising", "anno": 2009, "country": "Denmark", "lang": "English", "perche": "Brutal, silent, hallucinatory spiritual pilgrimage into the abyss of primeval oblivion."},
      {"titolo": "Post Tenebras Lux", "anno": 2012, "country": "Mexico", "lang": "Spanish", "perche": "Disorienting, poetic, nocturnal dream-logic capturing existential dread and domestic darkness."},
      {"titolo": "Long Day's Journey into Night", "anno": 2018, "country": "China", "lang": "Mandarin", "perche": "Mesmerizing neon-noir dreamscape floating seamlessly into hypnotic one-shot reverie."}
    ]
  },

  # Seed 4: movie:782 Gattaca - La porta dell'universo (1997)
  {
    "seed": "movie:782",
    "meta": {"titolo": "Gattaca - La porta dell'universo", "anno": 1997},
    "suggerimenti": [
      {"titolo": "Never Let Me Go", "anno": 2010, "country": "UK", "lang": "English", "perche": "Heartbreaking, subdued melancholy exploring human disposability within a polite dystopia."},
      {"titolo": "Solaris", "anno": 1972, "country": "USSR", "lang": "Russian", "perche": "Haunting, philosophical sorrow and architectural alienation confronting grief and memory."},
      {"titolo": "Her", "anno": 2013, "country": "US", "lang": "English", "perche": "Pastel-toned, gentle technological isolation radiating tender, melancholic intimacy."},
      {"titolo": "Ex Machina", "anno": 2014, "country": "UK", "lang": "English", "perche": "Sleek, claustrophobic psychological chess game set in austere modernist isolation."},
      {"titolo": "Code 46", "anno": 2003, "country": "UK", "lang": "English", "perche": "Somber, neo-noir romantic fatalism within a sterile, genetically segregated future."},
      {"titolo": "Il conformista", "anno": 1970, "country": "Italy", "lang": "Italian", "perche": "Chilly architectural grandeur, suppressed identity, and desperate yearning for normalcy."},
      {"titolo": "Alphaville", "anno": 1965, "country": "France", "lang": "French", "perche": "Poetic, austere noir melancholy opposing cold technocratic logic with love."},
      {"titolo": "Dark City", "anno": 1998, "country": "Australia", "lang": "English", "perche": "Melancholic, shadowy identity crisis questioning memory and humanity beneath artificial skies."},
      {"titolo": "The Double Life of Véronique", "anno": 1991, "country": "France", "lang": "French", "perche": "Lyrical, melancholic mystery suffused with gentle existential yearning and visual elegance."},
      {"titolo": "Columbus", "anno": 2017, "country": "US", "lang": "English", "perche": "Contemplative modernist architecture framing subdued emotional grief and connection."},
      {"titolo": "Seconds", "anno": 1966, "country": "US", "lang": "English", "perche": "Chilling paranoia, sterile mid-century alienation, and the tragedy of engineered identity."},
      {"titolo": "After Life", "anno": 1998, "country": "Japan", "lang": "Japanese", "perche": "Restrained, poetic bureaucratic grace contemplating the essence of human memory."},
      {"titolo": "Metropolis", "anno": 1927, "country": "Germany", "lang": "German", "perche": "Monumental architectural expressionism expressing class division and enduring human soul."},
      {"titolo": "First Reformed", "anno": 2017, "country": "US", "lang": "English", "perche": "Severe, austere spiritual despair and quiet, agonizing moral conviction."},
      {"titolo": "The Remains of the Day", "anno": 1993, "country": "UK", "lang": "English", "perche": "Heartbreaking emotional repression, rigid duty, and dignified unspoken sorrow."},
      {"titolo": "The Lives of Others", "anno": 2006, "country": "Germany", "lang": "German", "perche": "Austere surveillance, quiet moral awakening, and poignant human empathy."},
      {"titolo": "Moon", "anno": 2009, "country": "UK", "lang": "English", "perche": "Lonely, sterile existential isolation discovering profound, heartbreaking self-empathy."},
      {"titolo": "Blade Runner 2049", "anno": 2017, "country": "US", "lang": "English", "perche": "Vast, melancholic neon loneliness contemplating what gives an engineered life meaning."},
      {"titolo": "The Quiet Earth", "anno": 1985, "country": "New Zealand", "lang": "English", "perche": "Eerie, contemplative post-apocalyptic solitude and fragile human dignity."},
      {"titolo": "Wings of Desire", "anno": 1987, "country": "Germany", "lang": "German", "perche": "Lyrical, melancholic perspective yearning for finite, sensory human existence."}
    ]
  },

  # Seed 5: tv:4574 Insuperabili X-Men (1992)
  {
    "seed": "tv:4574",
    "meta": {"titolo": "Insuperabili X-Men", "anno": 1992},
    "suggerimenti": [
      {"titolo": "Batman: The Animated Series", "anno": 1992, "country": "US", "lang": "English", "perche": "Gothic, operatic noir pulp treating masked crusaders with dramatic gravity."},
      {"titolo": "Gargoyles", "anno": 1994, "country": "US", "lang": "English", "perche": "Shakespearean melodrama, mythic tragedy, and noble outcasts protecting an ungrateful city."},
      {"titolo": "Wakfu", "anno": 2008, "country": "France", "lang": "French", "perche": "Colorful, epic serialized adventure balancing vibrant humor with grand mythical stakes."},
      {"titolo": "Space Battleship Yamato", "anno": 1974, "country": "Japan", "lang": "Japanese", "perche": "Earnest, operatic heroism and passionate self-sacrifice facing existential planetary extinction."},
      {"titolo": "Mobile Suit Gundam", "anno": 1979, "country": "Japan", "lang": "Japanese", "perche": "Melodramatic wartime tragedy exploring the heavy burden of special abilities."},
      {"titolo": "Freaks Out", "anno": 2021, "country": "Italy", "lang": "Italian", "perche": "Superpowered circus outcasts resisting fascist oppression with operatic heartbreak and grit."},
      {"titolo": "Flash Gordon", "anno": 1980, "country": "UK", "lang": "English", "perche": "Operatic, camp-adjacent colorful pulp adventure fueled by earnest, full-throated heroics."},
      {"titolo": "Avatar: The Last Airbender", "anno": 2005, "country": "US", "lang": "English", "perche": "Serialized epic adventure blending high moral stakes, deep trauma, and heartfelt camaraderie."},
      {"titolo": "The Rocketeer", "anno": 1991, "country": "US", "lang": "English", "perche": "Sincere, nostalgic pulp heroism brimming with earnest courage and art-deco adventure."},
      {"titolo": "Excalibur", "anno": 1981, "country": "UK", "lang": "English", "perche": "Mythic operatic grandeur, tragic fate, and grand emotional theatrics."},
      {"titolo": "Arcane", "anno": 2021, "country": "France", "lang": "English", "perche": "Visceral, operatic political tragedy fueled by fierce sisterly devotion and class strife."},
      {"titolo": "Tiger & Bunny", "anno": 2011, "country": "Japan", "lang": "Japanese", "perche": "Heartfelt superhero camaraderie, commercial cynicism challenged by genuine heroism and melodrama."},
      {"titolo": "Thunderbirds", "anno": 1965, "country": "UK", "lang": "English", "perche": "Earnest high-stakes rescue missions executed with breathless, retro-heroic conviction."},
      {"titolo": "Astro Boy", "anno": 1963, "country": "Japan", "lang": "Japanese", "perche": "Compassionate outcast android seeking coexistence amid prejudice and moral challenges."},
      {"titolo": "Saint Seiya", "anno": 1986, "country": "Japan", "lang": "Japanese", "perche": "Intensely melodramatic mythological brotherhood fighting against impossible odds."},
      {"titolo": "Robin of Sherwood", "anno": 1984, "country": "UK", "lang": "English", "perche": "Mystical, impassioned heroic rebellion combining folklore myth with gritty camaraderie."},
      {"titolo": "Farscape", "anno": 1999, "country": "Australia", "lang": "English", "perche": "Volatile, operatic space adventure packed with eccentric outcasts and emotional intensity."},
      {"titolo": "Doctor Who", "anno": 2005, "country": "UK", "lang": "English", "perche": "Energetic pulp sci-fi blending grand emotional melodrama with moral idealism."},
      {"titolo": "The Mask of Zorro", "anno": 1998, "country": "US", "lang": "English", "perche": "Swashbuckling earnest heroism, romantic passion, and righteous defense of the oppressed."},
      {"titolo": "Princess Mononoke", "anno": 1997, "country": "Japan", "lang": "Japanese", "perche": "Mythic, passionate clash of ideologies devoid of simplistic villains or easy answers."}
    ]
  },

  # Seed 6: movie:9427 Full Monty (1997)
  {
    "seed": "movie:9427",
    "meta": {"titolo": "Full Monty - Squattrinati organizzati", "anno": 1997},
    "suggerimenti": [
      {"titolo": "Brassed Off", "anno": 1996, "country": "UK", "lang": "English", "perche": "Passionate working-class defiance, brass band camaraderie, and bittersweet industrial grief."},
      {"titolo": "Billy Elliot", "anno": 2000, "country": "UK", "lang": "English", "perche": "Tender, gritty working-class hope defying bleak economic hardship with exuberant passion."},
      {"titolo": "Pride", "anno": 2014, "country": "UK", "lang": "English", "perche": "Exuberant, deeply moving solidarity uniting disparate communities with warmth and joy."},
      {"titolo": "Local Hero", "anno": 1983, "country": "UK", "lang": "English", "perche": "Gentle, bittersweet communal charm gently seducing corporate cynicism with coastal wonder."},
      {"titolo": "Waking Ned Devine", "anno": 1998, "country": "Ireland", "lang": "English", "perche": "Canny, whimsical village solidarity conspiring to snatch joy from sudden fortune."},
      {"titolo": "The Commitments", "anno": 1991, "country": "Ireland", "lang": "English", "perche": "Scrappy, soul-singing Dublin youth finding fiery purpose amid urban gloom."},
      {"titolo": "The Snapper", "anno": 1993, "country": "Ireland", "lang": "English", "perche": "Raucous, loving working-class family rallying around unexpected pregnancy with chaotic tenderness."},
      {"titolo": "Ladri di biciclette", "anno": 1948, "country": "Italy", "lang": "Italian", "perche": "Desperate working-class dignity and heartbreaking paternal love navigating post-war poverty."},
      {"titolo": "I soliti ignoti", "anno": 1958, "country": "Italy", "lang": "Italian", "perche": "Hilariously bungling, impoverished rogues holding onto pathetic dreams with endearing heart."},
      {"titolo": "Miracolo a Milano", "anno": 1951, "country": "Italy", "lang": "Italian", "perche": "Whimsical, poetic solidarity among shantytown outcasts seeking simple human joy."},
      {"titolo": "Tampopo", "anno": 1985, "country": "Japan", "lang": "Japanese", "perche": "Generous, quirky communal effort rallying to perfect a humble craft."},
      {"titolo": "The Station Agent", "anno": 2003, "country": "US", "lang": "English", "perche": "Quiet, eccentric outsiders stumbling into tender, unforced friendship and healing."},
      {"titolo": "A League of Their Own", "anno": 1992, "country": "US", "lang": "English", "perche": "Resilient, scrappy sisterhood finding pride and purpose under unlikely circumstances."},
      {"titolo": "Chef", "anno": 2014, "country": "US", "lang": "English", "perche": "Soulful, unpretentious joy rediscovering craft, humility, and family through simple food."},
      {"titolo": "The Castle", "anno": 1997, "country": "Australia", "lang": "English", "perche": "Endearingly unpretentious family fighting for their modest home with fierce pride."},
      {"titolo": "Quasi amici", "anno": 2011, "country": "France", "lang": "French", "perche": "Irreverent humor and candid warmth transcending class and physical vulnerability."},
      {"titolo": "Paulette", "anno": 2012, "country": "France", "lang": "French", "perche": "Impoverished pensioner turning to illicit trade with caustic, resilient wit."},
      {"titolo": "Flickering Lights", "anno": 2000, "country": "Denmark", "lang": "Danish", "perche": "Deadpan, scruffy small-time crooks finding unexpected communal purpose and domesticity."},
      {"titolo": "Mondays in the Sun", "anno": 2002, "country": "Spain", "lang": "Spanish", "perche": "Unemployed dockers holding onto sardonic camaraderie and pride amid economic stagnation."},
      {"titolo": "Son of the Bride", "anno": 2001, "country": "Argentina", "lang": "Spanish", "perche": "Warm, bittersweet comedic reconciliation confronting life's frantic pace with open-hearted humility."}
    ]
  },

  # Seed 7: tv:65708 Taboo (2017)
  {
    "seed": "tv:65708",
    "meta": {"titolo": "Taboo", "anno": 2017},
    "suggerimenti": [
      {"titolo": "The North Water", "anno": 2021, "country": "UK", "lang": "English", "perche": "Savage, frostbitten moral depravity and primal brutality in the Arctic wastes."},
      {"titolo": "Ripper Street", "anno": 2012, "country": "UK", "lang": "English", "perche": "Grimy Whitechapel procedural steeped in Victorian trauma, corruption, and physical brutality."},
      {"titolo": "Macbeth", "anno": 2015, "country": "UK", "lang": "English", "perche": "Murky, mud-spattered psychological torment and relentless medieval bloodlust."},
      {"titolo": "A Field in England", "anno": 2013, "country": "UK", "lang": "English", "perche": "Psychedelic, occult English Civil War madness dripping with soil and paranoia."},
      {"titolo": "Witchfinder General", "anno": 1968, "country": "UK", "lang": "English", "perche": "Sadistic rural terror and unsparing cruelty exploiting religious frenzy."},
      {"titolo": "Ravenous", "anno": 1999, "country": "UK", "lang": "English", "perche": "Darkly eccentric, cannibalistic wilderness dread exposing the ravenous rot of empire."},
      {"titolo": "Deadwood", "anno": 2004, "country": "US", "lang": "English", "perche": "Muddy frontier savagery, institutional corruption, and Shakespearean grit."},
      {"titolo": "Black Sails", "anno": 2014, "country": "US", "lang": "English", "perche": "Ruthless, cerebral antiheroes waging war against the hypocritical grip of empire."},
      {"titolo": "Sleepy Hollow", "anno": 1999, "country": "US", "lang": "English", "perche": "Muddy, autumnal gothic dread steeped in decapitations, witchcraft, and colonial rot."},
      {"titolo": "Gangs of New York", "anno": 2002, "country": "US", "lang": "English", "perche": "Savage, blood-spattered tribal warfare and filthy 19th-century political rot."},
      {"titolo": "The Terror", "anno": 2018, "country": "US", "lang": "English", "perche": "Slow-burning gothic dread blending imperial arrogance with an ancient predator."},
      {"titolo": "Aguirre, the Wrath of God", "anno": 1972, "country": "Germany", "lang": "German", "perche": "Delusional colonial rapacity descending into feverish madness and primeval doom."},
      {"titolo": "Perfume: The Story of a Murderer", "anno": 2006, "country": "Germany", "lang": "English", "perche": "Tactile, olfactory obsession and squalid 18th-century moral putrefaction."},
      {"titolo": "Brotherhood of the Wolf", "anno": 2001, "country": "France", "lang": "French", "perche": "Lavish, muddy period conspiracy blending occult savagery with royal corruption."},
      {"titolo": "Il racconto dei racconti", "anno": 2015, "country": "Italy", "lang": "English", "perche": "Baroque, flesh-crawling macabre folklore soaked in earthy obsessions."},
      {"titolo": "The Proposition", "anno": 2005, "country": "Australia", "lang": "English", "perche": "Sweaty, blood-soaked colonial reckoning steeped in biblical fatalism and brutality."},
      {"titolo": "Onibaba", "anno": 1964, "country": "Japan", "lang": "Japanese", "perche": "Swampy, animalistic survival, festering guilt, and demonic retribution amidst reeds."},
      {"titolo": "Hard to Be a God", "anno": 2013, "country": "Russia", "lang": "Russian", "perche": "Visceral, mud-drenched squalor and unceasing sensory disgust in a medieval purgatory."},
      {"titolo": "The Devil's Bath", "anno": 2024, "country": "Austria", "lang": "German", "perche": "Bleak historical depression and claustrophobic rural superstition."},
      {"titolo": "From Hell", "anno": 2001, "country": "US", "lang": "English", "perche": "Opium-hazed, conspiratorial Victorian nightmare exploring sinister aristocratic depravity."}
    ]
  },

  # Seed 8: movie:140300 Kung Fu Panda 3 (2016)
  {
    "seed": "movie:140300",
    "meta": {"titolo": "Kung Fu Panda 3", "anno": 2016},
    "suggerimenti": [
      {"titolo": "Kung Fu Hustle", "anno": 2004, "country": "Hong Kong", "lang": "Cantonese", "perche": "Exuberant cartoonish slapstick effortlessly fusing Looney Tunes comedy with martial-arts glory."},
      {"titolo": "Project A", "anno": 1983, "country": "Hong Kong", "lang": "Cantonese", "perche": "Ingenious physical acrobatics, joyful comedic rhythm, and thrilling stunt choreography."},
      {"titolo": "Shaolin Soccer", "anno": 2001, "country": "Hong Kong", "lang": "Cantonese", "perche": "Ridiculous, feel-good athletic absurdity blending superhuman martial arts with pure optimism."},
      {"titolo": "Drunken Master", "anno": 1978, "country": "Hong Kong", "lang": "Cantonese", "perche": "Endearing comedic training rituals, irreverent cheekiness, and masterful physical combat."},
      {"titolo": "The 36th Chamber of Shaolin", "anno": 1978, "country": "Hong Kong", "lang": "Cantonese", "perche": "Exhilarating training sequences celebrating perseverance, inner strength, and martial mastery."},
      {"titolo": "Spider-Man: Into the Spider-Verse", "anno": 2018, "country": "US", "lang": "English", "perche": "Kinetic visual ecstasy, sincere family heart, and finding one's unique identity."},
      {"titolo": "The Mitchells vs. the Machines", "anno": 2021, "country": "US", "lang": "English", "perche": "Hyperactive, warmhearted visual madness celebrating weird family bonds with hilarious energy."},
      {"titolo": "The Karate Kid", "anno": 1984, "country": "US", "lang": "English", "perche": "Sincere mentor-student bond, earnest emotional heart, and triumphant personal growth."},
      {"titolo": "Big Hero 6", "anno": 2014, "country": "US", "lang": "English", "perche": "Vibrant superhero antics, warm cuddly companionship, and heartfelt emotional healing."},
      {"titolo": "The Iron Giant", "anno": 1999, "country": "US", "lang": "English", "perche": "Sincere, tender friendship, moral courage, and choosing who you want to be."},
      {"titolo": "Kubo and the Two Strings", "anno": 2016, "country": "US", "lang": "English", "perche": "Visually breathtaking quest balancing magical adventure with poignant family legacy."},
      {"titolo": "Paddington 2", "anno": 2017, "country": "UK", "lang": "English", "perche": "Wholesome, impeccably timed physical comedy radiating boundless kindness and sunny warmth."},
      {"titolo": "Wallace & Gromit: The Curse of the Were-Rabbit", "anno": 2005, "country": "UK", "lang": "English", "perche": "Meticulous slapstick genius, endearing eccentric warmth, and inventive visual puns."},
      {"titolo": "The Pirates! In an Adventure with Scientists!", "anno": 2012, "country": "UK", "lang": "English", "perche": "Cheerful stop-motion silliness driven by enthusiastic, misguided camaraderie."},
      {"titolo": "Redline", "anno": 2009, "country": "Japan", "lang": "Japanese", "perche": "Pure kineticism, exuberant hand-drawn visual adrenaline, and unabashed cool."},
      {"titolo": "Lupin III: The Castle of Cagliostro", "anno": 1979, "country": "Japan", "lang": "Japanese", "perche": "Delightful swashbuckling acrobatics, warm roguish charm, and infectious comedic momentum."},
      {"titolo": "Ponyo", "anno": 2008, "country": "Japan", "lang": "Japanese", "perche": "Pure, bubbly childhood exuberance and magnificent hand-crafted magical delight."},
      {"titolo": "The Legend of Hei", "anno": 2019, "country": "China", "lang": "Mandarin", "perche": "Fluid martial-arts animation exploring peaceful coexistence with endearing charm."},
      {"titolo": "Astérix et Cléopâtre", "anno": 1968, "country": "France", "lang": "French", "perche": "Joyful, punchy slapstick humor and irreverent ancient historical adventure."},
      {"titolo": "Song of the Sea", "anno": 2014, "country": "Ireland", "lang": "English", "perche": "Lyrical, visually splendid folklore adventure brimming with tender sibling reconciliation."}
    ]
  },

  # Seed 9: tv:83659 Guillermo del Toro's Cabinet of Curiosities (2022)
  {
    "seed": "tv:83659",
    "meta": {"titolo": "Guillermo del Toro's Cabinet of Curiosities", "anno": 2022},
    "suggerimenti": [
      {"titolo": "Tales from the Crypt", "anno": 1972, "country": "UK", "lang": "English", "perche": "Chilly, dignified British gothic anthology delivering ironic poetic justice and doom."},
      {"titolo": "Dead of Night", "anno": 1945, "country": "UK", "lang": "English", "perche": "Creeping psychological dread and uncanny portmanteau nightmares."},
      {"titolo": "The Company of Wolves", "anno": 1984, "country": "UK", "lang": "English", "perche": "Sensuous, hallucinatory gothic fairy tale teeming with visceral metamorphic beastliness."},
      {"titolo": "The Masque of the Red Death", "anno": 1964, "country": "UK", "lang": "English", "perche": "Decadent, satanic castle horror bathed in surreal primary colors and doom."},
      {"titolo": "Gothic", "anno": 1986, "country": "UK", "lang": "English", "perche": "Hallucinatory fever-dream delving into the monstrous subconscious of literary creation."},
      {"titolo": "Creepshow", "anno": 1982, "country": "US", "lang": "English", "perche": "Vivid macabre morality anthology bursting with playful practical ghastliness."},
      {"titolo": "Masters of Horror", "anno": 2005, "country": "US", "lang": "English", "perche": "Visceral, uninhibited auteur-driven anthology exploring diverse realms of terror."},
      {"titolo": "Trick 'r Treat", "anno": 2007, "country": "US", "lang": "English", "perche": "Lovingly crafted Halloween fable balancing dark comedy with creature terror."},
      {"titolo": "The Empty Man", "anno": 2020, "country": "US", "lang": "English", "perche": "Meticulous cosmic-horror dread peeling back layers of occult philosophical rot."},
      {"titolo": "Night Gallery", "anno": 1969, "country": "US", "lang": "English", "perche": "Macabre, art-inspired television anthology delivering eerie twilight chills and supernatural twists."},
      {"titolo": "Cat's Eye", "anno": 1985, "country": "US", "lang": "English", "perche": "Playful, suspenseful creature anthology guided by an observant stray cat."},
      {"titolo": "Black Sabbath", "anno": 1963, "country": "Italy", "lang": "Italian", "perche": "Sumptuous, atmospheric gothic anthology dripping with lurid color and dread."},
      {"titolo": "Suspiria", "anno": 1977, "country": "Italy", "lang": "Italian", "perche": "Delirious technicolor witchcraft nightmare driven by operatic baroque dread and score."},
      {"titolo": "Spirits of the Dead", "anno": 1968, "country": "France", "lang": "French", "perche": "Baroque Edgar Allan Poe adaptations saturated with decadent, obsessive macabre flair."},
      {"titolo": "The City of Lost Children", "anno": 1995, "country": "France", "lang": "French", "perche": "Dark, steampunk fairy-tale grotesque teeming with tactile inventions and melancholia."},
      {"titolo": "Kwaidan", "anno": 1964, "country": "Japan", "lang": "Japanese", "perche": "Painterly ghost anthology suffused with eerie traditional folklore."},
      {"titolo": "The Hourglass Sanatorium", "anno": 1973, "country": "Poland", "lang": "Polish", "perche": "Labyrinthine visual reverie exploring decaying memories, ghosts, and mortality."},
      {"titolo": "Valerie and Her Week of Wonders", "anno": 1970, "country": "Czechoslovakia", "lang": "Czech", "perche": "Lyrical, gothic surrealist fairy tale blending eerie folklore with sensual awakening."},
      {"titolo": "The Fall", "anno": 2006, "country": "India", "lang": "English", "perche": "Lavish, baroque visual storytelling weaving tragic grief into fantastical myth."},
      {"titolo": "Viy", "anno": 1967, "country": "USSR", "lang": "Russian", "perche": "Atmospheric folk horror teeming with witches, demons, and practical creature effects."}
    ]
  },

  # Seed 10: movie:595 Il buio oltre la siepe (1962)
  {
    "seed": "movie:595",
    "meta": {"titolo": "Il buio oltre la siepe", "anno": 1962},
    "suggerimenti": [
      {"titolo": "Stand by Me", "anno": 1986, "country": "US", "lang": "English", "perche": "Bittersweet, nostalgic childhood bond confronting mortality and the loss of innocence."},
      {"titolo": "Mud", "anno": 2012, "country": "US", "lang": "English", "perche": "Lyrical Southern river fable exploring youthful disillusionment and flawed moral codes."},
      {"titolo": "The Night of the Hunter", "anno": 1955, "country": "US", "lang": "English", "perche": "Dreamlike fairy-tale innocence shadowed by menacing evil and saved by grace."},
      {"titolo": "In the Heat of the Night", "anno": 1967, "country": "US", "lang": "English", "perche": "Tense, dignified moral confrontation against entrenched racial prejudice in the South."},
      {"titolo": "Places in the Heart", "anno": 1984, "country": "US", "lang": "English", "perche": "Quiet resilience, communal grace, and moral endurance amidst Great Depression hardship."},
      {"titolo": "The Grapes of Wrath", "anno": 1940, "country": "US", "lang": "English", "perche": "Solemn, compassionate moral dignity in the face of systemic exploitation and displacement."},
      {"titolo": "Whistle Down the Wind", "anno": 1961, "country": "UK", "lang": "English", "perche": "Poignant, naive childhood faith mistaking an escaped convict for a savior."},
      {"titolo": "Kes", "anno": 1969, "country": "UK", "lang": "English", "perche": "Heartbreaking portrait of a neglected boy finding solace and dignity in nature."},
      {"titolo": "Great Expectations", "anno": 1946, "country": "UK", "lang": "English", "perche": "Atmospheric, moral coming-of-age exploring conscience, class, and mysterious childhood encounters."},
      {"titolo": "Nuovo Cinema Paradiso", "anno": 1988, "country": "Italy", "lang": "Italian", "perche": "Nostalgic, tender tribute to childhood mentorship, innocence, and bittersweet passage of time."},
      {"titolo": "L'albero degli zoccoli", "anno": 1978, "country": "Italy", "lang": "Italian", "perche": "Dignified, luminous, and deeply empathetic portrait of impoverished peasant life."},
      {"titolo": "Io non ho paura", "anno": 2003, "country": "Italy", "lang": "Italian", "perche": "Sun-drenched childhood innocence colliding with shocking adult cruelty and moral choice."},
      {"titolo": "Cría cuervos...", "anno": 1976, "country": "Spain", "lang": "Spanish", "perche": "Haunting gaze into a child's interior world of grief and rebellion."},
      {"titolo": "A Monster Calls", "anno": 2016, "country": "Spain", "lang": "English", "perche": "Gentle, profound exploration of childhood grief, moral complexity, and emotional truth."},
      {"titolo": "Mitt liv som hund", "anno": 1985, "country": "Sweden", "lang": "Swedish", "perche": "Warm, eccentric, bittersweet coping with maternal illness and childhood displacement."},
      {"titolo": "Pather Panchali", "anno": 1955, "country": "India", "lang": "Bengali", "perche": "Lyrical, deeply compassionate gaze on impoverished childhood wonder and family grief."},
      {"titolo": "A Brighter Summer Day", "anno": 1991, "country": "Taiwan", "lang": "Mandarin", "perche": "Epic, melancholic coming-of-age observing youth crushed by social and political pressures."},
      {"titolo": "The White Ribbon", "anno": 2009, "country": "Germany", "lang": "German", "perche": "Austere examination of moral hypocrisy and childhood innocence curdled by authoritarianism."},
      {"titolo": "Poetry", "anno": 2010, "country": "South Korea", "lang": "Korean", "perche": "Quiet moral decency confronting shocking callousness with transcendent grace."},
      {"titolo": "Au revoir les enfants", "anno": 1987, "country": "France", "lang": "French", "perche": "Delicate childhood camaraderie shadowed by quiet moral courage and tragic betrayal."}
    ]
  },

  # Seed 11: movie:316029 The Greatest Showman (2017)
  {
    "seed": "movie:316029",
    "meta": {"titolo": "The Greatest Showman", "anno": 2017},
    "suggerimenti": [
      {"titolo": "Hairspray", "anno": 2007, "country": "US", "lang": "English", "perche": "Infectious, joyous musical energy championing inclusivity and defying prejudice with song."},
      {"titolo": "La La Land", "anno": 2016, "country": "US", "lang": "English", "perche": "Romantic contemporary nostalgia paying luminous homage to dreams and showmanship."},
      {"titolo": "Singin' in the Rain", "anno": 1952, "country": "US", "lang": "English", "perche": "Pure, radiant cinematic joy celebrating the exuberant magic of performance."},
      {"titolo": "All That Jazz", "anno": 1979, "country": "US", "lang": "English", "perche": "Electric showmanship confronting mortal limits with sensational choreographic fervor."},
      {"titolo": "Footloose", "anno": 1984, "country": "US", "lang": "English", "perche": "Earnest, high-energy anthemic rebellion celebrating the liberating ecstasy of dance."},
      {"titolo": "Moulin Rouge!", "anno": 2001, "country": "Australia", "lang": "English", "perche": "Dizzying pop-operatic spectacle celebrating bohemian love and theatrical excess."},
      {"titolo": "Strictly Ballroom", "anno": 1992, "country": "Australia", "lang": "English", "perche": "Glittering romantic triumph celebrating individual expression against stifling tradition."},
      {"titolo": "Rocketman", "anno": 2019, "country": "UK", "lang": "English", "perche": "Flamboyant musical journey exploring pain, performance, and radiant self-acceptance."},
      {"titolo": "Mamma Mia!", "anno": 2008, "country": "UK", "lang": "English", "perche": "Unapologetically sunny, joyous escapism packed with infectious pop euphoria."},
      {"titolo": "Oliver!", "anno": 1968, "country": "UK", "lang": "English", "perche": "Lavish Dickensian spectacle filled with buoyant show-stopping choral energy."},
      {"titolo": "Les Demoiselles de Rochefort", "anno": 1967, "country": "France", "lang": "French", "perche": "Pastel-colored musical euphoria brimming with infectious romantic idealism."},
      {"titolo": "Les Parapluies de Cherbourg", "anno": 1964, "country": "France", "lang": "French", "perche": "Operatic, candy-colored emotional melodrama where every word sings with aching romance."},
      {"titolo": "Lagaan", "anno": 2001, "country": "India", "lang": "Hindi", "perche": "Sweeping, euphoric musical spectacle uniting underdogs in triumphant collective spirit."},
      {"titolo": "Om Shanti Om", "anno": 2007, "country": "India", "lang": "Hindi", "perche": "Lavish Bollywood melodrama celebrating reincarnation, cinema, and pure showbiz romance."},
      {"titolo": "Memories of Matsuko", "anno": 2006, "country": "Japan", "lang": "Japanese", "perche": "Hyper-saturated musical melodrama transforming suffering into dizzying visual showmanship."},
      {"titolo": "Swing Girls", "anno": 2004, "country": "Japan", "lang": "Japanese", "perche": "Infectious musical joy watching unlikely schoolgirls master big-band jazz."},
      {"titolo": "Sing Street", "anno": 2016, "country": "Ireland", "lang": "English", "perche": "Irresistibly catchy pop-rock idealism fueled by youthful romantic ambition."},
      {"titolo": "Der blaue Engel", "anno": 1930, "country": "Germany", "lang": "German", "perche": "Alluring, theatrical cabaret magnetism and dramatic downfall."},
      {"titolo": "¡Ay, Carmela!", "anno": 1990, "country": "Spain", "lang": "Spanish", "perche": "Bittersweet theatrical variety-act performance navigating wartime danger with heart."},
      {"titolo": "Limonádový Joe", "anno": 1964, "country": "Czechoslovakia", "lang": "Czech", "perche": "Campy musical western parody bursting with theatrical soda-pop showmanship."}
    ]
  },

  # Seed 12: tv:1104 Mad Men (2007)
  {
    "seed": "tv:1104",
    "meta": {"titolo": "Mad Men", "anno": 2007},
    "suggerimenti": [
      {"titolo": "Revolutionary Road", "anno": 2008, "country": "UK", "lang": "English", "perche": "Brutal mid-century suburban despair shattering romantic illusions of uniqueness."},
      {"titolo": "The Crown", "anno": 2016, "country": "UK", "lang": "English", "perche": "Stately, stifling sacrifice of personal identity to institutional duty and prestige."},
      {"titolo": "The Servant", "anno": 1963, "country": "UK", "lang": "English", "perche": "Claustrophobic psychological power shifts undermining aristocratic British complacency."},
      {"titolo": "A Single Man", "anno": 2009, "country": "UK", "lang": "English", "perche": "Immaculate mid-century aesthetic grief mourning lost love beneath a tailored facade."},
      {"titolo": "Far from Heaven", "anno": 2002, "country": "US", "lang": "English", "perche": "Lush melodrama exposing the painful repression behind pastel suburban perfection."},
      {"titolo": "Sweet Smell of Success", "anno": 1957, "country": "US", "lang": "English", "perche": "Razor-sharp media manipulation and nocturnal moral rot in Manhattan."},
      {"titolo": "The Graduate", "anno": 1967, "country": "US", "lang": "English", "perche": "Alienated bourgeois disillusionment and existential dread beneath sunny Californian affluence."},
      {"titolo": "Network", "anno": 1976, "country": "US", "lang": "English", "perche": "Acerbic, prophetic satire dissecting corporate commodification of human emotion."},
      {"titolo": "Succession", "anno": 2018, "country": "US", "lang": "English", "perche": "Caustic, tragicomic dissection of corporate cruelty, emotional hollows, and dynastic betrayal."},
      {"titolo": "All About Eve", "anno": 1950, "country": "US", "lang": "English", "perche": "Sophisticated, venomous backstage wit dissecting ambition, aging, and performative glamour."},
      {"titolo": "Le Feu follet", "anno": 1963, "country": "France", "lang": "French", "perche": "Heartbreaking portrait of aristocratic exhaustion and terminal existential alienation."},
      {"titolo": "Belle de Jour", "anno": 1967, "country": "France", "lang": "French", "perche": "Impeccably chic, coolly surreal exploration of bourgeois repression and erotic detachment."},
      {"titolo": "Il sorpasso", "anno": 1962, "country": "Italy", "lang": "Italian", "perche": "Tragicomic mid-century Italian boom masking superficial emptiness and sudden mortality."},
      {"titolo": "La grande bellezza", "anno": 2013, "country": "Italy", "lang": "Italian", "perche": "Melancholic meditation on superficial worldly success, aging, and lost innocence."},
      {"titolo": "Floating Clouds", "anno": 1955, "country": "Japan", "lang": "Japanese", "perche": "Weary emotional entanglements and existential disillusionment in post-war society."},
      {"titolo": "Drive My Car", "anno": 2021, "country": "Japan", "lang": "Japanese", "perche": "Quiet, contemplative grief, unspoken truths, and shared human healing through art."},
      {"titolo": "In the Mood for Love", "anno": 2000, "country": "Hong Kong", "lang": "Cantonese", "perche": "Aching emotional restraint and smoldering unspoken longing draped in elegant fabrics."},
      {"titolo": "Die bitteren Tränen der Petra von Kant", "anno": 1972, "country": "Germany", "lang": "German", "perche": "Claustrophobic, highly stylized emotional exploitation in a lavish high-fashion cocoon."},
      {"titolo": "Scener ur ett äktenskap", "anno": 1973, "country": "Sweden", "lang": "Swedish", "perche": "Unsparing dissection of bourgeois marital disintegration and emotional evasion."},
      {"titolo": "Hable con ella", "anno": 2002, "country": "Spain", "lang": "Spanish", "perche": "Lyrical, melancholic exploration of loneliness, intimacy, and unspoken devotion."}
    ]
  },

  # Seed 13: movie:505600 La rivincita delle sfigate (Booksmart) (2019)
  {
    "seed": "movie:505600",
    "meta": {"titolo": "La rivincita delle sfigate", "anno": 2019},
    "suggerimenti": [
      {"titolo": "Superbad", "anno": 2007, "country": "US", "lang": "English", "perche": "Vulgar yet tender male friendship navigating a chaotic last-gasp party night."},
      {"titolo": "Lady Bird", "anno": 2017, "country": "US", "lang": "English", "perche": "Sharp, funny, and empathetic adolescent yearning and identity stumbling."},
      {"titolo": "Clueless", "anno": 1995, "country": "US", "lang": "English", "perche": "Effervescent, razor-sharp Beverly Hills satire anchored by infectious goodness and charm."},
      {"titolo": "Bottoms", "anno": 2023, "country": "US", "lang": "English", "perche": "Unhinged queer high-school farce driven by absurd loser desperation."},
      {"titolo": "Ferris Bueller's Day Off", "anno": 1986, "country": "US", "lang": "English", "perche": "High-velocity celebration of youthful rebellion, friendship, and seizing the day."},
      {"titolo": "Dolemite Is My Name", "anno": 2019, "country": "US", "lang": "English", "perche": "Joyous underdog celebration fueled by unyielding creative camaraderie."},
      {"titolo": "Bend It Like Beckham", "anno": 2002, "country": "UK", "lang": "English", "perche": "Energetic culture-clash comedy anchored by fierce female athletic camaraderie."},
      {"titolo": "Derry Girls", "anno": 2018, "country": "UK", "lang": "English", "perche": "Chaotic, hyper-manic adolescent friendships surviving absurd daily disasters."},
      {"titolo": "Wild Child", "anno": 2008, "country": "UK", "lang": "English", "perche": "Spirited boarding-school fish-out-of-water comedy discovering loyal sisterhood."},
      {"titolo": "Rocks", "anno": 2019, "country": "UK", "lang": "English", "perche": "Vibrant, tender celebration of London teenage girlhood solidarity."},
      {"titolo": "Bande de filles", "anno": 2014, "country": "France", "lang": "French", "perche": "Electric, protective sisterhood finding exhilaration and agency amidst urban constraints."},
      {"titolo": "Les Beaux Gosses", "anno": 2009, "country": "France", "lang": "French", "perche": "Unglamorous, hilariously cringe-inducing adolescent romantic desperation."},
      {"titolo": "Linda Linda Linda", "anno": 2005, "country": "Japan", "lang": "Japanese", "perche": "Affectionate high-school girls bonding over frantic rock-band practice."},
      {"titolo": "Kamikaze Girls", "anno": 2004, "country": "Japan", "lang": "Japanese", "perche": "Stylized, riotous friendship between a Rococo lolita and a biker girl."},
      {"titolo": "The Young Offenders", "anno": 2016, "country": "Ireland", "lang": "English", "perche": "Manic slapstick misadventures of two utterly loyal best friends."},
      {"titolo": "Notte prima degli esami", "anno": 2006, "country": "Italy", "lang": "Italian", "perche": "Hilarious high-school graduation frenzy packed with romantic disasters and camaraderie."},
      {"titolo": "3 bodas de más", "anno": 2013, "country": "Spain", "lang": "Spanish", "perche": "Raucous physical comedy dealing with romantic humiliation and friendship."},
      {"titolo": "Fucking Åmål", "anno": 1998, "country": "Sweden", "lang": "Swedish", "perche": "Tender, fiercely honest, and rebellious small-town teenage romance and friendship."},
      {"titolo": "Sonne und Beton", "anno": 2023, "country": "Germany", "lang": "German", "perche": "Gritty yet darkly comedic teenage misadventure in urban Berlin."},
      {"titolo": "Meatballs", "anno": 1979, "country": "Canada", "lang": "English", "perche": "Scrappy summer-camp comedy driven by underdog camaraderie and heart."}
    ]
  },

  # Seed 14: movie:612 Munich (2005)
  {
    "seed": "movie:612",
    "meta": {"titolo": "Munich", "anno": 2005},
    "suggerimenti": [
      {"titolo": "Zero Dark Thirty", "anno": 2012, "country": "US", "lang": "English", "perche": "Obsessive, clinical manhunt culminating in grim, ambiguous catharsis."},
      {"titolo": "Syriana", "anno": 2005, "country": "US", "lang": "English", "perche": "Cynical geopolitical labyrinth where moral clarity is devoured by greed."},
      {"titolo": "Body of Lies", "anno": 2008, "country": "US", "lang": "English", "perche": "Tense counter-terrorism maneuvering plagued by paranoia and operational deceit."},
      {"titolo": "Night Moves", "anno": 1975, "country": "US", "lang": "English", "perche": "Bleak neo-noir unraveling into moral paralysis and futile pursuit."},
      {"titolo": "Three Days of the Condor", "anno": 1975, "country": "US", "lang": "English", "perche": "Paralyzing, ice-cold intelligence paranoia where trust is fatal."},
      {"titolo": "The Manchurian Candidate", "anno": 1962, "country": "US", "lang": "English", "perche": "Terrifying Cold War psychological conspiracy and weaponized trauma."},
      {"titolo": "Z", "anno": 1969, "country": "France", "lang": "French", "perche": "Pulse-pounding political procedural exposing state-sanctioned murder and fascist rot."},
      {"titolo": "Un prophète", "anno": 2009, "country": "France", "lang": "French", "perche": "Calculating survival and chilling moral hardening inside criminal systems."},
      {"titolo": "L'Armée des ombres", "anno": 1969, "country": "France", "lang": "French", "perche": "Ice-cold French Resistance procedural steeped in grim sacrifice and betrayal."},
      {"titolo": "Carlos", "anno": 2010, "country": "France", "lang": "French", "perche": "Exhaustive chronicle of left-wing terrorism descending into mercenary vanity."},
      {"titolo": "Eye in the Sky", "anno": 2015, "country": "UK", "lang": "English", "perche": "Agonizing moral friction and bureaucratic buck-passing in targeted assassination."},
      {"titolo": "The Constant Gardener", "anno": 2005, "country": "UK", "lang": "English", "perche": "Melancholic conspiratorial inquiry unmasking corporate complicity in human exploitation."},
      {"titolo": "The Offence", "anno": 1973, "country": "UK", "lang": "English", "perche": "Claustrophobic, brutal interrogation exposing a detective's dark, fractured psyche."},
      {"titolo": "Indagine su un cittadino al di sopra di ogni sospetto", "anno": 1970, "country": "Italy", "lang": "Italian", "perche": "Chilling psychological autopsy of authoritarian power, impunity, and moral madness."},
      {"titolo": "Gomorra", "anno": 2008, "country": "Italy", "lang": "Italian", "perche": "Dehumanizing portrait of organized crime devouring everyday life without glamour."},
      {"titolo": "A Bittersweet Life", "anno": 2005, "country": "South Korea", "lang": "Korean", "perche": "Melancholic, stylish vengeance spiraling into existential tragedy and ruin."},
      {"titolo": "Taegukgi", "anno": 2004, "country": "South Korea", "lang": "Korean", "perche": "Visceral brotherly tragedy devoured by ideological wartime brutality."},
      {"titolo": "Der Baader Meinhof Komplex", "anno": 2008, "country": "Germany", "lang": "German", "perche": "Relentless spiral of radical political dogma into bloody terror."},
      {"titolo": "Michael Collins", "anno": 1996, "country": "Ireland", "lang": "English", "perche": "Tragic escalation of guerrilla warfare, assassination squads, and political compromise."},
      {"titolo": "Tengoku to jigoku", "anno": 1963, "country": "Japan", "lang": "Japanese", "perche": "Morally complex procedural examining kidnapping, class resentment, and police precision."}
    ]
  },

  # Seed 15: movie:269 Fino all'ultimo respiro (1960)
  {
    "seed": "movie:269",
    "meta": {"titolo": "Fino all'ultimo respiro", "anno": 1960},
    "suggerimenti": [
      {"titolo": "Tirez sur le pianiste", "anno": 1960, "country": "France", "lang": "French", "perche": "Playful genre deconstruction dancing between slapstick gangster comedy and tragedy."},
      {"titolo": "Cléo de 5 à 7", "anno": 1962, "country": "France", "lang": "French", "perche": "Luminous Parisian drift confronting mortal dread with vibrant sensual immediacy."},
      {"titolo": "La Maman et la Putain", "anno": 1973, "country": "France", "lang": "French", "perche": "Exhaustive post-May '68 romantic cynicism and disillusioned intellectual drift."},
      {"titolo": "Stranger Than Paradise", "anno": 1984, "country": "US", "lang": "English", "perche": "Deadpan, minimalist hipster wanderlust infused with laconic cool and quiet charm."},
      {"titolo": "Shadows", "anno": 1959, "country": "US", "lang": "English", "perche": "Raw, improvisational jazz energy capturing restless Beat-generation youth in Manhattan."},
      {"titolo": "Bonnie and Clyde", "anno": 1967, "country": "US", "lang": "English", "perche": "Glamorous, chaotic countercultural rebellion punctuated by sudden shocks of fatal violence."},
      {"titolo": "Badlands", "anno": 1973, "country": "US", "lang": "English", "perche": "Laconically detached cross-country murder spree narrated with chilling innocence."},
      {"titolo": "Two-Lane Blacktop", "anno": 1971, "country": "US", "lang": "English", "perche": "Existential American road drift driven by laconic highway obsession."},
      {"titolo": "Frances Ha", "anno": 2012, "country": "US", "lang": "English", "perche": "Breezy French New Wave-inspired joyous awkwardness and modern bohemian stumbling."},
      {"titolo": "Performance", "anno": 1970, "country": "UK", "lang": "English", "perche": "Decadent collision of underworld violence, rock-and-roll identity, and bohemian chaos."},
      {"titolo": "A Hard Day's Night", "anno": 1964, "country": "UK", "lang": "English", "perche": "Anarchic cinematic joy propelled by breathless jump cuts and youthful wit."},
      {"titolo": "Withnail and I", "anno": 1987, "country": "UK", "lang": "English", "perche": "Bohemian decay and eloquent, alcohol-fueled disillusionment."},
      {"titolo": "Chungking Express", "anno": 1994, "country": "Hong Kong", "lang": "Cantonese", "perche": "Effervescent romantic yearning radiating breezy pop-music vitality and urban cool."},
      {"titolo": "Fallen Angels", "anno": 1995, "country": "Hong Kong", "lang": "Cantonese", "perche": "Neon-drenched, hyper-kinetic nocturnal longing and effortlessly stylish alienation."},
      {"titolo": "Prima della rivoluzione", "anno": 1964, "country": "Italy", "lang": "Italian", "perche": "Youthful bourgeois anguish caught between romantic passion and political compromise."},
      {"titolo": "I pugni in tasca", "anno": 1965, "country": "Italy", "lang": "Italian", "perche": "Rebellious psychological dynamite exploding claustrophobic family conventions."},
      {"titolo": "Branded to Kill", "anno": 1967, "country": "Japan", "lang": "Japanese", "perche": "Anarchic, absurdist pop-art yakuza satire overflowing with insolent cinematic style."},
      {"titolo": "Youth of the Beast", "anno": 1963, "country": "Japan", "lang": "Japanese", "perche": "Flamboyant hard-boiled coolness bursting with kinetic primary colors."},
      {"titolo": "Sedmikrásky", "anno": 1966, "country": "Czechoslovakia", "lang": "Czech", "perche": "Visually riotous feminist slapstick tearing through bourgeois decorum with glee."},
      {"titolo": "Der amerikanische Freund", "anno": 1977, "country": "Germany", "lang": "German", "perche": "Cool, neon-lit existential neo-noir laced with simmering tension and fatalism."}
    ]
  },

  # Seed 16: movie:162 Edward mani di forbice (1990)
  {
    "seed": "movie:162",
    "meta": {"titolo": "Edward mani di forbice", "anno": 1990},
    "suggerimenti": [
      {"titolo": "The Shape of Water", "anno": 2017, "country": "US", "lang": "English", "perche": "Romantic fable celebrating marginalized souls finding transcendent solace together."},
      {"titolo": "Lemony Snicket's A Series of Unfortunate Events", "anno": 2004, "country": "US", "lang": "English", "perche": "Gothic visual eccentricity laced with deadpan gloom and resilient innocence."},
      {"titolo": "Pleasantville", "anno": 1998, "country": "US", "lang": "English", "perche": "Satire of suburban conformity disrupted by the awakening of vibrant emotion."},
      {"titolo": "A Little Princess", "anno": 1995, "country": "US", "lang": "English", "perche": "Luminous fairy-tale resilience defying cruelty with boundless imagination."},
      {"titolo": "The Green Mile", "anno": 1999, "country": "US", "lang": "English", "perche": "Gentle, supernatural innocence bearing the agonizing weight of human cruelty."},
      {"titolo": "A Girl Walks Home Alone at Night", "anno": 2014, "country": "US", "lang": "Persian", "perche": "Poetic, lonely vampire romance wrapped in black-and-white graphic coolness."},
      {"titolo": "The Elephant Man", "anno": 1980, "country": "UK", "lang": "English", "perche": "Heartbreaking portrait of tender humanity hidden beneath a grotesque exterior."},
      {"titolo": "The Secret Garden", "anno": 1993, "country": "UK", "lang": "English", "perche": "Transformation of emotional sorrow into blossoming wonder and healing."},
      {"titolo": "The Red Shoes", "anno": 1948, "country": "UK", "lang": "English", "perche": "Sumptuous, tragic fairy-tale obsession burning with feverish romantic artistry."},
      {"titolo": "Penelope", "anno": 2006, "country": "UK", "lang": "English", "perche": "Charming fairy tale about self-acceptance breaking through superficial expectations."},
      {"titolo": "MirrorMask", "anno": 2005, "country": "UK", "lang": "English", "perche": "Surreal gothic fantasy exploring guilt, artistic isolation, and reconciliation."},
      {"titolo": "Le Fabuleux Destin d'Amélie Poulain", "anno": 2001, "country": "France", "lang": "French", "perche": "Poetic romantic fable finding extraordinary enchantment in ordinary longing."},
      {"titolo": "La Belle et la Bête", "anno": 1946, "country": "France", "lang": "French", "perche": "Dreamlike visual enchantment radiating tender, melancholic romantic wonder."},
      {"titolo": "El laberinto del fauno", "anno": 2006, "country": "Spain", "lang": "Spanish", "perche": "Aching fairy tale where tragic innocence seeks refuge from cruel reality."},
      {"titolo": "Heavenly Creatures", "anno": 1994, "country": "New Zealand", "lang": "English", "perche": "Baroque adolescent dreamscape isolating two girls from mundane conformity."},
      {"titolo": "Gräns", "anno": 2018, "country": "Sweden", "lang": "Swedish", "perche": "Modern folklore exploring misunderstood outcast identity and primal belonging."},
      {"titolo": "Kimssi pyoryugi", "anno": 2009, "country": "South Korea", "lang": "Korean", "perche": "Touching portrait of isolated outcasts communicating across vast alienation."},
      {"titolo": "Die Blechtrommel", "anno": 1979, "country": "Germany", "lang": "German", "perche": "Surreal fable of an innocent refusing to grow into adult hypocrisy."},
      {"titolo": "Lazzaro felice", "anno": 2018, "country": "Italy", "lang": "Italian", "perche": "Gentle innocence adrift in an uncomprehending, exploitative modern world."},
      {"titolo": "Kikujirô no natsu", "anno": 1999, "country": "Japan", "lang": "Japanese", "perche": "Tender road trip balancing deadpan humor with deep childhood melancholy."}
    ]
  },

  # Seed 17: movie:550988 Free Guy (2021)
  {
    "seed": "movie:550988",
    "meta": {"titolo": "Free Guy - Eroe per gioco", "anno": 2021},
    "suggerimenti": [
      {"titolo": "The Lego Movie", "anno": 2014, "country": "US", "lang": "English", "perche": "Joyous anti-conformist celebration of ordinary creativity and boundless imagination."},
      {"titolo": "Wreck-It Ralph", "anno": 2012, "country": "US", "lang": "English", "perche": "Colorful arcade-game heart exploring an outsider breaking free from programming."},
      {"titolo": "Groundhog Day", "anno": 1993, "country": "US", "lang": "English", "perche": "Cynical routine giving way to generous existential awakening and redemption."},
      {"titolo": "Stranger Than Fiction", "anno": 2006, "country": "US", "lang": "English", "perche": "Existential comedy about a mundane man discovering his life's narrative."},
      {"titolo": "Edge of Tomorrow", "anno": 2014, "country": "US", "lang": "English", "perche": "Video-game respawn mechanics fueled by dark wit and relentless kineticism."},
      {"titolo": "Palm Springs", "anno": 2020, "country": "US", "lang": "English", "perche": "Time-loop malaise transformed by delightfully cynical banter into romantic hope."},
      {"titolo": "Shaun of the Dead", "anno": 2004, "country": "UK", "lang": "English", "perche": "Slacker routine interrupted by apocalyptic absurdity, grounded by loyal friendship."},
      {"titolo": "About Time", "anno": 2013, "country": "UK", "lang": "English", "perche": "Warm sci-fi romance embracing ordinary moments with gentle, sunny gratitude."},
      {"titolo": "Yesterday", "anno": 2019, "country": "UK", "lang": "English", "perche": "Sweet musical fantasy celebrating timeless songs and humble personal integrity."},
      {"titolo": "Summer Wars", "anno": 2009, "country": "Japan", "lang": "Japanese", "perche": "Virtual-world chaos grounded by a heartwarming, chaotic traditional family clan."},
      {"titolo": "Beyond the Infinite Two Minutes", "anno": 2020, "country": "Japan", "lang": "Japanese", "perche": "Ingenious sci-fi delight playing with time loops with infectious enthusiasm."},
      {"titolo": "One Cut of the Dead", "anno": 2017, "country": "Japan", "lang": "Japanese", "perche": "Joyous ode to collaborative filmmaking disguised as chaotic zombie madness."},
      {"titolo": "Micmacs à tire-larigot", "anno": 2009, "country": "France", "lang": "French", "perche": "Inventive slapstick revenge enacted by eccentric misfits with whimsical gadgets."},
      {"titolo": "Tanguy", "anno": 2001, "country": "France", "lang": "French", "perche": "Escalating bourgeois war of attrition fought with polite passive-aggressive smiles."},
      {"titolo": "Non ci resta che piangere", "anno": 1984, "country": "Italy", "lang": "Italian", "perche": "Chaotic time-travel misadventure fueled by spontaneous comic chemistry and panic."},
      {"titolo": "Los cronocrímenes", "anno": 2007, "country": "Spain", "lang": "Spanish", "perche": "Puzzle-box thriller where accidental consequences spiral wildly out of control."},
      {"titolo": "The Dish", "anno": 2000, "country": "Australia", "lang": "English", "perche": "Warm humor celebrating humble underdogs playing a pivotal historical role."},
      {"titolo": "Guo chan Ling Ling Qi", "anno": 1994, "country": "Hong Kong", "lang": "Cantonese", "perche": "Absurdist spy parody anchored by deadpan sincerity and hilarious gadgets."},
      {"titolo": "Lola rennt", "anno": 1998, "country": "Germany", "lang": "German", "perche": "Kinetic video-game structure defying fate through breathless romantic determination."},
      {"titolo": "Zabil jsem Einsteina, pánové", "anno": 1970, "country": "Czechoslovakia", "lang": "Czech", "perche": "Inventive sci-fi comedy playing with timeline paradoxes and futuristic gadgets."}
    ]
  },

  # Seed 18: movie:420809 Maleficent - Signora del male (2019)
  {
    "seed": "movie:420809",
    "meta": {"titolo": "Maleficent - Signora del male", "anno": 2019},
    "suggerimenti": [
      {"titolo": "Snow White and the Huntsman", "anno": 2012, "country": "US", "lang": "English", "perche": "Dark, battle-hardened fairy tale steeped in gothic royal ambition and sorcery."},
      {"titolo": "Legend", "anno": 1985, "country": "US", "lang": "English", "perche": "Lush baroque tapestry contrasting ethereal woodland purity with operatic darkness."},
      {"titolo": "The Dark Crystal", "anno": 1982, "country": "US", "lang": "English", "perche": "Tactile mythic fantasy dripping with alien folklore and ancient prophecies."},
      {"titolo": "Willow", "anno": 1988, "country": "US", "lang": "English", "perche": "High-fantasy adventure defending an innocent child against an imperious sorceress."},
      {"titolo": "Dune", "anno": 2021, "country": "US", "lang": "English", "perche": "Stately, imperious feudal intrigue and majestic elemental spectacle."},
      {"titolo": "The Chronicles of Narnia: The Lion, the Witch and the Wardrobe", "anno": 2005, "country": "UK", "lang": "English", "perche": "Mythic fantasy balancing majestic regal menace with childhood bravery."},
      {"titolo": "Stardust", "anno": 2007, "country": "UK", "lang": "English", "perche": "Lavish swashbuckling fantasy rich in devious witches and royal intrigue."},
      {"titolo": "The Golden Compass", "anno": 2007, "country": "UK", "lang": "English", "perche": "Opulent fantasy dominated by regal, calculating maternal menace."},
      {"titolo": "Faust", "anno": 1926, "country": "Germany", "lang": "German", "perche": "Monumental chiaroscuro fantasy battling for human souls with grand mythical majesty."},
      {"titolo": "Peau d'Âne", "anno": 1970, "country": "France", "lang": "French", "perche": "Surreal fairy-tale grandeur exploring royal taboo with pop-baroque theatricality."},
      {"titolo": "Kamennyy tsvetok", "anno": 1946, "country": "USSR", "lang": "Russian", "perche": "Luminous folk-fantasy spectacle of the regal Mistress of Copper Mountain."},
      {"titolo": "Sadko", "anno": 1953, "country": "USSR", "lang": "Russian", "perche": "Grand mythic voyage filled with magical kingdoms and majestic spirits."},
      {"titolo": "Wo hu cang long", "anno": 2000, "country": "China", "lang": "Mandarin", "perche": "Poetic martial myth steeped in duty, passion, and airborne grace."},
      {"titolo": "Ye yan", "anno": 2006, "country": "China", "lang": "Mandarin", "perche": "Operatic imperial tragedy filled with opulent court intrigue and revenge."},
      {"titolo": "Pinocchio", "anno": 2019, "country": "Italy", "lang": "Italian", "perche": "Earthy, visually sumptuous fairy tale grounded in melancholic peasant folklore."},
      {"titolo": "Ercole alla conquista di Atlantide", "anno": 1961, "country": "Italy", "lang": "Italian", "perche": "Mythic spectacle confronting a ruthless matriarch in an exotic realm."},
      {"titolo": "Die unendliche Geschichte", "anno": 1984, "country": "Germany", "lang": "English", "perche": "Sweeping mythic fantasy fighting against the encroaching void of despair."},
      {"titolo": "Blancanieves", "anno": 2012, "country": "Spain", "lang": "Spanish", "perche": "Gothic melodrama reimagining classic folklore within tragic bullfighting worlds."},
      {"titolo": "Kaguya-hime no Monogatari", "anno": 2013, "country": "Japan", "lang": "Japanese", "perche": "Painterly mythological tragedy exploring earthly beauty and celestial detachment."},
      {"titolo": "Tri orísky pro Popelku", "anno": 1973, "country": "Czechoslovakia", "lang": "Czech", "perche": "Snowy gothic-romantic fairy tale with an assertive, skilled heroine."}
    ]
  },

  # Seed 19: movie:5176 Quel treno per Yuma (2007)
  {
    "seed": "movie:5176",
    "meta": {"titolo": "Quel treno per Yuma", "anno": 2007},
    "suggerimenti": [
      {"titolo": "Unforgiven", "anno": 1992, "country": "US", "lang": "English", "perche": "Bleak Western confronting the terrifying, unglamorous reality of slaughter."},
      {"titolo": "High Noon", "anno": 1952, "country": "US", "lang": "English", "perche": "Agonizing moral crucible of a solitary lawman abandoned by cowardice."},
      {"titolo": "The Wild Bunch", "anno": 1969, "country": "US", "lang": "English", "perche": "Savage, balletic elegy for obsolete outlaws making a final stand."},
      {"titolo": "Hell or High Water", "anno": 2016, "country": "US", "lang": "English", "perche": "Sun-bleached economic fatalism and cat-and-mouse respect in West Texas."},
      {"titolo": "The Outlaw Josey Wales", "anno": 1976, "country": "US", "lang": "English", "perche": "Weary gunfighter seeking peace in a violent, unforgiving post-war wilderness."},
      {"titolo": "No Country for Old Men", "anno": 2007, "country": "US", "lang": "English", "perche": "Pitiless cat-and-mouse pursuit confronting senseless, modern frontier violence."},
      {"titolo": "Il buono, il brutto, il cattivo", "anno": 1966, "country": "Italy", "lang": "Italian", "perche": "Cynical greed and lethal standoffs amid the squalor of war."},
      {"titolo": "Il grande silenzio", "anno": 1968, "country": "Italy", "lang": "Italian", "perche": "Snowbound brutality where ruthless bounty hunters extinguish desperate mercy."},
      {"titolo": "Django", "anno": 1966, "country": "Italy", "lang": "Italian", "perche": "Muddy, gothic frontier savagery anchored by stoic coffin-dragging vengeance."},
      {"titolo": "Yojimbo", "anno": 1961, "country": "Japan", "lang": "Japanese", "perche": "Cynical masterless samurai playing corrupt rival factions against each other."},
      {"titolo": "Seppuku", "anno": 1962, "country": "Japan", "lang": "Japanese", "perche": "Devastating indictment of hypocritical samurai honor steeped in grim defiance."},
      {"titolo": "Daibosatsu tôge", "anno": 1966, "country": "Japan", "lang": "Japanese", "perche": "Nihilistic descent of an amoral master swordsman into bloodthirsty madness."},
      {"titolo": "Le Samouraï", "anno": 1967, "country": "France", "lang": "French", "perche": "Ritualistic code of an isolated hitman facing an inescapable destiny."},
      {"titolo": "Le Cercle Rouge", "anno": 1970, "country": "France", "lang": "French", "perche": "Meticulous underworld heist bound by quiet professionalism and doomed honor."},
      {"titolo": "The Rover", "anno": 2014, "country": "Australia", "lang": "English", "perche": "Uncompromising post-collapse frontier pursuit fueled by cold, desperate vengeance."},
      {"titolo": "Wake in Fright", "anno": 1971, "country": "Australia", "lang": "English", "perche": "Sweaty descent into brutal outback masculinity and psychological breakdown."},
      {"titolo": "Get Carter", "anno": 1971, "country": "UK", "lang": "English", "perche": "Ice-cold underworld vengeance cutting through provincial corruption."},
      {"titolo": "El infierno", "anno": 2010, "country": "Mexico", "lang": "Spanish", "perche": "Devastating portrait of cartel corruption, bleak fatalism, and desperate survival."},
      {"titolo": "Joheunnom nabbeunnom isanghannom", "anno": 2008, "country": "South Korea", "lang": "Korean", "perche": "Kinetic desert chase packed with swaggering outlaws and explosive shootouts."},
      {"titolo": "La isla mínima", "anno": 2014, "country": "Spain", "lang": "Spanish", "perche": "Sun-baked southern neo-noir tracking two ideologically opposed detectives hunting evil."}
    ]
  },

  # Seed 20: tv:4313 Gli amici di papà (1987)
  {
    "seed": "tv:4313",
    "meta": {"titolo": "Gli amici di papà", "anno": 1987},
    "suggerimenti": [
      {"titolo": "Family Ties", "anno": 1982, "country": "US", "lang": "English", "perche": "Affectionate generational clashes wrapped in warm family love and banter."},
      {"titolo": "Growing Pains", "anno": 1985, "country": "US", "lang": "English", "perche": "Comforting suburban family dynamics anchored by loving parental guidance."},
      {"titolo": "The Brady Bunch", "anno": 1969, "country": "US", "lang": "English", "perche": "Cheerful blended-family optimism resolving gentle squabbles with sunny smiles."},
      {"titolo": "Step by Step", "anno": 1991, "country": "US", "lang": "English", "perche": "Sweet blended family navigating growing pains with comedic warmth."},
      {"titolo": "Boy Meets World", "anno": 1993, "country": "US", "lang": "English", "perche": "Sincere coming-of-age life lessons guided by beloved mentors and friendship."},
      {"titolo": "Father Knows Best", "anno": 1954, "country": "US", "lang": "English", "perche": "Idyllic family domesticity dispensing gentle, patient moral wisdom."},
      {"titolo": "The Darling Buds of May", "anno": 1991, "country": "UK", "lang": "English", "perche": "Idyllic rural English warmth and boundless family generosity."},
      {"titolo": "Gavin & Stacey", "anno": 2007, "country": "UK", "lang": "English", "perche": "Heartfelt romantic comedy celebrating eccentric, loving extended families."},
      {"titolo": "All Creatures Great and Small", "anno": 2020, "country": "UK", "lang": "English", "perche": "Gentle Yorkshire veterinary warmth brimming with kindness and community."},
      {"titolo": "Schitt's Creek", "anno": 2015, "country": "Canada", "lang": "English", "perche": "Cynical wealth giving way to genuine, heartwarming family affection."},
      {"titolo": "Kim's Convenience", "anno": 2016, "country": "Canada", "lang": "English", "perche": "Proud immigrant store owners navigating generational differences with love."},
      {"titolo": "Ohayô", "anno": 1959, "country": "Japan", "lang": "Japanese", "perche": "Gentle suburban neighborhood warmth centered on rebellious young brothers."},
      {"titolo": "Tonari no Totoro", "anno": 1988, "country": "Japan", "lang": "Japanese", "perche": "Pure childhood wonder and tender family solidarity during transitions."},
      {"titolo": "Sazae-san", "anno": 1969, "country": "Japan", "lang": "Japanese", "perche": "Wholesome multi-generational family life celebrating simple domestic joys."},
      {"titolo": "I Cesaroni", "anno": 2006, "country": "Italy", "lang": "Italian", "perche": "Good-hearted blended family muddling through chaotic domestic romantic entanglements."},
      {"titolo": "Un medico in famiglia", "anno": 1998, "country": "Italy", "lang": "Italian", "perche": "Affectionate multi-generational Italian household solving life's troubles together."},
      {"titolo": "Le Petit Nicolas", "anno": 2009, "country": "France", "lang": "French", "perche": "Innocent childhood misadventures rendered with sunny nostalgic whimsy and warmth."},
      {"titolo": "Bluey", "anno": 2018, "country": "Australia", "lang": "English", "perche": "Wonderfully empathetic parenting celebrating family joy through imaginative games."},
      {"titolo": "Alla vi barn i Bullerbyn", "anno": 1986, "country": "Sweden", "lang": "Swedish", "perche": "Timeless Scandinavian childhood innocence enjoying simple, idyllic outdoor wonders."},
      {"titolo": "Eungdaphara 1988", "anno": 2015, "country": "South Korea", "lang": "Korean", "perche": "Nostalgic neighborhood community sharing food, tears, and unconditional family support."}
    ]
  }
]

# Validation logic
errors = []

# 1. Total seeds = 20
if len(data) != 20:
    errors.append(f"Expected 20 seeds, got {len(data)}")

all_titles = []
title_counts = {}

for idx, s in enumerate(data):
    seed_key = s["seed"]
    sugg = s["suggerimenti"]
    
    # Check count
    if len(sugg) != 20:
        errors.append(f"Seed {seed_key} has {len(sugg)} suggestions instead of 20")
        
    decades = set()
    non_eng_count = 0
    country_counts = {}
    
    for item in sugg:
        t = item["titolo"]
        yr = item["anno"]
        p = item["perche"]
        c = item.get("country", "")
        l = item.get("lang", "")
        
        # Title record
        all_titles.append(t)
        title_counts[t] = title_counts.get(t, 0) + 1
        
        # Word count check
        words = p.split()
        if len(words) > 12:
            errors.append(f"Perche word count > 12 for '{t}' in {seed_key}: '{p}' ({len(words)} words)")
        if len(words) == 0:
            errors.append(f"Empty perche for '{t}' in {seed_key}")
            
        # Year check
        if not isinstance(yr, int) or yr < 1880 or yr > 2026:
            errors.append(f"Invalid year {yr} for '{t}' in {seed_key}")
            
        dec = yr // 10 * 10
        decades.add(dec)
        
        if l.lower() != "english":
            non_eng_count += 1
            
        country_counts[c] = country_counts.get(c, 0) + 1

    # Check decade variety: >= 4
    if len(decades) < 4:
        errors.append(f"Seed {seed_key} has only {len(decades)} decades: {decades}")
        
    # Check non-English variety: >= 3
    if non_eng_count < 3:
        errors.append(f"Seed {seed_key} has only {non_eng_count} non-English titles")
        
    # Check country variety: <= 6 from same country
    for c, cnt in country_counts.items():
        if cnt > 6:
            errors.append(f"Seed {seed_key} has {cnt} titles from {c} (max 6 allowed)")

# Check across whole file title repeats
repeats = {t: cnt for t, cnt in title_counts.items() if cnt > 1}
if repeats:
    errors.append(f"Duplicate titles found: {repeats}")

print("Validation complete.")
if errors:
    print(f"FAILED with {len(errors)} errors:")
    for e in errors:
        print(" - ", e)
else:
    print("SUCCESS! All 20 seeds and 400 suggestions satisfy all criteria perfectly!")
    print(f"Total unique suggestions: {len(set(all_titles))}")

    # Build final output shape without extra debug fields
    output_data = []
    for s in data:
        output_data.append({
            "seed": s["seed"],
            "suggerimenti": [
                {
                    "titolo": item["titolo"],
                    "anno": item["anno"],
                    "perche": item["perche"]
                }
                for item in s["suggerimenti"]
            ]
        })
    with open(".scratch/banco-casi/risposte-04.json", "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    print("Wrote .scratch/banco-casi/risposte-04.json successfully.")
