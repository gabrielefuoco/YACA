# Tre decision model sui soliti 40 casi

Card latinizzata, candidati mescolati (seme 7), 40 domande `noul`.

## Profilo dei giudici

| modello | mod. p | >0,5 | >0,8 | correlazione con l'ordine del grafo |
|---|---:|---:|---:|---:|
| mammoth | 0.324 | 10 | 2 | +0.330 |
| pplx | 0.643 | 27 | 16 | +0.324 |
| mercury | 0.244 | 8 | 4 | +0.349 |
| span | 0.366 | 14 | 8 | +0.242 |

## Fusione MIX

| modello | μ | top-8 diverso | stabilità |
|---|---:|---:|---:|
| mammoth | 0.5 | 38/40 | 72% |
| mammoth | 0.7 | 40/40 | 60% |
| pplx | 0.5 | 30/40 | 86% |
| pplx | 0.7 | 37/40 | 78% |
| mercury | 0.5 | 39/40 | 62% |
| mercury | 0.7 | 40/40 | 52% |
| span | 0.5 | 40/40 | 68% |
| span | 0.7 | 40/40 | 54% |

## Accordo fra giudici (correlazione di Spearman sulle p)

| | mammoth | pplx | mercury | span |
|---|---:|---:|---:|---:|
| **mammoth** | +1.00 | +0.84 | +0.79 | +0.67 |
| **pplx** | +0.84 | +1.00 | +0.79 | +0.60 |
| **mercury** | +0.79 | +0.79 | +1.00 | +0.78 |
| **span** | +0.67 | +0.60 | +0.78 | +1.00 |

## I 40 casi (MIX μ=0,5)


### Barbie — `movie:346698`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Asteroid City | Asteroid City | Everything Everywhere All at Once | Dungeons & Dragons - L'onore dei ladri | Asteroid City |
| 2 | Everything Everywhere All at Once | Dungeons & Dragons - L'onore dei ladri | Asteroid City | Povere creature! | Il gatto con gli stivali 2 - L'ultimo desiderio |
| 3 | Gli spiriti dell'isola | Povere creature! | Super Mario Bros. Il Film | Triangle of Sadness | Dungeons & Dragons - L'onore dei ladri |
| 4 | The Fabelmans | Everything Everywhere All at Once | Dungeons & Dragons - L'onore dei ladri | Asteroid City | Glass Onion - Knives Out |
| 5 | Il gatto con gli stivali 2 - L'ultimo desiderio | Marcel The Shell | Crudelia | Everything Everywhere All at Once | Marcel The Shell |
| 6 | Spider-Man: Across the Spider-Verse | Triangle of Sadness | Povere creature! | Super Mario Bros. Il Film | Povere creature! |
| 7 | Glass Onion - Knives Out | Don't Look Up | Spider-Man: Across the Spider-Verse | Gli spiriti dell'isola | Everything Everywhere All at Once |
| 8 | Super Mario Bros. Il Film | Glass Onion - Knives Out | Don't Look Up | Don't Look Up | Triangle of Sadness |

### Drive — `movie:64690`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Baby Driver - Il genio della fuga | Lo sciacallo - Nightcrawler | Lo sciacallo - Nightcrawler | Baby Driver - Il genio della fuga | Lo sciacallo - Nightcrawler |
| 2 | Lo sciacallo - Nightcrawler | Baby Driver - Il genio della fuga | Baby Driver - Il genio della fuga | Lo sciacallo - Nightcrawler | The Town |
| 3 | Non è un paese per vecchi | Solo Dio perdona | Non è un paese per vecchi | The Town | Taxi Driver |
| 4 | The Town | Non è un paese per vecchi | The Town | Prisoners | Prisoners |
| 5 | Taxi Driver | Sicario | Sicario | Non è un paese per vecchi | Collateral |
| 6 | Sicario | The Town | Prisoners | Solo Dio perdona | Solo Dio perdona |
| 7 | L'amore bugiardo - Gone Girl | Taxi Driver | Taxi Driver | Sicario | Non è un paese per vecchi |
| 8 | Il petroliere | Prisoners | Collateral | L'autista | Come un tuono |

### Mad Max: Fury Road — `movie:76341`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Edge of Tomorrow - Senza domani | Edge of Tomorrow - Senza domani | Edge of Tomorrow - Senza domani | Mad Max - Oltre la sfera del tuono | Edge of Tomorrow - Senza domani |
| 2 | Mad Max - Oltre la sfera del tuono | Mad Max - Oltre la sfera del tuono | Mad Max - Oltre la sfera del tuono | Edge of Tomorrow - Senza domani | Mad Max - Oltre la sfera del tuono |
| 3 | Interceptor - Il guerriero della strada | Interceptor - Il guerriero della strada | Interceptor - Il guerriero della strada | Ready Player One | Interceptor - Il guerriero della strada |
| 4 | Interceptor | Interceptor | Interceptor | I figli degli uomini | Interceptor |
| 5 | Interstellar | Snowpiercer | Matrix | Hunger Games: La ragazza di fuoco | Snowpiercer |
| 6 | Matrix | Dredd - Il giudice dell'apocalisse | Sopravvissuto - The Martian | Dredd - Il giudice dell'apocalisse | Codice Genesi |
| 7 | Sopravvissuto - The Martian | Matrix | Interstellar | Hunger Games | Dredd - Il giudice dell'apocalisse |
| 8 | Snowpiercer | Blade Runner 2049 | Snowpiercer | Interceptor | Pacific Rim |

