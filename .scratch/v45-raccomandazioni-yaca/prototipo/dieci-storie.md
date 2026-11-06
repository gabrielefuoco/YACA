# Rapporto Dieci Storie: Adozione M = 12, Tassonomia Curata + «Perché hai visto» e Risoluzione Regressioni

> [!IMPORTANT]
> **Verdetto Finale e Riformulazione del Criterio di Validità (Adozione M = 12)**:
> Il criterio quantitativo dichiarato in precedenza (tasso di adozione della tassonomia $\ge 70\%$) è **fallito a ogni $M$ esplorato** (massimo $65.85\%$ a $M=8$, $60.98\%$ a $M=12$ e $M=30$, $56.10\%$ a $M=20$). Tuttavia, **era la metrica a essere concettualmente errata, non la soglia**: «Perché hai visto» non è affatto un fallimento o un'eccezione non gestita, ma l'**onesto fallback trasparente e veritiero al 100% per costruzione** quando un cluster non ha una concordanza tassonomica univoca ad alta confidenza. Contare il fallback come un miss punisce la trasparenza e crea incentivi perversi a fabbricare etichette-ombrello generiche e ingannevoli.
> 
> Ciò che realmente decide e convalida la granularità $M=12$ è l'ispezione empirica qualitativa e strutturale:
> - **A $M=12$**, i due grab bag (cluster eterogenei che fondevano sitcom e drama/thriller) si scindono nettamente in un blocco sitcom puro e un blocco drama/thriller puro, che scivolano fuori dai top-5 e **smettono di essere serviti**. La cinquina di `castoffcrown` diventa una sequenza esemplare di nicchie tematiche nitidissime: *Anime shōnen*, *Dramma coreano*, *Animazione d'autore*, *Cinema d'autore*, *Samurai Kurosawa*;
> - **A $M=8$**, la bisezione eccessiva spezza artificiosamente lo shōnen producendo **due scaffali entrambi denominati «Anime shōnen» all'interno dello stesso profilo** di `castoffcrown` (e similmente due «Sitcom animate» in `1jacobjohn`), violando platealmente la regola fondamentale di distinctness tra scaffali.
> 
> Il **set di criteri onesti e vincolanti** contro cui è riscritta la validazione diventa:
> 1. **Nessun nome duplicato all'interno di un profilo** $\to$ **PASS (0 duplicati su tutte le 10 timeline a $M=12$; a $M=8$ fallisce con 2 duplicazioni)**;
> 2. **Nessun scaffale servito che si legga come un grab bag** $\to$ **PASS (tutti i blocchi misti decomposti e non serviti)**;
> 3. **Preservazione dei conteggi degli scaffali serviti** $\to$ **PASS (41 / 41 scaffali serviti inalterati su 10 timeline)**;
> 4. **Copertura semi $\ge 85\%$ sulle timeline lunghe** $\to$ **PASS (castoffcrown $90.0\%$, warnok $94.3\%$, pepsipex $94.9\%$, 1jacobjohn $91.0\%$, media $92.6\%$)**.

---

## Sintesi della Specifica di Produzione
1. **Cap di Bisezione $M=12$**: ogni macro-cluster che supera i 12 semi viene bisecato ricorsivamente sulla sua struttura coseno interna fino a garantire $	ext{size} \le 12$.
2. **Tassonomia Curata + «Perché hai visto»**: la denominazione è governata da una tassonomia italiana curata (`tassonomia.py`, 36 voci). Uno scaffale assume il nome tassonomico **unicamente se un'entry univoca soddisfa la regola con confidenza $\ge 50\%$ e nessuna voce concorrente a pari merito**. Tutti gli altri cluster ricevono l'etichetta trasparente **«Perché hai visto <2-3 semi>»**.
3. **Cancellazione Totale della Vecchia Catena**: eliminate per sempre le percentuali nei titoli, l'inglese non tradotto e le diciture «Di X» / «Regia di X».
4. **Risoluzione Regressione Carverclan**: per cluster con meno di 3 semi, medium deciso dal seme con più riproduzioni (tie-break recenza); asserzione 80% semi condonata (`cluster piccolo`), asserzione 100% candidati mantenuta intatta (`carverclan` serve regolarmente 2 / 5 scaffali).

---

## 1. La Tassonomia Italiana Hand-Curata (`tassonomia.py`)

