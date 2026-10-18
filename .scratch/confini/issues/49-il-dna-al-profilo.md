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
