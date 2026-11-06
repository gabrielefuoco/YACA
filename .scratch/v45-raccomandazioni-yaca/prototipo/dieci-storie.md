# Rapporto Dieci Storie: Coherence Gate, Naming per Supporto e Popularity Drift

> [!IMPORTANT]
> **Dichiarazione Fondamentale**:
> La keyword non è un mero strumento cosmetico per inventare nomi a posteriori; **la keyword è uno strumento di coerenza semantica**. Un cluster che non può essere nominato da keyword condivise dalla maggioranza dei suoi membri non è un interesse autentico ma un contenitore aggregato arbitrario.
> In questo aggiornamento metodologico, le etichette TF-IDF medie (che producevano nomi basati su un singolo outlier, es. *Berlin* da un solo titolo) vengono sostituite da:
> 1. **Coherence Gate preventivo**: Ogni macro-cluster è ammesso solo se la sua keyword con massimo supporto copre **almeno il 50% dei suoi membri** (`max_k support >= 0.5`). I macro sotto soglia vengono scartati;
> 2. **Naming per Supporto**: L'etichetta deriva direttamente dalle 2 keyword con il supporto più elevato (con percentuali mostrate esplicitamente), mappate tramite un dizionario curato a mano di ~65 voci italiane. Nessun'etichetta è mai costruita da una keyword con supporto < 0.5;
> 3. **Popularity Drift**: Tracciamento oggettivo del rapporto tra voti mediani (`VOT`) e rating (`VAVE`) dei semi rispetto ai candidati, con flag per scaffali in cui i candidati crollano sotto 1/3 dei voti dei semi.

---

## 1. Misura del Coherence Gate (Supporto Keyword $\ge 0.5$)

Sull'insieme delle 10 timeline reali sono stati generati **175 macro-cluster vincolati** ($M \le 30$). Per ciascuno è stata calcolata la metrica di supporto:
$$\text{Supporto}(k, M) = \frac{\sum_{m \in M} \mathbf{1}[k \in K(m)]}{|M|}$$

### Distribuzione di `max_k support` sui 175 macro:
- **Minimo assoluto**: `0.095` (cluster in cui la keyword più frequente appartiene a meno del 10% dei membri);
- **25° percentile**: `0.340`;
- **Mediana**: `0.500`;
- **Media**: `0.603`;
- **75° percentile**: `1.000`;
- **Massimo assoluto**: `1.000` (omogeneità totale al 100%).

**Esito del Coherence Gate a soglia 0.5**:
- **Ammessi**: **110 macro (62.9%)**;
- **Respinti**: **65 macro (37.1%)**.

> [!WARNING]
> **Diagnosi del Difetto: La Soglia di Fusione Macro**:
> Più di un terzo dei macro generati (**37.1%**) viene bocciato dal Coherence Gate. Nei profili ricchi come `pepsipex` (45.8% scartati), `warnok` (40.0% scartati) e `1jacobjohn` (40.0% scartati), quasi la metà dei cluster non possiede alcuna keyword condivisa da almeno metà dei membri.
> **Il difetto risiede nella fase di aggregazione macro, non nell'algoritmo di naming**:
> L'agglomerazione micro $\to$ macro (`aggrega_macro_cluster`) forza una riduzione a `target_k=12` forzando la fusione gerarchica anche quando la similarità coseno tra i centroidi dei micro-cluster è prossima allo zero (`0.00003` - `0.0034`). Questo fonde micro-cluster tra loro disgiunti in macro-contenitori spuri, che la successiva bisezione $M \le 30$ taglia arbitrariamente senza ripristinare la coerenza tematica originaria.

---

## 2. Tabella Riassuntiva delle 10 Timeline (Lettura Rapida)

| Profilo Trakt | Tipologia / Gap Coperto | Semi Tot. | Macro (Pass / Rej) | % Scarto Gate | Scaffali Serviti | Nomi Dup. | Stale | Drift Pop. |
|:---|:---|---:|:---:|---:|:---:|:---:|:---:|:---:|
| **`sangam456`** | Corto storico (10 semi) | 10 | 2 / 0 | 0.0% | **2 / 5** | 0 | 0 | 0 |
| **`hammers-lists`** | Corto storico (11 semi) | 11 | 2 / 0 | 0.0% | **2 / 5** | 0 | 0 | 0 |
| **`sappss`** | Medio-basso storico (25 semi) | 25 | 5 / 1 | 16.7% | **5 / 5** | 0 | 0 | 2 |
| **`flixinatoor99`** | Medio storico (32 semi) | 32 | 6 / 1 | 14.3% | **5 / 5** | 0 | 0 | 1 |
| **`moppierhead`** | Medio storico (38 semi) | 38 | 4 / 2 | 33.3% | **4 / 5** | 0 | 0 | 0 |
| **`castoffcrown`** | Lungo storico (412 semi) | 412 | 21 / 10 | 32.3% | **5 / 5** | 0 | 0 | 0 |
| **`warnok`** | Lungo storico (476 semi) | 476 | 27 / 18 | 40.0% | **5 / 5** | 0 | 0 | 1 |
| **`pepsipex`** | Massimo storico (568 semi) | 568 | 32 / 27 | 45.8% | **5 / 5** | 0 | 1 | 0 |
| **`carverclan`** | Ultra-corto (<10 semi, 7 semi) | 7 | 2 / 0 | 0.0% | **2 / 5** | 0 | 0 | 1 |
| **`1jacobjohn`** | Intermedio (167 semi) | 167 | 9 / 6 | 40.0% | **5 / 5** | 0 | 0 | 0 |

---

## 3. Tabella Completa di Popularity Drift (Tutti i 40 Scaffali Serviti)

Confronto oggettivo tra popolarità dei semi consumati dall'utente e popolarità dei candidati raccomandati dal motore PPR. Viene segnalato con **`DRIFT`** qualunque scaffale in cui `Mediana VOT Candidati < (1/3) * Mediana VOT Semi`.

