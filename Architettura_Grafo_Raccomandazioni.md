# Architettura del Motore di Raccomandazione a Grafo (YACA)

Questo documento definisce l'architettura matematica e strutturale per la migrazione del sistema di raccomandazione YACA (sia Matchmaker che VSM Globale) verso un approccio basato su **Grafo Semantico e Spreading Activation**.

---

## 1. Fase di Pre-Processing Offline (Generazione del Grafo)
Questa fase avverrà in un **ambiente locale esterno a YACA** (progetto Python separato, non dentro `src/`). L'obiettivo è macinare il dump di TMDB e produrre un JSON pre-calcolato e iper-ottimizzato che YACA caricherà in RAM all'avvio.

**Stack Tecnologico Offline:**
- **Linguaggio:** Python 3.10+
- **Librerie:** `scipy` (matrici sparse), `networkx` / `igraph` (grafi), `cdlib` (Leiden), `sentence-transformers` (embeddings)
- **Modello di Embedding:** `BAAI/bge-small-en-v1.5` — 384 dimensioni, ~130 MB. Ottimizzato per similarità semantica tra frasi corte. Gira comodamente su una GPU con 6 GB di VRAM (RTX 3060), occupando < 500 MB. Tempo stimato per ~50.000 keyword: pochi secondi.
- **Nessun database a grafo (Neo4j):** Le operazioni offline sono tutte batch su matrici (algebra lineare), per le quali `scipy` e `networkx` sono nettamente superiori a un database orientato al traversal. In produzione, il JSON risultante viene caricato in RAM come semplice `Map` JavaScript — nessun demone aggiuntivo, nessuna VRAM sprecata dei 16 GB di HF Spaces.

### 1.1 Composizione del Grafo: Solo Keyword (Niente Generi)
Il grafo contiene esclusivamente **keyword TMDB**. I Generi (Action, Drama, Horror, ecc.) vengono **esclusi** dal grafo.

**Motivazione:** I generi, anche dopo normalizzazione PPMI, fungerebbero da super-hub che collegano virtualmente tutte le keyword tra loro (ogni keyword è associata ad almeno un genere). Questo distruggerebbe la sparsità del grafo e renderebbe la propagazione dell'energia caotica e indifferenziata. I generi verranno gestiti come un **layer di filtraggio parallelo e separato** (vedi Sezione 2.3).

Il grafo è **unico e unificato** per film, serie TV e anime. Poiché YACA utilizza TMDB anche per gli anime, le keyword appartengono allo stesso namespace. Le keyword specifiche degli anime (es. `isekai`, `shounen`, `mecha`) formeranno naturalmente un **arcipelago denso e auto-contenuto** all'interno del grafo, collegato internamente da archi PPMI forti (co-occorrono spesso tra loro) e virtualmente scollegato dalle keyword occidentali. L'energia iniettata in un arcipelago resterà lì, senza contaminare l'altro.

**Nota sulla keyword "anime":** Essendo presente in quasi tutti i titoli anime, il suo comportamento è analogo a quello di un genere: il PPMI le assegnerà archi deboli verso qualsiasi keyword anime-specifica (nessuna "sorpresa" statistica). L'energia non passerà significativamente attraverso questo nodo, e questo è desiderabile: il sistema capirà *cosa dentro* gli anime piace all'utente (isekai? mecha? slice of life?) senza bisogno del nodo generico "anime".

### 1.2 La Pipeline di Costruzione

#### Passo 1: Filtraggio del Rumore
Dal dump TMDB, vengono rimosse le keyword con una frequenza assoluta inferiore a una certa soglia (es. presenti in meno di 50 film) per sfoltire la coda lunga inutile (keyword usate una sola volta, tag errati, ecc.).

#### Passo 2: Matrice PPMI (Gli Archi Strutturali)
Si costruisce la matrice di co-occorrenza grezza: per ogni coppia di keyword, si conta in quanti film compaiono insieme. Poi si applica il **PPMI (Positive Pointwise Mutual Information)**.

