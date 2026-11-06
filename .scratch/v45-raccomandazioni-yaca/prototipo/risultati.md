# Prototipo Cluster Personali di Interesse (Ticket 05)

## 1. Obiettivo e Strategie a Confronto

In sostituzione della partizione fissa globale in bolle (V10), questo prototipo confronta due strategie per raggruppare i semi personali di ciascun profilo utente:
- **Strategia A (Affinità su Grafo)**: similarità coseno sui vettori riga della transizione V45 potata (pota=16), seguita da clustering gerarchico deterministico con vincolo $k \in [2, 6]$;
- **Strategia B (Vicinato Condiviso)**: similarità di Jaccard tra gli insiemi di vicini uscenti top-16 (approccio leggero a costo zero di diffusione).

Campione: 8 profili reali Trakt stratificati deterministicamente per lunghezza storia:
- 2 corti (< 20 semi): `sangam456`, `hammers-lists`
- 3 medi (20-80 semi): `sappss`, `moppierhead`, `flixinatoor99`
- 3 lunghi (> 80 semi): `warnok`, `pepsipex`, `castoffcrown`

---

## 2. Tabella Comparativa Compatta (Tutti gli 8 Profili)

| Utente | Semi | Medium | Strat. | Cluster (k) | Cardinalità | Copertura (%) | Non raggruppati | Distinctness (overlap top-10) | Drift Decade |
|:-------|-----:|:-------|:------:|------------:|:------------|--------------:|----------------:|------------------------------:|-------------:|
| `sangam456` | 10 | movie | **A** | 1 | [2] | 20.0% | 8 | 0.00 | 10.0% |
| `sangam456` | 10 | movie | **B** | 1 | [2] | 20.0% | 8 | 0.00 | 10.0% |
| `hammers-lists` | 11 | series | **A** | 2 | [5, 2] | 63.6% | 4 | 0.00 | 60.0% |
| `hammers-lists` | 11 | series | **B** | 2 | [5, 2] | 63.6% | 4 | 0.00 | 60.0% |
| `sappss` | 25 | series | **A** | 4 | [3, 3, 2, 2] | 40.0% | 15 | 0.00 | 50.0% |
| `sappss` | 25 | series | **B** | 5 | [3, 2, 2, 2, 2] | 44.0% | 14 | 0.00 | 48.0% |
| `moppierhead` | 38 | series | **A** | 6 | [5, 5, 4, 4, 2, 2] | 57.9% | 16 | 0.01 | 61.7% |
| `moppierhead` | 38 | series | **B** | 6 | [6, 5, 5, 4, 2, 2] | 63.2% | 14 | 0.00 | 66.7% |
| `flixinatoor99` | 32 | movie | **A** | 2 | [3, 2] | 15.6% | 27 | 0.00 | 85.0% |
| `flixinatoor99` | 32 | movie | **B** | 4 | [3, 2, 2, 2] | 28.1% | 23 | 0.00 | 67.5% |
| `warnok` | 476 | movie | **A** | 6 | [29, 19, 14, 14, 13, 13] | 21.4% | 374 | 0.00 | 50.0% |
| `warnok` | 476 | movie | **B** | 6 | [34, 20, 16, 15, 15, 13] | 23.7% | 363 | 0.00 | 43.3% |
| `pepsipex` | 568 | movie | **A** | 6 | [18, 14, 13, 13, 13, 11] | 14.4% | 486 | 0.01 | 21.7% |
| `pepsipex` | 568 | movie | **B** | 6 | [20, 16, 15, 14, 14, 11] | 15.8% | 478 | 0.00 | 33.3% |
| `castoffcrown` | 412 | series | **A** | 6 | [10, 8, 8, 7, 7, 7] | 11.4% | 365 | 0.00 | 46.7% |
| `castoffcrown` | 412 | series | **B** | 6 | [11, 10, 9, 8, 7, 7] | 12.6% | 360 | 0.00 | 30.0% |

---

## 3. Dettaglio Approfondito su 2 Profili Rappresentativi

### Profilo Medio (38 semi) — Utente `moppierhead` (38 semi, prevalentemente `series`)

#### Strategia A (Affinità Coseno su Grafo V45)
- **Cluster generati**: 6 (dimensioni: [5, 5, 4, 4, 2, 2])
- **Copertura semi**: 57.9% (22/38) — non raggruppati: 16
- **Distinctness (sovrapposizione media top-10)**: `0.01` (più basso = liste più diversificate tra cluster)
- **Drift di decade medio**: `61.7%`