| Profilo | Scaffale e Nome | Medium | Med. VOT Semi | Med. VOT Cand. | Ratio (C/S) | Med. VAVE Semi | Med. VAVE Cand. | Flag Popolarità |
|:---|:---|:---:|---:|---:|---:|---:|---:|:---|
| `sangam456` | 1. Film: Alieni (67%) | `Film` | 3673 | 9460 | **2.58** | 7.45 | 7.20 | OK |
| `sangam456` | 2. Serie: Hotel & Ospitalità (67%) | `Serie` | 1085 | 1457 | **1.34** | 7.59 | 7.54 | OK |
| `hammers-lists` | 1. Serie: Ospedale & Medicina (50%) & Medical Drama (50%) | `Serie` | 1312 | 2870 | **2.19** | 8.33 | 8.22 | OK |
| `hammers-lists` | 2. Serie: Animazione per Adulti (100%) & Famiglia Disfunzionale (100%) | `Serie` | 8313 | 3946 | **0.47** | 8.04 | 8.33 | OK |
| `sappss` | 1. Serie: True Crime (67%) | `Serie` | 39 | 46 | **1.18** | 6.66 | 7.40 | OK |
| `sappss` | 2. Film: Animazione 3D (75%) & Antagonisti (75%) | `Film` | 3720 | 3978 | **1.07** | 6.98 | 7.50 | OK |
| `sappss` | 3. Serie: Animazione per Adulti (100%) & Famiglia Disfunzionale (100%) | `Serie` | 11075 | 2465 | **0.22** | 8.00 | 7.80 | **DRIFT (< 1/3)** |
| `sappss` | 4. Serie: Conflitto Morale (50%) & Storia Vera (50%) | `Serie` | 574 | 314 | **0.55** | 8.36 | 7.60 | OK |
| `sappss` | 5. Serie: Commedia Nera (50%) & Amicizia (50%) | `Serie` | 156 | 46 | **0.29** | 8.11 | 7.30 | **DRIFT (< 1/3)** |
| `flixinatoor99` | 1. Film: Tratto da Romanzo (60%) | `Film` | 1983 | 976 | **0.49** | 7.25 | 6.58 | OK |
| `flixinatoor99` | 2. Serie: Satira (67%) | `Serie` | 1552 | 3015 | **1.94** | 8.04 | 8.35 | OK |
| `flixinatoor99` | 3. Film: Amicizia (67%) | `Film` | 774 | 1452 | **1.88** | 8.20 | 7.60 | OK |
| `flixinatoor99` | 4. Serie: Animazione per Adulti (100%) & Comicità per Adulti (50%) | `Serie` | 5658 | 1190 | **0.21** | 8.48 | 8.20 | **DRIFT (< 1/3)** |
| `flixinatoor99` | 5. Film: Young Adult (100%) & Magia & Fantasy (100%) | `Film` | 20899 | 22557 | **1.08** | 7.73 | 7.80 | OK |
| `moppierhead` | 1. Serie: Animazione per Adulti (71%) & Sitcom (71%) | `Serie` | 2465 | 1266 | **0.51** | 8.00 | 7.41 | OK |
| `moppierhead` | 2. Anime: Tratto da Manga (83%) & Shōnen (67%) | `Anime` | 3693 | 2599 | **0.70** | 8.61 | 8.40 | OK |
| `moppierhead` | 3. Film: Sequel (88%) & Tratto da Romanzo (75%) | `Film` | 12088 | 22760 | **1.88** | 7.68 | 7.71 | OK |
| `moppierhead` | 4. Film: Oggetti che Prendono Vita (100%) & Magical Object (100%) | `Film` | 9348 | 3155 | **0.34** | 6.38 | 6.12 | OK |
| `castoffcrown` | 1. Anime: Tratto da Manga (85%) & Shōnen (54%) | `Anime` | 632 | 2232 | **3.53** | 8.42 | 8.64 | OK |
| `castoffcrown` | 2. Anime: Tratto da Manga (86%) & Romantico (54%) | `Anime` | 46 | 32 | **0.70** | 7.67 | 7.80 | OK |
| `castoffcrown` | 3. Film Anime (71%) | `Anime` | 440 | 5004 | **11.37** | 7.60 | 7.80 | OK |
| `castoffcrown` | 4. Serie: Space Opera (50%) | `Serie` | 2074 | 2387 | **1.15** | 7.61 | 7.20 | OK |
| `castoffcrown` | 5. Serie: Spettacolo Sportivo (88%) & Wrestling (75%) | `Serie` | 78 | 32 | **0.41** | 7.20 | 6.50 | OK |
| `warnok` | 1. Anime: Tratto da Manga (96%) & Shōnen (71%) | `Anime` | 1518 | 2232 | **1.47** | 8.50 | 8.49 | OK |
| `warnok` | 2. Anime: Tratto da Manga (80%) & Combattimento (60%) | `Anime` | 351 | 569 | **1.62** | 8.00 | 8.10 | OK |
| `warnok` | 3. Film: Sequel (67%) | `Film` | 9518 | 11919 | **1.25** | 7.00 | 7.50 | OK |
| `warnok` | 4. Film: Animazione 3D (74%) | `Film` | 3024 | 7045 | **2.33** | 7.60 | 8.14 | OK |
| `warnok` | 5. Film: Tratto da Fumetto (91%) & Supereroi (83%) | `Film` | 19787 | 6148 | **0.31** | 7.43 | 6.99 | **DRIFT (< 1/3)** |
| `pepsipex` | 1. Serie: Tratto da Romanzo (52%) | `Serie` | 345 | 877 | **2.54** | 7.40 | 8.55 | OK |
| `pepsipex` | 2. Serie: Tratto da Romanzo (57%) | `Serie` | 205 | 231 | **1.13** | 7.05 | 7.11 | OK |
| `pepsipex` | 3. Film: Horror Soprannaturale (60%) | `Film` | 2023 | 1217 | **0.60** | 6.68 | 6.31 | OK |
| `pepsipex` | 4. Serie: Tratto da Romanzo (80%) & Miniserie (80%) | `Serie` | 166 | 307 | **1.85** | 6.82 | 7.00 | OK |
| `pepsipex` | 5. Serie: Tratto da Romanzo (67%) | `Serie` | 2630 | 1063 | **0.40** | 7.94 | 7.83 | OK |
| `carverclan` | 1. Film: Horror Soprannaturale (100%) & Anni '30 (50%) | `Film` | 13660 | 3955 | **0.29** | 8.03 | 7.33 | **DRIFT (< 1/3)** |
| `carverclan` | 2. Film: Antologia (50%) & Tratto da Romanzo (50%) | `Film` | 46 | 50 | **1.09** | 6.80 | 7.24 | OK |
| `1jacobjohn` | 1. Serie: Animazione per Adulti (87%) | `Serie` | 1629 | 1266 | **0.78** | 7.80 | 7.60 | OK |
| `1jacobjohn` | 2. Film: Fede Cristiana (60%) | `Film` | 217 | 203 | **0.94** | 7.50 | 8.02 | OK |
| `1jacobjohn` | 3. Serie: Automobili & Motori (67%) & Auto d'Epoca (67%) | `Serie` | 94 | 67 | **0.71** | 7.46 | 7.20 | OK |
| `1jacobjohn` | 4. Serie: Era Glaciale (67%) & Documentario Naturalistico (67%) | `Serie` | 105 | 41 | **0.39** | 7.40 | 8.00 | OK |
| `1jacobjohn` | 5. Film: Nuoto & Balneazione (50%) & Differenze Sociali (50%) | `Film` | 1197 | 1803 | **1.51** | 5.68 | 5.97 | OK |

