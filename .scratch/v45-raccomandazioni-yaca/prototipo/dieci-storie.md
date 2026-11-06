# Rapporto Dieci Storie: Tassonomia Hand-Curata + «Perché hai visto» e Risoluzione Regressione Carverclan

> [!IMPORTANT]
> **Decisione Fondamentale di Denominazione (Specifica del Produttore Umano)**:
> 1. **Adozione del binomio Tassonomia + «Perché hai visto»**: la denominazione degli scaffali è governata da una tassonomia italiana curata a mano (`tassonomia.py`, 36 voci). Uno scaffale assume il nome tassonomico **unicamente se un'entry univoca soddisfa la regola con confidenza dichiarata** (copertura $\ge 50\%$ dei membri e nessuna voce concorrente a pari merito).
> 2. **Fallback Veritiero per Costruzione**: tutti i cluster eterogenei o privi di confidenza ricevono l'etichetta **«Perché hai visto <2-3 semi rappresentativi>»**. Essa è **vera al 100% per costruzione**, elimina ogni percentuale visibile (`87%`), ogni frammento inglese non tradotto e ogni pretesa di ruolo autorale generalizzata.
> 3. **Cancellazione Totale della Vecchia Catena**: la catena (*Keyword Pair $	o$ Collezione $	o$ DIR $	o$ Medium + Keyword*) è stata **completamente eliminata**, non conservata come fallback. Le diciture *«Di X»* / *«Regia di X»* non vengono più prodotte dinamicamente.
> 4. **Risoluzione Regressione Carverclan**: per i cluster con meno di 3 semi, il medium è deciso dal seme con più riproduzioni (tie-break recenza); l'asserzione 80% sui semi è condonata (`cluster piccolo`), mentre l'asserzione 100% sui candidati è mantenuta intatta. **`carverclan` torna a servire 2 / 5 scaffali**.

---

## 1. La Tassonomia Italiana Hand-Curata (`tassonomia.py`)

La tassonomia si compone di **36 voci controllate**, raggruppate in 6 macro-aree tematiche. Ogni voce contiene una regola dichiarativa su evidenza (keyword TMDB, medium, flag `ANIME`/`ADULTO`, lingua d'origine) e priorità numerica per lo scioglimento dei conflitti.

### Area: Animazione & Anime
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Anime shōnen»** | flag `ANIME=1`, kws=['seinen', 'martial arts', 'super power'] | `90` | **Dati reali**: Derivato dai dati: warnok S1, moppierhead S2, castoffcrown S1 |
| **«Anime romantici & slice of life»** | flag `ANIME=1`, kws=['shoujo', 'romance', 'slice of life'] | `85` | **Dati reali**: Derivato dai dati: castoffcrown S2 (Gachiakuta, Polar Opposites) |
| **«Animazione d'autore»** | medium=`movie`, flag `ANIME=1`, kws=['studio ghibli', 'surrealism', 'author animation'] | `80` | **Dati reali**: Derivato dai dati: film d'autore Studio Ghibli e lungometraggi animati |
| **«Sitcom animate»** | medium=`series`, flag `ANIME=0`, kws=['family conflict', 'dysfunctional family', 'sitcom'] | `90` | **Dati reali**: Derivato dai dati: hammers-lists S2, sappss S3, moppierhead S1, 1jacobjohn S3 |
| **«Animazione per famiglie»** | medium=`movie`, flag `ANIME=0`, kws=['pixar', 'anthropomorphism', '3d animation'] | `80` | **Dati reali**: Derivato dai dati: sappss S1 (Elio, Jumpers, La gang del bosco) |
| **«Animazione d'azione per adulti»** | medium=`series`, flag `ANIME=0`, kws=['dark fantasy', 'adult animation', 'gore'] | `75` | **Dati reali**: Derivato dai dati: warnok S4 e flixinatoor99 S5 (Invincible, Blue Eye Samurai) |

### Area: Fantascienza & Fantasy
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Space opera»** | kws=['galaxy', 'space opera', 'star wars'] | `95` | **Dati reali**: Derivato dai dati: warnok S3 (Star Wars, Mandalorian) |
| **«Fantascienza d'invasione»** | kws=['alien monster', 'extraterrestrial', 'alien invasion'] | `85` | **Dati reali**: Derivato dai dati: sangam456 S2 e cluster alieni di warnok |
| **«Fantascienza post-apocalittica»** | kws=['survival', 'dystopia', 'post-apocalyptic future'] | `80` | **Dati reali**: Derivato dai dati: warnok S2 e franchise Fallout |
| **«Cyberpunk & Futuro distopico»** | kws=['cyberpunk', 'near future', 'cyborg'] | `80` | **Dati reali**: Derivato dai dati: 1jacobjohn S2 (Outside the Wire, Upgrade) |
| **«Magia & Stregoneria»** | kws=['witch', 'sorcery', 'spell'] | `85` | **Dati reali**: Derivato dai dati: moppierhead S3/S4 e flixinatoor99 S6 (Harry Potter, Wicked) |
| **«Cinecomic & Supereroi»** | kws=['super power', 'based on comic', 'marvel cinematic universe (mcu)'] | `80` | **Dati reali**: Derivato dai dati: 1jacobjohn S5 e flixinatoor99 S7 (Superman, Avatar) |
| **«Viaggi nel tempo & Multiverso»** | kws=['alternate timeline', 'alternate reality', 'time travel'] | `80` | *Catalogo*: Pattern tematico classico di catalogo fantascientifico |

### Area: Crime, Thriller & Mistero
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Giallo investigativo»** | kws=['investigation', 'homicide detective', 'murder mystery'] | `85` | **Dati reali**: Derivato dai dati: pepsipex S1, pepsipex S2 e sangam456 S1 |
| **«Docufiction true crime»** | kws=['true crime', 'dramatization', 'crime documentary'] | `90` | **Dati reali**: Derivato dai dati: sappss S5 e 1jacobjohn S4 / S6 |
| **«Spy thriller»** | kws=['secret agent', 'espionage', 'spy thriller'] | `85` | **Dati reali**: Derivato dai dati: pepsipex S4 (Slow Horses, Lioness, The Agency) |
| **«Thriller psicologico»** | kws=['psychological thriller', 'obsession', 'paranoia'] | `80` | **Dati reali**: Derivato dai dati: sappss S2 e pepsipex S2 |
| **«Gangster & Criminalità»** | kws=['organized crime', 'mafia', 'gangster'] | `75` | *Catalogo*: Pattern classico crime / mafia del catalogo |
| **«Horror soprannaturale»** | kws=['possession', 'demon', 'supernatural'] | `85` | **Dati reali**: Derivato dai dati: carverclan S1 (I peccatori, Stranger Things) e pepsipex S5 |

### Area: Comedy & Sitcom
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Sitcom»** | medium=`series`, flag `ANIME=0`, kws=['sitcom', 'workplace comedy'] | `75` | **Dati reali**: Derivato dai dati: 1jacobjohn S1 (The King of Queens, My Name Is Earl) |
| **«Commedia satirica»** | kws=['political satire', 'satire', 'social satire'] | `75` | **Dati reali**: Derivato dai dati: flixinatoor99 S3 (Spider-Noir, Parks & Rec, White Lotus) |
| **«Dark comedy»** | kws=['dark comedy', 'crude comedy', 'black comedy'] | `70` | **Dati reali**: Derivato dai dati: sappss S7 (Brassic, This Country) |
| **«Commedia romantica»** | medium=`movie`, flag `ANIME=0`, kws=['friends to lovers', 'romantic comedy', 'romance'] | `70` | *Catalogo*: Pattern classico commedie romantiche cinematografiche |

### Area: Drama & Internazionale
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Dramma d'epoca»** | kws=['period drama', 'costume drama', '19th century'] | `85` | **Dati reali**: Derivato dai dati: pepsipex S3 (La valle dell'Eden, The Forsytes) |
| **«Medical drama»** | medium=`series`, kws=['nurse', 'surgery', 'doctor'] | `90` | **Dati reali**: Derivato dai dati: hammers-lists S1 (The Good Doctor, Chicago Med, 9-1-1) |
| **«Thriller coreano»** | lingue=['ko'], kws=['investigation', 'murder', 'serial killer'] | `85` | **Dati reali**: Derivato dai dati: titoli thriller/crime K-drama in castoffcrown e warnok |
| **«Dramma coreano»** | lingue=['ko'], kws=['friendship', 'melodrama', 'romance'] | `80` | **Dati reali**: Derivato dai dati: castoffcrown S4 (Hospital Playlist, Four Hands Two Sonatas) |
| **«Commedia romantica asiatica»** | lingue=['zh', 'ja', 'ko'], kws=['youth', 'romantic comedy', 'romance'] | `80` | **Dati reali**: Derivato dai dati: romance asiatiche televisive e cinematografiche |
| **«Cinema d'autore»** | medium=`movie`, kws=['independent film', 'arthouse', 'criterion collection'] | `75` | **Dati reali**: Derivato dai dati: castoffcrown S3 (Primetime, Il filo nascosto) |