### Inception — `movie:27205`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Interstellar | Interstellar | Interstellar | Interstellar | Interstellar |
| 2 | The Prestige | The Prestige | The Prestige | Tenet | Tenet |
| 3 | Tenet | Tenet | Tenet | The Prestige | The Prestige |
| 4 | Shutter Island | Matrix | Shutter Island | Matrix | Matrix |
| 5 | Avatar | Memento | Matrix | Il cavaliere oscuro | Il cavaliere oscuro - Il ritorno |
| 6 | Matrix | Shutter Island | Ex Machina | Minority Report | Shutter Island |
| 7 | Ex Machina | Il cavaliere oscuro | Il cavaliere oscuro - Il ritorno | Il cavaliere oscuro - Il ritorno | Avatar |
| 8 | Il cavaliere oscuro - Il ritorno | Predestination | Il cavaliere oscuro | Matrix Reloaded | Il cavaliere oscuro |

### Nuovo Cinema Paradiso — `movie:11216`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Il cielo sopra Berlino | Il cielo sopra Berlino | Il cielo sopra Berlino | Stardust Memories | Il cielo sopra Berlino |
| 2 | 8½ | 8½ | 8½ | Malèna | Stardust Memories |
| 3 | Stardust Memories | Amarcord | Stardust Memories | The Artist | Camera con vista |
| 4 | Manon delle sorgenti | Malèna | La dolce vita | La rosa purpurea del Cairo | L'insostenibile leggerezza dell'essere |
| 5 | Jean de Florette | Stardust Memories | Malèna | Il cineamatore | Amarcord |
| 6 | La dolce vita | Baarìa | Manon delle sorgenti | Baarìa | Malèna |
| 7 | Il favoloso mondo di Amélie | The Artist | The Artist | Amarcord | Il cineamatore |
| 8 | Malèna | La rosa purpurea del Cairo | La rosa purpurea del Cairo | 8½ | Effetto notte |

### Interstellar — `movie:157336`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Inception | Inception | Inception | Inception | Inception |
| 2 | Arrival | Arrival | Arrival | Arrival | Sopravvissuto - The Martian |
| 3 | Sopravvissuto - The Martian | Sopravvissuto - The Martian | Sopravvissuto - The Martian | Sopravvissuto - The Martian | Arrival |
| 4 | Passengers | Gravity | Passengers | Gravity | Gravity |
| 5 | Gravity | 2001: Odissea nello spazio | Gravity | 2001: Odissea nello spazio | Passengers |
| 6 | Il cavaliere oscuro | Passengers | 2001: Odissea nello spazio | Ad astra | 2001: Odissea nello spazio |
| 7 | Il cavaliere oscuro - Il ritorno | Edge of Tomorrow - Senza domani | Ex Machina | Tenet | Rogue One: A Star Wars Story |
| 8 | Star Trek Beyond | Predestination | Edge of Tomorrow - Senza domani | Dune | Ad astra |

### Jurassic Park — `movie:329`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Il mondo perduto - Jurassic Park | Il mondo perduto - Jurassic Park | Il mondo perduto - Jurassic Park | Il mondo perduto - Jurassic Park | Il mondo perduto - Jurassic Park |
| 2 | Jurassic World | Jurassic World | Jurassic World | Jurassic World | Jurassic World |
| 3 | Jurassic World - Il dominio | Jurassic World - Il dominio | Jurassic World - Il dominio | Jurassic World - Il dominio | Jurassic World - Il dominio |
| 4 | Jurassic World – Il regno distrutto | Jurassic World – Il regno distrutto | Jurassic World – Il regno distrutto | Jurassic World – Il regno distrutto | Jurassic World – Il regno distrutto |
| 5 | E.T. l'extra-terrestre | E.T. l'extra-terrestre | E.T. l'extra-terrestre | E.T. l'extra-terrestre | E.T. l'extra-terrestre |
| 6 | Ritorno al futuro | Ritorno al futuro | Terminator 2 - Il giorno del giudizio | Ritorno al futuro | La guerra dei mondi |
| 7 | Schindler's List | Ready Player One | Ritorno al futuro | Ready Player One | Men in Black |
| 8 | Terminator 2 - Il giorno del giudizio | I predatori dell'arca perduta | I predatori dell'arca perduta | Avatar | Ready Player One |

### Matrix — `movie:603`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Matrix Reloaded | Matrix Reloaded | Matrix Reloaded | Matrix Reloaded | Matrix Reloaded |
| 2 | Matrix Revolutions | Matrix Revolutions | Matrix Revolutions | Matrix Revolutions | Matrix Revolutions |
| 3 | Matrix Resurrections | Matrix Resurrections | Matrix Resurrections | Matrix Resurrections | Matrix Resurrections |
| 4 | Terminator | Terminator | Terminator | Terminator 2 - Il giorno del giudizio | Terminator |
| 5 | Inception | Inception | Inception | Minority Report | Inception |
| 6 | Il quinto elemento | Terminator 2 - Il giorno del giudizio | Terminator 2 - Il giorno del giudizio | Inception | Il quinto elemento |
| 7 | Terminator 2 - Il giorno del giudizio | Blade Runner | Il quinto elemento | Il quinto elemento | Terminator 2 - Il giorno del giudizio |
| 8 | Blade Runner | Minority Report | Blade Runner | Animatrix | Minority Report |