Il PPMI non misura "quante volte" due keyword stanno insieme, ma la **sorpresa statistica** della loro co-occorrenza. Se "Vampiro" e "Aglio" compaiono insieme 200 volte più spesso di quanto la statistica prevederebbe dal puro caso, il loro arco avrà un peso altissimo. Se "Drama" e "Cane" compaiono insieme esattamente quanto ci aspetteremmo dalla loro frequenza individuale, il peso sarà ~0.

Questo meccanismo:
- **Uccide i tag parassiti:** Keyword inflazionate e prive di significato (es. `duringcreditsstinger`) non genereranno "sorpresa" con nulla. I loro archi saranno tutti ~0.
- **Esalta le nicchie:** Sottogeneri microscopici (es. `giallo all'italiana` ↔ `guanti neri`) otterranno archi fortissimi, perché la loro co-occorrenza è genuina e statisticamente improbabile.
- **Crea ponti logici inaspettati:** "Mafia" ↔ "Famiglia" avranno un arco forte (grazie a *Il Padrino* e simili). L'energia scorrerà tra concetti tematicamente legati.
- **La "P" di Positive:** Le anti-correlazioni (keyword che non compaiono mai insieme) vengono azzerate a 0, non mappate come archi negativi. Il grafo contiene solo ponti, nessun muro.

#### Passo 3: Matrice Cosine (La Colla Semantica)
Le keyword vengono passate nel modello `BAAI/bge-small-en-v1.5` per generare embedding a 384 dimensioni. Si calcola la similarità del coseno tra ogni coppia. Questo cattura i **sinonimi linguistici puri** che il PPMI non riesce a collegare (es. `zombie` e `undead` potrebbero non co-occorrere mai nello stesso film perché i tagger usano l'uno *o* l'altro, ma sono semanticamente identici).

#### Passo 4: Fusione delle Matrici
Le due matrici vengono fuse tramite una somma pesata:
`Matrice_Fusa = (α × Matrice_PPMI) + ((1 - α) × Matrice_Cosine)`

Il parametro `α` (es. 0.7) darà priorità alla realtà cinematografica (PPMI). La semantica (Cosine) interviene solo come supporto per chiudere i buchi lessicali lasciati dalla frammentazione dei tag TMDB.

#### Passo 5: Leiden Micro-Clustering
Sulla matrice fusa si applica l'algoritmo di **Leiden** con un parametro di *resolution* molto alto. Questo forza l'algoritmo a creare **micro-cluster** che raggruppano solo i nodi quasi-identici (es. `[zombie, undead, living dead]`).

**Validazione della Qualità dei Cluster:** Dopo l'esecuzione di Leiden, si estraggono i 50 cluster più grandi e si ispezionano manualmente. Se un cluster contiene `[zombie, undead, living dead]` → la risoluzione è corretta. Se contiene `[zombie, vampire, werewolf, ghost]` → la risoluzione è troppo bassa e va alzata. Questo processo di tuning è iterativo e va fatto offline prima di generare il JSON finale.

**Ruolo dei Micro-Cluster nel Runtime:** Dopo il clustering, ogni micro-cluster diventa un **singolo nodo matematico** nel grafo finale. Questo riduce drasticamente le dimensioni del grafo e accorpa i sinonimi. Al momento del retrieval (query TMDB), il cluster viene "spacchettato" e tutte le keyword originali vengono restituite.

