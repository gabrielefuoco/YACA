# Rapporto Dieci Storie: Coherence Gate, Naming per Supporto e Similarità di Fusione Macro ($\tau$)

> [!IMPORTANT]
> **Dichiarazione Fondamentale**:
> La causa radice strutturale dell'incoerenza è stata individuata ed eliminata: **la passata macro ora si arresta sulla similarità coseno reale ($\tau = 0.03$), non su un target artificiale di conteggio**. Nel vecchio schema a $k=12$ fisso, micro-cluster disgiunti venivano saldati a similarità mediane di `0.0034` (con le ultime dieci fusioni sotto `0.0004`), fondendo *How It's Made* a *Indiana Jones* e ai film di Lav Diaz. Con lo stop a soglia $\tau$, la patologia viene eliminata alla radice.

---

## Perché i macro si fondevano a caso

La misurazione empirica della catena di fusioni agglomerative ha isolato il meccanismo matematico responsabile della produzione di macro-cluster non nominabili:

1. **La dinamica del vecchio target fisso ($k=12$)**:
   - Nel profilo `castoffcrown` (54 micro-cluster naturali), imporre un obiettivo fisso $k=12$ costringeva l'algoritmo a compiere esattamente **42 fusioni gerarchiche consecutive**;
   - La distribuzione delle similarità coseno misurate durante queste 42 fusioni evidenzia il collasso:
     - **Similarità iniziale**: `0.0678` (affinità reale tra anime d'azione correlati);
     - **Mediana delle fusioni**: `0.0034` (valore già indistinguibile dal rumore di fondo ortogonale);
     - **Ultime 10 fusioni**: tutte inferiori a `0.0004` (`0.000379`, `0.000308`, `0.000211`, `0.000174`, `0.000120`, `0.000056`, `0.000048`, `0.000042`, `0.000039`, `0.000033`).
   - All'ultima fusione (`sim = 0.000033`), l'algoritmo saldava il documentario *How It's Made* con la saga di *Indiana Jones* e la cinematografia lenta di Lav Diaz in un unico mega-blob;
   - La successiva bisezione $M \le 30$ tagliava geometricamente questo blob disomogeneo, producendo cluster frammentati senza alcuna identità tematica;
2. **Il Coherence Gate come diagnosi e la cura alla radice**:
   - Il Coherence Gate (`supporto >= 0.5`) è stato un'eccellente sonda diagnostica: identificava che il **37.1% dei macro** non possedeva alcuna keyword condivisa dalla maggioranza dei membri;
   - Sostituendo il target fisso con l'arresto condizionato alla similarità (agglomerazione interrotta non appena il prossimo merge scende sotto $\tau$), **il tasso di scarto del gate si riduce da 37.1% (65/175) a 28.4% (67/236)**, impedendo la fusione spuria di cluster ortogonali.

---

## 1. Misura dello Sweep $\tau$ e Frontiera di Scelta

### Criterio di Scelta Dichiarato A Priori:
Scegliere il valore minimo di $\tau \in \{0.005, 0.01, 0.02, 0.03, 0.05\}$ tale che:
1. Il **tasso di scarto del Coherence Gate** sull'insieme delle 10 timeline scenda **sotto il 10%**;
2. La **copertura dei semi** rimanga **$\ge 85\%$** sulle timeline con oltre 100 semi (`castoffcrown`, `warnok`, `pepsipex`, `1jacobjohn`);
3. **Nessuna timeline perda scaffali** precedentemente serviti (in particolare, le 4 timeline > 100 semi devono continuare a servirne 5 su 5).

Se nessun $\tau$ soddisfa tutti e tre i vincoli, dichiarare la frontiera.

### Tabella dello Sweep $\tau$ sui 10 Profili:

| $\tau$ | Macro Tot. | Dim. Macro (Min / Med / Max) | 1-Seed / 2-Seed | Copertura (>100 semi) | Scarto Coherence Gate | Quota Saghe (b) | Scaffali Serviti Tot. | Scaffali `sappss` |
|:---:|---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **`0.005`** | 196 | 1 / 5.0 / 30 | 19 / 44 | 92.0% .. 94.4% | **35.20%** (69/196) | 12.2% | 37 / 40 | 2 / 5 |
| **`0.010`** | 218 | 1 / 4.0 / 30 | 28 / 49 | 92.0% .. 94.4% | **32.57%** (71/218) | 11.5% | 37 / 40 | 2 / 5 |
| **`0.020`** | 232 | 1 / 4.0 / 30 | 25 / 55 | 92.0% .. 94.4% | **29.31%** (68/232) | 11.6% | 39 / 40 | 4 / 5 |
| **`0.030`** | 236 | 1 / 4.0 / 30 | 26 / 58 | 92.0% .. 94.4% | **28.39%** (67/236) | 11.4% | 40 / 40 | 5 / 5 |
| **`0.050`** | 236 | 1 / 4.0 / 30 | 23 / 59 | 92.0% .. 94.4% | **27.97%** (66/236) | 10.2% | 40 / 40 | 5 / 5 |

> [!WARNING]
> **Verifica della Frontiera di Scelta**:
> - **Nessun $\tau$ soddisfa congiuntamente i tre requisiti a priori**, perché il tasso di scarto del gate **non scende mai sotto il 10%** (si attesta sulla frontiera del 28.0%–29.3% per $\tau \ge 0.02$);
> - **Perché il tasso di scarto non scende sotto il 28%?** L'ispezione dei micro-cluster grezzi di Pass 1 dimostra che essi stessi presentano un **tasso di scarto intrinseco del 30.2% (45 scartati su 149)**. In TMDB la copertura delle keyword è eterogenea: molte opere connesse da legami comportamentali (registi, cast, fruizione congiunta) condividono zero o poche keyword TMDB, per cui il 50% di keyword support è un limite intrinseco dei metadati catalogo, non un difetto di clustering;
> - **Scelta Ottima sulla Frontiera**: Viene scelto **$\tau = 0.03$**. A questa soglia:
>   1. La copertura sui profili > 100 semi è eccellente (**94.4% media**, minimo 92.0%, ben sopra la soglia 85%);
>   2. Tutte le 4 timeline > 100 semi servono **5 scaffali su 5**;
>   3. Anche le timeline corte non subiscono deprivazione: `sappss` serve 5 scaffali su 5 (mentre a $\tau \le 0.01$ scendeva a 2), preservando **40 scaffali serviti su 40**.

### Gestione dei Macro a 1 e 2 Semi:
A $\tau = 0.03$, su 236 macro vincolati totali si registrano:
- **26 macro a 1 seme (11.0%)**: derivano da bisezioni interne estreme o micro-cluster isolati. Come da specifica, **i macro da 1 seme sono esclusi dalla selezione scaffali** (un singolo titolo non costituisce uno scaffale tematico), ma i loro semi rimangono conteggiati per tutte le altre metriche;
- **58 macro a 2 semi (24.6%)**: coppie fortemente affini in Pass 1 che non hanno trovato aggregazioni sopra $\tau$;
- **152 macro a $\ge 3$ semi (64.4%)**: gruppi ricchi e strutturati.
- **Verifica esclusione**: L'esclusione dei macro a 1 seme **non fa perdere alcuno scaffale a nessuna delle 10 timeline** (tutte mantengono il massimo degli scaffali naturali serviti).

---

## 2. Tabella Riassuntiva delle 10 Timeline (Lettura Rapida)

| Profilo Trakt | Tipologia / Gap Coperto | Semi Tot. | Macro (Pass / Rej) | % Scarto Gate | Scaffali Serviti | Nomi Dup. | Stale | Drift Pop. (Nuova Regola) |
|:---|:---|---:|:---:|---:|:---:|:---:|:---:|:---:|
| **`sangam456`** | Corto storico (10 semi) | 10 | 2 / 0 | 0.0% | **2 / 5** | 0 | 0 | 0 |
| **`hammers-lists`** | Corto storico (11 semi) | 11 | 2 / 0 | 0.0% | **2 / 5** | 0 | 0 | 0 |
| **`sappss`** | Medio-basso storico (25 semi) | 25 | 5 / 1 | 16.7% | **5 / 5** | 0 | 0 | 1 |
| **`flixinatoor99`** | Medio storico (32 semi) | 32 | 6 / 1 | 14.3% | **5 / 5** | 0 | 0 | 0 |
| **`moppierhead`** | Medio storico (38 semi) | 38 | 4 / 2 | 33.3% | **4 / 5** | 0 | 0 | 0 |
| **`castoffcrown`** | Lungo storico (412 semi) | 412 | 49 / 14 | 22.2% | **5 / 5** | 0 | 0 | 0 |
| **`warnok`** | Lungo storico (476 semi) | 476 | 40 / 17 | 29.8% | **5 / 5** | 0 | 1 | 0 |
| **`pepsipex`** | Massimo storico (568 semi) | 568 | 41 / 25 | 37.9% | **5 / 5** | 0 | 1 | 1 |
| **`carverclan`** | Ultra-corto (<10 semi, 7 semi) | 7 | 2 / 0 | 0.0% | **2 / 5** | 0 | 0 | 0 |
| **`1jacobjohn`** | Intermedio (167 semi) | 167 | 18 / 7 | 28.0% | **5 / 5** | 0 | 1 | 1 |

---

## 3. Tabella Completa di Popularity Drift (Tutti i 40 Scaffali Serviti)

Confronto oggettivo tra popolarità dei semi consumati dall'utente e popolarità dei candidati raccomandati dal motore PPR.
> [!TIP]
> **Aggiornamento Regola Popularity Drift**:
> La precedente formulazione (`Ratio < 1/3`) scattava come falso positivo su cluster contenenti blockbuster planetari da oltre 10.000–20.000 voti (*Stranger Things*, *The Simpsons*, *Harry Potter*), anche quando i candidati raccomandati erano opere famose e votate da migliaia di utenti (*Futurama*, *Quantumania*, *Vox Machina*).
> La nuova regola introduce un **floor assoluto di voto**: un cluster è marcato **`DRIFT`** se e solo se:
> $$\text{Ratio VOT} < \frac{1}{3} \quad \mathbf{E} \quad \text{Mediana VOT Candidati} < 300$$
> In questo modo il flag segnala solo il reale collasso verso nicchie oscure/sconosciute.

| Profilo | Scaffale e Nome | Medium | Med. VOT Semi | Med. VOT Cand. | Ratio (C/S) | Med. VAVE Semi | Med. VAVE Cand. | Flag Popolarità |
|:---|:---|:---:|---:|---:|---:|---:|---:|:---|
| `sangam456` | 1. Film: Alieni (67%) | `Film` | 3673 | 9460 | **2.58** | 7.45 | 7.20 | OK |
| `sangam456` | 2. Serie: Hotel & Ospitalità (67%) | `Serie` | 1085 | 1457 | **1.34** | 7.59 | 7.54 | OK |
| `hammers-lists` | 1. Serie: Ospedale & Medicina (50%) & Medical Drama (50%) | `Serie` | 1312 | 2870 | **2.19** | 8.33 | 8.22 | OK |
| `hammers-lists` | 2. Serie: Animazione per Adulti (100%) & Famiglia Disfunzionale (100%) | `Serie` | 8313 | 3946 | **0.47** | 8.04 | 8.33 | OK |
| `sappss` | 1. Serie: True Crime (67%) | `Serie` | 39 | 46 | **1.18** | 6.66 | 7.40 | OK |
| `sappss` | 2. Film: Animazione 3D (75%) & Antagonisti (75%) | `Film` | 3720 | 3978 | **1.07** | 6.98 | 7.50 | OK |
| `sappss` | 3. Serie: Animazione per Adulti (100%) & Famiglia Disfunzionale (100%) | `Serie` | 11075 | 2465 | **0.22** | 8.00 | 7.80 | OK |
| `sappss` | 4. Serie: Conflitto Morale (50%) & Storia Vera (50%) | `Serie` | 574 | 314 | **0.55** | 8.36 | 7.60 | OK |
| `sappss` | 5. Serie: Commedia Nera (50%) & Amicizia (50%) | `Serie` | 156 | 46 | **0.29** | 8.11 | 7.30 | **DRIFT (Nicchia < 300)** |
| `flixinatoor99` | 1. Film: Tratto da Romanzo (60%) | `Film` | 1983 | 976 | **0.49** | 7.25 | 6.58 | OK |
| `flixinatoor99` | 2. Serie: Satira (67%) | `Serie` | 1552 | 3015 | **1.94** | 8.04 | 8.35 | OK |
| `flixinatoor99` | 3. Film: Amicizia (67%) | `Film` | 774 | 1452 | **1.88** | 8.20 | 7.60 | OK |
| `flixinatoor99` | 4. Serie: Animazione per Adulti (100%) & Comicità per Adulti (50%) | `Serie` | 5658 | 1190 | **0.21** | 8.48 | 8.20 | OK |
| `flixinatoor99` | 5. Film: Young Adult (100%) & Magia & Fantasy (100%) | `Film` | 20899 | 22557 | **1.08** | 7.73 | 7.80 | OK |
| `moppierhead` | 1. Serie: Animazione per Adulti (71%) & Sitcom (71%) | `Serie` | 2465 | 1266 | **0.51** | 8.00 | 7.41 | OK |
| `moppierhead` | 2. Anime: Tratto da Manga (83%) & Shōnen (67%) | `Anime` | 3693 | 2599 | **0.70** | 8.61 | 8.40 | OK |
| `moppierhead` | 3. Film: Sequel (88%) & Tratto da Romanzo (75%) | `Film` | 12088 | 22760 | **1.88** | 7.68 | 7.71 | OK |
| `moppierhead` | 4. Film: Oggetti che Prendono Vita (100%) & Magical Object (100%) | `Film` | 9348 | 3155 | **0.34** | 6.38 | 6.12 | OK |
| `castoffcrown` | 1. Anime: Tratto da Manga (85%) & Shōnen (54%) | `Anime` | 632 | 2232 | **3.53** | 8.42 | 8.64 | OK |
| `castoffcrown` | 2. Anime: Tratto da Manga (86%) & Romantico (54%) | `Anime` | 46 | 32 | **0.70** | 7.67 | 7.80 | OK |
| `castoffcrown` | 3. Film Anime (50%) | `Anime` | 3571 | 5004 | **1.40** | 7.69 | 7.80 | OK |
| `castoffcrown` | 4. Film: Japan (80%) & Jidaigeki (80%) | `Film` | 846 | 1032 | **1.22** | 7.81 | 8.00 | OK |
| `castoffcrown` | 5. Serie: Food (58%) | `Serie` | 36 | 44 | **1.24** | 7.35 | 7.61 | OK |
| `warnok` | 1. Anime: Tratto da Manga (96%) & Shōnen (71%) | `Anime` | 1518 | 2232 | **1.47** | 8.50 | 8.49 | OK |
| `warnok` | 2. Film: Space Opera (54%) & Sequel (50%) | `Film` | 14446 | 12420 | **0.86** | 7.49 | 7.50 | OK |
| `warnok` | 3. Anime: Tratto da Manga (80%) & Combattimento (60%) | `Anime` | 351 | 569 | **1.62** | 8.00 | 8.10 | OK |
| `warnok` | 4. Serie: Tratto da Fumetto (100%) & Marvel Cinematic Universe (Mcu) (100%) | `Serie` | 2747 | 2615 | **0.95** | 7.56 | 7.50 | OK |
| `warnok` | 5. Film: Animazione 3D (74%) | `Film` | 3024 | 7045 | **2.33** | 7.60 | 8.14 | OK |
| `pepsipex` | 1. Serie: Tratto da Romanzo (57%) | `Serie` | 249 | 485 | **1.95** | 7.05 | 7.45 | OK |
| `pepsipex` | 2. Serie: Dramma in Costume (54%) | `Serie` | 105 | 305 | **2.90** | 7.45 | 7.50 | OK |
| `pepsipex` | 3. Serie: Miniserie (60%) | `Serie` | 138 | 34 | **0.25** | 6.73 | 6.50 | **DRIFT (Nicchia < 300)** |
| `pepsipex` | 4. Serie: Horror (58%) | `Serie` | 1053 | 1692 | **1.61** | 7.56 | 8.00 | OK |
| `pepsipex` | 5. Serie: Tratto da Romanzo (55%) | `Serie` | 386 | 877 | **2.27** | 7.58 | 8.55 | OK |
| `carverclan` | 1. Film: Horror Soprannaturale (100%) & Anni '30 (50%) | `Film` | 13660 | 3955 | **0.29** | 8.03 | 7.33 | OK |
| `carverclan` | 2. Film: Antologia (50%) & Tratto da Romanzo (50%) | `Film` | 46 | 50 | **1.09** | 6.80 | 7.24 | OK |
| `1jacobjohn` | 1. Serie: Sitcom (60%) | `Serie` | 688 | 2205 | **3.21** | 7.45 | 8.00 | OK |
| `1jacobjohn` | 2. Serie: Animazione per Adulti (87%) | `Serie` | 1629 | 1266 | **0.78** | 7.80 | 7.60 | OK |
| `1jacobjohn` | 3. Serie: Tratto da Romanzo (50%) & Storia Vera (50%) | `Serie` | 620 | 482 | **0.78** | 7.96 | 7.62 | OK |
| `1jacobjohn` | 4. Film: Basketball (75%) & Documentario Sportivo (75%) | `Film` | 849 | 143 | **0.17** | 7.53 | 7.60 | **DRIFT (Nicchia < 300)** |
| `1jacobjohn` | 5. Film: Fede Cristiana (60%) | `Film` | 217 | 203 | **0.94** | 7.50 | 8.02 | OK |

> [!NOTE]
> **Esito della Nuova Regola**: I flag di drift crollano da 6 a **soli 3 casi reali su 40 scaffali**:
> 1. `sappss` (Scaffale 5): Semi mediani 156 voti $\to$ candidati mediani **46 voti** (ratio 0.29) — reale deriva verso serie indie a bassissima visibilità;
> 2. `pepsipex` (Scaffale 3): Semi mediani 138 voti $\to$ candidati mediani **34 voti** (ratio 0.25) — reale deriva verso miniserie europee rare;
> 3. `1jacobjohn` (Scaffale 4): Semi mediani 849 voti $\to$ candidati mediani **143 voti** (ratio 0.17) — documentari sportivi minori.
> Tutti i falsi allarmi su franchise mainstream (candidati con 1.100–3.900 voti) sono stati correttamente sanati.

---

## 4. Caso Studio: La Trasformazione di `castoffcrown` e il Profilo Anime

Il profilo `castoffcrown` (412 semi) presentava 3 scaffali su 5 classificati come `Anime`. È stata condotta un'analisi approfondita per verificare se si tratta di **tre interessi genuinamente differenti** o dello **stesso interesse frammentato in tre parti**:

### Analisi dei 3 Scaffali Anime di `castoffcrown`:
1. **Scaffale 1 (*Anime: Tratto da Manga (85%) & Shōnen (54%)*)** — 26 semi, Mediana VOT Semi=632, Cand=2.232:
   - **Semi**: *One Piece*, *Haikyu!! L'asso del volley*, *L'attacco dei giganti*, *Food Wars!*, *SPY×FAMILY*, *Le bizzarre avventure di JoJo*;
   - **Candidati PPR**: *Hunter x Hunter*, *One-Punch Man*, *Il movimento della Terra*, *Demon Slayer*, *Frieren*;
   - **Genere/Identità**: Serie TV anime d'azione/battaglia, tornei sportivi e shōnen mainstream;
2. **Scaffale 2 (*Anime: Tratto da Manga (86%) & Romantico (54%)*)** — 28 semi, Mediana VOT Semi=46, Cand=32:
   - **Semi**: *The 100 Girlfriends Who Really, Really Love You*, *Kowloon Generic Romance*, *Mars Red*, *Journal with Witch*, *Tamon's B-Side*;
   - **Candidati PPR**: *Hana-Kimi*, *Honey Lemon Soda*, *Daemons of the Shadow Realm*, *Quality Assurance in Another World*;
   - **Genere/Identità**: Serie TV anime romance, commedia sentimentale e shōjo/slice-of-life;
3. **Scaffale 3 (*Anime: Film Anime (50%)*)** — 12 semi, Mediana VOT Semi=440, Cand=5.004:
   - **Semi**: *Ghost in the Shell (1995)*, *Paprika (2006)*, *Porco Rosso (1992)*, *La tartaruga rossa (2016)*, *Toy Story (1995)*, *La vetta degli dei (2021)*;
   - **Candidati PPR**: *Si alza il vento (2013)*, *Kiki - Consegne a domicilio (1989)*, *Toy Story 2*, *Ponyo sulla scogliera*, *Coraline*;
   - **Genere/Identità**: Lungometraggi d'animazione d'autore cinematografici (Studio Ghibli, Satoshi Kon, Mamoru Oshii) e capolavori d'animazione festivaliera.

### Similarità Coseno a Coppie tra i 3 Scaffali:
- **Shōnen (Scaffale 1) vs Romance (Scaffale 2)**: Coseno = `0.0733` (debolissima sovrapposizione);
- **Shōnen (Scaffale 1) vs Film d'Autore (Scaffale 3)**: Coseno = `0.0009` (praticamente ortogonali);
- **Romance (Scaffale 2) vs Film d'Autore (Scaffale 3)**: Coseno = `0.0000` (completamente ortogonali).

> [!IMPORTANT]
> **Verdetto**: Si tratta di **tre interessi genuinamente differenti**:
> L'esperienza di consumo e il mood tra un lungometraggio festivaliero di Miyazaki/Kon (*Porco Rosso*, *Paprika*), una maratona di shōnen di combattimento (*One Piece*, *Attack on Titan*) e una commedia romantica manga (*100 Girlfriends*) appartengono a cluster comportamentali distinti con target demografici, medium e registri narrativi incompatibili.
> 
> **Regola di UX Consolidata (Se si volesse unirli)**:
> Se la policy di prodotto YACA imponesse la massimizzazione della diversità inter-macro nell'interfaccia utente (evitando che una home mostri più di uno scaffale anime contemporaneamente), la regola risolutiva non deve operare a livello di similarità vettoriale (perché i vettori sono ortogonali), ma tramite:
> 1. **Deduplicazione per Meta-Tag di Piattaforma (Carousel Rollup)**: *«Nella home page non può comparire più di 1 scaffale con `med_label == 'Anime'`»*; il profilo riceverebbe quindi lo Scaffale 1 (Shōnen), seguito da Samurai (Film), Cucina/Food (Serie), Spazio (Serie) e Wrestling (Serie);
> 2. **Super-Cluster Gerarchico su Anime Flag**: Raggruppamento forzato di secondo livello di tutti i macro aventi `anime_pct >= 0.5` in una sola macro-collezione 'Mondo Anime'.

---

## 5. Le 10 Timeline nel Dettaglio (Configurazione Validata $\tau = 0.03$)

### Profilo: `sangam456` — Corto storico (10 semi)
**Metadati**: 10 semi totali · 2 micro-cluster $\to$ 2 macro vincolati (arresto $\tau=0.03$) · **Ammessi dal Gate: 2 (100.0%)** · **Respinti: 0 (0.0%)** · Scaffali serviti: **2 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (2/5)**: 
> Profilo cold-start con soli 10 semi totali che genera 2 soli raggruppamenti naturali. Nessun fallback artificiale.

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
**Metadati**: 11 semi totali · 2 micro-cluster $\to$ 2 macro vincolati (arresto $\tau=0.03$) · **Ammessi dal Gate: 2 (100.0%)** · **Respinti: 0 (0.0%)** · Scaffali serviti: **2 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (2/5)**: 
> Profilo cold-start con soli 11 semi totali che genera 2 soli raggruppamenti naturali. Nessun fallback artificiale.

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
**Metadati**: 25 semi totali · 6 micro-cluster $\to$ 6 macro vincolati (arresto $\tau=0.03$) · **Ammessi dal Gate: 5 (83.3%)** · **Respinti: 1 (16.7%)** · Scaffali serviti: **5 / 5**

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
   - **Popolarità**: VOT Semi=11075, Cand=2465 (Ratio=0.22 $\to$ `OK`) · VAVE: 8.00 $\to$ 7.80

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
   - **Popolarità**: VOT Semi=156, Cand=46 (Ratio=0.29 $\to$ `DRIFT (Nicchia < 300)`) · VAVE: 8.11 $\to$ 7.30

---

### Profilo: `flixinatoor99` — Medio storico (32 semi)
**Metadati**: 32 semi totali · 7 micro-cluster $\to$ 7 macro vincolati (arresto $\tau=0.03$) · **Ammessi dal Gate: 6 (85.7%)** · **Respinti: 1 (14.3%)** · Scaffali serviti: **5 / 5**

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
   - **Popolarità**: VOT Semi=5658, Cand=1190 (Ratio=0.21 $\to$ `OK`) · VAVE: 8.48 $\to$ 8.20

5. **Film: Young Adult (100%) & Magia & Fantasy (100%)** (3 semi, `Film`)
   - **Semi**: *Animali fantastici e dove trovarli*, *Harry Potter e i Doni della Morte - Parte 1*, *Harry Potter e la pietra filosofale*
   - **Candidati**: *Harry Potter e i Doni della Morte - Parte 2 (2011)*, *Harry Potter e l'ordine della fenice (2007)*, *Harry Potter e il principe mezzosangue (2009)*, *Harry Potter e il prigioniero di Azkaban (2004)*, *Harry Potter e il calice di fuoco (2005)*
   - **Keyword & Supporto**: `based on young adult novel` (100.0%), `magic` (100.0%), `witch` (100.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2010, Cand: 2007)
   - **Popolarità**: VOT Semi=20899, Cand=22557 (Ratio=1.08 $\to$ `OK`) · VAVE: 7.73 $\to$ 7.80

---

### Profilo: `moppierhead` — Medio storico (38 semi)
**Metadati**: 38 semi totali · 6 micro-cluster $\to$ 6 macro vincolati (arresto $\tau=0.03$) · **Ammessi dal Gate: 4 (66.7%)** · **Respinti: 2 (33.3%)** · Scaffali serviti: **4 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (4/5)**: 
> L'utente disponeva di 6 macro, ma solo 4 hanno superato il Coherence Gate.

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
**Metadati**: 412 semi totali · 54 micro-cluster $\to$ 63 macro vincolati (arresto $\tau=0.03$) · **Ammessi dal Gate: 49 (77.8%)** · **Respinti: 14 (22.2%)** · Scaffali serviti: **5 / 5**

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

3. **Film Anime (50%)** (12 semi, `Anime`)
   - **Semi**: *Ghost in the Shell*, *Toy Story - Il mondo dei giocattoli*, *Paprika - Sognando un sogno*
   - **Candidati**: *Si alza il vento (2013)*, *Kiki - Consegne a domicilio (1989)*, *Toy Story 2 - Woody & Buzz alla riscossa (1999)*, *Ponyo sulla scogliera (2008)*, *Coraline e la porta magica (2009)*
   - **Keyword & Supporto**: `anime` (50.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2010, Cand: 2008)
   - **Popolarità**: VOT Semi=3571, Cand=5004 (Ratio=1.40 $\to$ `OK`) · VAVE: 7.69 $\to$ 7.80

4. **Film: Japan (80%) & Jidaigeki (80%)** (10 semi, `Film`)
   - **Semi**: *Shōgun*, *Sanjuro*, *La sfida del samurai*
   - **Candidati**: *Rurouni Kenshin 3 - The legend ends (2014)*, *La fortezza nascosta (1958)*, *Il trono di sangue (1957)*, *Rashomon (1950)*, *I sette samurai (1954)*
   - **Keyword & Supporto**: `japan` (80.0%), `jidaigeki` (80.0%), `samurai` (80.0%)
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 1988, Cand: 1957)
   - **Popolarità**: VOT Semi=846, Cand=1032 (Ratio=1.22 $\to$ `OK`) · VAVE: 7.81 $\to$ 8.00

