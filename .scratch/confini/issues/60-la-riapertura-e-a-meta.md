Status: ready-for-agent
Type: bug

# 60 — La riapertura può esporre tabelle a metà

## Il difetto (trovato dalla review del 19/10/2026, ticket 59)

In `src/indice/duckDbStore.js`, `ensureFreshHandle` fa, in quest'ordine:

```js
this.reopenPromise = this._reopenDueToSwap(options);
try {
    await this.reopenPromise;
} finally {
    this.reopenPromise = null;      // ← azzerato QUI
}

// Post-reapertura: aggiornamento anime mappings e cache DF sul nuovo handle
await this.updateAnimeMapping({ movie: movieIds, tv: tvIds });   // ← e questo viene DOPO
await this.buildDfCache();
```

`_reopenDueToSwap` riapre il file e basta: **non** ripopola `anime_mappings`. Quindi `reopenPromise` viene
azzerato **prima** che le tabelle siano complete. Una query concorrente che aspetta `reopenPromise` (il primo
ramo di `ensureFreshHandle`) si sveglia e interroga un database in cui `anime_mappings` è **ancora vuota o
parziale**.

**Perché conta**: `anime_mappings` è la tabella che rende filtrabile l'animazione in SQL
(`F.anime` → `id IN (SELECT tmdb_id FROM anime_mappings) OR (genere 16 AND original_language = 'ja')`). Una
tabella a metà non dà un errore: **dà un insieme diverso** — cioè, per la finestra della riapertura, la politica
anime sbaglia in silenzio.

## Cosa deve uscire

1. **`reopenPromise` copre TUTTO il lavoro**: la riapertura **e** il ripopolamento (`updateAnimeMapping`,
   `buildDfCache`). Chi aspetta quella promise deve trovare il database **pronto**, non solo aperto.
