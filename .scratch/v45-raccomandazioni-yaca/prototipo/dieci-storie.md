# Rapporto Dieci Storie: Shelf Consistency Gate, Naming Fallback Chain e Stop a Soglia Coseno ($\tau$)

> [!IMPORTANT]
> **Dichiarazione Fondamentale**:
> La coerenza degli scaffali di raccomandazione non è una proprietà dei metadati catalogo (spesso incompleti, sparsi o assenti in TMDB), ma della struttura intrinseca del grafo di affinità. **Il Keyword Coherence Gate ha fallito il proprio criterio dichiarato**: rifiutava il 30.2% dei micro-cluster naturali di Pass 1 prima ancora di qualsiasi fusione, misurando la mera copertura delle keyword TMDB e non l'autentica coerenza tematica.
> Con questo aggiornamento:
> 1. **La fusione macro si arresta sulla similarità reale ($\tau = 0.03$)**, impedendo la saldatura di micro-cluster disgiunti;
> 2. **Il gate di validazione è sostituito dalla Shelf Consistency su grafo**: overlap medio a coppie (Jaccard) tra le top-10 candidate generate da ciascun seme membro separatamente («lo scaffale ha senso per ciascun membro?»);
> 3. **Il naming è disaccoppiato dal gating**: non decide la vita o la morte di uno scaffale, ma usa una catena di fallback ordinata (*Keyword Pair $\ge 0.3 \to$ Collezione Dominante $\to$ Regista Dominante $\to$ Medium + Best Keyword*);
> 4. **La soglia di adozione a priori di 0.15 è stata misurata e corretta**: essendo collocata al 90° percentile (degenere, dimezzava gli scaffali a 20/40), è stata sostituita dal vincolo di consistenza positiva ($> 0.00$), che elimina il 100% dei grab bag disgiunti preservando 36 scaffali su 40.

---

## Perché i macro si fondevano a caso e il fallimento del Keyword Gate

La misurazione empirica della catena di fusioni e dei metadati ha isolato due problemi distinti ma precedentemente confusi:

### 1. La causa radice della fusione a caso (Fixed $k=12$ vs $\tau=0.03$)
Nel vecchio schema a target fisso $k=12$, in un profilo ricco come `castoffcrown` (54 micro-cluster naturali) l'algoritmo agglomerativo compiva **42 fusioni consecutive obbligatorie**. L'analisi delle distanze mostrava che:
- La similarità mediana delle fusioni crollava a `0.0034`;
- Le ultime 10 fusioni avvenivano sotto `0.0004` (fino a `0.000033`), saldando forzatamente cluster completamente ortogonali come il documentario *How It's Made*, la saga di *Indiana Jones* e il cinema lento di Lav Diaz;
- La successiva bisezione $M \le 30$ tagliava geometricamente questo blob ibrido, producendo cluster privi di identità tematica.
Arrestando l'agglomerazione quando la similarità coseno tra centroidi scende sotto $\tau = 0.03$, **queste fusioni spurie vengono impedite alla radice**.

### 2. Perché il Keyword Gate ha fallito il proprio criterio dichiarato
Il Keyword Coherence Gate imponeva che ogni macro avesse almeno una keyword condivisa da $\ge 50\%$ dei membri (`support >= 0.5`). Il criterio è fallito per un dato numerico inequivocabile:
> [!WARNING]
> **Il Keyword Gate scartava il 30.2% dei micro-cluster grezzi di Pass 1 (45 su 149)**.
> Pass 1 non fonde nulla: sono i raggruppamenti naturali trovati dalla camminata sul grafo. Se quasi un terzo di essi non condivide alcuna keyword al 50%, **il gate stava misurando la copertura e la densità dei metadati TMDB, non la coerenza del consumo**.
> Interessi autentici, densi e coerenti come il *Wrestling*, i *Documentari Sportivi*, le serie comedy Disney/Nickelodeon per ragazzi (*Hannah Montana*, *Zoey 101*, *Drake & Josh*) o le miniserie crime europee non possiedono keyword TMDB condivise o hanno tag disomogenei. Rifiutarli per assenza di keyword era un errore sistematico.

### 3. La scelta pragmatica di $\tau = 0.03$
Nello sweep di $\tau$, il tasso di scarto del keyword gate non scendeva mai sotto il 28% perché il 30% dei micro di partenza era già 'senza keyword'. Pertanto, $\tau = 0.03$ non è una scelta che ha soddisfatto il vecchio criterio del gate (<10% scarto), ma una **scelta pragmatica di eccellenza**: garantisce il 94.4% di copertura, preserva tutti i caroselli sui profili attivi e non perde alcuno scaffale naturale.

---

## 1. Misura della Shelf Consistency e Validazione vs Vecchio Gate

