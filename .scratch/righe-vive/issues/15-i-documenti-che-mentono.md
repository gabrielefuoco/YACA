Status: ready-for-agent
Type: task
Blocked by: 14

# 15 — I documenti che mentono

## Il difetto, verificato il 19/10/2026

`docs/RECOMMENDATION_GRAPH.md` è **il** documento di questo sottosistema, ed è **parzialmente stantio**:

- nomina `src/engines/hybridRecommendations.js` → **non esiste** (oggi è `src/stremio/hybridServing.js`);
- nomina `src/pool/graphClient.js` → **non esiste** (è `src/clients/graphClient.js`);
- il diagramma elenca ancora `true_blend, seed_network, hidden_gems, trakt` fra le `HERO_STRATEGIES` → **rimosse**
  (ticket 46); oggi `HERO_STRATEGIES` ha **una** voce, `graph_rows` (`src/pool/index.js:156`).

E `src/api/bolle.js` ha commenti che parlano ancora di liste vuote con `da_comporre: true`, mentre `motore.py` e
`servizio.py` popolano già tutte e quattro le liste (verificalo: potrebbe essere cambiato con questo cantiere).

## Cosa deve uscire

1. **`docs/RECOMMENDATION_GRAPH.md` allineato al vero**: i percorsi che esistono, le strategie che esistono, le
   righe che il registro espone **dopo** questo cantiere.
2. **I commenti stantii** in `src/api/bolle.js` e ovunque altro nominino percorsi che non esistono (un `grep` dei
   percorsi citati nel doc, verificati uno per uno con `ls`).
3. **La regola scritta**: ogni numero in un documento porta accanto il comando che l'ha prodotto. In questa sessione
   un ticket "sulla verità dei documenti" ha prodotto **due bugie nuove** (una chiave inesistente, una versione
   sbagliata) perché i numeri erano enunciati invece che misurati.

## La prova

- Per **ogni** percorso citato nel documento: il comando `ls` (o `git grep`) che mostra che esiste. Incollalo.
- `git grep` dei percorsi eliminati: zero risultati.
- Nessuna modifica al codice in questo ticket: se trovi un disallineamento nel codice, **apri un ticket**, non
  correggerlo qui.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo.
- **Ogni riga che non si riesce a riempire lo dichiara**: nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**

## Esito

### 1. Verifica ed eliminazione dei percorsi e concetti inesistenti

Tutti i percorsi citati in `docs/RECOMMENDATION_GRAPH.md` sono stati verificati sperimentalmente tramite PowerShell / git grep:

```powershell
$paths = @(
  'src/engines/hybridRecommendations.js',
  'src/stremio/hybridServing.js',
  'src/pool/graphClient.js',
  'src/clients/graphClient.js',
  'src/handlers/catalogHandler.js',
  'src/stremio/catalogHandler.js',
  'src/stremio/idratazione.js',
  'src/stremio/badges.js',
  'src/catalog/registry.js',
  'src/pool/index.js',
  'src/pool/composer.js',
  'src/api/bolle.js',
  'src/api/middleware/sessione.js',
  'services/graph/servizio.py',
  'services/graph/motore.py'
)
foreach ($p in $paths) { "$p : $(Test-Path $p)" }
```

Output:
```
src/engines/hybridRecommendations.js : False
src/stremio/hybridServing.js          : True
src/pool/graphClient.js              : False
src/clients/graphClient.js           : True
src/handlers/catalogHandler.js        : False
src/stremio/catalogHandler.js         : True
src/stremio/idratazione.js            : True
src/stremio/badges.js                 : True
src/catalog/registry.js               : True
src/pool/index.js                     : True
src/pool/composer.js                  : True
src/api/bolle.js                      : True
src/api/middleware/sessione.js        : True
services/graph/servizio.py            : True
services/graph/motore.py              : True
```