### Scappa - Get Out — `movie:419430`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Noi | Noi | Noi | Noi | Noi |
| 2 | Split | Split | Split | Split | Split |
| 3 | Hereditary - Le radici del male | Hereditary - Le radici del male | Hereditary - Le radici del male | Hereditary - Le radici del male | Hereditary - Le radici del male |
| 4 | A Quiet Place - Un posto tranquillo | L'uomo invisibile | L'uomo invisibile | Midsommar - Il villaggio dei dannati | Midsommar - Il villaggio dei dannati |
| 5 | Midsommar - Il villaggio dei dannati | Midsommar - Il villaggio dei dannati | A Quiet Place - Un posto tranquillo | L'uomo invisibile | L'uomo invisibile |
| 6 | L'uomo invisibile | Nope | Midsommar - Il villaggio dei dannati | Ma | Nope |
| 7 | It Follows | It Follows | Nope | Regali da uno sconosciuto - The Gift | It Follows |
| 8 | Finché morte non ci separi | 10 Cloverfield Lane | It Follows | The Visit | It - Capitolo uno |

### Parasite — `movie:496243`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Joker | Memorie di un assassino | Joker | Burning - L'amore brucia | Joker |
| 2 | Memorie di un assassino | Joker | Memorie di un assassino | Joker | Scappa - Get Out |
| 3 | The Host | Scappa - Get Out | The Host | Un affare di famiglia | C'era una volta a… Hollywood |
| 4 | Madre | Burning - L'amore brucia | Madre | Madre | Old Boy |
| 5 | Scappa - Get Out | Madre | Old Boy | Cena con delitto - Knives Out | Forgotten |
| 6 | Old Boy | Snowpiercer | Okja | Old Boy | Burning - L'amore brucia |
| 7 | Okja | Okja | Scappa - Get Out | Memorie di un assassino | Memorie di un assassino |
| 8 | Diamanti grezzi | Decision to Leave | Burning - L'amore brucia | Scappa - Get Out | Madre |

### 8½ — `movie:422`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | La dolce vita | La dolce vita | La dolce vita | La dolce vita | La dolce vita |
| 2 | I 400 colpi | La strada | La strada | La strada | Le notti di Cabiria |
| 3 | La strada | Le notti di Cabiria | Le notti di Cabiria | Amarcord | Persona |
| 4 | Le notti di Cabiria | Amarcord | Persona | Persona | Amarcord |
| 5 | Ladri di biciclette | Giulietta degli spiriti | I 400 colpi | Giulietta degli spiriti | La strada |
| 6 | Persona | I 400 colpi | Amarcord | Roma | Il settimo sigillo |
| 7 | Amarcord | Persona | Il settimo sigillo | I 400 colpi | Effetto notte |
| 8 | Il settimo sigillo | Roma | Il posto delle fragole | Effetto notte | Roma |

### Seven — `movie:807`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | I soliti sospetti | I soliti sospetti | I soliti sospetti | I soliti sospetti | I soliti sospetti |
| 2 | Il silenzio degli innocenti | Il silenzio degli innocenti | Il silenzio degli innocenti | Il silenzio degli innocenti | Il silenzio degli innocenti |
| 3 | Zodiac | Zodiac | Zodiac | Zodiac | Zodiac |
| 4 | Fight Club | Fight Club | Fight Club | Insomnia | Insomnia |
| 5 | Insomnia | Insomnia | Insomnia | Fight Club | Fight Club |
| 6 | Pulp Fiction | Memento | Memento | Red Dragon | Memento |
| 7 | American History X | The Game - Nessuna regola | Pulp Fiction | Copycat - Omicidi in serie | L'amore bugiardo - Gone Girl |
| 8 | Memento | Pulp Fiction | American History X | Il tocco del male | Red Dragon |

### Il padrino - Parte II — `movie:240`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Il padrino | Il padrino | Il padrino | Il padrino - Parte III | Il padrino |
| 2 | Il padrino - Parte III | Il padrino - Parte III | Il padrino - Parte III | Il padrino | Il padrino - Parte III |
| 3 | Quei bravi ragazzi | Quei bravi ragazzi | Quei bravi ragazzi | Quei bravi ragazzi | Quei bravi ragazzi |
| 4 | Apocalypse Now | Apocalypse Now | Apocalypse Now | C'era una volta in America | Scarface |
| 5 | Scarface | C'era una volta in America | Taxi Driver | Cotton Club | Apocalypse Now |
| 6 | Taxi Driver | The Irishman | Scarface | Apocalypse Now | C'era una volta in America |
| 7 | Qualcuno volò sul nido del cuculo | Chinatown | The Untouchables - Gli intoccabili | Taxi Driver | Donnie Brasco |
| 8 | The Untouchables - Gli intoccabili | Taxi Driver | Qualcuno volò sul nido del cuculo | The Irishman | Taxi Driver |

### Le vite degli altri — `movie:582`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Good Bye, Lenin! | Good Bye, Lenin! | Good Bye, Lenin! | Balloon - Il vento della libertà | Good Bye, Lenin! |
| 2 | Opera senza autore | Opera senza autore | Opera senza autore | Il tunnel | Opera senza autore |
| 3 | La caduta - Gli ultimi giorni di Hitler | La caduta - Gli ultimi giorni di Hitler | La caduta - Gli ultimi giorni di Hitler | Good Bye, Lenin! | La scelta di Barbara |
| 4 | Deutschland | Balloon - Il vento della libertà | Deutschland | Opera senza autore | Balloon - Il vento della libertà |
| 5 | Il pianista | La scelta di Barbara | Balloon - Il vento della libertà | La caduta - Gli ultimi giorni di Hitler | Il tunnel |
| 6 | Balloon - Il vento della libertà | Il tunnel | La scelta di Barbara | La scelta di Barbara | La caduta - Gli ultimi giorni di Hitler |
| 7 | La scelta di Barbara | Deutschland | Il pianista | Deutschland | Il pianista |
| 8 | Il tunnel | Il pianista | Il tunnel | Il pianista | Kleo |