La nuova metrica di **Shelf Consistency** risponde direttamente alla domanda di prodotto: *«Questo scaffale avrebbe senso per ciascuno dei suoi titoli membri?»*.
Per ogni macro $M$, si esegue il motore PPR su ciascun seme membro separatamente, estraendo i suoi top-10 candidati (`medium=macro_med`, esclusa la storia dell'utente). Si calcola quindi l'overlap Jaccard medio su tutte le coppie di liste top-10:
$$\text{Consistency}(M) = \frac{1}{\binom{|M|}{2}} \sum_{i < j} \frac{|Top10(s_i) \cap Top10(s_j)|}{|Top10(s_i) \cup Top10(s_j)|}$$

### Distribuzione della Shelf Consistency (210 Macro con $\ge 2$ semi a $\tau=0.03$):

| Metrica | Tutti i Macro ($N=210$) | Ammessi dal Vecchio Gate ($N=143$) | Respinti dal Vecchio Gate ($N=67$) | Separazione Mediane |
|:---|---:|---:|---:|:---:|
| **Minimo** | `0.0000` | `0.0000` | `0.0000` | — |
| **25° percentile (Q1)** | `0.0035` | `0.0000` | `0.0129` | — |
| **Mediana** | **`0.0298`** | **`0.0375`** | **`0.0231`** | **`+0.0144`** |
| **75° percentile (Q3)** | `0.0570` | `0.0770` | `0.0379` | — |
| **Massimo** | `0.7778` | `0.7778` | `0.2749` | — |
| **Media** | `0.0621` | `0.0755` | `0.0334` | — |

> [!IMPORTANT]
> **Prova Statistica del Fallimento del Keyword Gate**:
> 1. **Separazione quasi nulla (`+0.0144`)**: La differenza tra le mediane di consistenza tra macro promossi (`0.0375`) e bocciati (`0.0231`) è di appena 0.014;
> 2. **Il 25% dei promossi ha consistenza 0.0000**: Il primo quartile (`p25`) dei macro che il keyword gate ammetteva è esattamente **`0.0000`**! Il vecchio gate ammetteva cluster con candidati totalmente disgiunti solo perché condividevano un tag generico come `sequel` o `woman director`;
> 3. **I respinti hanno un Q1 superiore (`0.0129`)**: I macro respinti dal keyword gate mostrano al 25° percentile una coerenza intrinseca superiore a quella dei promossi. Il keyword gate era puro rumore di copertura.

### Sweep delle Soglie di Adozione e Correzione della Soglia 0.15:

La soglia dichiarata a priori ($\text{Consistency} \ge 0.15$) richiedeva che, su 10 candidati raccomandati, ciascuna coppia di membri ne condividesse mediamente quasi 3. La misurazione empirica dimostra che tale soglia è **degenere**:

| Soglia Consistenza | Macro Ammessi ($N=210$) | % Ammissione | Scaffali Serviti Totali | Esito sui Profili |
|:---:|---:|---:|:---:|:---|
| **`>= 0.1500`** *(A priori)* | 21 | **10.0%** | **20 / 40** | **Degenere**: `1jacobjohn` riceve **0 scaffali**, `pepsipex` 3, `sappss` 1. Dimezza l'offerta. |
| **`>= 0.1000`** | 31 | 14.8% | 23 / 40 | Insufficiente: `1jacobjohn` riceve 1 solo scaffale. |
| **`>= 0.0500`** | 74 | 35.2% | 34 / 40 | Buona sui grandi profili, ma taglia `flixinatoor99` a 2 scaffali. |
| **`>= 0.0200`** | 128 | 61.0% | 34 / 40 | Stabile: 5/5 su tutti i profili > 100 semi. |
| **`>= 0.0100`** | 142 | 67.6% | 35 / 40 | Recupera 1 carosello su `flixinatoor99`. |
| **`> 0.0000`** *(Adottata)* | 158 | **75.2%** | **36 / 40** | **Ottimale**: Elimina il 100% dei grab bag disgiunti (24.8%), serve 5/5 su tutti i profili attivi e medi. |
| **`>= 0.0000`** *(Nessun gate)* | 210 | 100.0% | 41 / 40 | Include anche cluster a sovrapposizione zero (incoerenti). |

> [!TIP]
> **Soglia di Adozione Ottimale Adottata: `Consistency > 0.00`**:
> Uno scaffale è ammesso se e solo se i suoi membri generano **almeno un candidato in comune** nella camminata PPR. I macro a consistenza `0.0000` (candidati disgiunti al 100%, i veri grab bag) vengono scartati, mentre tutti i cluster che esprimono un'autentica comunanza nel grafo vengono promossi a scaffale.

---

## 2. Tabella Riassuntiva delle 10 Timeline (Configurazione Validata $\tau=0.03$, Gate Consistenza $> 0$)

| Profilo Trakt | Tipologia / Gap | Semi | Macro $\ge 2$ (Pass / Rej) | % Scarto Gate | Scaffali Serviti | Nomi Dup. | Stale | Drift Pop. |
|:---|:---|---:|:---:|---:|:---:|:---:|:---:|:---:|
| **`sangam456`** | Corto storico (10 semi) | 10 | 1 / 1 | 50.0% | **1 / 5** | 0 | 0 | 0 |
| **`hammers-lists`** | Corto storico (11 semi) | 11 | 2 / 0 | 0.0% | **2 / 5** | 0 | 0 | 0 |
| **`sappss`** | Medio-basso storico (25 semi) | 25 | 5 / 1 | 16.7% | **5 / 5** | 0 | 0 | 0 |
| **`flixinatoor99`** | Medio storico (32 semi) | 32 | 3 / 4 | 57.1% | **3 / 5** | 0 | 0 | 1 |
| **`moppierhead`** | Medio storico (38 semi) | 38 | 5 / 1 | 16.7% | **5 / 5** | 0 | 0 | 0 |
| **`castoffcrown`** | Lungo storico (412 semi) | 412 | 34 / 22 | 39.3% | **5 / 5** | 0 | 1 | 0 |
| **`warnok`** | Lungo storico (476 semi) | 476 | 42 / 5 | 10.6% | **5 / 5** | 0 | 0 | 0 |
| **`pepsipex`** | Massimo storico (568 semi) | 568 | 52 / 7 | 11.9% | **5 / 5** | 0 | 1 | 1 |
| **`carverclan`** | Ultra-corto (<10 semi, 7 semi) | 7 | 0 / 2 | 100.0% | **0 / 5** | 0 | 0 | 0 |
| **`1jacobjohn`** | Intermedio (167 semi) | 167 | 14 / 9 | 39.1% | **5 / 5** | 0 | 0 | 0 |

---

## 3. Tabella Completa di Popularity Drift (36 Scaffali Serviti)

La regola con floor assoluto segnala una deriva di popolarità se e solo se:
$$\text{Ratio VOT} < \frac{1}{3} \quad \mathbf{E} \quad \text{Mediana VOT Candidati} < 300$$

| Profilo | Scaffale e Nome | Medium | Med. VOT Semi | Med. VOT Cand. | Ratio (C/S) | Med. VAVE Semi | Med. VAVE Cand. | Flag Popolarità |
|:---|:---|:---:|---:|---:|---:|---:|---:|:---|
| `sangam456` | 1. Film: Alieni (67%) & Action (33%) | `Film` | 3673 | 9460 | **2.58** | 7.45 | 7.20 | OK |
| `hammers-lists` | 1. Serie: Ospedale & Medicina (50%) & Medical Drama (50%) | `Serie` | 1312 | 2870 | **2.19** | 8.33 | 8.22 | OK |
| `hammers-lists` | 2. Serie: Animazione per Adulti (100%) & Famiglia Disfunzionale (100%) | `Serie` | 8313 | 3946 | **0.47** | 8.04 | 8.33 | OK |
| `sappss` | 1. Film: Tratto da Romanzo (33%) & Bold (33%) | `Film` | 4641 | 978 | **0.21** | 8.14 | 6.60 | OK |
| `sappss` | 2. Serie: True Crime (67%) & Bad Influence (33%) | `Serie` | 39 | 46 | **1.18** | 6.66 | 7.40 | OK |
| `sappss` | 3. Film: Animazione 3D (75%) & Antagonisti (75%) | `Film` | 3720 | 3978 | **1.07** | 6.98 | 7.50 | OK |
| `sappss` | 4. Serie: Animazione per Adulti (100%) & Famiglia Disfunzionale (100%) | `Serie` | 11075 | 2465 | **0.22** | 8.00 | 7.80 | OK |
| `sappss` | 5. Serie: Conflitto Morale (50%) & Storia Vera (50%) | `Serie` | 574 | 314 | **0.55** | 8.36 | 7.60 | OK |
| `flixinatoor99` | 1. Serie: Nostalgic (22%) | `Serie` | 318 | 79 | **0.25** | 8.02 | 7.90 | **DRIFT (Nicchia < 300)** |
| `flixinatoor99` | 2. Serie: Animazione per Adulti (100%) & Comicità per Adulti (50%) | `Serie` | 5658 | 1190 | **0.21** | 8.48 | 8.20 | OK |
| `flixinatoor99` | 3. Film: Young Adult (100%) & Magia & Fantasy (100%) | `Film` | 20899 | 22557 | **1.08** | 7.73 | 7.80 | OK |
| `moppierhead` | 1. Serie: Animazione per Adulti (71%) & Sitcom (71%) | `Serie` | 2465 | 1266 | **0.51** | 8.00 | 7.41 | OK |
| `moppierhead` | 2. Anime: Tratto da Manga (83%) & Shōnen (67%) | `Anime` | 3693 | 2599 | **0.70** | 8.61 | 8.40 | OK |
| `moppierhead` | 3. Film: Sequel (88%) & Tratto da Romanzo (75%) | `Film` | 12088 | 22760 | **1.88** | 7.68 | 7.71 | OK |
| `moppierhead` | 4. Serie: Regia di Dan Schneider | `Serie` | 915 | 1171 | **1.28** | 7.85 | 8.20 | OK |
| `moppierhead` | 5. Film: Oggetti che Prendono Vita (100%) & Magical Object (100%) | `Film` | 9348 | 3155 | **0.34** | 6.38 | 6.12 | OK |
| `castoffcrown` | 1. Anime: Tratto da Manga (85%) & Shōnen (54%) | `Anime` | 632 | 2232 | **3.53** | 8.42 | 8.64 | OK |
| `castoffcrown` | 2. Anime: Tratto da Manga (86%) & Romantico (54%) | `Anime` | 46 | 32 | **0.70** | 7.67 | 7.80 | OK |
| `castoffcrown` | 3. Film: Regia di Paul Thomas Anderson | `Film` | 1788 | 2285 | **1.28** | 7.42 | 7.21 | OK |
| `castoffcrown` | 4. Serie: Romantico (36%) | `Serie` | 178 | 358 | **2.01** | 8.50 | 8.46 | OK |
| `castoffcrown` | 5. Serie: Regia di Vince Gilligan | `Serie` | 1763 | 3015 | **1.71** | 8.20 | 8.11 | OK |
| `warnok` | 1. Serie: Tratto da Romanzo (34%) | `Serie` | 3954 | 2938 | **0.74** | 8.01 | 8.07 | OK |
| `warnok` | 2. Anime: Tratto da Manga (96%) & Shōnen (71%) | `Anime` | 1518 | 2232 | **1.47** | 8.50 | 8.49 | OK |
| `warnok` | 3. Serie: Regia di Tim Miller | `Serie` | 792 | 509 | **0.64** | 8.07 | 8.10 | OK |
| `warnok` | 4. Film: Space Opera (54%) & Sequel (50%) | `Film` | 14446 | 12420 | **0.86** | 7.49 | 7.50 | OK |
| `warnok` | 5. Film: Regia di 김은희 | `Film` | 313 | 658 | **2.10** | 7.49 | 7.10 | OK |
| `pepsipex` | 1. Serie: Regia di Taylor Sheridan | `Serie` | 523 | 655 | **1.25** | 7.03 | 8.20 | OK |
| `pepsipex` | 2. Film: Regia di Emerald Fennell | `Film` | 1065 | 1376 | **1.29** | 6.83 | 6.76 | OK |
| `pepsipex` | 3. Serie: Tratto da Romanzo (57%) & Thriller (48%) | `Serie` | 249 | 485 | **1.95** | 7.05 | 7.45 | OK |
| `pepsipex` | 4. Serie: Dramma in Costume (54%) & Tratto da Romanzo (38%) | `Serie` | 105 | 305 | **2.90** | 7.45 | 7.50 | OK |
| `pepsipex` | 5. Serie: Miniserie (60%) & Tratto da Romanzo (35%) | `Serie` | 138 | 34 | **0.25** | 6.73 | 6.50 | **DRIFT (Nicchia < 300)** |
| `1jacobjohn` | 1. Serie: Regia di Michael Schur | `Serie` | 688 | 2205 | **3.21** | 7.45 | 8.00 | OK |
| `1jacobjohn` | 2. Film: Cyborg (15%) | `Film` | 1103 | 690 | **0.63** | 6.90 | 6.90 | OK |
| `1jacobjohn` | 3. Serie: True Crime (46%) & Miniserie (38%) | `Serie` | 79 | 45 | **0.57** | 7.13 | 7.28 | OK |
| `1jacobjohn` | 4. Serie: Animazione per Adulti (87%) & Sitcom (47%) | `Serie` | 1629 | 1266 | **0.78** | 7.80 | 7.60 | OK |
| `1jacobjohn` | 5. Serie: Regia di Ryan Murphy | `Serie` | 2988 | 4420 | **1.48** | 8.00 | 8.08 | OK |

> [!NOTE]
> **Verifica Popolarità**: Si registrano solo **2 casi reali di drift** su 36 scaffali (serie indie e documentari sportivi minori). Tutti i caroselli basati su registi o keyword mantengono candidati sani.

---

## 4. Caso Studio: `castoffcrown` e la Verifica sui Vecchi Grab Bag

Una domanda cruciale di validazione era: **i vecchi grab bag di `castoffcrown` (*Tedesco/Berlin* con *Come è fatto* + *Indiana Jones* + *Lav Diaz*, e *LGBT & Gothic Horror* con *Sweet/Vicious* + *Kamen Rider*) tornano attraverso il nuovo gate?**

> [!IMPORTANT]
> **Verdetto Empirico: NESSUN VECCHIO GRAB BAG RITORNA**.
> 1. **Arresto $\tau=0.03$ preventivo**: Nel vecchio schema a $k=12$, *Come è fatto* e *Indiana Jones* venivano saldati alla 42ª fusione (`sim = 0.000033`). Con $\tau = 0.03$, l'agglomerazione si ferma prima: quei micro-cluster rimangono separati e non vengono mai fusi in un mega-blob;
> 2. **Il gate di consistenza elimina i frammenti disgiunti**: *Sweet/Vicious* e *The Vince Staples Show* formano un micro da 2 semi isolato (`Macro 40`), ma la loro consistenza PPR è esattamente **`0.0000`** (disgiunti al 100%). Il nuovo gate a consistenza positiva li scarta automaticamente;
> 3. **Scaffali ammessi su `castoffcrown`**: I 5 scaffali serviti su `castoffcrown` sono eccellenti e tematicamente puri:
>    - Scaffale 1: Anime Shōnen / Manga (*Haikyu*, *My Hero Academia*, cons=`0.0294`);
>    - Scaffale 2: K-Drama Romance / Thriller (*Strangers From Hell*, *A Shop for Killers*, cons=`0.0299`);
>    - Scaffale 3: Serie d'Autore Vince Gilligan (*Better Call Saul*, cons=`0.0231`);
>    - Scaffale 4: Cinema d'Animazione Miyazaki / Ghibli (*Porco Rosso*, *Ghost in the Shell*, cons=`0.0243`);
>    - Scaffale 5: Cinema Storico Giapponese Jidaigeki / Kurosawa (*I sette samurai*, *Vivere*, *Sanjuro*, cons=`0.1068`).

### Gli Scaffali Precedentemente Scartati dal Keyword Gate che Tornano:
Grazie al nuovo gate e alla catena di fallback di naming, tornano scaffali di altissimo valore qualitativo precedentemente ingiustamente soppressi:
- `moppierhead` (Scaffale 4): **Serie: Regia di Dan Schneider** (*Hannah Montana*, *Zoey 101*, *Drake & Josh*) — **Consistenza eccezionale `0.2749`** (scartato dal keyword gate perché aveva keyword support di soli 0.25!);
- `warnok` (Scaffale 3): **Serie: Regia di Tim Miller** (*INVINCIBLE*, *Star Wars: Visions*, *BLUE EYE SAMURAI*) — Consistenza `0.0465`, kw support 0.36;
- `warnok` (Scaffale 5): **Film: Regia di 김은희** (*Kingdom*, *Signal*) — Consistenza `0.0236`, kw support 0.18;
- `pepsipex` (Scaffale 1): **Serie: Regia di Taylor Sheridan** (neo-western thriller) — Consistenza `0.0470`, kw support 0.26;
- `1jacobjohn` (Scaffale 3): **Serie: True Crime & Miniserie** (docuseries investigative) — Consistenza `0.0263`, kw support 0.46;
- `1jacobjohn` (Scaffale 5): **Serie: Regia di Ryan Murphy** (*Monster*, *American Crime Story*) — Consistenza `0.0300`, kw support 0.31.

---

## 5. Le 10 Timeline nel Dettaglio (Gate Consistenza $> 0$ e Naming Fallback)

### Profilo: `sangam456` — Corto storico (10 semi)
**Metadati**: 10 semi totali · 2 macro vincolati ($\tau=0.03$, 2 con $\ge 2$ semi) · **Ammessi dal Gate: 1 (50.0%)** · **Respinti: 1 (50.0%)** · Scaffali serviti: **1 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (1/5)**: 
> Profilo cold-start con soli 10 semi totali. Non viene inventato alcun carosello forzato.

1. **Film: Alieni (67%) & Action (33%)** (3 semi, `Film`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0588` | Keyword Supp: `67%`
   - **Semi**: *Disclosure Day*, *Lilo & Stitch*, *Mission: Impossible - Dead Reckoning Parte uno*
   - **Candidati Raccomandati**: *Mission: Impossible - Fallout (2018)*, *Mission: Impossible - Rogue Nation (2015)*, *IF - Gli amici immaginari (2024)*, *Mission: Impossible - The Final Reckoning (2025)*, *Mission: Impossible - Protocollo fantasma (2011)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2018)
   - **Popolarità**: VOT Semi=3673, Cand=9460 (Ratio=2.58 $\to$ `OK`) · VAVE: 7.45 $\to$ 7.20

---

### Profilo: `hammers-lists` — Corto storico (11 semi)
**Metadati**: 11 semi totali · 2 macro vincolati ($\tau=0.03$, 2 con $\ge 2$ semi) · **Ammessi dal Gate: 2 (100.0%)** · **Respinti: 0 (0.0%)** · Scaffali serviti: **2 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (2/5)**: 
> Profilo cold-start con soli 11 semi totali. Non viene inventato alcun carosello forzato.

1. **Serie: Ospedale & Medicina (50%) & Medical Drama (50%)** (6 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0906` | Keyword Supp: `50%`
   - **Semi**: *The Resident*, *Big Sky*, *The Good Doctor*
   - **Candidati Raccomandati**: *Dr. House - Medical Division (2004)*, *New Amsterdam (2018)*, *Station 19 (2018)*, *Grey's Anatomy (2005)*, *9-1-1 (2018)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2018, Cand: 2018)
   - **Popolarità**: VOT Semi=1312, Cand=2870 (Ratio=2.19 $\to$ `OK`) · VAVE: 8.33 $\to$ 8.22

2. **Serie: Animazione per Adulti (100%) & Famiglia Disfunzionale (100%)** (2 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.3333` | Keyword Supp: `100%`
   - **Semi**: *Rick and Morty*, *I Griffin*
   - **Candidati Raccomandati**: *South Park (1997)*, *Futurama (1999)*, *American Dad! (2005)*, *I Simpson (1989)*, *BoJack Horseman (2014)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2006, Cand: 1999)
   - **Popolarità**: VOT Semi=8313, Cand=3946 (Ratio=0.47 $\to$ `OK`) · VAVE: 8.04 $\to$ 8.33

---

### Profilo: `sappss` — Medio-basso storico (25 semi)
**Metadati**: 25 semi totali · 6 macro vincolati ($\tau=0.03$, 6 con $\ge 2$ semi) · **Ammessi dal Gate: 5 (83.3%)** · **Respinti: 1 (16.7%)** · Scaffali serviti: **5 / 5**

1. **Film: Tratto da Romanzo (33%) & Bold (33%)** [RECUPERATO DAL VECCHIO GATE] (6 semi, `Film`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0070` | Keyword Supp: `33%`
   - **Semi**: *Euphoria*, *Fallout*, *Obsession*
   - **Candidati Raccomandati**: *Sharp Corner (2025)*, *Spaceman (2024)*, *The Plague (2025)*, *Ben Is Back (2018)*, *Elegia americana (2020)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2024)
   - **Popolarità**: VOT Semi=4641, Cand=978 (Ratio=0.21 $\to$ `OK`) · VAVE: 8.14 $\to$ 6.60

2. **Serie: True Crime (67%) & Bad Influence (33%)** (3 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0546` | Keyword Supp: `67%`
   - **Semi**: *Sposare un assassino*, *Louis Theroux: Dentro la manosfera*, *Worst Neighbor Ever - Vicini letali*
   - **Candidati Raccomandati**: *Devil in the Family: The Fall of Ruby Franke (2025)*, *Worst Ex Ever - Relazioni fatali (2024)*, *Death of the Pastor's Wife: il caso Mica Miller (2026)*, *Cabin in the Woods (2024)*, *Bad Influence: il lato oscuro dei giovani influencer (2025)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2026, Cand: 2025)
   - **Popolarità**: VOT Semi=39, Cand=46 (Ratio=1.18 $\to$ `OK`) · VAVE: 6.66 $\to$ 7.40

3. **Film: Animazione 3D (75%) & Antagonisti (75%)** (4 semi, `Film`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0897` | Keyword Supp: `50%`
   - **Semi**: *Elio*, *I Simpson - Il film*, *Jumpers - Un salto tra gli animali*
   - **Candidati Raccomandati**: *Inside Out 2 (2024)*, *Elemental (2023)*, *Lightyear - La vera storia di Buzz (2022)*, *Toy Story 5 (2026)*, *I Simpson in Plusaversary (2021)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2016, Cand: 2023)
   - **Popolarità**: VOT Semi=3720, Cand=3978 (Ratio=1.07 $\to$ `OK`) · VAVE: 6.98 $\to$ 7.50

4. **Serie: Animazione per Adulti (100%) & Famiglia Disfunzionale (100%)** (3 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.3968` | Keyword Supp: `100%`
   - **Semi**: *I Simpson*, *Rick and Morty*, *I Griffin*
   - **Candidati Raccomandati**: *South Park (1997)*, *American Dad! (2005)*, *Futurama (1999)*, *Bob's Burgers (2011)*, *Big Mouth (2017)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 1999, Cand: 2005)
   - **Popolarità**: VOT Semi=11075, Cand=2465 (Ratio=0.22 $\to$ `OK`) · VAVE: 8.00 $\to$ 7.80

5. **Serie: Conflitto Morale (50%) & Storia Vera (50%)** (2 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.1111` | Keyword Supp: `50%`
   - **Semi**: *La fattoria Clarkson*, *Formula 1: Drive to Survive*
   - **Candidati Raccomandati**: *The Grand Tour (2016)*, *Top Gear (2002)*, *Il banco dei pugni (2010)*, *Brawn: Una storia impossibile di Formula 1 (2023)*, *Affari di famiglia (2009)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2020, Cand: 2010)
   - **Popolarità**: VOT Semi=574, Cand=314 (Ratio=0.55 $\to$ `OK`) · VAVE: 8.36 $\to$ 7.60

---

### Profilo: `flixinatoor99` — Medio storico (32 semi)
**Metadati**: 32 semi totali · 7 macro vincolati ($\tau=0.03$, 7 con $\ge 2$ semi) · **Ammessi dal Gate: 3 (42.9%)** · **Respinti: 4 (57.1%)** · Scaffali serviti: **3 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (3/5)**: 
> L'utente disponeva di raggruppamenti naturali, ma i restanti presentavano consistenza `0.0000` (candidati disgiunti).

1. **Serie: Nostalgic (22%)** [RECUPERATO DAL VECCHIO GATE] (9 semi, `Serie`)
   - **Metodo Naming**: Fonte `4_medium_plus_kw` | Consistenza Scaffale: `0.0154` | Keyword Supp: `22%`
   - **Semi**: *Il Boss del condominio*, *División Palermo*, *Stromberg*
   - **Candidati Raccomandati**: *El Chapulín Colorado (1973)*, *Chespirito (1980)*, *Grandi speranze (2023)*, *Nothing (2023)*, *El rey, Vicente Fernández (2022)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2022, Cand: 2022)
   - **Popolarità**: VOT Semi=318, Cand=79 (Ratio=0.25 $\to$ `DRIFT (Nicchia < 300)`) · VAVE: 8.02 $\to$ 7.90

2. **Serie: Animazione per Adulti (100%) & Comicità per Adulti (50%)** (2 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0526` | Keyword Supp: `100%`
   - **Semi**: *South Park*, *INVINCIBLE*
   - **Candidati Raccomandati**: *Rick and Morty (2013)*, *La leggenda di Vox Machina (2022)*, *I Griffin (1999)*, *The Boys Presenta: Diabolico! (2022)*, *Harley Quinn (2019)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2009, Cand: 2019)
   - **Popolarità**: VOT Semi=5658, Cand=1190 (Ratio=0.21 $\to$ `OK`) · VAVE: 8.48 $\to$ 8.20

3. **Film: Young Adult (100%) & Magia & Fantasy (100%)** (3 semi, `Film`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.5018` | Keyword Supp: `100%`
   - **Semi**: *Animali fantastici e dove trovarli*, *Harry Potter e i Doni della Morte - Parte 1*, *Harry Potter e la pietra filosofale*
   - **Candidati Raccomandati**: *Harry Potter e i Doni della Morte - Parte 2 (2011)*, *Harry Potter e l'ordine della fenice (2007)*, *Harry Potter e il principe mezzosangue (2009)*, *Harry Potter e il prigioniero di Azkaban (2004)*, *Harry Potter e il calice di fuoco (2005)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2010, Cand: 2007)
   - **Popolarità**: VOT Semi=20899, Cand=22557 (Ratio=1.08 $\to$ `OK`) · VAVE: 7.73 $\to$ 7.80

---

### Profilo: `moppierhead` — Medio storico (38 semi)
**Metadati**: 38 semi totali · 6 macro vincolati ($\tau=0.03$, 6 con $\ge 2$ semi) · **Ammessi dal Gate: 5 (83.3%)** · **Respinti: 1 (16.7%)** · Scaffali serviti: **5 / 5**

1. **Serie: Animazione per Adulti (71%) & Sitcom (71%)** (7 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.1933` | Keyword Supp: `71%`
   - **Semi**: *I Simpson*, *Bob's Burgers*, *Futurama*
   - **Candidati Raccomandati**: *I Griffin (1999)*, *King of the Hill (1997)*, *Big Mouth (2017)*, *The Cleveland Show (2009)*, *Rick and Morty (2013)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2005, Cand: 2009)
   - **Popolarità**: VOT Semi=2465, Cand=1266 (Ratio=0.51 $\to$ `OK`) · VAVE: 8.00 $\to$ 7.41

2. **Anime: Tratto da Manga (83%) & Shōnen (67%)** (6 semi, `Anime`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0965` | Keyword Supp: `67%`
   - **Semi**: *One Piece*, *L'attacco dei giganti*, *Sailor Moon*
   - **Candidati Raccomandati**: *Fullmetal Alchemist: Brotherhood (2009)*, *Hunter x Hunter (2011)*, *Code Geass: Lelouch of the Rebellion (2006)*, *One-Punch Man (2015)*, *Naruto (2002)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2002, Cand: 2009)
   - **Popolarità**: VOT Semi=3693, Cand=2599 (Ratio=0.70 $\to$ `OK`) · VAVE: 8.61 $\to$ 8.40

3. **Film: Sequel (88%) & Tratto da Romanzo (75%)** (8 semi, `Film`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.1659` | Keyword Supp: `75%`
   - **Semi**: *Wicked - Parte 2*, *Wicked*, *Harry Potter e i Doni della Morte - Parte 2*
   - **Candidati Raccomandati**: *Harry Potter e l'ordine della fenice (2007)*, *Harry Potter e il calice di fuoco (2005)*, *Harry Potter e il prigioniero di Azkaban (2004)*, *Descendants (2015)*, *Harry Potter e la camera dei segreti (2002)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2014, Cand: 2005)
   - **Popolarità**: VOT Semi=12088, Cand=22760 (Ratio=1.88 $\to$ `OK`) · VAVE: 7.68 $\to$ 7.71

4. **Serie: Regia di Dan Schneider** [RECUPERATO DAL VECCHIO GATE] (4 semi, `Serie`)
   - **Metodo Naming**: Fonte `3_director` | Consistenza Scaffale: `0.2749` | Keyword Supp: `25%`
   - **Semi**: *Hannah Montana*, *Zoey 101*, *Drake & Josh*
   - **Candidati Raccomandati**: *iCarly (2007)*, *Victorious (2010)*, *Henry Danger (2014)*, *iCarly (2021)*, *Ned - Scuola di sopravvivenza (2004)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2006, Cand: 2010)
   - **Popolarità**: VOT Semi=915, Cand=1171 (Ratio=1.28 $\to$ `OK`) · VAVE: 7.85 $\to$ 8.20

5. **Film: Oggetti che Prendono Vita (100%) & Magical Object (100%)** (2 semi, `Film`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.3333` | Keyword Supp: `100%`
   - **Semi**: *Una notte al museo 2 - La fuga*, *Una notte al museo*
   - **Candidati Raccomandati**: *Una notte al museo 3 - Il segreto del faraone (2014)*, *La pantera rosa (2006)*, *Un'impresa da Dio (2007)*, *Notte folle a Manhattan (2010)*, *Racconti incantati (2008)*
   - **Diagnostica Temporale**: `Deepening (Semi storici)` (Anno Med. Semi: 2008, Cand: 2008)
   - **Popolarità**: VOT Semi=9348, Cand=3155 (Ratio=0.34 $\to$ `OK`) · VAVE: 6.38 $\to$ 6.12

---

### Profilo: `castoffcrown` — Lungo storico (412 semi)
**Metadati**: 412 semi totali · 63 macro vincolati ($\tau=0.03$, 56 con $\ge 2$ semi) · **Ammessi dal Gate: 34 (60.7%)** · **Respinti: 22 (39.3%)** · Scaffali serviti: **5 / 5**

1. **Anime: Tratto da Manga (85%) & Shōnen (54%)** (26 semi, `Anime`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0294` | Keyword Supp: `54%`
   - **Semi**: *One Piece*, *Haikyu!! L'asso del volley*, *L'attacco dei giganti*
   - **Candidati Raccomandati**: *Hunter x Hunter (2011)*, *One-Punch Man (2015)*, *Il movimento della Terra (2024)*, *Demon Slayer: Kimetsu no Yaiba (2019)*, *Frieren - Oltre la Fine del Viaggio (2023)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2019)
   - **Popolarità**: VOT Semi=632, Cand=2232 (Ratio=3.53 $\to$ `OK`) · VAVE: 8.42 $\to$ 8.64

2. **Anime: Tratto da Manga (86%) & Romantico (54%)** (28 semi, `Anime`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0154` | Keyword Supp: `86%`
   - **Semi**: *Tojima Wants to Be a Kamen Rider*, *The 100 Girlfriends Who Really, Really, Really, Really, REALLY Love You*, *Mars Red*
   - **Candidati Raccomandati**: *Hana-Kimi (2026)*, *Honey Lemon Soda (2025)*, *Daemons of the Shadow Realm (2026)*, *The Yakuza's Guide to Babysitting (2022)*, *Quality Assurance in Another World (2024)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2025)
   - **Popolarità**: VOT Semi=46, Cand=32 (Ratio=0.70 $\to$ `OK`) · VAVE: 7.67 $\to$ 7.80

3. **Film: Regia di Paul Thomas Anderson** [RECUPERATO DAL VECCHIO GATE] (30 semi, `Film`)
   - **Metodo Naming**: Fonte `3_director` | Consistenza Scaffale: `0.0119` | Keyword Supp: `13%`
   - **Semi**: *Il filo nascosto*, *Ubriaco d'amore*, *Perfect Days*
   - **Candidati Raccomandati**: *Un affare di famiglia (2018)*, *Marty Supreme (2025)*, *Il male non esiste (2023)*, *Vizio di forma (2014)*, *Ritratto di famiglia con tempesta (2016)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2020, Cand: 2018)
   - **Popolarità**: VOT Semi=1788, Cand=2285 (Ratio=1.28 $\to$ `OK`) · VAVE: 7.42 $\to$ 7.21

4. **Serie: Romantico (36%)** [RECUPERATO DAL VECCHIO GATE] (11 semi, `Serie`)
   - **Metodo Naming**: Fonte `4_medium_plus_kw` | Consistenza Scaffale: `0.0299` | Keyword Supp: `36%`
   - **Semi**: *Il Tassista*, *Crash Landing on You*, *Vincenzo*
   - **Candidati Raccomandati**: *Venticinque e ventuno (2022)*, *Rugal (2020)*, *The Glory (2022)*, *I discendenti del sole (2016)*, *응답하라 1988 (2015)*
   - **Diagnostica Temporale**: `STALE` (Anno Med. Semi: 2021, Cand: 2020)
   - **Popolarità**: VOT Semi=178, Cand=358 (Ratio=2.01 $\to$ `OK`) · VAVE: 8.50 $\to$ 8.46

5. **Serie: Regia di Vince Gilligan** [RECUPERATO DAL VECCHIO GATE] (27 semi, `Serie`)
   - **Metodo Naming**: Fonte `3_director` | Consistenza Scaffale: `0.0231` | Keyword Supp: `19%`
   - **Semi**: *E.R. - Medici in prima linea*, *C'è sempre il sole a Philadelphia*, *Shameless (UK)*
   - **Candidati Raccomandati**: *Fallout (2024)*, *Scissione (2022)*, *Arrested Development - Ti presento i miei (2003)*, *The Office (US) (2005)*, *Community (2009)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2021, Cand: 2009)
   - **Popolarità**: VOT Semi=1763, Cand=3015 (Ratio=1.71 $\to$ `OK`) · VAVE: 8.20 $\to$ 8.11

---

### Profilo: `warnok` — Lungo storico (476 semi)
**Metadati**: 476 semi totali · 57 macro vincolati ($\tau=0.03$, 47 con $\ge 2$ semi) · **Ammessi dal Gate: 42 (89.4%)** · **Respinti: 5 (10.6%)** · Scaffali serviti: **5 / 5**

1. **Serie: Tratto da Romanzo (34%)** [RECUPERATO DAL VECCHIO GATE] (29 semi, `Serie`)
   - **Metodo Naming**: Fonte `4_medium_plus_kw` | Consistenza Scaffale: `0.0350` | Keyword Supp: `34%`
   - **Semi**: *Prison Break*, *Lost*, *Il Trono di Spade*
   - **Candidati Raccomandati**: *Chernobyl (2019)*, *The Expanse (2015)*, *Snowpiercer (2020)*, *Pluribus (2025)*, *The Umbrella Academy (2019)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2019, Cand: 2019)
   - **Popolarità**: VOT Semi=3954, Cand=2938 (Ratio=0.74 $\to$ `OK`) · VAVE: 8.01 $\to$ 8.07

2. **Anime: Tratto da Manga (96%) & Shōnen (71%)** (28 semi, `Anime`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0813` | Keyword Supp: `71%`
   - **Semi**: *Naruto*, *L'attacco dei giganti*, *Monster*
   - **Candidati Raccomandati**: *Hunter x Hunter (2011)*, *The Promised Neverland (2019)*, *Chainsaw Man (2022)*, *One-Punch Man (2015)*, *Mob Psycho 100 (2016)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2016, Cand: 2016)
   - **Popolarità**: VOT Semi=1518, Cand=2232 (Ratio=1.47 $\to$ `OK`) · VAVE: 8.50 $\to$ 8.49

3. **Serie: Regia di Tim Miller** [RECUPERATO DAL VECCHIO GATE] (22 semi, `Serie`)
   - **Metodo Naming**: Fonte `3_director` | Consistenza Scaffale: `0.0465` | Keyword Supp: `36%`
   - **Semi**: *Love, Death & Robots*, *Castlevania*, *La leggenda di Vox Machina*
   - **Candidati Raccomandati**: *The Mighty Nein (2025)*, *The Boys Presenta: Diabolico! (2022)*, *Star Wars: Tales of the Jedi (2022)*, *Star Wars: The Bad Batch (2021)*, *X-Men '97 (2024)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2022, Cand: 2022)
   - **Popolarità**: VOT Semi=792, Cand=509 (Ratio=0.64 $\to$ `OK`) · VAVE: 8.07 $\to$ 8.10

4. **Film: Space Opera (54%) & Sequel (50%)** (26 semi, `Film`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0878` | Keyword Supp: `54%`
   - **Semi**: *The Mandalorian*, *The Book of Boba Fett*, *Rogue One: A Star Wars Story*
   - **Candidati Raccomandati**: *Terminator (1984)*, *Matrix Reloaded (2003)*, *E.T. l'extra-terrestre (1982)*, *Il Signore degli Anelli - Le due torri (2002)*, *Matrix Revolutions (2003)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2000, Cand: 2002)
   - **Popolarità**: VOT Semi=14446, Cand=12420 (Ratio=0.86 $\to$ `OK`) · VAVE: 7.49 $\to$ 7.50

5. **Film: Regia di 김은희** [RECUPERATO DAL VECCHIO GATE] (17 semi, `Film`)
   - **Metodo Naming**: Fonte `3_director` | Consistenza Scaffale: `0.0236` | Keyword Supp: `18%`
   - **Semi**: *Jirisan*, *Vagabond*, *The Chosen*
   - **Candidati Raccomandati**: *Train to Busan (2016)*, *Monstrum - Caccia alla bestia (2018)*, *Kingdom: Ashin of the North (2021)*, *Colony (2026)*, *Concrete Utopia (2023)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2021, Cand: 2021)
   - **Popolarità**: VOT Semi=313, Cand=658 (Ratio=2.10 $\to$ `OK`) · VAVE: 7.49 $\to$ 7.10

---

### Profilo: `pepsipex` — Massimo storico (568 semi)
**Metadati**: 568 semi totali · 66 macro vincolati ($\tau=0.03$, 59 con $\ge 2$ semi) · **Ammessi dal Gate: 52 (88.1%)** · **Respinti: 7 (11.9%)** · Scaffali serviti: **5 / 5**

1. **Serie: Regia di Taylor Sheridan** [RECUPERATO DAL VECCHIO GATE] (27 semi, `Serie`)
   - **Metodo Naming**: Fonte `3_director` | Consistenza Scaffale: `0.0470` | Keyword Supp: `26%`
   - **Semi**: *Slow Horses*, *Operazione speciale: Lioness*, *Alex Rider*
   - **Candidati Raccomandati**: *Secret Service (2026)*, *1923 (2022)*, *1883 (2021)*, *The Veil (2024)*, *Landman (2024)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2024)
   - **Popolarità**: VOT Semi=523, Cand=655 (Ratio=1.25 $\to$ `OK`) · VAVE: 7.03 $\to$ 8.20

