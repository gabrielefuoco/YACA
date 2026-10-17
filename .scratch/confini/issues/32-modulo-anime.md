Status: ready-for-agent
Type: research

# 32 — La logica anime: due metà, tre cartelle, un confine attraversato

## La domanda

«La logica anime è complessa: c'è il mapping, c'è il pezzo che decide se un elemento è anime, c'è il pezzo che
prende il catalogo simulcast da AnimeUnity. Questi dovrebbero stare insieme in un modulo separato.»
Verificato: **è vero**, e la ricognizione dice esattamente dove tagliare.

## Com'è oggi, misurato

**Metà A — chi *produce* i dati: già un servizio** (`services/anime-source/`, container, ciclo suo, volume suo).
**3.133 righe** in 8 file: `aggregate.js` (671) · `identity.js` (756) · `animeunity.js` (589, **lo scraper del
simulcast**) · `discovery.js` (465) · `tmdbFallback.js` (295) · `store.js` (128, **scrive su Mongo
`anime_airing_state`**) · `tvdbBridge.js` (122) · `overrides.js` (107) + `data/anime-overrides.json`.
Esiste anche `services/doppiaggi-source/` (la stessa forma, per le annotazioni italiane).

**Metà B — chi *legge e decide*: dentro l'app, in TRE cartelle.** **1.865 righe**:
| file | righe | cosa fa | dove dovrebbe stare |
|---|---|---|---|
| `src/data/animeMappingStore.js` | 688 | scarica da sé i dump Anibridge+Fribb (ogni 12 h), tiene gli id anime, li dà all'SQL | modulo anime |
| `src/data/animeAiringState.js` | 746 | legge lo snapshot Mongo `anime_airing_state` (L1 60 s, non lancia mai) | modulo anime |
| `src/utils/animeIdentity.js` | 280 | marcatori, id, `isAnimeContent`, `normalizeTipoAnime` | modulo anime |
| `src/engines/hybrid/animePolicy.js` | 151 | **la decisione**: ONLY / FAVORED / EXCLUDE, moltiplicatori di punteggio | modulo anime |