### 1.3 L'Output JSON (Struttura Dati)
Il processo genera un `graph_data.json` contenente:
- **`keyword_to_cluster`:** Mappa che associa ogni keyword TMDB originale (stringa o ID) al suo ID Micro-Cluster.
- **`cluster_adjacency`:** Matrice di adiacenza sparsa dei Micro-Cluster (gli archi pesati PPMI tra cluster), pre-filtrata per mantenere solo la Top K delle connessioni più forti per ogni nodo (sparsificazione), ottimizzando l'impronta in RAM.
- **`cluster_members`:** Per ogni ID Micro-Cluster, la lista delle keyword originali che contiene (necessario per l'unpacking nelle query TMDB).

---

## 2. Il Motore di Runtime Online (YACA Matchmaker)
Il `matchmakerHandler.js` caricherà `graph_data.json` in RAM e lo utilizzerà per iniettare e propagare energia durante la sessione di swipe.

### 2.1 Spreading Activation (Il Flusso di Energia)
L'algoritmo si basa sulla propagazione controllata di cariche positive e negative.

1. **Vettore di Stato Iniziale:** Tutti i nodi-cluster partono da energia 0.

2. **Iniezione Baseline (User DNA):** Il grafo viene "pre-riscaldato". Si estraggono le top affinity storiche dell'utente dal suo `ProfileScorer` (le keyword con prefisso `k:` nel `V_final`) e si iniettano piccole cariche positive (es. +2) nei rispettivi nodi-cluster. Questo inclina impercettibilmente il grafo verso i gusti storici dell'utente, fungendo da **ammortizzatore di diversità** nelle prime iterazioni.

3. **Iniezione Trigger (Gli Swipe):**
   - **Like:** Le keyword del film vengono mappate ai loro cluster via `keyword_to_cluster`. Viene iniettata un'energia positiva **piatta** (+10) in questi nodi. Non usiamo penalizzazioni matematiche (es. TF-IDF) per disinnescare le keyword comuni: se l'utente mette like a 5 anime isekai, il nodo "isekai" accumula organicamente +50, emergendo come reale interesse macro.
   - **Dislike:** Viene iniettata energia repulsiva (-10) nei nodi-cluster del film scartato.

4. **Propagazione e Decadimento (Attenuazione del Rumore):**
   - *Formula:* `E(nodo, T+1) = Σ[E(vicino, T) × Peso_Arco_PPMI(vicino, nodo)] × Decay_Factor`
   - Il *Decay Factor* (es. 0.8) impedisce che l'energia inondi tutto il grafo all'infinito.
   - **Il ruolo del PPMI contro i Super-Hub:** Non serve strozzare matematicamente a runtime l'energia verso i nodi troppo comuni. Il PPMI calcolato offline ha già assegnato pesi ~0 agli archi puramente casuali. L'energia fluirà solo dove c'è un legame semantico forte e statisticamente rilevante.
   - **Filtro Dislike Naturale:** L'energia positiva dei vicini neutralizza la negatività collaterale di un film brutto scartato (es. un film orrendo che conteneva "spazio" riceve -10, ma il nodo "spazio" è fortemente collegato ad "astronave" già carico positivamente, e la negatività si annulla). Sopravvivranno solo i veri "nuclei tossici": nodi negativi circondati da altri nodi negativi.

### 2.2 Strategia di Propagazione Adattiva (Anti Eco-Chamber)
Il numero di salti di propagazione e l'operatore logico tra cluster cambiano durante la sessione per bilanciare esplorazione e precisione:

| Fase della Sessione | Salti | Operatore tra Cluster | Effetto |
|---|---|---|---|
| **Iterazioni 1-2** (Esplorazione) | **2 salti** | `OR` | L'energia viaggia lontano, accende zone inesplorate. I risultati sono vari e sorprendenti. Il DNA Globale pre-riscaldato fa da ammortizzatore impedendo derive casuali. |
| **Iterazioni 3+** (Convergenza) | **1 salto** | `AND` | L'energia resta localizzata attorno ai gusti confermati. I risultati si stringono chirurgicamente sugli interessi reali. |

Questo crea una traiettoria naturale **dall'ampio allo stretto**: nelle prime fasi l'utente esplora, nelle fasi successive il sistema converge.

### 2.3 Retrieval e Generazione Query TMDB
Finita la propagazione, il vettore di stato fornisce la "mappa termica" della sessione.

1. **Unpacking dei Nodi Positivi (with_keywords):**
   - Si seleziona la Top N dei cluster positivi (es. i 5-10 nodi più caldi).
   - Si estraggono TUTTE le keyword originali contenute in ciascun micro-cluster tramite `cluster_members` (es. cluster 45 → `zombie`, `undead`, `living dead`).
   - Le keyword *interne* allo stesso cluster si mettono in `OR` (`|`).
   - I diversi cluster si compongono in `AND` (`,`) o `OR` in base alla fase della sessione (vedi tabella sopra).
   - Esempio query finale (iterazione 4, convergenza): `with_keywords=(zombie|undead),(space|galaxy)`

2. **Unpacking dei Nodi Tossici (without_keywords):**
   - Si selezionano i Bottom N cluster (quelli con l'energia negativa assoluta più alta nel grafo post-propagazione).
   - Si spacchettano e le loro keyword vengono passate in blocco nel parametro `without_keywords` di TMDB.
   - Essendo passati per la normalizzazione del grafo (i nodi "vittime collaterali" sono già stati salvati dall'energia positiva dei vicini), siamo certi che questi siano i veri concetti insopportabili per l'utente.

3. **Layer dei Generi (Filtro Parallelo):**
   - I generi non fanno parte del grafo e vengono gestiti separatamente.
   - Si inferiscono i generi preferiti/odiati dalla sessione corrente contando i generi dei film a cui l'utente ha messo Like/Dislike.
   - Se emerge una preferenza chiara (es. 3 Like su 4 sono Horror), si aggiunge `with_genres=27` alla query TMDB.
   - Se emerge un genere tossico (es. 4 Dislike su 5 sono Comedy), si aggiunge `without_genres=35`.
   - Questo layer è indipendente dal grafo e funziona come un "pre-filtro" sulla query TMDB.

4. **Deduplicazione:** I film già presentati all'utente (sia Like che Dislike) vengono rimossi dai risultati per evitare ripetizioni e forzare la scoperta di nuovi titoli.

---

## 3. L'Evoluzione del Motore Globale (YACA Core DNA)
Questa logica viene estesa oltre il Matchmaker, andando a sostituire il sistema vettoriale statico attuale (`ProfileScorer.js`).

### 3.1 Da Statistico a Inferenziale
Oggi, se un utente guarda 10 film di Tarantino, il VSM traccia un'affinità con i generi e le keyword precise di quei film. È un modello reattivo: conosce solo ciò che ha visto.

Con il grafo, il sistema diventa **proattivo e inferenziale**:

1. **Accumulo dell'Energia Globale:** Ogni interazione dell'utente (film visti, Like, Love, inserimento in cataloghi personalizzati, ricerche effettuate) genera un "ping" di energia positiva nei nodi-cluster corrispondenti del grafo.

2. **Propagazione Globale Asincrona:** Periodicamente (es. al momento della rigenerazione del DNA), questa energia storica accumulata viene propagata sul grafo con un decadimento leggero. L'energia "accende" i vicini semantici e strutturali dei concetti con cui l'utente ha interagito.

3. **Estrazione del Nuovo V_final:** Il nuovo DNA dell'utente non sarà più solo la lista esatta di ciò che ha visto, ma l'estrazione dei **Top N Nodi più energetici** dell'intero grafo post-propagazione.
   - *Vantaggio:* Il sistema inferirà automaticamente un'affinità altissima per concetti semanticamente adiacenti ai Loves storici, **anche se l'utente non ha mai cliccato esplicitamente un film con quelle keyword**. Questo permette una "Serendipity" (scoperta inaspettata ma rilevante) nettamente superiore al modello VSM standard.

4. **Ordinamento dei Cataloghi (Confronto tra Sottografi Sparsi):** I film proposti dalle API generiche verranno riordinati trasformandoli al volo in sottografi. TMDB restituisce un film con 5 keyword? Noi accendiamo quelle 5 e le espandiamo ai loro vicini di 1° grado usando il grafo in memoria. Otteniamo così un **vettore sparso** del film (es. 30 nodi accesi su 10.000). Il ranking finale si ottiene eseguendo una velocissima **Dot Product** (Cosine Similarity) tra questo vettore sparso e il vettore sparso del DNA Utente (i nodi rimasti accesi post-propagazione). L'operazione matematica avviene solo sull'intersezione delle chiavi, è fulminea in Node.js e non richiede di iterare su tutti i 10.000 nodi del grafo.

---

## 4. Ruolo dell'LLM (Mistral)
Nel nuovo ecosistema, l'LLM funge esclusivamente da **Disambiguatore di Rete**.
Viene disconnesso dal loop di generazione delle query TMDB. Il suo unico trigger scatta quando l'algoritmo di Spreading Activation rileva entropia o divergenza (es. presenza contemporanea di due poli ad altissima energia positiva che non hanno archi di collegamento tra loro nel grafo). In quel caso, Mistral genera una `QuestionCard` tematica per costringere l'utente a far collassare l'energia su uno dei due rami.

---

## Decisioni Architetturali Consolidate

| Decisione | Scelta | Motivazione |
|---|---|---|
| Generi nel grafo? | **No** | Distruggerebbero la sparsità collegando tutto a tutto. Gestiti come layer parallelo. |
| Iniezione energia | **Piatta (+10/-10)** | Nessun TF-IDF. L'accumulo organico fa emergere i macro-interessi reali. |
| Penalizzazione hub | **Solo PPMI offline** | Nessun `1/log(grado)` a runtime. Il PPMI ha già azzerato gli archi casuali. |
| Grafo anime separato? | **No, grafo unico** | Stesso namespace TMDB. Gli anime formano un arcipelago naturale auto-contenuto. |
| Salti di propagazione | **Adattivi (2→1)** | Esplorazione iniziale ampia, convergenza progressiva. |
| Ranking dei cataloghi | **Dot Product su vettori sparsi** | Fulmineo in Node.js, nessun ciclo su 10.000 nodi. |
| Validazione Leiden | **Ispezione manuale Top 50 cluster** | Processo iterativo offline prima della generazione del JSON. |
| Modello Embedding | **`BAAI/bge-small-en-v1.5`** (384 dim) | Leggero (~130 MB), preciso su frasi corte, < 500 MB VRAM su RTX 3060. |
| Database a grafo (Neo4j)? | **No** | Offline: scipy/networkx superiori per batch matriciali. Online: JSON in RAM (~10-20 MB) su 16 GB HF Spaces. Zero demoni aggiuntivi. |
| Ambiente di sviluppo offline | **Progetto Python separato** | Esterno alla cartella `src/` di YACA. Output: `graph_data.json` integrato in YACA. |

## Parametri di Tuning (Da Calibrare Empiricamente)

Questi parametri non sono fissati a priori. Verranno calibrati iterativamente durante la fase di pre-processing offline, ispezionando i risultati sui dati reali del dump TMDB.

| Parametro | Valore Iniziale | Note |
|---|---|---|
| Soglia frequenza minima keyword | **~50 film** | Potrebbe essere 20 o 100. Dipende dalla distribuzione reale della coda lunga. |
| α (peso PPMI vs Cosine nella fusione) | **~0.7** | Priorità alla realtà cinematografica (PPMI). Cosine come supporto. |
| Resolution di Leiden | **Alto** (da calibrare) | Validato con ispezione manuale dei Top 50 cluster. |
| Decay Factor (propagazione) | **~0.8** | Se l'energia si spegne troppo in fretta → alzare. Se allaga → abbassare. |
| Top K archi per nodo (sparsificazione) | **Da calibrare** | Dipende dalla dimensione del grafo post-Leiden. Obiettivo: ~10-20 MB di JSON. |