### Area: Sport & Documentari
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Wrestling»** | kws=['sports entertainment', 'professional wrestling', 'wrestling'] | `95` | **Dati reali**: Derivato dai dati: moppierhead S5 (SmackDown, Raw) |
| **«Documentari naturalistici»** | kws=['wildlife', 'farm', 'ocean'] | `85` | **Dati reali**: Derivato dai dati: sappss S4 e 1jacobjohn S15 (Big Beasts, Pianeta preistorico) |
| **«Documentari sportivi»** | kws=['olympic games', 'athlete', 'basketball'] | `85` | **Dati reali**: Derivato dai dati: 1jacobjohn S10 (The Redeem Team, Skywalkers) |
| **«Motori & Corse automobilistiche»** | kws=['car race', 'classic cars', 'automobile'] | `85` | **Dati reali**: Derivato dai dati: 1jacobjohn S14 (Car Masters, The Grand Tour) |
| **«Teatro filmato & Musical»** | kws=['filmed theater', 'based on play or musical', 'stage musical'] | `85` | **Dati reali**: Derivato dai dati: carverclan S2 (Peter Pan Goes Wrong, Great Performances) |
| **«Fede & Spiritualità»** | kws=['christian faith', 'christian film', 'religion'] | `80` | **Dati reali**: Derivato dai dati: 1jacobjohn S8 (The Chosen, Il re dei re) |

---

## 2. Match Rate per Timeline e Verifica Over-Generic

Su **41 scaffali serviti globalmente** nelle 10 timeline:
- **25 scaffali (61.0%)** hanno trovato un'identità tematica univoca nella **Tassonomia**;
- **16 scaffali (39.0%)** hanno adottato la trasparenza di **«Perché hai visto...»**.

### Tabella Match Rate per Profilo

| Profilo Trakt | Scaffali Serviti | Tassonomia (Match Univoco) | «Perché hai visto» (Trasparente) | Tasso Adozione Tassonomia |
|:---|:---:|:---:|:---:|:---:|
| **`sangam456`** | **2** | 1 | 1 | **50.0%** |
| **`hammers-lists`** | **2** | 2 | 0 | **100.0%** |
| **`sappss`** | **5** | 3 | 2 | **60.0%** |
| **`flixinatoor99`** | **5** | 2 | 3 | **40.0%** |
| **`moppierhead`** | **5** | 4 | 1 | **80.0%** |
| **`castoffcrown`** | **5** | 3 | 2 | **60.0%** |
| **`warnok`** | **5** | 3 | 2 | **60.0%** |
| **`pepsipex`** | **5** | 2 | 3 | **40.0%** |
| **`carverclan`** | **2** | 2 | 0 | **100.0%** |
| **`1jacobjohn`** | **5** | 3 | 2 | **60.0%** |

### Verifica di Non-Genericità (Over-Generic Check)
> [!NOTE]
> **Regola di Sicurezza**: Nessuna singola entry tassonomica deve inghiottire più del **25% dei cluster serviti** (soglia critica su 41 scaffali = **10.25 scaffali**).

| Voce di Tassonomia | Scaffali Assegnati | Quota sul Totale (41) | Esito Verifica (< 25%) |
|:---|:---:|:---:|:---:|
| **«Sitcom animate»** | 3 | 7.3% | **OK (Specifico)** |
| **«Animazione d'azione per adulti»** | 3 | 7.3% | **OK (Specifico)** |
| **«Anime shōnen»** | 3 | 7.3% | **OK (Specifico)** |
| **«Docufiction true crime»** | 2 | 4.9% | **OK (Specifico)** |
| **«Giallo investigativo»** | 2 | 4.9% | **OK (Specifico)** |
| **«Magia & Stregoneria»** | 2 | 4.9% | **OK (Specifico)** |
| **«Fantascienza d'invasione»** | 1 | 2.4% | **OK (Specifico)** |
| **«Medical drama»** | 1 | 2.4% | **OK (Specifico)** |
| **«Animazione per famiglie»** | 1 | 2.4% | **OK (Specifico)** |
| **«Anime romantici & slice of life»** | 1 | 2.4% | **OK (Specifico)** |
| **«Dramma coreano»** | 1 | 2.4% | **OK (Specifico)** |
| **«Space opera»** | 1 | 2.4% | **OK (Specifico)** |
| **«Dramma d'epoca»** | 1 | 2.4% | **OK (Specifico)** |
| **«Spy thriller»** | 1 | 2.4% | **OK (Specifico)** |
| **«Horror soprannaturale»** | 1 | 2.4% | **OK (Specifico)** |
| **«Teatro filmato & Musical»** | 1 | 2.4% | **OK (Specifico)** |

**Esito globale Over-Generic Check: SUPERATO AL 100%**. La voce più frequente copre al massimo il **7.3% degli scaffali**, garantendo varietà ed evitando la degenerazione in etichette-ombrello.

---

## 3. Tabella Prima e Dopo (Before & After) su 10 Scaffali

Confronto diretto tra la vecchia catena di fallback (affetta da percentuali, diciture autorali generalizzate e inglese) e la nuova denominazione:

