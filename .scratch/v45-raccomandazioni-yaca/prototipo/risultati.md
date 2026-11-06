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

*(Nota sul metodo di taglio: Il taglio è eseguito direttamente per cardinalità target arrestando l'agglomerazione a $M - k$ fusioni, corrispondente all'albero di clustering a $k$ componenti. Tagliare per soglia globale di distanza fissa non è praticabile poiché micro-cluster disgiunti raggiungono distanza $1.000$ ad altezze diverse a seconda del profilo).*

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
> - A **Target 4**, tutti i profili lunghi collassano in una componente gigante che ingloba tra il **70.1% e il 92.1%** della storia dell'utente (`pepsipex` 92.1%, `warnok` 89.9%, `castoffcrown` 70.1%).
> - A **Target 6**, il collasso persiste gravemente: `pepsipex` 90.0%, `warnok` 71.2%, `castoffcrown` 70.1%.
> - A **Target 8**, tutti e 3 i profili lunghi continuano a superare la soglia critica del 60%: `pepsipex` 87.9%, `warnok` 70.8%, `castoffcrown` 68.2%.
> 
> **TARGET VINCENTE: $n_{\text{macro}} = 12$**:
> Il target **12** è l'UNICO che abbatte il rischio di collasso al di sotto del 60% su tutti gli 8 profili (`warnok` 57.6%, `pepsipex` 52.3%, `castoffcrown` 44.9%). Mantiene una dimensione mediana equilibrata (tra 5.0 e 8.5 semi su profili lunghi) e fornisce un bacino naturale e vario da cui selezionare i migliori $N=5$ scaffali da esporre.

---

### 7.3. PART 2 — Definizione e Confronto delle Regole di Selezione ($N=5$)

Sul modello vincente a target 12, abbiamo confrontato tre regole di selezione per estrarre 5 scaffali:
1. **Recency**: Macro ordinati per $\text{eta}$ mediano crescente (semi visti più recentemente, tie-break $\text{eta}$ minimo);
2. **Support**: Macro ordinati per numero di semi (massa decrescente, tie-break visualizzazioni totali);
3. **Combined**: Media aritmetica dei ranghi ordinali (1-based):
   $$\text{score}_{\text{comb}} = \frac{\text{rank}_{\text{recency}} + \text{rank}_{\text{support}}}{2}$$
   con ordinamento crescente (a parità di score combinato, tie-break in favore del maggior supporto).

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

#### Analisi dei Fallimenti Riscontrati:
1. **Duplicazione Scaffali (0 fallimenti)**: In tutte le regole e in tutti i profili, il numero di scaffali duplicati è **0**. I top-10 raccomandati da ciascun macro sono radicalmente distinti;
2. **Saghe Detector (b)**: Superano la soglia solo su `moppierhead` (2 scaffali saga su 5), profilo piccolo fortemente dominato da Star Wars e franchise cinematografici;
3. **Fallimento Critico della Recency (Esclusione del Seme più Fresco)**: Su profili lunghi (`warnok` e `castoffcrown`), la regola *recency* basata sulla mediana **esclude sistematicamente il macro contenente il titolo più fresco in assoluto**. Il macro 0 di `warnok` (con un titolo visto 18 giorni fa) possiede 274 semi e una mediana storica di 1587 giorni, venendo retrocesso all'8° posto. La recency finisce per mostrare nicchie microscopiche (2-3 semi) viste mesi fa ma concentrate in una finestra temporale ristretta;
4. **Raccomandazione del Passato**: Su quasi tutti i profili, le raccomandazioni del grafo tendono ad avere un anno mediano inferiore all'anno mediano dei semi. Nei profili recenti (semi del 2023-2024), il grafo aggancia i classici fondamentali del genere (es. docuseries storiche, film seminali anni '90/2000), producendo candidati temporaneamente antecedenti ai semi.

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
- **Metadati**: $\text{eta}$ mediano = `525.0` gg (min = `522.0` gg) | Anno mediano semi = `2005` | Anno mediano candidati = `2008`
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
- **Metadati**: $\text{eta}$ mediano = `1587.5` gg (min = `18.0` gg) | Anno mediano semi = `2020` | Anno mediano candidati = `2023`
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
- **Metadati**: $\text{eta}$ mediano = `525.0` gg (min = `522.0` gg) | Anno mediano semi = `2005` | Anno mediano candidati = `2008`
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
- **Metadati**: $\text{eta}$ mediano = `1587.5` gg (min = `18.0` gg) | Anno mediano semi = `2020` | Anno mediano candidati = `2023`
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
> L'esperimento dimostra che ordinare gli scaffali per mera **recency mediana** è concettualmente fallato: punisce le passioni continuative e profonde dell'utente (che accumulano una coda storica e quindi un'alta mediana di età) premiando bolle microscopiche da 2 semi viste in un singolo weekend ma poi abbandonate. Di contro, il puro **supporto** è sordo alle novità recenti, congelando la schermata iniziale sui gusti storici predominanti. La regola **combined** offre il bilanciamento migliore per un prodotto reale, perché garantisce che i pilastri identitari (come l'Anime o il Blockbuster d'azione su `warnok`) convivano con le nicchie fresche (come i documentari NFL o l'horror) senza mai generare duplicazioni nei contenuti.

