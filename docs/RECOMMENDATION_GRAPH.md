# Motore delle Raccomandazioni: Servizio, Contratto HTTP e Modulo Pool

Questo documento definisce l'architettura tecnica del motore di raccomandazione a grafo di YACA, il suo contratto di comunicazione HTTP tra il servizio Python e l'applicazione Node.js, l'incapsulamento della composizione dei cataloghi nel modulo Pool, e l'elenco delle trappole architetturali già pagate durante la transizione (Ticket 01, 07, 08, 12, 18).

---

## 🏛️ 1. Architettura dei Confini

A partire dalla ristrutturazione architetturale di ottobre 2026, il calcolo delle raccomandazioni basate sui mondi e sulla diffusione del grafo è stato separato dal runtime Node:

```
+-------------------------------------------------------------------------------+
| CONTAINER yaca-app (Node.js)                                                  |
|                                                                               |
|  [Stremio Request]                                                            |
|          |                                                                    |
|          v                                                                    |
|  [src/engines/hybridRecommendations.js] (Feed / Paginazione / Idratazione)     |
|          |                                                                    |
|          v (cache-miss, non a ogni richiesta)                                 |
|  [src/pool/index.js] (getHeroPool: porta unica del modulo Pool)               |
|     |                                                                         |
|     +--> [HERO_STRATEGIES]: true_blend, seed_network, hidden_gems, trakt      |
|     +--> [HERO_STRATEGIES]: graph_rows (riga additiva del grafo)              |
|               |                                                               |
|               v                                                               |
|          [src/pool/graphClient.js] (Client HTTP axios, timeout 10s)           |
+---------------+---------------------------------------------------------------+
                |
                | HTTP POST /raccomanda (JSON, porta 7862)
                | HTTP GET  /health     (Hash artefatto & ricetta in <1 ms)
                v
+-------------------------------------------------------------------------------+
| CONTAINER yaca-graph (Python 3)                                               |
|                                                                               |
|  [services/graph/servizio.py] (HTTPServer nativo, single worker)              |
|          |                                                                    |
|          v                                                                    |
|  [services/graph/motore.py] + [camminata.py] + [bubbles.py]                   |
|          |                                                                    |
|          v                                                                    |
|  Volume read-only: /app/services/graph/data (:ro)                             |
|  (/srv/yaca/services/graph/data sull'host mate - 138 MB artefatti numpy)      |
+-------------------------------------------------------------------------------+
```