### Il labirinto del fauno — `movie:1417`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | The Prestige | La spina del diavolo | The Prestige | La spina del diavolo | La spina del diavolo |
| 2 | La spina del diavolo | The Prestige | La spina del diavolo | Big Fish - Le storie di una vita incredibile | Donnie Darko |
| 3 | Se mi lasci ti cancello | La forma dell'acqua | Coraline e la porta magica | The Prestige | The Prestige |
| 4 | Donnie Darko | Big Fish - Le storie di una vita incredibile | Miss Peregrine - La casa dei ragazzi speciali | La forma dell'acqua | The Fall |
| 5 | Big Fish - Le storie di una vita incredibile | Pinocchio di Guillermo del Toro | Big Fish - Le storie di una vita incredibile | Coraline e la porta magica | Miss Peregrine - La casa dei ragazzi speciali |
| 6 | Maleficent | Coraline e la porta magica | Donnie Darko | Miss Peregrine - La casa dei ragazzi speciali | MirrorMask |
| 7 | Miss Peregrine - La casa dei ragazzi speciali | La sposa cadavere | La forma dell'acqua | Pinocchio di Guillermo del Toro | Big Fish - Le storie di una vita incredibile |
| 8 | Coraline e la porta magica | The Fall | Stardust | Stardust | Le cronache di Narnia - Il leone, la strega e l'armadio |

### L'odio — `movie:406`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Il profeta | Il profeta | Il profeta | Il profeta | Il profeta |
| 2 | Amores perros | City of God | Amores perros | Irréversible | Tropa de elite - Gli squadroni della morte |
| 3 | La donna che canta | I miserabili | Irréversible | City of God | Boyz n the Hood - Strade violente |
| 4 | Irréversible | Boyz n the Hood - Strade violente | Tropa de elite - Gli squadroni della morte | Tropa de elite - Gli squadroni della morte | Nocturama |
| 5 | Tropa de elite - Gli squadroni della morte | Amores perros | City of God | Boyz n the Hood - Strade violente | I miserabili |
| 6 | Memorie di un assassino | Irréversible | Boyz n the Hood - Strade violente | American History X | City of God |
| 7 | Nemico pubblico n. 1 - L'istinto di morte | Dheepan - Una nuova vita | Nemico pubblico n. 1 - L'istinto di morte | I miserabili | Irréversible |
| 8 | Sin Nombre | Nocturama | I miserabili | Amores perros | Clockers |

### La casa di sabbia e nebbia — `movie:11093`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | In America - Il sogno che non c'era | In America - Il sogno che non c'era | In America - Il sogno che non c'era | In America - Il sogno che non c'era | In America - Il sogno che non c'era |
| 2 | Noi due sconosciuti | Noi due sconosciuti | In the Bedroom | White Oleander - Oleandro bianco | Piccoli affari sporchi |
| 3 | In the Bedroom | In the Bedroom | Piccoli affari sporchi | The Hours | 21 grammi |
| 4 | Piccoli affari sporchi | Piccoli affari sporchi | Noi due sconosciuti | In the Bedroom | The Hours |
| 5 | 21 grammi | 21 grammi | Monster | 21 grammi | Monster's Ball - L'ombra della vita |
| 6 | Monster | Monster | The Hours | Piccoli affari sporchi | Maria Full of Grace |
| 7 | Kinsey - E ora parliamo di sesso... | The Hours | 21 grammi | Noi due sconosciuti | La sicurezza degli oggetti |
| 8 | The Hours | Monster's Ball - L'ombra della vita | Maria Full of Grace | Off the Map | Noi due sconosciuti |

### Melancholia — `movie:62215`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Antichrist | Antichrist | Antichrist | Antichrist | Antichrist |
| 2 | Nymphomaniac - Volume 2 | Nymphomaniac - Volume 2 | Nymphomaniac - Volume 2 | Nymphomaniac - Volume 2 | Nymphomaniac - Volume 2 |
| 3 | Dogville | Dogville | Dogville | Dogville | Under the Skin |
| 4 | Under the Skin | Under the Skin | Under the Skin | Dancer in the Dark | The Tree of Life |
| 5 | The Tree of Life | Synecdoche, New York | Synecdoche, New York | Another Earth | Upstream Color |
| 6 | Synecdoche, New York | The Tree of Life | The Tree of Life | Manderlay | Dogville |
| 7 | Enter the Void | Dancer in the Dark | Upstream Color | Under the Skin | Another Earth |
| 8 | Upstream Color | Upstream Color | Dancer in the Dark | Perfect Sense | Take Shelter |

### Under the Skin — `movie:97370`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | The Lobster | Upstream Color | The Lobster | Upstream Color | Upstream Color |
| 2 | Upstream Color | The Lobster | Upstream Color | Melancholia | Melancholia |
| 3 | Melancholia | Melancholia | Melancholia | Ex Machina | Enemy |
| 4 | Enemy | Enemy | Enemy | The Lobster | The Lobster |
| 5 | Il sacrificio del cervo sacro | The Neon Demon | The Neon Demon | High Life | Il sacrificio del cervo sacro |
| 6 | The Master | Il sacrificio del cervo sacro | Il sacrificio del cervo sacro | The Neon Demon | The Neon Demon |
| 7 | The Neon Demon | Coherence - Oltre lo spazio tempo | Il sosia - The Double | Annientamento | Il sosia - The Double |
| 8 | Il sosia - The Double | Saint Maud | Saint Maud | Coherence - Oltre lo spazio tempo | Coherence - Oltre lo spazio tempo |

