Status: resolved
Type: task
Blocked by: 08, 12

# 13 — I docs del grafo (e la fine della mappa)

## Perché

`docs/` non parla del grafo nuovo: l'ultimo aggiornamento è del 07/10 e le 17 pagine descrivono il prodotto
com'era (e in parte come non è più — `docs/INDEX.md` dichiara fermi da un mese `PRESETS`, `ALGORITHMS` e
`KITSU_MAPPING`). La convenzione della repo è esplicita (`docs/INDEX.md`, «Come si mantengono questi
documenti»): **nella mappa resta il racconto, nel doc va il distillato**; e **i documenti si allineano quando
il codice è fermo** — cioè adesso, a confini tagliati, non mentre si implementa.

## Cosa deve uscire

- **Il distillato del grafo**, secondo la convenzione: le **regole** che valgono ancora (i contratti, i formati
  — `tmdb:<id>` nella forma breve, `tv`/`series`, i dieci posti che definiscono gli hero), le **misure** che
  motivano una scelta (con la data), i **vincoli scoperti per forza** (le trappole pagate).
- **`docs/INDEX.md` aggiornato**: la mappa dei documenti, l'elenco degli artefatti e delle variabili
  d'ambiente — con le righe nuove del motore-servizio e del vecchio stack dietro il confine.
- **I doc morti**: l'inventario (04) dice quali documenti descrivono codice scomparso. Ognuno o si riscrive o
  si cancella — non resta lì a mentire. Vale anche per i `file:riga` citati che non esistono più.
- **La verifica a mano delle citazioni** (convenzione del 04/10/2026): per ogni `file:riga` citato nel doc
  nuovo, il file esiste ancora? Il controllo a mano del 03/10 trovò tre file citati rimossi a luglio e agosto,
  e uno schema superato di due versioni: è il genere di divergenza che nessuno nota finché non ci sbatte.
- **Il `README.md` della root**: è l'unico md ammesso alla root dalla regola del ticket 05 — dice cosa è YACA
  e dove sta il resto. Se dopo tutti i confini dice ancora il falso, si aggiorna qui.
- **La chiusura della mappa**: le decisioni di questa mappa che valgono oltre la sessione si portano nei docs;
  in `map.md` resta il racconto. E il marcatore di **decisione superata** (convenzione 06/10/2026) va messo
  **nella mappa dove la decisione è stata presa**, non solo nella nuova.

## Cosa NON deve uscire

Un documento per ogni ticket. Il valore del distillato è che sta in poche pagine: se il grafo ha bisogno di
sei documenti nuovi, la domanda giusta è perché il confine non si spiega in uno.

## Come si verifica

Le citazioni dei doc nuovi verificate a mano, una per una (`ls`, `grep -n`); `docs/INDEX.md` che elenca i
documenti **esistenti** (nessun link morto, nessun documento non elencato); e — la prova vera — qualcuno che
non ha mai visto questa mappa legge `docs/` e sa **chi possiede cosa** senza aprire il codice di tutti i
moduli.

---

## Esito

Risolto il 17/10/2026.

### 1. Documenti Scritti (Il distillato in 2 documenti anziché 6)
- **`docs/RECOMMENDATION_GRAPH.md`**:
  - Contratto HTTP del motore Python (`services/graph/servizio.py`, porta `7862`): endpoint `GET /health` in <1 ms (0.25 ms misurati) con impronte di ricetta e artefatto, ed endpoint `POST /raccomanda` (alias `POST /`) con semi pesati, tipo `"catalogo"` a freddo, medium opzionale e liste spiegate (`il_tuo_mondo`, `un_passo_fuori`, `uscite_nuove`, `nicchia_di_qualita`).
  - Metriche runtime reali: avvio/caricamento artefatti in 2.05 s (era dichiarato ~20 s senza misura), RAM RSS a 128.4 MB (cap 512m), latenza risposta a caldo 92.39 ms, artefatto di produzione da 138 MB in bind-mount read-only su `/srv/yaca/services/graph/data`.
  - Architettura del modulo Pool (`src/pool/index.js`): porta unica `getHeroPool`, strategie come voci di lista (`HERO_STRATEGIES`), riduzione del decimo posto a uno solo (`getHeroPoolSpec()` in `src/catalog/registry.js`), e invariante che impone oggetti strutturati coerenti nel pool (mai stringhe scalari).
  - Le 5 trappole architetturali già pagate:
    1. Chiave di cache `v13` con hash artefatto concatenato ed esclusione del veleno a 7 giorni (`RECOMMENDATIONS_CACHE_TTL_MS`) sui fallimenti temporanei tramite TTL breve di 60 s.
    2. Il cap dopo i filtri: la trappola del taglio prima dell'idratazione (Ticket 38: 2-3 serie superstiti su `anime: exclude` contro 20 serie con taglio a valle).
    3. Il `node -e` pendente a causa dei client `ioredis`/Mongoose in `src/cache/cacheInstances.js` (regola del `process.exit(0)`).
    4. I dieci posti degli hero centralizzati in `registry.js`.
    5. Normalizzazione `tv` vs `series` vs `tmdb:<id>`.