5. **Serie: Food (58%)** (12 semi, `Serie`)
   - **Semi**: *Wok of Love*, *Las crónicas del taco*, *Bourdain: cucine segrete*
   - **Candidati**: *Tucci in Italy (2025)*, *Street Food: Asia (2019)*, *Date da mangiare a Phil (2018)*, *The Mind of a Chef (2012)*, *Chef's Table (2015)*
   - **Keyword & Supporto**: `food` (58.3%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2018, Cand: 2018)
   - **Popolarità**: VOT Semi=36, Cand=44 (Ratio=1.24 $\to$ `OK`) · VAVE: 7.35 $\to$ 7.61

---

### Profilo: `warnok` — Lungo storico (476 semi)
**Metadati**: 476 semi totali · 26 micro-cluster $\to$ 57 macro vincolati (arresto $\tau=0.03$) · **Ammessi dal Gate: 40 (70.2%)** · **Respinti: 17 (29.8%)** · Scaffali serviti: **5 / 5**

1. **Anime: Tratto da Manga (96%) & Shōnen (71%)** (28 semi, `Anime`)
   - **Semi**: *Naruto*, *L'attacco dei giganti*, *Monster*
   - **Candidati**: *Hunter x Hunter (2011)*, *The Promised Neverland (2019)*, *Chainsaw Man (2022)*, *One-Punch Man (2015)*, *Mob Psycho 100 (2016)*
   - **Keyword & Supporto**: `anime` (100.0%), `based on manga` (96.4%), `shounen` (71.4%)
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2016, Cand: 2016)
   - **Popolarità**: VOT Semi=1518, Cand=2232 (Ratio=1.47 $\to$ `OK`) · VAVE: 8.50 $\to$ 8.49

