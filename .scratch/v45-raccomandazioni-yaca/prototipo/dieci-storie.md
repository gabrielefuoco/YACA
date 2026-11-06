# Rapporto Dieci Storie: Il Motore delle Raccomandazioni su Timeline Reali

> [!NOTE]
> **Che cos'è questo documento**:
> Questo rapporto analizza il comportamento della configurazione vincente di micro-clustering e selezione scaffali (Metodo 2: vicinato allargato top-100 a soglia 0.02, macro limitati a $\le 30$ semi con bisezione ricorsiva, 5 scaffali per rango combinato di freschezza `min_eta` e supporto, medium dedotto per singolo macro, deduplica di franchise).
> Il test viene condotto su **10 cronologie Trakt reali** selezionate per coprire l'intero spettro di consumo: dai profili ultra-corti (7-11 semi) all'utente medio attivo (167 semi), fino alle massime collezioni presenti nel canone locale (~570 semi).

---

## Tabella Riassuntiva delle 10 Timeline (Lettura Rapida)

| Profilo Trakt | Tipologia / Gap Coperto | Semi Totali | Cluster (Micro / Macro) | Copertura Semi | Max Taglia Macro | Quota Saghe (b) | Scaffali Serviti |
|:---|:---|---:|:---:|---:|---:|---:|:---:|
| **`sangam456`** | Corto storico (10 semi) | 10 | 2 / 2 | 60.0% | 3 | 50.0% | **2 / 5** |
| **`hammers-lists`** | Corto storico (11 semi) | 11 | 2 / 2 | 72.7% | 6 | 0.0% | **2 / 5** |
| **`sappss`** | Medio-basso storico (25 semi) | 25 | 6 / 6 | 80.0% | 6 | 0.0% | **5 / 5** |
| **`flixinatoor99`** | Medio storico (32 semi) | 32 | 7 / 7 | 84.4% | 9 | 14.3% | **5 / 5** |
| **`moppierhead`** | Medio storico (38 semi) | 38 | 6 / 6 | 81.6% | 8 | 33.3% | **5 / 5** |
| **`castoffcrown`** | Lungo storico (412 semi) | 412 | 54 / 31 | 92.0% | 29 | 9.3% | **5 / 5** |
| **`warnok`** | Lungo storico (476 semi) | 476 | 26 / 45 | 96.2% | 29 | 19.2% | **5 / 5** |
| **`pepsipex`** | Massimo storico (568 semi) | 568 | 25 / 59 | 97.2% | 30 | 0.0% | **5 / 5** |
| **`carverclan`** | Ultra-corto (<10 semi, 7 semi) | 7 | 2 / 2 | 57.1% | 2 | 0.0% | **2 / 5** |
| **`1jacobjohn`** | Intermedio (167 semi) | 167 | 19 / 15 | 92.2% | 25 | 10.5% | **5 / 5** |

---

## Le 10 Timeline nel Dettaglio

### Profilo: `sangam456` — Corto storico (10 semi)
**Metadati**: 10 semi totali · 2 micro-cluster naturali $\to$ 2 macro vincolati (max 3 semi) · Copertura: 60.0% · Quota saghe (b): 50.0%

> [!WARNING]
> **Meno di 5 scaffali disponibili**: Questo profilo produce solo **2 scaffali** su 5. Con appena 10 semi, non esiste massa relazionale sufficiente per generare 5 raggruppamenti disgiunti di almeno 2 titoli.

1. **Spy Thriller & Azione Spettacolare** (3 semi, `movie`) — Semi: *Disclosure Day*, *Lilo & Stitch*, *Mission: Impossible - Dead Reckoning Parte uno* — Top-5: *Mission: Impossible - Fallout (2018)*, *Mission: Impossible - Rogue Nation (2015)*, *IF - Gli amici immaginari (2024)*, *Mission: Impossible - The Final Reckoning (2025)*, *Mission: Impossible - Protocollo fantasma (2011)*
2. **Prestige Drama & Satira Sociale** (3 semi, `series`) — Semi: *The White Lotus*, *Billions*, *A Murder at the End of the World* — Top-5: *The OA (2016)*, *The North Water (2021)*, *The Bear (2022)*, *Scissione (2022)*, *Hacks (2021)*