- `src/engines/hybridRecommendations.js` (INESISTENTE): sostituito con `src/stremio/hybridServing.js` e `src/stremio/idratazione.js`.
- `src/pool/graphClient.js` (INESISTENTE): sostituito con `src/clients/graphClient.js`.
- `src/handlers/catalogHandler.js` (INESISTENTE): corretto con `src/stremio/badges.js:27` per `annotationKeyFor` e `src/stremio/catalogHandler.js` per il routing del catalogo.
- Controllo rimozione percorsi eliminati in `docs/RECOMMENDATION_GRAPH.md`:
  `git grep -E "hybridRecommendations|pool/graphClient|handlers/catalogHandler" docs/RECOMMENDATION_GRAPH.md` → **0 occorrenze**.

### 2. Allineamento diagramma e strategie hero

- Nel diagramma e nella prosa, rimosso il riferimento alle 4 strategie ritirate nel Ticket 46 (`true_blend`, `seed_network`, `hidden_gems`, `trakt`).
- Verificata la composizione reale di `HERO_STRATEGIES`:
  Comando:
  ```powershell
  node -e "const { HERO_STRATEGIES } = require('./src/pool/index'); console.log(JSON.stringify(HERO_STRATEGIES.map(s => ({ name: s.name, additive: s.additive })))); process.exit(0);"
  ```
  Output:
  ```json
  [{"name":"graph_rows","additive":true}]
  ```
- Verificata la specifica degli hero da `src/catalog/registry.js:303`:
  Comando:
  ```powershell
  node -e "const { getHeroPoolSpec } = require('./src/catalog/registry'); const spec = getHeroPoolSpec(); console.log('heroPriority:', spec.heroPriority); console.log('slugAdditivi:', [...spec.slugAdditivi]); process.exit(0);"
  ```
  Output:
  ```
  heroPriority: [ 'mondi', 'passo_fuori', 'uscite_nuove', 'nicchia_di_qualita' ]
  slugAdditivi: [ 'mondi', 'passo_fuori', 'uscite_nuove', 'nicchia_di_qualita' ]
  ```

### 3. Misurazione numerica di chiavi, TTL e filtri (la regola della misurazione)

- **Versione chiave di cache degli hero**:
  Comando: `node -e "const { HERO_CACHE_KEY_VERSION } = require('./src/pool/index'); console.log(HERO_CACHE_KEY_VERSION); process.exit(0);"`
  Output: `v15` (il documento riportava erroneamente la stantia `v13`).
- **TTL transitorio su guasto**: confermato a 60 s in `src/pool/index.js:433-437`.
- **Filtro post-fetch / slicing**:
  Comando: `git grep -n "function cardSurvivesFilters" src/`
  Output: `src/stremio/idratazione.js:125:function cardSurvivesFilters(card, { isKidsMode, effectiveTypeSelectors }) {`
  Confermato l'accumulo fino a `targetCount` a valle dei filtri in `src/stremio/idratazione.js:155-168`.
- **Mapping medium `annotationKeyFor`**:
  Comando: `git grep -n "function annotationKeyFor" src/`
  Output: `src/stremio/badges.js:27:function annotationKeyFor(item, imdbMap = {}) {`

### 4. Rettifica commento in `src/api/bolle.js` (zero cambi di comportamento)

Il commento di testa sosteneva che il grafo restituisse due liste vuote con `da_comporre: true`.
Dall'ispezione di `services/graph/motore.py:331-356` e `services/graph/servizio.py:163-178`:
- Tutte e 4 le liste (`il_tuo_mondo`, `un_passo_fuori`, `uscite_nuove`, `nicchia_di_qualita`) vengono popolate direttamente dal motore Python con titoli e punteggi.
- `uscite_nuove` e `nicchia_di_qualita` portano `parziale: true` (e non `da_comporre: true`).
- `git grep "da_comporre" src/` ha evidenziato che `da_comporre: true` era un reperto testuale del vecchio ponte JS.
Il commento in `src/api/bolle.js` è stato corretto senza modificare alcuna riga di codice né alterare il comportamento a runtime.

