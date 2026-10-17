Status: ready-for-agent
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
