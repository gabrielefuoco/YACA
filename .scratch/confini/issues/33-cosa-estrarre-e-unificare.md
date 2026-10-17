Status: resolved
Type: research

# 33 — Cosa estrarre e cosa unificare dentro `src/`

## La domanda

«Ci sono altri pezzi da estrarre in `src/` — moduli da estrarre o roba da unificare?»
Il ticket 31 ha risposto per i **servizi** (nessun altro, l'unica forza era il drenatore). Questo guarda
**dentro l'app**: coesione e duplicazione. Metodo: raggiungibilità (ticket 31) + censimento per cartella + verifica
dei sospetti uno per uno.

## Il pezzo grosso: un daemon a lotti dentro il processo che serve

`index.js:249` (dentro `app.listen`) chiama `runTmdbDumpDaemon()`. Dentro `src/utils/tmdbDumpDaemon.js:318` c'è
un ciclo **orario** (`while (waited < ONE_HOUR && daemonRunning)`) che pagina i dump TMDB
(`while (page <= totalPages)`), con `setTimeout(…, 5000)` sugli errori. All'avvio parte anche
`reconcileManifests()`. Si spegne con `DISABLE_TMDB_DUMP=1`, ma **in produzione è acceso** (default).

Il cluster TMDB-dump in `src/utils/` sono **1.763 righe**: `tmdbDumpDaemon.js` (405), `tmdbBudget.js` (384),
`tmdbDumpClient.js` (377), `tmdbNameResolver.js` (330), `tmdbDumpStore.js` (172), `tmdbIngestPolicy.js` (95).

**Verdetto: si estrae come lavoro a lotti** — stessa forma del drenatore dei poster (ticket 31) e del grafo:
ciclo di vita diverso da «servire richieste», ciclo orario, consumo di rate limit TMDB che compete col servizio.
E la cucitura **esiste già**: l'artefatto è il volume `yaca_tmdb` (`/data/tmdb`, dove vive `catalog.duckdb`).
Da sistemare: `src/api/admin.js` legge `getDumpStatus` **in processo** → dovrà leggere lo stato dall'artefatto.

## Le unificazioni (roba sparsa che è una cosa sola)

| # | cosa | dove sta oggi | righe | verdetto |
|---|---|---|---|---|
| 1 | **Il protocollo Stremio** | `api/stremio.js` (611) + `utils/stremioAddon.js` (377) + `utils/manifestFingerprint.js` (204) + `utils/manifestReconciler.js` (126) + `clients/stremio.js` (9) | **1.327 in 3 cartelle** | **unificare** in un modulo |
| 2 | **I 7 modelli mongoose** | `src/models/` (RecommendationImpression, SystemLog, TasteProfile, UserConfig) **e** `src/db/models/` (AddonConfig, ImdbToTmdbMapping, UserAccount) | 7 file, **2 cartelle** | **unificare** (una sola casa) |
| 3 | **`api/profiles.js` vs `api/profilo.js`** | entrambi montati (`/api/profiles` **e** `/api/profilo`) | **985 righe per un lavoro solo** | **cancellare il vecchio** (è nel ticket 27 ma non assegnato a nessuno: dopo il ticket 11 il client usa la superficie nuova) |
| 4 | **I pezzi poster in `utils/`** | `libraryPosterRefresh.js` (208) + `posterResolver.js` (132) | 340 | **portare nel modulo poster** (ticket 25) |
| 5 | **`src/data/` dopo il ticket 32** | restano `presets.js` (544), `filters.js` (269), `keywordIds.js` (140), `itaAnnotations.js` (226) + gli asset JSON | ~1.180 + asset | **distribuire**: i preset sono del **catalogo** (ticket 23), i filtri del catalogo/profilo; in `data/` restano solo gli **asset** |
| 6 | **L'impianto condiviso in `utils/`** | `retry.js` (174), `resultMerger.js` (107), `LRUCache.js` (70), `axiosClient.js` (64), `mongoConnect.js` (62), `rateLimiter.js` (61), `logger.js` (44) | ~580 | **dargli un nome** (`src/infra/`): così `utils/` smette di essere un cassetto |

Dopo 1–6, `src/utils/` scende da **25 file / 4.012 righe** a una manciata di cose piccole (`helpers.js` 104,
`requestHash.js` 39, `contentId.js` 20, `kidsModeFilters.js` 161, `dnaRarity.js` 9, `dnaExtractor.js` 7) — e ognuna
di quelle va assegnata a chi la usa o cancellata.

## Verificato e **assolto** (non è duplicazione)

- **`src/cache/`**: `index.js` (274) + `CacheManager.js` (263) + `cacheInstances.js` (65) + `redisClient.js` (55)
  sono **strati**, non tre copie ✓.
- **`api/configure/` (619) vs `api/configurazione.js` (318)**: `configurazione.js` è il **router** (sessione,
  limiter) e `configure/` è la sua implementazione (`validators`, `profileProcessor`) ✓ non duplicano.
- **`src/library/ingestion/`** (8 file): è il **sotto-modulo di scrittura** della libreria (come i fatti
  entrano) ✓ coeso.
- **`src/profile/`** (7 file, 1.873): modulo coeso ✓.

## Ordine

1. **Il daemon TMDB fuori dal processo** (il pezzo grosso, e tocca la produzione: va dopo il ticket 30).
2. **L'unificazione dei modelli** (meccanica, basso rischio, si può fare subito).
3. **Il protocollo Stremio in un modulo** (meccanica ma larga: 1.327 righe e i consumatori delle rotte).
4. **`data/` e `utils/`** dopo che i ticket 32 e 23 hanno spostato il loro.
5. **`profiles.js`** con il ticket 27 (è già lì).

## Nota di metodo

Due sospetti su cinque sono caduti **verificandoli** (`configure/`, `cache/`): il censimento per cartella dice
dove *guardare*, non cosa c'è. E il pezzo più grosso — il daemon — non l'avrebbe trovato nessuna analisi di
duplicazione: l'ha trovato **seguire chi avvia cosa** (`grep` di `tmdbDumpDaemon` da `index.js`).