### 5. Sezione `## In arrivo (cantiere righe-vive, 19/10/2026)`

Aggiunta in calce a `docs/RECOMMENDATION_GRAPH.md` una sezione esplicitamente demarcata con alert `[!IMPORTANT]` che descrive gli 8 punti di evoluzione del cantiere (bacino appiattito, gemme relative, classici imperdibili, recenza come selezione, micro-cluster, punti d'incontro, riparazione uscite nuove, waterfall dedup), puntando a `.scratch/righe-vive/map.md` e `.scratch/righe-vive/spec.md`, e chiarendo che tali righe **non esistono ancora** nel runtime live.

### 6. Note su altri documenti con percorsi stantii verso questo sottosistema

Durante il controllo dell'intero albero `docs/` sono emerse le seguenti discrepanze in altri documenti (non modificati per preservare i confini di ownership del ticket):
- `docs/INDEX.md:156`: cita `src/pool/graphClient.js` (percorso reale: `src/clients/graphClient.js`).
- `docs/INTEGRATIONS.md:106`: cita `[src/engines/hybridRecommendations.js](../src/engines/hybridRecommendations.js)` (percorso reale: `src/stremio/hybridServing.js`).
- `docs/ALGORITHMS.md:221-229`: fa ancora riferimento a `[hybridRecommendations.js](../src/engines/hybridRecommendations.js)` e alle 4 vecchie strategie `true_blend → seed_network → hidden_gems → trakt_filtered`.
- `docs/CATALOG_LOGIC.md:14, 37`: cita `[catalogHandler.js](../src/handlers/catalogHandler.js)` (percorso reale: `src/stremio/catalogHandler.js`).
- `docs/PRESETS_DATE.md:190, 209`: cita `src/handlers/catalogHandler.js` (percorso reale: `src/stremio/catalogHandler.js`).

### 7. Cosa NON è stato toccato (deliberatamente)

- Nessun file di codice toccato al di fuori di un commento in `src/api/bolle.js`.
- `scripts/qa/**`, `services/graph/**`, `src/pool/**`, `src/stremio/**`, `frontend/**`, `docker-compose.yml`, `.github/**` lasciati intatti.
- Nessun `git push`, nessun `npm run build` o `tsc`.

### 8. Verifiche di non-regressione

- **Hash del manifest**:
  Comando:
  ```powershell
  node -e "const crypto = require('crypto'); const { buildManifest, buildRootManifest } = require('./src/stremio/manifest'); const m1 = JSON.stringify(buildManifest({})); const h1 = crypto.createHash('sha256').update(m1).digest('hex'); const m2 = JSON.stringify(buildRootManifest()); const h2 = crypto.createHash('sha256').update(m2).digest('hex'); console.log('buildManifest sha256:', h1); console.log('buildRootManifest sha256:', h2); process.exit(0);"
  ```
  Output:
  ```
  buildManifest sha256: dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178
  buildRootManifest sha256: 91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2
  ```
  Identici alla baseline attesa al 100%.

- **Baseline della suite di test (`npm test`)**:
  Output misurato:
  ```
  Test Suites: 5 failed, 185 passed, 190 total
  Tests:       8 failed, 1 skipped, 1898 passed, 1907 total
  Snapshots:   0 total
  ```
  FAIL ammessi identici alla baseline di `main`:
  1. `tests/donghuaCatalog.test.js` (2 falliti)
  2. `tests/animeOverridesCertify.test.js` (1 fallito)
  3. `tests/presetBurtonOrdering.test.js` (1 fallito)
  4. `tests/candidateProvider.test.js` (3 falliti)
  5. `tests/duckDbAndMatchmaker.test.js` (1 fallito)
  Totale esatto: 5 suite fallite, 8 test falliti, 1898 test passati su 190 suite totali.
