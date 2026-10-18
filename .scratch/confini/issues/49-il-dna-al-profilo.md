Status: ready-for-agent
Type: task

# 49 — Il DNA va al profilo: `src/dna` non è un modulo

## Perché

`src/dna/dnaEngine.js` (825 righe) è il **motore matematico del DNA**: il suo stesso docstring dice
*«modulo puro, senza I/O (niente Mongo, DuckDB, HTTP). L'I/O resta in `src/profile/ProfileBuilder.js`, la
combinazione bayesiana in `src/profile/ProfileScorer.js`»*.

E la mappa (§16) assegna al **profilo** «le deduzioni». Il DNA *è* la deduzione: il vettore del gusto. Oggi vive
in una cartella sua, che nessuna decisione ha mai nominato, e viene consumato da **quattro** posti:

| consumatore | cosa prende |
|---|---|
| `src/profile/ProfileBuilder.js:22` | `computeFinalDNA`, `calculateWeightedInteractions`, … |
| `src/indice/duckDbStore.js:582` | `setGlobalDfCache` |
| `src/api/configure/profileProcessor.js:4,252` | `extractStaticDNAFromQueries`, `calculateFlatnessMetrics` |
| `tests/characterization/dnaCharacterization.test.js:22` | la caratterizzazione (da **non** toccare: è una caratterizzazione) |