**Chi li usa (12 file, in ogni modulo):** `catalog/providers/{AiringStateProvider,DuckDbProvider}.js`,
`catalog/formatters/StremioFormatter.js`, `clients/tmdb.js`, `db/duckDbStore.js` (gli id anime **dentro l'SQL**),
`profile/{ProfileScorer,selettoriEffettivi}.js`, `data/filters.js`, `pool/index.js`,
`handlers/catalogHandler.js`, `engines/hybrid/catalogStrategies.js`.
Totale della materia: **~5.000 righe** (13% del codice) per **una dimensione del catalogo**.

## I tre difetti che questa ricognizione ha trovato

1. ⚠️ **La decisione anime vive dentro il blocco da cancellare.** `animePolicy.js` sta in `src/engines/hybrid/` —
   cioè fra le **6.278 righe del vecchio stack** che la mappa vuole cancellare — mentre è chiamata dai moduli
   **nuovi** (`profile`, `catalog`, `pool`). Chi cancella il vecchio stack senza spostarla prima **cancella la
   decisione anime** e il guasto non è un errore: è un comportamento diverso che nessun test copre.
2. ⚠️ **L'app entra nella cartella del servizio con un `require`**, non con un contratto:
   `src/data/animeMappingStore.js:10-18` fa `require('../../services/anime-source/src/overrides')`, con un
   secondo tentativo e **un ripiego silenzioso** (`() => ({ version: 1, identities: [], certify: [] })`).
   Funziona solo perché il Dockerfile fa `COPY . .` e il `.dockerignore` esclude `services/graph/` ma **non**
   `services/anime-source/`. Aggiungere `services/` al `.dockerignore` — cosa che sembra ovvia — spegne gli
   override anime **senza un errore, senza un log**. È il confine attraversato nella direzione sbagliata.
3. **Il mapping è fatto due volte.** L'app scarica Anibridge + Fribb da sé; il servizio ha `identity.js` (756),
   `tvdbBridge.js`, `tmdbFallback.js`. Due implementazioni di «che cos'è questo anime» che possono divergere, e
   nessuno sa quale delle due ha ragione quando divergono.

## La proposta: un modulo `src/anime/`, una porta sola

**Dentro l'app**, un modulo che possiede la materia: identità (marcatori, id, `isAnimeContent`) + decisione
(policy, punteggi) + i due store (mapping, airing). Una porta sola; i 12 consumatori smettono di entrare in
`data/`, `utils/` e `engines/hybrid/`.
**Fuori**, il servizio resta chi **produce**: scrapa AnimeUnity, risolve le identità, scrive lo snapshot.
**La cucitura è già un contratto vero**: MongoDB `anime_airing_state` (schema version 1) — il servizio scrive, il
modulo legge, e non si toccano per `require`.

**Il vincolo che decide la forma della cucitura**: gli id anime finiscono **dentro l'SQL**
(`db/duckDbStore.js:276-279` costruisce le liste da `animeTmdbIdsMovie/Show`). Quindi il *mapping* deve essere
**locale al processo** — un file o una tabella letta all'avvio, **non** una chiamata HTTP al servizio. Chi
progettasse «l'app chiede il mapping al servizio» romperebbe la query.

## Le decisioni (grilling del 18/10/2026)

| # | decisione | perché |
|---|---|---|
| 1 | **`src/anime/` nell'app**, una porta sola. Il servizio resta chi **produce** e non si tocca. | Gli id anime finiscono **dentro l'SQL** (`duckDbStore.js:276-279`) e la policy gira nel servizio delle richieste: fuori sarebbe un salto di rete su ogni richiesta. |
| 2 | **Il mapping lo produce il servizio**: scarica Anibridge+Fribb (lo fa già, 756 righe) e scrive l'indice su Mongo. L'app legge e **deriva** i suoi insiemi. | Uccide la doppia verità (due download, due parser). Confine: il servizio produce il **dato**, il modulo fa le sue **derivazioni**. |
| 3 | **Gli override**: il file resta in git nella cartella del servizio (curato a mano); il servizio pubblica `certify` su Mongo; l'app non entra più nella cartella del servizio. | Oggi l'app ci arriva con un `require` attraverso il confine e un **ripiego muto**; e basta escludere `services/` dal `.dockerignore` per spegnere gli override senza un errore. |
| 4 | **Il confine è l'anime-ness**: identità, decisione, mapping, airing. Le annotazioni italiane restano una cosa loro (servizio, contratto e chiave propri). | Sono una dimensione diversa del catalogo. |
| 5 | **Il meccanismo si estrae**: `snapshotDaArtefatto({leggi, ttlMs, suErrore})` → TTL, dedup delle chiamate in volo e **politica d'errore scritte una volta**. | Oggi è scritto a mano due volte con **politiche opposte** (ita: snapshot vuoto e ritenta; airing: tiene l'ultimo noto), e ne stava nascendo una terza. La domanda «se Mongo è giù, gli insiemi anime sono vuoti o gli ultimi noti?» va decisa **una volta**. |
| 6 | **Lo store risponde tre stati**: `sì` / `non-lo-so` / `no`. L'euristica vince **solo** su `non-lo-so`. Si aggiunge `exclude` negli override (gemello di `certify`, 0 voci oggi) per correggere i falsi positivi dell'indice. | `false` oggi significa «assente dalla lista», non «non è anime»: la lista è **positiva** (Fribb/AniBridge) e un segnale negativo non esiste (verificato). La prova: LuluttoLilly, anime **assente** dall'indice, dovette essere certificato a mano. E il codice conosce già l'ambiguità (`animeMappingStore.js:570`: *«non è un anime» e «la mappa non è ancora caricata» diventerebbero la stessa cosa — con 8.263 poster dimenticati in silenzio*). |
| 7 | **Il verdetto dell'euristica si vede**: quando decide su un `non-lo-so` e dice sì, una riga aggregata (id + titolo). | Chiude il ciclo: euristica → visibile → `certify` → autorevole. Costo: un log. |

## Conseguenze (derivate, non decise a parte)

- **La policy riceve il contesto risolto**, non i selettori grezzi: la risoluzione sta al bordo (decisione 21 della
  mappa) e il modulo anime **non** ripiega su `selettoriEffettivi` — è anche il rilievo 2 del ticket 27.
- **`airing` tiene la lettura senza model** (`mongoose.connection.db` + `SUPPORTED_SCHEMA_VERSION`): lo schema è
  del **produttore**, e un model nell'app sarebbe una seconda definizione dello stesso documento.
- **La porta** (`src/anime/index.js`) espone i **verbi dei consumatori** (chi è anime, il marcatore, l'alias di
  tipo, la policy, i due snapshot) e non i file interni: i 12 consumatori non entrano in `mapping.js`.
- **Ordine**: il modulo anime **prima** di cancellare il vecchio stack (se no `animePolicy` muore con lui, e in
  silenzio) e **dopo** il ticket 28 (che sposta `duckDbStore.js`, consumatore degli id anime).
