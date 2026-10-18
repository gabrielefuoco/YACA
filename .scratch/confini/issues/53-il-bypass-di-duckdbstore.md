Status: ready-for-agent
Type: task

# 53 — Chiudere il bypass di `duckDbStore` e completare la porta dei client

## Perché

`docs/INDEX.md:19` dice che i consumatori passano **solo** dalle porte canoniche dei moduli e mai dai file interni.
Oggi `src/indice/duckDbStore.js` è importato **per percorso da 11 moduli**, e `clients/graphClient` non è esposto
sulla porta dei client (3 moduli lo prendono per percorso). È **preesistente** — non è una regressione: la suite è
alla baseline e il feed è byte-a-byte — ed è dichiarato nella decisione 31 del `map.md`.

Misurato: **cosa serve davvero** a ognuno (non tutto l'oggetto, solo i metodi usati):

| modulo | usa |
|---|---|
| `src/anime/mapping.js` | `updateAnimeMapping` |
| `src/clients/idMapping.js` | `resolveImdbIds` |
| `src/library/identity.js` | `query` (SQL grezza) |
| `src/library/ingestion/LibraryConverterService.js` | `query` (SQL grezza) |
| `src/library/ingestion/libraryMediaTypeResolution.js` | `query` (SQL grezza, via `deps.duckDbStore`) |
| `src/posters/posterResolver.js` | `query` (SQL grezza) |
| `src/profile/ProfileBuilder.js` | `query` (SQL grezza), `resolveImdbIds` |
| `src/profile/studioProfile.js` | `query` (SQL grezza) |
| `src/stremio/processors/MetadataHydrator.js` | `init`, `isInitialized`, `query` (SQL grezza) |
| `src/stremio/providers/WatchlistProvider.js` | `query` (SQL grezza) |
| `src/api/bolle.js`, `src/api/mondi.js`, `src/pool/index.js` | `clients/graphClient` |

## Cosa deve uscire

1. **La porta dell'indice espone ciò che serve**, con nomi che NON si scontrano con quelli già presenti:
   - **`queryRaw(sql, params)`** — SQL grezza. ⚠️ **Il nome è deliberato**: la porta ha già `query(filtersOrPreset, {skip, limit, type})`, che è la query **compilata**, tutta un'altra cosa. Esporre la SQL grezza come `query` sarebbe un'ambiguità che si paga al primo bug.
   - **`updateAnimeMapping(...)`**.
   - **`init(options)`** e **`isInitialized`** (getter: `MetadataHydrator` lo legge come proprietà).
   - `resolveImdbIds` **c'è già** sulla porta: non va aggiunto.
2. **Gli 11 moduli ripuntati alla porta** (`require('../indice')` e affini). Alla fine:
   `git grep -n "indice/duckDbStore"` in `src/` → **zero** fuori da `src/indice/`.
3. **`graphClient` esposto sulla porta dei client** (`src/clients/index.js`) e i tre consumatori
   (`api/bolle`, `api/mondi`, `pool`) ripuntati: `git grep -n "clients/graphClient"` → zero fuori da `src/clients/`.
4. **Nessuno shim**: `src/indice/duckDbStore.js` resta dov'è (è il file interno dell'indice, non si sposta).

## ⚠️ Le tre trappole che questo repo ha già pagato — leggi prima di toccare

1. **`module.exports` È l'istanza.** In `src/indice/index.js` c'è `module.exports = indice`. Quindi
   `module.exports.getDfCache = (...a) => indice.getDfCache(...a)` **chiama sé stesso** → `RangeError: Maximum call
   stack size exceeded` (spedito dal ticket 49, trovato ieri). Per esporre un metodo che esiste già sull'istanza:
   **non scrivere nulla** (è già esposto) oppure `bind` esplicito. **Mai** un wrapper omonimo.
2. **I mock di Jest.** Ripuntare un import da un modulo *mockato* a uno *non* mockato fa tornare il modulo mockato
   **parziale** (`TypeError: … is not a function`), e un mock che non intercetta più è **peggio** di un test rosso.
   Molte suite fanno `jest.mock('../src/indice/duckDbStore')`: dopo il repoint devono mockare **il modulo che il
   codice di produzione usa davvero** (la porta), e il test deve restare significativo.
3. **I path relativi** dentro i file toccati: verifica con `node -e "require('<file>')"` (chiudi con `process.exit(0)`).

## La prova

- `git grep -n "indice/duckDbStore" -- src/` → solo `src/indice/`; `git grep -n "clients/graphClient" -- src/` → solo `src/clients/`.
- **Ogni metodo nuovo della porta, eseguito**: `node -e` che chiama `queryRaw`, `updateAnimeMapping`, `init`,
  `isInitialized` (e `getDfCache`, che ha già una storia). Un metodo che esiste ma esplode è peggio di uno assente.
- **Un test che fallirebbe se la porta non esponesse il metodo** (il repo lo pretende: *la sonda va committata, se no la misura vive nella prosa*).
- `node scripts/qa/probe-hero-counts.js --fixture` → 9 titoli per medium, disgiunti.
- **La baseline della suite è misurata**: `npx jest --forceExit` su `main` fa **5 suite fallite / 8 test falliti / 1872 passati** (187 suite; il test `dfCacheSync` è nuovo). Le sole ammesse: `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`. **Incolla la lista `FAIL` e i totali**: un sottoinsieme di suite non è una prova.
- **Il feed non cambia**: `buildManifest({})` sha256 = `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178`, `buildRootManifest()` = `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`.

## Regole

Un commit per passo (porta → repoint indice → repoint graphClient → mock dei test), ognuno con la sua prova `grep`.
Niente `frontend/**`, niente `git push`, niente `npm run build` / `tsc`.
Se un modulo si scopre usare qualcosa che la porta non può onestamente esporre, **fermati e dillo** invece di
aggiungere superficie.

## Quando è chiuso

Appendici un `## Esito` in italiano: per ogni modulo, da dove a dove, il metodo usato e la sua prova; la lista
`FAIL` e i totali della suite; i due hash; cosa **non** hai fatto. Lascia `Status: ready-for-agent`: chiude l'integratore.