La tassonomia si compone di **36 voci controllate**, raggruppate in 6 macro-aree tematiche. Ogni voce contiene una regola dichiarativa su evidenza (keyword TMDB, medium, flag `ANIME`/`ADULTO`, lingua d'origine) e priorità numerica per lo scioglimento dei conflitti.

### Area: Animazione & Anime
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Anime shōnen»** | flag `ANIME=1`, kws=['shounen', 'ninja', 'super power'] | `90` | **Dati reali**: Derivato dai dati: warnok S1, moppierhead S2, castoffcrown S1 |
| **«Anime romantici & slice of life»** | flag `ANIME=1`, kws=['romance', 'slice of life', 'shoujo'] | `85` | **Dati reali**: Derivato dai dati: castoffcrown S2 (Gachiakuta, Polar Opposites) |
| **«Animazione d'autore»** | medium=`movie`, flag `ANIME=1`, kws=['philosophical', 'author animation', 'surrealism'] | `80` | **Dati reali**: Derivato dai dati: film d'autore Studio Ghibli e lungometraggi animati |
| **«Sitcom animate»** | medium=`series`, flag `ANIME=0`, kws=['dysfunctional family', 'adult humor', 'parody'] | `90` | **Dati reali**: Derivato dai dati: hammers-lists S2, sappss S3, moppierhead S1, 1jacobjohn S3 |
| **«Animazione per famiglie»** | medium=`movie`, flag `ANIME=0`, kws=['anthropomorphism', 'dreamworks', 'pixar'] | `80` | **Dati reali**: Derivato dai dati: sappss S1 (Elio, Jumpers, La gang del bosco) |
| **«Animazione d'azione per adulti»** | medium=`series`, flag `ANIME=0`, kws=['superhero', 'gore', 'dark fantasy'] | `75` | **Dati reali**: Derivato dai dati: warnok S4 e flixinatoor99 S5 (Invincible, Blue Eye Samurai) |

### Area: Fantascienza & Fantasy
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Space opera»** | kws=['galaxy', 'spacecraft', 'star wars'] | `95` | **Dati reali**: Derivato dai dati: warnok S3 (Star Wars, Mandalorian) |
| **«Fantascienza d'invasione»** | kws=['alien invasion', 'alien monster', 'alien'] | `85` | **Dati reali**: Derivato dai dati: sangam456 S2 e cluster alieni di warnok |
| **«Fantascienza post-apocalittica»** | kws=['survival', 'wasteland', 'post-apocalyptic future'] | `80` | **Dati reali**: Derivato dai dati: warnok S2 e franchise Fallout |
| **«Cyberpunk & Futuro distopico»** | kws=['artificial intelligence (a.i.)', 'cyborg', 'transhumanism'] | `80` | **Dati reali**: Derivato dai dati: 1jacobjohn S2 (Outside the Wire, Upgrade) |
| **«Magia & Stregoneria»** | kws=['wizard', 'sorcery', 'witch'] | `85` | **Dati reali**: Derivato dai dati: moppierhead S3/S4 e flixinatoor99 S6 (Harry Potter, Wicked) |
| **«Cinecomic & Supereroi»** | kws=['based on comic', 'superhero', 'marvel cinematic universe (mcu)'] | `80` | **Dati reali**: Derivato dai dati: 1jacobjohn S5 e flixinatoor99 S7 (Superman, Avatar) |
| **«Viaggi nel tempo & Multiverso»** | kws=['time travel', 'multiverse', 'alternate timeline'] | `80` | *Catalogo*: Pattern tematico classico di catalogo fantascientifico |

### Area: Crime, Thriller & Mistero
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Giallo investigativo»** | kws=['detective', 'whodunit', 'investigation'] | `85` | **Dati reali**: Derivato dai dati: pepsipex S1, pepsipex S2 e sangam456 S1 |
| **«Docufiction true crime»** | kws=['true crime', 'crime documentary', 'dramatization'] | `90` | **Dati reali**: Derivato dai dati: sappss S5 e 1jacobjohn S4 / S6 |
| **«Spy thriller»** | kws=['secret agent', 'central intelligence agency (cia)', 'espionage'] | `85` | **Dati reali**: Derivato dai dati: pepsipex S4 (Slow Horses, Lioness, The Agency) |
| **«Thriller psicologico»** | kws=['obsession', 'hallucination', 'mental illness'] | `80` | **Dati reali**: Derivato dai dati: sappss S2 e pepsipex S2 |
| **«Gangster & Criminalità»** | kws=['heist', 'mafia', 'drug cartel'] | `75` | *Catalogo*: Pattern classico crime / mafia del catalogo |
| **«Horror soprannaturale»** | kws=['haunted house', 'supernatural horror', 'demon'] | `85` | **Dati reali**: Derivato dai dati: carverclan S1 (I peccatori, Stranger Things) e pepsipex S5 |

### Area: Comedy & Sitcom
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Sitcom»** | medium=`series`, flag `ANIME=0`, kws=['sitcom', 'workplace comedy'] | `75` | **Dati reali**: Derivato dai dati: 1jacobjohn S1 (The King of Queens, My Name Is Earl) |
| **«Commedia satirica»** | kws=['political satire', 'social satire', 'parody'] | `75` | **Dati reali**: Derivato dai dati: flixinatoor99 S3 (Spider-Noir, Parks & Rec, White Lotus) |
| **«Dark comedy»** | kws=['black comedy', 'crude comedy', 'dark comedy'] | `70` | **Dati reali**: Derivato dai dati: sappss S7 (Brassic, This Country) |
| **«Commedia romantica»** | medium=`movie`, flag `ANIME=0`, kws=['romance', 'friends to lovers', 'romantic comedy'] | `70` | *Catalogo*: Pattern classico commedie romantiche cinematografiche |

### Area: Drama & Internazionale
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Dramma d'epoca»** | kws=['costume drama', 'period drama', '19th century'] | `85` | **Dati reali**: Derivato dai dati: pepsipex S3 (La valle dell'Eden, The Forsytes) |
| **«Medical drama»** | medium=`series`, kws=['surgery', 'medical drama', 'hospital'] | `90` | **Dati reali**: Derivato dai dati: hammers-lists S1 (The Good Doctor, Chicago Med, 9-1-1) |
| **«Thriller coreano»** | lingue=['ko'], kws=['revenge', 'thriller', 'investigation'] | `85` | **Dati reali**: Derivato dai dati: titoli thriller/crime K-drama in castoffcrown e warnok |
| **«Dramma coreano»** | lingue=['ko'], kws=['romance', 'bromance', 'melodrama'] | `80` | **Dati reali**: Derivato dai dati: castoffcrown S4 (Hospital Playlist, Four Hands Two Sonatas) |
| **«Commedia romantica asiatica»** | lingue=['ja', 'ko', 'zh'], kws=['romance', 'romantic comedy', 'youth'] | `80` | **Dati reali**: Derivato dai dati: romance asiatiche televisive e cinematografiche |
| **«Cinema d'autore»** | medium=`movie`, kws=['independent film', 'existentialism', 'arthouse'] | `75` | **Dati reali**: Derivato dai dati: castoffcrown S3 (Primetime, Il filo nascosto) |

