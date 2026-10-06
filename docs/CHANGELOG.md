# Changelog & Recenti Novità

Questo documento tiene traccia delle modifiche, dei miglioramenti algoritmici e delle fix applicate all'addon YACA.

## [Ottobre 2026]

### Titoli: la policy IT → EN → originale

Il dump interroga TMDB con `language: 'it-IT'` e **nessun fallback**: quando la traduzione italiana non esiste, TMDB restituisce l'originale — che per un anime è la stringa giapponese — e quel valore finiva tal quale nella card. Misurato: **716 serie su 3.177** e **1.845 film su 4.351** con caratteri CJK nel titolo mostrato.

Ora le richieste includono `translations` in `append_to_response` (nessuna chiamata in più), `resolveIngestTitle` applica **italiano → inglese → originale**, e il record porta anche le colonne `title_en`/`name_en`. `duckDbStore` esegue `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` all'avvio, così i parquet esistenti (senza le colonne) si caricano senza errori. Backfill eseguito in produzione: **757 titoli** sanati; le serie visibili con CJK passano da **481 a 1**, i film da **32 a 0**. Il residuo sono titoli per cui TMDB non ha alcuna traduzione inglese e che non affiorano in vetrina.

### Hero: quattro leve, e il profilo anime comanda

Un profilo con DNA anime riceveva **~10% di anime** nei hero — la stessa quota di un profilo dichiaratamente non-anime. Le cause erano quattro e sono state tolte tutte, a costo zero di chiamate TMDB: nessuna clausola anime nel canale Generi Primari sotto `favored` (fino a 400 blockbuster nel pool), tutti gli anime su un unico `strand:anime` con cap rigido a 3, il moltiplicatore `favored` asimmetrico (anime ×1.15, non-anime **×1.00**), e due fallback che ricevevano i selettori grezzi invece di quelli effettivi. Ora: sotto-filoni `strand:anime:<genere>` con cap dedicato, non-anime a **×0.85**, fallback corretti. **Quota anime in pagina 1: dal 15% al 100%.**

Insieme: gli **8 hero sono `agnostic`** sulla dimensione anime (il gate smetteva di escluderli sotto *Solo Anime* mentre la macchina a valle — già scritta e testata — non girava mai), e i selettori **Solo Film / Solo Serie** sono stati **rimossi** (0 profili li usavano, ridondanti con i preset mono-tipo).

### Poster: la composizione esce dal processo

YACA non disegna più i badge con `sharp`: la composizione la fa **ERDB**, e la rotta `/erdb-poster/:file` la rende **al volo** al primo miss, scrivendola in cache; se ERDB non risponde, l'evento va in coda e il drenatore riprova ogni 10 minuti. La rotta legacy `/images/poster/...` è diventata un **trampolino 302** per i client che hanno già in cache gli URL vecchi.

La **versione sta nel nome del file** ed è derivata dal contenuto (disegno + id + badge): la URL identifica esattamente un'immagine, senza mappe in memoria da ricordare dopo un riavvio. Il nome lo costruisce **una funzione sola**, condivisa da app e dump offline — così i due lati non possono divergere (la guardia è `tests/posterNameConcordance.test.js`). Rimosse `BadgeDiskCache`, `sharp` e `text-to-svg` (dipendenze e lock compresi).

### Libreria: identità, riordino, visti

- **Identità canonica**: il DB è la legge sul tipo; un titolo che compare come film *e* serie *e* anime è un **bug**, non una scelta di UI. Regola di elezione del primario esplicita (non-rimosso → mappato → identificatore → più recente → `itemId`), `duplicateOf` conseguente, `POST /library` allineato alla normalizzazione del sync (e non sovrascrive più `_ctime`).
- **Riordino**: verificato sul sorgente di Stremio Core che **nessun client ordina per `_ctime`**, mentre `_mtime` è la chiave del merge multi-device — retrodatarlo era la parte dannosa. L'ordine vive ora in `raw_ui_state.libraryOrder`, come `catalogOrder` fa per i cataloghi. I `package-lock` non elencano più `sharp`/`text-to-svg`.
- **«Rimuovi titoli visti»**: azione nella Libreria, non filtro. Fonte: solo lo stato di Stremio; le serie si considerano viste solo se completate o marcate a mano. La rimozione è un tombstone con `_mtime` fresco (deve **vincere** col timestamp, non retrodatarlo), e `WatchHistory` non viene mai toccata.
- **Poster della libreria**: il riallineamento avviene al sync, anche per gli item già `mapped` — il poster memorizzato per gli item composti è un **URL costruito da YACA**, quindi copiarlo da Stremio non aggiornava nulla: va ricalcolato.