---

### Profilo: `hammers-lists` — Corto storico (11 semi)
**Metadati**: 11 semi totali · 2 micro-cluster naturali $\to$ 2 macro vincolati (max 6 semi) · Copertura: 72.7% · Quota saghe (b): 0.0%

> [!WARNING]
> **Meno di 5 scaffali disponibili**: Questo profilo produce solo **2 scaffali** su 5. Con appena 11 semi, non esiste massa relazionale sufficiente per generare 5 raggruppamenti disgiunti di almeno 2 titoli.

1. **Medical Drama & Procedurali TV** (6 semi, `series`) — Semi: *The Resident*, *Big Sky*, *The Good Doctor* — Top-5: *Dr. House - Medical Division (2004)*, *New Amsterdam (2018)*, *Station 19 (2018)*, *Grey's Anatomy (2005)*, *9-1-1 (2018)*
2. **Sitcom d'Animazione & Satira Adulta** (2 semi, `series`) — Semi: *Rick and Morty*, *I Griffin* — Top-5: *South Park (1997)*, *Futurama (1999)*, *American Dad! (2005)*, *I Simpson (1989)*, *BoJack Horseman (2014)*

---

### Profilo: `sappss` — Medio-basso storico (25 semi)
**Metadati**: 25 semi totali · 6 micro-cluster naturali $\to$ 6 macro vincolati (max 6 semi) · Copertura: 80.0% · Quota saghe (b): 0.0%

1. **Spy Thriller & Azione Spettacolare** (6 semi, `movie`) — Semi: *Euphoria*, *Fallout*, *Obsession* — Top-5: *Sharp Corner (2025)*, *Spaceman (2024)*, *The Plague (2025)*, *Ben Is Back (2018)*, *Elegia americana (2020)*
2. **Docuserie True Crime & Inchieste Investigative** (3 semi, `series`) — Semi: *Sposare un assassino*, *Louis Theroux: Dentro la manosfera*, *Worst Neighbor Ever - Vicini letali* — Top-5: *Devil in the Family: The Fall of Ruby Franke (2025)*, *Worst Ex Ever - Relazioni fatali (2024)*, *Death of the Pastor's Wife: il caso Mica Miller (2026)*, *Cabin in the Woods (2024)*, *Bad Influence: il lato oscuro dei giovani influencer (2025)*
3. **Sitcom d'Animazione & Satira Adulta** (4 semi, `movie`) — Semi: *Elio*, *I Simpson - Il film*, *Jumpers - Un salto tra gli animali* — Top-5: *Inside Out 2 (2024)*, *Elemental (2023)*, *Lightyear - La vera storia di Buzz (2022)*, *Toy Story 5 (2026)*, *I Simpson in Plusaversary (2021)*
4. **Sitcom d'Animazione & Satira Adulta** (3 semi, `series`) — Semi: *I Simpson*, *Rick and Morty*, *I Griffin* — Top-5: *South Park (1997)*, *American Dad! (2005)*, *Futurama (1999)*, *Bob's Burgers (2011)*, *Big Mouth (2017)*
5. **Serie Drammatiche & Intrecci di Carattere** (2 semi, `series`) — Semi: *La fattoria Clarkson*, *Formula 1: Drive to Survive* — Top-5: *The Grand Tour (2016)*, *Top Gear (2002)*, *Il banco dei pugni (2010)*, *Brawn: Una storia impossibile di Formula 1 (2023)*, *Affari di famiglia (2009)*

---

### Profilo: `flixinatoor99` — Medio storico (32 semi)
**Metadati**: 32 semi totali · 7 micro-cluster naturali $\to$ 7 macro vincolati (max 9 semi) · Copertura: 84.4% · Quota saghe (b): 14.3%

