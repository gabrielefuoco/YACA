# Indice Generale della Documentazione (YACA)

Benvenuto nella documentazione tecnica di **YACA (Yet Another Catalog Addon)**. Questo indice fornisce una panoramica dell'architettura generale del sistema e mappa tutti i documenti di approfondimento disponibili per gli sviluppatori.

---

## 🏛️ Architettura Generale di YACA

YACA è un addon per Stremio progettato con un'architettura **stateful** e modulare, basata sui seguenti pilastri:
- **MongoDB Atlas**: Configurazioni utente, profili, cronologia delle visioni e archivio della libreria.
- **Redis**: Caching distribuito L2 ad alte prestazioni con pattern SWR (Stale-While-Revalidate).
- **DuckDB**: Motore analitico SQL in-memory su dataset Parquet (ZSTD) per interrogazioni dei cataloghi a zero latenza (<10ms) e zero chiamate a `/discover` di TMDB.
- **Motore Grafo delle Raccomandazioni (Python)**: Servizio separato e persistente su porta `7862` che calcola la diffusione PageRank e le affinità dei cluster/mondi, dialogando via HTTP col prodotto Node.js.
- **Modulo Pool (`src/pool/`)**: Porta unica di composizione dei cataloghi hero del feed, con assegnazione pairwise mutuamente esclusiva e inserimento additivo delle righe del grafo.
- **Modulo Libreria (`src/library/`)**: Dominio isolato che possiede i fatti oggettivi dell'utente (watchlist, cronologia, preferenze) e governa la macchina a stati di ingestione e conversione verso TMDB.
- **Modulo Configurazione (`src/configurazione/`)**: Possiede in via esclusiva il modello `UserAccount` e le cose dell'utente (identità, token Trakt, chiavi API pure con risoluzione centralizzata `chiaveEffettiva`/`chiaveGlobale` e degrado dichiarato).

> [!IMPORTANT]
> **Regola dei Moduli e Confini (Ticket 26, 28 & Ticket 36)**: I consumatori passano sempre e solo dalle porte canoniche dei moduli (`src/configurazione/`, `src/library/`, `src/indice/`, `src/posters/`, `src/pool/`, `src/ricerca/`, `src/profile/`, ecc.) e mai da shim intermedi o residui storici (`src/cache/`, `src/db/`, `src/erdb/`). Nessun ponte o shim di retrocompatibilità temporaneo è ammesso nel codice di produzione: un confine dichiarato va imposto. Inoltre, **i modelli vivono solo in `src/models/`** (Ticket 36): `src/db/` resta riservato all'infrastruttura del database (connessione, migrazioni), mentre tutte le entità e i modelli Mongoose risiedono unicamente in `src/models/`.

Sopra questo strato, YACA supporta **Profili Multipli** (es. "Cinema d'Autore", "Anime Fan", "Bambini") ciascuno dotato di un proprio **DNA vettoriale** contestuale e cataloghi dedicati.

### Mappa Architetturale

```mermaid
graph TD
    Stremio["Client Stremio"] <--> |Richieste: Manifest / Catalogo / Ricerca Live| Backend["Backend YACA (Express Server, Node.js :7860)"]
    
    subgraph Pool ["Modulo Pool (src/pool)"]
        HeroPool["getHeroPool (Porta Unica Hero)"]
        HeroSpec["getHeroPoolSpec (Registry & Priorità)"]
    end

    subgraph GraphService ["Servizio Grafo Raccomandazioni (services/graph, Python :7862)"]
        HealthEndpoint["GET /health (<1 ms, versioni artefatto/ricetta)"]
        RaccomandaEndpoint["POST /raccomanda (liste spiegate: il_tuo_mondo, un_passo_fuori)"]
        GraphEngine["Motore PageRank / Bolle (138 MB in RAM)"]
    end

    subgraph LibraryDomain ["Modulo Libreria (src/library)"]
        LibReader["Porta di Lettura (semiDi, leggiWatchlist, storiaDi)"]
        LibIngestion["Ingestione & Macchina a Stati (QUEUED, CONVERTED, PARKED)"]
    end

    subgraph Engine ["Motore Analitico & Scoring Locale"]
        DuckDBEngine["DuckDB SQL Engine (Parquet ZSTD)"]
        DnaEngine["Filtro & Ponderazione DNA (VSM)"]
        MergeEngine["Merging, Dedup & Interleaving"]
    end
    
    subgraph Data ["Integrazioni & Database"]
        TMDB["TMDB API (Dettagli/Crediti)"]
        Trakt["Trakt.tv API"]
        Mongo[(MongoDB Atlas: Config, Library, WatchHistory)]
        Redis[(Redis L2 Cache)]
        GraphVolume[(Volume host /srv/yaca/services/graph/data :ro)]
    end
    
    Backend <--> Pool
    Backend <--> LibraryDomain
    Backend <--> Engine
    Pool <--> |HTTP POST /raccomanda (cache-miss)| GraphService
    Pool <--> |semiDi| LibraryDomain
    GraphService <--> GraphVolume
    Engine <--> Data
    LibraryDomain <--> Mongo
    
    Utente["Utente (SPA Frontend)"] <--> |Configura Profili & Dashboard| Backend
```