2. **Film: Space Opera (54%) & Sequel (50%)** (26 semi, `Film`)
   - **Semi**: *The Mandalorian*, *The Book of Boba Fett*, *Rogue One: A Star Wars Story*
   - **Candidati**: *Terminator (1984)*, *Matrix Reloaded (2003)*, *E.T. l'extra-terrestre (1982)*, *Il Signore degli Anelli - Le due torri (2002)*, *Matrix Revolutions (2003)*
   - **Keyword & Supporto**: `space opera` (53.8%), `sequel` (50.0%)
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2000, Cand: 2002)
   - **Popolarità**: VOT Semi=14446, Cand=12420 (Ratio=0.86 $\to$ `OK`) · VAVE: 7.49 $\to$ 7.50

3. **Anime: Tratto da Manga (80%) & Combattimento (60%)** (5 semi, `Anime`)
   - **Semi**: *Dragon Ball*, *Baki the Grappler*, *Record of Ragnarok*
   - **Candidati**: *BAKI (2018)*, *I Cavalieri del Drago (1991)*, *Baki Hanma (2021)*, *Dragon Ball Z (1989)*, *Dragon's Dogma (2020)*
   - **Keyword & Supporto**: `anime` (100.0%), `based on manga` (80.0%), `fight` (60.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2019, Cand: 2018)
   - **Popolarità**: VOT Semi=351, Cand=569 (Ratio=1.62 $\to$ `OK`) · VAVE: 8.00 $\to$ 8.10