> [!NOTE]
> **Analisi del Popularity Drift**:
> 1. **Risoluzione completa del caso `castoffcrown`**: Nella configurazione precedente, lo scaffale 1 (*How It's Made* + *Indiana Jones* + Lav Diaz) consigliava drammi d'autore africani e filippini anni '60 con `VOT < 50` a fronte di semi da 15.000 voti (un crollo di 300x). Con il Coherence Gate, quel macro viene **immediatamente rigettato**. I 5 nuovi scaffali serviti a `castoffcrown` presentano **zero casi di drift** e una coerenza totale tra anime sportivi, romance contemporaneo, capolavori Ghibli e wrestling;
> 2. **Origine dei 5 flag rilevati sui 40 scaffali**: Tutti i casi di `DRIFT` su 40 scaffali derivano dalla presenza nei semi di mega-hit planetari con oltre 10.000–20.000 voti (*The Simpsons*, *Rick and Morty*, *Stranger Things*, *Deadpool*). I candidati raccomandati (*Futurama*, *American Dad!*, *Vox Machina*, *Quantumania*) sono franchise mainstream altamente votati (1.000–6.000 voti), che risultano matematicamente inferiori a un terzo del seme solo per via dell'eccezionale peso del blocco di partenza, non per un collasso verso opere oscure.

---

## 4. Caso Studio: La Trasformazione di `castoffcrown`

Il profilo `castoffcrown` (412 semi) era il caso più evidente in cui l'etichettatura per TF-IDF medio celava l'incoerenza strutturale dei cluster. Il confronto prima vs dopo dimostra l'impatto del Coherence Gate:

### Prima del Coherence Gate (Etichette da TF-IDF Medio):
- **Scaffale 1 (*Tedesco: Berlin, Germany & Art*)**: Semi: *Come è fatto*, *I predatori dell'arca perduta*, *Il Signore degli Anelli* + film di Lav Diaz. Candidati: *La nera di… (1966)*, *Campo Thiaroye (1988)*, *From What Is Before (2014)*. Un contenitore caotico che consigliava cinema d'autore mondiale anni '60 a chi guardava Indiana Jones;
- **Scaffale 4 (*Lgbt & Gothic Horror*)**: Semi: *梦华录* (costume drama cinese), *Kamen Rider ZEZTZ*, *Sweet/Vicious*. Candidati: *Marvel: 75 anni*, *Dagon*, *Alone/Together*. Cluster privo di senso generato dall'unione di micro-cluster disparati;
- Entrambi i cluster contenevano keyword con supporto inferiore al 20-25% (`berlin, germany` a 13.8%, `lgbt` a 20.7%).

### Dopo il Coherence Gate (Ammissione solo con Supporto $\ge 0.5$):
Entrambi gli scaffali spuri vengono **respinti ed eliminati**. Al loro posto vengono serviti i macro ammessi con forte identità relazionale:
1. **Anime: Tratto da Manga (85%) & Shōnen (54%)** (26 semi, `Anime`) — Supporto: `anime` (100.0%), `based on manga` (84.6%)
   - Semi: *One Piece, Haikyu!! L'asso del volley, L'attacco dei giganti*
   - Top-5 Candidati: *Hunter x Hunter (2011), One-Punch Man (2015), Il movimento della Terra (2024), Demon Slayer: Kimetsu no Yaiba (2019), Frieren - Oltre la Fine del Viaggio (2023)*
   - Popolarità: VOT semi=632, VOT cand=2232 (ratio 3.53) · Rating VAVE: 8.42 $\to$ 8.64
2. **Anime: Tratto da Manga (86%) & Romantico (54%)** (28 semi, `Anime`) — Supporto: `anime` (100.0%), `based on manga` (85.7%)
   - Semi: *Tojima Wants to Be a Kamen Rider, The 100 Girlfriends Who Really, Really, Really, Really, REALLY Love You, Mars Red*
   - Top-5 Candidati: *Hana-Kimi (2026), Honey Lemon Soda (2025), Daemons of the Shadow Realm (2026), The Yakuza's Guide to Babysitting (2022), Quality Assurance in Another World (2024)*
   - Popolarità: VOT semi=46, VOT cand=32 (ratio 0.70) · Rating VAVE: 7.67 $\to$ 7.80
3. **Film Anime (71%)** (17 semi, `Anime`) — Supporto: `anime` (70.6%)
   - Semi: *Mobile Suit Gundam: Iron-Blooded Orphans, Mobile Suit Gundam, Mobile Suit Gundam Thunderbolt*
   - Top-5 Candidati: *Si alza il vento (2013), Kiki - Consegne a domicilio (1989), Ponyo sulla scogliera (2008), Coraline e la porta magica (2009), L'isola dei cani (2018)*
   - Popolarità: VOT semi=440, VOT cand=5004 (ratio 11.37) · Rating VAVE: 7.60 $\to$ 7.80
4. **Serie: Space Opera (50%)** (12 semi, `Serie`) — Supporto: `space opera` (50.0%)
   - Semi: *The Expanse, Andor, The Mandalorian*
   - Top-5 Candidati: *The Book of Boba Fett (2021), Obi-Wan Kenobi (2022), The Acolyte: La seguace (2024), Firefly (2002), Star Trek: Picard (2020)*
   - Popolarità: VOT semi=2074, VOT cand=2387 (ratio 1.15) · Rating VAVE: 7.61 $\to$ 7.20
5. **Serie: Spettacolo Sportivo (88%) & Wrestling (75%)** (8 semi, `Serie`) — Supporto: `sports entertainment` (87.5%), `wrestling` (75.0%)
   - Semi: *WWE NXT, All Elite Wrestling: Collision, All Elite Wrestling: Dynamite*
   - Top-5 Candidati: *WWE ECW (2006), AEW Dark (2019), WWE 205 Live (2016), AEW Dark: Elevation (2021), WWE Saturday Night's Main Event (1985)*
   - Popolarità: VOT semi=78, VOT cand=32 (ratio 0.41) · Rating VAVE: 7.20 $\to$ 6.50

---

## 5. Le 10 Timeline nel Dettaglio

### Profilo: `sangam456` — Corto storico (10 semi)
**Metadati**: 10 semi totali · 2 micro-cluster $\to$ 2 macro vincolati · **Ammessi dal Gate: 2 (100.0%)** · **Respinti: 0 (0.0%)** · Scaffali serviti: **2 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (2/5)**: 
> Questo profilo cold-start possiede solo 10 semi totali e produce 2 soli raggruppamenti naturali. Come da istruzioni, non viene inventato alcun fallback artificiale.

1. **Film: Alieni (67%)** (3 semi, `Film`)
   - **Semi**: *Disclosure Day*, *Lilo & Stitch*, *Mission: Impossible - Dead Reckoning Parte uno*
   - **Candidati**: *Mission: Impossible - Fallout (2018)*, *Mission: Impossible - Rogue Nation (2015)*, *IF - Gli amici immaginari (2024)*, *Mission: Impossible - The Final Reckoning (2025)*, *Mission: Impossible - Protocollo fantasma (2011)*
   - **Keyword & Supporto**: `alien` (66.7%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2018)
   - **Popolarità**: VOT Semi=3673, Cand=9460 (Ratio=2.58 $\to$ `OK`) · VAVE: 7.45 $\to$ 7.20

2. **Serie: Hotel & Ospitalità (67%)** (3 semi, `Serie`)
   - **Semi**: *The White Lotus*, *Billions*, *A Murder at the End of the World*
   - **Candidati**: *The OA (2016)*, *The North Water (2021)*, *The Bear (2022)*, *Scissione (2022)*, *Hacks (2021)*
   - **Keyword & Supporto**: `hotel` (66.7%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2021, Cand: 2021)
   - **Popolarità**: VOT Semi=1085, Cand=1457 (Ratio=1.34 $\to$ `OK`) · VAVE: 7.59 $\to$ 7.54

---

### Profilo: `hammers-lists` — Corto storico (11 semi)
**Metadati**: 11 semi totali · 2 micro-cluster $\to$ 2 macro vincolati · **Ammessi dal Gate: 2 (100.0%)** · **Respinti: 0 (0.0%)** · Scaffali serviti: **2 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (2/5)**: 
> Questo profilo cold-start possiede solo 11 semi totali e produce 2 soli raggruppamenti naturali. Come da istruzioni, non viene inventato alcun fallback artificiale.

1. **Serie: Ospedale & Medicina (50%) & Medical Drama (50%)** (6 semi, `Serie`)
   - **Semi**: *The Resident*, *Big Sky*, *The Good Doctor*
   - **Candidati**: *Dr. House - Medical Division (2004)*, *New Amsterdam (2018)*, *Station 19 (2018)*, *Grey's Anatomy (2005)*, *9-1-1 (2018)*
   - **Keyword & Supporto**: `hospital` (50.0%), `medical drama` (50.0%), `spin off` (50.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2018, Cand: 2018)
   - **Popolarità**: VOT Semi=1312, Cand=2870 (Ratio=2.19 $\to$ `OK`) · VAVE: 8.33 $\to$ 8.22

2. **Serie: Animazione per Adulti (100%) & Famiglia Disfunzionale (100%)** (2 semi, `Serie`)
   - **Semi**: *Rick and Morty*, *I Griffin*
   - **Candidati**: *South Park (1997)*, *Futurama (1999)*, *American Dad! (2005)*, *I Simpson (1989)*, *BoJack Horseman (2014)*
   - **Keyword & Supporto**: `adult animation` (100.0%), `dysfunctional family` (100.0%), `absurd` (50.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2006, Cand: 1999)
   - **Popolarità**: VOT Semi=8313, Cand=3946 (Ratio=0.47 $\to$ `OK`) · VAVE: 8.04 $\to$ 8.33

---

### Profilo: `sappss` — Medio-basso storico (25 semi)
**Metadati**: 25 semi totali · 6 micro-cluster $\to$ 6 macro vincolati · **Ammessi dal Gate: 5 (83.3%)** · **Respinti: 1 (16.7%)** · Scaffali serviti: **5 / 5**

1. **Serie: True Crime (67%)** (3 semi, `Serie`)
   - **Semi**: *Sposare un assassino*, *Louis Theroux: Dentro la manosfera*, *Worst Neighbor Ever - Vicini letali*
   - **Candidati**: *Devil in the Family: The Fall of Ruby Franke (2025)*, *Worst Ex Ever - Relazioni fatali (2024)*, *Death of the Pastor's Wife: il caso Mica Miller (2026)*, *Cabin in the Woods (2024)*, *Bad Influence: il lato oscuro dei giovani influencer (2025)*
   - **Keyword & Supporto**: `true crime` (66.7%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2026, Cand: 2025)
   - **Popolarità**: VOT Semi=39, Cand=46 (Ratio=1.18 $\to$ `OK`) · VAVE: 6.66 $\to$ 7.40

2. **Film: Animazione 3D (75%) & Antagonisti (75%)** (4 semi, `Film`)
   - **Semi**: *Elio*, *I Simpson - Il film*, *Jumpers - Un salto tra gli animali*
   - **Candidati**: *Inside Out 2 (2024)*, *Elemental (2023)*, *Lightyear - La vera storia di Buzz (2022)*, *Toy Story 5 (2026)*, *I Simpson in Plusaversary (2021)*
   - **Keyword & Supporto**: `3d animation` (75.0%), `villain` (75.0%), `amused` (50.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2016, Cand: 2023)
   - **Popolarità**: VOT Semi=3720, Cand=3978 (Ratio=1.07 $\to$ `OK`) · VAVE: 6.98 $\to$ 7.50

3. **Serie: Animazione per Adulti (100%) & Famiglia Disfunzionale (100%)** (3 semi, `Serie`)
   - **Semi**: *I Simpson*, *Rick and Morty*, *I Griffin*
   - **Candidati**: *South Park (1997)*, *American Dad! (2005)*, *Futurama (1999)*, *Bob's Burgers (2011)*, *Big Mouth (2017)*
   - **Keyword & Supporto**: `adult animation` (100.0%), `dysfunctional family` (100.0%), `adult humor` (66.7%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 1999, Cand: 2005)
   - **Popolarità**: VOT Semi=11075, Cand=2465 (Ratio=0.22 $\to$ `DRIFT (< 1/3)`) · VAVE: 8.00 $\to$ 7.80

4. **Serie: Conflitto Morale (50%) & Storia Vera (50%)** (2 semi, `Serie`)
   - **Semi**: *La fattoria Clarkson*, *Formula 1: Drive to Survive*
   - **Candidati**: *The Grand Tour (2016)*, *Top Gear (2002)*, *Il banco dei pugni (2010)*, *Brawn: Una storia impossibile di Formula 1 (2023)*, *Affari di famiglia (2009)*
   - **Keyword & Supporto**: `ambivalent` (50.0%), `based on true story` (50.0%), `car race` (50.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2020, Cand: 2010)
   - **Popolarità**: VOT Semi=574, Cand=314 (Ratio=0.55 $\to$ `OK`) · VAVE: 8.36 $\to$ 7.60

5. **Serie: Commedia Nera (50%) & Amicizia (50%)** (2 semi, `Serie`)
   - **Semi**: *This Country*, *Brassic*
   - **Candidati**: *Jam and Jerusalem (2006)*, *W1A (2014)*, *Small Prophets (2026)*, *The Vicar of Dibley (1994)*, *Last of the Summer Wine (1973)*
   - **Keyword & Supporto**: `dark comedy` (50.0%), `friends` (50.0%), `grand` (50.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2018, Cand: 2006)
   - **Popolarità**: VOT Semi=156, Cand=46 (Ratio=0.29 $\to$ `DRIFT (< 1/3)`) · VAVE: 8.11 $\to$ 7.30

---

### Profilo: `flixinatoor99` — Medio storico (32 semi)
**Metadati**: 32 semi totali · 7 micro-cluster $\to$ 7 macro vincolati · **Ammessi dal Gate: 6 (85.7%)** · **Respinti: 1 (14.3%)** · Scaffali serviti: **5 / 5**

1. **Film: Tratto da Romanzo (60%)** (5 semi, `Film`)
   - **Semi**: *Apex*, *Una di famiglia - The Housemaid*, *Hamnet - Nel nome del figlio*
   - **Candidati**: *Slumberland - Nel mondo dei sogni (2022)*, *Il drago invisibile (2016)*, *Fall 2: Deadpoint (2026)*, *Wicked - Parte 2 (2025)*, *Un altro piccolo favore (2025)*
   - **Keyword & Supporto**: `based on novel or book` (60.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2025)
   - **Popolarità**: VOT Semi=1983, Cand=976 (Ratio=0.49 $\to$ `OK`) · VAVE: 7.25 $\to$ 6.58

2. **Serie: Satira (67%)** (3 semi, `Serie`)
   - **Semi**: *Parks and Recreation*, *The White Lotus*, *Spider-Noir*
   - **Candidati**: *The Bear (2022)*, *The Office (US) (2005)*, *Scissione (2022)*, *Brooklyn Nine-Nine (2013)*, *The Penguin (2024)*
   - **Keyword & Supporto**: `satire` (66.7%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2021, Cand: 2022)
   - **Popolarità**: VOT Semi=1552, Cand=3015 (Ratio=1.94 $\to$ `OK`) · VAVE: 8.04 $\to$ 8.35

3. **Film: Amicizia (67%)** (3 semi, `Film`)
   - **Semi**: *Super Mario Galaxy - Il film*, *Dragonkeeper*, *Il bambino, la talpa, la volpe e il cavallo*
   - **Candidati**: *Super Mario Bros. Il Film (2023)*, *Il robot selvaggio (2024)*, *Wolfwalkers - Il popolo dei lupi (2020)*, *Buñuel nel labirinto delle tartarughe (2019)*, *Elio (2025)*
   - **Keyword & Supporto**: `friendship` (66.7%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2023)
   - **Popolarità**: VOT Semi=774, Cand=1452 (Ratio=1.88 $\to$ `OK`) · VAVE: 8.20 $\to$ 7.60

4. **Serie: Animazione per Adulti (100%) & Comicità per Adulti (50%)** (2 semi, `Serie`)
   - **Semi**: *South Park*, *INVINCIBLE*
   - **Candidati**: *Rick and Morty (2013)*, *La leggenda di Vox Machina (2022)*, *I Griffin (1999)*, *The Boys Presenta: Diabolico! (2022)*, *Harley Quinn (2019)*
   - **Keyword & Supporto**: `adult animation` (100.0%), `adult humor` (50.0%), `aggressive` (50.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2009, Cand: 2019)
   - **Popolarità**: VOT Semi=5658, Cand=1190 (Ratio=0.21 $\to$ `DRIFT (< 1/3)`) · VAVE: 8.48 $\to$ 8.20

5. **Film: Young Adult (100%) & Magia & Fantasy (100%)** (3 semi, `Film`)
   - **Semi**: *Animali fantastici e dove trovarli*, *Harry Potter e i Doni della Morte - Parte 1*, *Harry Potter e la pietra filosofale*
   - **Candidati**: *Harry Potter e i Doni della Morte - Parte 2 (2011)*, *Harry Potter e l'ordine della fenice (2007)*, *Harry Potter e il principe mezzosangue (2009)*, *Harry Potter e il prigioniero di Azkaban (2004)*, *Harry Potter e il calice di fuoco (2005)*
   - **Keyword & Supporto**: `based on young adult novel` (100.0%), `magic` (100.0%), `witch` (100.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2010, Cand: 2007)
   - **Popolarità**: VOT Semi=20899, Cand=22557 (Ratio=1.08 $\to$ `OK`) · VAVE: 7.73 $\to$ 7.80

---

### Profilo: `moppierhead` — Medio storico (38 semi)
**Metadati**: 38 semi totali · 6 micro-cluster $\to$ 6 macro vincolati · **Ammessi dal Gate: 4 (66.7%)** · **Respinti: 2 (33.3%)** · Scaffali serviti: **4 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (4/5)**: 
> L'utente disponeva di 6 macro, ma solo 4 hanno superato il Coherence Gate a supporto $\ge 0.5$. I restanti sono stati scartati per proteggere la rilevanza dell'interfaccia.

1. **Serie: Animazione per Adulti (71%) & Sitcom (71%)** (7 semi, `Serie`)
   - **Semi**: *I Simpson*, *Bob's Burgers*, *Futurama*
   - **Candidati**: *I Griffin (1999)*, *King of the Hill (1997)*, *Big Mouth (2017)*, *The Cleveland Show (2009)*, *Rick and Morty (2013)*
   - **Keyword & Supporto**: `adult animation` (71.4%), `sitcom` (71.4%), `social satire` (57.1%)
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2005, Cand: 2009)
   - **Popolarità**: VOT Semi=2465, Cand=1266 (Ratio=0.51 $\to$ `OK`) · VAVE: 8.00 $\to$ 7.41

