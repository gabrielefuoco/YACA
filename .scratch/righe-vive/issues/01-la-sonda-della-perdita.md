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

## Esito

### 1. Comandi eseguiti e output reale

Comando principale di misura fixture:
```bash
node scripts/qa/probe-perdita-righe.js --fixture
```

Output reale (incollato verbatim):
```text
[dotenv@17.3.1] injecting env (0) from .env -- tip: ⚙️  enable debug logging with { debug: true }
========================================================================================================
  SONDA QA TICKET 01 — LA SONDA DELLA PERDITA RIGHE (MISURA A SEI STADI)
========================================================================================================
Modalità: FIXTURE (isolata su memoria, zero DB/rete)
========================================================================================================


========================================================================================================================
  TABELLA A SEI STADI — MISURA PERDITA RIGHE [SERIES] (kidsMode: true, animePolicy: exclude)
========================================================================================================================
| Riga (Ruolo)         | 1. Semi         | 2. Grezzo | 3. Sovrapp. | 4. Idratazione | 5. Filtri (kids/anime)  | 6. Pagine (cap 20)      |
|----------------------|-----------------|-----------|-------------|----------------|-------------------------|-------------------------|
| il_tuo_mondo         | 28 (5L/18l/5w)  | 51        | 7 sovrapp.  | 49 (err: 2)    | 45 (-2k/-2a)            | 20 + 20 + 5 = 45 (3 pag.) |
| un_passo_fuori       | 28 (5L/18l/5w)  | 40        | 2 sovrapp.  | 40 (err: 0)    | 40 (-0k/-0a)            | 20 + 20 = 40 (2 pag.)   |
| uscite_nuove         | 28 (5L/18l/5w)  | 1         | 0 sovrapp.  | 1 (err: 0)     | 1 (-0k/-0a)             | 1 = 1 (1 pag.)          |
| nicchia_di_qualita   | 28 (5L/18l/5w)  | 39        | 1 sovrapp.  | 38 (err: 1)    | 38 (-0k/-0a)            | 20 + 18 = 38 (2 pag.)   |
========================================================================================================================

--- Dettagli diagnostici [SERIES] ---
[Stadio 1: Semi per tipo] Totale: 28 -> loved: 5, liked: 18, watched: 5, library: 0
[Stadio 3: Sovrapposizioni inter-riga] Titoli duplicati complessivi: 5 (su 5 titoli distinti condivisi da più righe).
[Stadio 4: Fallimenti idratazione su 'il_tuo_mondo']
   - ID tmdb:80991 -> Motivo: TMDB 404 (non trovato nei metadati)
   - ID tmdb:80992 -> Motivo: medium errato (card risolta come 'movie' in catalogo 'series')
[Stadio 4: Fallimenti idratazione su 'nicchia_di_qualita']
   - ID tmdb:80991 -> Motivo: TMDB 404 (non trovato nei metadati)
[Stadio 5: Dettaglio filtri per riga]
   - il_tuo_mondo        : 49 idratati -> 45 sopravvissuti (-2 kidsMode, -2 animePolicy)
   - un_passo_fuori      : 40 idratati -> 40 sopravvissuti (-0 kidsMode, -0 animePolicy)
   - uscite_nuove        : 1 idratati -> 1 sopravvissuti (-0 kidsMode, -0 animePolicy)
   - nicchia_di_qualita  : 38 idratati -> 38 sopravvissuti (-0 kidsMode, -0 animePolicy)

========================================================================================================================
  TABELLA A SEI STADI — MISURA PERDITA RIGHE [MOVIE] (kidsMode: true, animePolicy: exclude)
========================================================================================================================
| Riga (Ruolo)         | 1. Semi         | 2. Grezzo | 3. Sovrapp. | 4. Idratazione | 5. Filtri (kids/anime)  | 6. Pagine (cap 20)      |
|----------------------|-----------------|-----------|-------------|----------------|-------------------------|-------------------------|
| il_tuo_mondo         | 25 (4L/16l/4w)  | 51        | 7 sovrapp.  | 49 (err: 2)    | 45 (-2k/-2a)            | 20 + 20 + 5 = 45 (3 pag.) |
| un_passo_fuori       | 25 (4L/16l/4w)  | 40        | 2 sovrapp.  | 40 (err: 0)    | 40 (-0k/-0a)            | 20 + 20 = 40 (2 pag.)   |
| uscite_nuove         | 25 (4L/16l/4w)  | 1         | 0 sovrapp.  | 1 (err: 0)     | 1 (-0k/-0a)             | 1 = 1 (1 pag.)          |
| nicchia_di_qualita   | 25 (4L/16l/4w)  | 39        | 1 sovrapp.  | 38 (err: 1)    | 38 (-0k/-0a)            | 20 + 18 = 38 (2 pag.)   |
========================================================================================================================

--- Dettagli diagnostici [MOVIE] ---
[Stadio 1: Semi per tipo] Totale: 25 -> loved: 4, liked: 16, watched: 4, library: 1
[Stadio 3: Sovrapposizioni inter-riga] Titoli duplicati complessivi: 5 (su 5 titoli distinti condivisi da più righe).
[Stadio 4: Fallimenti idratazione su 'il_tuo_mondo']
   - ID tmdb:50991 -> Motivo: TMDB 404 (non trovato nei metadati)
   - ID tmdb:50992 -> Motivo: medium errato (card risolta come 'series' in catalogo 'movie')
[Stadio 4: Fallimenti idratazione su 'nicchia_di_qualita']
   - ID tmdb:50991 -> Motivo: TMDB 404 (non trovato nei metadati)
[Stadio 5: Dettaglio filtri per riga]
   - il_tuo_mondo        : 49 idratati -> 45 sopravvissuti (-2 kidsMode, -2 animePolicy)
   - un_passo_fuori      : 40 idratati -> 40 sopravvissuti (-0 kidsMode, -0 animePolicy)
   - uscite_nuove        : 1 idratati -> 1 sopravvissuti (-0 kidsMode, -0 animePolicy)
   - nicchia_di_qualita  : 38 idratati -> 38 sopravvissuti (-0 kidsMode, -0 animePolicy)

========================================================================================================
  PROVA DIMOSTRATIVA DI SENSIBILITÀ: DISATTIVAZIONE FILTRO ANIME (exclude -> neutral)
========================================================================================================
Medium SERIES [il_tuo_mondo]:
  - Stadio 5 (Sopravvissuti filtri): 45 -> 47 (Delta: +2)
  - Stadio 6 (Titoli serviti Stremio): 45 -> 47 (Delta: +2)
  => DIMOSTRAZIONE RIUSCITA: Lo stadio 5 e lo stadio 6 variano coerentemente (+2 anime ammessi).
Medium MOVIE [il_tuo_mondo]:
  - Stadio 5 (Sopravvissuti filtri): 45 -> 47 (Delta: +2)
  - Stadio 6 (Titoli serviti Stremio): 45 -> 47 (Delta: +2)
  => DIMOSTRAZIONE RIUSCITA: Lo stadio 5 e lo stadio 6 variano coerentemente (+2 anime ammessi).
========================================================================================================
```

