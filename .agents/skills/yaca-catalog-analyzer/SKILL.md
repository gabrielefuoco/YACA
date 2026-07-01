---
name: yaca-catalog-analyzer
description: Skill per analizzare i cataloghi di YACA, validarne i contenuti, scovare anomalie e mantenere puliti i metadati. Include strumenti di QA avanzati (Vector Space Model e Data Integrity).
---

# YACA Catalog Analyzer

Questa skill trasforma l'agente in un QA Engineer esperto nella gestione dei cataloghi dinamici di YACA (Stremio + TMDB + Kitsu + VSM). Utilizzala ogni volta che l'utente lamenta cataloghi "sporchi", vuoti, con risultati non pertinenti, o con problemi ai badge.

## Modalità Operativa (Investigazione)

1. **Richiesta Edge Cases**: Se l'utente lamenta un problema generico (es. "ci sono cloni", "il badge è sbagliato"), chiedi SEMPRE degli ID specifici o titoli di esempio (es. "Haikyu", "Spy x Family"). Inizia l'indagine confrontando i metadati raw (da TMDB/Kitsu) con l'output formattato.
2. **Usa gli Strumenti Nativi**: Non cercare di indovinare le cause. Esegui questi script CLI sviluppati appositamente per YACA:

### Strumento A: QA Statico (Analisi Strutturale)
Usa lo script di analisi statica per scovare errori di configurazione (es. mismatch tra generi TV e Movie, mancanza di tag di esclusione animazione `210024`, criteri di ordinamento inadeguati):
```bash
node scripts/analyze_presets.js
```
*Azione:* Leggi e analizza il file generato `analysis_report.json`.

### Strumento B: Data Integrity e Vuotezza (Soglia 60 Elementi)
Usa lo script di test della rilevanza per assicurarti che TMDB restituisca esattamente ciò che i preset richiedono:
```bash
node scripts/test_relevance_all_presets.js
```
*Azione:* Leggi e analizza il file generato `relevance_validation_report.json`.
*Controlli extra:* Se un catalogo è segnalato come vuoto o semi-vuoto (sotto i 60 elementi), usa i **tool MCP di MongoDB** per verificare lo stato di sincronizzazione. Controlla anche che la localizzazione sia impostata correttamente (i titoli devono essere in `it-IT`).

### Strumento C: Debug di Runtime (Fetch Cataloghi)
Per vedere l'output esatto che un utente riceverà (inclusi i badge `hasIta` generati dal Background Scanner e il calcolo della `affinity`), esegui una fetch dinamica simulata bypassando Stremio:
```bash
# Esempio: testa il preset preset_pop_anime con output in formato testo 
node scripts/fetch_catalogs.js --text --local --nocache --catalogs preset_pop_anime
```
*Nota per l'agente:* Lo script genererà (o mostrerà a console) lo stato reale del catalogo. Ottimo per verificare l'impatto del `ProfileScorer.js` o del consensus in `AiDiscoveryProvider.js`.

## Azioni Correttive
- **Esclusioni Anime/Lingue**: TMDB ignora il parametro `without_original_language`. Per escludere contenuti asiatici dai preset occidentali, usa SEMPRE la whitelist `with_original_language: 'en|it|es|fr|de|pt'`. Per escludere anime misti a live-action, usa `without_keywords: '210024'`.
- **Keywords Troppo Restrittive (Zero Match)**: Se un catalogo mirato (es. Commedia Demenziale) restituisce fallback, non post-filtrare l'array. Cerca le keyword ufficiali esatte (es. `364753` per slapstick, `11931` per spoof) e aggiorna il preset, altrimenti lo script `test_relevance_all_presets.js` fallirà.
- **Merge & Deduplicazione (Anime Offset)**: Se trovi "cloni" o anomalie nei metadati (es. conteggio episodi sballato come 60 episodi invece di 12), il problema è quasi sempre nel mapping tra l'ID TMDB e l'ID Kitsu (che calcola le stagioni sfalsate). Usa casi limite reali (es. *Pokemon Horizons*, *Re:Zero*, *Ascendance of a Bookworm*) per testare le fix in `TmdbToKitsuMapper.js`. Analizza sempre lo storico Git (`git log --grep="kitsu" --oneline`) per capire a che punto è lo sviluppo della feature di merge.
- **Cache**: Ricorda di svuotare le cache in fase di test con `clear_caches.js`.