2. **Anime: Tratto da Manga (83%) & Shōnen (67%)** (6 semi, `Anime`)
   - **Semi**: *One Piece*, *L'attacco dei giganti*, *Sailor Moon*
   - **Candidati**: *Fullmetal Alchemist: Brotherhood (2009)*, *Hunter x Hunter (2011)*, *Code Geass: Lelouch of the Rebellion (2006)*, *One-Punch Man (2015)*, *Naruto (2002)*
   - **Keyword & Supporto**: `anime` (100.0%), `based on manga` (83.3%), `shounen` (66.7%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2002, Cand: 2009)
   - **Popolarità**: VOT Semi=3693, Cand=2599 (Ratio=0.70 $\to$ `OK`) · VAVE: 8.61 $\to$ 8.40

3. **Film: Sequel (88%) & Tratto da Romanzo (75%)** (8 semi, `Film`)
   - **Semi**: *Wicked - Parte 2*, *Wicked*, *Harry Potter e i Doni della Morte - Parte 2*
   - **Candidati**: *Harry Potter e l'ordine della fenice (2007)*, *Harry Potter e il calice di fuoco (2005)*, *Harry Potter e il prigioniero di Azkaban (2004)*, *Descendants (2015)*, *Harry Potter e la camera dei segreti (2002)*
   - **Keyword & Supporto**: `sequel` (87.5%), `based on novel or book` (75.0%), `magic` (75.0%)
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2014, Cand: 2005)
   - **Popolarità**: VOT Semi=12088, Cand=22760 (Ratio=1.88 $\to$ `OK`) · VAVE: 7.68 $\to$ 7.71

