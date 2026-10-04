# Suite di Test e Utility di Amministrazione (YACA)

Questo documento descrive in dettaglio l'architettura dei test, le procedure di validazione automatica dei cataloghi e dei preset, e gli strumenti amministrativi per la manutenzione e il debug della piattaforma YACA (Yet Another Catalog Addon).

---

## 1. Test di Unità e Integrazione con Jest

I test di unità e integrazione sono scritti in JavaScript utilizzando il framework **Jest** (`jest`). Consentono di verificare la correttezza algoritmica di YACA senza caricare runtime complessi, mockando ove necessario i database e le API esterne (come TMDB o Trakt).

### Comando di Esecuzione
Per eseguire la suite completa dei test:
```bash
npm test
```
Questo comando attiva `jest`, che esegue automaticamente la scansione della cartella [tests/](../tests) e rileva tutti i file con estensione `.test.js`.

### Struttura della Cartella `tests/`
I file all'interno di [tests/](../tests) coprono diverse aree critiche:

1. **[LRUCache.test.js](../tests/LRUCache.test.js)**:
   Verifica il comportamento del sistema di cache in-memory personalizzato (Least Recently Used) di YACA, testando:
   - Memorizzazione e recupero dei valori.
   - Eviction (sfratto) degli elementi più vecchi al raggiungimento della dimensione massima (`max`).
   - Aggiornamento della posizione degli elementi acceduti (comportamento LRU).
   - Scadenza delle voci in base al TTL (Time to Live).

