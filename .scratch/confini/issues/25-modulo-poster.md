Status: resolved
Type: task
Blocked by: 24

# 25 — Il modulo poster: ERDB, i file composti, la coda e il drenatore

## Perché

Il poster è un dominio a sé stante rispetto alla cache dei dati o delle risposte memorizzate (deciso in grilling nel ticket 24 e confermato nel ticket 16).
Prima di questo ticket le responsabilità erano sparse:
- `src/erdb/` (costruzione poster e mapping ERDB);
- `src/cache/posterDaEvento.js`, `src/cache/codaEventi.js`, `src/cache/drenaPoster.js` (la coda degli eventi e il drenatore);
- `scripts/drena-coda-poster.js` (lo script invocato dal timer systemd esterno `ops/yaca-poster-eventi.service`);
- `src/api/staticPosters.js` (la rotta HTTP `GET /erdb-poster/:file`).

Il modulo poster unifica sotto un unico possessore (`src/posters/`) la gestione delle immagini composte, del mapping ERDB, della coda di rigenerazione eventi e del drenatore sia come funzione che come comando eseguibile da timer esterno.

## Il confine e la struttura

1. **Percorso scelto**: `src/posters/` con `src/posters/erdb/` interno.
   - *Motivazione*: La regola della repo è «una cartella = un possessore, e il nome dice cosa possiede». Il modulo possiede i *poster* (il dominio); ERDB è il fornitore esterno / formato delle immagini composte, quindi `erdb/` vive come sotto-namespace all'interno del modulo poster, non come radice.
2. **Cosa possiede il modulo**:
   - `src/posters/erdb/`: mapping ERDB name ↔ id (`posterFileName`, `posterUrl`, `sanitizeErdbId`, ecc.) e logica del builder offline (`build.js`, `run`, `parseJsonl`, `buildReport`);
   - `src/posters/codaEventi.js`: la coda Redis degli eventi di rigenerazione (`push`, `take`, `done`, `fail`, costanti di retry e TTL);
   - `src/posters/posterDaEvento.js`: traduzione bidirezionale tra eventi di dominio e id/nomi file ERDB;
   - `src/posters/drenaPoster.js`: drenatore della coda (funzione di libreria: `drena`, `scarica`, `scrivi` atomico protetto da collisioni concorrenti, verifica magic-byte JPEG);
   - `src/posters/drenaCodaPoster.js`: il comando CLI per il drainer (proprietà del modulo, invocabile da riga di comando e da systemd timer);
   - `src/posters/index.js`: superficie pubblica unificata del modulo poster (coda, drenatore, builder, traduzioni, helper cache dir).
3. **I clienti del modulo**:
   - `src/api/staticPosters.js`: rotta HTTP che serve i file statici e delega al modulo la traduzione dei nomi, la costruzione degli URL, il download/scrittura e l'accodamento in caso di 404;
   - `src/library` (conversione/ingestione) e `scripts/push-diff-in-coda.js` (invocato da `ops/yaca-doppiaggi.sh`): produttori che spingono eventi nella coda senza possederla;
   - `src/utils/libraryPosterRefresh.js`: consumatore delle funzioni di mapping `erdbIdDaNomeFile` e `posterFileName`.
4. **Comando del timer e modifiche per il mate**:
   - Il timer di sistema `ops/yaca-poster-eventi.service` invoca direttamente il comando del modulo:
     `ExecStart=/usr/bin/docker exec yaca-app node src/posters/drenaCodaPoster.js`
   - È stato mantenuto lo shim `scripts/drena-coda-poster.js` che delega a `src/posters/drenaCodaPoster.js`, garantendo retrocompatibilità totale se il timer sul mate non fosse immediatamente ricaricato.
   - **Cosa va deployato sul mate**:
     Poiché i file di unità systemd vivono sull'host (`/etc/systemd/system/`) e non dentro l'immagine Docker:
     ```bash
     sudo cp ops/yaca-poster-eventi.service /etc/systemd/system/
     sudo systemctl daemon-reload
     sudo systemctl restart yaca-poster-eventi.timer
     ```
   - `ops/yaca-doppiaggi.sh` invoca `scripts/push-diff-in-coda.js` che usa la coda esportata dal modulo poster (nessun cambio di percorso script necessario).

## Esito

- **Percorso del modulo**: `src/posters/` (con `src/posters/erdb/` all'interno).
- **Cosa possiede**: mapping ERDB name↔id, file composti, coda Redis eventi, drainer (`drena`), comando CLI (`drenaCodaPoster.js`), gestione directory cache (`DEFAULT_CACHE_DIR`, `getCacheDir`).
- **Clienti integrati**: `src/api/staticPosters.js`, `scripts/push-diff-in-coda.js`, `src/utils/libraryPosterRefresh.js`, `scripts/erdb-builder/build.js`.
- **Timer di sistema**: `ops/yaca-poster-eventi.service` aggiornato al comando `node src/posters/drenaCodaPoster.js` (con shim legacy in `scripts/drena-coda-poster.js`).
- **Da aggiornare sul mate**: copiare `ops/yaca-poster-eventi.service` in `/etc/systemd/system/` e dare `systemctl daemon-reload`.
- **Collaudo eseguito con successo**:
  - `tests/drenaCodaPoster.test.js`: 41 passed / 41 total
  - `tests/pushDiffInCoda.test.js`: 25 passed / 25 total
  - `tests/erdbBuilder.test.js`: 27 passed / 27 total
  - `tests/erdbList.test.js`: 23 passed / 23 total
  - `tests/staticPosters.test.js`: 19 passed / 19 total
  - `tests/moduloPoster.test.js`: 7 passed / 7 total
  - Esecuzione di `node src/posters/drenaCodaPoster.js --base http://127.0.0.1:3100/Tk-test --attesa-redis 500` e `node scripts/drena-coda-poster.js ...` con Redis assente: escono puliti con codice 0.