---

## 🗺️ Mappa dei Documenti

La documentazione è suddivisa in moduli specifici che analizzano le singole componenti del sistema. Clicca sui link sottostanti per accedere ai relativi dettagli tecnici:

### 1. 🚀 Deployment e Operazioni
*   **[DEPLOYMENT_HOME_SERVER.md](DEPLOYMENT_HOME_SERVER.md)**
    *   *Descrizione*: Guida architetturale e operativa per il deployment principale in self-hosting su **Home Server (`mate`)** tramite Docker Compose, Tailscale (`mate.hyena-alphard.ts.net:7860`), GitHub Container Registry (GHCR) e aggiornamenti automatici tramite Watchtower.
*   **[TIMER_DOPPIAGGI.md](TIMER_DOPPIAGGI.md)**
    *   *Descrizione*: Funzionamento, installazione e verifica del timer batch di sistema (`services/doppiaggi-source`) per lo scraping e il matching dei doppiaggi italiani su `mate`.
*   **[TIMER_POSTER.md](TIMER_POSTER.md)**
    *   *Descrizione*: Architettura del timer di sistema per il drenaggio della coda asincrona poster ed eventi ERDB.

### 2. 🌐 Motore Grafo delle Raccomandazioni & Modulo Pool
*   **[RECOMMENDATION_GRAPH.md](RECOMMENDATION_GRAPH.md)**
    *   *Descrizione*: Architettura completa del motore di raccomandazione a grafo Python (`services/graph/`), contratto HTTP (`GET /health` e `POST /raccomanda`), integrazione nel modulo Pool (`src/pool/index.js`), metriche misurate di runtime e le 5 trappole architetturali già pagate (chiave cache v13, veleno 7 giorni, cap prima/dopo i filtri, `node -e` pendente, `tv`/`series`).

### 3. 📚 Dominio Libreria & Ingestione Dati
*   **[LIBRARY_MODULE.md](LIBRARY_MODULE.md)**
    *   *Descrizione*: Architettura del dominio Libreria (`src/library/`): separazione ontologica «la libreria fornisce fatti, il profilo deduce», porta di lettura (`semiDi`, `leggiWatchlist`, ecc.), risoluzione contesto a tre chiavi, write path unificato `ingestStremioData` e macchina a stati formale di conversione (`QUEUED`, `CONVERTED`, `PARKED`).

### 4. 🦆 Motore Dati e Query In-Memory
*   **[DUCKDB_ARCHITECTURE.md](DUCKDB_ARCHITECTURE.md)**
    *   *Descrizione*: Architettura del motore di pre-filtraggio e discovery in-memory basato su **DuckDB** e dataset TMDB serializzati in formato Apache Parquet (ZSTD). Spiega l'eliminazione delle chiamate lente a `/discover` di TMDB e le query SQL native vettorializzate.

### 5. 🧬 Algoritmi di Scoring e Raccomandazione (Vecchio Stack)
*   **[ALGORITHMS.md](ALGORITHMS.md)**
    *   *Descrizione*: Approfondimento sugli algoritmi matematici ed euristici di YACA. Spiega come viene calcolato il Taste Profile pesando le azioni dell'utente, l'estrazione vettoriale del DNA, la formula di scoring per ordinare i titoli, il rating bayesiano e le strategie storiche di *Seed Stacking*, *True Blend* e *Hidden Gems* (oggi confinate come voci in `src/pool/index.js`).

### 6. 🤖 Motore AI ed Elaborazione del Linguaggio Naturale
*   **[AI_ENGINE.md](AI_ENGINE.md)**
    *   *Descrizione*: Dettagli sull'integrazione con **Mistral AI**. Copre il funzionamento del router AI (`router.js`) per tradurre il linguaggio naturale in filtri TMDB e l'integrazione del motore di ricerca semantica *Live Search* direttamente dalla barra di ricerca di Stremio.

### 7. 🖥️ Architettura Frontend (SPA)
*   **[FRONTEND.md](FRONTEND.md)**
    *   *Descrizione*: Analisi dell'applicazione frontend basata su **React 19** e **Next.js 16 (Static Export)**. Descrive la struttura dei file in `frontend/src/`, la gestione della sessione cookie-based sicura con protezione CSRF, il debouncing degli aggiornamenti degli addon in Stremio e la visualizzazione del grafico DNA tramite `DnaBarChart.tsx`.