**Cluster 1** (5 semi, decade mediana semi: 1990)
- *Semi rappresentativi*: `South Park (1997)`, `American Dad! (2005)`, `I Simpson (1989)`
- *Top-10 raccomandazioni generate*:
  1. **I Griffin** (1999) — score: `0.0284`
  2. **King of the Hill** (1997) — score: `0.0160`
  3. **Big Mouth** (2017) — score: `0.0134`
  4. **Rick and Morty** (2013) — score: `0.0123`
  5. **The Cleveland Show** (2009) — score: `0.0120`
  6. **Archer** (2009) — score: `0.0105`
  7. **BoJack Horseman** (2014) — score: `0.0102`
  8. **Disincanto** (2018) — score: `0.0093`
  9. **Solar Opposites** (2020) — score: `0.0092`
  10. **Daria** (1997) — score: `0.0062`

**Cluster 2** (5 semi, decade mediana semi: 2000)
- *Semi rappresentativi*: `L'attacco dei giganti (2013)`, `Death Note (2006)`, `Le bizzarre avventure di JoJo (2012)`
- *Top-10 raccomandazioni generate*:
  1. **Fullmetal Alchemist: Brotherhood** (2009) — score: `0.0157`
  2. **Hunter x Hunter** (2011) — score: `0.0145`
  3. **Code Geass: Lelouch of the Rebellion** (2006) — score: `0.0112`
  4. **Tokyo Ghoul** (2014) — score: `0.0111`
  5. **One-Punch Man** (2015) — score: `0.0098`
  6. **Demon Slayer: Kimetsu no Yaiba** (2019) — score: `0.0086`
  7. **Cowboy Bebop** (1998) — score: `0.0085`
  8. **Naruto** (2002) — score: `0.0078`
  9. **Akame ga Kill!** (2014) — score: `0.0076`
  10. **The Promised Neverland** (2019) — score: `0.0063`

**Cluster 3** (4 semi, decade mediana semi: 2000)
- *Semi rappresentativi*: `Sam & Cat (2013)`, `Zoey 101 (2005)`, `Drake & Josh (2004)`
- *Top-10 raccomandazioni generate*:
  1. **iCarly** (2007) — score: `0.0335`
  2. **Victorious** (2010) — score: `0.0255`
  3. **Henry Danger** (2014) — score: `0.0138`
  4. **iCarly** (2021) — score: `0.0130`
  5. **Ned - Scuola di sopravvivenza** (2004) — score: `0.0111`
  6. **Zack e Cody al Grand Hotel** (2005) — score: `0.0100`
  7. **Game Shakers** (2015) — score: `0.0093`
  8. **Zack e Cody sul ponte di comando** (2008) — score: `0.0092`
  9. **Raven** (2003) — score: `0.0088`
  10. **Sonny tra le stelle** (2009) — score: `0.0084`

**Cluster 4** (4 semi, decade mediana semi: 2005)
- *Semi rappresentativi*: `Harry Potter e i Doni della Morte - Parte 2 (2011)`, `Harry Potter e il principe mezzosangue (2009)`, `Harry Potter e i Doni della Morte - Parte 1 (2010)`
- *Top-10 raccomandazioni generate*:
  1. **La ruota del tempo** (2021) — score: `0.0005`
  2. **Il Signore degli Anelli: Gli Anelli del Potere** (2022) — score: `0.0003`
  3. **Tenebre e ossa** (2021) — score: `0.0001`
  4. **The Shannara Chronicles** (2016) — score: `0.0000`
  5. **Dark Crystal: La resistenza** (2019) — score: `0.0000`
  6. **The Witcher** (2019) — score: `0.0000`
  7. **Locke & Key** (2020) — score: `0.0000`
  8. **Willow: La serie** (2022) — score: `0.0000`
  9. **The Witcher: Blood Origin** (2022) — score: `0.0000`
  10. **His Dark Materials - Queste oscure materie** (2019) — score: `0.0000`

