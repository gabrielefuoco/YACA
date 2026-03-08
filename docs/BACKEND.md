# Backend & Logica - YACA

Il backend di YACA è costruito su Node.js utilizzando Express. È progettato per essere asincrono, altamente performante e resiliente ai fallimenti delle API esterne.

## Struttura del Codice (`src/`)

- `src/handlers/`: Logica core per gestire le richieste Stremio (Cataloghi, Meta, Stream).
- `src/engines/`: Il motore di raccomandazione ibrido.
- `src/db/`: Connessione MongoDB e modelli Mongoose.
- `src/cache/`: Logica di gestione Redis e caching multi-livello.
## 4. Resilienza e Performance

### Failover di TMDB
Il backend implementa una rotazione automatica di mirror per TMDB. Se l'endpoint principale fallisce, il sistema scala su mirror secondari senza interrompere il servizio.

### Strategia di Cache SWR
YACA usa il pattern **Stale-While-Revalidate**: restituisce dati vecchi in cache mentre aggiorna i nuovi in background, eliminando i tempi di attesa per l'utente finale.
- `src/ai/`: Integrazione con modelli linguistici (LLM).
- `src/clients/`: Wrapper per API esterne con gestione automatica di rate-limiting e retry.

---

## Logica dei Handler

### 1. Catalog Handler (`src/handlers/catalogHandler.js`)
È il componente più critico. Gestisce:
- **Discovery**: Generazione di cataloghi basati su filtri TMDB.
- **Search**: Risoluzione delle ricerche testuali.
- **Merge**: Capacità di unire più cataloghi in uno solo (es. "Marvel + Star Wars").
- **Fast Refresh**: Aggiornamento rapido dei preset per minimizzare i tempi di attesa dell'utente.

### 2. Meta Handler (`src/handlers/metaHandler.js`)
Risolve i dettagli di un singolo contenuto:
- Arricchisce i dati TMDB con informazioni da Kitsu (per gli Anime) o Trakt.
- Gestisce il mapping degli ID (TMDB ID -> IMDb ID -> Kitsu ID).

---

## Motore di Raccomandazione Hybrid (`src/engines/hybridRecommendations.js`)

YACA non usa un solo algoritmo, ma un approccio ibrido:
1.  **Collaborative Filtering**: Usa le raccomandazioni native di Trakt (basate su ciò che altri utenti simili hanno visto).
2.  **Content-Based Filtering**: Analizza i generi e le keyword dei contenuti amati dall'utente (Taste Profile) per trovare titoli simili su TMDB.
3.  **Seed Network**: Espande la libreria dell'utente cercando titoli simili ai suoi "Loved".

---

## Entry Point: `index.js`
Il file `index.js` nella root funge da orchestratore:
- Inizializza il server Express.
- Configura il middleware di sicurezza (CORS, Rate Limiting).
- Definisce gli endpoint per il frontend (configurazione user, preview cataloghi).
- Gestisce i **Cron Jobs** per il warmup del sistema e la sincronizzazione in background.