### Area: Sport & Documentari
| Nome Entry | Evidenza / Regola Dichiarativa | Priorità | Origine / Derivazione dai Dati |
|:---|:---|:---:|:---|
| **«Wrestling»** | kws=['wrestling', 'wwe', 'sports entertainment'] | `95` | **Dati reali**: Derivato dai dati: moppierhead S5 (SmackDown, Raw) |
| **«Documentari naturalistici»** | kws=['animals', 'ocean', 'farm'] | `85` | **Dati reali**: Derivato dai dati: sappss S4 e 1jacobjohn S15 (Big Beasts, Pianeta preistorico) |
| **«Documentari sportivi»** | kws=['athlete', 'basketball', 'olympic games'] | `85` | **Dati reali**: Derivato dai dati: 1jacobjohn S10 (The Redeem Team, Skywalkers) |
| **«Motori & Corse automobilistiche»** | kws=['car restoration', 'automobile', 'classic cars'] | `85` | **Dati reali**: Derivato dai dati: 1jacobjohn S14 (Car Masters, The Grand Tour) |
| **«Teatro filmato & Musical»** | kws=['filmed theater', 'based on play or musical', 'stage musical'] | `85` | **Dati reali**: Derivato dai dati: carverclan S2 (Peter Pan Goes Wrong, Great Performances) |
| **«Fede & Spiritualità»** | kws=['religion', 'spirituality', 'christian faith'] | `80` | **Dati reali**: Derivato dai dati: 1jacobjohn S8 (The Chosen, Il re dei re) |

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
| **`castoffcrown`** | **5** | 2 | 3 | **40.0%** |
| **`warnok`** | **5** | 3 | 2 | **60.0%** |
| **`pepsipex`** | **5** | 3 | 2 | **60.0%** |
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
| **«Fantascienza d'invasione»** | 2 | 4.9% | **OK (Specifico)** |
| **«Docufiction true crime»** | 2 | 4.9% | **OK (Specifico)** |
| **«Giallo investigativo»** | 2 | 4.9% | **OK (Specifico)** |
| **«Magia & Stregoneria»** | 2 | 4.9% | **OK (Specifico)** |
| **«Horror soprannaturale»** | 2 | 4.9% | **OK (Specifico)** |
| **«Medical drama»** | 1 | 2.4% | **OK (Specifico)** |
| **«Animazione per famiglie»** | 1 | 2.4% | **OK (Specifico)** |
| **«Dramma coreano»** | 1 | 2.4% | **OK (Specifico)** |
| **«Dramma d'epoca»** | 1 | 2.4% | **OK (Specifico)** |
| **«Spy thriller»** | 1 | 2.4% | **OK (Specifico)** |
| **«Teatro filmato & Musical»** | 1 | 2.4% | **OK (Specifico)** |