**Cluster 5** (2 semi, decade mediana semi: 2000)
- *Semi rappresentativi*: `Una notte al museo 2 - La fuga (2009)`, `Una notte al museo (2006)`
- *Top-10 raccomandazioni generate*:
  1. **Alias** (2001) — score: `0.0002`
  2. **Jericho** (2006) — score: `0.0001`
  3. **Piccoli brividi** (2023) — score: `0.0001`
  4. **Vita da strega** (1964) — score: `0.0000`
  5. **Cobra Kai** (2018) — score: `0.0000`
  6. **The Librarians** (2014) — score: `0.0000`
  7. **Mr. Bean** (1990) — score: `0.0000`
  8. **Covert Affairs** (2010) — score: `0.0000`
  9. **FUBAR** (2023) — score: `0.0000`
  10. **Le miniere di re Salomone - Il tesoro maledetto** (2004) — score: `0.0000`

**Cluster 6** (2 semi, decade mediana semi: 2020)
- *Semi rappresentativi*: `Wicked - Parte 2 (2025)`, `Wicked (2024)`
- *Top-10 raccomandazioni generate*:
  1. **Agatha All Along** (2024) — score: `0.0042`
  2. **Tenebre e ossa** (2021) — score: `0.0002`
  3. **Ugly Betty** (2006) — score: `0.0002`
  4. **WandaVision** (2021) — score: `0.0002`
  5. **She-Hulk: Attorney at Law** (2022) — score: `0.0002`
  6. **Ironheart** (2025) — score: `0.0002`
  7. **Motherland: Fort Salem** (2020) — score: `0.0002`
  8. **Hawkeye** (2021) — score: `0.0002`
  9. **Salem** (2014) — score: `0.0002`
  10. **Luna Nera** (2020) — score: `0.0002`

#### Strategia B (Jaccard su Vicinato Condiviso)
- **Cluster generati**: 6 (dimensioni: [6, 5, 5, 4, 2, 2])
- **Copertura semi**: 63.2% (24/38) — non raggruppati: 14
- **Distinctness (sovrapposizione media top-10)**: `0.00` (più basso = liste più diversificate tra cluster)
- **Drift di decade medio**: `66.7%`

**Cluster 1** (6 semi, decade mediana semi: 2010)
- *Semi rappresentativi*: `Harry Potter e i Doni della Morte - Parte 2 (2011)`, `Harry Potter e i Doni della Morte - Parte 1 (2010)`, `Harry Potter e il principe mezzosangue (2009)`
- *Top-10 raccomandazioni generate*:
  1. **Agatha All Along** (2024) — score: `0.0018`
  2. **La ruota del tempo** (2021) — score: `0.0003`
  3. **Il Signore degli Anelli: Gli Anelli del Potere** (2022) — score: `0.0002`
  4. **Tenebre e ossa** (2021) — score: `0.0001`
  5. **Ugly Betty** (2006) — score: `0.0001`
  6. **WandaVision** (2021) — score: `0.0001`
  7. **She-Hulk: Attorney at Law** (2022) — score: `0.0001`
  8. **Motherland: Fort Salem** (2020) — score: `0.0001`
  9. **Ironheart** (2025) — score: `0.0001`
  10. **Hawkeye** (2021) — score: `0.0001`

**Cluster 2** (5 semi, decade mediana semi: 1990)
- *Semi rappresentativi*: `South Park (1997)`, `Futurama (1999)`, `American Dad! (2005)`
- *Top-10 raccomandazioni generate*:
  1. **I Griffin** (1999) — score: `0.0284`
  2. **King of the Hill** (1997) — score: `0.0160`
  3. **Big Mouth** (2017) — score: `0.0134`
  4. **Rick and Morty** (2013) — score: `0.0123`
  5. **The Cleveland Show** (2009) — score: `0.0120`
  6. **Archer** (2009) — score: `0.0105`
  7. **BoJack Horseman** (2014) — score: `0.0102`
  8. **Disincanto** (2018) — score: `0.0093`
  9. **Solar Opposites** (2020) — score: `0.0092`
  10. **Daria** (1997) — score: `0.0062`