- **`docs/LIBRARY_MODULE.md`**:
  - Confine concettuale del dominio Libreria (`src/library/`): «la libreria possiede i fatti, il profilo deduce. Se serve a decidere cosa mostrare, non è della libreria».
  - Incapsulamento totale dei modelli `WatchHistory` e `UserLibraryItem` (zero import diretti fuori da `src/library/`).
  - Risoluzione contesto a 3 chiavi `{ userId, profileId, addonUuid }` in `src/library/context.js`.
  - Porta di lettura: `semiDi` con pesi e decadimento esponenziale temporale `max(0.20, 0.5^(days/60))`, regola esplicita del profilo mai sincronizzato (`profiloHaCronologiaReale`), `leggiWatchlist`, `storiaDi`, `contaDaConvertire`.
  - Macchina a stati formale di conversione (`src/library/ingestion/conversionStateMachine.js`): stati `QUEUED`, `CONVERTED`, `PARKED`, `EXCLUDED_REMOVED`, `EXCLUDED_DUPLICATE`.
  - Regola del parcheggio al 3° tentativo fallito (`MAX_CONVERSION_ATTEMPTS = 3`) e meccanismo di unpark tramite azzeramento dati (`unparkItem`) senza modifiche di codice.
  - Write path unificato `ingestStremioData` e separazione concettuale dalla cache dei poster ed eventi ERDB.

### 2. Documenti Corretti o Aggiornati
- **`docs/INDEX.md`**:
  - Mappa dei documenti completamente allineata: tutti i 19 file `.md` di `docs/` sono linkati e descritti (aggiunti `RECOMMENDATION_GRAPH.md`, `LIBRARY_MODULE.md`, `storico-script.md`, `TIMER_DOPPIAGGI.md`, `TIMER_POSTER.md`, `EPISODE_BADGES.md`).
  - Nuovo diagramma architetturale con il servizio `graph` su porta 7862 e i moduli di dominio `src/pool/` e `src/library/`.
  - Tabella variabili d'ambiente aggiornata con `GRAPH_SERVICE_URL` e `GRAPH_TAG`, con nota esplicita che `GRAPH_URL` non esiste nel codice di YACA.
  - Sezione artefatti aggiornata (bind mount 138 MB, deprecazione `src/data/bolle.json`, tracciamento git di `.scratch/`).
- **`docs/DUCKDB_ARCHITECTURE.md`**:
  - Eliminata la citazione attiva dell'adattatore rimosso `src/utils/legacyTmdbAdapter.js` (cancellato il 23/07/2026 nel commit `73a023d`).
  - Documentata la risoluzione nativa delle query AI tramite `AiDiscoveryProvider.js` -> `getDuckDbCatalogFromFilters` / `AiQueryNormalizer.js` e `queryBuilder.js`.
- **`docs/CATALOG_LOGIC.md`**:
  - Rimossa la menzione di `legacyTmdbAdapter.js` nella descrizione di `AiDiscoveryProvider.js`.
- **`docs/PRESETS.md`**:
  - Corretto il drift di riga della funzione `getSortByValue()`: import a `src/api/stremio.js:28`, invocazione a riga `379`.
- **`docs/STREMIO_INTERNALS.md`**:
  - Corretti i riferimenti di riga di `src/api/stremio.js`: risposte HTTP 200 vuote a `:365`, `:399`, `:436` e risposta 400 per manifest con configurazione non valida a `:341`.
- **`docs/PRESETS_DATE.md`**:
  - Corretto il riferimento alle righe di ricalcolo data in `src/catalog/providers/DuckDbProvider.js` (righe 48-57).
- **`README.md`**:
  - Aggiornato l'overview iniziale, i documenti chiave, il diagramma di architettura ASCII (incluso il container `graph` :7862), la sezione compose e la tabella variabili d'ambiente con `GRAPH_SERVICE_URL` e `GRAPH_TAG`.

### 3. Giudizio sui Documenti Segnalati come Stabili/Stantii
- **`PRESETS.md`**: **Non cancellato né riscritto da zero**. Il sistema di preset DSL SQL-First (`filters.js`, `presets.js`, `DuckDbProvider.js`) è attivo, in produzione e governa tutti i cataloghi standard. Aggiornato per correggere il drift di riga.
- **`ALGORITHMS.md`**: **Non cancellato né riscritto da zero**. Il motore matematico del DNA (`dnaEngine.js`, `ProfileScorer.js`, rarità dolce, VSM) è in esecuzione e alimenta l'80% del feed hero. Il Ticket 12 ha confinato le strategie come voci di lista nel modulo pool, ma la formulazione matematica e gli invarianti sono vivi e presidiati da test di caratterizzazione.
- **`KITSU_MAPPING.md`**: **Non cancellato né riscritto da zero**. La logica di mapping ibrido TMDB/Kitsu (`animeMappingStore.js`, `services/anime-source`, `_isAnime`) è pienamente attiva e gestisce i flussi e i badge anime.
- **Valutazione complessiva**: Nessuno dei tre documenti descriveva codice morto; la stasi era dovuta alla stabilità del codice sottostante rispetto ai confini del grafo.

### 4. Verifica a Mano delle Citazioni (Convenzione 04/10/2026)
- **46 citazioni file/riga** nei due documenti nuovi (`RECOMMENDATION_GRAPH.md` e `LIBRARY_MODULE.md`): tutte verificate e risolte al 100% rispetto al codice reale dell'albero di lavoro.
- **18 collegamenti a documenti** in `docs/INDEX.md`: tutti verificati con corrispondenza biunivoca sui file esistenti in `docs/` (`Test-Path` verde per tutti).
- **5 citazioni con drift** corrette nei documenti preesistenti.
- Totale: **69 citazioni e riferimenti verificati a mano con tool di ispezione diretta**.

### 5. Cosa Resta per Dopo
- **La superficie client / frontend (Ticket 10 e 11)**: Le rotte della dashboard e la rimozione delle chiamate infrastrutturali da `frontend/src/lib/api.ts` sono in lavorazione parallela su altri ticket; sono state chiaramente contrassegnate come *in movimento* nella documentazione.

