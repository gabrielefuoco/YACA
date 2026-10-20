# Motore delle Raccomandazioni: Servizio, Contratto HTTP e Modulo Pool

Questo documento definisce l'architettura tecnica del motore di raccomandazione a grafo di YACA, il suo contratto di comunicazione HTTP tra il servizio Python e l'applicazione Node.js, l'incapsulamento della composizione dei cataloghi nel modulo Pool, e l'elenco delle trappole architetturali già pagate durante la transizione (Ticket 01, 07, 08, 12, 18, 46).

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
|  [src/stremio/catalogHandler.js] -> [src/stremio/hybridServing.js]            |
|          |                                                                    |
|          v (cache-miss, non a ogni richiesta)                                 |
|  [src/pool/composer.js] -> [src/pool/index.js] (getHeroPool: porta unica)    |
|     |                                                                         |
|     +--> [HERO_STRATEGIES]: graph_rows (unica strategia hero, additiva)       |
|               |                                                               |
|               v                                                               |
|          [src/clients/graphClient.js] (Client HTTP axios, timeout 10s)         |
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
1. **Separazione dei ruoli**: Il motore Python decide *dove guardare e in che ordine* (liste di titoli ordinate per punteggio di attivazione); il prodotto Node decide *cosa e come mostrare* (arricchimento TMDB, poster, badge, lingue, dedup e paginazione tramite [src/stremio/idratazione.js](../src/stremio/idratazione.js)).
2. **Invocazione al cache-build**: Il servizio grafo viene interrogato esclusivamente in occasione della costruzione dei pool memorizzati (`buildSharedHeroCatalogs` in [src/pool/index.js](../src/pool/index.js#L328)), mai sul percorso caldo di una singola richiesta catalogo di Stremio.
3. **Internalizzazione dell'artefatto**: L'artefatto del grafo non è più un file monolitico tracciato in git letto dal backend Node (come era l'antico `src/data/bolle.json`), ma un dettaglio binario interno al modulo Python (`services/graph/data/` montato da `/srv/yaca/services/graph/data` sull'host).

---

## 📡 2. Il Contratto HTTP del Servizio (`services/graph/servizio.py`)

Il servizio risponde su porta `7862` (configurabile tramite variabile d'ambiente `PORT`, default in [services/graph/servizio.py:302](../services/graph/servizio.py#L302)). Non richiede librerie esterne complesse, sfruttando il server `http.server.HTTPServer` standard di Python con single-worker sincrono.

### 2.1 Endpoint `GET /health` (Emendamento E3)
- **Implementazione**: [services/graph/servizio.py:225-240](../services/graph/servizio.py#L225-L240).
- **Latenza di risposta**: **0.25 ms** (misurato a caldo; stringa JSON pre-serializzata in RAM all'avvio in [services/graph/servizio.py:280-288](../services/graph/servizio.py#L280-L288)).
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
  3. Il client Node [src/clients/graphClient.js:37](../src/clients/graphClient.js#L37) interroga `/health` memorizzando la risposta in RAM per **60 secondi** (`HEALTH_CACHE_TTL_MS = 60000`). La versione viene incorporata direttamente nella chiave di cache delle raccomandazioni: quando l'artefatto viene aggiornato sul motore e il servizio riavviato, la cache del prodotto decade automaticamente senza riavviare l'app.

### 2.2 Endpoint `POST /raccomanda` (e alias `POST /`)
- **Implementazione**: [services/graph/servizio.py:247-267](../services/graph/servizio.py#L247-L267) tramite `esegui_richiesta` ([services/graph/servizio.py:26](../services/graph/servizio.py#L26)).
- **Richiesta conforme al contratto**:
  ```json
  {
    "semi": [
      { "tmdbId": 655, "medium": "series", "tipo": "watched", "peso": 0.42 },
      { "tmdbId": 1399, "medium": "series", "tipo": "loved", "peso": 4.0, "recente": true }
    ],
    "medium": "series",
    "opzioni": { "largo": 4, "lontano": 0.0, "cozy": 0.0, "canone": 0.0 },
    "cap": 60
  }
  ```
  - `semi` (array obbligatorio): Storia dei titoli dell'utente. Titoli non presenti nel canone del grafo vengono scartati silenziosamente.
  - `peso` (numerico, opzionale - Emendamento E1): Preserva il decadimento temporale misurato dal prodotto (`max(0.20, 0.5^(giorni/60))`). Se assente, il motore ripiega sui pesi statici per tipo.
  - `recente` (booleano, opzionale - Ticket 07): il seme e' fra le **ultime visioni** del profilo. Il prodotto marca i **15 piu' recenti fra i semi che invia** (`SEED_RECENTI_QUANTI`), usando la data vera di `WatchHistory` (`lastWatchedAt` / `signals[].at` / `createdAt` / `daysAgo`); una data mancante non e' mai "adesso" e non e' mai recente. **Non e' un peso**: il motore lo usa solo come selezione, per la seconda camminata della riga `ultime_visioni`. Assente equivale a `false`.
  - Tipo `"catalogo"` (Emendamento E2): Ammesso per i semi da freddo (< 3 titoli in cronologia). Diffonde la probabilità nel PageRank ma non viene mai restituito nei titoli raccomandati (`semi.da_catalogo: true`).
  - `medium` (stringa `"movie"` | `"series"`, opzionale - Emendamento E4): Se specificato, filtra la risposta per il medium richiesto; se assente, restituisce entrambi i medium con una sola camminata di diffusione.
  - `opzioni` (oggetto opzionale): Slider di modulazione (`largo`, `lontano`, `cozy`, `canone`). Se assente, applica `SLIDER_DEFAULT`.
  - `cap` (intero, default `60`): Numero massimo di titoli per singola lista.

- **Risposta del Motore (Liste Spiegate)**:
  ```json
  {
    "contratto": 1,
    "versioni": { "artefatto": "f8a92...", "ricetta": "e12c4..." },
    "semi": { "n": 2, "da_catalogo": false, "recenti": 1 },
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
  - Ruoli derivati: `uscite_nuove`, `nicchia_di_qualita`, `ultime_visioni`, `micro_cluster_*` e `punti_incontro_*` portano `parziale: true` perché il prodotto può rifinirle col catalogo locale DuckDB più aggiornato.
  - `uscite_nuove` (Ticket 10): porta `fonte` (`collocate` = cache offline, `canone` = ripiego sul canone storico), `candidati` (con `fonte: collocate` = le uscite della cache per quel medium; con `fonte: canone` = quelle recenti già filtrate sul bacino), `nel_bacino`, `gia_visti`, `senza_attivazione`, `scartati_pavimento` e, se vuota, `vuota: true` + `motivo`. I titoli collocati non sono nodi del canone: non hanno un `VOT` nel grafo, e la mediana voti è calcolata su quelli che ce l'hanno (0.0 se nessuno).
  - `punti_incontro_*` (Ticket 09): il ponte fra due filoni, `sqrt(r_a[x] * r_b[x])`, con `VAVE >= 6.8` e i cap anti-monopolio. Porta `coppia_id` (le ancore dei due filoni, `b<a>_b<b>`) e `fallback: true` quando il profilo ha un filone solo e la riga unisce i due mondi più lontani. I titoli a massa zero da una delle due parti non entrano: non si riempie con gli zeri.
  - `micro_cluster_*` (Ticket 08): lo **slot** (`micro_cluster_1..3`) è posizionale e segue il peso del filone; l'identità stabile del filone viaggia in `cluster_id` (`b<bolla>`, bolla più bassa del filone), con `titoli_seme` (i due semi più pesanti) e `quota_peso`. Le righe sono nel payload di `/api/mondi` e `/api/bolle`; non arrivano ai cataloghi Stremio finché non c'è il ticket 13. Con meno di 3 semi o di 10% del peso un filone viene scartato e loggato; oltre 3 filoni restano i primi per peso.
  - `ultime_visioni` (Ticket 07) può essere `corta: true` con `target_dimensione`, `totale_sopravvissuti` e `motivo`; se i semi recenti sono meno di 3 arriva `vuota: true` con `motivo` (la lista non sparisce in silenzio). Non arriva ai cataloghi Stremio: e' nel payload delle rotte `/api/mondi` e `/api/bolle` (vuota, perche' non mandano flag), e arriva al client col ticket 13.

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
5. **Timeout del client**: [src/clients/graphClient.js:16](../src/clients/graphClient.js#L16) fissa un timeout di **10 secondi** (`GRAPH_TIMEOUT_MS = 10000`). Poiché il motore risponde in ~92 ms, il margine è di oltre 100x.

---

## 🏊 5. Il Modulo Pool (`src/pool/`)

Il modulo [src/pool/index.js](../src/pool/index.js) unifica in un'unica barriera architetturale la costruzione di tutti i cataloghi hero del feed:

### 5.1 La Porta Unica: `getHeroPool`
- Firma: [src/pool/index.js:466](../src/pool/index.js#L466):
  ```javascript
  getHeroPool({ userId, context, mediaType, kidsMode, typeSelectors, traktToken, tmdbApiKey, userConfig, slider, sliders }) -> Promise<Object>
  ```
- Il routing del feed in [src/stremio/hybridServing.js](../src/stremio/hybridServing.js) delega a [src/pool/composer.js](../src/pool/composer.js) (`composeCandidateIds`), che a sua volta invoca `getHeroPool`. Nessun componente consumatore importa o invoca strategie singole.

### 5.2 Strategie come Voci di una Lista (`HERO_STRATEGIES`)
In [src/pool/index.js:156](../src/pool/index.js#L156):
- Le 4 strategie storiche (`true_blend`, `seed_network`, `hidden_gems`, `trakt_filtered`) sono state **completamente ritirate** (Ticket 46).
- `HERO_STRATEGIES` contiene oggi un'unica strategia attiva: **`graph_rows`** ([src/pool/index.js:156-324](../src/pool/index.js#L156-L324)), con `additive: true`. Essa estrae i semi dalla libreria (`semiDi` da `src/library/`), interroga il servizio Python via `graphClient.raccomanda` ([src/clients/graphClient.js](../src/clients/graphClient.js)), e assegna direttamente i titoli calcolati ai 4 cataloghi hero: `yaca_mondi_*`, `yaca_passo_fuori_*`, `yaca_uscite_nuove_*` e `yaca_nicchia_di_qualita_*`.

### 5.3 Il Decimo Posto Ridotto a Uno (`getHeroPoolSpec`)
In precedenza, gli hero erano definiti in nove posti derivati da `registry.js`, mentre `HERO_PRIORITY` viveva scollegato nel feed come decimo posto.
Oggi [src/catalog/registry.js:303](../src/catalog/registry.js#L303) esporta `getHeroPoolSpec()`:
- `heroPriority`: `['mondi', 'passo_fuori', 'uscite_nuove', 'nicchia_di_qualita']`
- `slugAdditivi`: `Set(['mondi', 'passo_fuori', 'uscite_nuove', 'nicchia_di_qualita'])`
- `catalogs`: metadati di tutte le righe.
Il modulo pool importa `getHeroPoolSpec()` in [src/pool/index.js:18](../src/pool/index.js#L18). Modificare, aggiungere o ritirare una riga hero richiede ora di toccare un solo file (`registry.js`).

### 5.4 Invariante del Pool: Oggetti Strutturati, Mai Stringhe Scalari (Emendamento E6)
La funzione `ensurePoolItem` ([src/pool/index.js:77](../src/pool/index.js#L77)) garantisce che ogni elemento inserito in un pool sia un oggetto completo:
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
  1. `HERO_CACHE_KEY_VERSION` è stata alzata a **`v15`** ([src/pool/index.js:32](../src/pool/index.js#L32)).
  2. La chiave di cache incorpora l'hash restituito da `GET /health` (`_art_<sha>_ric_<sha>`).
  3. Se `graphClient.raccomanda` fallisce (timeout, 503 o connessione rifiutata), il pool assegna righe vuote ma imposta `graphCallFailed = true`. In tal caso, [src/pool/index.js:433-437](../src/pool/index.js#L433-L437) salva la cache con un **TTL transitorio di soli 60 secondi**, prevenendo l'avvelenamento a lungo termine.

### Trappola 2: Il Cap Prima o Dopo i Filtri (`anime: exclude`)
- **Il problema (Ticket 38)**: Il feed eseguiva `.slice(0, 20)` sui candidati *prima* dell'idratazione e dell'applicazione dei filtri di tipo. Per un profilo con selettore `anime: 'exclude'`, se 18 dei primi 20 titoli del pool erano anime, il filtro post-fetch scartava i 18 anime lasciando solo **2 serie** nella riga di Stremio.
- **La soluzione**: In [src/stremio/idratazione.js:155-168](../src/stremio/idratazione.js#L155-L168), i candidati vengono scorsi ed elaborati filtrandoli con `cardSurvivesFilters` ([src/stremio/idratazione.js:125](../src/stremio/idratazione.js#L125)); l'accumulo procede fino al raggiungimento di `targetCount` **a valle dei filtri**. Con la correzione, la stessa richiesta restituisce il numero pieno di card richieste (es. **20 serie su 20**).

### Trappola 3: Il `node -e` che non esce mai
- **Il problema**: L'importazione di moduli applicativi che dipendono da [src/cache/cacheInstances.js](../src/cache/cacheInstances.js) inizializza client `ioredis` e connessioni a database, mantenendo l'event loop di Node.js permanentemente attivo.
- **La conseguenza**: Comandi CLI di test o diagnosi come `node -e "require('./src/api/stremio.js')"` stampano l'output e **non terminano mai**, bloccando la shell e i job di automazione indefinitamente (accaduto il 17/10/2026: 8 ore di blocco).
- **La regola**: Qualsiasi comando `node -e` o script batch deve invocare esplicitamente `process.exit(0)` al termine dell'operazione, e qualsiasi esecuzione automatica deve essere protetta da un `timeout` a livello di shell.

### Trappola 4: I Dieci Posti degli Hero
- **Il problema**: Le righe hero avevano la propria configurazione frammentata in nove funzioni in `registry.js`, ma la priorità `HERO_PRIORITY` era cablata separatamente nel motore di raccomandazione. Modificare una riga senza allineare `HERO_PRIORITY` portava alla sparizione silenziosa del catalogo.
- **La soluzione**: [src/catalog/registry.js:303](../src/catalog/registry.js#L303) centralizza prioritizzazione e additività in `getHeroPoolSpec()`.

### Trappola 5: `tv` vs `series` e gli Identificativi
- **Il problema**: In TMDB le serie hanno tipo `tv`, nei manifest e cataloghi Stremio si chiamano `series`, e nel parquet DuckDB gli ID sono nella forma breve senza tipo (`tmdb:<id>`, vedi [src/indice/duckDbProvider.js:286](../src/indice/duckDbProvider.js#L286)).
- **La soluzione**: Nel contratto HTTP del grafo il medium è rigorosamente normalizzato come `"series"` o `"movie"`. Ai confini, [src/stremio/badges.js:27](../src/stremio/badges.js#L27) (`annotationKeyFor`) mappa `series` su `tv` per il lookup delle annotazioni doppiaggio.

---

## 🚧 7. Superficie Client / Frontend (*In Movimento*)

> [!NOTE]
> La superficie API esposta al frontend web è attualmente **in movimento** (Ticket 10 e Ticket 11 della mappa confini).
> - Il client dismette le chiamate infrastrutturali dirette (`/api/tmdb/*`, `/api/sync/*`, `/api/clear-cache`).
> - La comunicazione migra verso risorse pure di dominio: `GET /api/dashboard`, `POST /api/dashboard/save`, `POST /api/mondi`, protette da autenticazione cookie-session ([src/api/middleware/sessione.js](../src/api/middleware/sessione.js)) con blocco delle vulnerabilità IDOR riscontrate sui vecchi parametri `userId`.

---

## 🔮 8. In arrivo (cantiere righe-vive, 19/10/2026)

> [!IMPORTANT]
> Le righe e i meccanismi descritti in questa sezione rappresentano la **destinazione progettuale del cantiere `righe-vive`** e **NON ESISTONO ANCORA** nel runtime attivo. La documentazione sopra descrive l'architettura corrente (le 4 righe additive del grafo). Non trattare le nuove righe come live finché i relativi ticket non saranno completati.

Il cantiere `.scratch/righe-vive/` (documentato in dettaglio in [.scratch/righe-vive/map.md](../.scratch/righe-vive/map.md) e [.scratch/righe-vive/spec.md](../.scratch/righe-vive/spec.md)) sta ridisegnando la produzione delle liste e il portafoglio di righe hero del grafo senza ricostruire la matrice sottostante:

1. **Bacino appiattito ("Il tuo mondo")**: Unione delle prime *K* bolle accese (≥80% della massa) e dei loro vicini in un set unico, con pavimento di qualità adattivo (`VAVE >= 6.4`, voti parametrati sul canone del profilo) e ranking combinato attivazione/voto bayesiano.
2. **Gemme nascoste relative al profilo**: Soglie di popolarità e voti non più fisse per tutti, ma relative al baricentro del bacino dell'utente, normalizzate sulla media voto della bolla.
3. **Classici imperdibili del tuo mondo**: High-consensus ad alta attivazione nel bacino dell'utente (70% attivazione, 30% voto bayesiano).
4. **Recenza come selezione ("Sul filo delle ultime visioni")**: Seconda diffusione con PageRank dedicato sui soli semi recenti (`>= 3`, `ULTIME_VISIONI_MIN_SEMI`) e bacino appiattito dalle bolle accese da **quella** camminata (max 4), stesso pavimento e stesso ranking di «il tuo mondo». **Esiste nel motore** dal ticket 07 (contratto: campo `semi[].recente`, risposta: lista `ultime_visioni`, `semi.recenti`); la riga **non arriva ai cataloghi Stremio** finche' non c'e' il ticket 13 — le rotte `/api/mondi` e `/api/bolle` la restituiscono vuota, perche' non mandano flag di recenza. Con meno di 3 semi recenti la riga si dichiara vuota col motivo, invece di sparire.
5. **Micro-cluster dei filoni**: Partizionamento dei semi in cluster indipendenti con diffusioni separate, per non schiacciare i gusti minoritari sotto il filone dominante. **Esiste nel motore** dal ticket 08 (righe `micro_cluster_1..3`, con `cluster_id`, `titoli_seme` e `quota_peso`): una diffusione per filone, bacino appiattito e stesso pavimento. il contratto porta `cluster_id`, `titoli_seme` e `quota_peso`; la riga è nel payload delle rotte `/api/mondi` e `/api/bolle` ma **non arriva ai cataloghi Stremio** finché non c'è il ticket 13. Con meno di 3 semi o del 10% del peso un filone si scarta (e lo dichiara nei log); con un solo filone esce **una** riga, non tre inventate.
6. **Punti d'incontro (Crossover)**: Media geometrica dell'attivazione tra filoni distinti per far emergere titoli ponte. **Esiste nel motore** dal ticket 09 (`punti_incontro_1..3`, `coppia_id`, `fallback`): le camminate sono quelle dei micro-cluster, quindi zero PageRank in più; con un filone solo, i due mondi più lontani che hanno semi, e se non ci sono due sponde la riga si dichiara vuota col motivo. Non arriva ai cataloghi Stremio finché non c'è il ticket 13.
7. **Riparazione Nuove Uscite**: Collocazione offline delle uscite recenti (`collocator.py`) in cache `uscite-collocate.npz` per eliminare il vuoto sistematico e la soppressione silenziosa. **Esiste nel motore** dal ticket 10. La cache si genera con `python -m graph.uscite` (Parquet TMDB + collocatore; `vote_count >= 30`, `vote_average >= 6.2`, anno `>= USCITE_NUOVE_DAL`) **dove ci sono i Parquet e gli artefatti dei centroidi** — cioè sul mate, con `/srv/yaca/.cache/tmdb` presente — e il file prodotto va depositato in `/srv/yaca/services/graph/data/`: quel mount è **read-only** nel container, quindi il servizio non può generarlo da solo, e finché non c'è la riga degrada dichiarandolo (`fonte: canone`). A runtime `score = attivazione del mondo × confidenza × qualità bayesiana`; l'imbuto include i **vicini** dei mondi accesi. La riga è già servita da Stremio (`yaca_uscite_nuove_movies`/`_series`): con la cache si riempie di uscite vere, senza cache arriva vuota ma dichiarata.
   - `fonte` (`collocate`/`canone`), `candidati` (cache: le uscite del medium; canone: quelle recenti nel bacino), `nel_bacino`, `gia_visti`, `senza_attivazione`, `scartati_pavimento` (scarti del builder, dal suo `meta`) e `motivo` (anche a riga piena, se la fonte è il canone).
   - Il `punteggio` di questa riga è `att × confidenza × qualità` (~0,4-1,0), **non** `r[x]` come nelle altre righe: non va confrontato fra righe (non vengono mai mescolate in una lista), e l'`attivazione` della riga la manda il motore, come per i punti d'incontro.
8. **Meccanismi trasversali**: *Waterfall dedup* sequenziale per evitare sovrapposizioni tra righe, filtri a monte nel motore Python (invece che a valle nel taglio card), regole anti-monopolio per saga/regista e rotazione morbida sulle impressioni non cliccate.