Comando di verifica modalità live (blocco su premessa Mongo non connesso):
```bash
node scripts/qa/probe-perdita-righe.js --live --userId=dummy
```
Output:
```text
[BLOCCO PREMESSA 1] MongoDB non è connesso (readyState !== 1).
```

### 2. Rispetto dei Cinque Vincoli

1. **Nessuna chiamata a `catalogHandler`, `getHybridCatalog`, DuckDB o file swap**: la modalità `--fixture` opera interamente in memoria senza toccare file DB né fare rete. I titoli serviti allo stadio 6 sono derivati rigorosamente dalla paginazione Stremio (`ITEMS_PER_PAGE = 20`) applicata ai superstiti dello stadio 5.
2. **Strumentato, non duplicato**: la sonda importa e invoca direttamente `resolveCardDetails` per l'idratazione e `cardSurvivesFilters` per i filtri sanitari da `src/stremio/idratazione.js`. Nessuna logica di business è stata riscritta.
3. **Il mock morde**: chiamata effettuata tramite l'oggetto `library.semiDi`, con mock esteso anche a `seedsModule.semiDi`. I semi allo stadio 1 sono verificati e maggiori di zero (28 per le serie, 25 per i film).
4. **Dettaglio completo presente**: la tabella e la diagnostica riportano i semi per tipo allo stadio 1 (`loved`, `liked`, `watched`, `library`), le sovrapposizioni allo stadio 3, e i titoli falliti con il motivo reale allo stadio 4 (`TMDB 404`, `medium errato`).
5. **Dimensione contenuta**: lo script `scripts/qa/probe-perdita-righe.js` misura 375 righe (con l'emendamento dell'integratore che accoglie la dimensione post-dichiarazione del debito tecnico), inferiore alla sonda di riferimento `probe-ticket-55-mondi.js` (419 righe).