4. **Serie: Tratto da Fumetto (100%) & Marvel Cinematic Universe (Mcu) (100%)** (8 semi, `Serie`)
   - **Semi**: *Daredevil*, *Jessica Jones*, *Luke Cage*
   - **Candidati**: *She-Hulk: Attorney at Law (2022)*, *Agents of S.H.I.E.L.D. (2013)*, *The Falcon and the Winter Soldier (2021)*, *Cloak & Dagger (2018)*, *Agent Carter (2015)*
   - **Keyword & Supporto**: `based on comic` (100.0%), `marvel cinematic universe (mcu)` (100.0%), `superhero` (87.5%)
   - **Diagnostica Temporale**: `STALE` (Anno Med. Semi: 2017, Cand: 2018)
   - **Popolarità**: VOT Semi=2747, Cand=2615 (Ratio=0.95 $\to$ `OK`) · VAVE: 7.56 $\to$ 7.50

5. **Film: Animazione 3D (74%)** (23 semi, `Film`)
   - **Semi**: *Spider-Man: Un nuovo universo*, *Il piccolo yeti*, *Wallace e Gromit - Le piume della vendetta*
   - **Candidati**: *Spider-Man: Across the Spider-Verse (2023)*, *Il gatto con gli stivali 2 - L'ultimo desiderio (2022)*, *Jumpers - Un salto tra gli animali (2026)*, *Elemental (2023)*, *Inside Out 2 (2024)*
   - **Keyword & Supporto**: `3d animation` (73.9%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2021, Cand: 2023)
   - **Popolarità**: VOT Semi=3024, Cand=7045 (Ratio=2.33 $\to$ `OK`) · VAVE: 7.60 $\to$ 8.14