### DNA: il motore in un modulo, e un difetto corretto

Il motore matematico vive in **`src/dna/dnaEngine.js`** (puro: niente Mongo, DuckDB o HTTP), con i vecchi percorsi diventati thin-shim. `globalDfCache` resta la stessa istanza — è la trappola silenziosa: se il modulo ne creasse una propria, la rarità ricadrebbe sui fallback **senza errori né log**. Corretto un difetto vero: `V_active` veniva persistito in **due scale diverse** a seconda di chi scriveva il profilo (saturazione per chiave ≈ 1472, oppure somma 100); ora entrambi i percorsi usano `computeActiveDNA`, con `V_final` invariato.

### Ordinamenti: un vocabolario, e i tie-breaker protetti

La traduzione degli ordinamenti vive in un modulo solo (`src/catalog/catalogSorting.js`) con i default dichiarati per famiglia. `CatalogRouter` non pialla più i tie-breaker secondari del preset quando riceve un `sortBy` dall'utente. Il **DNA resta un reranker interno**: nessuna voce «Per te» nel vocabolario.

### Pulizia: −830 righe, e meno copie

- **Merge fra cataloghi e interleave rimossi** (misurato: 0 cataloghi su 73 li usavano), con l'edit dei preset: resta la **duplicazione**, che è il flusso corretto. `MergeModal` cancellato.
- **`isItemAnime` da 4 definizioni a 1**; le due cache scritte a mano passano a `LRUCache`, che era già nel repo.
- Rimosso il dead code provato (`buildCatalogContentKey`, `compareContentIds`, 8 re-export orfani, 11 costanti mai lette).

### Cache: bump necessari

`BADGE_CATALOG_VERSION` 23 → 24 e `HERO_CACHE_KEY_VERSION` v1 → v2: senza, titoli e hero sarebbero rimasti quelli vecchi per il TTL (14 e 7 giorni) e le correzioni sarebbero sembrate inutili. `HERO_CACHE_SCHEMA_VERSION` non è stato toccato: valida la forma del payload, non il contenuto.

### Documentazione

Allineati `CATALOG_LOGIC`, `ALGORITHMS`, `PRESETS`, `STREMIO_INTERNALS`, `FRONTEND`, `DUCKDB_ARCHITECTURE`, `TESTING_UTILITIES`, `EPISODE_BADGES`, `INDEX`. Scritta la convenzione: **il codice è la verità, i documenti lo seguono**; una decisione superata si annota nella mappa dove è stata presa; i documenti si allineano a **codice fermo**.

## [Luglio 2026]

### Fix e Miglioramenti Algoritmici
- **Gestione Episodi Fantasma su Kitsu**: Ottimizzata la logica di generazione dei badge degli episodi. YACA ora gestisce perfettamente gli *episodi fantasma* (episodi listati ma non ancora trasmessi) di Kitsu. La data di messa in onda (airdate) viene fedelmente importata dai metadati di TMDB. Questo previene il calcolo errato degli episodi "già usciti" per le serie divise in cour o per i rilasci futuri (es. ha corretto il badge di "Ascendance of a Bookworm S4" da Ep 60/24 a Ep 12).
- **Badge Kitsu e Offset TMDB**: Il parsing dei titoli (es. "Season 4") è stato migliorato per evitare di forzare la dicitura "Parte X" quando diverge. Sono stati unificati i criteri che preferiscono il contatore locale di Kitsu, evitando conflitti tra l'indice globale di TMDB e le stagioni indipendenti di Kitsu.

### Utility e Manutenzione
- **Pulizia Repository**: Eliminati file temporanei, vecchi script di evalutazione manuale (`scratch*.js`, `test_*.js` isolati, vecchi dump JSON e vecchi JPG di test dei poster). I file ancora validi e le utility operative sono stati centralizzati all'interno della cartella `scripts/`.
- **Script Unificato (`fetch_catalogs.js`)**: Creato lo script centralizzato `scripts/fetch_catalogs.js` che unisce le funzionalità di `fetch_state.js` e `fetch_all_catalogs.js`. Permette di scaricare e analizzare lo stato dei cataloghi in formato JSON, o testualmente tramite l'aggiunta del flag `--text`. Integrato ufficialmente in `docs/TESTING_UTILITIES.md`.
