Status: needs-triage
Type: research

# 31 — Cosa si estrae e cosa si cancella: la ricognizione col metro in mano

## La domanda

«C'è altro che possiamo estrarre come modulo, da mettere in `services/` come il resto, per snellire `src/`?»
La mappa ha un criterio scritto (decisione 16): **un processo separato solo dove il runtime lo impone**. Questo
ticket mette il criterio accanto ai numeri, invece di ragionarci sopra.

## Come ho misurato

Un analizzatore statico (`fs` + regex, nessun modulo del prodotto caricato) che risolve i `require` relativi e
calcola la **raggiungibilità** da `index.js` e da `scripts/`. Tre insiemi: vivo, solo-test, morto. Poi: peso su
disco dei moduli nativi, dimensione dell'immagine, RSS dei container, e la composizione reale dell'immagine in
produzione (`docker exec yaca-app du`).

## I numeri

| misura | valore |
|---|---|
| `src/` | **157 file, 36.510 righe** |
| vivo (caricato da `index.js`/`scripts/`) | **152 file, 36.007 righe (98%)** |
| solo-test | 5 file, 503 righe |
| **morto per import** | **0 file** |
| immagine `yaca-app` | **654 MB** (`/app` = 226 MB, di cui `duckdb` **134 MB** + `better-sqlite3` **28 MB** = **162 MB, il 25% dell'immagine**) |
| RSS `yaca-app` in esercizio | **538 MiB** (il 284 dell'handoff era il valore a freddo dopo il boot) |
| costo di DuckDB, misurato | **+31 MiB** aprendo `catalog.duckdb` (164 MB su disco) |
| `src/data/` (asset) | 1,2 MB |
| tenuto in vita dal solo `src/engines`+`src/handlers` | 15 file, **6.278 righe (17% di `src/`)** — zero pacchetti npm esclusivi |

**Il primo numero è già una risposta: non c'è codice morto per import.** Il backend non si snellisce cancellando
file irraggiungibili — 152 file su 157 sono raggiunti da `index.js`. Quindi la domanda non è «cosa non è
raggiunto» ma «cosa non serve *a runtime*», che è una domanda diversa e più difficile.

## Le quattro candidate, giudicate col criterio della mappa

### 1. L'indice (DuckDB + SQLite FTS5) — **NO**, e il perché è un numero

`src/indice/` è l'unico posto che apre **due** database embedded: `duckdb` (99 MB su disco, 134 MB
nell'immagine) e `better-sqlite3` (68 MB / 28 MB), usato da `src/indice/tier2.js` oltre che dal vecchio
`src/db/tier1Promotion.js`. Estrarlo come servizio darebbe: **−162 MB di immagine, −31 MiB di RSS** (misurato), e
sposterebbe la CPU fuori dal processo che serve.

Contro: **stessa lingua, stesso runtime** (la forza che ha imposto il servizio del grafo era *Python dentro un
processo Node*), i file del database sono **già su un volume**, e la ricerca sta sul percorso delle richieste
(le hero sono memorizzate, ma la ricerca utente e i cataloghi `search` no) → un salto di rete per **31 MiB** e
un'immagine più piccola che si paga **una volta al pull** non è un affare. La decisione 22 (l'indice è un modulo,
due client, compilatore parametrizzato) **regge**. Resta riapribile con una misura che non ho preso: **quanto
blocca l'event loop una scansione** — se fosse centinaia di ms, la conclusione cambierebbe.

### 2. Il vecchio stack (`src/engines` + `src/handlers` + `src/pool`, 6.278 righe) — **NO all'estrazione, SÌ alla sostituzione**

⚠️ **La mia prima sonda l'aveva chiamato «ritirato». Era falso, e l'ho scoperto verificando**: `src/api/stremio.js`
(la rotta montata su `/`, cioè **il prodotto**) richiede `handlers/catalogHandler`, che richiede
`catalog/CatalogRouter` **e** `db/duckDbStore` **e** `engines/hybrid/animePolicy`. Il vecchio stack **serve il
prodotto adesso**: non è un residuo, è il percorso vivo dove vecchio e nuovo si toccano.

Perciò: estrarre *questo* sarebbe **costruire un confine attorno a ciò che si sta ritirando** — l'anti-overreach
che la mappa ha già pagato una volta (lezione del ticket 02). Il lavoro vero è l'opposto: **finire la sostituzione**
(le nuove porte di `indice`/`ricerca`/`catalogo`/`profilo` prendono il posto di `engines`+`handlers`+`pool`) e
**poi cancellare 6.278 righe**, che è il 17% di `src/`. È il singolo blocco più grosso rimasto, e non è un servizio:
è una sostituzione.

### 3. Il drenatore dei poster — **SÌ, come container** (è l'unica forza di runtime rimasta)

`src/posters/` (1.975 righe) più `scripts/drena-coda-poster.js` girano **sul mate come unità systemd**, con
`node` e il repo sull'host, contro la coda Redis — un ciclo di vita **diverso** da quello che serve le richieste
(è un lavoro a lotti, periodico, senza utente in attesa). È esattamente la forza che ha giustificato il grafo e
`anime-source`. Estrarlo come container `poster-worker` (compose, come gli altri) toglie dal mate il vincolo
«node + repo sul host» e toglie dall'immagine dell'app un pezzo che non serve a servire. **Moderato**, non
urgente — ma è l'unico candidato che passa il criterio.

### 4. `src/data/` — **niente**

1,2 MB di asset (JSON + preset). Spostarli su un volume non compra nulla.

## Due cose trovate per strada (valgono più della risposta)

1. **`src/catalog/index.js` (la porta del modulo) e `validation.js` sono un'isola chiusa**: nessuno dei due è
   raggiungibile dalla produzione — solo dai test. La produzione entra da `src/api/catalog.js` e da
   `stremio.js` → `handlers/catalogHandler` → `catalog/CatalogRouter`. Conseguenza diretta: **il bug 4 del ticket
   27 («la validazione ignora le query dopo la prima») sta in un file che il prodotto non chiama** → la sua
   priorità scende, e il rilievo vero diventa «la porta del modulo catalogo non è la porta che si usa».
2. **L'app tiene il DuckDB aperto in scrittura e un secondo processo non riesce ad aprirlo** (misurato: un probe
   `READ_ONLY` da `docker exec` fallisce con *Connection Error* mentre l'app gira). È la stessa classe dei 7 lock
   del ticket 29, e spiega perché il ticket 19 costruisce il file e **poi** lo scambia.

## Sonda sbagliata, da non ripetere

- Ho chiamato «ritirato» il vecchio stack basandomi sulla *raggiungibilità*, non sull'**uso**: la raggiungibilità
  dice cosa è caricato, non cosa serve. Rifare la domanda «è morto?» richiede di guardare **chi lo chiama a
  runtime**, non chi lo importa.
- Ho provato a misurare l'uso delle rotte dai log: **i log non registrano le richieste** (zero righe per *tutte*
  le rotte, comprese quelle nuove) → la misura non esiste, e «0 richieste» non significa «rotta inutile».
- Il primo probe dentro il container è caduto perché **la produzione ha ancora il codice pre-refactor**
  (`/app/src/ricerca/door.js` non esiste: l'ultimo push è `338d7d4`). Ogni misura nel container misura il vecchio,
  finché non si fa il ticket 30.

## Cosa farei, in ordine

1. **Ticket 30** (il deploy) — anche solo per poter misurare il codice nuovo in produzione.
2. **Il ticket 27**, che contiene già la sostituzione parziale (i confini dichiarati e non imposti).
3. **Il blocco grosso**: finire la sostituzione di `engines`+`handlers`+`pool` e cancellare 6.278 righe. Serve un
   ticket suo, ed è lavoro di prodotto, non di refactor.
4. **Il drenatore come container** — quando si tocca di nuovo il mate per il timer (ticket 30).

**Non farei**: nessun nuovo servizio per l'indice, i client, l'AI o i dati. Il criterio della mappa regge, e i
numeri lo confermano: dove serve, il confine è già un modulo; dove il ciclo di vita è diverso, il servizio c'è già.