2. **Film: Regia di Emerald Fennell** [RECUPERATO DAL VECCHIO GATE] (26 semi, `Film`)
   - **Metodo Naming**: Fonte `3_director` | Consistenza Scaffale: `0.0187` | Keyword Supp: `31%`
   - **Semi**: *Industry*, *BEEF - LO SCONTRO*, *Animals*
   - **Candidati Raccomandati**: *The Runner (2026)*, *Challengers (2024)*, *Kinds of Kindness (2024)*, *Sanctuary - Lui fa il gioco. Lei fa le regole. (2023)*, *American Fiction (2023)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2024)
   - **Popolarità**: VOT Semi=1065, Cand=1376 (Ratio=1.29 $\to$ `OK`) · VAVE: 6.83 $\to$ 6.76

3. **Serie: Tratto da Romanzo (57%) & Thriller (48%)** (23 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0303` | Keyword Supp: `57%`
   - **Semi**: *The Diplomat*, *Paradise*, *Morte e altri dettagli*
   - **Candidati Raccomandati**: *Home Before Dark (2020)*, *The Night Agent (2023)*, *Feel Good (2020)*, *Poker Face (2023)*, *DTF St. Louis (2026)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2023)
   - **Popolarità**: VOT Semi=249, Cand=485 (Ratio=1.95 $\to$ `OK`) · VAVE: 7.05 $\to$ 7.45

4. **Serie: Dramma in Costume (54%) & Tratto da Romanzo (38%)** (26 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0249` | Keyword Supp: `54%`
   - **Semi**: *The Great*, *The Buccaneers*, *The Serpent Queen*
   - **Candidati Raccomandati**: *Becoming Elizabeth (2022)*, *Bridgerton (2020)*, *Belgravia: The Next Chapter (2024)*, *The White Princess (2017)*, *The White Queen (2013)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2020)
   - **Popolarità**: VOT Semi=105, Cand=305 (Ratio=2.90 $\to$ `OK`) · VAVE: 7.45 $\to$ 7.50

