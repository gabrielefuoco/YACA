---
name: yaca-catalog-analyzer
description: Skill per analizzare i cataloghi di YACA, validarne i contenuti, scovare anomalie e mantenere puliti i metadati. Include strumenti di QA avanzati (Vector Space Model e Data Integrity).
---

# YACA Catalog Analyzer

Questa skill trasforma l'agente in un QA Engineer esperto nella gestione dei cataloghi dinamici di YACA (Stremio + TMDB + Kitsu + VSM + DuckDB). Utilizzala ogni volta che l'utente riscontra cataloghi "sporchi", vuoti, con risultati non pertinenti o problemi ai badge.

## Modalità Operativa (Investigazione)

1. **Richiesta Edge Cases**: Se l'utente riscontra un problema generico (es. "ci sono cloni", "il badge è sbagliato"), chiedi SEMPRE degli ID specifici o titoli di esempio (es. "Haikyu", "Spy x Family"). Inizia l'indagine confrontando i metadati raw con l'output formattato.
2. **Usa gli Strumenti Nativi**: Non cercare di indovinare le cause. Esegui gli script CLI nativi disponibili in `scripts/`:

### Strumento A: QA Statico (Analisi Strutturale)
Usa lo script di analisi statica per scovare errori di configurazione nei preset (es. mismatch tra generi TV e Movie, mancanza del tag di esclusione animazione `210024`, criteri di ordinamento inadeguati):
```bash
node scripts/analyze_presets.js
```
*Azione:* Leggi e analizza il file generato `.agents/scratch/analysis_report.json`.

### Strumento B: Data Integrity e Vuotezza (Soglia 60 Elementi)
Usa lo script di test della rilevanza per verificare che TMDB restituisca esattamente ciò che i preset richiedono:
```bash
node scripts/test_relevance_all_presets.js
```
*Azione:* Leggi e analizza il file generato `scripts/relevance_validation_report.json`.
*Controlli extra:* Se un catalogo è segnalato come vuoto o semi-vuoto (sotto i 60 elementi), controlla se i filtri sono troppo stringenti. Controlla anche che la localizzazione sia impostata correttamente (i titoli devono essere in `it-IT`).

### Strumento C: Debug di Runtime (Fetch Cataloghi)
Per vedere l'output esatto che un utente riceverà (inclusi i badge e il formato finale), esegui una fetch simulata bypassando Stremio:
```bash
# Esempio: testa il preset preset_pop_anime con output in formato testo verso il server locale
node scripts/fetch_catalogs.js --text --nocache --catalogs preset_pop_anime
```
*Nota per l'agente:* Lo script genererà output in console o salverà il dump in `.agents/scratch/catalogs_output.txt` o `catalog_state.json`.

## Azioni Correttive
- **Esclusioni Anime/Lingue**: TMDB ignora il parametro `without_original_language`. Per escludere contenuti asiatici dai preset occidentali, usa SEMPRE la whitelist `with_original_language: 'en|it|es|fr|de|pt'`. Per escludere anime misti a live-action, usa `without_keywords: '210024'`.
- **Filtri SQL Nativi (DuckDB)**: La generazione cataloghi avviene tramite query SQL su DuckDB in-memory (`DuckDbProvider.js`). Non costruire stringhe query TMDB obsolete, ma usa i filtri `F.genre()`, `F.keyword()`, `F.any()` in `preset.where`.
- **Merge & Deduplicazione (Anime Offset)**: Se trovi duplicati o anomalie nei metadati (es. conteggio episodi sballato), il problema è quasi sempre nel mapping tra l'ID TMDB e l'ID Kitsu (`TmdbToKitsuMapper.js`).
- **Ottimizzazione Payload in `StremioFormatter.js`**: I cataloghi vengono salvati in cache su Redis (L2) e memoria locale (L1). **Non usare MAI** lo spread operator `...item` in `sanitizeCatalogMeta`, altrimenti ingolferai la cache con i dati grezzi. I campi pesanti (`videos`, `links`, `trailers`) devono essere inclusi SOLO per le richieste meta di dettaglio (`options.isMetaDetail === true`).
- **Invalidazione Cache**: Ricorda di svuotare le cache in fase di test con `node scripts/clear_caches.js` (svuota Redis e reimposta L1).

## Scripts Disponibili (Toolbelt Reale)
All'interno di `scripts/` sono mantenuti esclusivamente i seguenti tool operativi:

### Strumenti di Analisi e Validazione
- `analyze_presets.js`: Analizza la validità strutturale dei preset e genera `.agents/scratch/analysis_report.json`.
- `test_relevance_all_presets.js`: Verifica tramite query TMDB la pertinenza dei filtri di ciascun preset salvando `scripts/relevance_validation_report.json`.
- `fetch_catalogs.js`: Simula una richiesta client per scaricare lo stato finale di uno o più cataloghi (supporta `--url <base>`, `--config <uuid>`, `--catalogs <id>`, `--text`, `--nocache`).

### Strumenti di Cache e Database
- `clear_caches.js`: Svuota la cache Redis L2 (`redisClient.flushdb()`). Indispensabile dopo modifiche ai preset o formattatori.
- `find_user.js`: Ispeziona gli account utente, i profili attivi e i vettori di gusto VSM su MongoDB Atlas (supporta `--handle <handle>`, `--userId <id>`, `--addonUuid <uuid>`).
- `convert_to_parquet.js`: Rigenera i dataset compressi Parquet ZSTD a partire dai dump giornalieri TMDB per DuckDB.
- `migrate_library_itemid_null.js`: Manutenzione per normalizzare record orfani in `UserLibraryItem` (`--apply` per applicare).