2. **[hybridRecommendations.test.js](../tests/hybridRecommendations.test.js)**:
   Verifica il calcolo dello score ibrido per le raccomandazioni Trakt/TMDB. Copre in dettaglio la funzione `calculateHybridScore` testando:
   - Punteggi basati sulla posizione della raccomandazione in Trakt.
   - Boost per le occorrenze extra su TMDB.
   - Boost basati sui generi preferiti del profilo utente (Boost per genere #1, #2, #3).

3. **[profileScorerVSM.test.js](../tests/profileScorerVSM.test.js)** e **[profileScorerCoreBias.test.js](../tests/profileScorerCoreBias.test.js)**:
   Testano il calcolo del match di un titolo a partire dal vettore `V_final` (il profilo di gusto dell'utente basato su Vector Space Model). Verificano che la combinazione delle componenti tematiche (generi e keyword) e autoriali (registi, attori) con pesi ponderati (`traktWeight` e `tmdbWeight`) calcoli correttamente il punteggio finale per l'utente.

4. **Altri test significativi**:
   - `addonConfigCatalogSchema.test.js`: Verifica l'integrità dello schema di configurazione dell'addon e dei cataloghi memorizzati.
   - `dnaExtractor.test.js`: Controlla l'estrazione del DNA (interessi e preferenze) dell'utente dai suoi metadati di visione.
   - `catalogStrategies.test.js`: Verifica le strategie di generazione dei cataloghi con DuckDB e filtri SQL nativi.
   - `retireTmdbScoringData.test.js`: Certifica il pensionamento del modello `TmdbScoringData` in favore del database locale Parquet.

### La suite di contratto `diag.recommender.*`

Sette file con prefisso `diag.recommender.` ([tests/](../tests)) sono nati il **20/09/2026** dalla diagnosi statica del motore di raccomandazione. Non sono test di regressione "prima/dopo": sono **contratti scritti prima della fix, quando fallivano**. Oggi devono restare verdi e valgono come documentazione eseguibile — se uno diventa rosso senza che il comportamento sia cambiato di proposito, il bug è tornato.

| File | Invariante che fissa |
|---|---|
| `diag.recommender.h1.lightMeta.test.js` | Gli item che arrivano a `calculateItemMatch` portano `keywords`, `credits` e `vote_count`: i light-meta non possono essere alleggeriti ([ALGORITHMS.md §2](ALGORITHMS.md#2-il-ciclo-del-two-tier-scoring)). |
| `diag.recommender.h2.activeVectorSource.test.js` | Il DNA che alimenta `V_active` viene dal parquet DuckDB, non dalla collection `TmdbScoringData` (pensionata: zero insert dal 02/06/2026, zero update dal 21/07/2026). |
| `diag.recommender.h5.pagination.test.js` | `skip=0` e `skip=20` restituiscono insiemi di ID **disgiunti** sulle pipeline multi-query: le pagine non si ripetono e non si saltano. |
| `diag.recommender.h6.scoringMix.test.js` | Nel *Seed Network* il punteggio ibrido è normalizzato sulla scala 0–10 del VSM: il VSM resta il primo criterio di ordinamento. |
| `diag.recommender.h8.determinism.test.js` | Due chiamate a `getKeywordsForNodes` sullo stesso nodo (>30 keyword) restituiscono lo stesso set. |
| `diag.recommender.h9.injectProfile.test.js` | `with_genres: '35,18'` resta un AND: iniettare i generi del profilo non deve trasformarlo in OR. |
| `diag.recommender.h11.diversity.test.js` | Il top-k non collassa su un solo genere e i cap di diversità vengono applicati davvero. |

Esecuzione: `npx jest tests/diag.recommender`.

---

## 2. Script di Rilevanza e Validazione

Nella cartella `scripts/` sono presenti strumenti di validazione e analisi programmatica della rilevanza dei cataloghi/preset.

### [test_relevance_all_presets.js](../scripts/test_relevance_all_presets.js)
Questo script automatizza la validazione della rilevanza per ciascuno dei preset configurati nell'addon (ad esempio i preset degli anime, documentari, ecc.).
* **Flusso di funzionamento**:
  1. Recupera la lista dei preset disponibili.
  2. Esegue una chiamata di `discover` a TMDB per i primi 20 elementi di ogni preset.
  3. Per ciascun elemento trovato, interroga TMDB recuperando i dettagli estesi (`credits`, `watch/providers`, `keywords`).
  4. Valida se l'elemento rispetta rigorosamente i filtri impostati sul preset (genere, lingua originale, parole chiave incluse o escluse, cast, crew, watch provider).
  5. Calcola un tasso di successo complessivo ("Success Rate") e salva un report JSON dettagliato (`scripts/relevance_validation_report.json`).
* **Esecuzione**: `node scripts/test_relevance_all_presets.js`

### [analyze_presets.js](../scripts/analyze_presets.js)
Strumento di **analisi statica** dei preset. Esamina tutti i cataloghi registrati nel sistema alla ricerca di anomalie strutturali o potenziali bug di configurazione, scrivendo i risultati nel file `.agents/scratch/analysis_report.json`.
Gli errori e i warning evidenziati comprendono:
*   `similar`: Preset duplicati o quasi identici (stessi generi, keyword e crew, ma ID o nomi differenti).
*   `wrong`: Errori come mismatch di tipo (ID genere TV su cataloghi film) o serie standard senza esclusione anime (`210024`).
*   `tooEmpty`: Rilevamento di troppi filtri cumulativi che rischiano di svuotare il catalogo.
*   `needsQuality`: Verifica che i cataloghi ordinati per voto medio abbiano un `vote_count.gte` adeguato.
*   `needsSorting`: Controlla la coerenza tra il nome (es. "Top", "Popolari") e il criterio di ordinamento.
* **Esecuzione**: `node scripts/analyze_presets.js`

---

## 3. Script Amministrativi e Utility di Sistema

All'interno della cartella `scripts/` risiedono gli script di manutenzione canonici per la gestione del sistema, della cache e dei dati:

### [clear_caches.js](../scripts/clear_caches.js)
Svuota la cache L2 su Redis e azzera lo stato della cache in memoria:
- Esegue `redisClient.flushdb()` su Redis.
- Garantisce la propagazione immediata dopo modifiche a preset, logiche di formattazione o metadati.
* **Esecuzione**: `node scripts/clear_caches.js`

### [find_user.js](../scripts/find_user.js)
Utility di lookup per ispezionare gli account utente, le configurazioni addon e lo stato del `TasteProfile` memorizzato su MongoDB Atlas. Supporta parametri CLI:
* `node scripts/find_user.js` (ispezione del primo account o preset attivi)
* `node scripts/find_user.js --handle <handle>`
* `node scripts/find_user.js --userId <id>`
* `node scripts/find_user.js --addonUuid <uuid>`

### [fetch_catalogs.js](../scripts/fetch_catalogs.js)
Utility per simulare richieste client, estrarre lo stato formattato dei cataloghi e validare i badge degli episodi e i flussi bypassando Stremio.
Salva l'output in `.agents/scratch/` (`catalogs_output.txt` o `catalog_state.json`).
* **Opzioni principali**:
  - `--url <base>`: URL base dell'istanza YACA (default `http://127.0.0.1:7860`, o es. `https://mate.taild24589.ts.net`)
  - `--config <addonUuid>`: UUID dell'addon da testare (se omesso, recuperato automaticamente dal DB)
  - `--catalogs <id1,id2>`: Filtra cataloghi specifici
  - `--text`: Output in formato testuale sintetico
  - `--nocache`: Bypassa la cache per generare dati freschi
* **Esecuzione rapida**: `node scripts/fetch_catalogs.js --text --nocache`

### [push-diff-in-coda.js](../scripts/push-diff-in-coda.js)
Legge `ita_annotations.diff.json` (l'artefatto del diff di doppiaggio scritto da
`services/doppiaggi-source`) e spinge ogni cambiamento nella **coda degli eventi** (`src/cache/codaEventi.js`):
i poster composti di un titolo che è diventato (o ha smesso di essere) doppiato vanno rifatti.
La deduplica è della coda, quindi rilanciare lo script sullo stesso artefatto non raddoppia nulla.
Un file assente, illeggibile o malformato è una condizione attesa: lo dice e esce con 0 (gira in un timer).
* **Percorso**: `--file <path>`, altrimenti `ITA_DIFF_PATH`, altrimenti la cartella dei dump
  (`ITA_DIFF_DIR` → `ITA_ANNOTATIONS_DIR` → `TMDB_DUMP_DIR` → `/data/tmdb` → `.cache/tmdb`)
* **Opzioni**: `--dry-run` (legge e conta, non accoda), `--help`
* **Esecuzione**: `node scripts/push-diff-in-coda.js` (o `--file /data/tmdb/ita_annotations.diff.json`)

### [verifyTypeSelectors.js](../scripts/qa/verifyTypeSelectors.js)
Harness di QA che verifica end-to-end i selettori di tipo del profilo (`Solo Film` / `Solo Serie` / `Solo Anime` / `No Anime`) in quattro fasi: **(1)** compila il `frontend/src/lib/utils.ts` reale e verifica `profilesToApiPayload` / `mapBackendProfile` / `sanitizeTypeSelectors`; **(2)** prova A/B sul server, contando i cataloghi del manifest per ciascuno stato; **(3)** round-trip completo `POST /api/configure` → `GET /api/user` → `mapBackendProfile` sui quattro stati canonici più un input sporco; **(4)** distingue «catalogo assente dal manifest» (ciò che Stremio mostra) dalla guardia «0 item» (richiesta HTTP diretta).

È nato il 24/09/2026 per riprodurre il bug dei selettori: il backend filtrava correttamente, ma il frontend scartava `typeSelectors` nelle due mappe allow-list e il sintomo era «il manifest non cambia». Serve ogni volta che si tocca `settings` del profilo — vedi l'avvertenza in [CATALOG_LOGIC.md §1.1](CATALOG_LOGIC.md#11-i-selettori-di-tipo-del-profilo-solo-film--solo-serie--solo-anime--no-anime).

* **Opzioni**: `--base-url <url>` (default `http://127.0.0.1:7032`), `--frontend-utils <path>` (default il proprio `frontend/src/lib/utils.ts`), `--baseline-utils <path>` (per il confronto A/B con un'altra worktree), `--test-user <nome>` (default `sim_user_repro_v`), `--strict-pass` (exit code 1 se un controllo fallisce)
* **Attenzione**: scrive davvero, via `POST /api/configure`, il profilo dell'utente di prova: va eseguito contro un'istanza **locale**, mai in produzione.

```bash
node scripts/qa/verifyTypeSelectors.js --base-url http://127.0.0.1:7032 --strict-pass
```

### [convert_to_parquet.js](../scripts/convert_to_parquet.js)
Converte il dump giornaliero JSONL esportato da TMDB in formato compresso Apache Parquet (ZSTD). Questo file alimenta il motore SQL in-memory DuckDB per interrogazioni istantanee.
* **Esecuzione**: `node scripts/convert_to_parquet.js`

### [migrate_library_itemid_null.js](../scripts/migrate_library_itemid_null.js)
Script di migrazione sicura del database per normalizzare record orfani o con `itemId: null` all'interno della collezione `UserLibraryItem`.
* **Esecuzione (Dry-run)**: `node scripts/migrate_library_itemid_null.js`
* **Applicazione effettiva**: `node scripts/migrate_library_itemid_null.js --apply`

#### Perché la libreria ha dei documenti senza `itemId` (e cosa ne è stato fatto)

Misurato sulla libreria di produzione il **20/09/2026** (368 item): **169 documenti legacy** senza `itemId` (la loro chiave è `_id`) e **70 titoli presenti due volte**. La causa è una sola: il sync fa upsert con filtro `{ addonUuid, itemId }`, quindi per un titolo che esiste **solo** come documento legacy il filtro non trova nulla e **crea un secondo documento**. Lo stesso difetto spiega perché l'indice unico `{ addonUuid, itemId }` dichiarato nel modello non era mai entrato in funzione: non può essere creato finché esistono più documenti con `itemId` nullo per lo stesso `addonUuid`.

Le quattro regole che tengono la libreria sane, e che vale la pena non reintrodurre:

1. **Il dedup gira prima di tutto** che tocca la libreria — prima di ogni sync (Stremio e Trakt) e prima della conversione: `deduplicateUserLibrary(addonUuid)` ([LibrarySyncService.js](../src/services/LibrarySyncService.js)) assegna `itemId = _id` ai legacy e cancella i duplicati tenendo il documento più ricco (ordine `removed` asc, `mapped` desc, `_mtime` desc: senza `removed` in testa si rischierebbe di tenere un item che l'utente ha rimosso). Passa dalla collection grezza, non dal modello: i `_id` legacy sono stringhe e mongoose le casterebbe a ObjectId, scrivendo **in silenzio** nel nulla.
2. **Un indice unico che non si può creare non deve fermare l'avvio**: `ensureIndexesSafe()` ([UserLibraryItem.js](../src/db/models/UserLibraryItem.js#L39-L45)) tenta `init()` e, se fallisce, avvisa e prosegue. Il server parte anche con la libreria sporca.
3. **Una copertina buona non si sovrascrive con `null`**: `preserveExistingPosters` ([LibrarySyncService.js](../src/services/LibrarySyncService.js#L121-L131)) agisce sulle ops già costruite e, quando la risoluzione non ha prodotto nulla, ripristina la copertina già in archivio. Verificato il 20/09/2026: gli URL salvati **caricavano tutti** (host per host: 200/206), quindi il placeholder non nasce da URL morti — nasce da una perdita di copertina nel percorso di scrittura.
4. **La copertina si risolve dalla fonte più economica**: [posterResolver.js](../src/utils/posterResolver.js) prova copertina già presente → `tmdbId` ricavato dall'`itemId` o dalla mappa IMDb→TMDB (senza rete) → parquet locale → API TMDB.

Contratto: [userLibraryDedup.test.js](../tests/userLibraryDedup.test.js). Finché il dedup non è stato eseguito sui dati reali, l'indice unico non esiste e il rischio duplicati è ancora aperto.

---

## 4. Ambiente locale: worktree, dipendenze condivise e giunzioni

Su questa macchina le dipendenze del backend **non** sono installate dentro il repo: stanno in una cartella condivisa, e il repo e i worktree ci puntano con **giunzioni** NTFS.

```
C:\Users\gabri\APP\.yaca-nm\node_modules   <- le dipendenze vere (~441 pacchetti)
C:\Users\gabri\APP\YACA\node_modules       -> junction alla cartella sopra
<worktree>\node_modules                     -> junction a YACA\node_modules   (catena a due livelli)
<worktree>\.cache                           -> junction a YACA\.cache
```

Il frontend è diverso: `frontend/node_modules` è un **install vero** (~400 pacchetti), non una giunzione.

### La regola

**Prima di qualunque cancellazione ricorsiva** (`rmdir /s`, `Remove-Item -Recurse`, `git worktree remove`) togli la giunzione **e verifica che sia sparita**:

```bash
fsutil reparsepoint delete "C:\percorso\del\worktree\node_modules"
cmd //c "dir /AL C:\percorso\del\worktree"     # non deve piu' stampare JUNCTION
```

`fsutil reparsepoint delete` rimuove **il collegamento**, non il bersaglio: è l'unico comando sicuro. `rmdir`, `Remove-Item -Recurse` e `git worktree remove` **seguono** la giunzione e cancellano la cartella condivisa.

**Non silenziare mai l'output di `fsutil`** (`>/dev/null`): è così che il 04/10/2026 il comando è fallito in silenzio e il passo successivo ha svuotato `.yaca-nm/node_modules`, `YACA/node_modules` e `frontend/node_modules` in un colpo solo — la quarta volta. La regola che conta non è il comando: è **verificare ogni passo distruttivo prima di fare il successivo**.

### Nota per chi usa Git Bash

`ls` e `find` di Git Bash **non attraversano** le giunzioni: una cartella piena può sembrare vuota. Per vedere la verità: `cmd //c "dir /AL <cartella>"`.

### Se le dipendenze spariscono

```bash
# backend: la cartella condivisa non ha un package.json proprio, va copiato
cp YACA/package.json YACA/package-lock.json .yaca-nm/
cd .yaca-nm && npm ci --no-audit --no-fund        # ~40 s, 441 voci

# frontend: install vero
cd YACA/frontend && npm ci --no-audit --no-fund   # ~20 s, ~300 voci
```

Dopo il ripristino, `npx jest tests/helpers.test.js` deve dare **10/10**: se dice `Cannot find module`, la copia non è finita.