**Cluster 3** (5 semi, decade mediana semi: 2000)
- *Semi rappresentativi*: `Death Note (2006)`, `Le bizzarre avventure di JoJo (2012)`, `L'attacco dei giganti (2013)`
- *Top-10 raccomandazioni generate*:
  1. **Fullmetal Alchemist: Brotherhood** (2009) — score: `0.0157`
  2. **Hunter x Hunter** (2011) — score: `0.0145`
  3. **Code Geass: Lelouch of the Rebellion** (2006) — score: `0.0112`
  4. **Tokyo Ghoul** (2014) — score: `0.0111`
  5. **One-Punch Man** (2015) — score: `0.0098`
  6. **Demon Slayer: Kimetsu no Yaiba** (2019) — score: `0.0086`
  7. **Cowboy Bebop** (1998) — score: `0.0085`
  8. **Naruto** (2002) — score: `0.0078`
  9. **Akame ga Kill!** (2014) — score: `0.0076`
  10. **The Promised Neverland** (2019) — score: `0.0063`

**Cluster 4** (4 semi, decade mediana semi: 2000)
- *Semi rappresentativi*: `Zoey 101 (2005)`, `Drake & Josh (2004)`, `Sam & Cat (2013)`
- *Top-10 raccomandazioni generate*:
  1. **iCarly** (2007) — score: `0.0335`
  2. **Victorious** (2010) — score: `0.0255`
  3. **Henry Danger** (2014) — score: `0.0138`
  4. **iCarly** (2021) — score: `0.0130`
  5. **Ned - Scuola di sopravvivenza** (2004) — score: `0.0111`
  6. **Zack e Cody al Grand Hotel** (2005) — score: `0.0100`
  7. **Game Shakers** (2015) — score: `0.0093`
  8. **Zack e Cody sul ponte di comando** (2008) — score: `0.0092`
  9. **Raven** (2003) — score: `0.0088`
  10. **Sonny tra le stelle** (2009) — score: `0.0084`

**Cluster 5** (2 semi, decade mediana semi: 2000)
- *Semi rappresentativi*: `Una notte al museo 2 - La fuga (2009)`, `Una notte al museo (2006)`
- *Top-10 raccomandazioni generate*:
  1. **Alias** (2001) — score: `0.0002`
  2. **Jericho** (2006) — score: `0.0001`
  3. **Piccoli brividi** (2023) — score: `0.0001`
  4. **Vita da strega** (1964) — score: `0.0000`
  5. **Cobra Kai** (2018) — score: `0.0000`
  6. **The Librarians** (2014) — score: `0.0000`
  7. **Mr. Bean** (1990) — score: `0.0000`
  8. **Covert Affairs** (2010) — score: `0.0000`
  9. **FUBAR** (2023) — score: `0.0000`
  10. **Le miniere di re Salomone - Il tesoro maledetto** (2004) — score: `0.0000`

**Cluster 6** (2 semi, decade mediana semi: 2010)
- *Semi rappresentativi*: `Descendants 3 (2019)`, `Descendants 2 (2017)`
- *Top-10 raccomandazioni generate*:
  1. **BIA** (2019) — score: `0.0060`
  2. **Soy Luna** (2016) — score: `0.0004`
  3. **O11CE** (2017) — score: `0.0003`
  4. **Cielo grande** (2022) — score: `0.0003`
  5. **Soy Luna: Volver a rodar** (2026) — score: `0.0003`
  6. **I maghi di Waverly: Ritorno a  Waverly Place** (2024) — score: `0.0002`
  7. **Vis a vis: El oasis** (2020) — score: `0.0002`
  8. **Kally's Mashup** (2017) — score: `0.0002`
  9. **Mentiras, la serie** (2025) — score: `0.0002`
  10. **Shadowhunters** (2016) — score: `0.0001`

---

### Profilo Lungo (476 semi) — Utente `warnok` (476 semi, prevalentemente `movie`)

#### Strategia A (Affinità Coseno su Grafo V45)
- **Cluster generati**: 6 (dimensioni: [29, 19, 14, 14, 13, 13])
- **Copertura semi**: 21.4% (102/476) — non raggruppati: 374
- **Distinctness (sovrapposizione media top-10)**: `0.00` (più basso = liste più diversificate tra cluster)
- **Drift di decade medio**: `50.0%`