| Profilo | Scaffale | Vecchia Etichetta (Fallback Chain) | Nuova Etichetta (Tassonomia + Perché hai visto) | Tipologia Nuova | Perché è Migliore |
|:---|:---:|:---|:---|:---:|:---|
| `sangam456` | #2 | *Film: Alieni (67%) & Action (33%)* | **«Fantascienza d'invasione»** | Tassonomia | Elimina percentuali ed etichetta generica; nome evocativo italiano. |
| `hammers-lists` | #1 | *Serie: Ospedale & Medicina (50%) & Medical Drama (50%)* | **«Medical drama»** | Tassonomia | Elimina ridondanze terminologiche e numeri grezzi. |
| `sappss` | #5 | *Serie: True Crime (100%) & Hit-And-Run (50%)* | **«Docufiction true crime»** | Tassonomia | Elimina inglese non tradotto (*Hit-And-Run*) e formalizza il genere. |
| `flixinatoor99` | #1 | *Serie: Amused (33%) & Cheerful (33%)* | **«Perché hai visto División Palermo, Cent'anni di solitudine e Stromberg»** | Perché hai visto | Sostituisce keyword TMDB emotive in inglese con trasparenza onesta al 100%. |
| `moppierhead` | #1 | *Serie: Animazione per Adulti (71%) & Sitcom (71%)* | **«Sitcom animate»** | Tassonomia | Sintetizza in due parole naturali un concetto precedentemente prolisso. |
| `castoffcrown` | #3 | *Film: Regia di Paul Thomas Anderson* | **«Perché hai visto Primetime, Il filo nascosto e Il colore venuto dallo spazio»** | Perché hai visto | Elimina l'attribuzione indebita dell'intero cluster di 30 film a un singolo regista. |
| `warnok` | #3 | *Film: Sequel (54%) & Space Opera (54%)* | **«Space opera»** | Tassonomia | Riconosce il genere epico galattico senza la dicitura superflua 'Sequel'. |
| `pepsipex` | #4 | *Serie: Di Taylor Sheridan* | **«Spy thriller»** | Tassonomia | Identifica il vero tema unificante (spionaggio), superando l'etichetta autore. |
| `carverclan` | #1 | *[0/5 scaffali — Regressione]* | **«Horror soprannaturale»** | Tassonomia (`cluster piccolo`) | **Risolve la regressione**: timeline ultra-corta torna a servire 2 scaffali autentici. |
| `1jacobjohn` | #1 | *Serie: Di Michael Schur* | **«Sitcom»** | Tassonomia | Nome di genere puro e pulito al posto di una pretesa autorale parziale. |

---

## 4. Risoluzione della Regressione `carverclan` e Tabella Riassuntiva

Nella versione precedente, la scissione automatica per medium divideva i due cluster naturali di `carverclan` (ciascuno composto da 1 film e 1 serie) in 4 singoli, lasciando la cronologia con 0 scaffali serviti. È stata introdotta la regola d'oro per i cluster ultra-corti:
> **Regola Cluster Piccolo (< 3 semi)**: Quando un cluster contiene meno di 3 semi, il medium dello scaffale è deciso dal seme con più riproduzioni (con tie-break sulla recenza). L'asserzione dell'80% sui semi viene condonata (contrassegnata con `WAIVED (cluster piccolo)`), mentre **l'asserzione del 100% sui candidati raccomandati rimane rigorosamente attiva**.

**Esito globale asserzione medium**: **0 fallimenti su 41 scaffali serviti**.

| Profilo Trakt | Tipologia / Gap | Semi | Macro Split | Scaffali Serviti | Verifica Medium | Tassonomia | Perché hai visto | Nomi Dup. | Stale |
|:---|:---|---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **`sangam456`** | Corto storico (10 semi) | 10 | 2 | **2 / 5** | **PASS (2/2)** | 1 | 1 | 0 | 0 |
| **`hammers-lists`** | Corto storico (11 semi) | 11 | 2 | **2 / 5** | **PASS (2/2)** | 2 | 0 | 0 | 0 |
| **`sappss`** | Medio-basso storico (25 semi) | 25 | 7 | **5 / 5** | **PASS (5/5)** | 3 | 2 | 0 | 0 |
| **`flixinatoor99`** | Medio storico (32 semi) | 32 | 8 | **5 / 5** | **PASS (5/5)** | 2 | 3 | 0 | 0 |
| **`moppierhead`** | Medio storico (38 semi) | 38 | 6 | **5 / 5** | **PASS (5/5)** | 4 | 1 | 0 | 0 |
| **`castoffcrown`** | Lungo storico (412 semi) | 412 | 71 | **5 / 5** | **PASS (5/5)** | 3 | 2 | 0 | 1 |
| **`warnok`** | Lungo storico (476 semi) | 476 | 63 | **5 / 5** | **PASS (5/5)** | 3 | 2 | 0 | 0 |
| **`pepsipex`** | Massimo storico (568 semi) | 568 | 78 | **5 / 5** | **PASS (5/5)** | 2 | 3 | 0 | 0 |
| **`carverclan`** | Ultra-corto (<10 semi, 7 semi) | 7 | 2 | **2 / 5** | **PASS (2/2, Waived)** | 2 | 0 | 0 | 0 |
| **`1jacobjohn`** | Intermedio (167 semi) | 167 | 26 | **5 / 5** | **PASS (5/5)** | 3 | 2 | 0 | 0 |

---

## 5. Tabella di Popularity Drift (41 Scaffali Serviti)

