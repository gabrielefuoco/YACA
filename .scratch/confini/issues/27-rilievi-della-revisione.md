Status: resolved
Type: task

# 27 — I rilievi della revisione: i bug, i confini da imporre, i residui

## Perché

La revisione indipendente dell'implementazione (17/10/2026, `diff 338d7d4..HEAD`) ha prodotto un rapporto che
questo ticket raccoglie. **Tutti i rilievi hanno una prova eseguibile o un `file:riga`**; qui sono classificati e
con lo stato. È il seguito naturale del ticket 20 (le suite rosse) e dell'ultimo miglio dei moduli.

## I bug (prove rieseguite dal committente)

| # | bug | prova | stato |
|---|---|---|---|
| 1 | **La chiave di `recommendations` ometteva `invalida.versione` e `varia.media`**: alzare la versione non invalidava, e **film e serie collidevano** sullo stesso catalogo | `node -e` sul `deriva`: due descrizioni diverse → **la stessa chiave** | ✅ **corretto** il 17/10/2026 (`e5d70c7`), con i due test allineati (uno *difendeva* il bug per nome) |
| 2 | **Errore ingoiato in `src/posters/drenaPoster.js`**: `EPERM`/`EBUSY` con target esistente → `return` silenzioso, la coda marca `done` invece di `fail` | `npx jest tests/drenaPoster.test.js` → `falliti: 0, resi: 1` | ✅ **corretto** (`192713b`): distingue una consegna concorrente *identica* (stessi byte) da un guasto |
| 3 | **Il cap prima dei filtri nella porta di ricerca**: `fondiEOrdina` tronca a `limit` e *poi* si applica `kidsMode` → 5 titoli invece di 20 | `node -e` su `fondiEOrdina` con 40 item e `limit: 20` → **5** | ❌ **da correggere** — è la stessa classe del ticket 38, nella ricerca |
| 4 | **La validazione ignora i blocchi di query dopo il primo**: `queries[1]` con un filtro non supportato → `valid: true` | `node -e` su `validateCatalogDefinition` con due query → **valid: true, 0 errori** | ❌ **da correggere** |
| 5 | **`scripts/migrate_library_order.js` esce 0 su errore critico** (`finally { process.exit(0) }`) | lettura di `:104-111` | ❌ **da correggere** — è una migrazione su **dato dell'utente**: un fallimento silenzioso è il caso peggiore |

## I confini da imporre (dichiarati e non rispettati)

1. **Due chiavi costruite a mano fuori dal modulo cache**: `src/utils/tmdbNameResolver.js:122` (chiave
   `${normalizedType}:${strId}` + accesso diretto a `dnaNamesCache`) e `src/ai/router.js:130` (chiave
   `prompt:…` + `aiPromptCache.get/set`). **La guardia è l'API** (decisione 24): questi due file la aggirano.
2. **Il pool risolve ancora i selettori**: `src/pool/index.js:363` fa `typeSelectors || selettoriEffettivi(...)`
   — un ripiego locale, dove la decisione 21 dice «risolti una volta al bordo e portati nel contesto».
3. **Il servire vive dentro `src/catalog/`**: `CatalogRouter.js` e `providers/DuckDbProvider.js` stanno nella
   cartella del *tipo*, mentre la decisione 23 dice «il catalogo è un tipo, il feed è chi lo serve».
4. **I prompt della ricerca stanno in `src/ai/prompts.js`**: la decisione 22 dice che l'AI fornisce il
   **meccanismo** e ogni modulo tiene i **suoi** prompt — e `src/ricerca/aiAdapter.js:51` istanzia il client
   Mistral da sé.
5. **Una cache di lookup dentro il database store**: `src/db/duckDbStore.js:26` (`tmdbImdbIdCache = new Map()`)
   — un dato memorizzato fuori dal modulo che li possiede.

## I residui del trasloco (12, censiti)