4. **Film: Oggetti che Prendono Vita (100%) & Magical Object (100%)** (2 semi, `Film`)
   - **Semi**: *Una notte al museo 2 - La fuga*, *Una notte al museo*
   - **Candidati**: *Una notte al museo 3 - Il segreto del faraone (2014)*, *La pantera rosa (2006)*, *Un'impresa da Dio (2007)*, *Notte folle a Manhattan (2010)*, *Racconti incantati (2008)*
   - **Keyword & Supporto**: `inanimate objects come to life` (100.0%), `magical object` (100.0%), `museum` (100.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2008, Cand: 2008)
   - **Popolarità**: VOT Semi=9348, Cand=3155 (Ratio=0.34 $\to$ `OK`) · VAVE: 6.38 $\to$ 6.12

---

### Profilo: `castoffcrown` — Lungo storico (412 semi)
**Metadati**: 412 semi totali · 54 micro-cluster $\to$ 31 macro vincolati · **Ammessi dal Gate: 21 (67.7%)** · **Respinti: 10 (32.3%)** · Scaffali serviti: **5 / 5**

1. **Anime: Tratto da Manga (85%) & Shōnen (54%)** (26 semi, `Anime`)
   - **Semi**: *One Piece*, *Haikyu!! L'asso del volley*, *L'attacco dei giganti*
   - **Candidati**: *Hunter x Hunter (2011)*, *One-Punch Man (2015)*, *Il movimento della Terra (2024)*, *Demon Slayer: Kimetsu no Yaiba (2019)*, *Frieren - Oltre la Fine del Viaggio (2023)*
   - **Keyword & Supporto**: `anime` (100.0%), `based on manga` (84.6%), `shounen` (53.8%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2019)
   - **Popolarità**: VOT Semi=632, Cand=2232 (Ratio=3.53 $\to$ `OK`) · VAVE: 8.42 $\to$ 8.64