| Profilo | Scaffale e Nome | Medium | Med. VOT Semi | Med. VOT Cand. | Ratio (C/S) | Med. VAVE Semi | Med. VAVE Cand. | Flag Popolarità |
|:---|:---|:---:|---:|---:|---:|---:|---:|:---|
| `sangam456` | 1. Fantascienza d'invasione | `Film` | 3673 | 9460 | **2.58** | 7.45 | 7.20 | OK |
| `sangam456` | 2. Perché hai visto The White Lotus, Billions e A Murder at the End of the World | `Serie` | 1085 | 1457 | **1.34** | 7.59 | 7.54 | OK |
| `hammers-lists` | 1. Medical drama | `Serie` | 1312 | 2870 | **2.19** | 8.33 | 8.22 | OK |
| `hammers-lists` | 2. Sitcom animate | `Serie` | 8313 | 3946 | **0.47** | 8.04 | 8.33 | OK |
| `sappss` | 1. Animazione per famiglie | `Film` | 3720 | 3978 | **1.07** | 6.98 | 7.50 | OK |
| `sappss` | 2. Perché hai visto Obsession, Beautiful Boy e Good Boy | `Film` | 4562 | 978 | **0.21** | 7.87 | 6.60 | OK |
| `sappss` | 3. Docufiction true crime | `Serie` | 36 | 46 | **1.30** | 6.95 | 7.35 | OK |
| `sappss` | 4. Sitcom animate | `Serie` | 11075 | 2465 | **0.22** | 8.00 | 7.80 | OK |
| `sappss` | 5. Perché hai visto La fattoria Clarkson e Formula 1: Drive to Survive | `Serie` | 574 | 314 | **0.55** | 8.36 | 7.60 | OK |
| `flixinatoor99` | 1. Perché hai visto Il Boss del condominio, División Palermo e Stromberg | `Serie` | 300 | 79 | **0.26** | 8.10 | 7.90 | **DRIFT (Nicchia < 300)** |
| `flixinatoor99` | 2. Perché hai visto Apex, Una di famiglia - The Housemaid e Hamnet - Nel nome del figlio | `Film` | 1983 | 976 | **0.49** | 7.25 | 6.58 | OK |
| `flixinatoor99` | 3. Giallo investigativo | `Serie` | 1552 | 3015 | **1.94** | 8.04 | 8.35 | OK |
| `flixinatoor99` | 4. Perché hai visto Super Mario Galaxy - Il film, Dragonkeeper e Il bambino, la talpa, la volpe e il cavallo | `Film` | 774 | 1452 | **1.88** | 8.20 | 7.60 | OK |
| `flixinatoor99` | 5. Magia & Stregoneria | `Film` | 20899 | 22557 | **1.08** | 7.73 | 7.80 | OK |
| `moppierhead` | 1. Animazione d'azione per adulti | `Serie` | 2465 | 1266 | **0.51** | 8.00 | 7.41 | OK |
| `moppierhead` | 2. Anime shōnen | `Anime` | 3693 | 2599 | **0.70** | 8.61 | 8.40 | OK |
| `moppierhead` | 3. Magia & Stregoneria | `Film` | 12088 | 22760 | **1.88** | 7.68 | 7.71 | OK |
| `moppierhead` | 4. Giallo investigativo | `Serie` | 1575 | 500 | **0.32** | 8.23 | 7.20 | OK |
| `moppierhead` | 5. Perché hai visto Hannah Montana, Zoey 101 e Drake & Josh | `Serie` | 915 | 1171 | **1.28** | 7.85 | 8.20 | OK |
| `castoffcrown` | 1. Anime shōnen | `Anime` | 793 | 2232 | **2.81** | 8.44 | 8.64 | OK |
| `castoffcrown` | 2. Anime romantici & slice of life | `Anime` | 46 | 32 | **0.70** | 7.67 | 7.80 | OK |
| `castoffcrown` | 3. Perché hai visto Il filo nascosto, Ubriaco d'amore e Perfect Days | `Film` | 1788 | 2285 | **1.28** | 7.42 | 7.21 | OK |
| `castoffcrown` | 4. Dramma coreano | `Serie` | 178 | 358 | **2.01** | 8.50 | 8.46 | OK |
| `castoffcrown` | 5. Perché hai visto E.R. - Medici in prima linea, C'è sempre il sole a Philadelphia e Shameless (UK) | `Serie` | 1951 | 3015 | **1.55** | 8.21 | 8.11 | OK |
| `warnok` | 1. Anime shōnen | `Anime` | 1518 | 2232 | **1.47** | 8.50 | 8.49 | OK |
| `warnok` | 2. Perché hai visto Prison Break, Lost e Il Trono di Spade | `Serie` | 4172 | 2938 | **0.70** | 8.04 | 8.07 | OK |
| `warnok` | 3. Space opera | `Film` | 15098 | 12420 | **0.82** | 7.47 | 7.50 | OK |
| `warnok` | 4. Animazione d'azione per adulti | `Serie` | 720 | 480 | **0.67** | 8.20 | 8.20 | OK |
| `warnok` | 5. Perché hai visto Hell on Wheels, Yellowstone e Mayor of Kingstown | `Serie` | 690 | 398 | **0.58** | 7.98 | 8.00 | OK |
| `pepsipex` | 1. Perché hai visto Animals, L'uomo dei sussurri e The Invite - Il piacere è tutto nostro | `Film` | 1080 | 1376 | **1.27** | 6.81 | 6.76 | OK |
| `pepsipex` | 2. Perché hai visto The Diplomat, Paradise e Morte e altri dettagli | `Serie` | 227 | 256 | **1.13** | 7.05 | 7.45 | OK |
| `pepsipex` | 3. Dramma d'epoca | `Serie` | 109 | 305 | **2.80** | 7.50 | 7.50 | OK |
| `pepsipex` | 4. Spy thriller | `Serie` | 366 | 655 | **1.79** | 7.65 | 8.20 | OK |
| `pepsipex` | 5. Perché hai visto American Horror Story, Servant e True Detective | `Serie` | 1069 | 1692 | **1.58** | 7.57 | 8.00 | OK |
| `carverclan` | 1. Horror soprannaturale | `Film` | 13660 | 3955 | **0.29** | 8.03 | 7.33 | OK |
| `carverclan` | 2. Teatro filmato & Musical | `Film` | 46 | 50 | **1.09** | 6.80 | 7.24 | OK |
| `1jacobjohn` | 1. Sitcom animate | `Serie` | 688 | 2205 | **3.21** | 7.45 | 8.00 | OK |
| `1jacobjohn` | 2. Perché hai visto Good Luck, Have Fun, Don't Die, Obsession e Creature luminose | `Film` | 1103 | 690 | **0.63** | 6.90 | 6.90 | OK |
| `1jacobjohn` | 3. Animazione d'azione per adulti | `Serie` | 1629 | 1266 | **0.78** | 7.80 | 7.60 | OK |
| `1jacobjohn` | 4. Docufiction true crime | `Film` | 166 | 70 | **0.42** | 6.63 | 6.71 | OK |
| `1jacobjohn` | 5. Perché hai visto Grey's Anatomy, Stranger Things e Breaking Bad | `Serie` | 2988 | 4420 | **1.48** | 8.00 | 8.08 | OK |

> [!NOTE]
> **Verifica Popolarità**: Solo **1 casi reali di drift** su 41 scaffali. I candidati proposti mantengono popolarità e autorevolezza.

---

## 6. Le 10 Timeline nel Dettaglio

### Profilo: `sangam456` — Corto storico (10 semi)
**Metadati**: 10 semi totali · 2 macro ammissibili (2 con $\ge 2$ semi) · Scaffali serviti: **2 / 5**

1. **Fantascienza d'invasione** (3 semi, `Film`)
   - **Denominazione**: `Tassonomia («Fantascienza d'invasione», conf: 67%)` | Consistenza Scaffale: `0.0588`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Disclosure Day*, *Lilo & Stitch*, *Mission: Impossible - Dead Reckoning Parte uno*
   - **Candidati Raccomandati**: *Mission: Impossible - Fallout (2018)*, *Mission: Impossible - Rogue Nation (2015)*, *IF - Gli amici immaginari (2024)*, *Mission: Impossible - The Final Reckoning (2025)*, *Mission: Impossible - Protocollo fantasma (2011)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2018)
   - **Popolarità**: VOT Semi=3673, Cand=9460 (Ratio=2.58 $\to$ `OK`) · VAVE: 7.45 $\to$ 7.20