### Arrival — `movie:329865`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Interstellar | Interstellar | Interstellar | Interstellar | Interstellar |
| 2 | Blade Runner 2049 | Blade Runner 2049 | Blade Runner 2049 | Blade Runner 2049 | Blade Runner 2049 |
| 3 | Sopravvissuto - The Martian | Contact | Sopravvissuto - The Martian | Contact | Contact |
| 4 | Edge of Tomorrow - Senza domani | Ex Machina | Contact | Ex Machina | Ex Machina |
| 5 | Contact | Edge of Tomorrow - Senza domani | Gravity | Sopravvissuto - The Martian | District 9 |
| 6 | Gravity | Sopravvissuto - The Martian | Ex Machina | Midnight Special | Incontri ravvicinati del terzo tipo |
| 7 | Dune | Predestination | Dune | Incontri ravvicinati del terzo tipo | Lei |
| 8 | Rogue One: A Star Wars Story | Incontri ravvicinati del terzo tipo | Edge of Tomorrow - Senza domani | District 9 | Sopravvissuto - The Martian |

### Ex Machina — `movie:264660`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Annientamento | Blade Runner 2049 | Lei | Blade Runner 2049 | Blade Runner 2049 |
| 2 | Lei | Lei | Blade Runner 2049 | Lei | Lei |
| 3 | Blade Runner 2049 | Archive - Non mi lasciare | Annientamento | Morgan | A.I. - Intelligenza Artificiale |
| 4 | Interstellar | The Machine | A.I. - Intelligenza Artificiale | Archive - Non mi lasciare | Archive - Non mi lasciare |
| 5 | A.I. - Intelligenza Artificiale | A.I. - Intelligenza Artificiale | Interstellar | Arrival | Interstellar |
| 6 | The Machine | I Am Mother | The Machine | Eva | Humans |
| 7 | Humandroid | Annientamento | Io, robot | Devs | Annientamento |
| 8 | Io, robot | Arrival | Arrival | I Am Mother | Eva |

### Lei — `movie:152601`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Ex Machina | Ex Machina | Ex Machina | Ex Machina | Ex Machina |
| 2 | Gravity | Equals | Arrival | Equals | Equals |
| 3 | Arrival | Arrival | Interstellar | Blade Runner 2049 | A.I. - Intelligenza Artificiale |
| 4 | Interstellar | Moon | Transcendence | Arrival | Zoe |
| 5 | Upgrade | Blade Runner 2049 | Equals | Moon | Upside Down |
| 6 | Transcendence | Archive - Non mi lasciare | Blade Runner 2049 | Humans | Transcendence |
| 7 | Equals | Zoe | Gravity | Upside Down | Archive - Non mi lasciare |
| 8 | Sopravvissuto - The Martian | Interstellar | Sopravvissuto - The Martian | Archive - Non mi lasciare | Mr. Nobody |

### L'amore bugiardo - Gone Girl — `movie:210577`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Shutter Island | Shutter Island | Shutter Island | Shutter Island | Shutter Island |
| 2 | Prisoners | Prisoners | Prisoners | Prisoners | Prisoners |
| 3 | Fight Club | Lo sciacallo - Nightcrawler | Fight Club | Millennium - Uomini che odiano le donne | Fight Club |
| 4 | Lo sciacallo - Nightcrawler | Memento | Lo sciacallo - Nightcrawler | Memento | Lo sciacallo - Nightcrawler |
| 5 | Millennium - Uomini che odiano le donne | Fight Club | Millennium - Uomini che odiano le donne | The Game - Nessuna regola | Millennium - Uomini che odiano le donne |
| 6 | Memento | Millennium - Uomini che odiano le donne | Memento | Zodiac | Memento |
| 7 | Interstellar | Zodiac | The Game - Nessuna regola | Seven | The Game - Nessuna regola |
| 8 | Birdman o (L'imprevedibile virtù dell'ignoranza) | Seven | Seven | Fight Club | Zodiac |

### Prisoners — `movie:146233`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | L'amore bugiardo - Gone Girl | L'amore bugiardo - Gone Girl | L'amore bugiardo - Gone Girl | L'amore bugiardo - Gone Girl | L'amore bugiardo - Gone Girl |
| 2 | Lo sciacallo - Nightcrawler | Lo sciacallo - Nightcrawler | Lo sciacallo - Nightcrawler | Zodiac | Lo sciacallo - Nightcrawler |
| 3 | Shutter Island | Zodiac | Shutter Island | Lo sciacallo - Nightcrawler | Zodiac |
| 4 | Zodiac | Shutter Island | Zodiac | Shutter Island | Shutter Island |
| 5 | Enemy | Gone Baby Gone | Sicario | Sicario | Memento |
| 6 | Sicario | Sicario | Memento | Changeling | Enemy |
| 7 | Memento | Memento | Enemy | Gone Baby Gone | Drive |
| 8 | Drive | Changeling | Changeling | Insomnia | Gone Baby Gone |