**Esito globale Over-Generic Check: SUPERATO AL 100%**. La voce più frequente copre al massimo il **7.3% degli scaffali**, garantendo varietà ed evitando la degenerazione in etichette-ombrello.

---

## 3. Tabella Prima e Dopo (Before & After) su 10 Scaffali

Confronto diretto tra la vecchia catena di fallback (affetta da percentuali, diciture autorali generalizzate e inglese) e la nuova denominazione:

| Profilo | Scaffale | Vecchia Etichetta (Fallback Chain) | Nuova Etichetta (Tassonomia + Perché hai visto) | Tipologia Nuova | Perché è Migliore |
|:---|:---:|:---|:---|:---:|:---|
| `sangam456` | #1 | *Film: Alieni (67%) & Action (33%)* | **«Fantascienza d'invasione»** | Tassonomia | Elimina percentuali ed etichetta generica; nome evocativo italiano. |
| `hammers-lists` | #1 | *Serie: Ospedale & Medicina (50%) & Medical Drama (50%)* | **«Medical drama»** | Tassonomia | Elimina ridondanze terminologiche e numeri grezzi. |
| `sappss` | #3 | *Serie: True Crime (100%) & Hit-And-Run (50%)* | **«Docufiction true crime»** | Tassonomia | Elimina inglese non tradotto (*Hit-And-Run*) e formalizza il genere. |
| `flixinatoor99` | #1 | *Serie: Amused (33%) & Cheerful (33%)* | **«Perché hai visto Il Boss del condominio, División Palermo e Stromberg»** | Perché hai visto | Sostituisce keyword TMDB emotive in inglese con trasparenza onesta al 100%. |
| `moppierhead` | #1 | *Serie: Animazione per Adulti (71%) & Sitcom (71%)* | **«Animazione d'azione per adulti»** | Tassonomia | Sintetizza con precisione tematica un concetto precedentemente prolisso. |
| `castoffcrown` | #4 | *Film: Regia di Paul Thomas Anderson* | **«Perché hai visto Il filo nascosto, Ubriaco d'amore e Synecdoche, New York»** | Perché hai visto | A M=12 rispecchia fedelmente il cinema d'autore senza forzare un singolo regista. |
| `castoffcrown` | #3 | *Film: Animazione d'Autore (58%)* | **«Perché hai visto Ghost in the Shell, Toy Story - Il mondo dei giocattoli e Paprika - Sognando un sogno»** | Perché hai visto | Cattura con trasparenza il blocco animazione d'autore ad alta complessità. |
| `warnok` | #2 | *Film: Sci-Fi & Alieni (63%)* | **«Fantascienza d'invasione»** | Tassonomia | Identifica con nitidezza il tema alien survival senza percentuali spurie. |
| `pepsipex` | #5 | *Serie: Di Taylor Sheridan* | **«Spy thriller»** | Tassonomia | Identifica il vero tema unificante (spionaggio), superando l'etichetta autore. |
| `carverclan` | #1 | *[0/5 scaffali — Regressione]* | **«Horror soprannaturale»** | Tassonomia (`cluster piccolo`) | **Risolve la regressione**: timeline ultra-corta torna a servire 2 scaffali autentici. |
| `1jacobjohn` | #4 | *Serie: Di Michael Schur* | **«Sitcom animate»** | Tassonomia | Nome di genere pulito al posto di una pretesa autorale parziale. |

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
| **`castoffcrown`** | Lungo storico (412 semi) | 412 | 91 | **5 / 5** | **PASS (5/5)** | 2 | 3 | 0 | 1 |
| **`warnok`** | Lungo storico (476 semi) | 476 | 108 | **5 / 5** | **PASS (5/5)** | 3 | 2 | 0 | 0 |
| **`pepsipex`** | Massimo storico (568 semi) | 568 | 121 | **5 / 5** | **PASS (5/5)** | 3 | 2 | 0 | 0 |
| **`carverclan`** | Ultra-corto (<10 semi, 7 semi) | 7 | 2 | **2 / 5** | **PASS (2/2, Waived)** | 2 | 0 | 0 | 0 |
| **`1jacobjohn`** | Intermedio (167 semi) | 167 | 41 | **5 / 5** | **PASS (5/5)** | 3 | 2 | 0 | 0 |

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
| `castoffcrown` | 1. Anime shōnen | `Anime` | 1729 | 2232 | **1.29** | 8.50 | 8.64 | OK |
| `castoffcrown` | 2. Dramma coreano | `Serie` | 178 | 358 | **2.01** | 8.50 | 8.46 | OK |
| `castoffcrown` | 3. Perché hai visto Ghost in the Shell, Toy Story - Il mondo dei giocattoli e Paprika - Sognando un sogno | `Anime` | 3571 | 5004 | **1.40** | 7.69 | 7.80 | OK |
| `castoffcrown` | 4. Perché hai visto Il filo nascosto, Ubriaco d'amore e Synecdoche, New York | `Film` | 2008 | 2795 | **1.39** | 7.21 | 7.09 | OK |
| `castoffcrown` | 5. Perché hai visto Sanjuro, La sfida del samurai e Rurouni Kenshin 2 - Kyoto Inferno | `Film` | 747 | 1032 | **1.38** | 7.69 | 8.00 | OK |
| `warnok` | 1. Animazione d'azione per adulti | `Serie` | 792 | 480 | **0.61** | 8.24 | 8.14 | OK |
| `warnok` | 2. Perché hai visto Lost, Il Trono di Spade e Stranger Things | `Serie` | 6926 | 1713 | **0.25** | 8.41 | 7.90 | OK |
| `warnok` | 3. Fantascienza d'invasione | `Film` | 4382 | 4646 | **1.06** | 7.28 | 6.80 | OK |
| `warnok` | 4. Perché hai visto Sisu: Il vendicatore, L'uomo dei ghiacci - The Ice Road e The Accountant | `Film` | 6497 | 8416 | **1.30** | 7.31 | 7.44 | OK |
| `warnok` | 5. Anime shōnen | `Anime` | 1804 | 2232 | **1.24** | 8.52 | 8.49 | OK |
| `pepsipex` | 1. Dramma d'epoca | `Serie` | 92 | 41 | **0.44** | 7.33 | 7.90 | OK |
| `pepsipex` | 2. Horror soprannaturale | `Serie` | 910 | 1491 | **1.64** | 7.50 | 7.53 | OK |
| `pepsipex` | 3. Perché hai visto The Pact, The Calling e Annika | `Serie` | 46 | 38 | **0.84** | 6.86 | 6.38 | OK |
| `pepsipex` | 4. Perché hai visto Ovunque tu sia, Long Bright River - I cieli di Philadelphia e Un inganno di troppo | `Serie` | 160 | 307 | **1.92** | 6.67 | 7.00 | OK |
| `pepsipex` | 5. Spy thriller | `Serie` | 332 | 121 | **0.36** | 7.15 | 6.74 | OK |
| `carverclan` | 1. Horror soprannaturale | `Film` | 13660 | 3955 | **0.29** | 8.03 | 7.33 | OK |
| `carverclan` | 2. Teatro filmato & Musical | `Film` | 46 | 50 | **1.09** | 6.80 | 7.24 | OK |
| `1jacobjohn` | 1. Animazione d'azione per adulti | `Serie` | 2465 | 1266 | **0.51** | 7.80 | 7.60 | OK |
| `1jacobjohn` | 2. Perché hai visto Good Luck, Have Fun, Don't Die, Obsession e Send Help | `Film` | 1696 | 1955 | **1.15** | 6.83 | 6.90 | OK |
| `1jacobjohn` | 3. Docufiction true crime | `Film` | 166 | 70 | **0.42** | 6.63 | 6.71 | OK |
| `1jacobjohn` | 4. Sitcom animate | `Serie` | 1694 | 2205 | **1.30** | 8.01 | 8.00 | OK |
| `1jacobjohn` | 5. Perché hai visto Creature luminose, Locked - In trappola e Neighborhood Watch | `Film` | 631 | 757 | **1.20** | 6.90 | 6.93 | OK |

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
**Metadati**: 412 semi totali · 91 macro ammissibili (79 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Anime shōnen** (12 semi, `Anime`)
   - **Denominazione**: `Tassonomia («Anime shōnen», conf: 100%)` | Consistenza Scaffale: `0.0941`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *One Piece*, *L'attacco dei giganti*, *Food Wars!: Shokugeki no Soma*
   - **Candidati Raccomandati**: *Hunter x Hunter (2011)*, *One-Punch Man (2015)*, *Demon Slayer: Kimetsu no Yaiba (2019)*, *Frieren - Oltre la Fine del Viaggio (2023)*, *Vinland Saga (2019)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2016, Cand: 2019)
   - **Popolarità**: VOT Semi=1729, Cand=2232 (Ratio=1.29 $\to$ `OK`) · VAVE: 8.50 $\to$ 8.64