- **Verifica**: nessun `require` di `services/` da `src/`; nessun file anime fuori da `src/anime/`; i 12
  consumatori ripuntati; le suite di anime, cataloghi e libreria verdi **una alla volta** (ticket 29 ha reso
  l'ambiente della suite ripetibile: usarlo per la verifica finale).

## Ordine e verifica

**Ordine**: il modulo anime si fa **prima** di cancellare il vecchio stack (difetto 1) e **dopo** il ticket 28
(che sposta `duckDbStore.js`, consumatore degli id anime). **Verifica**: nessun `require` di `services/` da
`src/`; nessun file anime fuori da `src/anime/`; i 12 consumatori ripuntati; e le suite che coprono anime e
cataloghi verdi una alla volta.

## Esito (Lato PRODUTTORE — services/anime-source)

Completato il lato produttore del Ticket 32. Il servizio `services/anime-source` è ora l'unico produttore dell'indice di mapping anime per l'intera applicazione YACA: scarica e memorizza in cache i due dump remoti (AniBridge `mappings.min.json` e Fribb `anime-list-mini.json`), legge gli override curati a mano con il supporto per la nuova chiave `exclude`, e pubblica atomicamente su file JSON l'artefatto pronto per il consumo.

### 1. Elenco dei campi pubblicati (Contratto Produttore-Consumatore)
File generato: `anime-mappings.json` (risolto da `process.env.ANIME_MAPPINGS_PATH || process.env.ANIME_MAPPING_PATH || path.join(cacheDir, 'anime-mappings.json')`).
Dimensione totale su disco: **~10.47 MB** (10.475.377 byte).

| Campo | Tipo JSON | Descrizione e Dettaglio | Dimensione / Conteggio misurato |
|---|---|---|---|
| `schemaVersion` | `number` | Versione schema dell'indice (valore `1`) | 1 intero |
| `generatedAt` | `string` (ISO 8601) | Timestamp UTC di generazione dell'artefatto | 24 byte |
| `sources` | `object` | Provenienza dettagliata per ciascuna sorgente | ~350 byte |
| `sources.anibridge` | `{ url, fetchedAt, rowCount }` | URL AniBridge, data fetch e 77.735 cluster mappings | ~110 byte |
| `sources.fribb` | `{ url, fetchedAt, rowCount }` | URL Fribb, data fetch e 39.638 record mini | ~110 byte |
| `sources.overrides` | `{ path, fetchedAt, rowCount }` | Percorso file locale, data caricamento e 6 entry | ~130 byte |
| `provenance` | `object` | Alias speculare di `sources` | ~350 byte |
| `animeTmdbIdsMovie` | `string[]` | Set TMDB ID film anime (Anibridge movie + Fribb movie + certified - excluded) | 2.755 stringhe (~25 KB) |
| `animeTmdbIdsShow` | `string[]` | Set TMDB ID serie anime (Anibridge show + Fribb tv + certified - excluded) | 4.341 stringhe (~40 KB) |
| `anibridgeTmdbIds` | `string[]` | Set di tutti i TMDB ID presenti in AniBridge | 7.018 stringhe (~65 KB) |
| `anibridgeShowTmdbIds` | `string[]` | Set TMDB ID serie (`tmdb_show:`) da AniBridge | 4.341 stringhe (~40 KB) |
| `anibridgeMovieTmdbIds` | `string[]` | Set TMDB ID film (`tmdb_movie:`) da AniBridge | 2.677 stringhe (~25 KB) |
| `certifiedTmdbIds` | `string[]` | TMDB ID certificati da `certify` (dopo verifica `exclude`) | 1 stringa (`['286361']`) |
| `excludedTmdbIds` | `string[]` | TMDB ID certificati come NON anime da `exclude` | 0 stringhe (`[]`) |
| `certify` | `Array<{ tmdbId, title?, note? }>` | Array oggetti di certificazione manuale (depurato da exclude) | 1 elemento |
| `exclude` | `Array<{ tmdbId, title?, note? }>` | Array oggetti di esclusione manuale (mirror di certify) | 0 elementi |
| `tmdbToKitsu` | `Array<[string, number\|string]>` | Map serializzata a coppie: `tmdbId` serie → `kitsuId` | 4.221 coppie (~90 KB) |
| `tmdbToKitsuMovie` | `Array<[string, number\|string]>` | Map serializzata a coppie: `tmdbId` film → `kitsuId` | 1.326 coppie (~30 KB) |
| `kitsuToTmdb` | `Array<[string, string]>` | Map serializzata a coppie: `kitsuId` → `primaryTmdbId` | 8.277 coppie (~180 KB) |
| `kitsuToTmdbType` | `Array<[string, 'movie'\|'tv']>` | Map serializzata a coppie: `kitsuId` → `'movie'\|'tv'` | 8.277 coppie (~180 KB) |
| `malToTmdb` | `Array<[string, string]>` | Map serializzata a coppie: `malId` → `primaryTmdbId` | 8.248 coppie (~180 KB) |
| `tmdbToAnimeNode` | `Array<[string, Array<{ bridgeNode: { p, id }, rules: Array<{ start, end, offset }> }>]>` | Map serializzata a coppie: `${tmdbId}:${season}` → regole episodiche Anibridge | 9.466 coppie (~6.5 MB) |
| `fribbIndex` | `{ anidb, anilist, mal }` | Oggetto coi 3 Map di consensus Kitsu serializzati a coppie | 51.038 coppie totali (~1.2 MB) |
| `fribbIndex.anidb` | `Array<[string, number\|string]>` | `anidbId` → `kitsuId` | 13.331 coppie (~290 KB) |
| `fribbIndex.anilist` | `Array<[string, number\|string]>` | `anilistId` → `kitsuId` | 17.628 coppie (~410 KB) |
| `fribbIndex.mal` | `Array<[string, number\|string]>` | `malId` → `kitsuId` | 20.079 coppie (~480 KB) |

Tutte le Map sono serializzate come array di coppie `[key, value]`: il reader lato app le reidrata con `new Map(data.<field>)` e `new Set(data.<setField>)` in O(1) allocativo senza calcoli né parsing aggiuntivi.

### 2. Prova di Scrittura Atomica
Implementata in `services/anime-source/src/mappingIndex.js` (`writeMappingIndexAtomic`):
1. Assicura l'esistenza ricorsiva della directory genitrice (`fs.mkdirSync(dir, { recursive: true })`).
2. Scrive su file temporaneo univoco `${targetPath}.tmp.${Date.now()}.${process.pid}`.
3. Rinomina atomicamente tramite `fs.renameSync(tmpPath, targetPath)`.
4. Gestione fallback trasparente di `EEXIST` ed `EPERM` (unlink del target + rename) per compatibilità su file locking Windows.
5. Verificato dal test unitario in `tests/mappingIndex.test.js`: nessun file temporaneo residuo, sovrascrittura idempotente e atomica.

### 3. Esecuzione Reale
Comando:
`node cli.js --export-mapping`
Output console:
```
[AnimeSource] Avvio servizio sorgente anime...
[Identity] Download dump Fribb in corso...
[Identity] Dump Fribb scaricato e memorizzato in cache.
[Identity] Download dump Anibridge in corso...
[Identity] Dump Anibridge scaricato e memorizzato in cache.
[Identity] Indice anime-mappings scritto atomicamente in C:\Users\gabri\APP\.YACA.worktrees\t32-servizio\services\anime-source\.cache\anime-mappings.json (10230.1 KB)
[Identity] Indice inizializzato: 10114 AniList->TMDB, 10188 MAL->TMDB, 8277 Kitsu->TMDB, 9777 AniList->TVDB, 9813 MAL->TVDB, 11 Overrides
[AnimeSource] Esportazione mapping completata con successo.
```
Head del file generato (`services/anime-source/.cache/anime-mappings.json`):
```json
{
 "schemaVersion": 1,
 "generatedAt": "2026-10-17T12:54:12.383Z",
 "sources": {
  "anibridge": {
   "url": "https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json",
   "fetchedAt": "2026-10-17T12:54:02.647Z",
   "rowCount": 77735
  },
  "fribb": {
   "url": "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json",
   "fetchedAt": "2026-10-17T12:54:00.880Z",
   "rowCount": 39638
  },
  "overrides": {
   "path": "C:\\Users\\gabri\\APP\\.YACA.worktrees\\t32-servizio\\services\\anime-source\\data\\anime-overrides.json",
   "fetchedAt": "2026-10-17T12:55:05.579Z",
   "rowCount": 6
  }
 },
 "provenance": { ... },
 "animeTmdbIdsMovie": [
  "128",
  "1390599",
  "149", ...
```

### 4. Test Eseguiti
Suite eseguita con `npm test` in `services/anime-source/`:
- **115 test passati, 30 suite, 0 falliti** (~600ms).
- Nuova suite `tests/mappingIndex.test.js` (8 test):
  - Verifica validità di tutti i campi, tipi e formati dell'artefatto.
  - Verifica regola di priorità override: se un TMDB ID è in `certify` e `exclude`, `exclude` vince (eliminato da `certify` e dagli insiemi movie/show).
  - Verifica degrado fail-safe: override assente, vuoto, JSON corrotto o input null/undefined degradano senza lanciare eccezioni.
  - Verifica scrittura atomica e risoluzione percorsi (`ANIME_MAPPINGS_PATH`).
  - Verifica integrazione con `IdentityResolver.publishMappingIndex()`.
- Suite `tests/overrides.test.js` aggiornata per validare la chiave `exclude` e la risoluzione dei conflitti.

### 5. Cosa non si è potuto fare
Nessun bloccante. L'app-side reader (`src/anime/`) vive nel parallelo worktree ed è intoccato come da vincoli del brief.

