Status: ready-for-agent
Type: task

# 51 — `src/db` torna infrastruttura: i nomi appresi vanno alla ricerca

## Perché

`docs/INDEX.md:19` scrive la regola: *«`src/db/` resta riservato all'infrastruttura del database (connessione,
migrazioni)»*. Oggi `src/db/` ha quattro file, e **uno solo** rispetta la regola:

| file | righe | cos'è | dove deve stare |
|---|---|---|---|
| `connection.js` | 15 | la connessione Mongoose | **resta** |
| `learnedNames.js` | **362** | i **nomi appresi** dalla ricerca (apprendimento dei titoli) | `src/ricerca/` |
| `tier1Promotion.js` | 308 | promozione Tier 2 → Tier 1 | → `src/indice/` (**ticket 48**) |
| `tier1LazyPromotion.js` | 147 | la stessa, pigra | → `src/indice/` (**ticket 48**) |

Questo ticket chiude **`learnedNames`** (i due `tier1*` sono del ticket 48, che possiede già `src/db/tier1*.js`:
non toccarli). I nomi appresi sono **ricerca**: per il §16 la ricerca possiede «da una richiesta a una lista
ordinata», e `learnedNames` è la memoria dei nomi che la ricerca ha imparato — è consumato da
`src/ricerca/tier2Search.js` e da `src/ricerca/tier2Enrich.js`, entrambi già nel modulo ricerca.

## Cosa deve uscire

1. **`src/db/learnedNames.js` → `src/ricerca/learnedNames.js`**, con i consumatori ripuntati:
   `src/ricerca/tier2Search.js:43`, `src/ricerca/tier2Enrich.js:72` (require pigri), `scripts/seed_learned_names.js`,
   `src/db/tier1LazyPromotion.js` **se** lo nomina (verifica prima di toccarlo — quel file è del ticket 48).
2. **La porta della ricerca** (`src/ricerca/index.js` o il registro) espone ciò che serve a `scripts/` e al
   prodotto, così chi sta fuori non nomina un file interno.
3. Alla fine, `src/db/` contiene **solo infrastruttura**: `connection.js` (e i `tier1*` **se e quando** il ticket 48
   non è ancora atterrato — verifica lo stato di `main` prima di dichiarare il ticket chiuso).

## La prova