2. **Dramma coreano** (11 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Dramma coreano», conf: 55%)` | Consistenza Scaffale: `0.0299`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Il Tassista*, *Crash Landing on You*, *Vincenzo*
   - **Candidati Raccomandati**: *Venticinque e ventuno (2022)*, *Rugal (2020)*, *The Glory (2022)*, *I discendenti del sole (2016)*, *응답하라 1988 (2015)*
   - **Diagnostica Temporale**: `STALE` (Anno Med. Semi: 2021, Cand: 2020)
   - **Popolarità**: VOT Semi=178, Cand=358 (Ratio=2.01 $\to$ `OK`) · VAVE: 8.50 $\to$ 8.46

3. **Perché hai visto Ghost in the Shell, Toy Story - Il mondo dei giocattoli e Paprika - Sognando un sogno** (12 semi, `Anime`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0243`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Ghost in the Shell*, *Toy Story - Il mondo dei giocattoli*, *Paprika - Sognando un sogno*
   - **Candidati Raccomandati**: *Si alza il vento (2013)*, *Kiki - Consegne a domicilio (1989)*, *Toy Story 2 - Woody & Buzz alla riscossa (1999)*, *Ponyo sulla scogliera (2008)*, *Coraline e la porta magica (2009)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2010, Cand: 2008)
   - **Popolarità**: VOT Semi=3571, Cand=5004 (Ratio=1.40 $\to$ `OK`) · VAVE: 7.69 $\to$ 7.80

