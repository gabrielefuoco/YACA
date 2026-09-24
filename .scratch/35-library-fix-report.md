# 35 — Libreria Utente: duplicati dell'import e copertine

Worktree: `C:/Users/gabri/.yaca-wt/library-fix` · branch `fix/user-library-import`

## Diagnosi (dati di produzione, sola lettura)

Collection `userlibraryitems`, libreria reale (`addonUuid ff7084d8-904b-42d9-91f5-ea2b4ae37590`):

| Misura | Valore |
|---|---|
| Item totali | **368** |
| Item **senza `itemId`** (documenti legacy, chiave = `_id`) | **169** |
| **Gruppi duplicati** per chiave `itemId \|\| _id` | **70** |
| Item senza copertina | **1** |
| Indice unico `{addonUuid, itemId}` dichiarato nel codice | **assente** in produzione |
| Indice unico realmente presente | `{addonUuid, _id}` |

**Causa dei duplicati (H1 confermata, con sfumatura):** 169 documenti legacy non hanno `itemId`. Il sync fa upsert con `filter: { addonUuid, itemId }`: per un titolo che esiste solo come documento legacy, il filtro non trova nulla e **crea un secondo documento**. Risultato: 70 titoli presenti due volte (es. `kitsu:42323`, `tt0251439`, `kitsu:6448`). L'indice unico `{addonUuid, itemId}` non può essere creato finché esistono più documenti con `itemId` nullo per lo stesso `addonUuid` — quindi la protezione prevista dal codice non è mai entrata in funzione.

**Copertine:** gli URL salvati **caricano tutti** (verificati uno per host: `hanime-img-proxy` 200, host storico HF 206, `image.tmdb.org` 200, `media.kitsu.app` 200, `ui-avatars.com` 200, `artworks.thetvdb.com` 200, `images.metahub.space` 200). I host in uso sono: host HF storico 145, `image.tmdb.org` 87, host attuale 65, `ui-avatars.com` 22, altri minori. Quindi il placeholder **non** nasce da URL morti né da copertine assenti in archivio: va individuato il punto della UI/percorso di conversione in cui la copertina si perde (serve il riscontro dell'utente: griglia principale, modale di import, o anteprima del catalogo convertito).

## Cosa è stato implementato

1. `src/services/LibrarySyncService.js`
   - `deduplicateUserLibrary(addonUuid)`: consolida i documenti legacy (assegna `itemId = _id` quando manca) ed elimina i duplicati mantenendo il documento più ricco (`mapped: -1, _mtime: -1`). Eseguita prima di ogni sync (Stremio e Trakt) e prima della conversione.
   - `preserveExistingPosters(addonUuid, bulkOps)` **(aggiunta dall'orchestratore)**: gli upsert scrivono `poster: <risolto> || null`; se la risoluzione non trova nulla, una copertina buona già in archivio veniva **cancellata**. Ora, con una sola query e a ops già costruite, la copertina esistente viene ripristinata quando la nuova sarebbe vuota; se la nuova è valorizzata vince quella. Aggiunta anche nel percorso Trakt.
   - Riempimento copertine mancanti via `resolvePoster` (parquet DuckDB in RAM → poi TMDB), solo quando la copertina manca davvero.
2. `src/utils/posterResolver.js` (nuovo): risolve la copertina dalla sorgente più economica — copertina già presente → `tmdbId` dall'`itemId`/mappatura IMDb→TMDB (senza rete) → parquet locale → TMDB API.
3. `src/api/profiles.js`: `GET /:id/library` de-duplica per `itemId || _id` (H2: eventuali duplicati visibili in UI); `POST /:id/library` riempie la copertina mancante.
4. `src/db/models/UserLibraryItem.js` + `src/db/connection.js`: `ensureIndexesSafe()` all'avvio — tenta la creazione degli indici dichiarati e, se fallisce per duplicati preesistenti, avvisa senza interrompere l'avvio.
5. `src/services/LibraryConverterService.js`: deduplica prima della conversione e preferisce il parquet locale a TMDB per i dettagli.

## Verifiche

- `npx jest tests/userLibraryDedup.test.js` → **10/10 verdi** (inclusi i 2 test aggiunti dall'orchestratore su `preserveExistingPosters`: copertina esistente ripristinata, copertina nuova valida mantenuta, nessuna query senza `addonUuid`/`ops`).
- Test reso ermetico: il fixture non passava `tmdbId`, quindi il percorso DuckDB non era raggiungibile e l'asserzione dipendeva dal parquet reale (falliva a freddo).

## Resta da fare (orchestratore)

- Eseguire `deduplicateUserLibrary` sui dati reali (**produzione, serve approvazione**): attesi ~70 duplicati rimossi e 169 documenti legacy riconciliati con `itemId`; poi l'indice unico `{addonUuid, itemId}` potrà essere creato al riavvio.
- Individuare il punto in cui la copertina diventa placeholder (serve riscontro visivo dell'utente).