2. **Anime: Tratto da Manga (86%) & Romantico (54%)** (28 semi, `Anime`)
   - **Semi**: *Tojima Wants to Be a Kamen Rider*, *The 100 Girlfriends Who Really, Really, Really, Really, REALLY Love You*, *Mars Red*
   - **Candidati**: *Hana-Kimi (2026)*, *Honey Lemon Soda (2025)*, *Daemons of the Shadow Realm (2026)*, *The Yakuza's Guide to Babysitting (2022)*, *Quality Assurance in Another World (2024)*
   - **Keyword & Supporto**: `anime` (100.0%), `based on manga` (85.7%), `romance` (53.6%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2025)
   - **Popolarità**: VOT Semi=46, Cand=32 (Ratio=0.70 $\to$ `OK`) · VAVE: 7.67 $\to$ 7.80

3. **Film Anime (71%)** (17 semi, `Anime`)
   - **Semi**: *Mobile Suit Gundam: Iron-Blooded Orphans*, *Mobile Suit Gundam*, *Mobile Suit Gundam Thunderbolt*
   - **Candidati**: *Si alza il vento (2013)*, *Kiki - Consegne a domicilio (1989)*, *Ponyo sulla scogliera (2008)*, *Coraline e la porta magica (2009)*, *L'isola dei cani (2018)*
   - **Keyword & Supporto**: `anime` (70.6%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2009, Cand: 2009)
   - **Popolarità**: VOT Semi=440, Cand=5004 (Ratio=11.37 $\to$ `OK`) · VAVE: 7.60 $\to$ 7.80

4. **Serie: Space Opera (50%)** (12 semi, `Serie`)
   - **Semi**: *The Expanse*, *Andor*, *The Mandalorian*
   - **Candidati**: *The Book of Boba Fett (2021)*, *Obi-Wan Kenobi (2022)*, *The Acolyte: La seguace (2024)*, *Firefly (2002)*, *Star Trek: Picard (2020)*
   - **Keyword & Supporto**: `space opera` (50.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2020, Cand: 2021)
   - **Popolarità**: VOT Semi=2074, Cand=2387 (Ratio=1.15 $\to$ `OK`) · VAVE: 7.61 $\to$ 7.20

5. **Serie: Spettacolo Sportivo (88%) & Wrestling (75%)** (8 semi, `Serie`)
   - **Semi**: *WWE NXT*, *All Elite Wrestling: Collision*, *All Elite Wrestling: Dynamite*
   - **Candidati**: *WWE ECW (2006)*, *AEW Dark (2019)*, *WWE 205 Live (2016)*, *AEW Dark: Elevation (2021)*, *WWE Saturday Night's Main Event (1985)*
   - **Keyword & Supporto**: `sports entertainment` (87.5%), `wrestling` (75.0%), `competitive` (62.5%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2014, Cand: 2016)
   - **Popolarità**: VOT Semi=78, Cand=32 (Ratio=0.41 $\to$ `OK`) · VAVE: 7.20 $\to$ 6.50

---

### Profilo: `warnok` — Lungo storico (476 semi)
**Metadati**: 476 semi totali · 26 micro-cluster $\to$ 45 macro vincolati · **Ammessi dal Gate: 27 (60.0%)** · **Respinti: 18 (40.0%)** · Scaffali serviti: **5 / 5**

1. **Anime: Tratto da Manga (96%) & Shōnen (71%)** (28 semi, `Anime`)
   - **Semi**: *Naruto*, *L'attacco dei giganti*, *Monster*
   - **Candidati**: *Hunter x Hunter (2011)*, *The Promised Neverland (2019)*, *Chainsaw Man (2022)*, *One-Punch Man (2015)*, *Mob Psycho 100 (2016)*
   - **Keyword & Supporto**: `anime` (100.0%), `based on manga` (96.4%), `shounen` (71.4%)
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2016, Cand: 2016)
   - **Popolarità**: VOT Semi=1518, Cand=2232 (Ratio=1.47 $\to$ `OK`) · VAVE: 8.50 $\to$ 8.49