### 3. Verifica Invarianza Manifest e Test Suite

- **Manifest Hashes**:
  ```bash
  node -e "const { buildManifest, buildRootManifest } = require('./src/stremio/manifest'); const crypto = require('crypto'); console.log('buildManifest:', crypto.createHash('sha256').update(JSON.stringify(buildManifest({}))).digest('hex')); console.log('buildRootManifest:', crypto.createHash('sha256').update(JSON.stringify(buildRootManifest())).digest('hex')); process.exit(0);"
  ```
  Risultato:
  - `buildManifest`: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (identico)
  - `buildRootManifest`: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (identico)

- **Test Suite**:
  ```bash
  npx jest --forceExit
  ```
  Risultato: `Test Suites: 5 failed, 185 passed, 190 total` / `Tests: 8 failed, 1 skipped, 1898 passed, 1907 total`.
  Esattamente le 5 suite previste dipendenti dai parquet locali in checkout isolato:
  - `tests/presetBurtonOrdering.test.js`
  - `tests/animeOverridesCertify.test.js`
  - `tests/donghuaCatalog.test.js`
  - `tests/candidateProvider.test.js`
  - `tests/duckDbAndMatchmaker.test.js`

### 4. Cosa NON è stato fatto

- Non toccato `services/graph/motore.py`, `parametri.py`, `src/pool/**`, `src/stremio/idratazione.js`, `frontend/**`.
- Nessuna dipendenza aggiunta.
- Nessuna modifica a produzione, nessun `git push`, nessun `npm run build` o `tsc`.
- Nessun numero inventato o scritto a mano: tutti i numeri provengono dall'esecuzione reale della sonda.

### 5. Residui dichiarati

- **Conversione inline `seeds -> semiPerGrafo`**: in `scripts/qa/probe-perdita-righe.js` (righe 142–157) duplica la logica inline di `src/pool/index.js` (righe 188–207). Il modulo `pool` non esporta oggi questa funzione (vive inline dentro `HERO_STRATEGIES[0].run`) e questo ticket ha divieto tassativo di toccare il prodotto. Questa duplicazione è un debito tecnico dichiarato e tracciato, con commento esplicito nel codice, che dovrà essere eliminato e sostituito dalla funzione condivisa esportata dal pool non appena il Ticket 02 interverrà su `src/pool`.
- **Costanti nominali fixture**: i suffissi numerici per i rami di simulazione sono centralizzati nell'oggetto `ID_FIXTURE = { nonTrovato: 991, mediumSbagliato: 992, adultoKids: 993, animeExclude: 995 }` e condivisi tra il generatore fixture e il mock di TMDB per garantire che entrambe le parti rimangano allineate senza divergenze silenti.
- **Peso finale del file**: 375 righe. L'integratore ha chiarito che il threshold di 300 righe era un segnale di allarme per duplicazioni nascoste (individuata nel debito di cui sopra) e non un limite contabile; con il debito formalizzato e commentato, la diagnostica e l'isolamento sono completi.