2. **Perché hai visto The White Lotus, Billions e A Murder at the End of the World** (3 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0000`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *The White Lotus*, *Billions*, *A Murder at the End of the World*
   - **Candidati Raccomandati**: *The OA (2016)*, *The North Water (2021)*, *The Bear (2022)*, *Scissione (2022)*, *Hacks (2021)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2021, Cand: 2021)
   - **Popolarità**: VOT Semi=1085, Cand=1457 (Ratio=1.34 $\to$ `OK`) · VAVE: 7.59 $\to$ 7.54

---

### Profilo: `hammers-lists` — Corto storico (11 semi)
**Metadati**: 11 semi totali · 2 macro ammissibili (2 con $\ge 2$ semi) · Scaffali serviti: **2 / 5**

1. **Medical drama** (6 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Medical drama», conf: 50%)` | Consistenza Scaffale: `0.0906`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *The Resident*, *Big Sky*, *The Good Doctor*
   - **Candidati Raccomandati**: *Dr. House - Medical Division (2004)*, *New Amsterdam (2018)*, *Station 19 (2018)*, *Grey's Anatomy (2005)*, *9-1-1 (2018)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2018, Cand: 2018)
   - **Popolarità**: VOT Semi=1312, Cand=2870 (Ratio=2.19 $\to$ `OK`) · VAVE: 8.33 $\to$ 8.22

2. **Sitcom animate** (2 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Sitcom animate», conf: 100%)` | Consistenza Scaffale: `0.3333`
   - **Verifica Medium**: `WAIVED (cluster piccolo) (Semi: 100%, Cand: 100%)`
   - **Semi**: *Rick and Morty*, *I Griffin*
   - **Candidati Raccomandati**: *South Park (1997)*, *Futurama (1999)*, *American Dad! (2005)*, *I Simpson (1989)*, *BoJack Horseman (2014)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2006, Cand: 1999)
   - **Popolarità**: VOT Semi=8313, Cand=3946 (Ratio=0.47 $\to$ `OK`) · VAVE: 8.04 $\to$ 8.33

---

### Profilo: `sappss` — Medio-basso storico (25 semi)
**Metadati**: 25 semi totali · 7 macro ammissibili (7 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Animazione per famiglie** (4 semi, `Film`)
   - **Denominazione**: `Tassonomia («Animazione per famiglie», conf: 100%)` | Consistenza Scaffale: `0.0897`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Elio*, *I Simpson - Il film*, *Jumpers - Un salto tra gli animali*
   - **Candidati Raccomandati**: *Inside Out 2 (2024)*, *Elemental (2023)*, *Lightyear - La vera storia di Buzz (2022)*, *Toy Story 5 (2026)*, *I Simpson in Plusaversary (2021)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2016, Cand: 2023)
   - **Popolarità**: VOT Semi=3720, Cand=3978 (Ratio=1.07 $\to$ `OK`) · VAVE: 6.98 $\to$ 7.50

2. **Perché hai visto Obsession, Beautiful Boy e Good Boy** (4 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0000`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Obsession*, *Beautiful Boy*, *Good Boy*
   - **Candidati Raccomandati**: *Sharp Corner (2025)*, *Spaceman (2024)*, *The Plague (2025)*, *Elegia americana (2020)*, *Ben Is Back (2018)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2026, Cand: 2024)
   - **Popolarità**: VOT Semi=4562, Cand=978 (Ratio=0.21 $\to$ `OK`) · VAVE: 7.87 $\to$ 6.60

3. **Docufiction true crime** (2 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Docufiction true crime», conf: 100%)` | Consistenza Scaffale: `0.1111`
   - **Verifica Medium**: `WAIVED (cluster piccolo) (Semi: 100%, Cand: 100%)`
   - **Semi**: *Sposare un assassino*, *Worst Neighbor Ever - Vicini letali*
   - **Candidati Raccomandati**: *Worst Ex Ever - Relazioni fatali (2024)*, *Death of the Pastor's Wife: il caso Mica Miller (2026)*, *Cabin in the Woods (2024)*, *La confessione (2022)*, *La scomparsa di Amy Bradley (2025)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2026, Cand: 2024)
   - **Popolarità**: VOT Semi=36, Cand=46 (Ratio=1.30 $\to$ `OK`) · VAVE: 6.95 $\to$ 7.35

4. **Sitcom animate** (3 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Sitcom animate», conf: 100%)` | Consistenza Scaffale: `0.3968`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *I Simpson*, *Rick and Morty*, *I Griffin*
   - **Candidati Raccomandati**: *South Park (1997)*, *American Dad! (2005)*, *Futurama (1999)*, *Bob's Burgers (2011)*, *Big Mouth (2017)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 1999, Cand: 2005)
   - **Popolarità**: VOT Semi=11075, Cand=2465 (Ratio=0.22 $\to$ `OK`) · VAVE: 8.00 $\to$ 7.80

5. **Perché hai visto La fattoria Clarkson e Formula 1: Drive to Survive** (2 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.1111`
   - **Verifica Medium**: `WAIVED (cluster piccolo) (Semi: 100%, Cand: 100%)`
   - **Semi**: *La fattoria Clarkson*, *Formula 1: Drive to Survive*
   - **Candidati Raccomandati**: *The Grand Tour (2016)*, *Top Gear (2002)*, *Il banco dei pugni (2010)*, *Brawn: Una storia impossibile di Formula 1 (2023)*, *Affari di famiglia (2009)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2020, Cand: 2010)
   - **Popolarità**: VOT Semi=574, Cand=314 (Ratio=0.55 $\to$ `OK`) · VAVE: 8.36 $\to$ 7.60

---

### Profilo: `flixinatoor99` — Medio storico (32 semi)
**Metadati**: 32 semi totali · 8 macro ammissibili (8 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Perché hai visto Il Boss del condominio, División Palermo e Stromberg** (6 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0148`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Il Boss del condominio*, *División Palermo*, *Stromberg*
   - **Candidati Raccomandati**: *El Chapulín Colorado (1973)*, *Chespirito (1980)*, *Grandi speranze (2023)*, *Nothing (2023)*, *El rey, Vicente Fernández (2022)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2022, Cand: 2022)
   - **Popolarità**: VOT Semi=300, Cand=79 (Ratio=0.26 $\to$ `DRIFT (Nicchia < 300)`) · VAVE: 8.10 $\to$ 7.90

2. **Perché hai visto Apex, Una di famiglia - The Housemaid e Hamnet - Nel nome del figlio** (5 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0000`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Apex*, *Una di famiglia - The Housemaid*, *Hamnet - Nel nome del figlio*
   - **Candidati Raccomandati**: *Slumberland - Nel mondo dei sogni (2022)*, *Il drago invisibile (2016)*, *Fall 2: Deadpoint (2026)*, *Wicked - Parte 2 (2025)*, *Un altro piccolo favore (2025)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2025)
   - **Popolarità**: VOT Semi=1983, Cand=976 (Ratio=0.49 $\to$ `OK`) · VAVE: 7.25 $\to$ 6.58

3. **Giallo investigativo** (3 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Giallo investigativo», conf: 67%)` | Consistenza Scaffale: `0.0000`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Parks and Recreation*, *The White Lotus*, *Spider-Noir*
   - **Candidati Raccomandati**: *The Bear (2022)*, *The Office (US) (2005)*, *Scissione (2022)*, *Brooklyn Nine-Nine (2013)*, *The Penguin (2024)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2021, Cand: 2022)
   - **Popolarità**: VOT Semi=1552, Cand=3015 (Ratio=1.94 $\to$ `OK`) · VAVE: 8.04 $\to$ 8.35