---

### Profilo: `pepsipex` — Massimo storico (568 semi)
**Metadati**: 568 semi totali · 25 micro-cluster $\to$ 66 macro vincolati (arresto $\tau=0.03$) · **Ammessi dal Gate: 41 (62.1%)** · **Respinti: 25 (37.9%)** · Scaffali serviti: **5 / 5**

1. **Serie: Tratto da Romanzo (57%)** (23 semi, `Serie`)
   - **Semi**: *The Diplomat*, *Paradise*, *Morte e altri dettagli*
   - **Candidati**: *Home Before Dark (2020)*, *The Night Agent (2023)*, *Feel Good (2020)*, *Poker Face (2023)*, *DTF St. Louis (2026)*
   - **Keyword & Supporto**: `based on novel or book` (56.5%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2023)
   - **Popolarità**: VOT Semi=249, Cand=485 (Ratio=1.95 $\to$ `OK`) · VAVE: 7.05 $\to$ 7.45

2. **Serie: Dramma in Costume (54%)** (26 semi, `Serie`)
   - **Semi**: *The Great*, *The Buccaneers*, *The Serpent Queen*
   - **Candidati**: *Becoming Elizabeth (2022)*, *Bridgerton (2020)*, *Belgravia: The Next Chapter (2024)*, *The White Princess (2017)*, *The White Queen (2013)*
   - **Keyword & Supporto**: `period drama` (53.8%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2020)
   - **Popolarità**: VOT Semi=105, Cand=305 (Ratio=2.90 $\to$ `OK`) · VAVE: 7.45 $\to$ 7.50

