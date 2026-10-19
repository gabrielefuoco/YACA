Status: ready-for-agent
Type: task

# 59 — Dopo lo scambio il DuckDB, l'app deve accorgersene e riaprire

## Il problema (conseguenza del ticket 54, non una sua regressione)

Il ticket 54 ha dato al daemon la build su staging + **scambio atomico** (`fs.renameSync`), e ha tolto il
conflitto di lock. Ma ne resta uno **speculare**, che va chiuso qui:

l'app tiene il database aperto **per tutta la vita del processo**. Dopo uno scambio, `rename()` cambia il
**percorso**, ma l'app continua a leggere **il vecchio inode**: serve il catalogo di **prima** finché non riavvia.
Prima del 54 il lock la costringeva a ricostruire da parquet — **lento (9,3 s) ma fresco**. Ora è **veloce ma
vecchio**.

**La frequenza**: il daemon ricostruisce quando il parquet è stantio — cioè dopo ogni dump, **una volta al
giorno**. E l'app riavvia solo sui deploy: quindi può servire un catalogo **vecchio di giorni** senza che nulla lo
segnali. È esattamente il tipo di degrado silenzioso che questa mappa combatte.

## La decisione (già presa: non è una domanda)

**L'app se ne accorge e riapre.** Il meccanismo è quello che l'indice ha già: un confronto d'identità del file.

1. **Al momento dell'apertura** lo store memorizza l'identità del file che ha aperto: `{ mtimeMs, size }` di
   `dbPath` (`fs.statSync`).
2. **Prima di servire una query** (i punti d'ingresso: `query`, `queryRaw`, `getById`, `getMetaDetails`,
   `getCatalogFrom*`, `candidati` — cioè dove si legge davvero), lo store confronta l'identità corrente con quella
   memorizzata. Se è **cambiata**, chiude e **riapre** (usando il retry del ticket 54, che già gestisce un lock
   transitorio) e **lo logga**: `[DuckDB Store] Database scambiato: riaperto`.
3. **Il confronto è limitato nel tempo** (throttle, es. non più di una `statSync` ogni 10 s): una `statSync` per
   query sarebbe comunque economica, ma il throttle tiene il percorso caldo leggibile e non introduce sorprese.
4. **La riapertura avviene fra due query**, mai dentro una: il vecchio handle si chiude solo quando non c'è una
   query in volo su di esso.

### Cosa NON va fatto, e perché

- **Non** si tocca il file dal lato app (niente `unlink`, niente `rename`): lo scambio è del daemon.
- **Non** si mette un `setInterval` che ricarica il DB a orologio: un timer che ricarica senza che nessuno abbia
  chiesto niente è un costo fisso e un rischio di ricariche inutili. Si ricarica **quando serve**, cioè alla prima
  lettura dopo il cambio.
- **Non** si riavvia l'app dal daemon: il daemon non comanda il ciclo di vita di un altro servizio.

### Le scritture dell'app: verificate, non si perdono

Il timore era: *le scritture dell'app vanno sul vecchio inode e si perdono*. **Verificato: non è così.**
- la **promozione Tier 2 → Tier 1** scrive nel **JSONL** (`master_movies.jsonl` / `master_tv.jsonl`, solo append:
  `src/indice/tier1Promotion.js`), **non** nel DuckDB, e il DuckDB è **derivato** da lì;
- `anime_mappings` è **derivato** dall'artefatto anime, ricostruito al boot;
- quindi ciò che l'app scrive nel DuckDB è **tutto ricostruibile**, e uno scambio non distrugge nulla di durevole.

## La prova (da incollare nell'Esito)

1. **Una sonda committata** (`scripts/qa/`), che estende quella del ticket 54: apre il DB dal lato app, scrive una
   riga riconoscibile, **scambia** il file con uno che contiene una riga diversa, poi esegue una query **dal lato
   app** e verifica che veda **la riga nuova** — senza riavviare il processo. Se non riapre, la sonda deve
   **fallire**.
2. **La prova che la sonda è vera**: disattivando la riapertura, la sonda deve cadere (il repo pretende il test che
   *sarebbe fallito*).
3. `npx jest --forceExit` con la baseline misurata: `main` fa **5 suite fallite / 8 test falliti / 1881 passati**
   (188 suite); le sole ammesse: `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`,
   `duckDbAndMatchmaker`, `presetBurtonOrdering`. Lista `FAIL` e totali.
4. I due hash del manifest invariati: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` /
   `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`.
5. `node scripts/qa/probe-hero-counts.js --fixture` → 9 titoli per medium, disgiunti.
6. **La sonda del ticket 54 resta verde**: `node scripts/qa/probe-duckdb-lock.js` → `SUCCESSO`.

## Trappole di questo repo (già pagate)

- **`module.exports === indice`** in `src/indice/index.js`: un wrapper omonimo è ricorsione infinita; un metodo che
  esiste sull'istanza non va incapsulato (o si usa `bind`).
- **I mock di Jest**: ripuntare un import da un modulo mockato a uno non mockato fa tornare il modulo mockato
  **parziale**. Quando tocchi un percorso, esegui le suite che mockavano il vecchio.
- **`tests/setupEnv.js` forza `DUCKDB_PATH=':memory:'`**: nei test il DB è in memoria e **non c'è file da
  osservare** → la riapertura deve essere un **no-op pulito** in quel caso, senza eccezioni.
- **Un `node -e` che carica il prodotto non esce da solo**: chiudi con `process.exit(0)`.
- Niente `frontend/**`, niente `git push`, niente `npm run build` / `tsc`.

## Quando è chiuso

Appendici un `## Esito` in italiano: dove sta la riapertura, la sonda e il suo output (e la prova che fallisce se
la si disattiva), la lista `FAIL` e i totali, i due hash, cosa **non** hai fatto. Lascia `Status: ready-for-agent`:
chiude l'integratore.