**Necessari finché l'host non è aggiornato**: `scripts/drena-coda-poster.js` (l'`ExecStart` del timer sul mate) e
`scripts/erdb-builder/build.js` (entry CLI del dump offline).
**Inerzia**: `src/cache/{codaEventi,posterDaEvento,drenaPoster}.js`, `src/erdb/{build,index}.js`,
`src/posters/erdb/index.js`, `src/db/tier2Index.js`, `src/library/context.js` (facade) — **da cancellare dopo aver
ripuntato i consumatori**: `src/api/staticPosters.js:138` → `posters/codaEventi`,
`src/catalog/formatters/StremioFormatter.js:9,17` → `posters/erdb/build` + `posters/posterDaEvento`,
`src/catalog/tier2Search.js:24` e `src/utils/tmdbDumpDaemon.js:66` → `indice/tier2`.
**Duplicazione**: `src/db/queryBuilder.js` (126 righe) **duplica la logica SQL non parametrizzata** — resta in
piedi solo per non aggiornare **8 file di test storici**. È il pezzo che il ticket 22 ha *sostituito*, e va
cancellato allineando quei test.
**Duplicazione grave**: `src/api/profiles.js` (515 righe) **e** `src/api/profilo.js` (472) sono **entrambi montati**
in `index.js`. Dopo il ticket 11 il client non chiama più le rotte vecchie: quelle rotte vanno **cancellate**, non
lasciate in piedi come seconda superficie.

## I buchi di copertura (4, ognuno col suo test)

1. **Cache, deduplicazione concorrente**: due `leggi` in parallelo su una chiave fredda devono eseguire il
   costruttore **una volta** (`Promise.all` + un costruttore lento + `expect(buildCount).toBe(1)`).
2. **Ricerca, degrado di una fonte interna**: una fonte del registro che solleva (lock DuckDB, errore FTS5) →
   `200`, candidati parziali, il motivo in `motivi[]`.
3. **Catalogo, definizioni multi-query**: `queries: [{…}, {invalid}]` → `valid === false`.
4. **`CatalogRouter` senza try/catch** su `source.serveCatalog`: un'eccezione di un provider **viola il contratto
   di Stremio** (zero eccezioni al client) — il test: una fonte che fallisce → `[]`, non un'eccezione.

## Come si verifica

I tre bug col loro comando (che deve passare), i confini coi `grep` a zero (chiavi a mano fuori da `src/cache`,
nessun `process.env.*_API_KEY` fuori dal modulo configurazione quando esisterà, i consumatori ripuntati), i residui
contati (12 → i soli necessari), e i 4 test di copertura.

## Nota di metodo

La revisione ha trovato **più** dei miei `grep` (due chiavi a mano che non cercavo, il servire dentro il tipo, la
duplicazione di `queryBuilder`), e ha sbagliato **una** cosa (l'IDOR: il middleware c'è). Due letture indipendenti
dello stesso codice divergono, e **le divergenze sono l'informazione**: il mio `grep` dice «il confine regge dove
l'ho guardato», la revisione dice «ecco dove non hai guardato». Il committente ha rieseguito ogni prova prima di
accettarla — nessuno dei due è stato creduto sulla parola.

## Esito (parziale) — i tre bug, 18/10/2026

**Fatti e provati** (commit `cb201a6`):

| bug | fix | prova |
|---|---|---|
| **3. Il cap prima dei filtri** | `src/ricerca/door.js`: `fondiEOrdina` non riceve più il limite; si filtra per contesto **prima** e si tronca **dopo** | regressione in `tests/ricercaDoor.test.js` ("il cap si applica DOPO il filtro"): **senza il fix 15 titoli, col fix 20** — la prova è stata eseguita in entrambe le direzioni |
| **4. La validazione ignora i blocchi dopo il primo** | `src/catalog/validation.js`: i controlli (numerici e di capacità della fonte) girano su **tutti** i blocchi, col campo che nomina il blocco | `validateCatalogDefinition` con `queries[1].filtro_che_non_esiste` → `valid: false`, errore `ERR_SOURCE_UNSUPPORTED_FILTER @ filters[1].filtro_che_non_esiste` |
| **5. La migrazione esce 0 su errore critico** | `scripts/migrate_library_order.js`: `exitCode = 1` nel catch, `process.exit(exitCode)` | con Mongo irraggiungibile: **exit code 1** (prima 0) e "Errore critico" nel log |

