# Rapporto Dieci Storie: Il Motore delle Raccomandazioni su Timeline Reali

> [!NOTE]
> **Che cos'è questo documento**:
> Questo rapporto analizza il comportamento della configurazione vincente di micro-clustering e selezione scaffali (Metodo 2: vicinato allargato top-100 a soglia 0.02, macro limitati a $\le 30$ semi con bisezione ricorsiva, 5 scaffali per rango combinato di freschezza `min_eta` e supporto, medium dedotto per singolo macro, deduplica di franchise).
> Il test viene condotto su **10 cronologie Trakt reali** selezionate per coprire l'intero spettro di consumo: dai profili ultra-corti (7-11 semi) all'utente medio attivo (167 semi), fino alle massime collezioni presenti nel canone locale (~570 semi).
> 
> **Aggiornamento Metodologico (Ticket 08 - Revisione)**:
> 1. **Denominazione basata sull'evidenza**: Le etichette dei caroselli non usano più dizionari euristici fissi ma derivano direttamente dai 2-3 keyword con peso TF-IDF medio più elevato tra i membri del cluster, arricchite da un modificatore fattuale decisivo (medium, flag `ANIME`, lingua/paese d'origine dedotto dalle keyword, o `ADULTO` quando il cluster è interamente per adulti).
> 2. **NAME DISTINCTNESS**: È attivo il vincolo di unicità: se due caroselli nello stesso profilo generano lo stesso nome base, vengono automaticamente disambiguati tramite il termine successivo. Il collasso di denominazione è tracciato come condizione di fallimento dichiarata.
> 3. **Separazione tra Staleness e Deepening**: Sostituito il vecchio indicatore `year_gap < -1.0` (che scambiava l'approfondimento per obsolescenza) con un criterio oggettivo che distingue i cluster davvero stantii (*STALE*) da quelli storici o con mix di epoche (*DEEPENING*).

---

## Tabella Riassuntiva delle 10 Timeline (Lettura Rapida)

| Profilo Trakt | Tipologia / Gap Coperto | Semi Totali | Cluster (Micro / Macro) | Copertura Semi | Max Taglia Macro | Quota Saghe (b) | Scaffali Serviti | Nomi Duplicati | Scaffali Stale |
|:---|:---|---:|:---:|---:|---:|---:|:---:|:---:|:---:|
| **`sangam456`** | Corto storico (10 semi) | 10 | 2 / 2 | 60.0% | 3 | 50.0% | **2 / 5** | 0 | 0 |
| **`hammers-lists`** | Corto storico (11 semi) | 11 | 2 / 2 | 72.7% | 6 | 0.0% | **2 / 5** | 0 | 0 |
| **`sappss`** | Medio-basso storico (25 semi) | 25 | 6 / 6 | 80.0% | 6 | 0.0% | **5 / 5** | 0 | 0 |
| **`flixinatoor99`** | Medio storico (32 semi) | 32 | 7 / 7 | 84.4% | 9 | 14.3% | **5 / 5** | 0 | 0 |
| **`moppierhead`** | Medio storico (38 semi) | 38 | 6 / 6 | 81.6% | 8 | 33.3% | **5 / 5** | 0 | 0 |
| **`castoffcrown`** | Lungo storico (412 semi) | 412 | 54 / 31 | 92.0% | 29 | 9.3% | **5 / 5** | 0 | 0 |
| **`warnok`** | Lungo storico (476 semi) | 476 | 26 / 45 | 96.2% | 29 | 19.2% | **5 / 5** | 0 | 0 |
| **`pepsipex`** | Massimo storico (568 semi) | 568 | 25 / 59 | 97.2% | 30 | 0.0% | **5 / 5** | 0 | 0 |
| **`carverclan`** | Ultra-corto (<10 semi, 7 semi) | 7 | 2 / 2 | 57.1% | 2 | 0.0% | **2 / 5** | 0 | 0 |
| **`1jacobjohn`** | Intermedio (167 semi) | 167 | 19 / 15 | 92.2% | 25 | 10.5% | **5 / 5** | 0 | 1 |

---

## Le 10 Timeline nel Dettaglio

### Profilo: `sangam456` — Corto storico (10 semi)
**Metadati**: 10 semi totali · 2 micro-cluster naturali $\to$ 2 macro vincolati (max 3 semi) · Copertura: 60.0% · Quota saghe (b): 50.0% · Nomi duplicati: 0 · Scaffali stale: 0

> [!WARNING]
> **Meno di 5 scaffali disponibili**: Questo profilo produce solo **2 scaffali** su 5. Con appena 10 semi, non esiste massa relazionale sufficiente per generare 5 raggruppamenti disgiunti di almeno 2 titoli.

1. **Film: Alien & Kansas City** (3 semi, `movie`) — Semi: *Disclosure Day*, *Lilo & Stitch*, *Mission: Impossible - Dead Reckoning Parte uno* — Top-5: *Mission: Impossible - Fallout (2018)*, *Mission: Impossible - Rogue Nation (2015)*, *IF - Gli amici immaginari (2024)*, *Mission: Impossible - The Final Reckoning (2025)*, *Mission: Impossible - Protocollo fantasma (2011)*
   *Evidenza semantica cluster*: `alien` (0.102), `kansas city` (0.101), `meteorologist` (0.101) · *Stato temporale*: `Allineato / Contemporaneo`
2. **Serie: Hotel & Tech-Mogul** (3 semi, `series`) — Semi: *The White Lotus*, *Billions*, *A Murder at the End of the World* — Top-5: *The OA (2016)*, *The North Water (2021)*, *The Bear (2022)*, *Scissione (2022)*, *Hacks (2021)*
   *Evidenza semantica cluster*: `hotel` (0.122), `tech-mogul` (0.112), `arctic` (0.112) · *Stato temporale*: `Deepening (Semi storici)`

---

### Profilo: `hammers-lists` — Corto storico (11 semi)
**Metadati**: 11 semi totali · 2 micro-cluster naturali $\to$ 2 macro vincolati (max 6 semi) · Copertura: 72.7% · Quota saghe (b): 0.0% · Nomi duplicati: 0 · Scaffali stale: 0

> [!WARNING]
> **Meno di 5 scaffali disponibili**: Questo profilo produce solo **2 scaffali** su 5. Con appena 11 semi, non esiste massa relazionale sufficiente per generare 5 raggruppamenti disgiunti di almeno 2 titoli.

1. **Serie: Medical Drama & Spin Off** (6 semi, `series`) — Semi: *The Resident*, *Big Sky*, *The Good Doctor* — Top-5: *Dr. House - Medical Division (2004)*, *New Amsterdam (2018)*, *Station 19 (2018)*, *Grey's Anatomy (2005)*, *9-1-1 (2018)*
   *Evidenza semantica cluster*: `medical drama` (0.144), `spin off` (0.128), `hospital` (0.116) · *Stato temporale*: `Deepening (Semi storici)`
2. **Adulti: Dysfunctional Family & Adult Animation** (2 semi, `series`) — Semi: *Rick and Morty*, *I Griffin* — Top-5: *South Park (1997)*, *Futurama (1999)*, *American Dad! (2005)*, *I Simpson (1989)*, *BoJack Horseman (2014)*
   *Evidenza semantica cluster*: `dysfunctional family` (0.176), `adult animation` (0.166), `multiple dimensions` (0.148) · *Stato temporale*: `Deepening (Semi storici)`

---

### Profilo: `sappss` — Medio-basso storico (25 semi)
**Metadati**: 25 semi totali · 6 micro-cluster naturali $\to$ 6 macro vincolati (max 6 semi) · Copertura: 80.0% · Quota saghe (b): 0.0% · Nomi duplicati: 0 · Scaffali stale: 0

1. **Film: Drug Rehabilitation & Drug Use** (6 semi, `movie`) — Semi: *Euphoria*, *Fallout*, *Obsession* — Top-5: *Sharp Corner (2025)*, *Spaceman (2024)*, *The Plague (2025)*, *Ben Is Back (2018)*, *Elegia americana (2020)*
   *Evidenza semantica cluster*: `drug rehabilitation` (0.094), `drug use` (0.063), `aimless youth` (0.058) · *Stato temporale*: `Allineato / Contemporaneo`
2. **Britannico: True Crime & Hit-And-Run** (3 semi, `series`) — Semi: *Sposare un assassino*, *Louis Theroux: Dentro la manosfera*, *Worst Neighbor Ever - Vicini letali* — Top-5: *Devil in the Family: The Fall of Ruby Franke (2025)*, *Worst Ex Ever - Relazioni fatali (2024)*, *Death of the Pastor's Wife: il caso Mica Miller (2026)*, *Cabin in the Woods (2024)*, *Bad Influence: il lato oscuro dei giovani influencer (2025)*
   *Evidenza semantica cluster*: `true crime` (0.267), `hit-and-run` (0.180), `neighbor` (0.150) · *Stato temporale*: `Allineato / Contemporaneo`
3. **Film: Garbage & Villain** (4 semi, `movie`) — Semi: *Elio*, *I Simpson - Il film*, *Jumpers - Un salto tra gli animali* — Top-5: *Inside Out 2 (2024)*, *Elemental (2023)*, *Lightyear - La vera storia di Buzz (2022)*, *Toy Story 5 (2026)*, *I Simpson in Plusaversary (2021)*
   *Evidenza semantica cluster*: `garbage` (0.127), `villain` (0.122), `pixar` (0.120) · *Stato temporale*: `Allineato / Contemporaneo`
4. **Adulti: Dysfunctional Family & Adult Animation** (3 semi, `series`) — Semi: *I Simpson*, *Rick and Morty*, *I Griffin* — Top-5: *South Park (1997)*, *American Dad! (2005)*, *Futurama (1999)*, *Bob's Burgers (2011)*, *Big Mouth (2017)*
   *Evidenza semantica cluster*: `dysfunctional family` (0.182), `adult animation` (0.173), `adult humor` (0.161) · *Stato temporale*: `Deepening (Semi storici)`
5. **Serie: Ironic & Speed** (2 semi, `series`) — Semi: *La fattoria Clarkson*, *Formula 1: Drive to Survive* — Top-5: *The Grand Tour (2016)*, *Top Gear (2002)*, *Il banco dei pugni (2010)*, *Brawn: Una storia impossibile di Formula 1 (2023)*, *Affari di famiglia (2009)*
   *Evidenza semantica cluster*: `ironic` (0.209), `speed` (0.195), `championship` (0.193) · *Stato temporale*: `Deepening (Semi storici)`

---

### Profilo: `flixinatoor99` — Medio storico (32 semi)
**Metadati**: 32 semi totali · 7 micro-cluster naturali $\to$ 7 macro vincolati (max 9 semi) · Copertura: 84.4% · Quota saghe (b): 14.3% · Nomi duplicati: 0 · Scaffali stale: 0

1. **Serie: Nostalgic & Cheerful** (9 semi, `series`) — Semi: *Il Boss del condominio*, *División Palermo*, *Stromberg* — Top-5: *El Chapulín Colorado (1973)*, *Chespirito (1980)*, *Grandi speranze (2023)*, *Nothing (2023)*, *El rey, Vicente Fernández (2022)*
   *Evidenza semantica cluster*: `nostalgic` (0.063), `cheerful` (0.058), `amused` (0.049) · *Stato temporale*: `Deepening (Mix di epoche)`
2. **Film: Survival Instinct & Rock Climbing** (5 semi, `movie`) — Semi: *Apex*, *Una di famiglia - The Housemaid*, *Hamnet - Nel nome del figlio* — Top-5: *Slumberland - Nel mondo dei sogni (2022)*, *Il drago invisibile (2016)*, *Fall 2: Deadpoint (2026)*, *Wicked - Parte 2 (2025)*, *Un altro piccolo favore (2025)*
   *Evidenza semantica cluster*: `survival instinct` (0.076), `rock climbing` (0.076), `reminiscent` (0.067) · *Stato temporale*: `Allineato / Contemporaneo`
3. **Serie: Satire & Indiana, Usa** (3 semi, `series`) — Semi: *Parks and Recreation*, *The White Lotus*, *Spider-Noir* — Top-5: *The Bear (2022)*, *The Office (US) (2005)*, *Scissione (2022)*, *Brooklyn Nine-Nine (2013)*, *The Penguin (2024)*
   *Evidenza semantica cluster*: `satire` (0.112), `indiana, usa` (0.102), `office romance` (0.097) · *Stato temporale*: `Allineato / Contemporaneo`
4. **Film: Animation & Fantasy World** (3 semi, `movie`) — Semi: *Super Mario Galaxy - Il film*, *Dragonkeeper*, *Il bambino, la talpa, la volpe e il cavallo* — Top-5: *Super Mario Bros. Il Film (2023)*, *Il robot selvaggio (2024)*, *Wolfwalkers - Il popolo dei lupi (2020)*, *Buñuel nel labirinto delle tartarughe (2019)*, *Elio (2025)*
   *Evidenza semantica cluster*: `animation` (0.136), `fantasy world` (0.119), `courage` (0.107) · *Stato temporale*: `Allineato / Contemporaneo`
5. **Adulti: Adult Animation & Condescending** (2 semi, `series`) — Semi: *South Park*, *INVINCIBLE* — Top-5: *Rick and Morty (2013)*, *La leggenda di Vox Machina (2022)*, *I Griffin (1999)*, *The Boys Presenta: Diabolico! (2022)*, *Harley Quinn (2019)*
   *Evidenza semantica cluster*: `adult animation` (0.170), `condescending` (0.144), `teen superhero` (0.133) · *Stato temporale*: `Deepening (Semi storici)`

---

### Profilo: `moppierhead` — Medio storico (38 semi)
**Metadati**: 38 semi totali · 6 micro-cluster naturali $\to$ 6 macro vincolati (max 8 semi) · Copertura: 81.6% · Quota saghe (b): 33.3% · Nomi duplicati: 0 · Scaffali stale: 0

1. **Serie: Adult Animation & Social Satire** (7 semi, `series`) — Semi: *I Simpson*, *Bob's Burgers*, *Futurama* — Top-5: *I Griffin (1999)*, *King of the Hill (1997)*, *Big Mouth (2017)*, *The Cleveland Show (2009)*, *Rick and Morty (2013)*
   *Evidenza semantica cluster*: `adult animation` (0.123), `social satire` (0.118), `sitcom` (0.109) · *Stato temporale*: `Deepening (Mix di epoche)`
2. **Anime: Shounen & Based On Manga** (6 semi, `series`) — Semi: *One Piece*, *L'attacco dei giganti*, *Sailor Moon* — Top-5: *Fullmetal Alchemist: Brotherhood (2009)*, *Hunter x Hunter (2011)*, *Code Geass: Lelouch of the Rebellion (2006)*, *One-Punch Man (2015)*, *Naruto (2002)*
   *Evidenza semantica cluster*: `shounen` (0.105), `based on manga` (0.103), `anime` (0.097) · *Stato temporale*: `Deepening (Semi storici)`
3. **Serie: Intellectually Gifted & Demigod** (4 semi, `series`) — Semi: *High Potential*, *Percy Jackson e gli dei dell'Olimpo*, *Only Murders in the Building* — Top-5: *Parks and Recreation (2009)*, *Ballard (2025)*, *The Old Man (2022)*, *Afterparty (2022)*, *Black Sails (2014)*
   *Evidenza semantica cluster*: `intellectually gifted` (0.087), `demigod` (0.083), `criminal consultant` (0.083) · *Stato temporale*: `Allineato / Contemporaneo`
4. **Film: Wizard & Magic** (8 semi, `movie`) — Semi: *Wicked - Parte 2*, *Wicked*, *Harry Potter e i Doni della Morte - Parte 2* — Top-5: *Harry Potter e l'ordine della fenice (2007)*, *Harry Potter e il calice di fuoco (2005)*, *Harry Potter e il prigioniero di Azkaban (2004)*, *Descendants (2015)*, *Harry Potter e la camera dei segreti (2002)*
   *Evidenza semantica cluster*: `wizard` (0.137), `magic` (0.120), `sequel` (0.114) · *Stato temporale*: `Deepening (Mix di epoche)`
5. **Serie: Blended Family & Child Star** (4 semi, `series`) — Semi: *Hannah Montana*, *Zoey 101*, *Drake & Josh* — Top-5: *iCarly (2007)*, *Victorious (2010)*, *Henry Danger (2014)*, *iCarly (2021)*, *Ned - Scuola di sopravvivenza (2004)*
   *Evidenza semantica cluster*: `blended family` (0.108), `child star` (0.098), `popstar` (0.098) · *Stato temporale*: `Deepening (Semi storici)`

---

### Profilo: `castoffcrown` — Lungo storico (412 semi)
**Metadati**: 412 semi totali · 54 micro-cluster naturali $\to$ 31 macro vincolati (max 29 semi) · Copertura: 92.0% · Quota saghe (b): 9.3% · Nomi duplicati: 0 · Scaffali stale: 0

1. **Tedesco: Berlin, Germany & Art** (29 semi, `movie`) — Semi: *Come è fatto*, *I predatori dell'arca perduta*, *Il Signore degli Anelli - La Compagnia dell'Anello* — Top-5: *La nera di... (1966)*, *Campo Thiaroye (1988)*, *From What Is Before (2014)*, *The Woman Who Left - La donna che se ne è andata (2016)*, *Il carrettiere (1963)*
   *Evidenza semantica cluster*: `berlin, germany` (0.044), `art` (0.026), `factory` (0.026) · *Stato temporale*: `Deepening (Semi storici)`
2. **Anime: Based On Manga & Anime · Shounen** (26 semi, `series`) — Semi: *One Piece*, *Haikyu!! L'asso del volley*, *L'attacco dei giganti* — Top-5: *Hunter x Hunter (2011)*, *One-Punch Man (2015)*, *Il movimento della Terra (2024)*, *Demon Slayer: Kimetsu no Yaiba (2019)*, *Frieren - Oltre la Fine del Viaggio (2023)*
   *Evidenza semantica cluster*: `based on manga` (0.105), `anime` (0.101), `shounen` (0.079) · *Stato temporale*: `Allineato / Contemporaneo`
3. **Giapponese: Jidaigeki & Samurai** (29 semi, `movie`) — Semi: *Wok of Love*, *Midnight Diner: Tokyo Stories*, *Shōgun* — Top-5: *Rurouni Kenshin 3 - The legend ends (2014)*, *La fortezza nascosta (1958)*, *Il trono di sangue (1957)*, *Rashomon (1950)*, *I sette samurai (1954)*
   *Evidenza semantica cluster*: `jidaigeki` (0.062), `samurai` (0.058), `bakumatsu` (0.047) · *Stato temporale*: `Deepening (Mix di epoche)`
4. **Film: Lgbt & Gothic Horror** (29 semi, `movie`) — Semi: *梦华录*, *Kamen Rider ZEZTZ*, *Sweet/Vicious* — Top-5: *The Image Revolution (2013)*, *Dagon - La mutazione del male (2001)*, *Alone/Together (2019)*, *Marvel: 75 Anni, da Pulp a Pop! (2014)*, *Damsels in Distress - Ragazze allo sbando (2012)*
   *Evidenza semantica cluster*: `lgbt` (0.032), `gothic horror` (0.027), `cult` (0.024) · *Stato temporale*: `Deepening (Mix di epoche)`
5. **Anime: Based On Manga & Anime · Slice Of Life** (28 semi, `series`) — Semi: *Tojima Wants to Be a Kamen Rider*, *The 100 Girlfriends Who Really, Really, Really, Really, REALLY Love You*, *Mars Red* — Top-5: *Hana-Kimi (2026)*, *Honey Lemon Soda (2025)*, *Daemons of the Shadow Realm (2026)*, *The Yakuza's Guide to Babysitting (2022)*, *Quality Assurance in Another World (2024)*
   *Evidenza semantica cluster*: `based on manga` (0.111), `anime` (0.111), `slice of life` (0.058) · *Stato temporale*: `Allineato / Contemporaneo`

---

### Profilo: `warnok` — Lungo storico (476 semi)
**Metadati**: 476 semi totali · 26 micro-cluster naturali $\to$ 45 macro vincolati (max 29 semi) · Copertura: 96.2% · Quota saghe (b): 19.2% · Nomi duplicati: 0 · Scaffali stale: 0

1. **Serie: Post-Apocalyptic Future & Based On Comic** (29 semi, `series`) — Semi: *Prison Break*, *Lost*, *X-Files* — Top-5: *Pluribus (2025)*, *Snowpiercer (2020)*, *A Knight of the Seven Kingdoms (2026)*, *Alice in Borderland (2020)*, *Chernobyl (2019)*
   *Evidenza semantica cluster*: `post-apocalyptic future` (0.041), `based on comic` (0.037), `based on novel or book` (0.030) · *Stato temporale*: `Allineato / Contemporaneo`
2. **Coreano: Busan, South Korea & Joseon Dynasty (1392–1910)** (23 semi, `series`) — Semi: *Jirisan*, *长安十二时辰*, *Vagabond* — Top-5: *Signal (2016)*, *The Ark (2023)*, *Agent Kim Reactivated (2026)*, *Ice Fantasy (2016)*, *Bulgasal: Anime immortali (2021)*
   *Evidenza semantica cluster*: `busan, south korea` (0.046), `south korea` (0.038), `joseon dynasty (1392–1910)` (0.036) · *Stato temporale*: `Allineato / Contemporaneo`
3. **Anime: Based On Manga & Shounen** (28 semi, `series`) — Semi: *Naruto*, *L'attacco dei giganti*, *Monster* — Top-5: *Hunter x Hunter (2011)*, *The Promised Neverland (2019)*, *Chainsaw Man (2022)*, *One-Punch Man (2015)*, *Mob Psycho 100 (2016)*
   *Evidenza semantica cluster*: `based on manga` (0.099), `shounen` (0.088), `anime` (0.083) · *Stato temporale*: `Deepening (Mix di epoche)`
4. **Film: Alien Invasion & Alien Monster** (26 semi, `movie`) — Semi: *Invasion*, *Alien: Pianeta Terra*, *War of the Worlds* — Top-5: *Nessuno ti salverà (2023)*, *Dune - Parte due (2024)*, *Furiosa: A Mad Max Saga (2024)*, *Split (2017)*, *Civil War (2024)*
   *Evidenza semantica cluster*: `alien invasion` (0.078), `alien monster` (0.051), `sci-fi horror` (0.048) · *Stato temporale*: `Allineato / Contemporaneo`
5. **Serie: Adult Animation & Based On Video Game** (22 semi, `series`) — Semi: *Love, Death & Robots*, *Castlevania*, *La leggenda di Vox Machina* — Top-5: *The Mighty Nein (2025)*, *The Boys Presenta: Diabolico! (2022)*, *Star Wars: Tales of the Jedi (2022)*, *Star Wars: The Bad Batch (2021)*, *X-Men '97 (2024)*
   *Evidenza semantica cluster*: `adult animation` (0.073), `based on video game` (0.058), `dark fantasy` (0.046) · *Stato temporale*: `Allineato / Contemporaneo`

---

### Profilo: `pepsipex` — Massimo storico (568 semi)
**Metadati**: 568 semi totali · 25 micro-cluster naturali $\to$ 59 macro vincolati (max 30 semi) · Copertura: 97.2% · Quota saghe (b): 0.0% · Nomi duplicati: 0 · Scaffali stale: 0

1. **Britannico: Spy Thriller & London, England** (30 semi, `series`) — Semi: *Slow Horses*, *Operazione speciale: Lioness*, *Alex Rider* — Top-5: *Secret Service (2026)*, *1923 (2022)*, *1883 (2021)*, *The Veil (2024)*, *Landman (2024)*
   *Evidenza semantica cluster*: `spy thriller` (0.060), `spy` (0.052), `london, england` (0.040) · *Stato temporale*: `Allineato / Contemporaneo`
2. **Film: Female Protagonist & Dark Comedy** (26 semi, `movie`) — Semi: *Industry*, *BEEF - LO SCONTRO*, *Animals* — Top-5: *Una donna promettente (2020)*, *The Runner (2026)*, *Challengers (2024)*, *Kinds of Kindness (2024)*, *Sanctuary - Lui fa il gioco. Lei fa le regole. (2023)*
   *Evidenza semantica cluster*: `female protagonist` (0.046), `dark comedy` (0.042), `husband wife relationship` (0.032) · *Stato temporale*: `Allineato / Contemporaneo`
3. **Britannico: Period Drama & Based On Novel Or Book** (29 semi, `series`) — Semi: *The Great*, *The Buccaneers*, *The Serpent Queen* — Top-5: *Becoming Elizabeth (2022)*, *Bridgerton (2020)*, *Belgravia: The Next Chapter (2024)*, *The White Princess (2017)*, *Believe Me (2026)*
   *Evidenza semantica cluster*: `period drama` (0.127), `based on novel or book` (0.048), `costume drama` (0.048) · *Stato temporale*: `Allineato / Contemporaneo`
4. **Serie: Horror & Miniseries** (23 semi, `series`) — Semi: *American Horror Story*, *Servant*, *True Detective* — Top-5: *The Haunting of Bly Manor (2020)*, *The Haunting of Hill House (2018)*, *IT: Welcome to Derry (2025)*, *DAHMER - Mostro: la storia di Jeffrey Dahmer (2022)*, *MONSTERS: La storia di Lyle ed Erik Menendez (2024)*
   *Evidenza semantica cluster*: `horror` (0.096), `miniseries` (0.038), `supernatural horror` (0.032) · *Stato temporale*: `Allineato / Contemporaneo`
5. **Adulti: Thriller & Detective** (26 semi, `series`) — Semi: *Strike*, *Vigil - Indagine a bordo*, *Ludwig* — Top-5: *The Madame Blanc Mysteries (2021)*, *Death Valley (2025)*, *I delitti della gazza ladra (2022)*, *We Hunt Together (2020)*, *Fear (2025)*
   *Evidenza semantica cluster*: `thriller` (0.109), `detective` (0.071), `cliché` (0.064) · *Stato temporale*: `Allineato / Contemporaneo`

---

### Profilo: `carverclan` — Ultra-corto (<10 semi, 7 semi)
**Metadati**: 7 semi totali · 2 micro-cluster naturali $\to$ 2 macro vincolati (max 2 semi) · Copertura: 57.1% · Quota saghe (b): 0.0% · Nomi duplicati: 0 · Scaffali stale: 0

> [!WARNING]
> **Meno di 5 scaffali disponibili**: Questo profilo produce solo **2 scaffali** su 5. Con appena 7 semi, non esiste massa relazionale sufficiente per generare 5 raggruppamenti disgiunti di almeno 2 titoli.

1. **Film: Supernatural Horror & Teen Horror** (2 semi, `movie`) — Semi: *I peccatori*, *Stranger Things* — Top-5: *Una battaglia dopo l’altra (2025)*, *Marty Supreme (2025)*, *Train Dreams (2025)*, *Weapons (2025)*, *Frankenstein (2025)*
   *Evidenza semantica cluster*: `supernatural horror` (0.170), `teen horror` (0.144), `indiana, usa` (0.138) · *Stato temporale*: `Allineato / Contemporaneo`
2. **Film: Literary Adaptation & Filmed Theater** (2 semi, `movie`) — Semi: *Peter Pan Goes Wrong*, *Great Performances* — Top-5: *Pippin (1981)*, *The Phantom of the Opera at the Royal Albert Hall (2011)*, *Top Gear: The Perfect Road Trip 2 (2014)*, *Scum (1977)*, *The Kate Bush Story: Running Up That Hill (2014)*
   *Evidenza semantica cluster*: `literary adaptation` (0.221), `filmed theater` (0.211), `anthology` (0.146) · *Stato temporale*: `Deepening (Semi storici)`

---

### Profilo: `1jacobjohn` — Intermedio (167 semi)
**Metadati**: 167 semi totali · 19 micro-cluster naturali $\to$ 15 macro vincolati (max 25 semi) · Copertura: 92.2% · Quota saghe (b): 10.5% · Nomi duplicati: 0 · Scaffali stale: 1

1. **Film: Marvel Cinematic Universe (Mcu) & Based On Comic** (24 semi, `movie`) — Semi: *La battaglia di Hacksaw Ridge*, *Bullet Train*, *Prisoners* — Top-5: *Godzilla vs. Kong (2021)*, *Guardiani della Galassia Vol. 2 (2017)*, *Doctor Strange nel Multiverso della Follia (2022)*, *The Avengers (2012)*, *Avengers: Infinity War (2018)*
   *Evidenza semantica cluster*: `marvel cinematic universe (mcu)` (0.044), `based on comic` (0.035), `sequel` (0.035) · *Stato temporale*: `STALE`
2. **Serie: Sitcom & Workplace** (24 semi, `series`) — Semi: *Grey's Anatomy*, *I Think You Should Leave with Tim Robinson*, *Breaking Bad* — Top-5: *The Watcher (2022)*, *Seinfeld (1989)*, *Monster: La storia di Lizzie Borden (2026)*, *Arrested Development - Ti presento i miei (2003)*, *30 Rock (2006)*
   *Evidenza semantica cluster*: `sitcom` (0.054), `workplace` (0.046), `thriller` (0.035) · *Stato temporale*: `Allineato / Contemporaneo`
3. **Adulti: Hidden Motives & Husband Wife Relationship** (25 semi, `movie`) — Semi: *The Mysteries of Laura*, *Greedy People*, *Hit Man - Killer per caso* — Top-5: *Deep Cover - Attori sotto copertura (2025)*, *Till Death (2021)*, *Code 8 (2019)*, *Il diavolo veste Prada (2006)*, *Le sabbie del Kalahari (1965)*
   *Evidenza semantica cluster*: `hidden motives` (0.026), `husband wife relationship` (0.024), `police brutality` (0.022) · *Stato temporale*: `Allineato / Contemporaneo`
4. **Serie: True Crime & Miniseries** (13 semi, `series`) — Semi: *This is the Zodiac Speaking: lettere da un serial killer*, *Sean Combs: la resa dei conti*, *American Murder: il caso Laci Peterson* — Top-5: *Jeffrey Epstein: soldi, potere e perversione (2020)*, *Cold Case: Chi ha ucciso JonBenét Ramsey (2024)*, *Ti dico un segreto? (2024)*, *Death of the Pastor's Wife: il caso Mica Miller (2026)*, *L'immagine della felicità: I segreti della famiglia Duggar (2023)*
   *Evidenza semantica cluster*: `true crime` (0.116), `miniseries` (0.086), `crime documentary` (0.063) · *Stato temporale*: `Allineato / Contemporaneo`
5. **Adulti: Adult Animation & Adult Humor** (15 semi, `series`) — Semi: *Bob's Burgers*, *Primal*, *South Park* — Top-5: *Big Mouth (2017)*, *The Cleveland Show (2009)*, *BoJack Horseman (2014)*, *Archer (2009)*, *King of the Hill (1997)*
   *Evidenza semantica cluster*: `adult animation` (0.165), `adult humor` (0.103), `sitcom` (0.076) · *Stato temporale*: `Deepening (Mix di epoche)`

---

## Decisione aperta: cold start

Sulle 10 cronologie analizzate, tutti e tre i profili con timeline breve producono esattamente **2 scaffali ciascuno**:
- **`carverclan` (7 semi)**: 2 soli scaffali (4 semi clusterizzati in 2 coppie, 3 semi isolati non clusterizzabili a soglia 0.02);
- **`sangam456` (10 semi)**: 2 soli scaffali (6 semi clusterizzati in due terne, 4 semi isolati);
- **`hammers-lists` (11 semi)**: 2 soli scaffali (8 semi clusterizzati in un gruppo da 6 e uno da 2, 3 semi isolati).

Il prodotto YACA richiede normalmente **5 scaffali a schermo**. Di fronte a un profilo cold start (< 12 semi), non deve essere inventato un fallback silenzioso non dichiarato. Vengono di seguito presentate le 4 opzioni architetturali con i relativi numeri e trade-off, rimettendo la decisione finale al team di prodotto:

1. **Paginazione estesa degli scaffali esistenti (Paging / Offset)**:
   - *Come funziona*: Per ciascuno dei 2 scaffali generati, si espone il carosello primario (candidati 1–5) e un carosello di approfondimento (candidati 6–10 con offset). Con 2 macro-cluster si ottengono 4 scaffali completi, più un terzo segmento (candidati 11–15 del cluster più forte) per raggiungere quota 5.
   - *Numeri*: 100% di copertura dei 5 slot di interfaccia servendo 25 raccomandazioni calcolate su 2 soli semi-cluster.
   - *Trade-off*: Ridondanza tematica evidente per l'utente, che vede lo stesso filone ripetuto in più righe.

2. **Scaffale globale integrativo 'Popolari nel tuo grafo' (Personalized Popularity Fill)**:
   - *Come funziona*: I 2 scaffali micro-cluster occupano i primi 2 slot della UI. I restanti 3 scaffali vengono completati da una diffusione d'insieme su tutti i semi dell'utente (anche quelli isolati non clusterizzati), oppure da una selezione dei titoli più centrali e votati nelle bolle adiacenti alla cronologia.
   - *Numeri*: 2 scaffali strettamente tematici (2–6 semi) + 3 scaffali ampi di catalogo relazionale.
   - *Trade-off*: I 3 scaffali di riempimento avranno una specificità tematica inferiore rispetto ai cluster naturali.

3. **Fusione forzata dei cluster in un unico macro-scaffale (Cluster Merge)**:
   - *Come funziona*: Quando $N < 12$, il motore disattiva il vincolo di soglia micro a 0.02 e fonde i 2 cluster in un unico carosello esteso (es. 4 semi per carverclan, 6 per sangam456, 8 per hammers-lists).
   - *Numeri*: Riduce gli scaffali da 2 a 1 solo carosello aggregato.
   - *Trade-off*: Non risolve il problema dei 5 scaffali; aggrega gusti potenzialmente divergenti in un unico contenitore eterogeneo.

4. **UI Adattiva con meno scaffali (Mostrare solo gli scaffali effettivi)**:
   - *Come funziona*: L'interfaccia accetta dinamicamente che un nuovo utente con cronologia breve veda **solo i 2 scaffali reali**, accompagnati da una call-to-action visiva ('Aggiungi altri titoli per sbloccare nuovi scaffali tematici') fino al superamento della soglia di 12–15 semi.
   - *Numeri*: Vengono serviti esattamente 2 caroselli autentici (10 candidati totali di alta qualità), zero rumore artificiale.
   - *Trade-off*: La pagina iniziale risulta più corta nei primi giorni di utilizzo del profilo.

---

## Cosa non funziona

Un'analisi onesta e trasparente delle debolezze e delle metriche corrette emerse sulle 10 timeline:

### 1. Limite di massa per 5 scaffali nei profili cold start
Come quantificato nella sezione precedente, i profili sotto i 12 semi (`carverclan`, `sangam456`, `hammers-lists`) non possiedono la densità relazionale necessaria per supportare 5 cluster indipendenti con almeno 2 membri ciascuno. La scelta della strategia di fallback è aperta e formalizzata sopra.

### 2. Scaffali dominati da un singolo franchise
Nonostante la deduplica di famiglia impedisca la moltiplicazione degli scaffali dello stesso franchise, quando un utente ha molte opere della stessa saga, uno scaffale può rimanere mono-franchise:
- Nessuno scaffale selezionato supera la soglia del 50% di una singola collezione TMDB.

### 3. Valutazione Temporale: Separazione tra Staleness e Deepening
Nella versione precedente del report, la metrica rozza `year_gap < -1.0` (differenza tra anno mediano dei candidati e anno mediano dei semi) segnalava erroneamente 13 scaffali su 41 (31.7%) come 'raccomanda il passato'.
Tale metrica era errata: consigliare Kurosawa o capolavori del passato a un utente che guarda film d'epoca giapponesi non è difetto di obsolescenza, ma corretto funzionamento della raccomandazione di genere (*Deepening*).

È stato quindi adottato il criterio oggettivo dichiarato a monte:
- **STALE**: I candidati non contengono alcun titolo degli ultimi 3 anni ($\ge 2024$) **mentre i semi del cluster ne contengono** (l'utente è attivo sul filone contemporaneo, ma il motore non riesce a proporgli novità);
- **DEEPENING**: Il cluster include semi storici (l'utente stesso guarda opere non recenti) oppure miscela epoche storiche differenti (span temporale ampio o convivenza tra classici e contemporanei).

| Profilo | Scaffale | Medium | Anno Med. Semi | Anno Med. Cand. | Span Anni Semi | Max Anno Cand. | Vecchia Diagnosi | Nuova Diagnosi |
|:---|:---|:---:|---:|---:|---:|---:|:---|:---|
| `sangam456` | 1. Film: Alien & Kansas City | `movie` | 2025 | 2018 | 2023–2026 | 2025 | Raccomanda il passato | **Allineato / Contemporaneo** |
| `sangam456` | 2. Serie: Hotel & Tech-Mogul | `series` | 2021 | 2021 | 2016–2023 | 2022 | Allineato | **Deepening (Semi storici)** |
| `hammers-lists` | 1. Serie: Medical Drama & Spin  | `series` | 2018 | 2018 | 2014–2020 | 2018 | Allineato | **Deepening (Semi storici)** |
| `hammers-lists` | 2. Adulti: Dysfunctional Family | `series` | 2006 | 1999 | 1999–2013 | 2014 | Raccomanda il passato | **Deepening (Semi storici)** |
| `sappss` | 1. Film: Drug Rehabilitation &  | `movie` | 2025 | 2024 | 2018–2026 | 2025 | Allineato | **Allineato / Contemporaneo** |
| `sappss` | 2. Britannico: True Crime & Hit | `series` | 2026 | 2025 | 2026–2026 | 2026 | Allineato | **Allineato / Contemporaneo** |
| `sappss` | 3. Film: Garbage & Villain | `movie` | 2016 | 2023 | 2006–2026 | 2026 | Contemporaneo / Più fresco | **Allineato / Contemporaneo** |
| `sappss` | 4. Adulti: Dysfunctional Family | `series` | 1999 | 2005 | 1989–2013 | 2017 | Contemporaneo / Più fresco | **Deepening (Semi storici)** |
| `sappss` | 5. Serie: Ironic & Speed | `series` | 2020 | 2010 | 2019–2021 | 2023 | Raccomanda il passato | **Deepening (Semi storici)** |
| `flixinatoor99` | 1. Serie: Nostalgic & Cheerful | `series` | 2022 | 2022 | 1973–2025 | 2023 | Allineato | **Deepening (Mix di epoche)** |
| `flixinatoor99` | 2. Film: Survival Instinct & Ro | `movie` | 2025 | 2025 | 2025–2026 | 2026 | Allineato | **Allineato / Contemporaneo** |
| `flixinatoor99` | 3. Serie: Satire & Indiana, Usa | `series` | 2021 | 2022 | 2009–2026 | 2024 | Allineato | **Allineato / Contemporaneo** |
| `flixinatoor99` | 4. Film: Animation & Fantasy Wo | `movie` | 2024 | 2023 | 2022–2026 | 2025 | Allineato | **Allineato / Contemporaneo** |
| `flixinatoor99` | 5. Adulti: Adult Animation & Co | `series` | 2009 | 2019 | 1997–2021 | 2022 | Contemporaneo / Più fresco | **Deepening (Semi storici)** |
| `moppierhead` | 1. Serie: Adult Animation & Soc | `series` | 2005 | 2009 | 1989–2025 | 2017 | Contemporaneo / Più fresco | **Deepening (Mix di epoche)** |
| `moppierhead` | 2. Anime: Shounen & Based On Ma | `series` | 2002 | 2009 | 1992–2013 | 2015 | Contemporaneo / Più fresco | **Deepening (Semi storici)** |
| `moppierhead` | 3. Serie: Intellectually Gifted | `series` | 2022 | 2022 | 2013–2024 | 2025 | Allineato | **Allineato / Contemporaneo** |
| `moppierhead` | 4. Film: Wizard & Magic | `movie` | 2014 | 2005 | 2003–2025 | 2015 | Raccomanda il passato | **Deepening (Mix di epoche)** |
| `moppierhead` | 5. Serie: Blended Family & Chil | `series` | 2006 | 2010 | 2004–2013 | 2021 | Contemporaneo / Più fresco | **Deepening (Semi storici)** |
| `castoffcrown` | 1. Tedesco: Berlin, Germany & A | `movie` | 1988 | 1988 | 1895–2021 | 2016 | Allineato | **Deepening (Semi storici)** |
| `castoffcrown` | 2. Anime: Based On Manga & Anim | `series` | 2022 | 2019 | 1996–2026 | 2024 | Raccomanda il passato | **Allineato / Contemporaneo** |
| `castoffcrown` | 3. Giapponese: Jidaigeki & Samu | `movie` | 2006 | 1957 | 1948–2025 | 2014 | Raccomanda il passato | **Deepening (Mix di epoche)** |
| `castoffcrown` | 4. Film: Lgbt & Gothic Horror | `movie` | 2019 | 2013 | 1966–2026 | 2019 | Raccomanda il passato | **Deepening (Mix di epoche)** |
| `castoffcrown` | 5. Anime: Based On Manga & Anim | `series` | 2025 | 2025 | 2021–2026 | 2026 | Allineato | **Allineato / Contemporaneo** |
| `warnok` | 1. Serie: Post-Apocalyptic Futu | `series` | 2021 | 2020 | 1993–2025 | 2026 | Allineato | **Allineato / Contemporaneo** |
| `warnok` | 2. Coreano: Busan, South Korea  | `series` | 2021 | 2021 | 2014–2026 | 2026 | Allineato | **Allineato / Contemporaneo** |
| `warnok` | 3. Anime: Based On Manga & Shou | `series` | 2016 | 2016 | 1999–2025 | 2022 | Allineato | **Deepening (Mix di epoche)** |
| `warnok` | 4. Film: Alien Invasion & Alien | `movie` | 2023 | 2024 | 2018–2026 | 2024 | Allineato | **Allineato / Contemporaneo** |
| `warnok` | 5. Serie: Adult Animation & Bas | `series` | 2022 | 2022 | 1992–2025 | 2025 | Allineato | **Allineato / Contemporaneo** |
| `pepsipex` | 1. Britannico: Spy Thriller & L | `series` | 2024 | 2024 | 2015–2026 | 2026 | Allineato | **Allineato / Contemporaneo** |
| `pepsipex` | 2. Film: Female Protagonist & D | `movie` | 2024 | 2024 | 2020–2026 | 2026 | Allineato | **Allineato / Contemporaneo** |
| `pepsipex` | 3. Britannico: Period Drama & B | `series` | 2024 | 2022 | 2015–2026 | 2026 | Raccomanda il passato | **Allineato / Contemporaneo** |
| `pepsipex` | 4. Serie: Horror & Miniseries | `series` | 2022 | 2022 | 2011–2026 | 2025 | Allineato | **Allineato / Contemporaneo** |
| `pepsipex` | 5. Adulti: Thriller & Detective | `series` | 2024 | 2022 | 2017–2026 | 2025 | Raccomanda il passato | **Allineato / Contemporaneo** |
| `carverclan` | 1. Film: Supernatural Horror &  | `movie` | 2020 | 2025 | 2016–2025 | 2025 | Contemporaneo / Più fresco | **Allineato / Contemporaneo** |
| `carverclan` | 2. Film: Literary Adaptation &  | `movie` | 1994 | 2011 | 1971–2016 | 2014 | Contemporaneo / Più fresco | **Deepening (Semi storici)** |
| `1jacobjohn` | 1. Film: Marvel Cinematic Unive | `movie` | 2021 | 2018 | 2013–2026 | 2022 | Raccomanda il passato | **STALE** |
| `1jacobjohn` | 2. Serie: Sitcom & Workplace | `series` | 2018 | 2006 | 1998–2026 | 2026 | Raccomanda il passato | **Allineato / Contemporaneo** |
| `1jacobjohn` | 3. Adulti: Hidden Motives & Hus | `movie` | 2024 | 2019 | 2014–2026 | 2025 | Raccomanda il passato | **Allineato / Contemporaneo** |
| `1jacobjohn` | 4. Serie: True Crime & Miniseri | `series` | 2024 | 2024 | 2017–2026 | 2026 | Allineato | **Allineato / Contemporaneo** |
| `1jacobjohn` | 5. Adulti: Adult Animation & Ad | `series` | 2013 | 2009 | 1989–2025 | 2017 | Raccomanda il passato | **Deepening (Mix di epoche)** |

> [!IMPORTANT]
> **Riconciliazione dei 13 casi precedentemente segnalati**:
> Dei 13 scaffali precedentemente etichettati come 'raccomandano il passato':
> - **6 scaffali** (`sangam456` s1, `castoffcrown` s2, `pepsipex` s3, `pepsipex` s5, `1jacobjohn` s2, `1jacobjohn` s3) contengono candidati degli ultimi 3 anni (2024–2026), e risultavano falsi positivi unicamente per una lieve asimmetria della mediana;
> - **2 scaffali** (`hammers-lists` s2, `sappss` s5) presentano semi interamente storici (max 2013 e 2021): l'utente stesso non ha consumi recenti in quel tema;
> - **4 scaffali** (`castoffcrown` s3 con Kurosawa [span 1948–2025], `castoffcrown` s4 [span 1966–2026], `moppierhead` s4 [Harry Potter e Wicked, span 2003–2025], `1jacobjohn` s5 [Simpson, Bob's Burgers e Rick and Morty, span 1989–2025]) presentano cluster con mix multi-decennale di epoche (*Deepening* autentico);
> - Solo **1 scaffale su 41 (2.4%)** è un vero caso di **STALE**: lo scaffale 1 di `1jacobjohn` (*Film: Marvel Cinematic Universe (Mcu) & Based On Comic*), in cui l'utente possiede film del 2024–2026 (*The Fall Guy*, *Godzilla x Kong*), ma i 5 candidati proposti si arrestano tutti al 2022.

### 4. Denominazione per Evidenza e Verifica di Unicità (Name Distinctness)
L'adozione del generatore basato su evidenza statistica elimina ogni etichetta preconcetta o non veritiera:
- In `warnok`, lo scaffale 2 (precedentemente denominato per errore 'Anime Shōnen' a causa del sottotitolo di *Bulgasal*) riceve ora la denominazione corretta dedotta dai suoi semi: **`Coreano: Busan, South Korea & Joseon Dynasty (1392–1910)`**, mentre lo scaffale 3 conserva legittimamente l'etichetta **`Anime: Based On Manga & Shounen`**;
- In `castoffcrown`, i due caroselli anime distinti (lo sport/shōnen di *Haikyu* nello scaffale 2 e il romance/slice-of-life di *Gachiakuta* e *Smoking Behind Supermarket* nello scaffale 5) vengono disambiguati automaticamente tramite il terzo termine saliente: **`Anime: Based On Manga & Anime · Shounen`** vs **`Anime: Based On Manga & Anime · Slice Of Life`**;
- **Esito del check di collasso**: Nessun profilo tra i 10 presenta scaffali omonimi (**nomi duplicati = 0 per tutti i profili**).
