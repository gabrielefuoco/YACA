# Ponytail audit + pulizia — YACA

Stato: **pulizia eseguita**. Ogni voce è stata verificata una per una (grep su tutto il repo, barrel,
test, accessi dinamici) prima di essere toccata. Niente è stato rimosso "a occhio".

```
git diff HEAD --numstat → 47 file, +17 −472 righe
                         3 file cancellati (44 righe)
                         −2 dipendenze, −5 require rotti riparati
                         −59 MB di artefatti rigenerabili
test: 1969 passed / 8 failed / 5 suite rosse — identico al baseline (pre-esistenti, vedi in fondo)
lint: 18 errori — identico al baseline (pre-esistenti)
frontend: `npm run build` verde
```

---

## 1. Verificato morto, rimosso

### Funzioni mai chiamate (nessun consumatore, né interno né esterno)

| Dove | Cosa | Righe |
|---|---|---|
| `src/stremio/collection.js` | `syncCatalogData()` + l'import `createTmdbClient` che serviva solo a lei | −47 |
| `src/clients/tmdb.js` | `getCountryEmoji()`, `getPageCacheKey()`, `getPageCacheTtl()` — con le 10 costanti di config che importavano solo loro, e **due blocchi di JSDoc orfani** (23 righe che documentavano una funzione non più esistente) | −67 |
| `src/api/auth/index.js` | `leggiCredenziali()`, `salvaCredenziali()` + il require di `UserCredentials` rimasto senza lettori. Il login è delegato a Stremio: non esiste auth a password | −49 |
| `src/pool/index.js` | `getHeroCatalogInfo()` + la mappa `HERO_CATALOG_IDS` che esisteva solo per lei; `normalizePoolResult()` | −22 |
| `src/stremio/formatters/StremioFormatter.js` | `posterRinfrescato()` + 2 export senza lettore | −20 |
| `src/indice/tier1LazyPromotion.js` | `resetPromotionMemo()`, `getPromotionMemo()` (quest'ultima leggeva `.cache.entries()` — internals di LRUCache — per una diagnostica che nessuno chiedeva) | −19 |
| `src/clients/trakt.js` | `updateTraktStatus()`, `markRequiresReauth()`, `markDegraded()` — tre wrapper su `segnaTrakt*`, con un parametro `_unused` in mezzo | −18 |
| `src/clients/graphClient.js` | `setCachedHealthForTest()` — test hook che nessun test usava | −12 |
| `src/api/configure/profileProcessor.js` | `splitOrIds()` | −11 |
| `src/profile/dnaEngine.js` | `MAX_K`, `MIN_K` (le soglie sono scritte a mano dentro `resolveK`) | −8 |
| `src/profile/impressions.js` | `svuotaMemoImpressioni()` | −8 |
| `src/config.js` | `SERIES_FINISHED_META_TTL_MS`, `SERIES_FINISHED_META_SWR_MS`, e 4 costanti di cache catalogo mai lette (`FAST_CATALOG_DEEP_*`, le `*_SWR_MS`) | −7 |
| `src/models/ProfileUiState.js` | shim di 1 riga verso `../profile/models/ProfileUiState`, zero importatori (le migrazioni vanno dritte al file vero) | −1 |

### Ramo impossibile: il file che non esiste

`src/api/configurazione.js` — `POST /nome` faceva `require('../ai/catalogFusionPrompt')`, modulo **mai esistito
in nessuna revisione** (`git log --diff-filter=D` non lo trova). Con una chiave Mistral configurata il ramo
esplodeva e finiva sempre nel `catch`. Il nome del catalogo fuso è **sempre** stato deterministico.
Ora la rotta fa quello che ha sempre fatto, in 8 righe invece di 22. `−20`

### 54 export senza un solo lettore

Righe di `module.exports` che nessun file del repo nominava (né barrel, né test, né script).
Il codice resta — era quasi sempre usato *dentro* il proprio file; sparisce solo la promessa al mondo.
Toccati 26 file: `anime/airing`, `cache/index`, `catalog/{catalogKind,catalogSorting,itaAnnotations}`,
`clients/graphClient`, `config`, `indice/{candidati,compiler,duckDbProvider,tier1Promotion,tier2}`,
`library/ingestion/libraryConversionOutcome`, `pool/{index,impressioni}`,
`posters/{drenaCodaPoster,erdb/build,volumeContract}`, `profile/{impressions,tmdbNameResolver}`,
`ricerca/{prompts,router,tier2Enrich,tier2Search}`, `stremio/{meta,formatters,providers}`.

Alias doppi rimossi: `derivaChiave: deriva`, `SYSTEM_CATALOGS: HERO_SYSTEM_CATALOGS`,
`risolviContestoLibreria`, `convertLibraryForUser` (identico a `convertAll`), `isItemWatched`
(che puntava a `libraryWatchedService.isItemWatched` — **un export che in quel servizio non è mai esistito**:
la funzione sarebbe stata `undefined` alla prima chiamata).

### File e dipendenze

- `frontend/src/components/ui/separator.tsx` (−23) e `frontend/src/components/shared/TypeBadge.tsx` (−17): mai importati.
- `@radix-ui/react-separator` (frontend): esisteva solo per il componente di sopra.
- `typescript` (root): zero `.ts` fuori da `frontend/`, che ha già il suo.
- `offline_graph_builder/cache/` — 59 MB di `.npz/.npy/.pkl` della pipeline **già spostata** in
  `services/keyword-graph/` + `services/graph/data/`. Cancellata.

### 5 require rotti riparati

`scripts/qa/lib/{atlas,common,fetch}.js` facevano `require('../src/...')`, che da `scripts/qa/lib/`
risolve a `scripts/qa/src/...` — inesistente. I file si caricavano lo stesso (i require erano pigri
dentro le funzioni), quindi l'harness di simulazione **si rompeva solo a runtime**, alla prima simulazione.
Corretti in `../../../src/`.

---

## 2. Verificato e **non** toccato (con il motivo)

- **85 export "solo test"** (`DECLARED_TTLS`, `promoteOnOpen`, `urlPosterComposto`, `cosineSimilarity`,
  `HERO_PRIORITY`, …): hanno un consumatore — i test. Sono cuciture di collaudo, non grasso.
- **`src/catalog/registry.js: getHeroCatalogModes`, `getHeroPrefixes`, `HERO_PREFIXES`**: li nomina un test
  che verifica la derivazione delle righe hero. Toglierli vorrebbe dire togliere un'asserzione.
- **`offline_graph_builder/venv/`** (1,4 GB): non è codice, è un interprete Python 3.13 con pandas/scipy/pyarrow.
  `.scratch/coerenza/lancia.py:13` punta a `offline_graph_builder/venv/Scripts/python.exe` per lanciare
  gli script staccati. Cancellarlo è una decisione tua, non mia: **dimmelo e lo faccio** (si riscarica).
- **Catena "password"**: `src/models/UserCredentials.js` + `scripts/migrate_user_credentials.js` +
  il fallback `passwordHash` in `UserAccount`. Dopo la rimozione di `leggiCredenziali`/`salvaCredenziali`
  **nessuno legge più quella collezione**: sono ~150 righe di catena morta, ma toccano dati (schema +
  script di migrazione). Non le cancello senza il tuo ok.
- **`.agents/scratch/`** (37 MB, 119 script non tracciati): tutti importano `src/engines/`, `src/db/`,
  `src/data/` — la struttura **prima** dei ticket 41/42. Nessuno di quegli script può più girare.
  Sono della sessione di un altro agente: cancellali tu, o dimmi di farlo.
- **`.scratch/qc-cataloghi/`** (tracciata): stessa storia, script di analisi con require all'albero vecchio.
  In `.scratch` vive la memoria del progetto: non la poto d'ufficio.
- **`formatRichDescription()`** in `tmdb.js`: non è morta (la chiama L756), è una **non-funzione**
  (`return data.overview`). È uno `shrink`, non un `delete`: l'ho lasciata fuori dal perimetro di questa passata.
- **`src/ai/`**: 26 righe in 2 file per `new Mistral()` — piccolo, ma è una dep in più non è: i 2 chiamanti
  la usano. Solo cerimonia, non grasso.

---

## 3. Baseline dei test (per non prendermi meriti né colpe)

Prima e dopo la pulizia, **identici**:

```
Test Suites: 5 failed, 194 passed, 199 total
Tests:       8 failed, 1 skipped, 1969 passed, 1978 total
FAIL: animeOverridesCertify · candidateProvider · donghuaCatalog · duckDbAndMatchmaker · presetBurtonOrdering
lint: 18 errori (no-undef kidsMode/UserAccount, no-useless-assignment) — già presenti su HEAD
```

Le 5 suite rosse falliscono su HEAD pulito: chiedono dati/DB che qui non ci sono.
`kidsMode is not defined` in `src/api/catalog.js:65` è un bug vero, ma è **correttezza**: fuori dal
perimetro ponytail, e va in una review sua.

---

## 4. Cosa resta sul tavolo, in ordine di resa

1. **1,4 GB** in `offline_graph_builder/venv/` — chiedi e lo cancello.
2. **Catena password morta** (~150 righe): modello `UserCredentials` + migrazione + fallback.
3. **`.agents/scratch/`** (37 MB, 119 script) e **`.scratch/qc-cataloghi/`**: rottami di sessioni vecchie.
4. **`src/indice/index.js:315-335`**: 21 righe di facciata (instance method + `.bind()` + wrapper lazy
   `require` + re-export dei file interni, metà dei quali con nomi vecchi). Non l'ho toccata: è la superficie
   pubblica del modulo e i test la usano; va rifatta con calma, non potata.
5. **`definition.js` vs `catalogDefinition.js`**: un carattere di distanza, due responsabilità diverse.
   Rinominare il primo in `tipo.js` (o `forma.js`) è un `git mv` + 5 require, ma tocca un confine
   architetturale documentato: decisione tua.
6. **18 env var lette e mai dichiarate** (`DUCKDB_PATH`, `GRAPH_SERVICE_URL`, `FRONTEND_URL`,
   `ITA_ANNOTATIONS_DIR` **e** `ITA_ANNOTATIONS_PATH` per la stessa cosa…) e le 4 costanti di cache
   che puntavano a un Tier di catalogo (`fast`/`slow`) che nessuno passa più.