2. **La barriera è una sola**: non due (`reopenPromise` per l'apertura + niente per il resto). Se serve un
   secondo stato ("riaperto ma non ripopolato"), va **dichiarato** e rispettato da chi legge.
3. **Una sonda committata** (`scripts/qa/`) che dimostra il difetto: una query concorrente che parte **durante**
   la riapertura non deve mai vedere `anime_mappings` incompleta. La sonda deve **fallire** se si azzera
   `reopenPromise` troppo presto (provarlo disattivando la correzione).

## Verifica

- La sonda sopra, col suo output, e la prova che fallisce senza la correzione.
- `npx jest --forceExit` con la baseline misurata: **5 suite fallite / 8 test falliti / 1885 passati** (189
  suite); le sole ammesse: `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`,
  `presetBurtonOrdering`. Lista `FAIL` e totali.
- I due hash del manifest invariati: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` /
  `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`.
- `node scripts/qa/probe-duckdb-lock.js` e `node scripts/qa/probe-duckdb-reopen.js` (anche con
  `--disable-reopen`) restano verdi: le due sonde del ciclo del DuckDB non devono rompersi.
- `node scripts/qa/probe-hero-counts.js --fixture` → 9 titoli per medium, disgiunti.

## Note

- **`tests/setupEnv.js` forza `DUCKDB_PATH=':memory:'`**: nei test non c'è file da osservare, quindi la
  riapertura è un no-op e la sonda deve costruirsi il suo ambiente (come fanno le altre sonde del DuckDB).
- **`module.exports === indice`** in `src/indice/index.js`: un wrapper omonimo è ricorsione infinita.
- Niente `frontend/**`, niente `git push`, niente `npm run build`/`tsc`.
- Il resto della review del 19/10 è già stato chiuso dall'integratore in `0784cbe`: questo ticket copre **solo**
  l'ordine della riapertura.

## Esito

### 1. Dove risiede ora la barriera
In `src/indice/duckDbStore.js`, all'interno di `ensureFreshHandle`, `this.reopenPromise` è stata unificata per coprire l'**intero lavoro atomico** di riapertura:
1. `await this._reopenDueToSwap(options)` (svuotamento query attive, chiusura vecchi handle, riapertura file DuckDB con retry backoff esponenziale).
2. `await repopulatePostReopen()`:
   - Popolamento sincrono della tabella in RAM `anime_mappings` con tutti i TMDB ID certificati presenti in `animeMappingStore` via `this.updateAnimeMapping(..., { skipFreshCheck: true })`.
   - Ricalcolo e memorizzazione delle frequenze documenti e mappe keyword via `this.buildDfCache({ skipFreshCheck: true })`.
3. Reset di `this.reopenPromise = null` nel blocco `finally` dell'intera promise composta.

Per prevenire ricorsioni o deadlock circolari durante il popolamento interno, `updateAnimeMapping`, `query` e `buildDfCache` supportano l'opzione interna `skipFreshCheck: true`. Chiunque esegua una query concorrente durante la riapertura trova la barriera attiva (`this.reopenPromise`), attende il suo completamento e accede al database **esclusivamente quando è pronto e interamente popolato**.

### 2. Sonda QA (`scripts/qa/probe-duckdb-reopen-barrier.js`)
È stata implementata e committata la sonda `scripts/qa/probe-duckdb-reopen-barrier.js`. La sonda simula un daemon che scambia un catalogo su disco e verifica che una query concorrente lanciata durante la riapertura non veda mai `anime_mappings` parziale o a zero.

#### Output in modalità normale (Barriera Completa Attiva):
```text
=======================================================
[SONDA QA] Barriera Completa Riapertura DuckDB (Ticket 60)
Modalità: VERIFICA NORMALE (Barriera Completa Attiva)
=======================================================

--- (a) Creazione DB iniziale da parte del daemon ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.
[DuckDB Store] Tabella anime_mappings creata in RAM con 2000 anime certificati (1500 movie, 500 tv).
[DuckDB Store] Swap atomico completato con successo
[Probe] Database iniziale creato su target.

--- (b) L'App si avvia e verifica anime_mappings iniziale ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Database persistente valido riaperto con successo
[DuckDB Store] Tabella anime_mappings creata in RAM con 2000 anime certificati (1500 movie, 500 tv).
[Probe] App inizializzata: 2000/2000 anime certificati presenti in anime_mappings.

--- (c) Daemon compila nuovo catalogo su staging (.new) e scambia atomico ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.
[DuckDB Store] Tabella anime_mappings creata in RAM con 2000 anime certificati (1500 movie, 500 tv).
[DuckDB Store] Swap atomico completato con successo
[Probe] Swap atomico completato: il nuovo file su targetDbPath attende la riapertura dell'app.

--- (d) Esecuzione concorrente: Query 1 riapre, Query 2 e 3 leggono DURANTE la riapertura ---
[DuckDB Store] Database scambiato: riaperto
[DuckDB Store] Tabella anime_mappings creata in RAM con 2000 anime certificati (1500 movie, 500 tv).
[Probe] Esito esecuzione concorrente:
  - Log riapertura intercettato: SÌ
  - Campione visto da query simultanea (Q2): 5/5
  - Totale visto da query a metà finestra (Q3): 2000/2000
  - Riga certificata 990001 trovata con tipo corretto: SÌ

=======================================================
Esito Sonda: SUCCESSO — la barriera copre riapertura E ripopolamento: nessuna tabella a metà.
=======================================================
```
Exit code: 0.

#### Output con correzione disabilitata (`--disable-fix` / azzeramento prematuro barriera):
```text
=======================================================
[SONDA QA] Barriera Completa Riapertura DuckDB (Ticket 60)
Modalità: DIMOSTRAZIONE FALLIMENTO (Barriera Prematura / Difetto Attivo)
=======================================================

--- (a) Creazione DB iniziale da parte del daemon ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.
[DuckDB Store] Tabella anime_mappings creata in RAM con 2000 anime certificati (1500 movie, 500 tv).
[DuckDB Store] Swap atomico completato con successo
[Probe] Database iniziale creato su target.

--- (b) L'App si avvia e verifica anime_mappings iniziale ---
[Probe] Simulazione rilascio prematuro barriera ATTIVATA (--disable-fix).
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Database persistente valido riaperto con successo
[DuckDB Store] Tabella anime_mappings creata in RAM con 2000 anime certificati (1500 movie, 500 tv).
[Probe] App inizializzata: 2000/2000 anime certificati presenti in anime_mappings.

--- (c) Daemon compila nuovo catalogo su staging (.new) e scambia atomico ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.
[DuckDB Store] Tabella anime_mappings creata in RAM con 2000 anime certificati (1500 movie, 500 tv).
[DuckDB Store] Swap atomico completato con successo
[Probe] Swap atomico completato: il nuovo file su targetDbPath attende la riapertura dell'app.

--- (d) Esecuzione concorrente: Query 1 riapre, Query 2 e 3 leggono DURANTE la riapertura ---
[DuckDB Store] Database scambiato: riaperto
[DuckDB Store] Tabella anime_mappings creata in RAM con 2000 anime certificati (1500 movie, 500 tv).
[Probe] Esito esecuzione concorrente:
  - Log riapertura intercettato: SÌ
  - Campione visto da query simultanea (Q2): 0/5
  - Totale visto da query a metà finestra (Q3): 0/2000
  - Riga certificata 990001 trovata con tipo corretto: NO

=======================================================
Esito Sonda: FALLIMENTO DIMOSTRATIVO ACCERTATO — senza barriera completa, le query concorrenti vedono dati incompleti.
Conteggi riscontrati durante il difetto: Q2=0/5, Q3=0/2000
=======================================================
```
Exit code: 1.

### 3. Baseline Jest (`npx jest --forceExit`)
```text
Summary of all failing tests
FAIL tests/animeOverridesCertify.test.js
FAIL tests/presetBurtonOrdering.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/duckDbAndMatchmaker.test.js

Test Suites: 5 failed, 184 passed, 189 total
Tests:       8 failed, 1 skipped, 1885 passed, 1894 total
Snapshots:   0 total
Time:        43.605 s
```
Le 5 suite fallite e gli 8 test falliti corrispondono esattamente alla baseline attesa (nessuna regressione introdotta).

### 4. Hash del Manifest Invariati
Comando:
`node -e "const crypto = require('crypto'); const { buildManifest, buildRootManifest } = require('./src/stremio/manifest'); const m1 = JSON.stringify(buildManifest({})); const h1 = crypto.createHash('sha256').update(m1).digest('hex'); const m2 = JSON.stringify(buildRootManifest()); const h2 = crypto.createHash('sha256').update(m2).digest('hex'); console.log('buildManifest sha256:', h1); console.log('buildRootManifest sha256:', h2); process.exit(0);"`
- `buildManifest({})` SHA-256: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (invariato)
- `buildRootManifest()` SHA-256: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (invariato)

### 5. Sonde DuckDB Esistenti e Hero Counts
- `node scripts/qa/probe-duckdb-lock.js`:
  `Esito Sonda: SUCCESSO — nessun Conflicting lock, il DB si apre.`
- `node scripts/qa/probe-duckdb-reopen.js`:
  `Esito Sonda: SUCCESSO — l'app riapre dopo lo scambio e serve dati freschi.`
- `node scripts/qa/probe-duckdb-reopen.js --disable-reopen`:
  `Esito Sonda: FALLIMENTO DIMOSTRATIVO ACCERTATO — senza riapertura l'app resta stantia.` (exit code 1)
- `node scripts/qa/probe-hero-counts.js --fixture`:
  `Film: 9 titoli (Disgiunti: true) · Serie: 9 titoli (Disgiunti: true)`

### 6. Cosa NON è stato fatto
- Nessun tocco ai file o directory riservati al worker parallelo del Ticket 61 (`services/keyword-graph/**`, `services/doppiaggi-source/**`, `src/pool/index.js`, ecc.).
- Nessuna riapertura dei punti già chiusi dalla review precedente (ticket 59 in commit `0784cbe`).
- Nessun `git push`.
- Nessun `npm run build` o compilazione `tsc`.
- Nessun tocco a `frontend/**`.