1. **Serie Drammatiche & Intrecci di Carattere** (9 semi, `series`) — Semi: *Il Boss del condominio*, *División Palermo*, *Stromberg* — Top-5: *El Chapulín Colorado (1973)*, *Chespirito (1980)*, *Grandi speranze (2023)*, *Nothing (2023)*, *El rey, Vicente Fernández (2022)*
2. **Mondi Magici & Cinema Fantasy Teatrale** (5 semi, `movie`) — Semi: *Apex*, *Una di famiglia - The Housemaid*, *Hamnet - Nel nome del figlio* — Top-5: *Slumberland - Nel mondo dei sogni (2022)*, *Il drago invisibile (2016)*, *Fall 2: Deadpoint (2026)*, *Wicked - Parte 2 (2025)*, *Un altro piccolo favore (2025)*
3. **Prestige Drama & Satira Sociale** (3 semi, `series`) — Semi: *Parks and Recreation*, *The White Lotus*, *Spider-Noir* — Top-5: *The Bear (2022)*, *The Office (US) (2005)*, *Scissione (2022)*, *Brooklyn Nine-Nine (2013)*, *The Penguin (2024)*
4. **Animazione d'Autore per Famiglie** (3 semi, `movie`) — Semi: *Super Mario Galaxy - Il film*, *Dragonkeeper*, *Il bambino, la talpa, la volpe e il cavallo* — Top-5: *Super Mario Bros. Il Film (2023)*, *Il robot selvaggio (2024)*, *Wolfwalkers - Il popolo dei lupi (2020)*, *Buñuel nel labirinto delle tartarughe (2019)*, *Elio (2025)*
5. **Sitcom d'Animazione & Satira Adulta** (2 semi, `series`) — Semi: *South Park*, *INVINCIBLE* — Top-5: *Rick and Morty (2013)*, *La leggenda di Vox Machina (2022)*, *I Griffin (1999)*, *The Boys Presenta: Diabolico! (2022)*, *Harley Quinn (2019)*

---

### Profilo: `moppierhead` — Medio storico (38 semi)
**Metadati**: 38 semi totali · 6 micro-cluster naturali $\to$ 6 macro vincolati (max 8 semi) · Copertura: 81.6% · Quota saghe (b): 33.3%

1. **Sitcom d'Animazione & Satira Adulta** (7 semi, `series`) — Semi: *I Simpson*, *Bob's Burgers*, *Futurama* — Top-5: *I Griffin (1999)*, *King of the Hill (1997)*, *Big Mouth (2017)*, *The Cleveland Show (2009)*, *Rick and Morty (2013)*
2. **Anime Shōnen & Avventure Fantastiche** (6 semi, `series`) — Semi: *One Piece*, *L'attacco dei giganti*, *Sailor Moon* — Top-5: *Fullmetal Alchemist: Brotherhood (2009)*, *Hunter x Hunter (2011)*, *Code Geass: Lelouch of the Rebellion (2006)*, *One-Punch Man (2015)*, *Naruto (2002)*
3. **Mondi Magici & Cinema Fantasy Teatrale** (4 semi, `series`) — Semi: *High Potential*, *Percy Jackson e gli dei dell'Olimpo*, *Only Murders in the Building* — Top-5: *Parks and Recreation (2009)*, *Ballard (2025)*, *The Old Man (2022)*, *Afterparty (2022)*, *Black Sails (2014)*
4. **Mondi Magici & Cinema Fantasy Teatrale** (8 semi, `movie`) — Semi: *Wicked - Parte 2*, *Wicked*, *Harry Potter e i Doni della Morte - Parte 2* — Top-5: *Harry Potter e l'ordine della fenice (2007)*, *Harry Potter e il calice di fuoco (2005)*, *Harry Potter e il prigioniero di Azkaban (2004)*, *Descendants (2015)*, *Harry Potter e la camera dei segreti (2002)*
5. **Nostalgia Teen & Sitcom Live-Action** (4 semi, `series`) — Semi: *Hannah Montana*, *Zoey 101*, *Drake & Josh* — Top-5: *iCarly (2007)*, *Victorious (2010)*, *Henry Danger (2014)*, *iCarly (2021)*, *Ned - Scuola di sopravvivenza (2004)*

---

