Status: ready-for-agent
Type: research

# 01 — La sonda della perdita: dove si perde l'oro, stadio per stadio

> **Primo tentativo RESPINTO il 19/10/2026** (review a due assi, concorde). La sonda committata
> (`b42b3ee`) è stata scartata e il suo Esito **ritirato**, per tre motivi indipendenti:
>
> 1. **L'Esito dichiarava numeri che il codice non produce.** Diceva 28 semi per le serie e 25 per i film; la sonda
>    stampa **0**. La causa: `const { semiDi } = require('../../src/library')` crea un **binding locale**, e il
>    `mock` successivo su `library.semiDi` non lo tocca — quindi la sonda chiama il `semiDi` **vero**, che senza
>    Mongo restituisce semi vuoti. Cioè: cadeva esattamente nella trappola che il ticket le intimava di evitare, e
>    poi riportava numeri non misurati.
> 2. **Non era una fixture.** Chiamava `catalogHandler` per ogni riga, aprendo DuckDB su disco, tentando swap di
>    file (`EPERM`, lock contesi) e impiegando `100 s.
> 3. **Re-implementava la pipeline invece di strumentarla**: `diagnoseFilters` clonava `cardSurvivesFilters`, e lo
>    stadio 6 rieseguiva `idrataEImpaginaCandidati` da zero. I numeri non venivano dagli stessi oggetti serviti.
>
> **E ha scoperto un errore nella specifica**: l'ordine degli stadi. Vedi `spec.md` §0.1 — i filtri leggono i
> metadati TMDB, quindi vengono **dopo** l'idratazione, non prima.

## Verifica prima

- `src/library/seeds.js:90` `semiDi()`: restituisce **semi vuoti** se Mongo non è connesso (`readyState !== 1`).
- `src/pool/index.js:156` — `HERO_STRATEGIES` ha **una** voce (`graph_rows`), che chiama
  `graphClient.raccomanda({semi, medium, opzioni, cap: 60})` e assegna quattro liste per `ruolo`.
- `src/stremio/idratazione.js`: `cardSurvivesFilters` (riga `125`) legge i metadati **TMDB**; `idrataEImpaginaCandidati`
  (riga `136`) idrata e pagina.
- `ITEMS_PER_PAGE = 20` in `src/config.js`.

## Cosa deve uscire

**Una sonda committata** — `scripts/qa/probe-perdita-righe.js` — che per **ogni riga hero** e per **i due medium**
stampi una tabella con **sei stadi, in questo ordine** (è l'ordine vero, vedi `spec.md` §0.1):

| stadio | che cosa conta |
|---|---|
| 1. semi | quanti semi **e per tipo** (`loved` / `liked` / `watched` / `library`) |
| 2. grezzo | quanti titoli tornano da `/raccomanda`, per `ruolo` |
| 3. sovrapposizione | quanti titoli compaiono in **più di una** riga (e quanti doppioni totali) |
| 4. idratazione | quanti si idratano, **e quali** non — ognuno col **motivo** (TMDB 404, medium sbagliato, …) |
| 5. filtri | quanti sopravvivono a `kidsMode` e `animePolicy`, **e quanto toglie ciascuno** |
| 6. pagine | quanti escono nelle pagine servite (20 + 20 + …) |

## I vincoli che hanno fatto respingere il primo tentativo (leggili due volte)

1. **Non chiamare `catalogHandler`, né `getHybridCatalog`, né nulla che apra DuckDB o faccia swap di file.** La
   modalità `--fixture` non tocca il disco del database e non fa rete. Se ti serve un numero "come lo servirebbe
   Stremio", **ricalcolalo dalla paginazione** (`ITEMS_PER_PAGE`), non invocando lo stack.
2. **Strumenta, non duplicare.** Se devi contare i sopravvissuti ai filtri, **chiama** `cardSurvivesFilters`
   (esportala se non lo è) invece di riscriverne la logica. Se devi contare gli idratati, **riusa** il percorso di
   `idrataEImpaginaCandidati` o una sua funzione estratta. Un numero che viene da una copia dell'algoritmo non è una
   misura: è una seconda implementazione che può divergere.
3. **Il mock deve mordere.** Non importare per valore ciò che poi vuoi sostituire: chiama attraverso l'oggetto
   (`library.semiDi(...)`) o usa un modulo sostituibile. Verifica con una stampa che i semi del fixture **arrivano**
   allo stadio 1 (>0) **prima** di fidarti di qualsiasi altro numero.
4. **La tabella porta i dettagli richiesti**: i semi per tipo allo stadio 1, e i titoli falliti con il motivo allo
   stadio 4. Non solo aggregati.
5. **Dimensione**: la sonda gemella `probe-ticket-55-mondi.js` è la misura di riferimento come stile. Oltre le `300
   righe, qualcosa è stato re-implementato invece che strumentato: fermati e rileggi il punto 2.

## La prova

- L'output in `--fixture`, con la tabella dei sei stadi **e lo stadio 1 > 0** (se è zero, il fixture non è entrato
  e la misura è un artefatto: dillo invece di stampare la tabella).
- **La prova che la sonda misura davvero**: disattiva **un** filtro dalla sonda (patch dell'istanza, **nessun flag
  nel prodotto**) e il numero dello stadio 5 **cambia**, in modo coerente con lo stadio 6. Se non cambia, la sonda
  non sta misurando niente.
- L'uscita pulita: `exit code 0` in `--fixture`, **senza** timeout e senza attese di secondi.
- Suite alla baseline e i due hash del manifest **invariati** (questo ticket non li tocca).

## Non fare

- Non toccare `services/graph/motore.py`, `parametri.py`, `src/pool/**`, `src/stremio/idratazione.js`,
  `frontend/**`. Questo ticket **misura e basta**.
- Non aggiungere dipendenze.
- **Non scrivere numeri a mano nell'Esito**: si incolla **l'output vero**, e se un numero non torna si dice che non
  torna.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse**: se il codice dice altro, fermati e dichiara la divergenza.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo.
- Commit in steps, ognuno con la sua prova.
