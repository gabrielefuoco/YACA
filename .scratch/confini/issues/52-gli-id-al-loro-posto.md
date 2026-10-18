Status: ready-for-agent
Type: task

# 52 — Gli id al loro posto: `src/id_mapping` sparisce

## Perché

`src/id_mapping/id_cache.js` (96 righe) è la cache di traduzione **IMDb ↔ TMDB**: legge e scrive il modello
`ImdbToTmdbMapping`, con la rete TMDB come ripiego. Non è un modulo — è **un adattatore verso l'esterno**, e per
questo appartiene a `src/clients/`, dove già vivono i client TMDB e Trakt (il «meccanismo», come `src/ai`).

I suoi consumatori, misurati:

| consumatore | cosa prende |
|---|---|
| `src/meta/index.js:14` | `translateImdbToTmdb` |
| `src/profile/ProfileBuilder.js:510` | `translateImdbToTmdb` (require pigro) |
| `src/api/admin.js:6` | `clearIdCache` |
| `tests/metaHandlerCacheImmutability.test.js:42`, `tests/metaHandlerDumpImdbId.test.js:72` | mock del percorso |

**Nota che va scritta, non nascosta**: il modello `ImdbToTmdbMapping` è toccato da **tre** moduli
(`id_cache`, `library/ingestion/LibrarySyncService.js:465`, `posters/posterResolver.js:50`). La mappa dice che
solo il proprietario tocca i suoi modelli: qui il proprietario non è mai stato dichiarato. **Questo ticket non lo
risolve** (è una decisione di confine, non un trasloco) ma **lo dichiara** nell'Esito: chi possiede
`ImdbToTmdbMapping`, e chi lo tocca oggi.

## Cosa deve uscire

1. **`src/id_mapping/id_cache.js` → `src/clients/idMapping.js`** (rinomina al momento del trasloco: `id_cache` è
   un nome che non dice cosa fa — è la traduzione fra due sistemi di id). La cartella `src/id_mapping/`
   **sparisce**.
2. **I consumatori ripuntati**: `src/meta/index.js`, `src/profile/ProfileBuilder.js`, `src/api/admin.js`, e i due
   test che lo mockano (i mock devono puntare al **nuovo** percorso, se no diventano ciechi).
3. **La porta di `src/clients`** espone `translateImdbToTmdb` e `clearIdCache`, così chi sta fuori non nomina un
   file interno.
4. **Nessuno shim**: `src/id_mapping/id_cache.js` non resta come re-export.

## Attenzione

`src/meta/index.js` **si sposta in un altro ticket** (50, verso `src/stremio/`). Qui **non** spostarlo: aggiorna
solo il suo import. Se il ticket 50 è già atterrato quando parti, il file sarà `src/stremio/meta.js` — **verifica
su `main` prima di toccare**, e dichiara nell'Esito quale dei due hai trovato.

## La prova

- `ls src/id_mapping` → **non esiste**; `git grep -n "id_mapping"` in `src/`, `tests/`, `scripts/` → nessun
  `require` vivo.
- `node -e "require('./src/clients'); require('./src/clients/idMapping'); console.log('ok'); process.exit(0)"`.
- `npx jest tests/metaHandlerCacheImmutability.test.js tests/metaHandlerDumpImdbId.test.js tests/metaHandlerImdbIdNoNetwork.test.js --forceExit`.
- La suite intera con la baseline misurata (5 suite / 8 test / 1868 passati; incolla lista `FAIL` e totali) e i due
  hash del manifest invariati.

## Confini di file (per il lavoro in parallelo)

Questo ticket **possiede**: `src/id_mapping/**`, `src/clients/**`, `src/api/admin.js`, `src/profile/ProfileBuilder.js`,
i due test che mockano `id_cache`, e la riga di import dentro `src/meta/index.js` (o `src/stremio/meta.js`).
**Non tocca**: `src/utils/**`, `src/db/tier1*.js`, `services/tmdb-daemon/**`, `src/dna/**`, `src/ricerca/**`,
`src/middleware/**`, `index.js`, e **nient'altro** di `src/meta`/`src/stremio` (un solo import).
Se ti serve toccare un file fuori da questo elenco, **dichiaralo nell'Esito**.

## Regole

Valgono i Vincoli del ticket 48 (baseline misurata, mock di Jest, path relativi dopo uno spostamento, getter pigro,
niente `frontend/**`, niente push, un commit per passo). Aggiungi un `## Esito` in italiano e lascia
`Status: ready-for-agent`.