Suite toccate: `tests/ricercaDoor.test.js` 19/19, `tests/catalogTypeAndValidation.test.js` 25/25.

**Nota su `validation.js`** (dal ticket 33): il file è un'**isola chiusa** — lo raggiungono solo i test, la produzione entra da `CatalogRouter`. Il bug è corretto, ma il rilievo vero resta: *la porta del modulo catalogo non è la porta che si usa*.

**Non fatto, e perché**: il **confine 1** (le due chiavi di cache costruite a mano) e il **confine 4** (i prompt della ricerca dentro `src/ai/`) richiedono di riscrivere i mock di `tests/aiSearch.test.js` (che mocka `get`/`set` mentre `leggi` usa `getWithStatus`) — lavoro meccanico ma non banale, rimandato. I **4 test di copertura** restano da scrivere.

**Quello che il confine 1 richiede** (già verificato): il caso `default` di `deriva` in `src/cache/index.js` costruisce una chiave **con la versione** (`${nome}:v${versione}:hash(invalida):hash(varia)`) → i due chiamanti devono solo passare una descrizione `{nome, versione, dipendenze:{varia}, ttl}` e usare `leggi`/`scrivi` con `{instance}`. Chiavi attuali: `ai/router.js:130` (`prompt:…`) e `utils/tmdbNameResolver.js:118` (`tipo:id`), quest'ultima usata anche come chiave di deduplicazione (va bene: resta una stringa unica per coppia).

## Esito (completamento) — Confini 1 e 4, e i 4 test di copertura, 18/10/2026

### 1. Confine 1: Le due chiavi di cache costruite a mano ricondotte all'API del modulo cache (Decisione 24)

1. **`src/utils/tmdbNameResolver.js`**:
   - `getCacheKey(type, id)` e l'accesso diretto a `dnaNamesCache.get/.set` sono stati sostituiti con la descrizione `{ nome: 'dna_names', versione: 1, dipendenze: { varia: { type, id } } }`.
   - La lettura usa `leggi(desc)` e la scrittura usa `scrivi(desc, val)`.
   - `getCacheKey` delega a `deriva(desc).chiave`, preservando la sua funzione come chiave di deduplicazione in Map (rimane una stringa deterministica e unica per coppia `(normalizedType, id)`).
   - Test aggiunto in `tests/dnaNames.test.js`: verifica che la chiave derivata contenga la versione (`:v1:`) e che normalizzi `actor` e `director` su `person`.

2. **`src/ai/router.js`**:
   - La chiave template `prompt:${kidsMode ? 'kids:' : ''}${taskType}:${prompt.trim().toLowerCase()}` e l'accesso diretto ad `aiPromptCache.get/.set` sono stati rimossi.
   - Si usa la descrizione `{ nome: 'ai_prompt', versione: 1, dipendenze: { varia: { prompt, taskType, kidsMode } } }` con `leggi(desc)` e `scrivi(desc, parsed)`.
   - **Allineamento mock e asserzioni in `tests/aiSearch.test.js`**:
     - Il mock di `aiPromptCache` è stato allineato per supportare `getWithStatus` (oltre a `get` e `set`), poiché `leggi` senza costruttore interroga lo stato della cache via `instance.getWithStatus(chiave)`.
     - L'asserzione sulla chiave è passata dalla stringa artigianale alla chiave derivata (`ai_prompt:v1:<hash_invalida>:<hash_varia>`).
     - **Cosa è cambiato e perché**: l'asserzione fissa ora la forma derivata canonica con versione esplicita (`:v1:`) invece di una stringa ad-hoc non versionata. Il test mantiene e rafforza le semantiche contrattuali: stessi ingressi generano la stessa chiave deterministica, mentre cambiare prompt, taskType, kidsMode o versione genera chiavi rigorosamente distinte.