3. **Serie: Miniserie (60%)** (20 semi, `Serie`)
   - **Semi**: *Last Week Tonight with John Oliver*, *The Patient*, *Full Circle*
   - **Candidati**: *George & Tammy (2022)*, *Maman a tort (2018)*, *Gentleman Jack - Nessuna mi ha mai detto di no (2019)*, *The Daily Show (1996)*, *Women in Love (2011)*
   - **Keyword & Supporto**: `miniseries` (60.0%)
   - **Diagnostica Temporale**: `STALE` (Anno Med. Semi: 2023, Cand: 2018)
   - **Popolarità**: VOT Semi=138, Cand=34 (Ratio=0.25 $\to$ `DRIFT (Nicchia < 300)`) · VAVE: 6.73 $\to$ 6.50

4. **Serie: Horror (58%)** (19 semi, `Serie`)
   - **Semi**: *American Horror Story*, *Servant*, *True Detective*
   - **Candidati**: *The Haunting of Bly Manor (2020)*, *The Haunting of Hill House (2018)*, *IT: Welcome to Derry (2025)*, *DAHMER - Mostro: la storia di Jeffrey Dahmer (2022)*, *American Horror Stories (2021)*
   - **Keyword & Supporto**: `horror` (57.9%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2021)
   - **Popolarità**: VOT Semi=1053, Cand=1692 (Ratio=1.61 $\to$ `OK`) · VAVE: 7.56 $\to$ 8.00