Nota che **`src/indice/duckDbStore.js` lo importa**: l'indice che dipende dal DNA è un secondo difetto di
direzione (l'indice possiede i file e il compilatore, non le deduzioni del gusto). Va risolto **non** spostando
il DNA nell'indice, ma facendo sì che sia il **profilo** a passare il dato — vedi il punto 3.

## Cosa deve uscire

1. **`src/dna/dnaEngine.js` → `src/profile/dnaEngine.js`** e **`src/dna/` sparisce**.
2. **I consumatori ripuntati** alla porta del profilo: `src/profile/index.js` **espone** ciò che serve a chi sta
   fuori (almeno `extractStaticDNAFromQueries`, `computeFinalDNA`, `calculateWeightedInteractions`,
   `calculateFlatnessMetrics`, `setGlobalDfCache`), e `api/configure/profileProcessor.js` passa da lì.
3. **`src/indice/duckDbStore.js` non importa più il DNA**: `setGlobalDfCache` è l'unico uso — fai passare il dato
   dal chiamante (il profilo lo possiede) oppure esponilo sulla porta dell'indice **ricevuto**, non importato.
   Se la soluzione onesta è che l'indice *riceve* la cache dal profilo, scrivilo nell'Esito con la riga.
4. **Nessun shim**: `src/dna/dnaEngine.js` **non** resta come re-export (`docs/INDEX.md:19`).

## La prova

- `ls src/dna` → **non esiste**; `git grep -n "dna/dnaEngine"` in `src/` → nessun `require` vivo.
- `node -e "require('./src/profile'); require('./src/profile/dnaEngine'); console.log('ok'); process.exit(0)"`.
- **La caratterizzazione del DNA deve restare verde**: `npx jest tests/characterization/dnaCharacterization.test.js --forceExit`
  — è il test che dice se il motore si è comportato diversamente. **Non modificarlo**: se diventa rosso, il
  trasloco ha cambiato il comportamento e va indietro.
- `npx jest tests/dnaChartGrouping.test.js tests/dnaKeywordIdentity.test.js tests/ticket15.dnaFixes.test.js tests/ticket24KeywordDna.test.js tests/dnaNames.test.js --forceExit`.
- La suite intera (vedi i Vincoli del ticket 48: baseline 5 suite / 8 test / 1868 passati, e i due hash del
  manifest invariati).

## Confini di file (per il lavoro in parallelo)

Questo ticket **possiede**: `src/dna/**`, `src/profile/**`, `src/indice/duckDbStore.js`,
`src/api/configure/profileProcessor.js`, e i test che nominano il DNA.
**Non tocca**: `src/utils/**`, `src/db/tier1*.js`, `services/tmdb-daemon/**`, `src/meta/**`, `src/middleware/**`,
`src/ricerca/**`, `src/id_mapping/**`, `index.js`, `src/stremio/**`.
Se ti serve toccare un file fuori da questo elenco, **dichiaralo nell'Esito**.

## Regole

Valgono i Vincoli del ticket 48 (baseline misurata, mock di Jest, path relativi dopo uno spostamento, getter pigro,
niente `frontend/**`, niente push, un commit per passo). Aggiungi un `## Esito` in italiano e lascia
`Status: ready-for-agent`.

## Esito

### 1. Spostamento motore DNA e rimozione di `src/dna/`
- `src/dna/dnaEngine.js` è stato spostato in `src/profile/dnaEngine.js` tramite `git mv`.
- La cartella `src/dna/` è stata completamente rimossa (`Test-Path src/dna` → `False`). Nessun compatibility shim o re-export è rimasto.
- Aggiornato il docstring di testata in `src/profile/dnaEngine.js` (`* src/profile/dnaEngine.js`).

### 2. Ripuntamento dei consumatori
- `src/profile/index.js`: espone ora le primitive e le deduzioni del DNA richieste (`dnaEngine`, `extractStaticDNAFromQueries`, `extractActiveDNAFromTmdbData`, `computeFinalDNA`, `computeActiveDNA`, `calculateWeightedInteractions`, `calculateFlatnessMetrics`, `setGlobalDfCache`, `getGlobalDfCache`, `getSoftRarityMultiplier`, `applySoftRarity`, `computeTimeDecay`, `normalizeVector`).
- `src/profile/ProfileBuilder.js`: ripuntato l'import da `../dna/dnaEngine` al modulo interno `./dnaEngine`.
- `src/api/configure/profileProcessor.js`: importa ora `extractStaticDNAFromQueries`, `computeFinalDNA`, `calculateWeightedInteractions`, `calculateFlatnessMetrics` direttamente dalla porta `../../profile` (eliminato il require inline a riga 252).

### 3. Disaccoppiamento `src/indice/duckDbStore.js` dal DNA
- **Decisione e motivazione**: L'indice è un modulo di basso livello (storage DuckDB dei dati di catalogo) e calcola `dfMap` (frequenze documentali di generi e keyword dalle tabelle `movies` e `tv`). Il DNA appartiene al dominio del profilo (deduzioni di gusto). Un require diretto dell'indice verso il DNA (`const { setGlobalDfCache } = require('../dna/dnaEngine')` a riga 582) invertiva la direzione architetturale corretta.
- **Implementazione**:
  1. Rimossa la `require('../dna/dnaEngine')` da `src/indice/duckDbStore.js`.
  2. `DuckDbStore` memorizza internamente la mappa costruita (`this.dfMap = dfMap`) ed espone i metodi `getDfCache()` e `setDfCacheConsumer(consumer)` per ricevere una callback dall'esterno senza conoscere chi la consuma.
  3. `src/indice/index.js` (la porta dell'indice) espone `getDfCache()` e `setDfCacheConsumer(consumer)`.
  4. `src/profile/index.js` registra `dnaEngine.setGlobalDfCache` come consumer tramite `duckDbStore.setDfCacheConsumer(dnaEngine.setGlobalDfCache)`. Inoltre, `ProfileBuilder._fetchDnaItemsFromDuckDb` sincronizza difensivamente la cache se presente in `duckDbStore.getDfCache()`.
  5. In questo modo l'indice non dipende né dal profilo né dal DNA: espone i dati calcolati e accetta un consumer ricevuto per dependency inversion.

### 4. File toccati fuori dal perimetro originario
- `src/indice/index.js` (righe 217-230, 240-241): esposti `getDfCache()` e `setDfCacheConsumer(consumer)` sulla porta pubblica del modulo indice, in conformità con la specifica del punto 3 ("oppure esponilo sulla porta dell'indice ricevuto, non importato").

### 5. Suite di test ripuntate
- `tests/characterization/dnaCharacterization.test.js`: ripuntati gli import da `../../src/dna/dnaEngine` a `../../src/profile/dnaEngine`. Il test di caratterizzazione è rimasto integralmente invariato nelle asserzioni ed è verde (40/40 passed).
- `tests/characterization/dnaEngineExtraction.test.js`: ripuntati gli import e i check `fs.readFileSync` su `../../src/profile/dnaEngine.js`. Verde (7/7 passed).
- Ripuntati gli import nei test del DNA: `tests/configureGlobalProfile.test.js`, `tests/dnaExtractor.test.js`, `tests/dnaKeywordIdentity.test.js`, `tests/dnaRarity.test.js`, `tests/dnaScalesInvariant.test.js`, `tests/flatnessMetrics.test.js`, `tests/ticket24KeywordDna.test.js`.

### 6. Prove e verifiche eseguite
- `Test-Path src/dna` → `False` (cartella inesistente).
- `git grep -n "dna/dnaEngine" src/` → 0 occorrenze vive.
- `node -e "require('./src/profile'); require('./src/profile/dnaEngine'); console.log('ok'); process.exit(0)"` → `ok`.
- `node -e "require('./src/indice'); console.log('ok'); process.exit(0)"` → `ok`.
- `npx jest tests/characterization/dnaCharacterization.test.js --forceExit`:
  `Test Suites: 1 passed, 1 total`
  `Tests: 40 passed, 40 total`
- `npx jest tests/dnaChartGrouping.test.js tests/dnaKeywordIdentity.test.js tests/ticket15.dnaFixes.test.js tests/ticket24KeywordDna.test.js tests/dnaNames.test.js --forceExit`:
  `Test Suites: 5 passed, 5 total`
  `Tests: 62 passed, 62 total`
- `npx jest tests/dnaExtractor.test.js tests/dnaRarity.test.js tests/dnaScalesInvariant.test.js tests/flatnessMetrics.test.js tests/characterization/dnaEngineExtraction.test.js tests/configureGlobalProfile.test.js --forceExit`:
  `Test Suites: 6 passed, 6 total`
  `Tests: 52 passed, 52 total`
- Hash dei manifest:
  - `buildManifest({})` SHA-256 = `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (invariato)
  - `buildRootManifest()` SHA-256 = `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (invariato)
- Baseline dell'intera suite (`npx jest --forceExit`):
  `Test Suites: 5 failed, 181 passed, 186 total`
  `Tests: 8 failed, 1 skipped, 1868 passed, 1877 total`
  Le 5 suite fallite sono esattamente le sole ammesse da baseline:
  - `tests/animeOverridesCertify.test.js`
  - `tests/candidateProvider.test.js`
  - `tests/donghuaCatalog.test.js`
  - `tests/duckDbAndMatchmaker.test.js`
  - `tests/presetBurtonOrdering.test.js`

