# YACA - Technical Architecture & Logic

Questo documento descrive in dettaglio il funzionamento interno di YACA (Yet Another Catalog Addon), focalizzandosi sul motore di raccomandazione, la sincronizzazione dei dati e le integrazioni API.

---

## 1. Motore di Raccomandazione: Taste Profile & Profile DNA

L'architettura di YACA si basa sulla distinzione tra il gusto globale dell'utente e il contesto specifico di visione.

### 🧬 Taste Profile (Globale)
Il **Taste Profile** è un documento MongoDB che aggrega tutti i segnali di interesse dell'utente provenienti da Trakt e Stremio.
- **Assi di Punteggio**: Memorizza punteggi numerici per `genreScores`, `keywordScores`, `directorScores`, `actorScores`, `studioScores`, `eraScores`, `countryScores` e `runtimeScores`.
- **Segnali Pesati**:
  - **Love (Stremio)**: Peso 4.0
  - **Like (Stremio)**: Peso 3.0
  - **Watched (Trakt/Stremio)**: Peso 2.0
  - **Library (Stremio)**: Peso 1.0

### 🧬 Profile DNA (Contestuale)
Il **Profile DNA** agisce come un filtro selettivo sopra il Taste Profile Globale.
- Ogni profilo YACA (es. "Anime", "Horror", "Kids") ha un DNA composto da **Generi** e **Keyword**.
- **Logica di Filtering**: In `ProfileScorer.js`, se un contenuto non ha un match con il DNA del profilo attivo, il suo score viene penalizzato pesantemente (moltiplicatore 0.1), permettendo di isolare solo i contenuti desiderati dal "mare" delle preferenze globali.

---

## 2. Signature di Raccomandazione

Il sistema genera cataloghi dinamici usando diverse strategie (Signature):

| Signature | Logica | Obiettivo |
| :--- | :--- | :--- |
| **The Core** | Top Genre + Top Keyword + DNA | Alta precisione e fedeltà al profilo. |
| **The Blend** | Mix di Top 5 Generi + Fallback DNA | Varietà e scoperta di contenuti correlati. |
| **Rising Star** | Popolari (voto > 7) + DNA + Trakt Recs | Contenuti di tendenza che incontrano il tuo gusto. |

---

## 3. Stremio Deep Sync (AddonKey Exploit)

YACA recupera dati da Stremio che normalmente non sono accessibili via API standard, utilizzando un "escamotage" legato alle collezioni private di Stremio.

### Il Processo:
1. **Recupero AddonKey**: Utilizza l' `authKey` dell'utente per interrogare `https://likes.stremio.com/getAddonKey`.
2. **Accesso ai Cataloghi Nascosti**: Con l'AddonKey, YACA può leggere i cataloghi `stremio-liked-movie`, `stremio-liked-series`, `stremio-loved-movie` e `stremio-loved-series`.
3. **Datastore Sync**: Recupera l'intera libreria (inclusi i progressi di visione) tramite l'endpoint `/datastoreGet` dell'API ufficiale di Stremio.

---

## 4. Integrazione Trakt API & Two-Way Sync

L'integrazione con Trakt non è solo in lettura, ma bidirezionale.

### Sincronizzazione Bidirezionale:
- **Pillola di Addestramento**: Poiché Trakt ha un ottimo motore di raccomandazione nativo, YACA invia automaticamente i Like e i Love di Stremio a Trakt sotto forma di **Rating**.
  - **Love** -> Rating 10/10
  - **Like** -> Rating 8/10
- **Auto-Refresh**: Se una richiesta fallisce con errore 401 (token scaduto), il client Trakt utilizza il `refresh_token` per rigenerare le chiavi in background senza interrompere l'esperienza utente.

---

## 5. Background Sync & Throttling

Per evitare il rate-limiting delle API (TMDB/Trakt) e il sovraccarico del database:
- **Trigger**: La sincronizzazione viene triggerata periodicamente dal cron job di "warmup" (es. Uptime Robot).
- **Throttling Randomizzato**: Un utente viene sincronizzato solo se sono passate almeno **8 ore (± 2h)** dall'ultimo sync. Il range casuale impedisce che migliaia di utenti vengano aggiornati nello stesso istante.
- **Priorità**: Il profilo globale viene aggiornato in background, mentre il refresh dei preset dei cataloghi è ottimizzato per essere veloce (`fastPresetRefresh`).

---

## 6. Data Flow: Dalla Richiesta Stremio alla Risposta

Il ciclo di vita di una richiesta catalogo (es. `/api/:id/catalog/:type/:id.json`) segue una pipeline deterministica e ottimizzata per le performance:

1. **Ingresso e Validazione (`index.js`)**
   - L'applicazione Express riceve la richiesta e valida l'URL dell'host (Anti-SSRF).
   - Estrae la configurazione utente (Two-Table Split) fondendo `UserAccount` (secrets) e `AddonConfig` (preferenze pubbliche) in un oggetto `userConfig` unificato.

2. **Orchestrazione e Caching SWR (`catalogHandler.js`)**
   - Viene generato un hash deterministico della richiesta (`generateRequestHash`).
   - Il `CacheManager` tenta di servire una risposta immediata (L1 Redis / L2 MongoDB).
   - Se la cache è *stale* o *miss*, viene attivato lo SWR (Stale-While-Revalidate), avviando il processo di `fetchCatalog()` in background per aggiornare i dati senza bloccare l'utente.

3. **Routing Intelligente (`CatalogRouter.js`)**
   - La richiesta viene passata al router, che seleziona il provider appropriato in base all'ID del catalogo:
     - Cataloghi basati su intelligenza artificiale o DNA -> `PatternHandler` / `SearchHandler`
     - Cataloghi standard TMDB o di Trakt -> `TMDBHandler` / `TraktHandler`
     - Cataloghi di configurazione -> `ProfileHandler` (es. `yaca-profiles`)

4. **Filtraggio e Post-Processing**
   - I risultati grezzi vengono filtrati per rimuovere i tipi di media errati.
   - Il processore `filterWatchedItems` incrocia i risultati grezzi con i dati di visione dell'utente (provenienti dalla sincronizzazione di base Stremio o Trakt), scartando i titoli già visti se richiesto.

5. **Formattazione Finale (`StremioFormatter.js`)**
   - Viene chiamata la funzione sincrona `formatStremioCatalog`.
   - Conversione finale degli elementi grezzi in oggetti `Meta` compatibili con lo standard Stremio.
   - Processamento delle immagini tramite proxy CDN (ImageKit), applicazione dei layout dinamici (Landscape vs Portrait) e inserimento programmativo del testo "badge" (es. prossimo episodio in uscita).

6. **Risposta al Client**
   - Il JSON finale formattato ( `{ metas: [...] }` ) viene restituito all'applicazione Stremio in esecuzione sul dispositivo dell'utente.
