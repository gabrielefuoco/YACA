# 05 - Integrazione Aiostream

Per ottimizzare la ricerca e l'estrazione degli stream multimediali, YACA deve standardizzare l'addon di riferimento, abbandonando logiche frammentate.

## 1. Singola Istanza di Aiostream
**Descrizione:** Rimuovere la dipendenza da scraper obsoleti o frammentati (es. `icv`) in favore di un motore di ricerca unificato.
**Azioni Dettagliate:**
- Centralizzare tutte le logiche di reperimento stream sull'istanza di **Aiostream**.
- Refactoring del codice che attualmente gestisce vecchi addon, eliminando debito tecnico.
- Ottimizzare la configurazione di Aiostream per ottenere i risultati nel minor tempo possibile.

## 2. Supporto Multi-Formatter
**Descrizione:** Aiostream può restituire gli stream (link video, torrent, debrid) con formattazioni testuali differenti (es. qualità, dimensione, flag lingua).
**Azioni Dettagliate:**
- Creare una suite di test (unit test) per mappare tutti i possibili formati in uscita dai *formatter* di Aiostream.
- Assicurarsi che l'interfaccia di YACA (e in ultima analisi quella di Stremio) visualizzi i dati dello stream in modo pulito ed esteticamente gradevole, indipendentemente dal formatter scelto.
