# 06 - Switch Profilo Stremio

Migliorare l'usabilità di YACA come addon per Stremio garantendo che i cambi di utente o profilo siano immediati e non richiedano reinstallazioni manuali.

## 1. Risolvere lo Switch Profilo Diretto
**Descrizione:** Attualmente il cambio di profilo direttamente dall'interfaccia o dall'installazione su Stremio non funziona come previsto.
**Azioni Dettagliate:**
- **Analisi del problema:** Indagare se il problema è dovuto al caching spinto di Stremio stesso (che memorizza il vecchio URL del manifest), o a problemi di persistenza del token nel nostro backend.
- **Dynamic Manifest:** Assicurarsi che l'URL di installazione in Stremio includa parametri dinamici o ID crittografati che permettano al server YACA di servire i cataloghi giusti a runtime.
- **Ricarica Cataloghi:** Costringere o invitare il client Stremio a fare un hard-refresh dei dati quando lo switch profilo va a buon fine, evitando che l'utente veda i cataloghi del profilo precedente.