- `ls src/db` → **solo** `connection.js` (e, se il ticket 48 non è atterrato, `tier1*.js` — dillo nell'Esito).
- `git grep -n "db/learnedNames"` in `src/`, `scripts/`, `tests/` → nessun `require` vivo.
- `node -e "require('./src/ricerca/learnedNames'); require('./src/ricerca'); console.log('ok'); process.exit(0)"`.
- `npx jest tests/learnedNames.test.js tests/searchLearnedNames.test.js tests/tier2LearnedNamesEnrich.test.js tests/tier2SearchEnrich.test.js --forceExit`.
- La suite intera con la baseline misurata (5 suite / 8 test / 1868 passati; incolla lista `FAIL` e totali) e i due
  hash del manifest invariati.

## Confini di file (per il lavoro in parallelo)

Questo ticket **possiede**: `src/db/learnedNames.js`, `src/ricerca/learnedNames.js` (nuovo),
`src/ricerca/tier2Search.js`, `src/ricerca/tier2Enrich.js`, `src/ricerca/index.js`, `scripts/seed_learned_names.js`,
e i test che nominano `learnedNames`.
**Non tocca**: `src/db/tier1*.js` (ticket 48), `src/utils/**`, `services/tmdb-daemon/**`, `src/dna/**`,
`src/profile/**`, `src/meta/**`, `src/middleware/**`, `src/id_mapping/**`, `index.js`.
Se ti serve toccare un file fuori da questo elenco, **dichiaralo nell'Esito**.

## Regole

Valgono i Vincoli del ticket 48 (baseline misurata, mock di Jest, path relativi dopo uno spostamento, getter pigro,
niente `frontend/**`, niente push, un commit per passo). Aggiungi un `## Esito` in italiano e lascia
`Status: ready-for-agent`.

## Esito

### 1. Cosa è stato spostato e dove
- `src/db/learnedNames.js` (362 righe) è stato spostato tramite `git mv` in `src/ricerca/learnedNames.js`.

### 2. Consumatori ripuntati
- **Moduli interni di ricerca**:
  - `src/ricerca/tier2Search.js:43`: require pigro ripuntato a `require('./learnedNames')`; aggiornato il commento descrittivo.
  - `src/ricerca/tier2Enrich.js:72`: require pigro ripuntato a `require('./learnedNames')`; aggiornato il commento descrittivo.
- **Porta pubblica del modulo ricerca**:
  - `src/ricerca/index.js`: esposti i simboli di `learnedNames` (`LearnedNamesStore`, `DB_FILE`, `MAX_ROWS`, `PRUNE_TARGET`, `normalizeText`, `titleTokens`, `toLearnableRow`, `learnNames`, `searchLearnedNames`, `defaultDataDir`, `defaultDbPath`, `closeLearnedNames`, `learnedNamesPath`) mediante getter pigri (`get symbol() { return require('./learnedNames').symbol; }`), evitando carichi anticipati o cicli.
- **Consumatori esterni / scripts**:
  - `scripts/seed_learned_names.js:45`: ripuntato sull'interfaccia pubblica `require('../src/ricerca')` anziché nominare file interni; aggiornato commento riga 71.
- **Suite di test aggiornate**:
  - `tests/learnedNames.test.js`: require ripuntati a `../src/ricerca/learnedNames` (righe 14 e 312).
  - `tests/searchLearnedNames.test.js`: mock ripuntato su `../src/ricerca/learnedNames` (riga 14).
  - `tests/searchTier2Merge.test.js`: mock ripuntato su `../src/ricerca/learnedNames` (riga 26).
  - `tests/seedLearnedNames.test.js`: mock e require ripuntati su `../src/ricerca/learnedNames` (righe 37 e 55).
  - `tests/tier2LearnedNamesEnrich.test.js`: mock ripuntato su `../src/ricerca/learnedNames` (riga 11).
- **Dichiarazione file fuori confini**:
  - `ops/timing/probe-search.js:8`: aggiornato il commento documentale da `src/db/learnedNames.js` a `src/ricerca/learnedNames.js` (nessun require presente nel file).

### 3. Stato finale di `src/db/`
- `Get-ChildItem src/db` mostra unicamente:
  - `connection.js` (15 righe, infrastruttura Mongoose).
  - I file `tier1*.js` erano già stati spostati su `src/indice/` nel ticket 48 su main, quindi `src/db/` è ora al 100% solo infrastruttura.

### 4. Prove e comandi eseguiti
1. **Contenuto di `src/db`**:
   ```powershell
   Get-ChildItem src/db
   ```
   Output:
   ```
   Mode                 LastWriteTime         Length Name
   ----                 -------------         ------ ----
   -a----        18/10/2026     20:49            488 connection.js
   ```
2. **Nessun require vivo di `db/learnedNames`**:
   ```powershell
   git grep -n "db/learnedNames" src/ scripts/ tests/
   ```
   Esito: Exit code 1 (nessun match).
3. **Verifica caricamento moduli**:
   ```powershell
   node -e "require('./src/ricerca/learnedNames'); require('./src/ricerca'); console.log('ok'); process.exit(0)"
   ```
   Output: `ok`
4. **Invarianza impronte feed / manifest byte-a-byte**:
   ```powershell
   node -e "const crypto = require('crypto'); const { buildManifest, buildRootManifest } = require('./src/stremio/manifest'); const m1 = JSON.stringify(buildManifest({})); const h1 = crypto.createHash('sha256').update(m1).digest('hex'); const m2 = JSON.stringify(buildRootManifest()); const h2 = crypto.createHash('sha256').update(m2).digest('hex'); console.log('buildManifest sha256:', h1); console.log('buildRootManifest sha256:', h2); process.exit(0);"
   ```
   Output:
   - `buildManifest sha256`: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (invariato)
   - `buildRootManifest sha256`: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (invariato)
5. **Suite mirate sui nomi appresi**:
   ```powershell
   npx jest tests/learnedNames.test.js tests/searchLearnedNames.test.js tests/tier2LearnedNamesEnrich.test.js tests/tier2SearchEnrich.test.js --forceExit
   ```
   Output: `Test Suites: 4 passed, 4 total`, `Tests: 63 passed, 63 total`.
   ```powershell
   npx jest tests/seedLearnedNames.test.js tests/searchTier2Merge.test.js --forceExit
   ```
   Output: `Test Suites: 2 passed, 2 total`, `Tests: 52 passed, 52 total`.
6. **Suite completa (`npx jest --forceExit`)**:
   - Totali: `Test Suites: 5 failed, 181 passed, 186 total`, `Tests: 8 failed, 1 skipped, 1868 passed, 1877 total`.
   - Lista FAIL (le sole 5 ammesse ambientali per assenza parquet locali):
     ```
     FAIL tests/presetBurtonOrdering.test.js
     FAIL tests/animeOverridesCertify.test.js
     FAIL tests/donghuaCatalog.test.js
     FAIL tests/duckDbAndMatchmaker.test.js
     FAIL tests/candidateProvider.test.js
     ```

### 5. Cosa NON è stato fatto
- Nessun file stub / compatibility shim o re-export legacy lasciato in `src/db/`.
- Nessuna modifica a `frontend/**`.
- Nessuna modifica a `src/indice/tier1*.js`, `src/stremio/**`, `src/profile/**`, `src/clients/**`, `services/**`, `index.js`.
- Nessun git push né build/tsc.
- `Status: ready-for-agent` conservato invariato.
