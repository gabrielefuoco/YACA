Status: ready-for-agent
Type: task

# 48 — Il dump TMDB fuori dal prodotto: `src/utils` si smonta e il daemon si prende il suo codice

## Perché

`services/tmdb-daemon/cli.js` è un **secondo entry point della stessa immagine** (`ghcr.io/gabrielefuoco/yaca`,
`command: ["node","services/tmdb-daemon/cli.js"]`), quindi condividere codice col prodotto **non è sbagliato in
sé**: il contratto fra i due è **l'artefatto** (il dump su volume), e il ticket 34 l'ha già fatto bene
(`src/api/admin.js` legge `tmdbDumpStore.loadStatus()`, non la memoria di processo).

Il difetto è la **collocazione**, e `src/utils/` non è un modulo: la regola di `docs/INDEX.md:19` dice che i
consumatori passano **solo** dalle porte canoniche e mai da residui storici — e `utils/` non è nemmeno nominato.

Misurato, chi usa cosa in `src/utils/` (2.052 righe):

| file | righe | consumatori | dove deve stare |
|---|---|---|---|
| `tmdbDumpDaemon.js` | **498** | **solo** `services/tmdb-daemon/cli.js` — **nessuno nel prodotto** | `services/tmdb-daemon/` |
| `tmdbDumpClient.js` | 377 | daemon, `src/db/tier1LazyPromotion`, 2 script | `services/tmdb-daemon/` |
| `tmdbDumpStore.js` | 342 | daemon, `src/api/admin.js`, 2 script, 1 test | `services/tmdb-daemon/` (è **il contratto**: l'artefatto) |
| `tmdbIngestPolicy.js` | 95 | solo la pipeline del dump | `services/tmdb-daemon/` |
| `tmdbBudget.js` | 384 | `src/clients/tmdb.js` → **prodotto** | `src/clients/` |
| `tmdbNameResolver.js` | 356 | `src/api/configure/profileProcessor.js` → **prodotto** | `src/profile/` |

E `src/db/` contiene due file che **non sono infrastruttura del database**, contro la regola scritta in
`docs/INDEX.md:19` («`src/db/` resta riservato all'infrastruttura del database — connessione, migrazioni»):
`tier1Promotion.js` (308) e `tier1LazyPromotion.js` (147) sono la **promozione Tier 2 → Tier 1** dell'indice.

## Cosa deve uscire

1. **La pipeline del dump** — `tmdbDumpDaemon.js`, `tmdbDumpClient.js`, `tmdbDumpStore.js`,
   `tmdbIngestPolicy.js` → **`services/tmdb-daemon/`**. I consumatori esterni (gli script `backfill-*`, il test
   `tmdbDumpStatus`, `src/api/admin.js`) ripuntati al nuovo percorso.
2. **`tmdbBudget.js` → `src/clients/`** (è il budget di chiamate TMDB, e `src/clients/tmdb.js` è il suo
   consumatore).
3. **`tmdbNameResolver.js` → `src/profile/`** (sono i nomi per il DNA, e il consumatore è il profilo).
4. **`tier1Promotion.js` + `tier1LazyPromotion.js` → `src/indice/`** (la promozione è dell'indice, che possiede
   DuckDB e Tier 2).
5. **`src/utils/` sparisce**: alla fine la cartella non esiste più. Se resta un file, il ticket **non è chiuso** e
   va detto perché.

## La prova

- `ls src/utils` → **non esiste**.
- `git grep -n "utils/"` in `src/`, `services/`, `scripts/`, `tests/` → **solo** eventuali commenti storici, nessun
  `require`.
- `node -e "require('./services/tmdb-daemon/cli.js')"` **non** è eseguibile (il cli parte), quindi la prova è:
  `node -e "require('./services/tmdb-daemon/tmdbDumpDaemon.js')"` e gli altri moduli spostati, uno per uno, con
  `process.exit(0)`.
- `node scripts/qa/probe-hero-counts.js --fixture` → 9 titoli per medium, disgiunti.
- La suite intera (vedi sotto).

## Vincoli (valgono per ogni ticket di questo gruppo)

- **La baseline della suite è misurata, non ricordata**: `npx jest --forceExit` su `main` fa
  **5 suite fallite / 8 test falliti / 1868 passati**, e le sole ammesse sono `animeOverridesCertify`,
  `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering` (ambientali: mancano i
  parquet TMDB in locale). **Nessun test può essere cancellato o indebolito per far tornare la suite verde.**
  Incolla la lista `FAIL` e i totali nell'Esito: un sottoinsieme di suite **non è una prova**.
- **Il feed non cambia**: `buildManifest({})` sha256 =
  `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` e `buildRootManifest()` =
  `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`.
- **I mock di Jest sono un confine**: ripuntare un import da un modulo mockato a uno non mockato fa tornare il
  modulo mockato **parziale** (`TypeError: … is not a function`). Quando ripunti un percorso, esegui **le suite che
  mockavano il percorso vecchio**.
- **I path relativi si rompono quando un file si sposta**: questo repo l'ha pagato due volte oggi
  (`../constants`, `../contentId`). Dopo ogni spostamento, `node -e "require(...)"` su **ogni** file spostato.
- **Un getter pigro letto come campo** è un `TypeError` già spedito una volta (`searchTier2`): leggi il getter.
- **Niente `frontend/**`**, niente `git push`, niente `npm run build` / `tsc`.

## Confini di file (per il lavoro in parallelo)

Questo ticket **possiede**: `src/utils/**`, `src/db/tier1*.js`, `services/tmdb-daemon/**`, `src/clients/tmdb.js`,
`scripts/backfill-*.js`, e i test che li nominano.
**Non tocca**: `src/dna/**`, `src/profile/**` (tranne l'arrivo di `tmdbNameResolver.js`), `src/meta/**`,
`src/middleware/**`, `src/ricerca/**`, `src/id_mapping/**`, `src/api/configure/**`, `index.js`.
Se ti serve toccare un file fuori da questo elenco, **dichiaralo nell'Esito** (file + riga + perché).

## Quando è chiuso

Aggiungi un `## Esito` in italiano a questo ticket: per ogni file, da dove a dove, il consumatore ripuntato, la
prova eseguita e il suo output, e cosa **non** hai fatto. Lascia `Status: ready-for-agent`: chiude l'integratore.

## Esito

### File spostati e consumatori ripuntati

1. **Pipeline del dump (`services/tmdb-daemon/`)**:
   - `src/utils/tmdbDumpDaemon.js` → `services/tmdb-daemon/tmdbDumpDaemon.js`
     - Requires interni aggiornati verso `../../src/configurazione`, `../../src/indice/tier2`, `../../src/indice/duckDbStore`.
     - Consumatore ripuntato: `services/tmdb-daemon/cli.js:12` (`./tmdbDumpDaemon`).
   - `src/utils/tmdbDumpClient.js` → `services/tmdb-daemon/tmdbDumpClient.js`
     - Require di `tmdbBudget` aggiornato a `../../src/clients/tmdbBudget`.
     - Consumatori ripuntati:
       - `services/tmdb-daemon/tmdbDumpDaemon.js` (`./tmdbDumpClient`)
       - `src/indice/tier1LazyPromotion.js:86` (`../../services/tmdb-daemon/tmdbDumpClient`)
       - `scripts/backfill-airing-anime.js:30` (`../services/tmdb-daemon/tmdbDumpClient`)
       - `scripts/backfill-cjk-titles.js:32` (`../services/tmdb-daemon/tmdbDumpClient`)
       - `tests/ticket14TitlePolicy.test.js:14` (`../services/tmdb-daemon/tmdbDumpClient`)
       - `tests/watchProviderRegion.test.js:3` (`../services/tmdb-daemon/tmdbDumpClient`)
       - `tests/tmdbBudget.test.js:236` (`../services/tmdb-daemon/tmdbDumpClient`)
   - `src/utils/tmdbDumpStore.js` → `services/tmdb-daemon/tmdbDumpStore.js`
     - Consumatori ripuntati:
       - `services/tmdb-daemon/cli.js:13` (`./tmdbDumpStore`)
       - `src/api/admin.js:11` (`../../services/tmdb-daemon/tmdbDumpStore`)
       - `scripts/backfill-airing-anime.js:29` (`../services/tmdb-daemon/tmdbDumpStore`)
       - `scripts/backfill-cjk-titles.js:31` (`../services/tmdb-daemon/tmdbDumpStore`)
       - `tests/tmdbDumpStatus.test.js:6` (`../services/tmdb-daemon/tmdbDumpStore`)
       - `services/tmdb-daemon/tmdbDumpDaemon.js` (`./tmdbDumpStore`)
   - `src/utils/tmdbIngestPolicy.js` → `services/tmdb-daemon/tmdbIngestPolicy.js`
     - Require interno aggiornato verso `../../src/anime`.
     - Consumatori ripuntati:
       - `services/tmdb-daemon/tmdbDumpDaemon.js` (`./tmdbIngestPolicy`)
       - `services/tmdb-daemon/tmdbDumpClient.js` (`./tmdbIngestPolicy`)
       - `tests/tmdbIngestPolicy.test.js:6` (`../services/tmdb-daemon/tmdbIngestPolicy`)

2. **Budget TMDB (`src/clients/`)**:
   - `src/utils/tmdbBudget.js` → `src/clients/tmdbBudget.js`
     - Consumatori ripuntati:
       - `src/clients/tmdb.js:26` (`./tmdbBudget`)
       - `services/tmdb-daemon/tmdbDumpClient.js:5` (`../../src/clients/tmdbBudget`)
       - `tests/tmdbBudget.test.js:7` (`../src/clients/tmdbBudget`)
       - `tests/tier2SearchEnrich.test.js:58` (aggiornato mock Jest a `../src/clients/tmdbBudget`)

3. **DNA Name Resolver (`src/profile/`)**:
   - `src/utils/tmdbNameResolver.js` → `src/profile/tmdbNameResolver.js`
     - Consumatori ripuntati:
       - `src/api/configure/profileProcessor.js:9` (`../../profile/tmdbNameResolver`)
       - `tests/dnaNames.test.js:8` (`../src/profile/tmdbNameResolver`)
       - `.scratch/ocean-prototipo/export-judge-pack.js:14` (`../../src/profile/tmdbNameResolver`)

4. **Promozione Tier 2 → Tier 1 (`src/indice/`)**:
   - `src/db/tier1Promotion.js` → `src/indice/tier1Promotion.js`
     - Consumatori ripuntati:
       - `src/indice/tier1LazyPromotion.js:63` (`./tier1Promotion`)
       - `tests/tier1Promotion.test.js:12` (`../src/indice/tier1Promotion`)
   - `src/db/tier1LazyPromotion.js` → `src/indice/tier1LazyPromotion.js`
     - Require interno di `TmdbDumpClient` aggiornato a `../../services/tmdb-daemon/tmdbDumpClient`.
     - Consumatori ripuntati:
       - `src/meta/index.js:23` (`../indice/tier1LazyPromotion`)
       - `tests/metaHandlerTier1Promotion.test.js:46,53,162` (`../src/indice/tier1LazyPromotion`)
       - `tests/metaHandlerCacheImmutability.test.js:69` (`../src/indice/tier1LazyPromotion`)
       - `tests/metaHandlerDumpImdbId.test.js:112` (`../src/indice/tier1LazyPromotion`)
       - `tests/metaHandlerEpisodeIds.test.js:114` (`../src/indice/tier1LazyPromotion`)
       - `tests/metaHandlerImdbIdNoNetwork.test.js:98` (`../src/indice/tier1LazyPromotion`)
       - `tests/metaHandlerSeriesVideoOrder.test.js:114` (`../src/indice/tier1LazyPromotion`)
       - `tests/schedaPosterCacheIta.test.js:41` (`../src/indice/tier1LazyPromotion`)

5. **`src/utils/` eliminata**: la cartella è stata rimossa completamente e non esiste più sul filesystem né nel repo.

### File toccati fuori dalla lista (dichiarazione obbligatoria)

- `src/api/configure/profileProcessor.js:9`: aggiornato il require di `tmdbNameResolver` da `../../utils/tmdbNameResolver` a `../../profile/tmdbNameResolver` a causa dello spostamento del file in `src/profile/`.
- `src/meta/index.js:23`: aggiornato il require di `tier1LazyPromotion` da `../db/tier1LazyPromotion` a `../indice/tier1LazyPromotion` a causa dello spostamento dei file di promozione in `src/indice/`.
- `tests/metaHandler*.test.js` (6 file) e `tests/schedaPosterCacheIta.test.js`: aggiornati i percorsi nei `jest.mock` da `../src/db/tier1LazyPromotion` a `../src/indice/tier1LazyPromotion` per preservare il corretto funzionamento dei mock e non far fallire le suite che intercettavano la promozione lazy del meta handler.
- `.scratch/ocean-prototipo/export-judge-pack.js:14`: aggiornato import di `tmdbNameResolver` a `../../src/profile/tmdbNameResolver`.

### Prove eseguite e output

1. **`src/utils` non esiste**:
   - Comando: `Test-Path src/utils`
   - Output: `False`
2. **Nessun require vivo verso `utils/`**:
   - Comando: `git grep -n "utils/" -- src/ services/ scripts/ tests/`
   - Output: Solo 5 commenti storici preesistenti (`src/infra/mongoConnect.js`, `src/infra/rateLimiter.js`, `src/infra/snapshotDaArtefatto.js`, `src/library/identity.js`, `tests/characterization/dnaCharacterization.test.js`), zero `require`.
3. **Verifica isolata `node -e "require(...)"` su ogni modulo spostato**:
   - `node -e "require('./services/tmdb-daemon/tmdbDumpDaemon'); console.log('tmdbDumpDaemon: ok'); process.exit(0)"` → `tmdbDumpDaemon: ok`
   - `node -e "require('./services/tmdb-daemon/tmdbDumpClient'); console.log('tmdbDumpClient: ok'); process.exit(0)"` → `tmdbDumpClient: ok`
   - `node -e "require('./services/tmdb-daemon/tmdbDumpStore'); console.log('tmdbDumpStore: ok'); process.exit(0)"` → `tmdbDumpStore: ok`
   - `node -e "require('./services/tmdb-daemon/tmdbIngestPolicy'); console.log('tmdbIngestPolicy: ok'); process.exit(0)"` → `tmdbIngestPolicy: ok`
   - `node -e "require('./src/clients/tmdbBudget'); console.log('tmdbBudget: ok'); process.exit(0)"` → `tmdbBudget: ok`
   - `node -e "require('./src/profile/tmdbNameResolver'); console.log('tmdbNameResolver: ok'); process.exit(0)"` → `tmdbNameResolver: ok`
   - `node -e "require('./src/indice/tier1Promotion'); console.log('tier1Promotion: ok'); process.exit(0)"` → `tier1Promotion: ok`
   - `node -e "require('./src/indice/tier1LazyPromotion'); console.log('tier1LazyPromotion: ok'); process.exit(0)"` → `tier1LazyPromotion: ok`
4. **Sonda hero counts**:
   - Comando: `node scripts/qa/probe-hero-counts.js --fixture`
   - Output:
     - Film : 9 titoli (Disgiunti: true)
     - Serie: 9 titoli (Disgiunti: true)
5. **Invarianza impronte feed / manifest byte-a-byte**:
   - `buildManifest({})` sha256: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (identico al byte)
   - `buildRootManifest()` sha256: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (identico al byte)
6. **Suite completa (`npx jest --forceExit`)**:
   - Totali: `Test Suites: 5 failed, 181 passed, 186 total`
   - Test: `Tests: 8 failed, 1 skipped, 1868 passed, 1877 total`
   - Lista FAIL (le sole 5 ammesse ambientali per assenza parquet locali):
     - `FAIL tests/presetBurtonOrdering.test.js`
     - `FAIL tests/donghuaCatalog.test.js`
     - `FAIL tests/animeOverridesCertify.test.js`
     - `FAIL tests/duckDbAndMatchmaker.test.js`
     - `FAIL tests/candidateProvider.test.js`

### Cosa NON è stato fatto

- Non toccato `src/dna/**`, `src/middleware/**`, `src/ricerca/**`, `src/id_mapping/**`, `index.js`, `src/stremio/**`.
- Non toccato `src/profile/**` salvo l'arrivo previsto di `tmdbNameResolver.js`.
- Non toccato `frontend/**`.
- Nessun `git push`.
- Nessun `npm run build` o `tsc`.
- Nessun test cancellato o indebolito.
- Nessuno shim o file ponte di retrocompatibilità temporaneo lasciato in `src/utils/` o `src/db/`.
- Lasciato `Status: ready-for-agent` per l'integratore.