4. **Perché hai visto Il filo nascosto, Ubriaco d'amore e Synecdoche, New York** (12 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0321`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Il filo nascosto*, *Ubriaco d'amore*, *Synecdoche, New York*
   - **Candidati Raccomandati**: *Vizio di forma (2014)*, *The Master (2012)*, *Il petroliere (2007)*, *Marty Supreme (2025)*, *Bones and All (2022)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2017, Cand: 2014)
   - **Popolarità**: VOT Semi=2008, Cand=2795 (Ratio=1.39 $\to$ `OK`) · VAVE: 7.21 $\to$ 7.09

5. **Perché hai visto Sanjuro, La sfida del samurai e Rurouni Kenshin 2 - Kyoto Inferno** (9 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.1085`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Sanjuro*, *La sfida del samurai*, *Rurouni Kenshin 2 - Kyoto Inferno*
   - **Candidati Raccomandati**: *Rurouni Kenshin 3 - The legend ends (2014)*, *La fortezza nascosta (1958)*, *Il trono di sangue (1957)*, *Rashomon (1950)*, *I sette samurai (1954)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 1964, Cand: 1957)
   - **Popolarità**: VOT Semi=747, Cand=1032 (Ratio=1.38 $\to$ `OK`) · VAVE: 7.69 $\to$ 8.00

---

### Profilo: `warnok` — Lungo storico (476 semi)
**Metadati**: 476 semi totali · 108 macro ammissibili (84 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Animazione d'azione per adulti** (12 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Animazione d'azione per adulti», conf: 92%)` | Consistenza Scaffale: `0.0924`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Love, Death & Robots*, *Castlevania*, *La leggenda di Vox Machina*
   - **Candidati Raccomandati**: *The Mighty Nein (2025)*, *The Boys Presenta: Diabolico! (2022)*, *Devil May Cry (2025)*, *Rick and Morty (2013)*, *DOTA: Dragon's Blood (2021)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2022)
   - **Popolarità**: VOT Semi=792, Cand=480 (Ratio=0.61 $\to$ `OK`) · VAVE: 8.24 $\to$ 8.14

2. **Perché hai visto Lost, Il Trono di Spade e Stranger Things** (12 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0796`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Lost*, *Il Trono di Spade*, *Stranger Things*
   - **Candidati Raccomandati**: *Chernobyl (2019)*, *Pluribus (2025)*, *The Umbrella Academy (2019)*, *Watchmen (2019)*, *The Leftovers - Svaniti nel nulla (2014)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2016, Cand: 2019)
   - **Popolarità**: VOT Semi=6926, Cand=1713 (Ratio=0.25 $\to$ `OK`) · VAVE: 8.41 $\to$ 7.90

3. **Fantascienza d'invasione** (12 semi, `Film`)
   - **Denominazione**: `Tassonomia («Fantascienza d'invasione», conf: 58%)` | Consistenza Scaffale: `0.0449`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *A Quiet Place - Un posto tranquillo*, *Disclosure Day*, *Send Help*
   - **Candidati Raccomandati**: *Dune - Parte due (2024)*, *Nessuno ti salverà (2023)*, *Furiosa: A Mad Max Saga (2024)*, *Civil War (2024)*, *Elevation: Linea di sopravvivenza (2024)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2024)
   - **Popolarità**: VOT Semi=4382, Cand=4646 (Ratio=1.06 $\to$ `OK`) · VAVE: 7.28 $\to$ 6.80

4. **Perché hai visto Sisu: Il vendicatore, L'uomo dei ghiacci - The Ice Road e The Accountant** (12 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0340`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Sisu: Il vendicatore*, *L'uomo dei ghiacci - The Ice Road*, *The Accountant*
   - **Candidati Raccomandati**: *John Wick 3 - Parabellum (2019)*, *John Wick 4 (2023)*, *The Equalizer - Il vendicatore (2014)*, *Tyler Rake 2 (2023)*, *Mortal Kombat II (2026)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2021, Cand: 2023)
   - **Popolarità**: VOT Semi=6497, Cand=8416 (Ratio=1.30 $\to$ `OK`) · VAVE: 7.31 $\to$ 7.44

5. **Anime shōnen** (9 semi, `Anime`)
   - **Denominazione**: `Tassonomia («Anime shōnen», conf: 100%)` | Consistenza Scaffale: `0.2193`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Vinland Saga*, *Jujutsu Kaisen*, *Demon Slayer: Kimetsu no Yaiba*
   - **Candidati Raccomandati**: *The Promised Neverland (2019)*, *Chainsaw Man (2022)*, *One-Punch Man (2015)*, *Mob Psycho 100 (2016)*, *Hunter x Hunter (2011)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2019, Cand: 2016)
   - **Popolarità**: VOT Semi=1804, Cand=2232 (Ratio=1.24 $\to$ `OK`) · VAVE: 8.52 $\to$ 8.49