### 8. 🔀 Logica dei Cataloghi e Ciclo di Vita
*   **[CATALOG_LOGIC.md](CATALOG_LOGIC.md)**
    *   *Descrizione*: Spiega il ciclo di vita di una richiesta di catalogo proveniente da Stremio. Dettaglia l'algoritmo di unione dei cataloghi di film e serie, l'interleaving dei canali per mescolare i risultati, l'architettura di caching L1 (RAM) e L2 (Redis), e l'idratazione dei badge ITA anime da `anime_airing_state`.

### 9. ⚙️ Internals di Stremio e Mapping Anime
*   **[STREMIO_INTERNALS.md](STREMIO_INTERNALS.md)**
    *   *Descrizione*: Analizza le logiche interne dell'addon e le soluzioni applicate per superare le limitazioni di Stremio. Copre la configurazione dei profili multipli, il manifest dinamico, l'ordinamento TMDB per popolarità nei fallback e il *Hybrid Anime Mapping* con recupero flussi dual-query parallelo (Kitsu + IMDb).
*   **[KITSU_MAPPING.md](KITSU_MAPPING.md)**
    *   *Descrizione*: Dettagli dell'algoritmo ibrido per la mappatura tra Kitsu e TMDB, con strategie anti-mescolamento per le multi-stagioni e risoluzione delle collisioni.
*   **[EPISODE_BADGES.md](EPISODE_BADGES.md)**
    *   *Descrizione*: Logica dinamica di calcolo e visualizzazione dei badge degli episodi e doppiaggio italiano sui poster di Stremio.

### 10. 🔄 Integrazioni Esterne e Sincronizzazione
*   **[INTEGRATIONS.md](INTEGRATIONS.md)**
    *   *Descrizione*: Analisi tecnica del protocollo di sincronizzazione bidirezionale con **Trakt.tv** tramite il Device Auth Flow. Dettaglia i meccanismi di failover, il recupero dei dati di cronologia e voti, e l'allineamento dello stato dell'utente.

### 11. 🧬 Configurazione e Gestione dei Preset
*   **[PRESETS.md](PRESETS.md)**
    *   *Descrizione*: Approfondimento sul sistema di cataloghi pre-configurati (preset) di YACA in `src/catalog/presets.js`. Spiega come sono strutturati, il dizionario delle entità e l'uso degli script CLI per l'analisi e la validazione dei cataloghi.
*   **[PRESETS_DATE.md](PRESETS_DATE.md)**
    *   *Descrizione*: Perché sette preset hanno la data di oggi dentro la definizione: che forma ha, chi la calcola, cosa cambierebbe togliendola e perché finisce nella chiave della cache.

### 12. 🧪 Testing, Strumenti di Amministrazione e Storico
*   **[TESTING_UTILITIES.md](TESTING_UTILITIES.md)**
    *   *Descrizione*: Manuale per sviluppatori e amministratori del sistema. Copre l'esecuzione dei test di unità/integrazione tramite Jest, la validazione della rilevanza dei preset e gli script amministrativi attivi (`clear_caches.js`, `convert_to_parquet.js`, `find_user.js`, `migrate_library_itemid_null.js`).
*   **[storico-script.md](storico-script.md)**
    *   *Descrizione*: Registro storico dei 19 script rimossi da `scripts/` (Ticket 06), con data ultimo commit, scopo, SHA di recupero (`git show <sha>:<path>`) e stato di verifica dell'esecuzione.

### 13. 📝 Changelog
*   **[CHANGELOG.md](CHANGELOG.md)**
    *   *Descrizione*: Storico delle modifiche, aggiornamenti e nuove feature implementate nel progetto YACA.

---

## 🔑 Tabella delle Variabili d'Ambiente Utilizzate

Di seguito sono elencate le variabili d'ambiente effettivamente supportate ed esaminate nel codice di YACA.

| **Variabile** | **Obbligatoria** | **Descrizione** |
|---|---|---|
| `MONGODB_URI` | **Sì** | Stringa di connessione a MongoDB (es. MongoDB Atlas). |
| `REDIS_URL` | No | URL del server Redis per la cache distribuita L2 (default `redis://127.0.0.1:6379` o `redis://redis:6379` in Docker Compose). |
| `TMDB_API_KEY` | **Sì*** | API Key globale di TMDB per arricchire i metadati. Se omessa sul server, gli utenti dovranno inserirla nella UI. |
| `MISTRAL_API_KEY` | No | API Key per abilitare il *Router AI* ed i cataloghi basati su AI. |
| `JWT_SECRET` | No | Consigliata. Chiave per firmare i token JWT di sessione della dashboard (genera fallback casuale al riavvio). |
| `HOST_URL` | **Sì** | URL pubblico del server (fondamentale per la generazione di manifest e badge). |
| `PORT` | No | Porta di ascolto del server backend Node (default `7860`). |
| `GRAPH_SERVICE_URL` | No | URL del servizio di raccomandazione a grafo Python (default `http://graph:7862` nella rete interna compose, letto da `src/pool/graphClient.js`). |
| `GRAPH_TAG` | No | Tag dell'immagine Docker per `ghcr.io/gabrielefuoco/yaca-graph` (default `latest` in `docker-compose.yml`). |
| `TRAKT_CLIENT_ID` | No | Client ID di Trakt.tv per abilitare la sincronizzazione. |
| `TRAKT_CLIENT_SECRET` | No | Client Secret di Trakt.tv per completare il flow di autenticazione. |
| `CORS_ALLOWED_ORIGINS` | No | Origini CORS consentite per le API pubbliche. |