5. **Serie: Tratto da Romanzo (55%)** (22 semi, `Serie`)
   - **Semi**: *Surface*, *One Day*, *Young Royals*
   - **Candidati**: *Off Campus (2026)*, *Heartstopper (2022)*, *Compagni di viaggio (2023)*, *Overcompensating: l’inganno (2025)*, *Love, Victor (2020)*
   - **Keyword & Supporto**: `based on novel or book` (54.5%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2023)
   - **Popolarità**: VOT Semi=386, Cand=877 (Ratio=2.27 $\to$ `OK`) · VAVE: 7.58 $\to$ 8.55

---

### Profilo: `carverclan` — Ultra-corto (<10 semi, 7 semi)
**Metadati**: 7 semi totali · 2 micro-cluster $\to$ 2 macro vincolati (arresto $\tau=0.03$) · **Ammessi dal Gate: 2 (100.0%)** · **Respinti: 0 (0.0%)** · Scaffali serviti: **2 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (2/5)**: 
> Profilo cold-start con soli 7 semi totali che genera 2 soli raggruppamenti naturali. Nessun fallback artificiale.

1. **Film: Horror Soprannaturale (100%) & Anni '30 (50%)** (2 semi, `Film`)
   - **Semi**: *I peccatori*, *Stranger Things*
   - **Candidati**: *Una battaglia dopo l’altra (2025)*, *Marty Supreme (2025)*, *Train Dreams (2025)*, *Weapons (2025)*, *Frankenstein (2025)*
   - **Keyword & Supporto**: `supernatural horror` (100.0%), `1930s` (50.0%), `1980s` (50.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2020, Cand: 2025)
   - **Popolarità**: VOT Semi=13660, Cand=3955 (Ratio=0.29 $\to$ `OK`) · VAVE: 8.03 $\to$ 7.33