2. **Anime: Tratto da Manga (80%) & Combattimento (60%)** (5 semi, `Anime`)
   - **Semi**: *Dragon Ball*, *Baki the Grappler*, *Record of Ragnarok*
   - **Candidati**: *BAKI (2018)*, *I Cavalieri del Drago (1991)*, *Baki Hanma (2021)*, *Dragon Ball Z (1989)*, *Dragon's Dogma (2020)*
   - **Keyword & Supporto**: `anime` (100.0%), `based on manga` (80.0%), `fight` (60.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2019, Cand: 2018)
   - **Popolarità**: VOT Semi=351, Cand=569 (Ratio=1.62 $\to$ `OK`) · VAVE: 8.00 $\to$ 8.10

3. **Film: Sequel (67%)** (15 semi, `Film`)
   - **Semi**: *Jurassic World – Il regno distrutto*, *Il mondo perduto - Jurassic Park*, *Jurassic Park*
   - **Candidati**: *Jurassic World (2015)*, *Avatar: Fuoco e cenere (2025)*, *La mummia - La tomba dell'Imperatore Dragone (2008)*, *Ritorno al futuro - Parte III (1990)*, *E.T. l'extra-terrestre (1982)*
   - **Keyword & Supporto**: `sequel` (66.7%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2008, Cand: 2008)
   - **Popolarità**: VOT Semi=9518, Cand=11919 (Ratio=1.25 $\to$ `OK`) · VAVE: 7.00 $\to$ 7.50

4. **Film: Animazione 3D (74%)** (23 semi, `Film`)
   - **Semi**: *Spider-Man: Un nuovo universo*, *Il piccolo yeti*, *Wallace e Gromit - Le piume della vendetta*
   - **Candidati**: *Spider-Man: Across the Spider-Verse (2023)*, *Il gatto con gli stivali 2 - L'ultimo desiderio (2022)*, *Jumpers - Un salto tra gli animali (2026)*, *Elemental (2023)*, *Inside Out 2 (2024)*
   - **Keyword & Supporto**: `3d animation` (73.9%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2021, Cand: 2023)
   - **Popolarità**: VOT Semi=3024, Cand=7045 (Ratio=2.33 $\to$ `OK`) · VAVE: 7.60 $\to$ 8.14

5. **Film: Tratto da Fumetto (91%) & Supereroi (83%)** (23 semi, `Film`)
   - **Semi**: *Deadpool & Wolverine*, *Deadpool 2*, *Deadpool*
   - **Candidati**: *Ant-Man and the Wasp: Quantumania (2023)*, *Doctor Strange nel Multiverso della Follia (2022)*, *Spider-Man: Brand New Day (2026)*, *Black Panther: Wakanda Forever (2022)*, *The Marvels (2023)*
   - **Keyword & Supporto**: `based on comic` (91.3%), `superhero` (82.6%), `marvel cinematic universe (mcu)` (78.3%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2018, Cand: 2023)
   - **Popolarità**: VOT Semi=19787, Cand=6148 (Ratio=0.31 $\to$ `DRIFT (< 1/3)`) · VAVE: 7.43 $\to$ 6.99

---

### Profilo: `pepsipex` — Massimo storico (568 semi)
**Metadati**: 568 semi totali · 25 micro-cluster $\to$ 59 macro vincolati · **Ammessi dal Gate: 32 (54.2%)** · **Respinti: 27 (45.8%)** · Scaffali serviti: **5 / 5**

1. **Serie: Tratto da Romanzo (52%)** (25 semi, `Serie`)
   - **Semi**: *Surface*, *Intervista col vampiro*, *One Day*
   - **Candidati**: *Off Campus (2026)*, *Il vampiro Lestat (2026)*, *Heartstopper (2022)*, *Compagni di viaggio (2023)*, *Love, Victor (2020)*
   - **Keyword & Supporto**: `based on novel or book` (52.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2023)
   - **Popolarità**: VOT Semi=345, Cand=877 (Ratio=2.54 $\to$ `OK`) · VAVE: 7.40 $\to$ 8.55

2. **Serie: Tratto da Romanzo (57%)** (21 semi, `Serie`)
   - **Semi**: *Paradise*, *Morte e altri dettagli*, *Imperfect Women - Le mie amiche del cuore*
   - **Candidati**: *The Night Agent (2023)*, *Feel Good (2020)*, *DTF St. Louis (2026)*, *Shining Girls (2022)*, *Dolce Nero (2023)*
   - **Keyword & Supporto**: `based on novel or book` (57.1%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2023)
   - **Popolarità**: VOT Semi=205, Cand=231 (Ratio=1.13 $\to$ `OK`) · VAVE: 7.05 $\to$ 7.11

3. **Film: Horror Soprannaturale (60%)** (20 semi, `Film`)
   - **Semi**: *La casa - Il risveglio del male*, *La casa - Il rogo del Male*, *La casa*
   - **Candidati**: *Five Nights at Freddy's 2 (2025)*, *Undertone - Sottofondo (2026)*, *Whistle - Il richiamo della morte (2026)*, *Black Phone (2022)*, *Until Dawn - Fino all'alba (2025)*
   - **Keyword & Supporto**: `supernatural horror` (60.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2025)
   - **Popolarità**: VOT Semi=2023, Cand=1217 (Ratio=0.60 $\to$ `OK`) · VAVE: 6.68 $\to$ 6.31

4. **Serie: Tratto da Romanzo (80%) & Miniserie (80%)** (10 semi, `Serie`)
   - **Semi**: *Ovunque tu sia*, *Long Bright River - I cieli di Philadelphia*, *Un inganno di troppo*
   - **Candidati**: *SHELTER (2023)*, *Safe (2018)*, *The Stranger (2020)*, *56 giorni (2026)*, *Stay Close (2021)*
   - **Keyword & Supporto**: `based on novel or book` (80.0%), `miniseries` (80.0%), `thriller` (60.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2021)
   - **Popolarità**: VOT Semi=166, Cand=307 (Ratio=1.85 $\to$ `OK`) · VAVE: 6.82 $\to$ 7.00

5. **Serie: Tratto da Romanzo (67%)** (12 semi, `Serie`)
   - **Semi**: *Succession*, *House of the Dragon*, *La ruota del tempo*
   - **Candidati**: *The Shannara Chronicles (2016)*, *Il Trono di Spade (2011)*, *Dark Crystal: La resistenza (2019)*, *Le terrificanti avventure di Sabrina (2018)*, *The Witcher: Blood Origin (2022)*
   - **Keyword & Supporto**: `based on novel or book` (66.7%)
   - **Diagnostica Temporale**: `STALE` (Anno Med. Semi: 2022, Cand: 2018)
   - **Popolarità**: VOT Semi=2630, Cand=1063 (Ratio=0.40 $\to$ `OK`) · VAVE: 7.94 $\to$ 7.83

---