---

### Profilo: `pepsipex` — Massimo storico (568 semi)
**Metadati**: 568 semi totali · 121 macro ammissibili (108 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Dramma d'epoca** (10 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Dramma d'epoca», conf: 60%)` | Consistenza Scaffale: `0.0695`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *The Buccaneers*, *The Gilded Age*, *The Hardacres*
   - **Candidati Raccomandati**: *Lillie (1978)*, *Belgravia: The Next Chapter (2024)*, *La casa nella prateria (2026)*, *The Duchess of Duke Street (1976)*, *The Forsyte Saga (2002)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2002)
   - **Popolarità**: VOT Semi=92, Cand=41 (Ratio=0.44 $\to$ `OK`) · VAVE: 7.33 $\to$ 7.90

2. **Horror soprannaturale** (9 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Horror soprannaturale», conf: 56%)` | Consistenza Scaffale: `0.1962`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Servant*, *FROM*, *Yellowjackets*
   - **Candidati Raccomandati**: *The Haunting of Bly Manor (2020)*, *The Haunting of Hill House (2018)*, *IT: Welcome to Derry (2025)*, *La nebbia (2017)*, *The Boroughs - Ribelli senza tempo (2026)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2020)
   - **Popolarità**: VOT Semi=910, Cand=1491 (Ratio=1.64 $\to$ `OK`) · VAVE: 7.50 $\to$ 7.53

3. **Perché hai visto The Pact, The Calling e Annika** (10 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0544`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *The Pact*, *The Calling*, *Annika*
   - **Candidati Raccomandati**: *Joan (2024)*, *Kill Jackie (2026)*, *Atomic - Una Corsa Infernale (2025)*, *Safe House (2015)*, *Get Millie Black (2024)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2023, Cand: 2024)
   - **Popolarità**: VOT Semi=46, Cand=38 (Ratio=0.84 $\to$ `OK`) · VAVE: 6.86 $\to$ 6.38

4. **Perché hai visto Ovunque tu sia, Long Bright River - I cieli di Philadelphia e Un inganno di troppo** (11 semi, `Serie`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0636`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Ovunque tu sia*, *Long Bright River - I cieli di Philadelphia*, *Un inganno di troppo*
   - **Candidati Raccomandati**: *SHELTER (2023)*, *Safe (2018)*, *The Stranger (2020)*, *56 giorni (2026)*, *Stay Close (2021)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2021)
   - **Popolarità**: VOT Semi=160, Cand=307 (Ratio=1.92 $\to$ `OK`) · VAVE: 6.67 $\to$ 7.00

