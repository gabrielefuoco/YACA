Status: ready-for-agent
Type: task

# 28 — L'ultimo miglio dei moduli: i ponti in uso e i residui

## Perché

I refactor hanno **dichiarato** i confini e non li hanno **imposti**: tre consumatori veri entrano ancora dalla
porta vecchia, il motore dell'indice vive in un'altra cartella, e restano dieci shim che nessuno cancellerà da
solo. È il censimento del ticket 27 (sezione «I residui del trasloco») e la verifica del committente: **i `grep`
dei confini reggono dove sono stati guardati, e questo è ciò che resta fuori**.

## Cosa deve uscire

1. **I cinque `require` da ripuntare** (i consumatori che usano ancora gli shim):
   - `src/api/staticPosters.js:138` → `posters/codaEventi`
   - `src/catalog/formatters/StremioFormatter.js:9,17` → `posters/erdb/build` **e** `posters/posterDaEvento`
   - `src/catalog/tier2Search.js:24` → `indice/tier2`
   - `src/utils/tmdbDumpDaemon.js:66` → `indice/tier2`
2. **Gli shim da cancellare** (dopo che i consumatori sono ripuntati, e col `grep` che dimostra che nessuno li usa):
   `src/cache/{codaEventi,posterDaEvento,drenaPoster}.js`, `src/erdb/{build,index}.js`,
   `src/posters/erdb/index.js`, `src/db/tier2Index.js`, `src/library/context.js` (facade che delega a
   `contestoDi`).
   **Non si cancellano**: `scripts/drena-coda-poster.js` e `scripts/erdb-builder/build.js` — sono i percorsi che
   l'**host** invoca (`ExecStart` del timer, il dump offline), e restano finché il ticket 30 non aggiorna le unità.
3. **Il motore dentro il suo modulo**: `src/db/duckDbStore.js` è il file che **apre il DuckDB** — finché vive in
   `src/db/`, chi legge il codice non sa che quello *è* l'indice. Va dentro `src/indice/` (e i suoi importatori
   ripuntati). Attenzione: è il file che il ticket 19 ha reso **persistente** (`catalog.duckdb` sul volume, boot
   1,6 s, −573 MiB): il comportamento non si tocca, si sposta il file.
4. **Il codice morto**: `resolveTypeSelectors` in `src/engines/hybrid/catalogStrategies.js:48` — **una definizione
   senza chiamanti** (verificato: l'unica occorrenza è la definizione). E `src/db/queryBuilder.js` (126 righe) che
   **duplica l'SQL non parametrizzato** sostituito dal compilatore: esiste solo per non aggiornare **8 file di
   test**. Cancellarlo significa allineare quei test al compilatore — o cancellarli, se collaudano solo la
   traduzione rimossa. La scelta va **detta**, non fatta in silenzio.
5. **La regola, scritta**: una riga in `docs/` (o nel README dei moduli) che dica che i consumatori passano dai
   moduli e non dagli shim — perché è la differenza fra un confine dichiarato e uno imposto, ed è già costata una
   volta (il client che è ricresciuto in orchestratore perché niente lo impediva).

## Come si verifica

I `grep` a zero: nessun `require` di shim fuori da `scripts/`; nessuna occorrenza di `resolveTypeSelectors`;
`src/db/queryBuilder.js` assente. E le suite toccate verdi, una alla volta (`tests/staticPostersCoda.test.js`,
`tests/stremioProtocolFixes.test.js`, `tests/tier2Index.test.js`, `tests/erdbBuilder.test.js`,
`tests/moduloPoster.test.js`, `tests/libraryReorder.test.js`).

## Attenzione

Il ticket 27 ha i **tre bug** da correggere: questo ticket è il **trasloco**, non la correzione. Se toccano gli
stessi file, si coordinano — e il trasloco va fatto **dopo**, perché spostare codice mentre si corregge rende
impossibile attribuire un guasto a una delle due cause.