> [!NOTE]
> La variabile `GRAPH_URL` **non esiste** nel codice di YACA (è una denominazione impropria citata talvolta in discussioni informali): il nome effettivo e canonico supportato nel codice applicativo è `GRAPH_SERVICE_URL`.

---

## 📦 Artefatti di Produzione e Stato

- **Artefatto del Grafo (Numpy)**: Il grafo attivo non è memorizzato nel repository git. Risiede come bind mount read-only sul server mate in `/srv/yaca/services/graph/data` (~138 MB di matrici compresse `.npz` e `.npy`), montato su `/app/services/graph/data:ro` nel container `yaca-graph`.
- **`src/data/bolle.json` (Legacy)**: File di ~3.2 MB residuo del vecchio ponte JS. Con la cancellazione di `Bolle.js` e `raccomanda.js` (Ticket 08), non è più importato né letto da alcun modulo sotto `src/`. Il tracking git verrà eliminato nel Ticket 09.
- **`.scratch/`**: La cartella delle mappe di lavoro e dei ticket è **tracciata e versionata in git** dal 06/10/2026 (766 file al 17/10/2026), garantendo che la memoria storica e le misure rimangano disponibili in ogni clone del repository.

---

## Come si mantengono questi documenti

Le **mappe di lavoro** stanno in `.scratch/<mappa>/` (una mappa + i suoi ticket). Sono
**versionate**: dal 06/10/2026 `.scratch/` è tracciata in git — 766 file al 17/10/2026 — dopo che una
cancellazione accidentale aveva distrutto nove mappe storiche e nessuna copia le conteneva (vedi
`.scratch/README.md`). Viaggiano quindi con il clone, e contengono il racconto di come si è arrivati a una
decisione — le misure, i vicoli ciechi, gli errori — ed è per questo che spiegano meglio del codice.

**Quando una mappa si chiude**, si raccoglie qui quello che non dipende dalla sessione:

- le **regole** che valgono ancora (formati, contratti, convenzioni);
- le **misure** che motivano una scelta, con la data;
- i **vincoli** scoperti per forza — le trappole già pagate.

Nella mappa resta il racconto, nel doc va il distillato. **Il codice vince sempre**: la mappa
è una storia, il doc descrive il codice **com'è adesso**, non come i ticket lo descrivevano
mentre si lavorava.

Se un doc non viene toccato mentre la sua mappa si chiude, invecchia — ed è esattamente
quello che è successo a `PRESETS`, `ALGORITHMS` e `KITSU_MAPPING`: fermi da un mese mentre
il codice cambiava sotto.

**Verifica a mano delle citazioni (deciso il 04/10/2026)**: niente controlli automatici — la verifica la fa l'agente quando congela una mappa. Per ogni `file:riga` citato: il file esiste ancora? è cambiato da quando la mappa è stata scritta? Il 03/10/2026 questo controllo a mano ha trovato tre file citati che erano stati **rimossi a luglio e agosto** (`kitsu.js`, `sync_entities.js`, `TmdbProvider.js`) e un numero di schema superato di due versioni. È il genere di divergenza che nessuno nota finché non ci sbatte contro.

### Marcatura delle decisioni superate (convenzione, 06/10/2026)

Una decisione presa in una mappa può essere **superata** da un ticket successivo: quando succede, si annota **nella mappa dove la decisione è stata presa**, non solo nella mappa nuova. Una riga, subito sotto la decisione:

```
> **Superata il <data>** dal ticket <N> della mappa `<nome-mappa>`: <perché>.
```

Serve perché le mappe restano leggibili per anni: senza il marcatore, chi le rilegge da sole crede ancora valida una scelta che il codice ha già abbandonato — ed è esattamente il modo in cui `streamHandler` è rimasto documentato come proxy dei flussi per mesi dopo essere diventato un guscio vuoto.

Corollario, sull'ordine dei lavori: **i documenti si allineano quando il codice è fermo.** Allinearli mentre si implementa significa rincorrere un bersaglio che si sposta, e produrre doc che sono già sbagliati quando li si finisce di scrivere.