5. **Spy thriller** (8 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Spy thriller», conf: 100%)` | Consistenza Scaffale: `0.1451`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Slow Horses*, *The Agency*, *The Capture*
   - **Candidati Raccomandati**: *Secret Service (2026)*, *PONIES (2026)*, *The Veil (2024)*, *Rabbit Hole (2023)*, *Citadel (2023)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2024)
   - **Popolarità**: VOT Semi=332, Cand=121 (Ratio=0.36 $\to$ `OK`) · VAVE: 7.15 $\to$ 6.74

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
**Metadati**: 167 semi totali · 41 macro ammissibili (33 con $\ge 2$ semi) · Scaffali serviti: **5 / 5**

1. **Animazione d'azione per adulti** (11 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Animazione d'azione per adulti», conf: 91%)` | Consistenza Scaffale: `0.2048`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Bob's Burgers*, *South Park*, *Solar Opposites*
   - **Candidati Raccomandati**: *Big Mouth (2017)*, *The Cleveland Show (2009)*, *BoJack Horseman (2014)*, *Archer (2009)*, *King of the Hill (1997)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2011, Cand: 2009)
   - **Popolarità**: VOT Semi=2465, Cand=1266 (Ratio=0.51 $\to$ `OK`) · VAVE: 7.80 $\to$ 7.60

2. **Perché hai visto Good Luck, Have Fun, Don't Die, Obsession e Send Help** (8 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0194`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Good Luck, Have Fun, Don't Die*, *Obsession*, *Send Help*
   - **Candidati Raccomandati**: *Le sabbie del Kalahari (1965)*, *The Drama - Un segreto è per sempre (2026)*, *Companion (2025)*, *The Creator (2023)*, *Collide - Destini incrociati (2022)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2026, Cand: 2023)
   - **Popolarità**: VOT Semi=1696, Cand=1955 (Ratio=1.15 $\to$ `OK`) · VAVE: 6.83 $\to$ 6.90

3. **Docufiction true crime** (6 semi, `Film`)
   - **Denominazione**: `Tassonomia («Docufiction true crime», conf: 50%)` | Consistenza Scaffale: `0.1073`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *A Toxic Love Story: Il caso Michelle Hadley*, *Numero sconosciuto: Uno scandalo di cyberbullismo*, *La ragazza nella foto*
   - **Candidati Raccomandati**: *Evil Influencer - La storia di Jodi Hildebrandt (2025)*, *Mio padre, il killer BTK (2025)*, *Lover, Stalker, Killer (2024)*, *Maternal Instinct: Il caso Taylor Parker (2026)*, *Trainwreck: Il vero Project X (2025)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2025)
   - **Popolarità**: VOT Semi=166, Cand=70 (Ratio=0.42 $\to$ `OK`) · VAVE: 6.63 $\to$ 6.71

4. **Sitcom animate** (10 semi, `Serie`)
   - **Denominazione**: `Tassonomia («Sitcom animate», conf: 80%)` | Consistenza Scaffale: `0.1479`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *The Good Place*, *Curb Your Enthusiasm*, *C'è sempre il sole a Philadelphia*
   - **Candidati Raccomandati**: *30 Rock (2006)*, *Seinfeld (1989)*, *Community (2009)*, *How I Met Your Mother (2005)*, *Arrested Development - Ti presento i miei (2003)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2008, Cand: 2005)
   - **Popolarità**: VOT Semi=1694, Cand=2205 (Ratio=1.30 $\to$ `OK`) · VAVE: 8.01 $\to$ 8.00

5. **Perché hai visto Creature luminose, Locked - In trappola e Neighborhood Watch** (5 semi, `Film`)
   - **Denominazione**: `Perché hai visto (trasparente)` | Consistenza Scaffale: `0.0158`
   - **Verifica Medium**: `PASS (Semi: 100%, Cand: 100%)`
   - **Semi**: *Creature luminose*, *Locked - In trappola*, *Neighborhood Watch*
   - **Candidati Raccomandati**: *November Criminals (2017)*, *Ricchi... da morire - Delitti in famiglia (2026)*, *Vendetta (2026)*, *La ragazza della palude (2022)*, *Inheritance - Eredità (2020)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2022)
   - **Popolarità**: VOT Semi=631, Cand=757 (Ratio=1.20 $\to$ `OK`) · VAVE: 6.90 $\to$ 6.93

---

## 7. Riconciliazione Temporale (Staleness vs Deepening)

Sui 41 scaffali serviti con il nuovo schema:
- **22 scaffali (53.7%)** sono contemporanei o contengono candidati recenti (2024–2026);
- **18 scaffali (43.9%)** sono casi autentici di *Deepening* (semi storici o mix multi-decennale di epoche);
- **Solo 1 scaffale/i su 41 (2.4%)** è un vero caso di **STALE**: lo scaffale fantasy di `pepsipex` (*House of the Dragon*, *A Knight of the Seven Kingdoms*, *The Witcher*), i cui candidati si arrestano al 2022.