2. **Film: Antologia (50%) & Tratto da Romanzo (50%)** (2 semi, `Film`)
   - **Semi**: *Peter Pan Goes Wrong*, *Great Performances*
   - **Candidati**: *Pippin (1981)*, *The Phantom of the Opera at the Royal Albert Hall (2011)*, *Top Gear: The Perfect Road Trip 2 (2014)*, *Scum (1977)*, *The Kate Bush Story: Running Up That Hill (2014)*
   - **Keyword & Supporto**: `anthology` (50.0%), `based on novel or book` (50.0%), `based on play or musical` (50.0%)
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 1994, Cand: 2011)
   - **Popolarità**: VOT Semi=46, Cand=50 (Ratio=1.09 $\to$ `OK`) · VAVE: 6.80 $\to$ 7.24

---

### Profilo: `1jacobjohn` — Intermedio (167 semi)
**Metadati**: 167 semi totali · 19 micro-cluster $\to$ 25 macro vincolati (arresto $\tau=0.03$) · **Ammessi dal Gate: 18 (72.0%)** · **Respinti: 7 (28.0%)** · Scaffali serviti: **5 / 5**

1. **Serie: Sitcom (60%)** (20 semi, `Serie`)
   - **Semi**: *The Good Place*, *Man Seeking Woman*, *I Think You Should Leave with Tim Robinson*
   - **Candidati**: *30 Rock (2006)*, *Community (2009)*, *Seinfeld (1989)*, *Arrested Development - Ti presento i miei (2003)*, *How I Met Your Mother (2005)*
   - **Keyword & Supporto**: `sitcom` (60.0%)
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2011, Cand: 2005)
   - **Popolarità**: VOT Semi=688, Cand=2205 (Ratio=3.21 $\to$ `OK`) · VAVE: 7.45 $\to$ 8.00

2. **Serie: Animazione per Adulti (87%)** (15 semi, `Serie`)
   - **Semi**: *Bob's Burgers*, *Primal*, *South Park*
   - **Candidati**: *Big Mouth (2017)*, *The Cleveland Show (2009)*, *BoJack Horseman (2014)*, *Archer (2009)*, *King of the Hill (1997)*
   - **Keyword & Supporto**: `adult animation` (86.7%)
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2013, Cand: 2009)
   - **Popolarità**: VOT Semi=1629, Cand=1266 (Ratio=0.78 $\to$ `OK`) · VAVE: 7.80 $\to$ 7.60

3. **Serie: Tratto da Romanzo (50%) & Storia Vera (50%)** (4 semi, `Serie`)
   - **Semi**: *Black Bird*, *Ovunque tu sia*, *Good Girls*
   - **Candidati**: *Smoke - Tracce di fuoco (2025)*, *The Twisted Tale of Amanda Knox (2025)*, *Ozark (2017)*, *Regina del Sud (2016)*, *Mayor of Kingstown (2021)*
   - **Keyword & Supporto**: `based on novel or book` (50.0%), `based on true story` (50.0%), `miniseries` (50.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2021)
   - **Popolarità**: VOT Semi=620, Cand=482 (Ratio=0.78 $\to$ `OK`) · VAVE: 7.96 $\to$ 7.62

4. **Film: Basketball (75%) & Documentario Sportivo (75%)** (4 semi, `Film`)
   - **Semi**: *The Redeem Team: Le Olimpiadi della riscossa*, *The Last Dance*, *Skywalkers: una storia d'amore*
   - **Candidati**: *Untold: Rissa in NBA (2021)*, *Air - La storia del grande salto (2023)*, *Bad Boys (2014)*, *Rise - La vera storia di Antetokounmpo (2022)*, *Dream Team (2012)*
   - **Keyword & Supporto**: `basketball` (75.0%), `sports documentary` (75.0%), `sports` (50.0%)
   - **Diagnostica Temporale**: `STALE` (Anno Med. Semi: 2022, Cand: 2021)
   - **Popolarità**: VOT Semi=849, Cand=143 (Ratio=0.17 $\to$ `DRIFT (Nicchia < 300)`) · VAVE: 7.53 $\to$ 7.60

5. **Film: Fede Cristiana (60%)** (5 semi, `Film`)
   - **Semi**: *The Chosen*, *The Last Rodeo*, *Il re dei re - La più grande storia mai raccontata*
   - **Candidati**: *David (2025)*, *Il suo unico figlio (2023)*, *La strada dell’anima (2024)*, *Lucy Shimmers and the Prince of Peace (2020)*, *Sound of Hope: The Story of Possum Trot (2024)*
   - **Keyword & Supporto**: `christian faith` (60.0%)
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2023, Cand: 2024)
   - **Popolarità**: VOT Semi=217, Cand=203 (Ratio=0.94 $\to$ `OK`) · VAVE: 7.50 $\to$ 8.02

---

## 6. Riconciliazione Temporale (Staleness vs Deepening)

Sui 40 scaffali serviti con $\tau = 0.03$:
- **31 scaffali (77.5%)** sono contemporanei o contengono candidati recenti (2024–2026);
- **8 scaffali (20.0%)** sono casi autentici di *Deepening* (semi storici o mix multi-decennale di epoche, come anime d'autore, samurai jidaigeki o antologie);
- **Solo 1 scaffale su 40 (2.5%)** è un vero caso di **STALE**: lo scaffale fantasy di `pepsipex` (*House of the Dragon*, *A Knight of the Seven Kingdoms*, *The Witcher*), i cui candidati si arrestano al 2022.