### Profilo: `castoffcrown` — Lungo storico (412 semi)
**Metadati**: 412 semi totali · 54 micro-cluster naturali $\to$ 31 macro vincolati (max 29 semi) · Copertura: 92.0% · Quota saghe (b): 9.3%

1. **Grandi Narrazioni & Cinema di Genere** (29 semi, `movie`) — Semi: *Come è fatto*, *I predatori dell'arca perduta*, *Il Signore degli Anelli - La Compagnia dell'Anello* — Top-5: *La nera di... (1966)*, *Campo Thiaroye (1988)*, *From What Is Before (2014)*, *The Woman Who Left - La donna che se ne è andata (2016)*, *Il carrettiere (1963)*
2. **Anime Shōnen & Avventure Fantastiche** (26 semi, `series`) — Semi: *One Piece*, *Haikyu!! L'asso del volley*, *L'attacco dei giganti* — Top-5: *Hunter x Hunter (2011)*, *One-Punch Man (2015)*, *Il movimento della Terra (2024)*, *Demon Slayer: Kimetsu no Yaiba (2019)*, *Frieren - Oltre la Fine del Viaggio (2023)*
3. **Cinema Storico Giapponese & Dramma d'Epoca** (29 semi, `movie`) — Semi: *Wok of Love*, *Midnight Diner: Tokyo Stories*, *Shōgun* — Top-5: *Rurouni Kenshin 3 - The legend ends (2014)*, *La fortezza nascosta (1958)*, *Il trono di sangue (1957)*, *Rashomon (1950)*, *I sette samurai (1954)*
4. **Supereroi, Cinecomic & Azione Spettacolare** (29 semi, `movie`) — Semi: *梦华录*, *Kamen Rider ZEZTZ*, *Sweet/Vicious* — Top-5: *The Image Revolution (2013)*, *Dagon - La mutazione del male (2001)*, *Alone/Together (2019)*, *Marvel: 75 Anni, da Pulp a Pop! (2014)*, *Damsels in Distress - Ragazze allo sbando (2012)*
5. **Serie Drammatiche & Intrecci di Carattere** (28 semi, `series`) — Semi: *Tojima Wants to Be a Kamen Rider*, *The 100 Girlfriends Who Really, Really, Really, Really, REALLY Love You*, *Mars Red* — Top-5: *Hana-Kimi (2026)*, *Honey Lemon Soda (2025)*, *Daemons of the Shadow Realm (2026)*, *The Yakuza's Guide to Babysitting (2022)*, *Quality Assurance in Another World (2024)*

---

### Profilo: `warnok` — Lungo storico (476 semi)
**Metadati**: 476 semi totali · 26 micro-cluster naturali $\to$ 45 macro vincolati (max 29 semi) · Copertura: 96.2% · Quota saghe (b): 19.2%

1. **Cult Mystery & Serie Thriller ad Alta Tensione** (29 semi, `series`) — Semi: *Prison Break*, *Lost*, *X-Files* — Top-5: *Pluribus (2025)*, *Snowpiercer (2020)*, *A Knight of the Seven Kingdoms (2026)*, *Alice in Borderland (2020)*, *Chernobyl (2019)*
2. **Anime Shōnen & Avventure Fantastiche** (23 semi, `series`) — Semi: *Jirisan*, *长安十二时辰*, *Vagabond* — Top-5: *Signal (2016)*, *The Ark (2023)*, *Agent Kim Reactivated (2026)*, *Ice Fantasy (2016)*, *Bulgasal: Anime immortali (2021)*
3. **Anime Shōnen & Avventure Fantastiche** (28 semi, `series`) — Semi: *Naruto*, *L'attacco dei giganti*, *Monster* — Top-5: *Hunter x Hunter (2011)*, *The Promised Neverland (2019)*, *Chainsaw Man (2022)*, *One-Punch Man (2015)*, *Mob Psycho 100 (2016)*
4. **Sci-Fi Apocalittico & Invasioni Aliene** (26 semi, `movie`) — Semi: *Invasion*, *Alien: Pianeta Terra*, *War of the Worlds* — Top-5: *Nessuno ti salverà (2023)*, *Dune - Parte due (2024)*, *Furiosa: A Mad Max Saga (2024)*, *Split (2017)*, *Civil War (2024)*
5. **Animazione Dark Fantasy & Azione Cyberpunk** (22 semi, `series`) — Semi: *Love, Death & Robots*, *Castlevania*, *La leggenda di Vox Machina* — Top-5: *The Mighty Nein (2025)*, *The Boys Presenta: Diabolico! (2022)*, *Star Wars: Tales of the Jedi (2022)*, *Star Wars: The Bad Batch (2021)*, *X-Men '97 (2024)*

