Status: ready-for-agent
Type: task

# 48 — Il dump TMDB fuori dal prodotto: `src/utils` si smonta e il daemon si prende il suo codice

## Perché

`services/tmdb-daemon/cli.js` è un **secondo entry point della stessa immagine** (`ghcr.io/gabrielefuoco/yaca`,
`command: ["node","services/tmdb-daemon/cli.js"]`), quindi condividere codice col prodotto **non è sbagliato in
sé**: il contratto fra i due è **l'artefatto** (il dump su volume), e il ticket 34 l'ha già fatto bene
(`src/api/admin.js` legge `tmdbDumpStore.loadStatus()`, non la memoria di processo).

Il difetto è la **collocazione**, e `src/utils/` non è un modulo: la regola di `docs/INDEX.md:19` dice che i
consumatori passano **solo** dalle porte canoniche e mai da residui storici — e `utils/` non è nemmeno nominato.

Misurato, chi usa cosa in `src/utils/` (2.052 righe):

| file | righe | consumatori | dove deve stare |
|---|---|---|---|
| `tmdbDumpDaemon.js` | **498** | **solo** `services/tmdb-daemon/cli.js` — **nessuno nel prodotto** | `services/tmdb-daemon/` |
| `tmdbDumpClient.js` | 377 | daemon, `src/db/tier1LazyPromotion`, 2 script | `services/tmdb-daemon/` |
| `tmdbDumpStore.js` | 342 | daemon, `src/api/admin.js`, 2 script, 1 test | `services/tmdb-daemon/` (è **il contratto**: l'artefatto) |
| `tmdbIngestPolicy.js` | 95 | solo la pipeline del dump | `services/tmdb-daemon/` |
| `tmdbBudget.js` | 384 | `src/clients/tmdb.js` → **prodotto** | `src/clients/` |
| `tmdbNameResolver.js` | 356 | `src/api/configure/profileProcessor.js` → **prodotto** | `src/profile/` |

E `src/db/` contiene due file che **non sono infrastruttura del database**, contro la regola scritta in
`docs/INDEX.md:19` («`src/db/` resta riservato all'infrastruttura del database — connessione, migrazioni»):
`tier1Promotion.js` (308) e `tier1LazyPromotion.js` (147) sono la **promozione Tier 2 → Tier 1** dell'indice.

## Cosa deve uscire

1. **La pipeline del dump** — `tmdbDumpDaemon.js`, `tmdbDumpClient.js`, `tmdbDumpStore.js`,
   `tmdbIngestPolicy.js` → **`services/tmdb-daemon/`**. I consumatori esterni (gli script `backfill-*`, il test
   `tmdbDumpStatus`, `src/api/admin.js`) ripuntati al nuovo percorso.
2. **`tmdbBudget.js` → `src/clients/`** (è il budget di chiamate TMDB, e `src/clients/tmdb.js` è il suo
   consumatore).
3. **`tmdbNameResolver.js` → `src/profile/`** (sono i nomi per il DNA, e il consumatore è il profilo).
4. **`tier1Promotion.js` + `tier1LazyPromotion.js` → `src/indice/`** (la promozione è dell'indice, che possiede
   DuckDB e Tier 2).
5. **`src/utils/` sparisce**: alla fine la cartella non esiste più. Se resta un file, il ticket **non è chiuso** e
   va detto perché.

## La prova

- `ls src/utils` → **non esiste**.
- `git grep -n "utils/"` in `src/`, `services/`, `scripts/`, `tests/` → **solo** eventuali commenti storici, nessun
  `require`.
- `node -e "require('./services/tmdb-daemon/cli.js')"` **non** è eseguibile (il cli parte), quindi la prova è:
  `node -e "require('./services/tmdb-daemon/tmdbDumpDaemon.js')"` e gli altri moduli spostati, uno per uno, con
  `process.exit(0)`.
- `node scripts/qa/probe-hero-counts.js --fixture` → 9 titoli per medium, disgiunti.
- La suite intera (vedi sotto).

## Vincoli (valgono per ogni ticket di questo gruppo)

- **La baseline della suite è misurata, non ricordata**: `npx jest --forceExit` su `main` fa
  **5 suite fallite / 8 test falliti / 1868 passati**, e le sole ammesse sono `animeOverridesCertify`,
  `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering` (ambientali: mancano i
  parquet TMDB in locale). **Nessun test può essere cancellato o indebolito per far tornare la suite verde.**
  Incolla la lista `FAIL` e i totali nell'Esito: un sottoinsieme di suite **non è una prova**.
- **Il feed non cambia**: `buildManifest({})` sha256 =
  `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` e `buildRootManifest()` =
  `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`.
- **I mock di Jest sono un confine**: ripuntare un import da un modulo mockato a uno non mockato fa tornare il
  modulo mockato **parziale** (`TypeError: … is not a function`). Quando ripunti un percorso, esegui **le suite che
  mockavano il percorso vecchio**.
- **I path relativi si rompono quando un file si sposta**: questo repo l'ha pagato due volte oggi
  (`../constants`, `../contentId`). Dopo ogni spostamento, `node -e "require(...)"` su **ogni** file spostato.
- **Un getter pigro letto come campo** è un `TypeError` già spedito una volta (`searchTier2`): leggi il getter.
- **Niente `frontend/**`**, niente `git push`, niente `npm run build` / `tsc`.

## Confini di file (per il lavoro in parallelo)

Questo ticket **possiede**: `src/utils/**`, `src/db/tier1*.js`, `services/tmdb-daemon/**`, `src/clients/tmdb.js`,
`scripts/backfill-*.js`, e i test che li nominano.
**Non tocca**: `src/dna/**`, `src/profile/**` (tranne l'arrivo di `tmdbNameResolver.js`), `src/meta/**`,
`src/middleware/**`, `src/ricerca/**`, `src/id_mapping/**`, `src/api/configure/**`, `index.js`.
Se ti serve toccare un file fuori da questo elenco, **dichiaralo nell'Esito** (file + riga + perché).

## Quando è chiuso

Aggiungi un `## Esito` in italiano a questo ticket: per ogni file, da dove a dove, il consumatore ripuntato, la
prova eseguita e il suo output, e cosa **non** hai fatto. Lascia `Status: ready-for-agent`: chiude l'integratore.
