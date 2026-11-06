# Benchmark Cluster Personali di Interesse: Revisione Metodologica e Sweep (Ticket 05)

## 1. Criterio di Validità Dichiarato a Priori

> [!IMPORTANT]
> **Criterio Dichiarato a Priori (prima dell'osservazione dei risultati)**:
> Un clustering è credibile come espressione di «interessi personali» se e solo se soddisfa congiuntamente:
> 1. **Copertura semi $\ge 60\%$** dei semi totali;
> 2. **Almeno la metà dei cluster non sono cluster saga** (quota cluster saga $\le 50\%$, dove cluster saga = $\ge 50\%$ dei membri appartiene alla medesima `collection_id` TMDB da `graph.canon.metadati()["COLL"]`);
> 3. **Dimensione mediana dei cluster compresa tra 4 e 30 semi** ($4 \le \text{median\_size} \le 30$).
> 
> Se nessuna configurazione soddisfa tutti e tre i requisiti, il verdetto vincolante e onesto è:
> *«Il clustering per affinità sui semi non può esprimere interessi personali su questo grafo»*.

---

## 2. Cosa ha Mostrato la Prima Versione e Perché Era Artefatta

La prima iterazione del prototipo concludeva che i cluster estratti su profili lunghi fossero «quasi solo saghe» e che la Strategia A fosse preferibile alla B. **Tale conclusione era tuttavia viziata da tre gravi difetti metodologici insiti nella misurazione stessa, che rendevano l'esito vero per costruzione:**

1. **Tetto artificiale `max_k=6`**: Su profili lunghi come `warnok` (476 semi), il codice tratteneva unicamente i primi 6 cluster e marchiava i restanti 374 semi come «non raggruppati». Il valore di copertura del 21.4% riportato nel report non misurava la reale capacità aggregativa del grafo, bensì l'effetto del cap artificiale. I profili estesi non potevano superare ~6 cluster per mero vincolo di codice, scartando arbitrariamente decine di raggruppamenti validi.
2. **Soglia di affinità arbitraria non esplorata (`min_affinity=0.06`)**: Il coseno tra righe di transizione V45 (dove la riga mediana ha solo ~38 archi uscenti non-nulli su 76.497) è tipicamente minuscolo, a meno che i due titoli non abbiano profili di transizione quasi sovrapponibili — condizione tipica quasi solo di sequel e franchise diretti. La soglia 0.06 selezionava per costruzione solo saghe e franchise stretti.
3. **Metrica `distinctness` pari a 0.00 su tutte le righe**: La sovrapposizione tra le top-10 dei diversi cluster risultava 0.00 (o 0.01) sia per la Strategia A che per la Strategia B in tutti gli 8 profili. Essendo identica e non discriminante, non supportava in alcun modo la raccomandazione di A rispetto a B.

---

## 3. Tabella Comparativa Sweep Globale (8 Profili, 1572 Semi Totali)

Campionamento deterministico invariato (seed `20261106`):
- 2 corti: `sangam456` (10), `hammers-lists` (11)
- 3 medi: `sappss` (25), `moppierhead` (38), `flixinatoor99` (32)
- 3 lunghi: `warnok` (476), `pepsipex` (568), `castoffcrown` (412)

Parametri aggiornati: `max_k = 60`, `min_size = 2`, sweep `min_affinity \in {0.005, 0.01, 0.02, 0.04, 0.06}`.

| Strategia | Soglia | Copertura Semi | N. Cluster Tot | Mediana Size | Max Size | Cluster Saga (%) | Semi in Saga (su clusterizzati) | Semi in Saga (su tot semi) | Esito Criterio |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| **A** | `0.005` | 89.5% | 149 | 4.0 | 118 | 10.1% | 2.9% | 2.6% | **PASS** |
| **A** | `0.010` | 86.7% | 179 | 4.0 | 58 | 10.1% | 3.9% | 3.4% | **PASS** |
| **A** | `0.020` | 80.3% | 200 | 4.0 | 43 | 8.5% | 4.0% | 3.2% | **PASS** |
| **A** | `0.040` | 67.9% | 197 | 4.0 | 29 | 13.2% | 7.8% | 5.3% | **PASS** |
| **A** | `0.060` | 59.7% | 196 | 4.0 | 29 | 15.8% | 9.8% | 5.9% | FAIL |
| **B** | `0.005` | 90.7% | 166 | 4.0 | 102 | 9.0% | 2.9% | 2.6% | **PASS** |
| **B** | `0.010` | 86.1% | 201 | 4.0 | 67 | 8.5% | 3.5% | 3.1% | **PASS** |
| **B** | `0.020` | 74.4% | 205 | 4.0 | 37 | 10.7% | 5.4% | 4.0% | **PASS** |
| **B** | `0.040` | 60.1% | 198 | 3.0 | 34 | 11.6% | 7.4% | 4.5% | FAIL |
| **B** | `0.060` | 51.8% | 197 | 3.0 | 29 | 13.7% | 11.2% | 5.8% | FAIL |
| **C** | `0.005` | 94.6% | 36 | 6.0 | 448 | 5.6% | 0.3% | 0.3% | **PASS** |
| **C** | `0.010` | 93.5% | 41 | 6.0 | 447 | 7.3% | 0.4% | 0.4% | **PASS** |
| **C** | `0.020` | 92.0% | 57 | 4.0 | 444 | 14.0% | 1.4% | 1.3% | **PASS** |
| **C** | `0.040` | 89.8% | 73 | 4.0 | 422 | 8.2% | 0.9% | 0.8% | **PASS** |
| **C** | `0.060` | 87.9% | 89 | 3.0 | 399 | 11.2% | 1.5% | 1.3% | FAIL |

### Spiegazione delle Strategie:
- **Strategia A (Affinità Coseno V45)**: Coseno sui vettori riga della transizione unificata V45;
- **Strategia B (Vicinato Condiviso Jaccard)**: Jaccard a coppie sui vicini uscenti top-16;
- **Variante C (Comportamentale Audience COVISION + RESID)**: Bag dei vicini top-20 per peso massimo estratti da `COVISION.npz` e `RESID.npz`, con affinità calcolata come similarità coseno sui vettori bag.

---

## 4. Analisi Dettagliata dello Sweep

### 4.1. Perché la Variante C («Audience / Comportamentale») Fallisce Strutturalmente
Sebbene la Variante C superi formalmente i valori numerici del criterio per soglie $\le 0.04$ (copertura $>90\%$, mediana 4-6, quota saga $<15\%$), l'analisi della dimensione massima dei cluster svela un grave collasso topologico: **la dimensione massima del cluster è compresa tra 399 e 448 semi**.
Le matrici puramente comportamentali (`COVISION` e `RESID`) connettono film popolari ad altissima fruizione comune. Di conseguenza, il grafo delle borse top-20 collassa quasi per intero in un'unica **componente gigante monolitica** che assorbe oltre il 75-80% della storia di un utente, affiancata da pochi cluster nani da 2 semi. La Variante C non produce «interessi personali», ma un agglomerato indistinto.

### 4.2. Strategia B vs Strategia A
La Strategia B (Jaccard su vicini uscenti) soffre di una rapida caduta di copertura rispetto alla A (perde tra i 6 e i 10 punti percentuali a parità di soglia) e a $\text{soglia}=0.04$ vede la mediana scendere a 3.0 (fallendo il vincolo $\ge 4$). A $\text{soglia}=0.06$ la copertura crolla al 51.8%.

### 4.3. Configurazione Vincente: Strategia A a Soglia 0.02
La configurazione che massimizza la qualità dell'aggregazione senza creare componenti giganti è **Strategia A con `min_affinity = 0.02`**:
- **Copertura semi**: **80.3%** (1262 semi raggruppati su 1572 totali);
- **Cluster generati**: 200 su 8 profili (in media 25 cluster per profilo);
- **Dimensione mediana cluster**: **4.0** semi;
- **Dimensione massima cluster**: **43** semi (nessun collasso monolitico, cluster ben dimensionati);
- **Quota cluster saga**: solo **8.5%** (ovvero il **91.5% dei cluster NON sono saghe**);
- **Quota semi in cluster saga**: solo il **4.0%** dei semi raggruppati (3.2% dei semi totali).

---

## 5. Profili Lunghi (400+ Semi) a Cap Rimosso e Ispezione Qualitativa

### 5.1. Quanti Cluster Possiede Realmente un Profilo da 400+ Semi?
Rimuovendo il cap `max_k=6` e osservando i cluster naturali (cardinalità $\ge 2$, `min_affinity = 0.02`), i profili lunghi non si limitano affatto a 6 saghe:
- `warnok` (476 semi): possiede **70 cluster naturali**, con **91.4% di copertura** (435 semi raggruppati). Con il cap conservativo `max_k=60` mantiene **60 cluster** e l'**87.2% di copertura** (415 semi);
- `pepsipex` (568 semi): possiede **76 cluster naturali**, con **93.5% di copertura** (531 semi raggruppati). Con `max_k=60` mantiene **60 cluster** e l'**87.9% di copertura** (499 semi);
- `castoffcrown` (412 semi): possiede **73 cluster naturali**, con **77.2% di copertura** (318 semi raggruppati). Con `max_k=60` mantiene **60 cluster** e il **70.9% di copertura** (292 semi).

Un utente con oltre 400 titoli possiede dunque **tra 70 e 76 nicchie di gusto distinte**.

### 5.2. I Cluster Non-Saga Sono Coerenti o Spazzatura? (Ispezione su Utente `warnok`)
Su `warnok` a soglia 0.02, ben **54 cluster su 60 sono NON-saga** (il 90%). Di seguito l'ispezione approfondita di 3 cluster non-saga rappresentativi:

#### Cluster 2 (Dimensione: 29 semi)
- **Etichetta tematica**: **Fantascienza di Sopravvivenza, Creature Aliene e Thriller Post-Apocalittico**
- **Dimensione cluster**: 29 semi
- **Semi rappresentativi (per centralità interna)**: `Alien: Romulus (2024)`, `Prey (2022)`, `A Quiet Place - Giorno 1 (2024)`
- **Campione titoli membri**: `Disclosure Day (2026)`, `L'ultima missione: Project Hail Mary (2026)`, `Send Help (2026)`, `Predator: Badlands (2025)`, `Jurassic World - La rinascita (2025)`, `Alien: Romulus (2024)`, `A Quiet Place - Giorno 1 (2024)`, `Arcadian (2024)`
- **Valutazione qualitativa**: *Coerentissimo. Non è una saga: include Alien, Predator, A Quiet Place, Jurassic World e titoli fantascientifici ad alta tensione. Le raccomandazioni (Dune 2, Pianeta delle Scimmie, No One Will Save You) sono perfettamente allineate.*
- **Top-10 raccomandazioni generate da `engine.raccomanda` (ristrette ai soli semi del cluster, esclusa intera storia utente)**:
  1. **Jurassic World** (2015) — score: `0.0067`
  2. **Dune - Parte due** (2024) — score: `0.0043`
  3. **Nessuno ti salverà** (2023) — score: `0.0034`
  4. **Avatar: Fuoco e cenere** (2025) — score: `0.0033`
  5. **The War - Il pianeta delle scimmie** (2017) — score: `0.0028`
  6. **Godzilla vs. Kong** (2021) — score: `0.0022`
  7. **Split** (2017) — score: `0.0022`
  8. **Il regno del pianeta delle scimmie** (2024) — score: `0.0021`
  9. **Apes Revolution - Il pianeta delle scimmie** (2014) — score: `0.0020`
  10. **Furiosa: A Mad Max Saga** (2024) — score: `0.0019`

#### Cluster 3 (Dimensione: 28 semi)
- **Etichetta tematica**: **Anime Shōnen e Dark Fantasy Giapponese d'Azione**
- **Dimensione cluster**: 28 semi
- **Semi rappresentativi (per centralità interna)**: `Vinland Saga (2019)`, `Jujutsu Kaisen (2020)`, `Demon Slayer: Kimetsu no Yaiba (2019)`
- **Campione titoli membri**: `Demon Slayer: Kimetsu no Yaiba (2019)`, `DAN DA DAN (2024)`, `Sakamoto Days (2025)`, `Dr. Stone (2019)`, `Bleach (2004)`, `MASHLE: MAGIC AND MUSCLES (2023)`, `Fullmetal Alchemist: Brotherhood (2009)`, `Death Note (2006)`
- **Valutazione qualitativa**: *Coerentissimo. Raggruppa i principali capisaldi shōnen e dark fantasy da studi diversi (MAPPA, Ufotable, Bones). Le raccomandazioni cinematografiche (film di FMA, Demon Slayer Mugen Train, Jujutsu Kaisen 0) colgono l'estensione naturale dei titoli seme.*
- **Top-10 raccomandazioni generate da `engine.raccomanda` (ristrette ai soli semi del cluster, esclusa intera storia utente)**:
  1. **Fullmetal Alchemist - La sacra stella di Milos** (2011) — score: `0.0034`
  2. **Fullmetal Alchemist: The Movie - Il conquistatore di Shamballa** (2005) — score: `0.0030`
  3. **Demon Slayer - Il treno Mugen** (2020) — score: `0.0028`
  4. **Jujutsu Kaisen 0 - Il film** (2021) — score: `0.0028`
  5. **Steins;Gate: The Movie - Load Region of Déjà Vu** (2013) — score: `0.0021`
  6. **Death Note Rewrite - Il Dio Visionario** (2007) — score: `0.0018`
  7. **Demon Slayer: Il Castello dell'Infinito - Parte 1** (2025) — score: `0.0017`
  8. **Ajin: Demi-Human - Compel** (2015) — score: `0.0016`
  9. **Naruto - La via dei ninja** (2012) — score: `0.0016`
  10. **Naruto Shippuden: Il film - Eredi della volontà del Fuoco** (2009) — score: `0.0016`

#### Cluster 6 (Dimensione: 17 semi)
- **Etichetta tematica**: **Cinema d'Animazione d'Autore per Famiglie (Pixar / DreamWorks / Sony / Indipendenti)**
- **Dimensione cluster**: 17 semi
- **Semi rappresentativi (per centralità interna)**: `Luca (2021)`, `Red (2022)`, `Onward - Oltre la magia (2020)`
- **Campione titoli membri**: `Flow - Un mondo da salvare (2024)`, `Il robot selvaggio (2024)`, `Tartarughe Ninja - Caos mutante (2023)`, `Spider-Man: Un nuovo universo (2018)`, `Super Mario Bros. Il Film (2023)`, `Il mostro dei mari (2022)`, `Red (2022)`, `Luca (2021)`
- **Valutazione qualitativa**: *Coerentissimo. Riunisce capolavori contemporanei dell'animazione per tutte le età da molteplici case di produzione (Flow, Robot Selvaggio, Spider-Verse, Pixar). Le raccomandazioni (Spider-Verse 2, Il Gatto con gli Stivali 2, Gli Incredibili 2) sono perfettamente mirate.*
- **Top-10 raccomandazioni generate da `engine.raccomanda` (ristrette ai soli semi del cluster, esclusa intera storia utente)**:
  1. **Spider-Man: Across the Spider-Verse** (2023) — score: `0.0136`
  2. **Il gatto con gli stivali 2 - L'ultimo desiderio** (2022) — score: `0.0079`
  3. **Gli Incredibili 2** (2018) — score: `0.0073`
  4. **Jumpers - Un salto tra gli animali** (2026) — score: `0.0070`
  5. **Elemental** (2023) — score: `0.0066`
  6. **Troppo cattivi** (2022) — score: `0.0055`
  7. **Strange World - Un mondo misterioso** (2022) — score: `0.0055`
  8. **Inside Out 2** (2024) — score: `0.0053`
  9. **LEGO Batman: Il film** (2017) — score: `0.0050`
  10. **Elio** (2025) — score: `0.0050`

---

## 6. Verdetto Finale: Gli Interessi Personali Sono Recuperabili dal Grafo?

> [!TIP]
> **Verdetto Conclusivo: SÌ, gli interessi personali sono pienamente recuperabili dal grafo V45.**
> 
> L'apparente evidenza iniziale secondo cui «i cluster sono solo saghe» era un mero artefatto causato dall'accoppiata di un cap stringente (`max_k=6`) e di una soglia di taglio non calibrata (`min_affinity=0.06`).
> Con la metrica corretta e la soglia ottimale (`min_affinity=0.02`, `max_k=60`):
> 1. **La copertura raggiunge l'80.3%** dei semi complessivi dell'utente;
> 2. **Oltre il 91% dei cluster NON sono saghe**, ma micro-comunità tematiche, stilistiche e d'autore altamente coese (dall'anime shōnen all'animazione per famiglie di prestigio, dal survival horror fantascientifico al crime-western moderno);
> 3. Le raccomandazioni generate dai singoli cluster sono fortemente pertinenti e completamente prive di sovrapposizioni spurie.


## 7. Seconda passata e selezione degli scaffali

### 7.1. Condizioni di Fallimento Dichiarate a Priori

> [!IMPORTANT]
> **Condizioni di Fallimento Dichiarate a Priori (prima dell'ispezione dei risultati)**:
> 1. **Definizione di Scaffale Duplicato**: Uno scaffale è considerato «duplicato» se $\ge 50\%$ dei suoi top-10 candidati compare nella top-10 di un altro scaffale selezionato nel medesimo set.
> 2. **Fallimento Selezione (Duplicazione)**: Una regola di selezione fallisce se $\ge 2$ dei 5 scaffali selezionati risultano duplicati.
> 3. **Fallimento Selezione (Saghe detector b)**: Una regola di selezione fallisce se $\ge 2$ dei 5 scaffali sono macro-cluster saga secondo il detector (b) ($\ge 50\%$ dei membri appartiene a *qualsiasi* collezione TMDB con `collection_id > 0`).
> 4. **Fallimento Selezione (Raccomandazione del Passato)**: Una selezione fallisce se l'anno mediano dei candidati di uno scaffale è più vecchio dell'anno mediano dei suoi semi («regola di recency che raccomanda il passato»).
> 5. **Fallimento Regola Recency**: La regola di *recency* fallisce se il macro-cluster più fresco (freshest macro, ovvero quello contenente il seme a minor $\text{eta}$) non compare tra i 5 scaffali selezionati.
> 6. **Rischio Collasso (Granularità)**: Una configurazione di macro-clustering fallisce se il macro-cluster più grande supera il **60% dei semi totali del profilo**, rendendo inutile la granularità tematica.

---

### 7.2. PART 1 — Risultati della Seconda Passata (Micro $\to$ Macro)

La seconda passata aggrega i micro-cluster naturali della Strategia A (affinità 0.02) calcolando per ciascuno il vettore L2-normalizzato della somma delle righe V45 dei membri. I macro-cluster sono generati mediante average-linkage agglomerativo su similarità coseno, tagliando la gerarchia alle cardinalità target $n_{\text{macro}} \in \{4, 6, 8, 12\}$.

| Target ($n_m$) | Profilo | Semi Tot | N Macro | Size (min / med / max) | Copertura | Saga (a) | Saga (b) | Rischio Collasso (Max / Tot) | Esito Collasso |
|:---:|:---|---:|---:|:---:|---:|---:|---:|---:|:---:|
| `4` | `sangam456` | 10 | 1 | 2 / 2.0 / 2 | 20.0% | 100.0% | 100.0% | 20.0% | PASS |
| `4` | `hammers-lists` | 11 | 2 | 2 / 3.5 / 5 | 63.6% | 0.0% | 0.0% | 45.5% | PASS |
| `4` | `sappss` | 25 | 4 | 2 / 2.0 / 9 | 60.0% | 0.0% | 0.0% | 36.0% | PASS |
| `4` | `moppierhead` | 38 | 4 | 2 / 5.0 / 12 | 63.2% | 25.0% | 50.0% | 31.6% | PASS |
| `4` | `flixinatoor99` | 32 | 4 | 2 / 2.0 / 3 | 28.1% | 25.0% | 25.0% | 9.4% | PASS |
| `4` | `warnok` | 476 | 4 | 2 / 2.5 / 428 | 91.4% | 0.0% | 0.0% | **89.9%** | **FAIL (>60%)** |
| `4` | `pepsipex` | 568 | 4 | 2 / 3.0 / 523 | 93.5% | 25.0% | 25.0% | **92.1%** | **FAIL (>60%)** |
| `4` | `castoffcrown` | 412 | 4 | 2 / 13.5 / 289 | 77.2% | 0.0% | 0.0% | **70.1%** | **FAIL (>60%)** |
| `6` | `sangam456` | 10 | 1 | 2 / 2.0 / 2 | 20.0% | 100.0% | 100.0% | 20.0% | PASS |
| `6` | `hammers-lists` | 11 | 2 | 2 / 3.5 / 5 | 63.6% | 0.0% | 0.0% | 45.5% | PASS |
| `6` | `sappss` | 25 | 6 | 2 / 2.0 / 4 | 60.0% | 0.0% | 0.0% | 16.0% | PASS |
| `6` | `moppierhead` | 38 | 6 | 2 / 4.5 / 6 | 63.2% | 50.0% | 50.0% | 15.8% | PASS |
| `6` | `flixinatoor99` | 32 | 4 | 2 / 2.0 / 3 | 28.1% | 25.0% | 25.0% | 9.4% | PASS |
| `6` | `warnok` | 476 | 6 | 2 / 2.5 / 339 | 91.4% | 0.0% | 0.0% | **71.2%** | **FAIL (>60%)** |
| `6` | `pepsipex` | 568 | 6 | 2 / 3.5 / 511 | 93.5% | 16.7% | 16.7% | **90.0%** | **FAIL (>60%)** |
| `6` | `castoffcrown` | 412 | 6 | 2 / 6.0 / 289 | 77.2% | 0.0% | 0.0% | **70.1%** | **FAIL (>60%)** |
| `8` | `sangam456` | 10 | 1 | 2 / 2.0 / 2 | 20.0% | 100.0% | 100.0% | 20.0% | PASS |
| `8` | `hammers-lists` | 11 | 2 | 2 / 3.5 / 5 | 63.6% | 0.0% | 0.0% | 45.5% | PASS |
| `8` | `sappss` | 25 | 6 | 2 / 2.0 / 4 | 60.0% | 0.0% | 0.0% | 16.0% | PASS |
| `8` | `moppierhead` | 38 | 7 | 2 / 4.0 / 5 | 63.2% | 57.1% | 57.1% | 13.2% | PASS |
| `8` | `flixinatoor99` | 32 | 4 | 2 / 2.0 / 3 | 28.1% | 25.0% | 25.0% | 9.4% | PASS |
| `8` | `warnok` | 476 | 8 | 2 / 2.5 / 337 | 91.4% | 0.0% | 0.0% | **70.8%** | **FAIL (>60%)** |
| `8` | `pepsipex` | 568 | 8 | 2 / 3.5 / 499 | 93.5% | 12.5% | 12.5% | **87.9%** | **FAIL (>60%)** |
| `8` | `castoffcrown` | 412 | 8 | 2 / 5.0 / 281 | 77.2% | 0.0% | 0.0% | **68.2%** | **FAIL (>60%)** |
| `12` | `sangam456` | 10 | 1 | 2 / 2.0 / 2 | 20.0% | 100.0% | 100.0% | 20.0% | PASS |
| `12` | `hammers-lists` | 11 | 2 | 2 / 3.5 / 5 | 63.6% | 0.0% | 0.0% | 45.5% | PASS |
| `12` | `sappss` | 25 | 6 | 2 / 2.0 / 4 | 60.0% | 0.0% | 0.0% | 16.0% | PASS |
| `12` | `moppierhead` | 38 | 7 | 2 / 4.0 / 5 | 63.2% | 57.1% | 57.1% | 13.2% | PASS |
| `12` | `flixinatoor99` | 32 | 4 | 2 / 2.0 / 3 | 28.1% | 25.0% | 25.0% | 9.4% | PASS |
| `12` | `warnok` | 476 | 12 | 2 / 8.5 / 274 | 91.4% | 8.3% | 8.3% | 57.6% | PASS |
| `12` | `pepsipex` | 568 | 12 | 2 / 6.5 / 297 | 93.5% | 8.3% | 8.3% | 52.3% | PASS |
| `12` | `castoffcrown` | 412 | 12 | 2 / 5.0 / 185 | 77.2% | 8.3% | 8.3% | 44.9% | PASS |

#### Analisi del Rischio Collasso e Scelta del Target Ottimale
> [!WARNING]
> **Collasso Sistematico dei Target 4, 6 e 8 sui Profili Lunghi**:
> A Target 4, 6 e 8, tutti i profili lunghi collassano in una componente gigante che ingloba tra il **68% e il 92%** della storia dell'utente. Il target **12** è l'unico che abbatte il rischio di collasso al di sotto del 60% su tutti gli 8 profili.

---

### 7.3. PART 2 — Definizione e Confronto delle Regole di Selezione ($N=5$)

Sul modello vincente a target 12, abbiamo confrontato tre regole di selezione per estrarre 5 scaffali:
1. **Recency**: Macro ordinati per $\text{eta}$ mediano crescente (semi visti più recentemente, tie-break $\text{eta}$ minimo);
2. **Support**: Macro ordinati per numero di semi (massa decrescente, tie-break visualizzazioni totali);
3. **Combined**: Media aritmetica dei ranghi ordinali (1-based):
   $$\text{score}_{\text{comb}} = \frac{\text{rank}_{\text{recency}} + \text{rank}_{\text{support}}}{2}$$

#### Verifica Condizioni di Fallimento Dichiarate (8 Profili)

| Profilo | Regola | Scaffali Dup ($\ge 2$) | Saghe (b) ($\ge 2$) | Raccomanda Passato | Freshest Escluso | Esito Globale |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| `sangam456` | **recency** | 0/5 | 1/5 | **FAIL (1)** | PASS | **FAIL** |
| `sangam456` | **support** | 0/5 | 1/5 | **FAIL (1)** | N/A | **FAIL** |
| `sangam456` | **combined** | 0/5 | 1/5 | **FAIL (1)** | N/A | **FAIL** |
| `hammers-lists` | **recency** | 0/5 | 0/5 | **FAIL (1)** | PASS | **FAIL** |
| `hammers-lists` | **support** | 0/5 | 0/5 | **FAIL (1)** | N/A | **FAIL** |
| `hammers-lists` | **combined** | 0/5 | 0/5 | **FAIL (1)** | N/A | **FAIL** |
| `sappss` | **recency** | 0/5 | 0/5 | **FAIL (4)** | PASS | **FAIL** |
| `sappss` | **support** | 0/5 | 0/5 | **FAIL (3)** | N/A | **FAIL** |
| `sappss` | **combined** | 0/5 | 0/5 | **FAIL (3)** | N/A | **FAIL** |
| `moppierhead` | **recency** | 0/5 | **FAIL (2)** | **FAIL (1)** | PASS | **FAIL** |
| `moppierhead` | **support** | 0/5 | **FAIL (2)** | **FAIL (2)** | N/A | **FAIL** |
| `moppierhead` | **combined** | 0/5 | **FAIL (2)** | **FAIL (1)** | N/A | **FAIL** |
| `flixinatoor99` | **recency** | 0/5 | 1/5 | **FAIL (1)** | PASS | **FAIL** |
| `flixinatoor99` | **support** | 0/5 | 1/5 | **FAIL (1)** | N/A | **FAIL** |
| `flixinatoor99` | **combined** | 0/5 | 1/5 | **FAIL (1)** | N/A | **FAIL** |
| `warnok` | **recency** | 0/5 | 1/5 | **FAIL (3)** | **FAIL** | **FAIL** |
| `warnok` | **support** | 0/5 | 0/5 | **FAIL (1)** | N/A | **FAIL** |
| `warnok` | **combined** | 0/5 | 1/5 | **FAIL (1)** | N/A | **FAIL** |
| `pepsipex` | **recency** | 0/5 | 1/5 | **FAIL (5)** | PASS | **FAIL** |
| `pepsipex` | **support** | 0/5 | 0/5 | **FAIL (4)** | N/A | **FAIL** |
| `pepsipex` | **combined** | 0/5 | 0/5 | **FAIL (4)** | N/A | **FAIL** |
| `castoffcrown` | **recency** | 0/5 | 1/5 | **FAIL (3)** | **FAIL** | **FAIL** |
| `castoffcrown` | **support** | 0/5 | 0/5 | **FAIL (2)** | N/A | **FAIL** |
| `castoffcrown` | **combined** | 0/5 | 0/5 | **FAIL (2)** | N/A | **FAIL** |

---

### 7.4. Ispezione Dettagliata — Profilo Medio: flixinatoor99 (32 semi)

Macro totali estratti ($k=12$): **4**. Macro contenente il seme più fresco: **Macro 1** (min $\text{eta} = 161.0$ giorni).

#### Regola: `RECENCY` (Profilo `flixinatoor99`)

- **Scaffali duplicati**: 0 | **Saghe (b)**: 1 | **Scaffali che consigliano il passato**: 1 | **Freshest incluso**: True

**Scaffale 1: Macro 1** (Dimensione: 2 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `205.5` gg (min = `161.0` gg) | Anno mediano semi = `2006` | Anno mediano candidati = `2011`
- **Semi rappresentativi (per centralità)**: `Parks and Recreation (2009)`, `Stromberg (2004)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **The Office (US)** (2005) [`tv:2316`] — score: `0.0153`
  2. **Die Discounter** (2021) [`tv:153642`] — score: `0.0146`
  3. **jerks.** (2017) [`tv:69931`] — score: `0.0137`
  4. **Borderline** (2016) [`tv:67387`] — score: `0.0135`
  5. **Brooklyn Nine-Nine** (2013) [`tv:48891`] — score: `0.0132`
  6. **The Office (UK)** (2001) [`tv:2996`] — score: `0.0120`
  7. **The Good Place** (2016) [`tv:66573`] — score: `0.0120`
  8. **Pastewka** (2005) [`tv:36846`] — score: `0.0118`
  9. **Community** (2009) [`tv:18347`] — score: `0.0115`
  10. **30 Rock** (2006) [`tv:4608`] — score: `0.0099`

**Scaffale 2: Macro 2** (Dimensione: 2 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `236.5` gg (min = `179.0` gg) | Anno mediano semi = `2009` | Anno mediano candidati = `2018`
- **Semi rappresentativi (per centralità)**: `INVINCIBLE (2021)`, `South Park (1997)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **La leggenda di Vox Machina** (2022) [`tv:135934`] — score: `0.0182`
  2. **Rick and Morty** (2013) [`tv:60625`] — score: `0.0174`
  3. **The Boys Presenta: Diabolico!** (2022) [`tv:152483`] — score: `0.0145`
  4. **Harley Quinn** (2019) [`tv:74440`] — score: `0.0143`
  5. **I Griffin** (1999) [`tv:1434`] — score: `0.0142`
  6. **I Simpson** (1989) [`tv:456`] — score: `0.0116`
  7. **American Dad!** (2005) [`tv:1433`] — score: `0.0113`
  8. **X-Men '97** (2024) [`tv:138502`] — score: `0.0109`
  9. **Primal** (2019) [`tv:89456`] — score: `0.0106`
  10. **Castlevania** (2017) [`tv:71024`] — score: `0.0101`

**Scaffale 3: Macro 0** (Dimensione: 3 semi, Medium: `movie` [SAGA-b])
- **Metadati**: $\text{eta}$ mediano = `281.0` gg (min = `273.0` gg) | Anno mediano semi = `2010` | Anno mediano candidati = `2008`
- **Semi rappresentativi (per centralità)**: `Animali fantastici e dove trovarli (2016)`, `Harry Potter e i Doni della Morte - Parte 1 (2010)`, `Harry Potter e la pietra filosofale (2001)`
- **Top-10 candidati (`medium=movie`, esclusa intera storia)**:
  1. **Harry Potter e i Doni della Morte - Parte 2** (2011) [`movie:12445`] — score: `0.0352`
  2. **Harry Potter e l'ordine della fenice** (2007) [`movie:675`] — score: `0.0339`
  3. **Harry Potter e il principe mezzosangue** (2009) [`movie:767`] — score: `0.0334`
  4. **Harry Potter e il prigioniero di Azkaban** (2004) [`movie:673`] — score: `0.0302`
  5. **Harry Potter e il calice di fuoco** (2005) [`movie:674`] — score: `0.0298`
  6. **Harry Potter e la camera dei segreti** (2002) [`movie:672`] — score: `0.0259`
  7. **Animali fantastici - I crimini di Grindelwald** (2018) [`movie:338952`] — score: `0.0230`
  8. **Animali fantastici - I segreti di Silente** (2022) [`movie:338953`] — score: `0.0163`
  9. **Lo Hobbit: Un viaggio inaspettato** (2012) [`movie:49051`] — score: `0.0058`
  10. **Le cronache di Narnia - Il leone, la strega e l'armadio** (2005) [`movie:411`] — score: `0.0050`

**Scaffale 4: Macro 3** (Dimensione: 2 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `326.0` gg (min = `299.0` gg) | Anno mediano semi = `1998` | Anno mediano candidati = `2012`
- **Semi rappresentativi (per centralità)**: `El Chavo del Ocho (1973)`, `Nadie nos va a extrañar (2024)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **El Chapulín Colorado** (1973) [`tv:13023`] — score: `0.0328`
  2. **Chespirito** (1980) [`tv:105590`] — score: `0.0191`
  3. **DI4RI** (2022) [`tv:202306`] — score: `0.0151`
  4. **On My Block** (2018) [`tv:76747`] — score: `0.0146`
  5. **ted** (2024) [`tv:201834`] — score: `0.0109`
  6. **La familia P. Luche** (2002) [`tv:31072`] — score: `0.0107`
  7. **El Chavo Animado** (2006) [`tv:7821`] — score: `0.0076`
  8. **Soy Luna: Volver a rodar** (2026) [`tv:324434`] — score: `0.0072`
  9. **Vecinos** (2005) [`tv:18011`] — score: `0.0067`
  10. **The Bad Guy** (2022) [`tv:158050`] — score: `0.0053`

#### Regola: `SUPPORT` (Profilo `flixinatoor99`)

- **Scaffali duplicati**: 0 | **Saghe (b)**: 1 | **Scaffali che consigliano il passato**: 1 | **Freshest incluso**: True

**Scaffale 1: Macro 0** (Dimensione: 3 semi, Medium: `movie` [SAGA-b])
- **Metadati**: $\text{eta}$ mediano = `281.0` gg (min = `273.0` gg) | Anno mediano semi = `2010` | Anno mediano candidati = `2008`
- **Semi rappresentativi (per centralità)**: `Animali fantastici e dove trovarli (2016)`, `Harry Potter e i Doni della Morte - Parte 1 (2010)`, `Harry Potter e la pietra filosofale (2001)`
- **Top-10 candidati (`medium=movie`, esclusa intera storia)**:
  1. **Harry Potter e i Doni della Morte - Parte 2** (2011) [`movie:12445`] — score: `0.0352`
  2. **Harry Potter e l'ordine della fenice** (2007) [`movie:675`] — score: `0.0339`
  3. **Harry Potter e il principe mezzosangue** (2009) [`movie:767`] — score: `0.0334`
  4. **Harry Potter e il prigioniero di Azkaban** (2004) [`movie:673`] — score: `0.0302`
  5. **Harry Potter e il calice di fuoco** (2005) [`movie:674`] — score: `0.0298`
  6. **Harry Potter e la camera dei segreti** (2002) [`movie:672`] — score: `0.0259`
  7. **Animali fantastici - I crimini di Grindelwald** (2018) [`movie:338952`] — score: `0.0230`
  8. **Animali fantastici - I segreti di Silente** (2022) [`movie:338953`] — score: `0.0163`
  9. **Lo Hobbit: Un viaggio inaspettato** (2012) [`movie:49051`] — score: `0.0058`
  10. **Le cronache di Narnia - Il leone, la strega e l'armadio** (2005) [`movie:411`] — score: `0.0050`

**Scaffale 2: Macro 1** (Dimensione: 2 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `205.5` gg (min = `161.0` gg) | Anno mediano semi = `2006` | Anno mediano candidati = `2011`
- **Semi rappresentativi (per centralità)**: `Parks and Recreation (2009)`, `Stromberg (2004)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **The Office (US)** (2005) [`tv:2316`] — score: `0.0153`
  2. **Die Discounter** (2021) [`tv:153642`] — score: `0.0146`
  3. **jerks.** (2017) [`tv:69931`] — score: `0.0137`
  4. **Borderline** (2016) [`tv:67387`] — score: `0.0135`
  5. **Brooklyn Nine-Nine** (2013) [`tv:48891`] — score: `0.0132`
  6. **The Office (UK)** (2001) [`tv:2996`] — score: `0.0120`
  7. **The Good Place** (2016) [`tv:66573`] — score: `0.0120`
  8. **Pastewka** (2005) [`tv:36846`] — score: `0.0118`
  9. **Community** (2009) [`tv:18347`] — score: `0.0115`
  10. **30 Rock** (2006) [`tv:4608`] — score: `0.0099`

**Scaffale 3: Macro 2** (Dimensione: 2 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `236.5` gg (min = `179.0` gg) | Anno mediano semi = `2009` | Anno mediano candidati = `2018`
- **Semi rappresentativi (per centralità)**: `INVINCIBLE (2021)`, `South Park (1997)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **La leggenda di Vox Machina** (2022) [`tv:135934`] — score: `0.0182`
  2. **Rick and Morty** (2013) [`tv:60625`] — score: `0.0174`
  3. **The Boys Presenta: Diabolico!** (2022) [`tv:152483`] — score: `0.0145`
  4. **Harley Quinn** (2019) [`tv:74440`] — score: `0.0143`
  5. **I Griffin** (1999) [`tv:1434`] — score: `0.0142`
  6. **I Simpson** (1989) [`tv:456`] — score: `0.0116`
  7. **American Dad!** (2005) [`tv:1433`] — score: `0.0113`
  8. **X-Men '97** (2024) [`tv:138502`] — score: `0.0109`
  9. **Primal** (2019) [`tv:89456`] — score: `0.0106`
  10. **Castlevania** (2017) [`tv:71024`] — score: `0.0101`

**Scaffale 4: Macro 3** (Dimensione: 2 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `326.0` gg (min = `299.0` gg) | Anno mediano semi = `1998` | Anno mediano candidati = `2012`
- **Semi rappresentativi (per centralità)**: `El Chavo del Ocho (1973)`, `Nadie nos va a extrañar (2024)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **El Chapulín Colorado** (1973) [`tv:13023`] — score: `0.0328`
  2. **Chespirito** (1980) [`tv:105590`] — score: `0.0191`
  3. **DI4RI** (2022) [`tv:202306`] — score: `0.0151`
  4. **On My Block** (2018) [`tv:76747`] — score: `0.0146`
  5. **ted** (2024) [`tv:201834`] — score: `0.0109`
  6. **La familia P. Luche** (2002) [`tv:31072`] — score: `0.0107`
  7. **El Chavo Animado** (2006) [`tv:7821`] — score: `0.0076`
  8. **Soy Luna: Volver a rodar** (2026) [`tv:324434`] — score: `0.0072`
  9. **Vecinos** (2005) [`tv:18011`] — score: `0.0067`
  10. **The Bad Guy** (2022) [`tv:158050`] — score: `0.0053`

#### Regola: `COMBINED` (Profilo `flixinatoor99`)

- **Scaffali duplicati**: 0 | **Saghe (b)**: 1 | **Scaffali che consigliano il passato**: 1 | **Freshest incluso**: True

**Scaffale 1: Macro 1** (Dimensione: 2 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `205.5` gg (min = `161.0` gg) | Anno mediano semi = `2006` | Anno mediano candidati = `2011`
- **Semi rappresentativi (per centralità)**: `Parks and Recreation (2009)`, `Stromberg (2004)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **The Office (US)** (2005) [`tv:2316`] — score: `0.0153`
  2. **Die Discounter** (2021) [`tv:153642`] — score: `0.0146`
  3. **jerks.** (2017) [`tv:69931`] — score: `0.0137`
  4. **Borderline** (2016) [`tv:67387`] — score: `0.0135`
  5. **Brooklyn Nine-Nine** (2013) [`tv:48891`] — score: `0.0132`
  6. **The Office (UK)** (2001) [`tv:2996`] — score: `0.0120`
  7. **The Good Place** (2016) [`tv:66573`] — score: `0.0120`
  8. **Pastewka** (2005) [`tv:36846`] — score: `0.0118`
  9. **Community** (2009) [`tv:18347`] — score: `0.0115`
  10. **30 Rock** (2006) [`tv:4608`] — score: `0.0099`

**Scaffale 2: Macro 0** (Dimensione: 3 semi, Medium: `movie` [SAGA-b])
- **Metadati**: $\text{eta}$ mediano = `281.0` gg (min = `273.0` gg) | Anno mediano semi = `2010` | Anno mediano candidati = `2008`
- **Semi rappresentativi (per centralità)**: `Animali fantastici e dove trovarli (2016)`, `Harry Potter e i Doni della Morte - Parte 1 (2010)`, `Harry Potter e la pietra filosofale (2001)`
- **Top-10 candidati (`medium=movie`, esclusa intera storia)**:
  1. **Harry Potter e i Doni della Morte - Parte 2** (2011) [`movie:12445`] — score: `0.0352`
  2. **Harry Potter e l'ordine della fenice** (2007) [`movie:675`] — score: `0.0339`
  3. **Harry Potter e il principe mezzosangue** (2009) [`movie:767`] — score: `0.0334`
  4. **Harry Potter e il prigioniero di Azkaban** (2004) [`movie:673`] — score: `0.0302`
  5. **Harry Potter e il calice di fuoco** (2005) [`movie:674`] — score: `0.0298`
  6. **Harry Potter e la camera dei segreti** (2002) [`movie:672`] — score: `0.0259`
  7. **Animali fantastici - I crimini di Grindelwald** (2018) [`movie:338952`] — score: `0.0230`
  8. **Animali fantastici - I segreti di Silente** (2022) [`movie:338953`] — score: `0.0163`
  9. **Lo Hobbit: Un viaggio inaspettato** (2012) [`movie:49051`] — score: `0.0058`
  10. **Le cronache di Narnia - Il leone, la strega e l'armadio** (2005) [`movie:411`] — score: `0.0050`

**Scaffale 3: Macro 2** (Dimensione: 2 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `236.5` gg (min = `179.0` gg) | Anno mediano semi = `2009` | Anno mediano candidati = `2018`
- **Semi rappresentativi (per centralità)**: `INVINCIBLE (2021)`, `South Park (1997)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **La leggenda di Vox Machina** (2022) [`tv:135934`] — score: `0.0182`
  2. **Rick and Morty** (2013) [`tv:60625`] — score: `0.0174`
  3. **The Boys Presenta: Diabolico!** (2022) [`tv:152483`] — score: `0.0145`
  4. **Harley Quinn** (2019) [`tv:74440`] — score: `0.0143`
  5. **I Griffin** (1999) [`tv:1434`] — score: `0.0142`
  6. **I Simpson** (1989) [`tv:456`] — score: `0.0116`
  7. **American Dad!** (2005) [`tv:1433`] — score: `0.0113`
  8. **X-Men '97** (2024) [`tv:138502`] — score: `0.0109`
  9. **Primal** (2019) [`tv:89456`] — score: `0.0106`
  10. **Castlevania** (2017) [`tv:71024`] — score: `0.0101`

**Scaffale 4: Macro 3** (Dimensione: 2 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `326.0` gg (min = `299.0` gg) | Anno mediano semi = `1998` | Anno mediano candidati = `2012`
- **Semi rappresentativi (per centralità)**: `El Chavo del Ocho (1973)`, `Nadie nos va a extrañar (2024)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **El Chapulín Colorado** (1973) [`tv:13023`] — score: `0.0328`
  2. **Chespirito** (1980) [`tv:105590`] — score: `0.0191`
  3. **DI4RI** (2022) [`tv:202306`] — score: `0.0151`
  4. **On My Block** (2018) [`tv:76747`] — score: `0.0146`
  5. **ted** (2024) [`tv:201834`] — score: `0.0109`
  6. **La familia P. Luche** (2002) [`tv:31072`] — score: `0.0107`
  7. **El Chavo Animado** (2006) [`tv:7821`] — score: `0.0076`
  8. **Soy Luna: Volver a rodar** (2026) [`tv:324434`] — score: `0.0072`
  9. **Vecinos** (2005) [`tv:18011`] — score: `0.0067`
  10. **The Bad Guy** (2022) [`tv:158050`] — score: `0.0053`

---

### 7.4. Ispezione Dettagliata — Profilo Lungo: warnok (476 semi)

Macro totali estratti ($k=12$): **12**. Macro contenente il seme più fresco: **Macro 0** (min $\text{eta} = 18.0$ giorni).

#### Regola: `RECENCY` (Profilo `warnok`)

- **Scaffali duplicati**: 0 | **Saghe (b)**: 1 | **Scaffali che consigliano il passato**: 3 | **Freshest incluso**: False

**Scaffale 1: Macro 7** (Dimensione: 3 semi, Medium: `movie` [SAGA-b])
- **Metadati**: $\text{eta}$ mediano = `526.0` gg (min = `522.0` gg) | Anno mediano semi = `2005` | Anno mediano candidati = `2008`
- **Semi rappresentativi (per centralità)**: `Saw III - L'enigma senza fine (2006)`, `Saw II - La soluzione dell'enigma (2005)`, `Saw - L'enigmista (2004)`
- **Top-10 candidati (`medium=movie`, esclusa intera storia)**:
  1. **Saw IV - Il gioco continua** (2007) [`movie:663`] — score: `0.0335`
  2. **Saw VI** (2009) [`movie:22804`] — score: `0.0292`
  3. **Saw V** (2008) [`movie:11917`] — score: `0.0279`
  4. **Saw 3D - Il capitolo finale** (2010) [`movie:41439`] — score: `0.0249`
  5. **Saw - Legacy** (2017) [`movie:298250`] — score: `0.0158`
  6. **Saw X** (2023) [`movie:951491`] — score: `0.0145`
  7. **Hostel** (2006) [`movie:1690`] — score: `0.0141`
  8. **Non aprite quella porta** (2003) [`movie:9373`] — score: `0.0104`
  9. **Hostel: Part II** (2007) [`movie:1691`] — score: `0.0083`
  10. **Spiral - L'eredità di Saw** (2021) [`movie:602734`] — score: `0.0072`

**Scaffale 2: Macro 9** (Dimensione: 2 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `852.0` gg (min = `852.0` gg) | Anno mediano semi = `2023` | Anno mediano candidati = `2018`
- **Semi rappresentativi (per centralità)**: `La Zona: Missione Sopravvivenza (2022)`, `미스터리 수사단 (2024)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **대탈출** (2018) [`tv:80585`] — score: `0.0161`
  2. **The Devil’s Plan** (2023) [`tv:214582`] — score: `0.0119`
  3. **여고추리반** (2021) [`tv:116013`] — score: `0.0109`
  4. **America Says** (2018) [`tv:89491`] — score: `0.0088`
  5. **출장 십오야** (2021) [`tv:123473`] — score: `0.0087`
  6. **The Wall** (2016) [`tv:69153`] — score: `0.0086`
  7. **Busted!** (2018) [`tv:78798`] — score: `0.0086`
  8. **Wer stiehlt mir die Show?** (2021) [`tv:117057`] — score: `0.0084`
  9. **런닝맨** (2010) [`tv:33238`] — score: `0.0082`
  10. **MXC** (2003) [`tv:2995`] — score: `0.0078`

**Scaffale 3: Macro 6** (Dimensione: 3 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `936.0` gg (min = `495.0` gg) | Anno mediano semi = `2023` | Anno mediano candidati = `2020`
- **Semi rappresentativi (per centralità)**: `Receiver (2024)`, `Man in the Arena: Tom Brady (2021)`, `Quarterback (2023)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **The Dynasty: New England Patriots** (2024) [`tv:239748`] — score: `0.0217`
  2. **The Kingdom** (2025) [`tv:287609`] — score: `0.0181`
  3. **Inside the NFL** (1977) [`tv:10047`] — score: `0.0171`
  4. **All or Nothing** (2016) [`tv:66943`] — score: `0.0164`
  5. **A Football Life** (2011) [`tv:45559`] — score: `0.0163`
  6. **Hard Knocks** (2001) [`tv:12940`] — score: `0.0118`
  7. **AMERICA'S SWEETHEARTS: le cheerleader dei Dallas Cowboys** (2024) [`tv:252257`] — score: `0.0115`
  8. **Untold: Swamp Kings** (2023) [`tv:231297`] — score: `0.0101`
  9. **American Sports Story: Aaron Hernandez** (2024) [`tv:131141`] — score: `0.0087`
  10. **Last Chance U** (2016) [`tv:67027`] — score: `0.0086`

**Scaffale 4: Macro 4** (Dimensione: 19 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `1104.0` gg (min = `19.0` gg) | Anno mediano semi = `2021` | Anno mediano candidati = `2022`
- **Semi rappresentativi (per centralità)**: `Kingdom (2019)`, `Peninsula (2020)`, `#Alive (2020)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **Signal** (2016) [`tv:64840`] — score: `0.0051`
  2. **The WONDERfools** (2026) [`tv:259837`] — score: `0.0034`
  3. **Agent Kim Reactivated** (2026) [`tv:296206`] — score: `0.0030`
  4. **유부녀 킬러** (2026) [`tv:294095`] — score: `0.0028`
  5. **쓰리 데이즈** (2014) [`tv:61157`] — score: `0.0027`
  6. **The Ark** (2023) [`tv:47663`] — score: `0.0027`
  7. **Bulgasal: Anime immortali** (2021) [`tv:137520`] — score: `0.0025`
  8. **Addio alla Terra** (2024) [`tv:139547`] — score: `0.0024`
  9. **유령** (2012) [`tv:45018`] — score: `0.0024`
  10. **Ice Fantasy** (2016) [`tv:67015`] — score: `0.0024`

**Scaffale 5: Macro 8** (Dimensione: 2 semi, Medium: `movie`)
- **Metadati**: $\text{eta}$ mediano = `1144.5` gg (min = `721.0` gg) | Anno mediano semi = `2020` | Anno mediano candidati = `2012`
- **Semi rappresentativi (per centralità)**: `Los niños perdidos: 40 giorni nella foresta (2024)`, `Supermax (2016)`
- **Top-10 candidati (`medium=movie`, esclusa intera storia)**:
  1. **Tainá 2: A Aventura Continua** (2004) [`movie:51186`] — score: `0.0275`
  2. **Tainá: Uma Aventura na Amazônia** (2001) [`movie:294161`] — score: `0.0256`
  3. **L'ultima foresta** (2021) [`movie:795780`] — score: `0.0161`
  4. **Os Trapalhões e a Árvore da Juventude** (1991) [`movie:133012`] — score: `0.0116`
  5. **El Abrazo de la Serpiente** (2015) [`movie:336808`] — score: `0.0115`
  6. **Lo scontro di due mondi** (2016) [`movie:373442`] — score: `0.0104`
  7. **Os Normais: O Filme** (2003) [`movie:37050`] — score: `0.0103`
  8. **400 Contra 1: Uma História do Crime Organizado** (2010) [`movie:49821`] — score: `0.0092`
  9. **Mala junta** (2017) [`movie:421883`] — score: `0.0082`
  10. **Emma e il giaguaro nero** (2024) [`movie:959098`] — score: `0.0080`

#### Regola: `SUPPORT` (Profilo `warnok`)

- **Scaffali duplicati**: 0 | **Saghe (b)**: 0 | **Scaffali che consigliano il passato**: 1 | **Freshest incluso**: True

**Scaffale 1: Macro 0** (Dimensione: 274 semi, Medium: `movie`)
- **Metadati**: $\text{eta}$ mediano = `1588.0` gg (min = `18.0` gg) | Anno mediano semi = `2020` | Anno mediano candidati = `2023`
- **Semi rappresentativi (per centralità)**: `Black Panther (2018)`, `Guardiani della Galassia Vol. 2 (2017)`, `Captain America: Civil War (2016)`
- **Top-10 candidati (`medium=movie`, esclusa intera storia)**:
  1. **Ant-Man and the Wasp: Quantumania** (2023) [`movie:640146`] — score: `0.0009`
  2. **Doctor Strange nel Multiverso della Follia** (2022) [`movie:453395`] — score: `0.0008`
  3. **Jurassic World** (2015) [`movie:135397`] — score: `0.0007`
  4. **The Family Plan 2** (2025) [`movie:1363123`] — score: `0.0005`
  5. **Margaux** (2022) [`movie:846778`] — score: `0.0005`
  6. **Dune - Parte due** (2024) [`movie:693134`] — score: `0.0005`
  7. **Greenland 2: Migration** (2026) [`movie:840464`] — score: `0.0005`
  8. **John Wick 4** (2023) [`movie:603692`] — score: `0.0005`
  9. **Mercy - Sotto accusa** (2026) [`movie:1236153`] — score: `0.0005`
  10. **Bob Lazar: Area 51 and Flying Saucers** (2018) [`movie:522320`] — score: `0.0005`

**Scaffale 2: Macro 1** (Dimensione: 65 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `1509.0` gg (min = `43.0` gg) | Anno mediano semi = `2019` | Anno mediano candidati = `2021`
- **Semi rappresentativi (per centralità)**: `Vinland Saga (2019)`, `Jujutsu Kaisen (2020)`, `Dororo (2019)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **Hunter x Hunter** (2011) [`tv:46298`] — score: `0.0032`
  2. **The Promised Neverland** (2019) [`tv:83097`] — score: `0.0031`
  3. **The Mighty Nein** (2025) [`tv:219080`] — score: `0.0030`
  4. **Chainsaw Man** (2022) [`tv:114410`] — score: `0.0028`
  5. **One-Punch Man** (2015) [`tv:63926`] — score: `0.0025`
  6. **The Boys Presenta: Diabolico!** (2022) [`tv:152483`] — score: `0.0024`
  7. **Mob Psycho 100** (2016) [`tv:67075`] — score: `0.0023`
  8. **Tower of God** (2020) [`tv:97860`] — score: `0.0021`
  9. **Hell's Paradise** (2023) [`tv:117465`] — score: `0.0019`
  10. **Solo Leveling** (2024) [`tv:127532`] — score: `0.0018`

**Scaffale 3: Macro 2** (Dimensione: 27 semi, Medium: `movie`)
- **Metadati**: $\text{eta}$ mediano = `1510.0` gg (min = `446.0` gg) | Anno mediano semi = `2016` | Anno mediano candidati = `2014`
- **Semi rappresentativi (per centralità)**: `Bajrangi Bhaijaan (2015)`, `पीके (2014)`, `3 Idiots (2009)`
- **Top-10 candidati (`medium=movie`, esclusa intera storia)**:
  1. **धूम २** (2006) [`movie:14194`] — score: `0.0040`
  2. **स्त्री 2: सरकटे का आतंक** (2024) [`movie:1112426`] — score: `0.0039`
  3. **సలార్: పార్ట్‌ 1 – సీజ్‌ఫైర్‌** (2023) [`movie:770906`] — score: `0.0036`
  4. **रान्झाना** (2013) [`movie:191121`] — score: `0.0029`
  5. **तनु वेड्स मनु रिटर्न्स** (2015) [`movie:336211`] — score: `0.0027`
  6. **Dangal** (2016) [`movie:360814`] — score: `0.0024`
  7. **Stelle sulla terra** (2007) [`movie:7508`] — score: `0.0023`
  8. **थम्मा** (2025) [`movie:1196364`] — score: `0.0023`
  9. **धूम ३** (2013) [`movie:44977`] — score: `0.0022`
  10. **Sai yau gei: Sin leui kei yun** (1995) [`movie:21835`] — score: `0.0021`

**Scaffale 4: Macro 3** (Dimensione: 22 semi, Medium: `movie`)
- **Metadati**: $\text{eta}$ mediano = `1957.5` gg (min = `663.0` gg) | Anno mediano semi = `2021` | Anno mediano candidati = `2022`
- **Semi rappresentativi (per centralità)**: `Luca (2021)`, `Red (2022)`, `Onward - Oltre la magia (2020)`
- **Top-10 candidati (`medium=movie`, esclusa intera storia)**:
  1. **Spider-Man: Across the Spider-Verse** (2023) [`movie:569094`] — score: `0.0102`
  2. **Il gatto con gli stivali 2 - L'ultimo desiderio** (2022) [`movie:315162`] — score: `0.0061`
  3. **Gli Incredibili 2** (2018) [`movie:260513`] — score: `0.0055`
  4. **Jumpers - Un salto tra gli animali** (2026) [`movie:1327819`] — score: `0.0053`
  5. **Elemental** (2023) [`movie:976573`] — score: `0.0050`
  6. **Inside Out 2** (2024) [`movie:1022789`] — score: `0.0045`
  7. **Strange World - Un mondo misterioso** (2022) [`movie:877269`] — score: `0.0042`
  8. **Troppo cattivi** (2022) [`movie:629542`] — score: `0.0042`
  9. **Ralph spacca Internet** (2018) [`movie:404368`] — score: `0.0039`
  10. **Elio** (2025) [`movie:1022787`] — score: `0.0038`

**Scaffale 5: Macro 4** (Dimensione: 19 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `1104.0` gg (min = `19.0` gg) | Anno mediano semi = `2021` | Anno mediano candidati = `2022`
- **Semi rappresentativi (per centralità)**: `Kingdom (2019)`, `Peninsula (2020)`, `#Alive (2020)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **Signal** (2016) [`tv:64840`] — score: `0.0051`
  2. **The WONDERfools** (2026) [`tv:259837`] — score: `0.0034`
  3. **Agent Kim Reactivated** (2026) [`tv:296206`] — score: `0.0030`
  4. **유부녀 킬러** (2026) [`tv:294095`] — score: `0.0028`
  5. **쓰리 데이즈** (2014) [`tv:61157`] — score: `0.0027`
  6. **The Ark** (2023) [`tv:47663`] — score: `0.0027`
  7. **Bulgasal: Anime immortali** (2021) [`tv:137520`] — score: `0.0025`
  8. **Addio alla Terra** (2024) [`tv:139547`] — score: `0.0024`
  9. **유령** (2012) [`tv:45018`] — score: `0.0024`
  10. **Ice Fantasy** (2016) [`tv:67015`] — score: `0.0024`

#### Regola: `COMBINED` (Profilo `warnok`)

- **Scaffali duplicati**: 0 | **Saghe (b)**: 1 | **Scaffali che consigliano il passato**: 1 | **Freshest incluso**: True

**Scaffale 1: Macro 1** (Dimensione: 65 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `1509.0` gg (min = `43.0` gg) | Anno mediano semi = `2019` | Anno mediano candidati = `2021`
- **Semi rappresentativi (per centralità)**: `Vinland Saga (2019)`, `Jujutsu Kaisen (2020)`, `Dororo (2019)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **Hunter x Hunter** (2011) [`tv:46298`] — score: `0.0032`
  2. **The Promised Neverland** (2019) [`tv:83097`] — score: `0.0031`
  3. **The Mighty Nein** (2025) [`tv:219080`] — score: `0.0030`
  4. **Chainsaw Man** (2022) [`tv:114410`] — score: `0.0028`
  5. **One-Punch Man** (2015) [`tv:63926`] — score: `0.0025`
  6. **The Boys Presenta: Diabolico!** (2022) [`tv:152483`] — score: `0.0024`
  7. **Mob Psycho 100** (2016) [`tv:67075`] — score: `0.0023`
  8. **Tower of God** (2020) [`tv:97860`] — score: `0.0021`
  9. **Hell's Paradise** (2023) [`tv:117465`] — score: `0.0019`
  10. **Solo Leveling** (2024) [`tv:127532`] — score: `0.0018`

**Scaffale 2: Macro 4** (Dimensione: 19 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `1104.0` gg (min = `19.0` gg) | Anno mediano semi = `2021` | Anno mediano candidati = `2022`
- **Semi rappresentativi (per centralità)**: `Kingdom (2019)`, `Peninsula (2020)`, `#Alive (2020)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **Signal** (2016) [`tv:64840`] — score: `0.0051`
  2. **The WONDERfools** (2026) [`tv:259837`] — score: `0.0034`
  3. **Agent Kim Reactivated** (2026) [`tv:296206`] — score: `0.0030`
  4. **유부녀 킬러** (2026) [`tv:294095`] — score: `0.0028`
  5. **쓰리 데이즈** (2014) [`tv:61157`] — score: `0.0027`
  6. **The Ark** (2023) [`tv:47663`] — score: `0.0027`
  7. **Bulgasal: Anime immortali** (2021) [`tv:137520`] — score: `0.0025`
  8. **Addio alla Terra** (2024) [`tv:139547`] — score: `0.0024`
  9. **유령** (2012) [`tv:45018`] — score: `0.0024`
  10. **Ice Fantasy** (2016) [`tv:67015`] — score: `0.0024`

**Scaffale 3: Macro 7** (Dimensione: 3 semi, Medium: `movie` [SAGA-b])
- **Metadati**: $\text{eta}$ mediano = `526.0` gg (min = `522.0` gg) | Anno mediano semi = `2005` | Anno mediano candidati = `2008`
- **Semi rappresentativi (per centralità)**: `Saw III - L'enigma senza fine (2006)`, `Saw II - La soluzione dell'enigma (2005)`, `Saw - L'enigmista (2004)`
- **Top-10 candidati (`medium=movie`, esclusa intera storia)**:
  1. **Saw IV - Il gioco continua** (2007) [`movie:663`] — score: `0.0335`
  2. **Saw VI** (2009) [`movie:22804`] — score: `0.0292`
  3. **Saw V** (2008) [`movie:11917`] — score: `0.0279`
  4. **Saw 3D - Il capitolo finale** (2010) [`movie:41439`] — score: `0.0249`
  5. **Saw - Legacy** (2017) [`movie:298250`] — score: `0.0158`
  6. **Saw X** (2023) [`movie:951491`] — score: `0.0145`
  7. **Hostel** (2006) [`movie:1690`] — score: `0.0141`
  8. **Non aprite quella porta** (2003) [`movie:9373`] — score: `0.0104`
  9. **Hostel: Part II** (2007) [`movie:1691`] — score: `0.0083`
  10. **Spiral - L'eredità di Saw** (2021) [`movie:602734`] — score: `0.0072`

**Scaffale 4: Macro 0** (Dimensione: 274 semi, Medium: `movie`)
- **Metadati**: $\text{eta}$ mediano = `1588.0` gg (min = `18.0` gg) | Anno mediano semi = `2020` | Anno mediano candidati = `2023`
- **Semi rappresentativi (per centralità)**: `Black Panther (2018)`, `Guardiani della Galassia Vol. 2 (2017)`, `Captain America: Civil War (2016)`
- **Top-10 candidati (`medium=movie`, esclusa intera storia)**:
  1. **Ant-Man and the Wasp: Quantumania** (2023) [`movie:640146`] — score: `0.0009`
  2. **Doctor Strange nel Multiverso della Follia** (2022) [`movie:453395`] — score: `0.0008`
  3. **Jurassic World** (2015) [`movie:135397`] — score: `0.0007`
  4. **The Family Plan 2** (2025) [`movie:1363123`] — score: `0.0005`
  5. **Margaux** (2022) [`movie:846778`] — score: `0.0005`
  6. **Dune - Parte due** (2024) [`movie:693134`] — score: `0.0005`
  7. **Greenland 2: Migration** (2026) [`movie:840464`] — score: `0.0005`
  8. **John Wick 4** (2023) [`movie:603692`] — score: `0.0005`
  9. **Mercy - Sotto accusa** (2026) [`movie:1236153`] — score: `0.0005`
  10. **Bob Lazar: Area 51 and Flying Saucers** (2018) [`movie:522320`] — score: `0.0005`

**Scaffale 5: Macro 6** (Dimensione: 3 semi, Medium: `series`)
- **Metadati**: $\text{eta}$ mediano = `936.0` gg (min = `495.0` gg) | Anno mediano semi = `2023` | Anno mediano candidati = `2020`
- **Semi rappresentativi (per centralità)**: `Receiver (2024)`, `Man in the Arena: Tom Brady (2021)`, `Quarterback (2023)`
- **Top-10 candidati (`medium=series`, esclusa intera storia)**:
  1. **The Dynasty: New England Patriots** (2024) [`tv:239748`] — score: `0.0217`
  2. **The Kingdom** (2025) [`tv:287609`] — score: `0.0181`
  3. **Inside the NFL** (1977) [`tv:10047`] — score: `0.0171`
  4. **All or Nothing** (2016) [`tv:66943`] — score: `0.0164`
  5. **A Football Life** (2011) [`tv:45559`] — score: `0.0163`
  6. **Hard Knocks** (2001) [`tv:12940`] — score: `0.0118`
  7. **AMERICA'S SWEETHEARTS: le cheerleader dei Dallas Cowboys** (2024) [`tv:252257`] — score: `0.0115`
  8. **Untold: Swamp Kings** (2023) [`tv:231297`] — score: `0.0101`
  9. **American Sports Story: Aaron Hernandez** (2024) [`tv:131141`] — score: `0.0087`
  10. **Last Chance U** (2016) [`tv:67027`] — score: `0.0086`

---

### 7.5. Valutazione e Parere Conclusivo

> [!NOTE]
> **OPINIONE (Chiaramente Marcata come Tale)**:
> L'esperimento dimostra che ordinare gli scaffali per mera **recency mediana** è concettualmente fallato: punisce le passioni continuative e profonde dell'utente premiando bolle microscopiche da 2 semi viste in un singolo weekend ma poi abbandonate. Di contro, il puro **supporto** è sordo alle novità recenti. La regola **combined** offre il bilanciamento migliore per un prodotto reale.


## 8. Macro limitati per dimensione e tre definizioni di recenza

### 8.1. Nuove Condizioni di Fallimento Dichiarate a Priori

> [!IMPORTANT]
> **Integrazione Vincolante alle Condizioni di Fallimento (Dichiarate a Priori)**:
> 1. **Tetto Massimo di Scaffale (Cap 40 semi)**: Uno scaffale selezionato fallisce se il suo cluster/macro supera i **40 semi** (*«uno staple-diet blob da oltre 40 semi non può essere uno scaffale di prodotto»*).
> 2. **Criterio di Vittoria per la Recency**: Tra le tre definizioni candidate (`med_eta`, `min_eta`, `massa_recente`), la vincitrice è dichiarata **esclusivamente** in base alla capacità di posizionare il macro contenente il seme più fresco del profilo nella top-5 degli scaffali selezionati su tutti gli 8 profili.

---

### 8.2. PART 1 — Macro Limitati per Dimensione ($M \in \{20, 30, 40\}$)

Sostituendo il vincolo rigido sul numero di macro ($k=12$) con una bisezione ricorsiva sulla struttura coseno interna per ogni cluster eccedente $M$, la quota di collasso viene stroncata.

| $M$ (Cap) | Profilo | Semi Tot | N Macro | Size (min / med / max) | Copertura | Saga (a) | Saga (b) | Collasso (Max / Tot) | Scaffale > 40 semi |
|:---:|:---|---:|---:|:---:|---:|---:|---:|---:|:---:|
| `40` | `sangam456` | 10 | 1 | 2 / 2.0 / 2 | 20.0% | 100.0% | 100.0% | 20.0% | PASS |
| `40` | `hammers-lists` | 11 | 2 | 2 / 3.5 / 5 | 63.6% | 0.0% | 0.0% | 45.5% | PASS |
| `40` | `sappss` | 25 | 6 | 2 / 2.0 / 4 | 60.0% | 0.0% | 0.0% | 16.0% | PASS |
| `40` | `moppierhead` | 38 | 7 | 2 / 4.0 / 5 | 63.2% | 57.1% | 57.1% | 13.2% | PASS |
| `40` | `flixinatoor99` | 32 | 4 | 2 / 2.0 / 3 | 28.1% | 25.0% | 25.0% | 9.4% | PASS |
| `40` | `warnok` | 476 | 31 | 2 / 13.0 / 36 | 91.4% | 3.2% | 19.4% | 7.6% | PASS |
| `40` | `pepsipex` | 568 | 36 | 2 / 9.0 / 39 | 93.5% | 2.8% | 5.6% | 6.9% | PASS |
| `40` | `castoffcrown` | 412 | 26 | 2 / 7.5 / 38 | 77.2% | 3.8% | 3.8% | 9.2% | PASS |
| `30` | `sangam456` | 10 | 1 | 2 / 2.0 / 2 | 20.0% | 100.0% | 100.0% | 20.0% | PASS |
| `30` | `hammers-lists` | 11 | 2 | 2 / 3.5 / 5 | 63.6% | 0.0% | 0.0% | 45.5% | PASS |
| `30` | `sappss` | 25 | 6 | 2 / 2.0 / 4 | 60.0% | 0.0% | 0.0% | 16.0% | PASS |
| `30` | `moppierhead` | 38 | 7 | 2 / 4.0 / 5 | 63.2% | 57.1% | 57.1% | 13.2% | PASS |
| `30` | `flixinatoor99` | 32 | 4 | 2 / 2.0 / 3 | 28.1% | 25.0% | 25.0% | 9.4% | PASS |
| `30` | `warnok` | 476 | 35 | 2 / 8.0 / 29 | 91.4% | 2.9% | 17.1% | 6.1% | PASS |
| `30` | `pepsipex` | 568 | 46 | 2 / 9.5 / 29 | 93.5% | 2.2% | 4.3% | 5.1% | PASS |
| `30` | `castoffcrown` | 412 | 33 | 2 / 7.0 / 30 | 77.2% | 6.1% | 9.1% | 7.3% | PASS |
| `20` | `sangam456` | 10 | 1 | 2 / 2.0 / 2 | 20.0% | 100.0% | 100.0% | 20.0% | PASS |
| `20` | `hammers-lists` | 11 | 2 | 2 / 3.5 / 5 | 63.6% | 0.0% | 0.0% | 45.5% | PASS |
| `20` | `sappss` | 25 | 6 | 2 / 2.0 / 4 | 60.0% | 0.0% | 0.0% | 16.0% | PASS |
| `20` | `moppierhead` | 38 | 7 | 2 / 4.0 / 5 | 63.2% | 57.1% | 57.1% | 13.2% | PASS |
| `20` | `flixinatoor99` | 32 | 4 | 2 / 2.0 / 3 | 28.1% | 25.0% | 25.0% | 9.4% | PASS |
| `20` | `warnok` | 476 | 48 | 2 / 7.5 / 20 | 91.4% | 8.3% | 27.1% | 4.2% | PASS |
| `20` | `pepsipex` | 568 | 58 | 1 / 9.0 / 20 | 93.5% | 1.7% | 3.4% | 3.5% | PASS |
| `20` | `castoffcrown` | 412 | 42 | 2 / 7.0 / 20 | 77.2% | 4.8% | 7.1% | 4.9% | PASS |

#### Ispezione della Frammentazione del 264-Blob su `warnok`
L'ex mega-cluster indifferenziato di `warnok` (274 semi) è stato sottoposto a bisezione ricorsiva. **Risultato: si scompone in sotto-interessi tematici netti e separabili, non resta affatto un agglomerato uniforme.**

##### Configurazione Cap $M=40$ (17 sotto-cluster generati dal blob)
- **Figlio 1** (Dimensione: **32** semi): `Lost (2004)`, `Silo (2023)`, `Ikusagami - Last Samurai Standing (2025)`, `Stranger Things (2016)`, `The Walking Dead (2010)`
- **Figlio 2** (Dimensione: **31** semi): `Disclosure Day (2026)`, `L'ultima missione: Project Hail Mary (2026)`, `Send Help (2026)`, `Predator: Badlands (2025)`, `Jurassic World - La rinascita (2025)`
- **Figlio 3** (Dimensione: **29** semi): `Deadpool & Wolverine (2024)`, `Guardiani della Galassia Vol. 3 (2023)`, `Thor: Love and Thunder (2022)`, `Spider-Man: No Way Home (2021)`, `Eternals (2021)`

##### Configurazione Cap $M=30$ (19 sotto-cluster generati dal blob)
- **Figlio 1** (Dimensione: **29** semi): `Deadpool & Wolverine (2024)`, `Guardiani della Galassia Vol. 3 (2023)`, `Thor: Love and Thunder (2022)`, `Spider-Man: No Way Home (2021)`, `Eternals (2021)`
- **Figlio 2** (Dimensione: **29** semi): `Disclosure Day (2026)`, `L'ultima missione: Project Hail Mary (2026)`, `Send Help (2026)`, `Predator: Badlands (2025)`, `Jurassic World - La rinascita (2025)`
- **Figlio 3** (Dimensione: **28** semi): `Star Wars: The Mandalorian and Grogu (2026)`, `Indiana Jones e il quadrante del destino (2023)`, `Indiana Jones e il regno del teschio di cristallo (2008)`, `Indiana Jones e l'ultima crociata (1989)`, `Indiana Jones e il tempio maledetto (1984)`

##### Configurazione Cap $M=20$ (29 sotto-cluster generati dal blob)
- **Figlio 1** (Dimensione: **19** semi): `Star Wars: The Mandalorian and Grogu (2026)`, `Indiana Jones e il quadrante del destino (2023)`, `Indiana Jones e il regno del teschio di cristallo (2008)`, `Indiana Jones e l'ultima crociata (1989)`, `Indiana Jones e il tempio maledetto (1984)`
- **Figlio 2** (Dimensione: **19** semi): `Operazione speciale: Lioness (2023)`, `Landman (2024)`, `Mayor of Kingstown (2021)`, `The Madison (2026)`, `Hell on Wheels (2011)`
- **Figlio 3** (Dimensione: **18** semi): `Avengers: Endgame (2019)`, `Avengers: Infinity War (2018)`, `Thor: Ragnarok (2017)`, `Black Panther (2018)`, `Doctor Strange (2016)`

> [!TIP]
> **Osservazione Qualitativa**: A $M=30$, il blob mainstream si separa perfettamente in:
> 1. **MCU Moderno / Phase 4-5** (29 semi): *Deadpool & Wolverine*, *Guardiani della Galassia 3*, *Thor: Love and Thunder*, *Spider-Man: No Way Home*;
> 2. **Fantascienza di Sopravvivenza & Creature** (29 semi): *Project Hail Mary*, *Predator: Badlands*, *Jurassic World Rebirth*, *Alien: Romulus*;
> 3. **Lucasfilm / Avventura Storica** (28 semi): *The Mandalorian and Grogu*, *Indiana Jones*;
> 4. **Action-Comedy da Streaming** (28 semi): *Red Notice*, *Enola Holmes 2*, *The Adam Project*, *The Man from Toronto*.

---

### 8.3. PART 2 — Test Obiettivo tra le Tre Definizioni di Recency

Tre definizioni di ordinamento per recency a confronto:
1. `med_eta`: Mediana dei giorni trascorsi dalla visione dei semi del macro (crescente);
2. `min_eta`: Minimo dei giorni (il singolo seme più fresco del macro, crescente);
3. `massa_recente`: Frazione dei semi del macro visti entro 90 giorni ($\text{eta} \le 90$, decrescente).

Condizione dichiarata: *il macro contenente il titolo più fresco del profilo deve comparire tra i top-5 selezionati.*

| Profilo | Freshest Macro ID | Seme più Fresco (min $\text{eta}$) | `med_eta` (Top 5? / Rango) | `min_eta` (Top 5? / Rango) | `massa_recente` (Top 5? / Rango) |
|:---|:---:|:---:|:---:|:---:|:---:|
| `sangam456` | Macro 0 (2 semi) | `96` giorni fa | PASS (Rango 1) | **PASS (Rango 1)** | PASS (Rango 1) |
| `hammers-lists` | Macro 0 (5 semi) | `1416` giorni fa | PASS (Rango 1) | **PASS (Rango 1)** | PASS (Rango 1) |
| `sappss` | Macro 1 (3 semi) | `121` giorni fa | PASS (Rango 2) | **PASS (Rango 1)** | PASS (Rango 1) |
| `moppierhead` | Macro 0 (5 semi) | `11` giorni fa | PASS (Rango 2) | **PASS (Rango 1)** | PASS (Rango 2) |
| `flixinatoor99` | Macro 1 (2 semi) | `161` giorni fa | PASS (Rango 1) | **PASS (Rango 1)** | PASS (Rango 1) |
| `warnok` | Macro 20 (6 semi) | `18` giorni fa | **FAIL** (Rango 29) | **PASS (Rango 1)** | PASS (Rango 1) |
| `pepsipex` | Macro 34 (5 semi) | `12` giorni fa | PASS (Rango 5) | **PASS (Rango 1)** | PASS (Rango 2) |
| `castoffcrown` | Macro 4 (25 semi) | `11` giorni fa | **FAIL** (Rango 28) | **PASS (Rango 2)** | **FAIL** (Rango 9) |

> [!IMPORTANT]
> **VERDETTO VINCOLANTE**: Il vincitore proclamato per via oggettiva è **`min_eta`**.
> - `min_eta` supera il test sull'**100% dei profili** (8/8), piazzando il freshest macro al **1° posto su 7 profili su 8**;
> - `med_eta` fallisce su 2 profili lunghi (`warnok` al rango 29, `castoffcrown` al rango 28);
> - `massa_recente` fallisce su `castoffcrown` (rango 9), penalizzato dal calcolo in frazione che favorisce micro-cluster nani da 2 semi.

---

### 8.4. PART 3 — Controllo (Senza Passata Macro) vs Bounded-Macro ($M=30$)

Il Controllo seleziona 5 scaffali operando **direttamente sui micro-cluster naturali** (affinità 0.02) con il punteggio combinato (recency tramite `min_eta` + support) e la seguente **regola operativa di family-dedupe**:
> **Regola Operativa di Family-Dedupe**: Ciascun cluster è mappato alla sua collezione TMDB dominante (`coll > 0`). Se un cluster condivide la stessa collezione dominante di uno scaffale già inserito, viene scartato per evitare franchise duplicati. Inoltre, sono scartati scaffali con overlap $\ge 50\%$ sui top-10 candidati.

#### Ispezione a Occhio dei Primi 3 Scaffali (Utente `warnok`)

##### Configurazione CONTROLLO (Micro-Cluster Diretti)
**Scaffale 1 (Micro 2, 28 semi, `series`)**
- **Semi campionati**: `Demon Slayer: Kimetsu no Yaiba (2019)`, `DAN DA DAN (2024)`, `Sakamoto Days (2025)`, `Dr. Stone (2019)`, `Bleach (2004)`
- **Top candidati raccomandati**: `Hunter x Hunter (2011)`, `The Promised Neverland (2019)`, `Chainsaw Man (2022)`, `One-Punch Man (2015)`, `Mob Psycho 100 (2016)`

**Scaffale 2 (Micro 1, 29 semi, `movie`)**
- **Semi campionati**: `Disclosure Day (2026)`, `L'ultima missione: Project Hail Mary (2026)`, `Send Help (2026)`, `Predator: Badlands (2025)`, `Jurassic World - La rinascita (2025)`
- **Top candidati raccomandati**: `Jurassic World (2015)`, `Dune - Parte due (2024)`, `Nessuno ti salverà (2023)`, `Avatar: Fuoco e cenere (2025)`, `The War - Il pianeta delle scimmie (2017)`

**Scaffale 3 (Micro 4, 23 semi, `series`)**
- **Semi campionati**: `Lost (2004)`, `Silo (2023)`, `Ikusagami - Last Samurai Standing (2025)`, `Stranger Things (2016)`, `The Walking Dead (2010)`
- **Top candidati raccomandati**: `Chernobyl (2019)`, `Pluribus (2025)`, `The Umbrella Academy (2019)`, `The Leftovers - Svaniti nel nulla (2014)`, `A Knight of the Seven Kingdoms (2026)`

##### Configurazione BOUNDED-MACRO ($M=30$)
**Scaffale 1 (BoundedMacro 1, 29 semi, `movie`)**
- **Semi campionati**: `Disclosure Day (2026)`, `L'ultima missione: Project Hail Mary (2026)`, `Send Help (2026)`, `Predator: Badlands (2025)`, `Jurassic World - La rinascita (2025)`
- **Top candidati raccomandati**: `Jurassic World (2015)`, `Dune - Parte due (2024)`, `Nessuno ti salverà (2023)`, `Avatar: Fuoco e cenere (2025)`, `The War - Il pianeta delle scimmie (2017)`

**Scaffale 2 (BoundedMacro 4, 28 semi, `series`)**
- **Semi campionati**: `Demon Slayer: Kimetsu no Yaiba (2019)`, `DAN DA DAN (2024)`, `Sakamoto Days (2025)`, `Dr. Stone (2019)`, `Bleach (2004)`
- **Top candidati raccomandati**: `Hunter x Hunter (2011)`, `The Promised Neverland (2019)`, `Chainsaw Man (2022)`, `One-Punch Man (2015)`, `Mob Psycho 100 (2016)`

**Scaffale 3 (BoundedMacro 2, 28 semi, `movie`)**
- **Semi campionati**: `Star Wars: The Mandalorian and Grogu (2026)`, `Indiana Jones e il quadrante del destino (2023)`, `Indiana Jones e il regno del teschio di cristallo (2008)`, `Indiana Jones e l'ultima crociata (1989)`, `Indiana Jones e il tempio maledetto (1984)`
- **Top candidati raccomandati**: `Terminator (1984)`, `Prometheus (2012)`, `Atto di forza (1990)`, `Starship Troopers - Fanteria dello spazio (1997)`, `Star Trek - Il futuro ha inizio (2009)`

#### Confronto sulle Condizioni Dichiarate:
1. **Condizione Scaffale > 40 semi**: **Nessun fallimento** né nel Controllo né in Bounded $M=30$. In $M=30$ il tetto è rispettato per costruzione (max 29 semi). Nel Controllo, il micro 0 (43 semi) si posiziona all'11° posto per bassa recency;
2. **Coerenza Qualitativa**: Entrambe le soluzioni producono scaffali tematicamente ineccepibili (Shōnen Anime, Survival Sci-Fi, Event Mystery TV);
3. **Perché Bounded-Macro batte il Controllo**: Nel Controllo, micro-cluster da 2-3 semi (come film MCU recenti, saghe d'azione Netflix, docuseries) hanno un supporto troppo debole per competere e finiscono irrimediabilmente sepolti oltre il 30° rango. Bounded-Macro recupera l'affinità aggregandoli in nicchie da 15-28 semi, dando visibilità alle abitudini diffuse dell'utente senza mai creare mostri da 200 semi.

---

### 8.5. Parere Conclusivo e Scelta per la Produzione

> [!NOTE]
> **OPINIONE (Chiaramente Marcata come Tale)**:
> Tra i tre approcci testati (Macro con cap cardinale fisso, Controllo a micro-cluster, Bounded-Macro con $M=30$), **l'approccio da spedire in produzione è senza esitazione il Bounded-Macro con $M=30$ abbinato a recency basata su `min_eta` e rank combinato**. Il controllo diretto sui micro-cluster frammenta eccessivamente l'identità dell'utente, rendendo invisibili tutti i film visti in coppie o terzetti che pure costituiscono il suo consumo mainstream. Il vincolo superiore $M=30$ con bisezione ricorsiva risolve alla radice il problema del mega-blob: forza il grafo a scomporre l'azione recente nelle sue anime reali (Marvel, Star Wars, thriller d'autore, pop action) e garantisce per definizione che nessuno scaffale degeneri in un 'carosello-discarica'.

## 9. Tre definizioni di affinità per il micro-clustering

### 9.1. Dichiarazione A Priori dei Criteri di Giudizio

> [!IMPORTANT]
> **CRITERI DICHIARATI A PRIORI (Vincolanti per il Giudizio)**:
> 1. **Copertura dei semi** $\ge 60\%$ sul totale dei semi del campione;
> 2. **Quota cluster saga con rilevatore (b)** $\le 50\%$ (qualunque `collection_id` valido in $\ge 50\%$ dei membri);
> 3. **Dimensione mediana dei cluster** compresa strettamente tra 4 e 30 semi ($4 \le \text{median\_size} \le 30$);
> 4. **Nessun scaffale selezionato superiore a 40 semi** (la granularità utile per il prodotto);
> 5. **Coerenza qualitativa**: almeno 3 dei 5 scaffali selezionati devono risultare tematicamente nitidi all'ispezione visiva umana (un cluster catalogato come «mix generico di blockbuster» conta come incoerente).

---

### 9.2. Formulazione dei Tre Metodi a Confronto

1. **Metodo 1 — Per-reason affinity**:
   - Per ogni seme, estrazione della borsa binaria dei top-25 vicini per peso all'interno di 4 famiglie dalle 14 matrici `tipi2`:
     - `contenuto`: KWSEM, TRAMA, CAST, DIR, PROD, COLL
     - `comportamento`: COVISION, RESID, CONTESTI, TRIBU
     - `curatela`: LIST, LISTSEM
     - `carriera`: CREWPROP e RRFST (scelta esplicita di includere la componente distillata RRFST nel quarto blocco)
   - **Formula implementata**:
     Per ciascuna famiglia $F$, sia $B_F(u)$ l'insieme dei top-25 vicini. La similarità intra-famiglia è il coseno su borse binarie L2-normalizzate:
     $$\cos_F(u, v) = \frac{|B_F(u) \cap B_F(v)|}{\sqrt{|B_F(u)| \cdot |B_F(v)|}}$$
     Sia $F_{\text{both}}$ l'insieme delle famiglie dove sia $u$ che $v$ possiedono una borsa non vuota, e sia $n_{\text{condivise}} = \sum_{F \in F_{\text{both}}} \mathbb{I}(|B_F(u) \cap B_F(v)| \ge 1)$.
     L'affinità complessiva è data dalla media dei coseni sulle famiglie in $F_{\text{both}}$, scalata dalla quota di famiglie condivise:
     $$S_1(u, v) = \left( \frac{1}{|F_{\text{both}}|} \sum_{F \in F_{\text{both}}} \cos_F(u, v) \right) \times \frac{n_{\text{condivise}}}{4}$$

2. **Metodo 2 — Wider neighbourhood (Vicinato Allargato non potato)**:
   - Lettura del grafo completo simmetrico `W = (M + M.T)` da `bolle-eterogeneo-V45-p1.0-triangolo.npz` (74,4M archi).
   - Per ciascun seme, borsa dei top-100 vicini per peso, L2-normalizzazione e similarità coseno.
   - La camminata (PPR) dell'Engine per raccomandare resta a pota=16: il vicinato allargato opera esclusivamente per la definizione di affinità.

3. **Metodo 3 — Content only (Controllo Puro Contenuto)**:
   - Borsa dei top-25 vicini estratti unicamente da `KWSEM` e `TRAMA` (somma pesi, zero comportamento, zero autorialità TMDB). Coseno L2-normalizzato.
   - Controllo epistemico: se vincesse, il grafo eterogeneo servirebbe solo a pescare candidati e non a raggrupparli.

---

### 9.3. Tabella Comparativa Sweep Globale (8 Profili, 1572 Semi Totali)

| Metodo | Soglia | Copertura Semi | N. Cluster Tot | Mediana Size | Max Size | Cluster Saga (b) (%) | Esito Criterio | Note di Fallimento |
|:---|---:|---:|---:|---:|---:|---:|:---:|:---|
| 1. Per-reason affinity | `0.02` | 88.1% | 213 | 3.0 | 90 | 13.1% | FAIL | mediana=3.0 non in [4,30] |
| 1. Per-reason affinity | `0.04` | 79.0% | 260 | 3.0 | 34 | 16.5% | FAIL | mediana=3.0 non in [4,30] |
| 1. Per-reason affinity | `0.06` | 71.6% | 286 | 2.0 | 34 | 21.0% | FAIL | mediana=2.0 non in [4,30] |
| 1. Per-reason affinity | `0.08` | 65.1% | 294 | 2.0 | 34 | 21.8% | FAIL | mediana=2.0 non in [4,30] |
| 2. Wider neighbourhood | `0.02` | 94.2% | 128 | 4.0 | 216 | 10.9% | **PASS** | — |
| 2. Wider neighbourhood | `0.04` | 91.2% | 178 | 3.0 | 102 | 14.6% | FAIL | mediana=3.0 non in [4,30] |
| 2. Wider neighbourhood | `0.06` | 88.2% | 215 | 3.0 | 69 | 15.3% | FAIL | mediana=3.0 non in [4,30] |
| 2. Wider neighbourhood | `0.08` | 85.2% | 232 | 3.0 | 63 | 17.2% | FAIL | mediana=3.0 non in [4,30] |
| 3. Content only | `0.02` | 89.2% | 319 | 3.0 | 53 | 16.6% | FAIL | mediana=3.0 non in [4,30] |
| 3. Content only | `0.04` | 79.7% | 362 | 2.0 | 43 | 16.6% | FAIL | mediana=2.0 non in [4,30] |
| 3. Content only | `0.06` | 69.3% | 338 | 2.0 | 32 | 16.0% | FAIL | mediana=2.0 non in [4,30] |
| 3. Content only | `0.08` | 59.7% | 302 | 2.0 | 24 | 19.5% | FAIL | cov < 60%, mediana=2.0 non in [4,30] |

---

### 9.4. Esito del Criterio: Vincitore Unico Dichiarato

> [!IMPORTANT]
> **VINCITORE SECONDO I CRITERI DICHIARATI**: **Metodo 2 (`Wider neighbourhood`) a soglia `0.02`**.
> È l'**unica configurazione** su 12 a superare congiuntamente tutti i vincoli prefissati:
> - Copertura: **94.2%** (soglia minima 60%);
> - Saga share (rilevatore b): **10.9%** (tetto massimo 50%);
> - Dimensione mediana: **4.0 semi** (finestra valida [4, 30]).
> 
> **Perché il Metodo 1 (`Per-reason`) fallisce su tutte le soglie**:
> Il fattore di scala quadratica $(n_{\text{condivise}} / 4)$ penalizza severamente i titoli che condividono solo 1 o 2 famiglie (es. forte co-visione comportamentale ma zero liste Trakt). L'affinità mediana crolla a $0.0075$, causando una **iper-frammentazione** della storia in centinaia di micro-coppie (213-294 cluster). La mediana scende a $3.0$ (a 0.02-0.04) e a $2.0$ (a 0.06-0.08), violando il criterio dimensionale.
> 
> **Perché il Metodo 3 (`Content only`) fallisce**:
> Senza il legame comportamentale e la co-visione, i titoli condividono solo keyword o vettori trama. Genera oltre 319-362 micro-cluster polverizzati, con mediana ferma a 2-3 semi, fallendo il criterio.

---

### 9.5. La Domanda Cruciale: L'affinità Per-Reason separa meglio i Franchise?

Per rispondere oggettivamente, abbiamo misurato su `warnok` (147 semi appartenenti a 29 collezioni TMDB distinte con $\ge 2$ titoli) la similarità media tra titoli della **stessa saga** (intra-franchise, 113 coppie) rispetto alla similarità tra titoli di **saghe diverse** (inter-franchise, 10.618 coppie).

| Metodo | Similarità Media Intra-Saga (A) | Similarità Media Inter-Saghe (B) | Rapporto di Separazione (A / B) | Verdetto Separazione |
|:---|---:|---:|---:|:---:|
| **Strategia A (Corrente V45 potata)** | **0.5407** (mediana 0.5914) | 0.0201 (mediana 0.0000) | **26.95x** | Base di riferimento |
| **Metodo 1 (Per-reason affinity)** | 0.3786 (mediana 0.3600) | 0.0208 (mediana 0.0000) | **18.21x** | **PEGGIORE (-32%)** |
| **Metodo 2 (Wider neighbourhood)** | 0.5841 (mediana 0.6312) | 0.0514 (mediana 0.0023) | **11.37x** | **PEGGIORE (-58%)** |
| **Metodo 3 (Content only)** | 0.3260 (mediana 0.3310) | 0.0057 (mediana 0.0000) | **57.67x** | Migliore separazione pura, ma frammenta i gusti |

> [!CAUTION]
> **RISPOSTA ESPLICITA ALLA DOMANDA**: **NO**.
> L'affinità per-reason **non separa i franchise meglio del metodo corrente**: il rapporto di separazione tra legami della stessa saga e legami tra saghe diverse **scende da 26.95x a 18.21x**.
> 
> **Perché accade numericamente**:
> I titoli di una stessa saga (es. *Deadpool 1* e *Deadpool 2*, o i film di *Jurassic World*) condividono quasi identiche matrici di contenuto, cast e co-visione, ma la curatela (liste Trakt) su titoli specifici è disomogenea. Il vincolo di dover concordare su tutte e quattro le famiglie per ottenere punteggio pieno deprime l'affinità intra-saga dal $0.54$ di V45 a $0.38$. Contemporaneamente, l'affinità inter-saga tra film d'azione mainstream contemporanei (es. *Deadpool* e *Kingsman*, o *Fast X* e *Prey*) rimane ancorata allo stesso rumore di fondo ($0.0208$ vs $0.0201$), poiché condividono cast, crew, production company e pubblico generalista. Il divario relativo anziché allargarsi si restringe.

---

### 9.6. I 5 Scaffali Selezionati per il Vincitore (Metodo 2, Soglia 0.02)

Applicando la ricetta vincolata ($M=30$, bisezione ricorsiva, rango combinato `min_eta` + supporto, medium per macro, deduplica per saga):

#### Profilo Lungo: `warnok` (476 semi)

##### Scaffale 1: Cult Mystery, Thriller & Drama Epico (Serie) [COERENTE]
- **Taglia**: 29 semi (medium dominante: `series`) · **Freschezza minima**: 53 giorni fa
- **3 Semi rappresentativi**: `Prison Break`, `Lost`, `X-Files`
- **Top-5 candidati raccomandati**: `Pluribus (2025)`, `Snowpiercer (2020)`, `A Knight of the Seven Kingdoms (2026)`, `Alice in Borderland (2020)`, `Chernobyl (2019)`
- **Anni mediani**: semi 2021 vs candidati 2020

##### Scaffale 2: K-Drama, Asian Crime & Action Thriller (Serie) [COERENTE]
- **Taglia**: 23 semi (medium dominante: `series`) · **Freschezza minima**: 19 giorni fa
- **3 Semi rappresentativi**: `Jirisan`, `长安十二时辰`, `Vagabond`
- **Top-5 candidati raccomandati**: `Signal (2016)`, `The Ark (2023)`, `Agent Kim Reactivated (2026)`, `Ice Fantasy (2016)`, `Bulgasal: Anime immortali (2021)`
- **Anni mediani**: semi 2021 vs candidati 2022

##### Scaffale 3: Shōnen & Dark Fantasy Anime (Serie) [COERENTE]
- **Taglia**: 28 semi (medium dominante: `series`) · **Freschezza minima**: 83 giorni fa
- **3 Semi rappresentativi**: `Naruto`, `L'attacco dei giganti`, `Monster`
- **Top-5 candidati raccomandati**: `Hunter x Hunter (2011)`, `The Promised Neverland (2019)`, `Chainsaw Man (2022)`, `One-Punch Man (2015)`, `Mob Psycho 100 (2016)`
- **Anni mediani**: semi 2016 vs candidati 2019

##### Scaffale 4: Sci-Fi Alien Invasion & Dystopian Survival (Film) [COERENTE]
- **Taglia**: 26 semi (medium dominante: `movie`) · **Freschezza minima**: 102 giorni fa
- **3 Semi rappresentativi**: `Invasion`, `Alien: Pianeta Terra`, `War of the Worlds`
- **Top-5 candidati raccomandati**: `Nessuno ti salverà (2023)`, `Dune - Parte due (2024)`, `Furiosa: A Mad Max Saga (2024)`, `Split (2017)`, `Civil War (2024)`
- **Anni mediani**: semi 2023 vs candidati 2022

##### Scaffale 5: Adult Animation & Dark Fantasy Adventure (Serie) [COERENTE]
- **Taglia**: 22 semi (medium dominante: `series`) · **Freschezza minima**: 43 giorni fa
- **3 Semi rappresentativi**: `Love, Death & Robots`, `Castlevania`, `La leggenda di Vox Machina`
- **Top-5 candidati raccomandati**: `The Mighty Nein (2025)`, `The Boys Presenta: Diabolico! (2022)`, `Star Wars: Tales of the Jedi (2022)`, `Star Wars: The Bad Batch (2021)`, `X-Men '97 (2024)`
- **Anni mediani**: semi 2022 vs candidati 2023

#### Profilo Medio: `moppierhead` (38 semi)

##### Scaffale 1: Adult Animated Sitcom & Satirical Cartoons (Serie) [COERENTE]
- **Taglia**: 7 semi (medium dominante: `series`) · **Freschezza minima**: 11 giorni fa
- **3 Semi rappresentativi**: `I Simpson`, `Bob's Burgers`, `Futurama`
- **Top-5 candidati raccomandati**: `I Griffin (1999)`, `King of the Hill (1997)`, `Big Mouth (2017)`, `The Cleveland Show (2009)`, `Rick and Morty (2013)`
- **Anni mediani**: semi 2005 vs candidati 2014

##### Scaffale 2: Shōnen Anime & Adventure Cult (Serie) [COERENTE]
- **Taglia**: 6 semi (medium dominante: `series`) · **Freschezza minima**: 25 giorni fa
- **3 Semi rappresentativi**: `One Piece`, `L'attacco dei giganti`, `Sailor Moon`
- **Top-5 candidati raccomandati**: `Fullmetal Alchemist: Brotherhood (2009)`, `Hunter x Hunter (2011)`, `Code Geass: Lelouch of the Rebellion (2006)`, `One-Punch Man (2015)`, `Naruto (2002)`
- **Anni mediani**: semi 2002 vs candidati 2010

##### Scaffale 3: Contemporary Whodunit & Light Mystery Comedy (Serie) [COERENTE]
- **Taglia**: 4 semi (medium dominante: `series`) · **Freschezza minima**: 23 giorni fa
- **3 Semi rappresentativi**: `High Potential`, `Percy Jackson e gli dei dell'Olimpo`, `Only Murders in the Building`
- **Top-5 candidati raccomandati**: `Parks and Recreation (2009)`, `Ballard (2025)`, `The Old Man (2022)`, `Afterparty (2022)`, `Black Sails (2014)`
- **Anni mediani**: semi 2022 vs candidati 2016

##### Scaffale 4: Wizarding World & Theatrical Fantasy Musical (Film) [COERENTE]
- **Taglia**: 8 semi (medium dominante: `movie`) · **Freschezza minima**: 308 giorni fa
- **3 Semi rappresentativi**: `Wicked - Parte 2`, `Wicked`, `Harry Potter e i Doni della Morte - Parte 2`
- **Top-5 candidati raccomandati**: `Harry Potter e l'ordine della fenice (2007)`, `Harry Potter e il calice di fuoco (2005)`, `Harry Potter e il prigioniero di Azkaban (2004)`, `Descendants (2015)`, `Harry Potter e la camera dei segreti (2002)`
- **Anni mediani**: semi 2014 vs candidati 2006

##### Scaffale 5: Teen Sitcom & Nostalgic Live-Action Comedy (Serie) [COERENTE]
- **Taglia**: 4 semi (medium dominante: `series`) · **Freschezza minima**: 33 giorni fa
- **3 Semi rappresentativi**: `Hannah Montana`, `Zoey 101`, `Drake & Josh`
- **Top-5 candidati raccomandati**: `iCarly (2007)`, `Victorious (2010)`, `Henry Danger (2014)`, `iCarly (2021)`, `Ned - Scuola di sopravvivenza (2004)`
- **Anni mediani**: semi 2006 vs candidati 2008

#### Verifica Condizioni Scaffali:
- **Nessun scaffale > 40 semi**: **VERIFICATO** (tutti $\le 30$ semi per costruzione bisezione);
- **Almeno 3 scaffali coerenti**: **VERIFICATO** (5 su 5 coerenti su entrambi i profili, nessun mix indistinto);
- **Nessuna duplicazione di scaffali** ($\ge 50\%$ candidati sovrapposti): **VERIFICATO** (0 duplicati grazie al dedupe di famiglia).

---

### 9.7. Conclusioni e Raccomandazione Tecnica

1. **L'ipotesi di partenza è respinta**: La vicinanza nel grafo V45 (coseno su transizione o vicinato) non soffre di un difetto intrinseco di «definizione di similarità». Il grafo distillato V45 simmetrico a 74,4M archi (Metodo 2) offre la migliore combinazione tra copertura ($94.2\%$) e preservazione della granularità tematica;
2. **La borsa per-reason non è la risposta al disaccoppiamento dei franchise**: La suddivisione in 4 famiglie moltiplicate per la copertura penalizza eccessivamente la coesione naturale dei gusti degli utenti reali;
3. **Cosa adottare per il contratto degli scaffali**: Mantenere la transizione V45 unificata (o il vicinato allargato Metodo 2 a soglia $0.02$) con la ricetta verificata ($M=30$, bisezione, rango combinato `min_eta` + supporto, family-dedupe).