**Cluster 1** (29 semi, decade mediana semi: 2010)
- *Semi rappresentativi*: `Black Panther (2018)`, `Captain America: The Winter Soldier (2014)`, `Avengers: Infinity War (2018)`
- *Top-10 raccomandazioni generate*:
  1. **Ant-Man and the Wasp: Quantumania** (2023) — score: `0.0075`
  2. **Doctor Strange nel Multiverso della Follia** (2022) — score: `0.0075`
  3. **The Marvels** (2023) — score: `0.0041`
  4. **Black Panther: Wakanda Forever** (2022) — score: `0.0040`
  5. **Spider-Man: Brand New Day** (2026) — score: `0.0039`
  6. **L'incredibile Hulk** (2008) — score: `0.0038`
  7. **I Fantastici 4 - Gli inizi** (2025) — score: `0.0026`
  8. **Thunderbolts*** (2025) — score: `0.0024`
  9. **Guardiani della Galassia: Holiday Special** (2022) — score: `0.0021`
  10. **Captain America: Brave New World** (2025) — score: `0.0020`

**Cluster 2** (19 semi, decade mediana semi: 2000)
- *Semi rappresentativi*: `Il ritorno dello Jedi (1983)`, `Guerre stellari (1977)`, `L'Impero colpisce ancora (1980)`
- *Top-10 raccomandazioni generate*:
  1. **Star Trek - Il futuro ha inizio** (2009) — score: `0.0037`
  2. **Into Darkness - Star Trek** (2013) — score: `0.0033`
  3. **Jupiter - Il destino dell'universo** (2015) — score: `0.0025`
  4. **Matrix Reloaded** (2003) — score: `0.0020`
  5. **Serenity** (2005) — score: `0.0020`
  6. **Matrix Revolutions** (2003) — score: `0.0020`
  7. **E.T. l'extra-terrestre** (1982) — score: `0.0019`
  8. **Star Trek Beyond** (2016) — score: `0.0017`
  9. **Rebel Moon - Parte 1: Figlia del fuoco** (2023) — score: `0.0016`
  10. **Ritorno al futuro** (1985) — score: `0.0015`

**Cluster 3** (14 semi, decade mediana semi: 2010)
- *Semi rappresentativi*: `Fallout (2024)`, `Westworld - Dove tutto è concesso (2016)`, `The Last of Us (2023)`
- *Top-10 raccomandazioni generate*:
  1. **El Camino: Il film di Breaking Bad** (2019) — score: `0.0029`
  2. **Mercy - Sotto accusa** (2026) — score: `0.0025`
  3. **Cold Storage** (2026) — score: `0.0015`
  4. **The Dog Stars - Le stelle dopo la fine** (2026) — score: `0.0013`
  5. **Caddo Lake** (2024) — score: `0.0011`
  6. **All'ombra della luna** (2019) — score: `0.0010`
  7. **Contagious - Epidemia mortale** (2015) — score: `0.0009`
  8. **Resident Evil: Afterlife** (2010) — score: `0.0009`
  9. **Cold in July - Freddo a luglio** (2014) — score: `0.0009`
  10. **We Are What We Are** (2013) — score: `0.0007`

**Cluster 4** (14 semi, decade mediana semi: 2020)
- *Semi rappresentativi*: `Luca (2021)`, `Red (2022)`, `I Mitchell contro le macchine (2021)`
- *Top-10 raccomandazioni generate*:
  1. **Spider-Man: Across the Spider-Verse** (2023) — score: `0.0162`
  2. **Il gatto con gli stivali 2 - L'ultimo desiderio** (2022) — score: `0.0093`
  3. **Jumpers - Un salto tra gli animali** (2026) — score: `0.0083`
  4. **Gli Incredibili 2** (2018) — score: `0.0082`
  5. **Elemental** (2023) — score: `0.0078`
  6. **Troppo cattivi** (2022) — score: `0.0066`
  7. **Strange World - Un mondo misterioso** (2022) — score: `0.0065`
  8. **Inside Out 2** (2024) — score: `0.0063`
  9. **LEGO Batman: Il film** (2017) — score: `0.0060`
  10. **Elio** (2025) — score: `0.0059`