### Lo sciacallo - Nightcrawler — `movie:242582`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | L'amore bugiardo - Gone Girl | Prisoners | L'amore bugiardo - Gone Girl | Prisoners | L'amore bugiardo - Gone Girl |
| 2 | Prisoners | L'amore bugiardo - Gone Girl | Prisoners | L'amore bugiardo - Gone Girl | Prisoners |
| 3 | Drive | Drive | Drive | Drive | Drive |
| 4 | American Psycho | American Psycho | American Psycho | American Psycho | American Psycho |
| 5 | Zodiac | Zodiac | Zodiac | Joker | Zodiac |
| 6 | Memento | Memento | Whiplash | Zodiac | Seven |
| 7 | Whiplash | Seven | Memento | I soliti sospetti | Whiplash |
| 8 | Seven | Whiplash | Fight Club | Fight Club | Joker |

### Sicario — `movie:273481`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Soldado | Soldado | Soldado | Soldado | Soldado |
| 2 | Blade Runner 2049 | I segreti di Wind River | Blade Runner 2049 | I segreti di Wind River | I segreti di Wind River |
| 3 | I segreti di Wind River | Prisoners | I segreti di Wind River | Sabotage | C'era una volta in Messico |
| 4 | John Wick | Blade Runner 2049 | John Wick | Prisoners | Safe House - Nessuno è al sicuro |
| 5 | C'era una volta in Messico | Lo sciacallo - Nightcrawler | Prisoners | Nella tana dei lupi | Jack Ryan - L'iniziazione |
| 6 | Prisoners | Drive | Safe House - Nessuno è al sicuro | The Equalizer - Il vendicatore | Rogue - Il solitario |
| 7 | Criminal | John Wick | Hell or High Water | John Wick | Sabotage |
| 8 | Drive | Hell or High Water | Drive | Blade Runner 2049 | The Equalizer - Il vendicatore |

### Viaggio a Tokyo — `movie:18148`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Tarda primavera | Tarda primavera | Tarda primavera | Tarda primavera | Tarda primavera |
| 2 | Il gusto del sakè | Il tempo del raccolto del grano | Il gusto del sakè | Il tempo del raccolto del grano | Il tempo del raccolto del grano |
| 3 | Il tempo del raccolto del grano | Il gusto del sakè | Il tempo del raccolto del grano | Tardo autunno | Il sapore del riso al tè verde |
| 4 | Vivere | Vivere | Vivere | Crepuscolo di Tokio | Il gusto del sakè |
| 5 | Il sapore del riso al tè verde | Crepuscolo di Tokio | Il sapore del riso al tè verde | L'autunno della famiglia Kohayagawa | Figlio unico |
| 6 | I racconti della luna pallida d'agosto | Tardo autunno | Crepuscolo di Tokio | Il gusto del sakè | Tardo autunno |
| 7 | Crepuscolo di Tokio | Il sapore del riso al tè verde | Fiori d'equinozio | Vivere | Fratelli e sorelle della famiglia Toda |
| 8 | Fiori d'equinozio | Fiori d'equinozio | Tardo autunno | Il sapore del riso al tè verde | Vivere |

### Il settimo sigillo — `movie:490`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Il posto delle fragole | Il posto delle fragole | Il posto delle fragole | Il posto delle fragole | Il posto delle fragole |
| 2 | Persona | Persona | Persona | Persona | Persona |
| 3 | Fanny & Alexander | Fanny & Alexander | Fanny & Alexander | Fanny & Alexander | Fanny & Alexander |
| 4 | 8½ | Luci d'inverno | La fontana della vergine | Luci d'inverno | Luci d'inverno |
| 5 | Il volto | Il volto | 8½ | Come in uno specchio | Il volto |
| 6 | La fontana della vergine | Come in uno specchio | Il volto | Il volto | 8½ |
| 7 | Luci d'inverno | La fontana della vergine | Luci d'inverno | La fontana della vergine | L'occhio del diavolo |
| 8 | Come in uno specchio | Il silenzio | Come in uno specchio | Sussurri e grida | Come in uno specchio |

### Persona — `movie:797`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Il posto delle fragole | Il posto delle fragole | Il posto delle fragole | Il posto delle fragole | Il posto delle fragole |
| 2 | Il settimo sigillo | Il settimo sigillo | Il settimo sigillo | Come in uno specchio | Il settimo sigillo |
| 3 | Come in uno specchio | Come in uno specchio | Come in uno specchio | Il silenzio | Come in uno specchio |
| 4 | Luci d'inverno | Luci d'inverno | Luci d'inverno | Luci d'inverno | Luci d'inverno |
| 5 | Il silenzio | Il silenzio | Il silenzio | Sussurri e grida | 8½ |
| 6 | Sussurri e grida | Sussurri e grida | Sussurri e grida | Il settimo sigillo | Sinfonia d'autunno |
| 7 | La fontana della vergine | L'ora del lupo | La fontana della vergine | L'ora del lupo | Il silenzio |
| 8 | 8½ | Lo specchio | 8½ | Scene da un matrimonio | Sussurri e grida |

### Ladri di biciclette — `movie:5156`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Umberto D. | Umberto D. | Umberto D. | Umberto D. | Umberto D. |
| 2 | I 400 colpi | I 400 colpi | I 400 colpi | Sciuscià | Sciuscià |
| 3 | 8½ | La strada | 8½ | La strada | Roma città aperta |
| 4 | Fino all'ultimo respiro | Sciuscià | Sciuscià | I 400 colpi | Le notti di Cabiria |
| 5 | Il settimo sigillo | 8½ | La dolce vita | La terra trema | 8½ |
| 6 | La dolce vita | Le notti di Cabiria | La strada | Le notti di Cabiria | I 400 colpi |
| 7 | La strada | Roma città aperta | Fino all'ultimo respiro | 8½ | I vitelloni |
| 8 | Sciuscià | La terra trema | Il settimo sigillo | Roma città aperta | I bambini ci guardano |