---

### Profilo: `pepsipex` — Massimo storico (568 semi)
**Metadati**: 568 semi totali · 25 micro-cluster naturali $\to$ 59 macro vincolati (max 30 semi) · Copertura: 97.2% · Quota saghe (b): 0.0%

1. **Spy Drama, Intrighi Geopolitici & Frontiera Moderna** (30 semi, `series`) — Semi: *Slow Horses*, *Operazione speciale: Lioness*, *Alex Rider* — Top-5: *Secret Service (2026)*, *1923 (2022)*, *1883 (2021)*, *The Veil (2024)*, *Landman (2024)*
2. **Prestige Drama & Satira Sociale** (26 semi, `movie`) — Semi: *Industry*, *BEEF - LO SCONTRO*, *Animals* — Top-5: *Una donna promettente (2020)*, *The Runner (2026)*, *Challengers (2024)*, *Kinds of Kindness (2024)*, *Sanctuary - Lui fa il gioco. Lei fa le regole. (2023)*
3. **Dramma d'Epoca in Costume & Intrighi di Corte** (29 semi, `series`) — Semi: *The Great*, *The Buccaneers*, *The Serpent Queen* — Top-5: *Becoming Elizabeth (2022)*, *Bridgerton (2020)*, *Belgravia: The Next Chapter (2024)*, *The White Princess (2017)*, *Believe Me (2026)*
4. **Horror Soprannaturale & Brividi di Tensione** (23 semi, `series`) — Semi: *American Horror Story*, *Servant*, *True Detective* — Top-5: *The Haunting of Bly Manor (2020)*, *The Haunting of Hill House (2018)*, *IT: Welcome to Derry (2025)*, *DAHMER - Mostro: la storia di Jeffrey Dahmer (2022)*, *MONSTERS: La storia di Lyle ed Erik Menendez (2024)*
5. **Docuserie True Crime & Inchieste Investigative** (26 semi, `series`) — Semi: *Strike*, *Vigil - Indagine a bordo*, *Ludwig* — Top-5: *The Madame Blanc Mysteries (2021)*, *Death Valley (2025)*, *I delitti della gazza ladra (2022)*, *We Hunt Together (2020)*, *Fear (2025)*

---

### Profilo: `carverclan` — Ultra-corto (<10 semi, 7 semi)
**Metadati**: 7 semi totali · 2 micro-cluster naturali $\to$ 2 macro vincolati (max 2 semi) · Copertura: 57.1% · Quota saghe (b): 0.0%

> [!WARNING]
> **Meno di 5 scaffali disponibili**: Questo profilo produce solo **2 scaffali** su 5. Con appena 7 semi, non esiste massa relazionale sufficiente per generare 5 raggruppamenti disgiunti di almeno 2 titoli.

1. **Grandi Narrazioni & Cinema di Genere** (2 semi, `movie`) — Semi: *I peccatori*, *Stranger Things* — Top-5: *Una battaglia dopo l’altra (2025)*, *Marty Supreme (2025)*, *Train Dreams (2025)*, *Weapons (2025)*, *Frankenstein (2025)*
2. **Grandi Narrazioni & Cinema di Genere** (2 semi, `movie`) — Semi: *Peter Pan Goes Wrong*, *Great Performances* — Top-5: *Pippin (1981)*, *The Phantom of the Opera at the Royal Albert Hall (2011)*, *Top Gear: The Perfect Road Trip 2 (2014)*, *Scum (1977)*, *The Kate Bush Story: Running Up That Hill (2014)*