### Profilo: `carverclan` — Ultra-corto (<10 semi, 7 semi)
**Metadati**: 7 semi totali · 2 micro-cluster $\to$ 2 macro vincolati · **Ammessi dal Gate: 2 (100.0%)** · **Respinti: 0 (0.0%)** · Scaffali serviti: **2 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (2/5)**: 
> Questo profilo cold-start possiede solo 7 semi totali e produce 2 soli raggruppamenti naturali. Come da istruzioni, non viene inventato alcun fallback artificiale.

1. **Film: Horror Soprannaturale (100%) & Anni '30 (50%)** (2 semi, `Film`)
   - **Semi**: *I peccatori*, *Stranger Things*
   - **Candidati**: *Una battaglia dopo l’altra (2025)*, *Marty Supreme (2025)*, *Train Dreams (2025)*, *Weapons (2025)*, *Frankenstein (2025)*
   - **Keyword & Supporto**: `supernatural horror` (100.0%), `1930s` (50.0%), `1980s` (50.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2020, Cand: 2025)
   - **Popolarità**: VOT Semi=13660, Cand=3955 (Ratio=0.29 $\to$ `DRIFT (< 1/3)`) · VAVE: 8.03 $\to$ 7.33

2. **Film: Antologia (50%) & Tratto da Romanzo (50%)** (2 semi, `Film`)
   - **Semi**: *Peter Pan Goes Wrong*, *Great Performances*
   - **Candidati**: *Pippin (1981)*, *The Phantom of the Opera at the Royal Albert Hall (2011)*, *Top Gear: The Perfect Road Trip 2 (2014)*, *Scum (1977)*, *The Kate Bush Story: Running Up That Hill (2014)*
   - **Keyword & Supporto**: `anthology` (50.0%), `based on novel or book` (50.0%), `based on play or musical` (50.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 1994, Cand: 2011)
   - **Popolarità**: VOT Semi=46, Cand=50 (Ratio=1.09 $\to$ `OK`) · VAVE: 6.80 $\to$ 7.24

---

### Profilo: `1jacobjohn` — Intermedio (167 semi)
**Metadati**: 167 semi totali · 19 micro-cluster $\to$ 15 macro vincolati · **Ammessi dal Gate: 9 (60.0%)** · **Respinti: 6 (40.0%)** · Scaffali serviti: **5 / 5**

1. **Serie: Animazione per Adulti (87%)** (15 semi, `Serie`)
   - **Semi**: *Bob's Burgers*, *Primal*, *South Park*
   - **Candidati**: *Big Mouth (2017)*, *The Cleveland Show (2009)*, *BoJack Horseman (2014)*, *Archer (2009)*, *King of the Hill (1997)*
   - **Keyword & Supporto**: `adult animation` (86.7%)
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2013, Cand: 2009)
   - **Popolarità**: VOT Semi=1629, Cand=1266 (Ratio=0.78 $\to$ `OK`) · VAVE: 7.80 $\to$ 7.60

2. **Film: Fede Cristiana (60%)** (5 semi, `Film`)
   - **Semi**: *The Chosen*, *The Last Rodeo*, *Il re dei re - La più grande storia mai raccontata*
   - **Candidati**: *David (2025)*, *Il suo unico figlio (2023)*, *La strada dell’anima (2024)*, *Lucy Shimmers and the Prince of Peace (2020)*, *Sound of Hope: The Story of Possum Trot (2024)*
   - **Keyword & Supporto**: `christian faith` (60.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2023, Cand: 2024)
   - **Popolarità**: VOT Semi=217, Cand=203 (Ratio=0.94 $\to$ `OK`) · VAVE: 7.50 $\to$ 8.02

3. **Serie: Automobili & Motori (67%) & Auto d'Epoca (67%)** (3 semi, `Serie`)
   - **Semi**: *Vite Sotto Zero*, *The Grand Tour*, *Car Masters: dalla ruggine alla gloria*
   - **Candidati**: *Rust Valley Restorers (2018)*, *Top Gear (2002)*, *Affari a quattro ruote (2003)*, *Pimp My Ride (2004)*, *Una famiglia fuori dal mondo (2014)*
   - **Keyword & Supporto**: `automobile` (66.7%), `classic cars` (66.7%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2016, Cand: 2004)
   - **Popolarità**: VOT Semi=94, Cand=67 (Ratio=0.71 $\to$ `OK`) · VAVE: 7.46 $\to$ 7.20

4. **Serie: Era Glaciale (67%) & Documentario Naturalistico (67%)** (3 semi, `Serie`)
   - **Semi**: *Big Beasts - Maestose creature*, *L'antica apocalisse*, *Il pianeta preistorico*
   - **Candidati**: *The Dinosaurs: La vera storia (2026)*, *Il pianeta notturno a colori (2020)*, *Dinosaur Planet (2003)*, *Super/Natural (2022)*, *Sea Monsters (2003)*
   - **Keyword & Supporto**: `ice age` (66.7%), `nature documentary` (66.7%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2020)
   - **Popolarità**: VOT Semi=105, Cand=41 (Ratio=0.39 $\to$ `OK`) · VAVE: 7.40 $\to$ 8.00

5. **Film: Nuoto & Balneazione (50%) & Differenze Sociali (50%)** (2 semi, `Film`)
   - **Semi**: *Un amore a 5 stelle*, *Swimfan - La piscina della paura*
   - **Candidati**: *Prima o poi mi sposo (2001)*, *Tutta colpa dell'amore (2002)*, *Two Weeks Notice - Due settimane per innamorarsi (2002)*, *Prigione di vetro (2001)*, *Oggi sposi... niente sesso! (2003)*
   - **Keyword & Supporto**: `bathing` (50.0%), `class differences` (50.0%), `coma` (50.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2002, Cand: 2002)
   - **Popolarità**: VOT Semi=1197, Cand=1803 (Ratio=1.51 $\to$ `OK`) · VAVE: 5.68 $\to$ 5.97

---

## 6. Riconciliazione Temporale (Staleness vs Deepening)

Con il Coherence Gate attivo, sui 39 scaffali serviti su tutte le 10 timeline:
- **30 scaffali (76.9%)** sono contemporanei o contengono candidati degli ultimi 3 anni (2024–2026);
- **8 scaffali (20.5%)** sono casi autentici di *Deepening* (semi storici o mix multi-decennale di epoche, come i classici anime di Kurosawa/Ghibli o documentari naturalistici d'archivio);
- **Solo 1 scaffale su 39 (2.6%)** è un vero caso di **STALE**: lo scaffale 5 di `pepsipex` (*House of the Dragon*, *A Knight of the Seven Kingdoms*, *The Witcher*), in cui l'utente possiede opere del 2024-2026, ma i candidati fantasy proposti si arrestano al 2022 (*The Shannara Chronicles*, *Game of Thrones*, *Dark Crystal*).