**Cluster 5** (13 semi, decade mediana semi: 2020)
- *Semi rappresentativi*: `La leggenda di Vox Machina (2022)`, `Castlevania (2017)`, `INVINCIBLE (2021)`
- *Top-10 raccomandazioni generate*:
  1. **Halo - Legends** (2010) — score: `0.0031`
  2. **Kingsglaive: Final Fantasy XV** (2016) — score: `0.0028`
  3. **The Witcher: Nightmare of the Wolf** (2021) — score: `0.0023`
  4. **Avatar Aang: L’ultimo dominatore dell’aria** (2026) — score: `0.0021`
  5. **Transformers One** (2024) — score: `0.0021`
  6. **Spider-Man: La saga di Venom** (2005) — score: `0.0014`
  7. **Valhalla** (1986) — score: `0.0013`
  8. **Primal: Tales of Savagery** (2019) — score: `0.0012`
  9. **Kubo e la spada magica** (2016) — score: `0.0012`
  10. **The Witcher: Le sirene degli abissi** (2025) — score: `0.0012`

**Cluster 6** (13 semi, decade mediana semi: 2020)
- *Semi rappresentativi*: `Jujutsu Kaisen (2020)`, `Vinland Saga (2019)`, `Dororo (2019)`
- *Top-10 raccomandazioni generate*:
  1. **Demon Slayer - Il treno Mugen** (2020) — score: `0.0064`
  2. **Jujutsu Kaisen 0 - Il film** (2021) — score: `0.0062`
  3. **Demon Slayer: Il Castello dell'Infinito - Parte 1** (2025) — score: `0.0037`
  4. **SPY x FAMILY CODE: White** (2023) — score: `0.0029`
  5. **Chainsaw Man: La storia di Reze** (2025) — score: `0.0024`
  6. **My Hero Academia: The Movie - World Heroes' Mission** (2021) — score: `0.0023`
  7. **My Hero Academia: The Movie - Two Heroes** (2018) — score: `0.0023`
  8. **My Hero Academia: Heroes Rising** (2019) — score: `0.0020`
  9. **Demon Slayer: Kimetsu No Yaiba - Verso il villaggio dei forgiatori di katana** (2023) — score: `0.0017`
  10. **Made in Abyss: Dawn of the Deep Soul** (2020) — score: `0.0013`

#### Strategia B (Jaccard su Vicinato Condiviso)
- **Cluster generati**: 6 (dimensioni: [34, 20, 16, 15, 15, 13])
- **Copertura semi**: 23.7% (113/476) — non raggruppati: 363
- **Distinctness (sovrapposizione media top-10)**: `0.00` (più basso = liste più diversificate tra cluster)
- **Drift di decade medio**: `43.3%`

**Cluster 1** (34 semi, decade mediana semi: 2010)
- *Semi rappresentativi*: `Avengers: Infinity War (2018)`, `Avengers: Endgame (2019)`, `Captain America: Civil War (2016)`
- *Top-10 raccomandazioni generate*:
  1. **Ant-Man and the Wasp: Quantumania** (2023) — score: `0.0066`
  2. **Doctor Strange nel Multiverso della Follia** (2022) — score: `0.0066`
  3. **Spider-Man: Brand New Day** (2026) — score: `0.0037`
  4. **The Marvels** (2023) — score: `0.0036`
  5. **Black Panther: Wakanda Forever** (2022) — score: `0.0035`
  6. **L'incredibile Hulk** (2008) — score: `0.0033`
  7. **I Fantastici 4 - Gli inizi** (2025) — score: `0.0024`
  8. **Thunderbolts*** (2025) — score: `0.0021`
  9. **X-Men - Giorni di un futuro passato** (2014) — score: `0.0020`
  10. **X-Men - L'inizio** (2011) — score: `0.0020`

**Cluster 2** (20 semi, decade mediana semi: 2000)
- *Semi rappresentativi*: `Il ritorno dello Jedi (1983)`, `Star Wars: L'ascesa di Skywalker (2019)`, `L'Impero colpisce ancora (1980)`
- *Top-10 raccomandazioni generate*:
  1. **Star Trek - Il futuro ha inizio** (2009) — score: `0.0033`
  2. **Into Darkness - Star Trek** (2013) — score: `0.0030`
  3. **E.T. l'extra-terrestre** (1982) — score: `0.0028`
  4. **Jurassic World** (2015) — score: `0.0027`
  5. **Ritorno al futuro - Parte III** (1990) — score: `0.0026`
  6. **Ritorno al futuro** (1985) — score: `0.0026`
  7. **Jupiter - Il destino dell'universo** (2015) — score: `0.0023`
  8. **Men in Black** (1997) — score: `0.0019`
  9. **Matrix Reloaded** (2003) — score: `0.0018`
  10. **Schindler's List** (1993) — score: `0.0018`