### Principi Guida del Confine
1. **Separazione dei ruoli**: Il motore Python decide *dove guardare e in che ordine* (liste di titoli ordinate per punteggio di attivazione); il prodotto Node decide *cosa e come mostrare* (arricchimento TMDB, poster, badge, lingue, dedup e paginazione).
2. **Invocazione al cache-build**: Il servizio grafo viene interrogato esclusivamente in occasione della costruzione dei pool memorizzati (`buildSharedHeroCatalogs` in [src/pool/index.js](../src/pool/index.js#L342)), mai sul percorso caldo di una singola richiesta catalogo di Stremio.
3. **Internalizzazione dell'artefatto**: L'artefatto del grafo non è più un file monolitico tracciato in git letto dal backend Node (come era l'antico `src/data/bolle.json`), ma un dettaglio binario interno al modulo Python (`services/graph/data/`).

---

## 📡 2. Il Contratto HTTP del Servizio (`services/graph/servizio.py`)

Il servizio risponde su porta `7862` (configurabile tramite variabile d'ambiente `PORT`, default in [services/graph/servizio.py:297](../services/graph/servizio.py#L297)). Non richiede librerie esterne complesse, sfruttando il server `http.server.HTTPServer` standard di Python con single-worker sincrono.

### 2.1 Endpoint `GET /health` (Emendamento E3)
- **Implementazione**: [services/graph/servizio.py:221-228](../services/graph/servizio.py#L221-L228).
- **Latenza di risposta**: **0.25 ms** (misurato a caldo; stringa JSON pre-serializzata in RAM all'avvio in [services/graph/servizio.py:275-282](../services/graph/servizio.py#L275-L282)).
- **Scopo doppio**:
  1. Funge da healthcheck per Docker/compose (`start_period: 10s`), impedendo al server Node di inviare traffico prima del caricamento in memoria.
  2. Espone l'impronta di versione dell'artefatto e della ricetta:
     ```json
     {
       "ok": true,
       "contratto": 1,
       "versioni": {
         "artefatto": "f8a92...",
         "ricetta": "e12c4..."
       }
     }
     ```
  3. Il client Node [src/pool/graphClient.js:37](../src/pool/graphClient.js#L37) interroga `/health` memorizzando la risposta in RAM per **60 secondi** (`HEALTH_CACHE_TTL_MS = 60000`). La versione viene incorporata direttamente nella chiave di cache delle raccomandazioni: quando l'artefatto viene aggiornato sul motore e il servizio riavviato, la cache del prodotto decade automaticamente senza riavviare l'app.

### 2.2 Endpoint `POST /raccomanda` (e alias `POST /`)
- **Implementazione**: [services/graph/servizio.py:243-267](../services/graph/servizio.py#L243-L267) tramite `esegui_richiesta` ([services/graph/servizio.py:26](../services/graph/servizio.py#L26)).
- **Richiesta conforme al contratto**:
  ```json
  {
    "semi": [
      { "tmdbId": 655, "medium": "series", "tipo": "watched", "peso": 0.42 },
      { "tmdbId": 1399, "medium": "series", "tipo": "loved", "peso": 4.0 }
    ],
    "medium": "series",
    "opzioni": { "largo": 4, "lontano": 0.0, "cozy": 0.0, "canone": 0.0 },
    "cap": 60
  }
  ```
  - `semi` (array obbligatorio): Storia dei titoli dell'utente. Titoli non presenti nel canone del grafo vengono scartati silenziosamente.
  - `peso` (numerico, opzionale - Emendamento E1): Preserva il decadimento temporale misurato dal prodotto (`max(0.20, 0.5^(giorni/60))`). Se assente, il motore ripiega sui pesi statici per tipo.
  - Tipo `"catalogo"` (Emendamento E2): Ammesso per i semi da freddo (< 3 titoli in cronologia). Diffonde la probabilità nel PageRank ma non viene mai restituito nei titoli raccomandati (`semi.da_catalogo: true`).
  - `medium` (stringa `"movie"` | `"series"`, opzionale - Emendamento E4): Se specificato, filtra la risposta per il medium richiesto; se assente, restituisce entrambi i medium con una sola camminata di diffusione.
  - `opzioni` (oggetto opzionale): Slider di modulazione (`largo`, `lontano`, `cozy`, `canone`). Se assente, applica `SLIDER_DEFAULT`.
  - `cap` (intero, default `60`): Numero massimo di titoli per singola lista.

- **Risposta del Motore (Liste Spiegate)**:
  ```json
  {
    "contratto": 1,
    "versioni": { "artefatto": "f8a92...", "ricetta": "e12c4..." },
    "semi": { "n": 2, "da_catalogo": false },
    "liste": [
      {
        "ruolo": "il_tuo_mondo",
        "mondo": 4192,
        "descrizione": "mondo 4192 — 128 titoli, voti mediani 7.4",
        "attivazione": 0.8312,
        "mediana_voti": 7.4,
        "quota_serie": 0.85,
        "semi": [655],
        "titoli": [
          { "tmdbId": 1396, "medium": "series", "punteggio": 0.421503 }
        ]
      },
      {
        "ruolo": "un_passo_fuori",
        "mondo": null,
        "descrizione": "mondi vicini (104, 812)",
        "attivazione": 0.5120,
        "mediana_voti": 7.1,
        "quota_serie": 0.60,
        "semi": [1399],
        "titoli": [
          { "tmdbId": 60059, "medium": "series", "punteggio": 0.312940 }
        ]
      }
    ],
    "motivi": []
  }
  ```
  - Ogni lista porta una spiegazione globale (mondo, descrizione, attivazione, mediana voti, semi attivatori).
  - Ogni titolo porta `tmdbId`, `medium` (`"movie"` o `"series"`) e `punteggio` (attivazione utile per il merge).
  - Ruoli derivati: `uscite_nuove` e `nicchia_di_qualita` portano `parziale: true` perché il prodotto può rifinirle col catalogo locale DuckDB più aggiornato.

---

## ⚡ 3. Misure Reali di Runtime

I numeri seguenti sono stati misurati con benchmark su un campione reale (storia di 100 semi da cache Trakt reale, 4 liste, cap 60):

| Metrica | Valore Misurato | Limite / Nota |
|---|---|---|
| **Avvio del processo / caricamento artefatti** | **2.05 s** | Inizializza `Motore` caricando 66.259 titoli e 3.497 bolle da `transizione-potata.npz`. |
| **Latenza `GET /health`** | **0.25 ms** | Limite di contratto: < 1 ms. |
| **Latenza `POST /raccomanda` (a freddo)** | **95.44 ms** | Prima invocazione dopo avvio. |
| **Latenza `POST /raccomanda` (a caldo)** | **92.39 ms** | Media su 10 iterazioni consecutive (minimo: 86.62 ms). |
| **Memoria RAM residente (RSS)** | **128.4 MB** | Singolo worker Python in `docker-compose.yml` (`mem_limit: 512m`). |
| **Dimensione volume artefatto host** | **138 MB** | `/srv/yaca/services/graph/data` sul mate (contro i 666 MB completi di scarti locali). |

---

## 🛡️ 4. Regole di Degrado ed Errori

1. **Il caso normale non è mai un errore**: Se l'utente non ha cronologia, o se nessun ID della cronologia ricade nel canone del grafo, il servizio risponde HTTP `200` con `liste: []` e motivo esplicito:
   `"motivi": ["storia fuori dal canone"]`.
2. **Nessun ripiego popolare**: Se la storia non trova corrispondenza, il motore **non** restituisce titoli popolari o casuali. Restituire un catalogo generico spacciato per personalizzato distrugge la fiducia dell'utente nel raccomandatore.
3. **Artefatto non caricato**: HTTP `503` con `{"ok": false, "errore": "motore non pronto o artefatto non caricato"}`.
4. **Richiesta non valida / JSON malformato**: HTTP `400` con spiegazione del campo non conforme.
5. **Timeout del client**: [src/pool/graphClient.js:16](../src/pool/graphClient.js#L16) fissa un timeout di **10 secondi** (`GRAPH_TIMEOUT_MS = 10000`). Poiché il motore risponde in ~92 ms, il margine è di oltre 100x.

---

## 🏊 5. Il Modulo Pool (`src/pool/`)

Il modulo [src/pool/index.js](../src/pool/index.js) unifica in un'unica barriera architetturale la costruzione di tutti i cataloghi hero del feed:

### 5.1 La Porta Unica: `getHeroPool`
- Firma: [src/pool/index.js:511](../src/pool/index.js#L511):
  ```javascript
  getHeroPool({ userId, context, mediaType, kidsMode, typeSelectors, traktToken, tmdbApiKey, userConfig }) -> Promise<Object>
  ```
- Il modulo feed [src/engines/hybridRecommendations.js](../src/engines/hybridRecommendations.js) non importa più alcuna strategia singola, ma chiama unicamente `getHeroPool`.

### 5.2 Strategie come Voci di una Lista (`HERO_STRATEGIES`)
In [src/pool/index.js:166](../src/pool/index.js#L166), le strategie sono elementi ordinati di un array:
- Le **4 strategie storiche** (`true_blend`, `seed_network`, `hidden_gems`, `trakt_filtered`) producono candidati concorrenti che vengono assegnati in modo mutuamente esclusivo tramite `assignHeroPools` e il set `claimedIds`.
- La voce **`graph_rows`** ([src/pool/index.js:223](../src/pool/index.js#L223)) è additiva (`additive: true`): viene eseguita *dopo* l'assegnazione esclusiva, estrae i semi dalla libreria (`semiDi` da `src/library/`), chiama `graphClient.raccomanda`, e assegna direttamente i titoli calcolati a `yaca_mondi_*` e `yaca_passo_fuori_*` senza sottrarre candidati al pool degli altri hero.

### 5.3 Il Decimo Posto Ridotto a Uno (`getHeroPoolSpec`)
In precedenza, gli hero erano definiti in nove posti derivati da `registry.js`, mentre `HERO_PRIORITY` viveva scollegato nel feed come decimo posto.
Oggi [src/catalog/registry.js:300](../src/catalog/registry.js#L300) esporta `getHeroPoolSpec()`:
- `heroPriority`: `['true_blend', 'seed_network', 'hidden_gems', 'trakt_filtered', 'mondi', 'passo_fuori']`
- `slugAdditivi`: `Set(['mondi', 'passo_fuori'])`
- `catalogs`: metadati di tutte le righe.
Il modulo pool importa `getHeroPoolSpec()` in [src/pool/index.js:38](../src/pool/index.js#L38). Modificare, aggiungere o ritirare una riga hero richiede ora di toccare un solo file.

### 5.4 Invariante del Pool: Oggetti Strutturati, Mai Stringhe Scalari (Emendamento E6)
La funzione `ensurePoolItem` ([src/pool/index.js:78](../src/pool/index.js#L78)) garantisce che ogni elemento inserito in un pool sia un oggetto completo:
```javascript
{
  id: "tmdb:655",
  tmdbId: 655,
  type: "series",        // "movie" o "series"
  media_type: "tv",      // "movie" o "tv"
  toString() { return this.id; }
}
```
L'uso di stringhe scalari nude (`"tmdb:655"`) è vietato: in TMDB gli ID numerici di film e serie collidono nello stesso intervallo di interi. Senza `media_type`/`type` esplicito, l'idratazione e i filtri a valle non possono distinguere un film da una serie.

---

## 🪤 6. Le Trappole Già Pagate

Cinque trappole insidiose sono state scoperte e pagate durante lo sviluppo. Sono documentate qui affinché nessuna sessione futura debba ripagarle:

### Trappola 1: La Chiave di Cache e il Veleno dei 7 Giorni (Emendamento E5)
- **Il problema**: La cache delle raccomandazioni in Redis/RAM ha un TTL di **7 giorni** ([src/config.js:39](../src/config.js#L39), `RECOMMENDATIONS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000`). Se il servizio grafo fosse temporaneamente giù (es. durante un riavvio di Watchtower), salvare il fallimento avrebbe lasciato le righe del grafo vuote per un'intera settimana per quell'utente.
- **La soluzione**:
  1. `HERO_CACHE_KEY_VERSION` è stata alzata a **`v13`** ([src/pool/index.js:48](../src/pool/index.js#L48)).
  2. La chiave di cache incorpora l'hash restituito da `GET /health` (`_art_<sha>_ric_<sha>`).
  3. Se `graphClient.raccomanda` fallisce (timeout, 503 o connessione rifiutata), il pool assegna righe vuote ma imposta `graphCallFailed = true`. In tal caso, [src/pool/index.js:490](../src/pool/index.js#L490) salva la cache con un **TTL transitorio di soli 60 secondi**, prevenendo l'avvelenamento a lungo termine.

### Trappola 2: Il Cap Prima o Dopo i Filtri (`anime: exclude`)
- **Il problema (Ticket 38)**: Il feed eseguiva `.slice(0, 20)` sui candidati *prima* dell'idratazione e dell'applicazione dei filtri di tipo. Per un profilo con selettore `anime: 'exclude'`, se 18 dei primi 20 titoli del pool erano anime, il filtro post-fetch scartava i 18 anime lasciando solo **2 serie** nella riga di Stremio.
- **La soluzione**: In [src/engines/hybridRecommendations.js:286-317](../src/engines/hybridRecommendations.js#L286-L317), i candidati vengono scorsi ed elaborati filtrandoli con `cardSurvivesFilters` ([src/engines/hybridRecommendations.js:170](../src/engines/hybridRecommendations.js#L170)); il taglio `.slice(skip, skip + ITEMS_PER_PAGE)` avviene **esclusivamente a valle dei filtri**. Con la correzione, la stessa richiesta restituisce **20 serie su 20**.

### Trappola 3: Il `node -e` che non esce mai
- **Il problema**: L'importazione di moduli applicativi che dipendono da [src/cache/cacheInstances.js](../src/cache/cacheInstances.js) inizializza client `ioredis` e connessioni a database, mantenendo l'event loop di Node.js permanentemente attivo.
- **La conseguenza**: Comandi CLI di test o diagnosi come `node -e "require('./src/api/stremio')"` stampano l'output e **non terminano mai**, bloccando la shell e i job di automazione indefinitamente (accaduto il 17/10/2026: 8 ore di blocco).
- **La regola**: Qualsiasi comando `node -e` o script batch deve invocare esplicitamente `process.exit(0)` al termine dell'operazione, e qualsiasi esecuzione automatica deve essere protetta da un `timeout` a livello di shell.

### Trappola 4: I Dieci Posti degli Hero
- **Il problema**: Le righe hero avevano la propria configurazione frammentata in nove funzioni in `registry.js`, ma la priorità `HERO_PRIORITY` era cablata separatamente nel motore di raccomandazione. Modificare una riga senza allineare `HERO_PRIORITY` portava alla sparizione silenziosa del catalogo.
- **La soluzione**: [src/catalog/registry.js:300](../src/catalog/registry.js#L300) centralizza prioritizzazione e additività in `getHeroPoolSpec()`.

### Trappola 5: `tv` vs `series` e gli Identificativi
- **Il problema**: In TMDB le serie hanno tipo `tv`, nei manifest e cataloghi Stremio si chiamano `series`, e nel parquet DuckDB gli ID sono nella forma breve senza tipo (`tmdb:<id>`, vedi [src/catalog/providers/DuckDbProvider.js:292](../src/catalog/providers/DuckDbProvider.js#L292)).
- **La soluzione**: Nel contratto HTTP del grafo il medium è rigorosamente normalizzato come `"series"` o `"movie"`. Ai confini, [src/handlers/catalogHandler.js:387](../src/handlers/catalogHandler.js#L387) (`annotationKeyFor`) mappa `series` su `tv` per il lookup delle annotazioni doppiaggio.

---

## 🚧 7. Superficie Client / Frontend (*In Movimento*)

> [!NOTE]
> La superficie API esposta al frontend web è attualmente **in movimento** (Ticket 10 e Ticket 11 in corso di implementazione parallela).
> - Il client dismetterà le chiamate infrastrutturali dirette (`/api/tmdb/*`, `/api/sync/*`, `/api/clear-cache`).
> - La comunicazione migra verso risorse pure di dominio: `GET /api/dashboard`, `POST /api/dashboard/save`, `POST /api/mondi`, protette da autenticazione cookie-session (`src/middleware/sessione.js`) con blocco delle vulnerabilità IDOR riscontrate sui vecchi parametri `userId`.
