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

### [convert_to_parquet.js](../scripts/convert_to_parquet.js)
Converte il dump giornaliero JSONL esportato da TMDB in formato compresso Apache Parquet (ZSTD). Questo file alimenta il motore SQL in-memory DuckDB per interrogazioni istantanee.
* **Esecuzione**: `node scripts/convert_to_parquet.js`

### [migrate_library_itemid_null.js](../scripts/migrate_library_itemid_null.js)
Script di migrazione sicura del database per normalizzare record orfani o con `itemId: null` all'interno della collezione `UserLibraryItem`.
* **Esecuzione (Dry-run)**: `node scripts/migrate_library_itemid_null.js`
* **Applicazione effettiva**: `node scripts/migrate_library_itemid_null.js --apply`