## Scripts Disponibili (Toolbelt)
Nella cartella `scripts/` hai a disposizione i seguenti tool, che ho testato e classificato per utilità:

### Strumenti di QA e Debug (Molto Utili)
- `analyze_taste_profile.js <userId>`: Legge il DNA VSM (`V_final`) cifrato di un utente e usa TMDB per tradurlo in linguaggio umano (Mostra i Top 20 generi/keyword/registi preferiti). Fondamentale per debuggare le evoluzioni del profilo.
- `check_imdb_mapping.js <tipo> <id>`: Verifica se YACA riesce a risolvere l'IMDB ID partendo da un ID Kitsu o TMDB (es. `node scripts/check_imdb_mapping.js kitsu 11`). Essenziale per capire se Stremio/Torrentio troveranno le fonti.
- `test_stremio_meta.js <userId> <type> <id>`: Simula la richiesta Stremio per i metadati di dettaglio (es. `node scripts/test_stremio_meta.js user_1 movie tmdb:157336`) per validare il payload JSON inviato all'app.
- `search_tmdb_keywords.js <termine>`: Trova rapidamente ID e nomi ufficiali per le keyword TMDB da inserire in `presets.js` (es. `node scripts/search_tmdb_keywords.js slapstick`).
- `test_profile_affinity.js <userId> <presetId>`: Calcola l'affinità in locale (Bayesian Score) di un utente su un catalogo specifico, utile per fare QA sul motore di raccomandazione VSM e capire perché certi film sono in cima.
- `test_kitsu_metadata.js <animeName|kitsuId>`: Recupera i dati crudi da Kitsu e mostra come YACA li mappa su TMDB. Utile per debuggare stagioni anime sfalsate o episodi mancanti.
- `fetch_stremio_manifest.js <userId>`: Genera e stampa a console il `manifest.json` dinamico di Stremio per un utente specifico. Ottimo per verificare l'esportazione dei cataloghi e i filtri applicati.
- `analyze_presets.js`: Analizza la validità strutturale dei preset (Genera `analysis_report.json`).
- `test_relevance_all_presets.js`: Verifica che TMDB restituisca risultati pertinenti ai filtri del preset.
- `fetch_catalogs.js`: Simula una richiesta client per scaricare lo stato finale di un catalogo bypassando Stremio.
- `verify_kitsu_mapping.js`: Legge un file `catalog_state.json` e verifica su Kitsu se l'ID mappato da TMDB corrisponde allo stesso anime, restituendo un report di match/mismatch.
- `check_mongo.js`: Utile per eseguire dump o test di connessione rapidi sulla cache salvata in MongoDB.

### Strumenti Operativi (Modifica Stato)
- `rebuild_vsm_vectors.js <userId|all>`: Ricalcola forzatamente da zero i vettori VSM (`V_active` e `V_final`) basandosi sullo storico dell'utente. Essenziale dopo modifiche all'algoritmo di DNA extraction o in caso di corruzione dei vettori.
- `deduplicate_profiles.js`: Scansiona la collection `AddonConfig` in MongoDB e rimuove tutti i cataloghi storici duplicati, facendo pulizia retroattiva.
- `clear_caches.js` / `clear_cache.js` / `clear_kitsu.js`: Svuotano la collection `cacheentries` su Atlas per propagare le modifiche. **Usa questi dopo ogni aggiornamento architetturale**.
- `add_catalogs.js` / `add_kids_catalogs.js`: Inseriscono nuovi cataloghi nel database.
- `set_kids_mode.js` / `exclude_asian_languages.js`: Script di utility per forzare impostazioni o filtri specifici.
- `reorganize_categories.js` / `inject_emojis.js`: Manipolano l'estetica o l'organizzazione dei preset esistenti.

### Strumenti di User Management
- `find_user.js` / `get_user_handle.js`: Utili per recuperare informazioni e ID di un utente specifico dal database per debug mirati.