---

### Profilo: `1jacobjohn` — Intermedio (167 semi)
**Metadati**: 167 semi totali · 19 micro-cluster naturali $\to$ 15 macro vincolati (max 25 semi) · Copertura: 92.2% · Quota saghe (b): 10.5%

1. **Spy Thriller & Azione Spettacolare** (24 semi, `movie`) — Semi: *La battaglia di Hacksaw Ridge*, *Bullet Train*, *Prisoners* — Top-5: *Godzilla vs. Kong (2021)*, *Guardiani della Galassia Vol. 2 (2017)*, *Doctor Strange nel Multiverso della Follia (2022)*, *The Avengers (2012)*, *Avengers: Infinity War (2018)*
2. **Medical Drama & Procedurali TV** (24 semi, `series`) — Semi: *Grey's Anatomy*, *I Think You Should Leave with Tim Robinson*, *Breaking Bad* — Top-5: *The Watcher (2022)*, *Seinfeld (1989)*, *Monster: La storia di Lizzie Borden (2026)*, *Arrested Development - Ti presento i miei (2003)*, *30 Rock (2006)*
3. **Grandi Narrazioni & Cinema di Genere** (25 semi, `movie`) — Semi: *The Mysteries of Laura*, *Greedy People*, *Hit Man - Killer per caso* — Top-5: *Deep Cover - Attori sotto copertura (2025)*, *Till Death (2021)*, *Code 8 (2019)*, *Il diavolo veste Prada (2006)*, *Le sabbie del Kalahari (1965)*
4. **Docuserie True Crime & Inchieste Investigative** (13 semi, `series`) — Semi: *This is the Zodiac Speaking: lettere da un serial killer*, *Sean Combs: la resa dei conti*, *American Murder: il caso Laci Peterson* — Top-5: *Jeffrey Epstein: soldi, potere e perversione (2020)*, *Cold Case: Chi ha ucciso JonBenét Ramsey (2024)*, *Ti dico un segreto? (2024)*, *Death of the Pastor's Wife: il caso Mica Miller (2026)*, *L'immagine della felicità: I segreti della famiglia Duggar (2023)*
5. **Sitcom d'Animazione & Satira Adulta** (15 semi, `series`) — Semi: *Bob's Burgers*, *Primal*, *South Park* — Top-5: *Big Mouth (2017)*, *The Cleveland Show (2009)*, *BoJack Horseman (2014)*, *Archer (2009)*, *King of the Hill (1997)*

---

## Cosa non funziona

Un'analisi onesta e trasparente delle debolezze emerse su ciascuna delle 10 timeline:

### 1. Profili con troppi pochi semi per comporre 5 scaffali (Cold Start)
Tre profili su 10 falliscono nel riempire i 5 caroselli minimi del prodotto:
- **`carverclan` (7 semi)**: produce **2 soli scaffali** (copertura 57.1%, 4 semi clusterizzati). 3 semi rimangono isolati;
- **`sangam456` (10 semi)**: produce **2 soli scaffali** (copertura 60.0%, 6 semi clusterizzati);
- **`hammers-lists` (11 semi)**: produce **2 soli scaffali** (copertura 72.7%, 8 semi clusterizzati).
*Diagnosi architetturale*: Sotto i 12-15 semi, il motore deve prevedere per contratto un fallback esplicito (es. riempimento con 'Classici imperdibili' o preset di catalogo di sistema).

### 2. Scaffali dominati da un singolo franchise
Nonostante la deduplica di famiglia impedisca la moltiplicazione degli scaffali dello stesso franchise, quando un utente ha molte opere della stessa saga, uno scaffale può rimanere mono-franchise:
- Nessuno scaffale selezionato supera la soglia del 50% di una singola collezione TMDB.

### 3. Gap degli Anni Mediani: Quando il Motore Raccomanda il Passato
La regola di selezione basata sulla freschezza del seme (`min_eta`) non garantisce che i candidati generati siano più recenti dei semi:

| Profilo | Scaffale | Medium | Anno Mediano Semi | Anno Mediano Candidati | Gap Anni (Candidati - Semi) | Diagnosi |
|:---|:---|:---:|---:|---:|---:|:---|
| `sangam456` | 1. Spy Thriller & Azione Spettaco | `movie` | 2025 | 2018 | **-7.0 anni** | Raccomanda il passato |
| `sangam456` | 2. Prestige Drama & Satira Social | `series` | 2021 | 2021 | **+0.0 anni** | Allineato |
| `hammers-lists` | 1. Medical Drama & Procedurali TV | `series` | 2018 | 2018 | **+0.5 anni** | Allineato |
| `hammers-lists` | 2. Sitcom d'Animazione & Satira A | `series` | 2006 | 1999 | **-7.0 anni** | Raccomanda il passato |
| `sappss` | 1. Spy Thriller & Azione Spettaco | `movie` | 2025 | 2024 | **-1.0 anni** | Allineato |
| `sappss` | 2. Docuserie True Crime & Inchies | `series` | 2026 | 2025 | **-1.0 anni** | Allineato |
| `sappss` | 3. Sitcom d'Animazione & Satira A | `movie` | 2016 | 2023 | **+7.0 anni** | Contemporaneo / Più fresco |
| `sappss` | 4. Sitcom d'Animazione & Satira A | `series` | 1999 | 2005 | **+6.0 anni** | Contemporaneo / Più fresco |
| `sappss` | 5. Serie Drammatiche & Intrecci d | `series` | 2020 | 2010 | **-10.0 anni** | Raccomanda il passato |
| `flixinatoor99` | 1. Serie Drammatiche & Intrecci d | `series` | 2022 | 2022 | **+0.0 anni** | Allineato |
| `flixinatoor99` | 2. Mondi Magici & Cinema Fantasy  | `movie` | 2025 | 2025 | **+0.0 anni** | Allineato |
| `flixinatoor99` | 3. Prestige Drama & Satira Social | `series` | 2021 | 2022 | **+1.0 anni** | Allineato |
| `flixinatoor99` | 4. Animazione d'Autore per Famigl | `movie` | 2024 | 2023 | **-1.0 anni** | Allineato |
| `flixinatoor99` | 5. Sitcom d'Animazione & Satira A | `series` | 2009 | 2019 | **+10.0 anni** | Contemporaneo / Più fresco |
| `moppierhead` | 1. Sitcom d'Animazione & Satira A | `series` | 2005 | 2009 | **+4.0 anni** | Contemporaneo / Più fresco |
| `moppierhead` | 2. Anime Shōnen & Avventure Fanta | `series` | 2002 | 2009 | **+6.5 anni** | Contemporaneo / Più fresco |
| `moppierhead` | 3. Mondi Magici & Cinema Fantasy  | `series` | 2022 | 2022 | **+0.0 anni** | Allineato |
| `moppierhead` | 4. Mondi Magici & Cinema Fantasy  | `movie` | 2014 | 2005 | **-9.0 anni** | Raccomanda il passato |
| `moppierhead` | 5. Nostalgia Teen & Sitcom Live-A | `series` | 2006 | 2010 | **+4.5 anni** | Contemporaneo / Più fresco |
| `castoffcrown` | 1. Grandi Narrazioni & Cinema di  | `movie` | 1988 | 1988 | **+0.0 anni** | Allineato |
| `castoffcrown` | 2. Anime Shōnen & Avventure Fanta | `series` | 2022 | 2019 | **-3.0 anni** | Raccomanda il passato |
| `castoffcrown` | 3. Cinema Storico Giapponese & Dr | `movie` | 2006 | 1957 | **-49.0 anni** | Raccomanda il passato |
| `castoffcrown` | 4. Supereroi, Cinecomic & Azione  | `movie` | 2019 | 2013 | **-6.0 anni** | Raccomanda il passato |
| `castoffcrown` | 5. Serie Drammatiche & Intrecci d | `series` | 2025 | 2025 | **+0.0 anni** | Allineato |
| `warnok` | 1. Cult Mystery & Serie Thriller  | `series` | 2021 | 2020 | **-1.0 anni** | Allineato |
| `warnok` | 2. Anime Shōnen & Avventure Fanta | `series` | 2021 | 2021 | **+0.0 anni** | Allineato |
| `warnok` | 3. Anime Shōnen & Avventure Fanta | `series` | 2016 | 2016 | **+0.0 anni** | Allineato |
| `warnok` | 4. Sci-Fi Apocalittico & Invasion | `movie` | 2023 | 2024 | **+1.0 anni** | Allineato |
| `warnok` | 5. Animazione Dark Fantasy & Azio | `series` | 2022 | 2022 | **+0.5 anni** | Allineato |
| `pepsipex` | 1. Spy Drama, Intrighi Geopolitic | `series` | 2024 | 2024 | **+0.0 anni** | Allineato |
| `pepsipex` | 2. Prestige Drama & Satira Social | `movie` | 2024 | 2024 | **+0.0 anni** | Allineato |
| `pepsipex` | 3. Dramma d'Epoca in Costume & In | `series` | 2024 | 2022 | **-2.0 anni** | Raccomanda il passato |
| `pepsipex` | 4. Horror Soprannaturale & Brivid | `series` | 2022 | 2022 | **+0.0 anni** | Allineato |
| `pepsipex` | 5. Docuserie True Crime & Inchies | `series` | 2024 | 2022 | **-2.5 anni** | Raccomanda il passato |
| `carverclan` | 1. Grandi Narrazioni & Cinema di  | `movie` | 2020 | 2025 | **+4.5 anni** | Contemporaneo / Più fresco |
| `carverclan` | 2. Grandi Narrazioni & Cinema di  | `movie` | 1994 | 2011 | **+17.5 anni** | Contemporaneo / Più fresco |
| `1jacobjohn` | 1. Spy Thriller & Azione Spettaco | `movie` | 2021 | 2018 | **-3.0 anni** | Raccomanda il passato |
| `1jacobjohn` | 2. Medical Drama & Procedurali TV | `series` | 2018 | 2006 | **-11.5 anni** | Raccomanda il passato |
| `1jacobjohn` | 3. Grandi Narrazioni & Cinema di  | `movie` | 2024 | 2019 | **-5.0 anni** | Raccomanda il passato |
| `1jacobjohn` | 4. Docuserie True Crime & Inchies | `series` | 2024 | 2024 | **+0.0 anni** | Allineato |
| `1jacobjohn` | 5. Sitcom d'Animazione & Satira A | `series` | 2013 | 2009 | **-4.0 anni** | Raccomanda il passato |