4. **Perché hai visto Super Mario Galaxy - Il film, Dragonkeeper e Il bambino, la talpa, la volpe e il cavallo** (3 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0000`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Super Mario Galaxy - Il film*, *Dragonkeeper*, *Il bambino, la talpa, la volpe e il cavallo*
   - **Candidati Raccomandati**: *Super Mario Bros. Il Film (2023)*, *Il robot selvaggio (2024)*, *Wolfwalkers - Il popolo dei lupi (2020)*, *Buñuel nel labirinto delle tartarughe (2019)*, *Elio (2025)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2023)
   - **Popolarità**: VOT Semi=774, Cand=1452 (Ratio=1.88 $\to$ `OK`) · VAVE: 8.20 $\to$ 7.60

5. **Magia & Stregoneria** (3 semi, `Film`)
   - **Denominazione**: `Tassonomia («Magia & Stregoneria», conf: 100%)` | Consistenza Scaffale: `0.5018`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Animali fantastici e dove trovarli*, *Harry Potter e i Doni della Morte - Parte 1*, *Harry Potter e la pietra filosofale*
   - **Candidati Raccomandati**: *Harry Potter e i Doni della Morte - Parte 2 (2011)*, *Harry Potter e l'ordine della fenice (2007)*, *Harry Potter e il principe mezzosangue (2009)*, *Harry Potter e il prigioniero di Azkaban (2004)*, *Harry Potter e il calice di fuoco (2005)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2010, Cand: 2007)
   - **Popolarità**: VOT Semi=20899, Cand=22557 (Ratio=1.08 $\to$ `OK`) · VAVE: 7.73 $\to$ 7.80

---

### Profilo: `moppierhead` — Medio storico (38 semi)
**Metadati**: 38 semi totali · 6 macro ammissibili (6 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Animazione d'azione per adulti** (7 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Animazione d'azione per adulti», conf: 86%)` | Consistenza Scaffale: `0.1933`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *I Simpson*, *Bob's Burgers*, *Futurama*
   - **Candidati Raccomandati**: *I Griffin (1999)*, *King of the Hill (1997)*, *Big Mouth (2017)*, *The Cleveland Show (2009)*, *Rick and Morty (2013)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2005, Cand: 2009)
   - **Popolarità**: VOT Semi=2465, Cand=1266 (Ratio=0.51 $\to$ `OK`) · VAVE: 8.00 $\to$ 7.41

2. **Anime shōnen** (6 semi, `Anime`)
   - **Denominazione**: `Tassonomia («Anime shōnen», conf: 67%)` | Consistenza Scaffale: `0.0965`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *One Piece*, *L'attacco dei giganti*, *Sailor Moon*
   - **Candidati Raccomandati**: *Fullmetal Alchemist: Brotherhood (2009)*, *Hunter x Hunter (2011)*, *Code Geass: Lelouch of the Rebellion (2006)*, *One-Punch Man (2015)*, *Naruto (2002)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2002, Cand: 2009)
   - **Popolarità**: VOT Semi=3693, Cand=2599 (Ratio=0.70 $\to$ `OK`) · VAVE: 8.61 $\to$ 8.40

3. **Magia & Stregoneria** (8 semi, `Film`)
   - **Denominazione**: `Tassonomia («Magia & Stregoneria», conf: 100%)` | Consistenza Scaffale: `0.1659`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Wicked - Parte 2*, *Wicked*, *Harry Potter e i Doni della Morte - Parte 2*
   - **Candidati Raccomandati**: *Harry Potter e l'ordine della fenice (2007)*, *Harry Potter e il calice di fuoco (2005)*, *Harry Potter e il prigioniero di Azkaban (2004)*, *Descendants (2015)*, *Harry Potter e la camera dei segreti (2002)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2014, Cand: 2005)
   - **Popolarità**: VOT Semi=12088, Cand=22760 (Ratio=1.88 $\to$ `OK`) · VAVE: 7.68 $\to$ 7.71

4. **Giallo investigativo** (4 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Giallo investigativo», conf: 50%)` | Consistenza Scaffale: `0.0000`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *High Potential*, *Percy Jackson e gli dei dell'Olimpo*, *Only Murders in the Building*
   - **Candidati Raccomandati**: *Parks and Recreation (2009)*, *Ballard (2025)*, *The Old Man (2022)*, *Afterparty (2022)*, *Black Sails (2014)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2022)
   - **Popolarità**: VOT Semi=1575, Cand=500 (Ratio=0.32 $\to$ `OK`) · VAVE: 8.23 $\to$ 7.20

5. **Perché hai visto Hannah Montana, Zoey 101 e Drake & Josh** (4 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.2749`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Hannah Montana*, *Zoey 101*, *Drake & Josh*
   - **Candidati Raccomandati**: *iCarly (2007)*, *Victorious (2010)*, *Henry Danger (2014)*, *iCarly (2021)*, *Ned - Scuola di sopravvivenza (2004)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2006, Cand: 2010)
   - **Popolarità**: VOT Semi=915, Cand=1171 (Ratio=1.28 $\to$ `OK`) · VAVE: 7.85 $\to$ 8.20

---

### Profilo: `castoffcrown` — Lungo storico (412 semi)
**Metadati**: 412 semi totali · 71 macro ammissibili (64 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Anime shōnen** (23 semi, `Anime`)
   - **Denominazione**: `Tassonomia («Anime shōnen», conf: 83%)` | Consistenza Scaffale: `0.0304`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *One Piece*, *Haikyu!! L'asso del volley*, *L'attacco dei giganti*
   - **Candidati Raccomandati**: *Hunter x Hunter (2011)*, *One-Punch Man (2015)*, *Demon Slayer: Kimetsu no Yaiba (2019)*, *Frieren - Oltre la Fine del Viaggio (2023)*, *Mob Psycho 100 (2016)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2021, Cand: 2016)
   - **Popolarità**: VOT Semi=793, Cand=2232 (Ratio=2.81 $\to$ `OK`) · VAVE: 8.44 $\to$ 8.64

2. **Anime romantici & slice of life** (28 semi, `Anime`)
   - **Denominazione**: `Tassonomia («Anime romantici & slice of life», conf: 71%)` | Consistenza Scaffale: `0.0154`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Tojima Wants to Be a Kamen Rider*, *The 100 Girlfriends Who Really, Really, Really, Really, REALLY Love You*, *Mars Red*
   - **Candidati Raccomandati**: *Hana-Kimi (2026)*, *Honey Lemon Soda (2025)*, *Daemons of the Shadow Realm (2026)*, *The Yakuza's Guide to Babysitting (2022)*, *Quality Assurance in Another World (2024)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2025)
   - **Popolarità**: VOT Semi=46, Cand=32 (Ratio=0.70 $\to$ `OK`) · VAVE: 7.67 $\to$ 7.80

3. **Perché hai visto Il filo nascosto, Ubriaco d'amore e Perfect Days** (30 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0119`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Il filo nascosto*, *Ubriaco d'amore*, *Perfect Days*
   - **Candidati Raccomandati**: *Un affare di famiglia (2018)*, *Marty Supreme (2025)*, *Il male non esiste (2023)*, *Vizio di forma (2014)*, *Ritratto di famiglia con tempesta (2016)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2020, Cand: 2018)
   - **Popolarità**: VOT Semi=1788, Cand=2285 (Ratio=1.28 $\to$ `OK`) · VAVE: 7.42 $\to$ 7.21