### The Wire — `tv:1438`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | I Soprano | We Own This City - Potere e corruzione | I Soprano | I Soprano | I Soprano |
| 2 | We Own This City - Potere e corruzione | I Soprano | We Own This City - Potere e corruzione | We Own This City - Potere e corruzione | We Own This City - Potere e corruzione |
| 3 | The Shield | The Shield | The Shield | The Shield | The Shield |
| 4 | Show Me a Hero | True Detective | Show Me a Hero | Fargo | Fargo |
| 5 | Fargo | Show Me a Hero | Fargo | Boardwalk Empire - L'impero del crimine | Show Me a Hero |
| 6 | True Detective | Fargo | True Detective | Narcos | Boardwalk Empire - L'impero del crimine |
| 7 | Six Feet Under | Six Feet Under | Six Feet Under | Show Me a Hero | Narcos |
| 8 | Treme | Homicide | Treme | The Corner | Homicide |

### I segreti di Twin Peaks — `tv:1920`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Fargo | Fargo | Fargo | Twin Peaks: Fuoco cammina con me | I segreti di Twin Peaks |
| 2 | I segreti di Twin Peaks | Twin Peaks: Fuoco cammina con me | Twin Peaks: The Missing Pieces | Twin Peaks: The Missing Pieces | Twin Peaks: The Missing Pieces |
| 3 | Twin Peaks: The Missing Pieces | I segreti di Twin Peaks | I segreti di Twin Peaks | True Detective | Twin Peaks: Fuoco cammina con me |
| 4 | Twin Peaks: Fuoco cammina con me | Velluto blu | Twin Peaks: Fuoco cammina con me | Mulholland Drive | Velluto blu |
| 5 | Velluto blu | True Detective | Velluto blu | Inland Empire - L'impero della mente | Fargo |
| 6 | X-Files | Twin Peaks: The Missing Pieces | X-Files | X-Files | X-Files |
| 7 | True Detective | X-Files | True Detective | Fargo | True Detective |
| 8 | I Soprano | Mulholland Drive | The Leftovers - Svaniti nel nulla | I segreti di Twin Peaks | Haven |

### Chernobyl — `tv:87108`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Il Trono di Spade | Il Trono di Spade | Il Trono di Spade | Lockerbie - Attentato sul volo Pan Am 103 | I tre giorni dopo la fine |
| 2 | Band of Brothers - Fratelli al fronte | Band of Brothers - Fratelli al fronte | Band of Brothers - Fratelli al fronte | I tre giorni dopo la fine | Deepwater - Inferno sull'Oceano |
| 3 | The Last of Us | I tre giorni dopo la fine | The Last of Us | Il Trono di Spade | Il Trono di Spade |
| 4 | Silicon Valley | Pandora | Pandora | Band of Brothers - Fratelli al fronte | Oppenheimer |
| 5 | Westworld - Dove tutto è concesso | Cinque giorni al Memorial | I tre giorni dopo la fine | The Last of Us | Chernobyl 1986 |
| 6 | Pandora | Oppenheimer | True Detective | Chernobyl 1986 | Band of Brothers - Fratelli al fronte |
| 7 | True Detective | Lockerbie - Attentato sul volo Pan Am 103 | Cinque giorni al Memorial | Cinque giorni al Memorial | Cinque giorni al Memorial |
| 8 | Sherlock | The Last of Us | Dark | Deepwater - Inferno sull'Oceano | Indagini ad alta quota |

### Black Mirror — `tv:42009`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Ai confini della realtà | Love, Death & Robots | Westworld - Dove tutto è concesso | Ai confini della realtà | Ai confini della realtà |
| 2 | Westworld - Dove tutto è concesso | Ai confini della realtà | Ai confini della realtà | The Twilight Zone | Love, Death & Robots |
| 3 | Love, Death & Robots | Westworld - Dove tutto è concesso | Love, Death & Robots | Love, Death & Robots | The Twilight Zone |
| 4 | The Twilight Zone | Philip K. Dick's Electric Dreams | The Twilight Zone | American Horror Stories | American Horror Stories |
| 5 | American Horror Stories | The Twilight Zone | The Terror | The Terror | The Terror |
| 6 | The Terror | The Terror | Philip K. Dick's Electric Dreams | Philip K. Dick's Electric Dreams | American Horror Story |
| 7 | American Horror Story | Guillermo del Toro's Cabinet of Curiosities | American Horror Story | American Horror Story | Philip K. Dick's Electric Dreams |
| 8 | Philip K. Dick's Electric Dreams | American Horror Stories | American Horror Stories | Ai confini della realtà | Masters of Horror |