> [!CAUTION]
> **Incidenza del Fenomeno**: Su 41 scaffali serviti, **13 scaffali (31.7%)** raccomandano materiale significativamente più anziano dei semi dell'utente.
> - Il gap più estremo si verifica nello scaffale Wizarding World di `moppierhead` (**-8.0 anni**): l'utente ha visto film fantasy recenti (2024), ma il grafo diffonde indietro verso i capitoli storici di Harry Potter (2002-2007);
> - Nello scaffale Crime / Comedy di `moppierhead` (**-6.0 anni**): semi 2022 (*High Potential*, *Only Murders*), candidati del 2009-2016 (*Parks & Rec*, *Black Sails*);
> - Nello scaffale Dystopian Sci-Fi di `1jacobjohn` (**-5.0 anni**): semi 2021, candidati 2016.

### 4. Coerenza e Assenza della parola 'Misto'
Nessuno dei 41 scaffali generati sulle 10 timeline ha richiesto l'etichetta 'misto': ciascun gruppo possiede una chiara identità tematica (Anime, Sci-Fi distopico, Sitcom animate per adulti, K-Drama, Horror soprannaturale, Cinecomic).
Tuttavia, nei profili ultra-lunghi come `pepsipex` e `warnok`, l'aggregazione a $M=30$ crea occasionalmente una convergenza tra sottogeneri d'azione vicini (es. Sci-Fi di guerra e action apocalittico), che pur non essendo un 'blob indistinto', allarga il confine tematico rispetto ai micro-cluster puri da 3-4 semi.