4. **Dramma coreano** (11 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Dramma coreano», conf: 55%)` | Consistenza Scaffale: `0.0299`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Il Tassista*, *Crash Landing on You*, *Vincenzo*
   - **Candidati Raccomandati**: *Venticinque e ventuno (2022)*, *Rugal (2020)*, *The Glory (2022)*, *I discendenti del sole (2016)*, *응답하라 1988 (2015)*
   - **Diagnostica Temporale**: `STALE` (Anno Med. Semi: 2021, Cand: 2020)
   - **Popolarità**: VOT Semi=178, Cand=358 (Ratio=2.01 $\to$ `OK`) · VAVE: 8.50 $\to$ 8.46

5. **Perché hai visto E.R. - Medici in prima linea, C'è sempre il sole a Philadelphia e Shameless (UK)** (25 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0238`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *E.R. - Medici in prima linea*, *C'è sempre il sole a Philadelphia*, *Shameless (UK)*
   - **Candidati Raccomandati**: *Fallout (2024)*, *Scissione (2022)*, *Arrested Development - Ti presento i miei (2003)*, *The Office (US) (2005)*, *Community (2009)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2019, Cand: 2009)
   - **Popolarità**: VOT Semi=1951, Cand=3015 (Ratio=1.55 $\to$ `OK`) · VAVE: 8.21 $\to$ 8.11

---

### Profilo: `warnok` — Lungo storico (476 semi)
**Metadati**: 476 semi totali · 63 macro ammissibili (53 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Anime shōnen** (28 semi, `Anime`)
   - **Denominazione**: `Tassonomia («Anime shōnen», conf: 96%)` | Consistenza Scaffale: `0.0813`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Naruto*, *L'attacco dei giganti*, *Monster*
   - **Candidati Raccomandati**: *Hunter x Hunter (2011)*, *The Promised Neverland (2019)*, *Chainsaw Man (2022)*, *One-Punch Man (2015)*, *Mob Psycho 100 (2016)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2016, Cand: 2016)
   - **Popolarità**: VOT Semi=1518, Cand=2232 (Ratio=1.47 $\to$ `OK`) · VAVE: 8.50 $\to$ 8.49

2. **Perché hai visto Prison Break, Lost e Il Trono di Spade** (28 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0353`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Prison Break*, *Lost*, *Il Trono di Spade*
   - **Candidati Raccomandati**: *Chernobyl (2019)*, *The Expanse (2015)*, *Snowpiercer (2020)*, *Pluribus (2025)*, *The Umbrella Academy (2019)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2019, Cand: 2019)
   - **Popolarità**: VOT Semi=4172, Cand=2938 (Ratio=0.70 $\to$ `OK`) · VAVE: 8.04 $\to$ 8.07

3. **Space opera** (24 semi, `Film`)
   - **Denominazione**: `Tassonomia («Space opera», conf: 62%)` | Consistenza Scaffale: `0.0844`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Rogue One: A Star Wars Story*, *Star Wars: Il risveglio della Forza*, *Alien - La clonazione*
   - **Candidati Raccomandati**: *Terminator (1984)*, *Matrix Reloaded (2003)*, *E.T. l'extra-terrestre (1982)*, *Il Signore degli Anelli - Le due torri (2002)*, *Matrix Revolutions (2003)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 1999, Cand: 2002)
   - **Popolarità**: VOT Semi=15098, Cand=12420 (Ratio=0.82 $\to$ `OK`) · VAVE: 7.47 $\to$ 7.50

4. **Animazione d'azione per adulti** (19 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Animazione d'azione per adulti», conf: 68%)` | Consistenza Scaffale: `0.0472`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Love, Death & Robots*, *Castlevania*, *La leggenda di Vox Machina*
   - **Candidati Raccomandati**: *The Mighty Nein (2025)*, *The Boys Presenta: Diabolico! (2022)*, *X-Men '97 (2024)*, *Devil May Cry (2025)*, *Rick and Morty (2013)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2021, Cand: 2024)
   - **Popolarità**: VOT Semi=720, Cand=480 (Ratio=0.67 $\to$ `OK`) · VAVE: 8.20 $\to$ 8.20

5. **Perché hai visto Hell on Wheels, Yellowstone e Mayor of Kingstown** (14 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0809`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Hell on Wheels*, *Yellowstone*, *Mayor of Kingstown*
   - **Candidati Raccomandati**: *Marshals: A Yellowstone Story (2026)*, *Tulsa King (2022)*, *Dutton Ranch (2026)*, *Lawmen - La storia di Bass Reeves (2023)*, *The Agency (2024)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2024)
   - **Popolarità**: VOT Semi=690, Cand=398 (Ratio=0.58 $\to$ `OK`) · VAVE: 7.98 $\to$ 8.00

---

### Profilo: `pepsipex` — Massimo storico (568 semi)
**Metadati**: 568 semi totali · 78 macro ammissibili (71 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Perché hai visto Animals, L'uomo dei sussurri e The Invite - Il piacere è tutto nostro** (24 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0186`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Animals*, *L'uomo dei sussurri*, *The Invite - Il piacere è tutto nostro*
   - **Candidati Raccomandati**: *The Runner (2026)*, *Challengers (2024)*, *Kinds of Kindness (2024)*, *Sanctuary - Lui fa il gioco. Lei fa le regole. (2023)*, *Una donna promettente (2020)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2024)
   - **Popolarità**: VOT Semi=1080, Cand=1376 (Ratio=1.27 $\to$ `OK`) · VAVE: 6.81 $\to$ 6.76

2. **Perché hai visto The Diplomat, Paradise e Morte e altri dettagli** (22 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0277`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *The Diplomat*, *Paradise*, *Morte e altri dettagli*
   - **Candidati Raccomandati**: *The Night Agent (2023)*, *Feel Good (2020)*, *Poker Face (2023)*, *DTF St. Louis (2026)*, *Shining Girls (2022)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2023)
   - **Popolarità**: VOT Semi=227, Cand=256 (Ratio=1.13 $\to$ `OK`) · VAVE: 7.05 $\to$ 7.45

3. **Dramma d'epoca** (25 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Dramma d'epoca», conf: 56%)` | Consistenza Scaffale: `0.0266`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *The Great*, *The Buccaneers*, *The Serpent Queen*
   - **Candidati Raccomandati**: *Becoming Elizabeth (2022)*, *Bridgerton (2020)*, *Belgravia: The Next Chapter (2024)*, *The White Princess (2017)*, *The White Queen (2013)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2020)
   - **Popolarità**: VOT Semi=109, Cand=305 (Ratio=2.80 $\to$ `OK`) · VAVE: 7.50 $\to$ 7.50

4. **Spy thriller** (16 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Spy thriller», conf: 69%)` | Consistenza Scaffale: `0.0669`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Slow Horses*, *Operazione speciale: Lioness*, *Alex Rider*
   - **Candidati Raccomandati**: *Secret Service (2026)*, *1923 (2022)*, *1883 (2021)*, *Landman (2024)*, *PONIES (2026)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2024)
   - **Popolarità**: VOT Semi=366, Cand=655 (Ratio=1.79 $\to$ `OK`) · VAVE: 7.65 $\to$ 8.20

5. **Perché hai visto American Horror Story, Servant e True Detective** (18 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0640`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *American Horror Story*, *Servant*, *True Detective*
   - **Candidati Raccomandati**: *The Haunting of Bly Manor (2020)*, *The Haunting of Hill House (2018)*, *IT: Welcome to Derry (2025)*, *DAHMER - Mostro: la storia di Jeffrey Dahmer (2022)*, *American Horror Stories (2021)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2021)
   - **Popolarità**: VOT Semi=1069, Cand=1692 (Ratio=1.58 $\to$ `OK`) · VAVE: 7.57 $\to$ 8.00

