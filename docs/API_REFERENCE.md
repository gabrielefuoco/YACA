# Riferimento API - YACA

YACA espone una serie di endpoint REST per il frontend di configurazione e rispetta il protocollo Stremio Addon per l'integrazione con il client Stremio.

## Endpoint Stremio (Addon API)

Il backend risponde alle richieste standard di Stremio:

-   `GET /manifest.json`: Restituisce il manifesto dell'addon, inclusi i cataloghi dinamici basati sul profilo utente.
-   `GET /catalog/:type/:id/:extra?.json`: Gestisce la navigazione dei cataloghi (Discovery, Search, AI, Merge).
-   `GET /meta/:type/:id.json`: Restituisce i metadati dettagliati di un titolo.
-   `GET /stream/:type/:id.json`: Fornisce i link di streaming (se configurati).

---

## Endpoint di Configurazione (Frontend API)

Utilizzati dal sito di configurazione web per gestire l'utente e i profili.

### Gestione Utente
-   L'autenticazione utente è gestita da NextAuth via `POST /api/auth/*`.
-   `POST /api/configure`: Carica o aggiorna l'intera configurazione (profili, API key, preferenze).

### Utility e Preview
-   `POST /api/preview-catalog`: Genera un'anteprima rapida (primi 20 risultati) di un catalogo basandosi su filtri o prompt AI senza salvarlo.
-   `GET /api/presets`: Restituisce la lista dei preset di cataloghi predefiniti.
-   `POST /api/validate-tmdb-key`: Verifica la validità di una chiave API TMDB fornita dall'utente.

### Media Processing
-   `GET /blur?url=...`: Proxy per generare versioni sfocate dei poster (utilizzato per effetti estetici nel frontend).
-   `GET /badge/poster.jpg?url=...&text=...`: Genera un'immagine composita con un badge sovrapposto al poster originale (es. numero episodio).

---

### Trakt Auth (Device Flow)
-   `POST /api/trakt/device/code`: Inizia il processo di autenticazione Trakt.
-   `POST /api/trakt/device/token`: Controlla se l'utente ha completato l'autorizzazione su Trakt e restituisce i token.