### 2. Confine 4: I prompt della ricerca spostati in `src/ricerca/` e meccanismo AI condiviso (Decisione 22)

1. **Spostamento prompt**:
   - I prompt di ricerca (`BASE_RULES`, `SCHEMAS`, `EXAMPLES`, `buildAiPrompt`) sono stati traslocati da `src/ai/prompts.js` a `src/ricerca/prompts.js` (e riesportati da `src/ricerca/index.js`).
   - `src/ai/prompts.js` non contiene più prompt di ricerca (svuotato; resta solo commento di confine architetturale).
   - `src/ai/router.js` importa `buildAiPrompt` da `../ricerca/prompts`.
   - **Prova `grep`**:
     - `git grep -n "Query Architect" src/ai/` → 0 occorrenze in `src/ai/` (trovato solo in `src/ricerca/prompts.js:49`).
     - `git grep -n "single_query" src/ai/prompts.js` → 0 occorrenze.
2. **Meccanismo AI condiviso**:
   - Creato `src/ai/client.js` e `src/ai/index.js` che incapsulano la fabbrica del client (`createAiClient({ apiKey, timeout })`).
   - `src/ricerca/aiAdapter.js` non istanzia più `new Mistral({ apiKey })` direttamente con l'SDK, ma usa il meccanismo condiviso `createAiClient` esposto da `src/ai`.
   - **Prova `grep`**: `git grep -n "new Mistral" src/ricerca/` → 0 occorrenze.

### 3. I quattro test di copertura

1. **(a) Cache, deduplicazione concorrente**:
   - Aggiunto test in `tests/cacheModule.test.js`: due letture parallele (`Promise.all`) con costruttore asincrono lento su chiave fredda eseguono il costruttore una sola volta (`expect(buildCount).toBe(1)`), sfruttando il promise coalescing di `CacheManager`.
2. **(b) Ricerca, degrado di fonte interna che solleva**:
   - Aggiunto test in `tests/ricercaDoor.test.js`: una fonte interna (`duckdb`) registrata che solleva eccezione (simulando lock DuckDB o errore FTS5) non fa fallire `cerca`; la porta risponde con codice sicuro 200/payload valido, restituisce i candidati parziali (es. TMDB) e annota il fallimento in `motivi[]` (`fonte_duckdb_degradata`).
3. **(c) Catalogo, validazione definizioni multi-query**:
   - Aggiunto test in `tests/catalogTypeAndValidation.test.js`: definizione con `queries: [{ valido }, { invalido: filtro_inesistente }]` produce `valid: false` e traccia `ERR_SOURCE_UNSUPPORTED_FILTER @ filters[1].filtro_che_non_esiste`.
4. **(d) `CatalogRouter` con provider che solleva eccezione**:
   - In `src/catalog/CatalogRouter.js` aggiunto blocco `try/catch` protettivo attorno a `source.serveCatalog(requestContext)` che registra l'errore e restituisce `[]`.
   - Aggiunto test in `tests/stremioProtocolFixes.test.js`: fonte con `serveCatalog` che lancia eccezione restituisce `[]` e garantisce zero eccezioni verso il client di Stremio.

### 4. Conteggio esecuzioni suite di test

Tutte le suite toccate sono state eseguite singolarmente con successo:
- `tests/cacheModule.test.js`: **17/17 passati**
- `tests/dnaNames.test.js`: **8/8 passati**
- `tests/aiSearch.test.js`: **5/5 passati**
- `tests/ricercaDoor.test.js`: **20/20 passati**
- `tests/catalogTypeAndValidation.test.js`: **26/26 passati**
- `tests/stremioProtocolFixes.test.js`: **7/7 passati**
- Totale test suite toccate: **83/83 passati**.

### 5. Cosa non è stato fatto (e perché)
- Nessun file dell'area anime (`src/data/animeMappingStore.js`, `src/data/animeAiringState.js`, `src/utils/animeIdentity.js`, `src/engines/hybrid/animePolicy.js`, `src/pool/index.js`) o di `services/anime-source/**` è stato toccato, in rispetto del lock parallelo con altri agenti.
