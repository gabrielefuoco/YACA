Status: ready-for-agent
Type: task

# 50 — Il servire dei metadati nel feed, e i middleware nell'API

## Perché

Due residui della **decisione 29** («il servire vive nel feed, non nel catalogo»), rimasti fuori dalla sua
applicazione:

1. **`src/meta/index.js` (528 righe) è servire.** Il suo stesso docstring: *«confine di dominio per il serving dei
   metadati Stremio: dettagli del titolo, arricchimento Kitsu/anime, allineamento id episodi verso IMDb,
   doppiaggio ITA per le schede poster e cache del metadato finale»*. Per la decisione 29 il **feed** è
   `src/stremio`, ed è lì che il servire abita (`catalogHandler`, `hybridServing`, `idratazione`, `badges`,
   `CatalogRouter`). `meta` è l'unico pezzo di servire ancora fuori.
2. **`src/middleware/` (154 righe, 5 file) è l'orlo HTTP**: `adminAuth`, `errorMiddleware`, `inputSanitizer`,
   `requestContext`, `sessione`. Sono montati da `index.js` e appartengono all'**API** (`src/api/`), che è il
   bordo del prodotto (ticket 10/11).

## Cosa deve uscire

1. **`src/meta/index.js` → `src/stremio/meta.js`** (o `src/stremio/meta/index.js` se preferisci mantenere la
   forma a cartella: dichiara quale). I consumatori ripuntati:
   - `src/api/stremio.js:29` (`metaHandler`, `isMetaDubbed`),
   - `src/stremio/catalogHandler.js:40` (`allineaIdFilm`),
   - i test che lo nominano (`allineaIdFilm`, `animeMarkerNormalization`, `kitsuMappingStats`, i `metaHandler*`).
   La **porta del feed** (`src/stremio/index.js`) deve esporre ciò che serve a `src/api`, così l'API nomina il
   feed e non un file interno.
2. **`src/middleware/` → `src/api/middleware/`**, con `index.js` ripuntato. La cartella `src/middleware/`
   **sparisce**.
3. **Nessuno shim**: `src/meta/index.js` non resta come re-export.

## Attenzione a un vincolo già dichiarato

`src/meta/index.js` importa `translateImdbToTmdb` da `src/id_mapping/id_cache` — quel file **si sposta in un
altro ticket** (52). Qui **non** lo toccare: lascia l'import com'è. Se dopo lo spostamento del ticket 52 il
percorso cambia, lo aggiorna chi integra. **Dichiaralo nell'Esito** se ti accorgi del disallineamento.

## La prova

- `ls src/meta` → **non esiste**; `ls src/middleware` → **non esiste**; `git grep -n "middleware/"` in `index.js` →
  i require puntano a `./src/api/middleware/…`.
- `node -e "require('./src/stremio'); require('./src/stremio/meta'); console.log('ok'); process.exit(0)"`.
- **Le suite del protocollo Stremio devono passare identiche**:
  `npx jest tests/stremio --forceExit` (4 suite, 19 test) e i sei `tests/metaHandler*.test.js` +
  `tests/allineaIdFilm.test.js` + `tests/kitsuMappingStats.test.js`.
- Il **manifest byte-a-byte**: i due hash in fondo al ticket 48.
- La suite intera con la baseline misurata (5 suite / 8 test / 1868 passati; incolla lista `FAIL` e totali).

## Confini di file (per il lavoro in parallelo)

Questo ticket **possiede**: `src/meta/**`, `src/middleware/**`, `src/api/stremio.js`, `src/stremio/**`, `index.js`,
e i test che li nominano.
**Non tocca**: `src/utils/**`, `src/db/tier1*.js`, `services/tmdb-daemon/**`, `src/dna/**`, `src/profile/**`,
`src/ricerca/**`, `src/id_mapping/**`, `src/api/configure/**`, `src/indice/duckDbStore.js`.
Se ti serve toccare un file fuori da questo elenco, **dichiaralo nell'Esito**.

## Regole

Valgono i Vincoli del ticket 48 (baseline misurata, mock di Jest, path relativi dopo uno spostamento, getter pigro,
niente `frontend/**`, niente push, un commit per passo). Aggiungi un `## Esito` in italiano e lascia
`Status: ready-for-agent`.