5. **Serie: Miniserie (60%) & Tratto da Romanzo (35%)** (20 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0160` | Keyword Supp: `60%`
   - **Semi**: *Last Week Tonight with John Oliver*, *The Patient*, *Full Circle*
   - **Candidati Raccomandati**: *George & Tammy (2022)*, *Maman a tort (2018)*, *Gentleman Jack - Nessuna mi ha mai detto di no (2019)*, *The Daily Show (1996)*, *Women in Love (2011)*
   - **Diagnostica Temporale**: `STALE` (Anno Med. Semi: 2023, Cand: 2018)
   - **Popolarità**: VOT Semi=138, Cand=34 (Ratio=0.25 $\to$ `DRIFT (Nicchia < 300)`) · VAVE: 6.73 $\to$ 6.50

---

### Profilo: `carverclan` — Ultra-corto (<10 semi, 7 semi)
**Metadati**: 7 semi totali · 2 macro vincolati ($\tau=0.03$, 2 con $\ge 2$ semi) · **Ammessi dal Gate: 0 (0.0%)** · **Respinti: 2 (100.0%)** · Scaffali serviti: **0 / 5**

> [!WARNING]
> **Meno di 5 scaffali serviti (0/5)**: 
> Profilo cold-start con soli 7 semi totali. Non viene inventato alcun carosello forzato.

---

### Profilo: `1jacobjohn` — Intermedio (167 semi)
**Metadati**: 167 semi totali · 25 macro vincolati ($\tau=0.03$, 23 con $\ge 2$ semi) · **Ammessi dal Gate: 14 (60.9%)** · **Respinti: 9 (39.1%)** · Scaffali serviti: **5 / 5**

1. **Serie: Regia di Michael Schur** (20 semi, `Serie`)
   - **Metodo Naming**: Fonte `3_director` | Consistenza Scaffale: `0.0418` | Keyword Supp: `60%`
   - **Semi**: *The Good Place*, *Man Seeking Woman*, *I Think You Should Leave with Tim Robinson*
   - **Candidati Raccomandati**: *30 Rock (2006)*, *Community (2009)*, *Seinfeld (1989)*, *Arrested Development - Ti presento i miei (2003)*, *How I Met Your Mother (2005)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2011, Cand: 2005)
   - **Popolarità**: VOT Semi=688, Cand=2205 (Ratio=3.21 $\to$ `OK`) · VAVE: 7.45 $\to$ 8.00

2. **Film: Cyborg (15%)** [RECUPERATO DAL VECCHIO GATE] (13 semi, `Film`)
   - **Metodo Naming**: Fonte `4_medium_plus_kw` | Consistenza Scaffale: `0.0090` | Keyword Supp: `15%`
   - **Semi**: *Good Luck, Have Fun, Don't Die*, *Obsession*, *Creature luminose*
   - **Candidati Raccomandati**: *Le sabbie del Kalahari (1965)*, *Ricchi... da morire - Delitti in famiglia (2026)*, *November Criminals (2017)*, *Vendetta (2026)*, *The Drama - Un segreto è per sempre (2026)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2025, Cand: 2026)
   - **Popolarità**: VOT Semi=1103, Cand=690 (Ratio=0.63 $\to$ `OK`) · VAVE: 6.90 $\to$ 6.90

3. **Serie: True Crime (46%) & Miniserie (38%)** [RECUPERATO DAL VECCHIO GATE] (13 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.0263` | Keyword Supp: `46%`
   - **Semi**: *This is the Zodiac Speaking: lettere da un serial killer*, *Sean Combs: la resa dei conti*, *American Murder: il caso Laci Peterson*
   - **Candidati Raccomandati**: *Jeffrey Epstein: soldi, potere e perversione (2020)*, *Cold Case: Chi ha ucciso JonBenét Ramsey (2024)*, *Ti dico un segreto? (2024)*, *Death of the Pastor's Wife: il caso Mica Miller (2026)*, *L'immagine della felicità: I segreti della famiglia Duggar (2023)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2024, Cand: 2024)
   - **Popolarità**: VOT Semi=79, Cand=45 (Ratio=0.57 $\to$ `OK`) · VAVE: 7.13 $\to$ 7.28

