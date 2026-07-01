# Changelog & Recenti Novità

Questo documento tiene traccia delle modifiche, dei miglioramenti algoritmici e delle fix applicate all'addon YACA.

## [Luglio 2026]

### Fix e Miglioramenti Algoritmici
- **Gestione Episodi Fantasma su Kitsu**: Ottimizzata la logica di generazione dei badge degli episodi. YACA ora gestisce perfettamente gli *episodi fantasma* (episodi listati ma non ancora trasmessi) di Kitsu. La data di messa in onda (airdate) viene fedelmente importata dai metadati di TMDB. Questo previene il calcolo errato degli episodi "già usciti" per le serie divise in cour o per i rilasci futuri (es. ha corretto il badge di "Ascendance of a Bookworm S4" da Ep 60/24 a Ep 12).
- **Badge Kitsu e Offset TMDB**: Il parsing dei titoli (es. "Season 4") è stato migliorato per evitare di forzare la dicitura "Parte X" quando diverge. Sono stati unificati i criteri che preferiscono il contatore locale di Kitsu, evitando conflitti tra l'indice globale di TMDB e le stagioni indipendenti di Kitsu.

### Utility e Manutenzione
- **Pulizia Repository**: Eliminati file temporanei, vecchi script di evalutazione manuale (`scratch*.js`, `test_*.js` isolati, vecchi dump JSON e vecchi JPG di test dei poster). I file ancora validi e le utility operative sono stati centralizzati all'interno della cartella `scripts/`.
- **Script Unificato (`fetch_catalogs.js`)**: Creato lo script centralizzato `scripts/fetch_catalogs.js` che unisce le funzionalità di `fetch_state.js` e `fetch_all_catalogs.js`. Permette di scaricare e analizzare lo stato dei cataloghi in formato JSON, o testualmente tramite l'aggiunta del flag `--text`. Integrato ufficialmente in `docs/TESTING_UTILITIES.md`.