### Mr. Robot — `tv:62560`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Westworld - Dove tutto è concesso | Westworld - Dove tutto è concesso | Westworld - Dove tutto è concesso | Who Am I - No System Is Safe | Who Am I - No System Is Safe |
| 2 | Murderbot | Who Am I - No System Is Safe | Homecoming | Black Mirror | Millennium - Quello che non uccide |
| 3 | Hackers | Person of Interest | True Detective | Dark | The Takeover |
| 4 | Homecoming | Black Mirror | Who Am I - No System Is Safe | Hacker | S.Y.N.A.P.S.E. - Pericolo in rete |
| 5 | The Takeover | Homecoming | Black Mirror | Homecoming | Westworld - Dove tutto è concesso |
| 6 | True Detective | Dark | Person of Interest | Westworld - Dove tutto è concesso | Hackers |
| 7 | Who Am I - No System Is Safe | True Detective | Dark | Hackers | Hacker |
| 8 | Hacker | Millennium - Quello che non uccide | Murderbot | The Circle | The Net - Intrappolata nella rete |

### Dark — `tv:70523`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | The OA | The OA | The OA | The OA | The OA |
| 2 | The Leftovers - Svaniti nel nulla | Stranger Things | The Leftovers - Svaniti nel nulla | Stranger Things | The Leftovers - Svaniti nel nulla |
| 3 | Stranger Things | 1899 | Stranger Things | The Leftovers - Svaniti nel nulla | Stranger Things |
| 4 | Safe | The Leftovers - Svaniti nel nulla | Safe | 1899 | Safe |
| 5 | Westworld - Dove tutto è concesso | Safe | 1899 | Safe | The Missing |
| 6 | 1899 | Bodies | The Missing | Frequency | Equinox |
| 7 | The Missing | Equinox | Westworld - Dove tutto è concesso | Bodies | Altered Carbon |
| 8 | Altered Carbon | 12 Monkeys | Chernobyl | La nebbia | Westworld - Dove tutto è concesso |

### Succession — `tv:76331`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Barry | The White Lotus | Barry | Billions | Barry |
| 2 | The White Lotus | Barry | The White Lotus | Barry | Billions |
| 3 | Six Feet Under | Six Feet Under | Six Feet Under | The Bear | Back |
| 4 | Omicidio a Easttown | Billions | Billions | La casa de las flores | The White Lotus |
| 5 | The Leftovers - Svaniti nel nulla | The Bear | The Bear | The White Lotus | Empire |
| 6 | Billions | BEEF - LO SCONTRO | Omicidio a Easttown | Filthy Rich - Ricchi e colpevoli | Six Feet Under |
| 7 | The Bear | The Morning Show | BEEF - LO SCONTRO | Six Feet Under | Unstable |
| 8 | BEEF - LO SCONTRO | The Righteous Gemstones | Empire | BEEF - LO SCONTRO | The Morning Show |

### BoJack Horseman — `tv:61222`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Rick and Morty | Rick and Morty | Rick and Morty | Long Story Short | Rick and Morty |
| 2 | Big Mouth | Archer | Big Mouth | Rick and Morty | Big Mouth |
| 3 | Futurama | Big Mouth | Archer | F is for Family | Long Story Short |
| 4 | Archer | Futurama | Futurama | Tuca & Bertie | Undone |
| 5 | I Simpson | Long Story Short | Long Story Short | Big Mouth | Human Resources |
| 6 | Undone | Disincanto | Undone | Futurama | Futurama |
| 7 | Long Story Short | Undone | South Park | Archer | Disincanto |
| 8 | South Park | Tuca & Bertie | Disincanto | I Griffin | Tuca & Bertie |

### Peaky Blinders — `tv:60574`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Taboo | Taboo | Taboo | Taboo | Taboo |
| 2 | Boardwalk Empire - L'impero del crimine | Boardwalk Empire - L'impero del crimine | Boardwalk Empire - L'impero del crimine | Boardwalk Empire - L'impero del crimine | Boardwalk Empire - L'impero del crimine |
| 3 | Sons of Anarchy | Babylon Berlin | Sons of Anarchy | Babylon Berlin | Sons of Anarchy |
| 4 | Ozark | Ozark | Ozark | Narcos | Ozark |
| 5 | Narcos | Sons of Anarchy | Godfather of Harlem | Sons of Anarchy | Narcos |
| 6 | Godfather of Harlem | Godfather of Harlem | Narcos | Legend | Babylon Berlin |
| 7 | Babylon Berlin | Narcos | Babylon Berlin | Godfather of Harlem | Legend |
| 8 | La regina degli scacchi | Mayor of Kingstown | Top Boy | Ripper Street | Godfather of Harlem |

### La casa di carta — `tv:71446`

| # | grafo V14 | mammoth | pplx | mercury | span |
|---|---|---|---|---|---|
| 1 | Berlino e i gioielli di Parigi | Berlino e i gioielli di Parigi | Berlino e i gioielli di Parigi | Caleidoscopio | Berlino e i gioielli di Parigi |
| 2 | La rapina del secolo | Berlino e la Dama con l'ermellino | La rapina del secolo | La rapina del secolo | Caleidoscopio |
| 3 | Caleidoscopio | Caleidoscopio | Caleidoscopio | La casa di carta: Corea | Takers |
| 4 | La Casa de Papel: el fenómeno | La rapina del secolo | Berlino e la Dama con l'ermellino | Berlino e i gioielli di Parigi | Berlino e la Dama con l'ermellino |
| 5 | Takers | La rapina del secolo | La Casa de Papel: el fenómeno | Lupin | Lupin |
| 6 | Berlino e la Dama con l'ermellino | Lupin | Lupin | Prison Break | La rapina del secolo |
| 7 | Lupin | Inside Man | La rapina del secolo | Sky Rojo | Sky Rojo |
| 8 | La rapina del secolo | Takers | Sky Rojo | Inside Man | La rapina del secolo |