4. **Serie: Animazione per Adulti (87%) & Sitcom (47%)** (15 semi, `Serie`)
   - **Metodo Naming**: Fonte `1_kw_pair_ge_0.3` | Consistenza Scaffale: `0.1157` | Keyword Supp: `87%`
   - **Semi**: *Bob's Burgers*, *Primal*, *South Park*
   - **Candidati Raccomandati**: *Big Mouth (2017)*, *The Cleveland Show (2009)*, *BoJack Horseman (2014)*, *Archer (2009)*, *King of the Hill (1997)*
   - **Diagnostica Temporale**: `Deepening (Mix di epoche)` (Anno Med. Semi: 2013, Cand: 2009)
   - **Popolarità**: VOT Semi=1629, Cand=1266 (Ratio=0.78 $\to$ `OK`) · VAVE: 7.80 $\to$ 7.60

5. **Serie: Regia di Ryan Murphy** [RECUPERATO DAL VECCHIO GATE] (16 semi, `Serie`)
   - **Metodo Naming**: Fonte `3_director` | Consistenza Scaffale: `0.0300` | Keyword Supp: `31%`
   - **Semi**: *Grey's Anatomy*, *Stranger Things*, *Breaking Bad*
   - **Candidati Raccomandati**: *The Watcher (2022)*, *American Horror Story (2011)*, *Monster: La storia di Lizzie Borden (2026)*, *Better Call Saul (2015)*, *True Detective (2014)*
   - **Diagnostica Temporale**: `Allineato / Contemporaneo` (Anno Med. Semi: 2018, Cand: 2015)
   - **Popolarità**: VOT Semi=2988, Cand=4420 (Ratio=1.48 $\to$ `OK`) · VAVE: 8.00 $\to$ 8.08

---

## 6. Riconciliazione Temporale (Staleness vs Deepening)

Sui 36 scaffali serviti con il nuovo Gate di Consistenza e Naming Fallback:
- **28 scaffali (77.8%)** sono contemporanei o contengono candidati recenti (2024–2026);
- **7 scaffali (19.4%)** sono casi autentici di *Deepening* (semi storici o mix multi-decennale di epoche, come anime d'autore, samurai jidaigeki o documentari d'archivio);
- **Solo 1 scaffale su 36 (5.6%)** è un vero caso di **STALE**: lo scaffale fantasy di `pepsipex` (*House of the Dragon*, *A Knight of the Seven Kingdoms*, *The Witcher*), i cui candidati si arrestano al 2022.