**Cluster 3** (16 semi, decade mediana semi: 2020)
- *Semi rappresentativi*: `Luca (2021)`, `Onward - Oltre la magia (2020)`, `Red (2022)`
- *Top-10 raccomandazioni generate*:
  1. **Spider-Man: Across the Spider-Verse** (2023) — score: `0.0143`
  2. **Il gatto con gli stivali 2 - L'ultimo desiderio** (2022) — score: `0.0083`
  3. **Gli Incredibili 2** (2018) — score: `0.0078`
  4. **Jumpers - Un salto tra gli animali** (2026) — score: `0.0074`
  5. **Elemental** (2023) — score: `0.0069`
  6. **Troppo cattivi** (2022) — score: `0.0058`
  7. **Strange World - Un mondo misterioso** (2022) — score: `0.0058`
  8. **Inside Out 2** (2024) — score: `0.0056`
  9. **LEGO Batman: Il film** (2017) — score: `0.0053`
  10. **Elio** (2025) — score: `0.0053`

**Cluster 4** (15 semi, decade mediana semi: 2020)
- *Semi rappresentativi*: `La leggenda di Vox Machina (2022)`, `Castlevania (2017)`, `INVINCIBLE (2021)`
- *Top-10 raccomandazioni generate*:
  1. **Halo - Legends** (2010) — score: `0.0029`
  2. **Kingsglaive: Final Fantasy XV** (2016) — score: `0.0025`
  3. **I primi passi di Groot** (2022) — score: `0.0022`
  4. **The Witcher: Nightmare of the Wolf** (2021) — score: `0.0021`
  5. **Il passatempo di Groot** (2022) — score: `0.0020`
  6. **Groot fa il bagno** (2022) — score: `0.0020`
  7. **Il piccoletto** (2022) — score: `0.0020`
  8. **Avatar Aang: L’ultimo dominatore dell’aria** (2026) — score: `0.0020`
  9. **Transformers One** (2024) — score: `0.0020`
  10. **Magnum Opus** (2022) — score: `0.0019`

**Cluster 5** (15 semi, decade mediana semi: 2020)
- *Semi rappresentativi*: `Jujutsu Kaisen (2020)`, `Vinland Saga (2019)`, `SPY×FAMILY (2022)`
- *Top-10 raccomandazioni generate*:
  1. **Demon Slayer - Il treno Mugen** (2020) — score: `0.0055`
  2. **Jujutsu Kaisen 0 - Il film** (2021) — score: `0.0053`
  3. **Demon Slayer: Il Castello dell'Infinito - Parte 1** (2025) — score: `0.0032`
  4. **SPY x FAMILY CODE: White** (2023) — score: `0.0024`
  5. **Chainsaw Man: La storia di Reze** (2025) — score: `0.0021`
  6. **My Hero Academia: The Movie - World Heroes' Mission** (2021) — score: `0.0020`
  7. **My Hero Academia: The Movie - Two Heroes** (2018) — score: `0.0019`
  8. **My Hero Academia: Heroes Rising** (2019) — score: `0.0017`
  9. **Demon Slayer: Kimetsu No Yaiba - Verso il villaggio dei forgiatori di katana** (2023) — score: `0.0015`
  10. **Made in Abyss: Dawn of the Deep Soul** (2020) — score: `0.0011`

**Cluster 6** (13 semi, decade mediana semi: 2010)
- *Semi rappresentativi*: `Fallout (2024)`, `The Last of Us (2023)`, `Westworld - Dove tutto è concesso (2016)`
- *Top-10 raccomandazioni generate*:
  1. **El Camino: Il film di Breaking Bad** (2019) — score: `0.0030`
  2. **Mercy - Sotto accusa** (2026) — score: `0.0026`
  3. **Cold Storage** (2026) — score: `0.0015`
  4. **The Dog Stars - Le stelle dopo la fine** (2026) — score: `0.0013`
  5. **Caddo Lake** (2024) — score: `0.0012`
  6. **All'ombra della luna** (2019) — score: `0.0010`
  7. **Contagious - Epidemia mortale** (2015) — score: `0.0009`
  8. **Resident Evil: Afterlife** (2010) — score: `0.0009`
  9. **Cold in July - Freddo a luglio** (2014) — score: `0.0009`
  10. **We Are What We Are** (2013) — score: `0.0007`

---
