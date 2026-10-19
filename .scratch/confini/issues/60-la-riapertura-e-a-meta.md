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