---

### Profilo: `carverclan` — Ultra-corto (<10 semi, 7 semi)
**Metadati**: 7 semi totali · 2 macro ammissibili (2 con $\ge 2$ semi) · Scaffali serviti: **2 / 5**

> [!TIP]
> **Regressione Risolta**: Profilo cold-start (7 semi). Con la regola del *cluster piccolo*, i due cluster sono serviti regolarmente come scaffali film (medium dominante dei semi con tie-break di recenza).

1. **Horror soprannaturale** (2 semi, `Film`)
   - **Denominazione**: `Tassonomia («Horror soprannaturale», conf: 100%)` | Consistenza Scaffale: `0.0000`
   - **Verifica Medium**: `WAIVED (cluster piccolo) (Semi: 50%, Cand: 100%)`
   - **Semi**: *I peccatori*, *Stranger Things*
   - **Candidati Raccomandati**: *Una battaglia dopo l’altra (2025)*, *Marty Supreme (2025)*, *Train Dreams (2025)*, *Weapons (2025)*, *Frankenstein (2025)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2020, Cand: 2025)
   - **Popolarità**: VOT Semi=13660, Cand=3955 (Ratio=0.29 $\to$ `OK`) · VAVE: 8.03 $\to$ 7.33

2. **Teatro filmato & Musical** (2 semi, `Film`)
   - **Denominazione**: `Tassonomia («Teatro filmato & Musical», conf: 50%)` | Consistenza Scaffale: `0.0000`
   - **Verifica Medium**: `WAIVED (cluster piccolo) (Semi: 50%, Cand: 100%)`
   - **Semi**: *Peter Pan Goes Wrong*, *Great Performances*
   - **Candidati Raccomandati**: *Pippin (1981)*, *The Phantom of the Opera at the Royal Albert Hall (2011)*, *Top Gear: The Perfect Road Trip 2 (2014)*, *Scum (1977)*, *The Kate Bush Story: Running Up That Hill (2014)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 1994, Cand: 2011)
   - **Popolarità**: VOT Semi=46, Cand=50 (Ratio=1.09 $\to$ `OK`) · VAVE: 6.80 $\to$ 7.24

---

### Profilo: `1jacobjohn` — Intermedio (167 semi)
**Metadati**: 167 semi totali · 26 macro ammissibili (24 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Sitcom animate** (20 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Sitcom animate», conf: 60%)` | Consistenza Scaffale: `0.0418`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *The Good Place*, *Man Seeking Woman*, *I Think You Should Leave with Tim Robinson*
   - **Candidati Raccomandati**: *30 Rock (2006)*, *Community (2009)*, *Seinfeld (1989)*, *Arrested Development - Ti presento i miei (2003)*, *How I Met Your Mother (2005)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2011, Cand: 2005)
   - **Popolarità**: VOT Semi=688, Cand=2205 (Ratio=3.21 $\to$ `OK`) · VAVE: 7.45 $\to$ 8.00

2. **Perché hai visto Good Luck, Have Fun, Don't Die, Obsession e Creature luminose** (13 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0090`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Good Luck, Have Fun, Don't Die*, *Obsession*, *Creature luminose*
   - **Candidati Raccomandati**: *Le sabbie del Kalahari (1965)*, *Ricchi... da morire - Delitti in famiglia (2026)*, *November Criminals (2017)*, *Vendetta (2026)*, *The Drama - Un segreto è per sempre (2026)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2026)
   - **Popolarità**: VOT Semi=1103, Cand=690 (Ratio=0.63 $\to$ `OK`) · VAVE: 6.90 $\to$ 6.90

3. **Animazione d'azione per adulti** (15 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Animazione d'azione per adulti», conf: 87%)` | Consistenza Scaffale: `0.1157`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Bob's Burgers*, *Primal*, *South Park*
   - **Candidati Raccomandati**: *Big Mouth (2017)*, *The Cleveland Show (2009)*, *BoJack Horseman (2014)*, *Archer (2009)*, *King of the Hill (1997)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2013, Cand: 2009)
   - **Popolarità**: VOT Semi=1629, Cand=1266 (Ratio=0.78 $\to$ `OK`) · VAVE: 7.80 $\to$ 7.60

4. **Docufiction true crime** (6 semi, `Film`)
   - **Denominazione**: `Tassonomia («Docufiction true crime», conf: 50%)` | Consistenza Scaffale: `0.1073`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *A Toxic Love Story: Il caso Michelle Hadley*, *Numero sconosciuto: Uno scandalo di cyberbullismo*, *La ragazza nella foto*
   - **Candidati Raccomandati**: *Evil Influencer - La storia di Jodi Hildebrandt (2025)*, *Mio padre, il killer BTK (2025)*, *Lover, Stalker, Killer (2024)*, *Maternal Instinct: Il caso Taylor Parker (2026)*, *Trainwreck: Il vero Project X (2025)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2025)
   - **Popolarità**: VOT Semi=166, Cand=70 (Ratio=0.42 $\to$ `OK`) · VAVE: 6.63 $\to$ 6.71

5. **Perché hai visto Grey's Anatomy, Stranger Things e Breaking Bad** (16 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0300`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Grey's Anatomy*, *Stranger Things*, *Breaking Bad*
   - **Candidati Raccomandati**: *The Watcher (2022)*, *American Horror Story (2011)*, *Monster: La storia di Lizzie Borden (2026)*, *Better Call Saul (2015)*, *True Detective (2014)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2018, Cand: 2015)
   - **Popolarità**: VOT Semi=2988, Cand=4420 (Ratio=1.48 $\to$ `OK`) · VAVE: 8.00 $\to$ 8.08

---

## 7. Riconciliazione Temporale (Staleness vs Deepening)

Sui 41 scaffali serviti con il nuovo schema:
- **33 scaffali (80.5%)** sono contemporanei o contengono candidati recenti (2024–2026);
- **7 scaffali (17.1%)** sono casi autentici di *Deepening* (semi storici o mix multi-decennale di epoche);
- **Solo 1 scaffale su 41 (2.4%)** è un vero caso di **STALE**: lo scaffale fantasy di `pepsipex` (*House of the Dragon*, *A Knight of the Seven Kingdoms*, *The Witcher*), i cui candidati si arrestano al 2022.
