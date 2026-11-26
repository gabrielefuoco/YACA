Status: resolved
Type: task
Priorità: P4 (quinta onda)
Blocked by: nessuno (ma sequenziare con 09: la nuova versione crea orfani che il GC pulisce)

# 08 — Poster: la versione del file deve dipendere anche dall'immagine sorgente

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q6**, parte invalidazione (diagnosi punto 1, patch di `posterBadgeVersion.js` con `estraiTokenSorgente`). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto (il bug)

`src/stremio/formatters/posterBadgeVersion.js` calcola la versione del file come
`sha1(BADGE_IMG_VERSION | erdbId | badge)`. **L'immagine sorgente non entra nell'hash**: se TMDB cambia
`poster_path` per un film, il nome del file composto resta identico e il volume continua a servire la
locandina vecchia **per sempre** (finché non cambia badge o font). È l'anomalia A5, metà del problema.

## Cosa fare

1. **`calcolaVersionePoster({erdbId, badge, source})`**: se arriva `source`, estrarre il **token
   canonico** dell'immagine (`/f89U3ADr…jpg` → `f89U3ADr…`, togliendo query, estensione e prefisso di
   CDN) e includerlo nell'hash. Se `source` non arriva (chiamanti offline, test), il comportamento deve
   restare **identico a oggi** (payload senza token).
2. **Mappa `sorgenti.json`** nel volume (`/data/erdb-cache`): `erdbId → token`. **Non è decorazione**: il
   drenatore riceve eventi `{tipo,id,badge}` e **non** ha `source`; senza la mappa calcolerebbe un nome
   diverso da quello chiesto dal formatter, scriverebbe orfani e la rotta resterebbe in 404 per sempre.
   Implementazione minima: `JSON.parse`/`writeFileSync` su `tmp` + `rename`, una chiave per poster
   (~100k voci, pochi MB). Se il file supera **200k voci** si azzera: perdere la mappa significa solo
   vecchi nomi, che il GC (ticket 09) ripulisce.
3. **Chiamanti**: `StremioFormatter` (2 punti), `erdb/build.js` (legge `poster_path` dalla riga) e
   `libraryPosterRefresh` passano `source`; `posterDaEvento`/`drenaPoster` lo prendono dalla **mappa**
   (evento → `erdbId` → token → stesso nome).
4. **Prefill notturno prima del deploy**: `src/posters/erdb/build.js` legge `poster_path` dai parquet e
   scrive già i nomi nuovi sul volume; il rilascio trova i file al loro posto, zero raffica di 404.

## Adattamenti necessari

- `posterFileName(entry)` oggi accetta `{erdbId, badge, version?, v?}` e chiama `calcolaVersionePoster`
  internamente: **non** va cambiata la firma, basta che `entry.source` arrivi fino al calcolo.
- I chiamanti senza `source` sono **tre** e vanno coperti dalla mappa: `posterDaEvento.js:127`,
  `drenaPoster` (evento), `libraryPosterRefresh.js:173`.
- **Attenzione**: se l'hash cambia per migliaia di titoli al primo deploy, la rotta fa 404 finché il file
  nuovo non esiste. È esattamente ciò che evita il prefill del punto 4: senza prefill, non si rilascia.

## Test

- `calcolaVersionePoster` con e senza `source`: senza `source` l'hash è **identico** a quello attuale
  (golden value scritto nel test); con `source` cambia; con due CDN diversi ma stesso basename **non**
  cambia (è il punto del token canonico).
- `estraiTokenSorgente`: `https://image.tmdb.org/t/p/w500/abc123.jpg`, `.../w342/abc123.jpg?x=1`,
  `abc123`, `/abc123.webp` → stesso token; `''`, `null`, `'up'` → stringa vuota.
- Integrazione leggera: `posterFileName` con `source` nuovo produce un nome diverso da quello vecchio.

## Fatto quando

1. Test verdi (incluso il golden che prova la retrocompatibilità dell'hash).
2. Su un titolo di prova: cambiare `poster_path` nel parquet/DuckDB e verificare che il formatter produca
   un nome file **nuovo** (e che il vecchio sia ancora servibile nella finestra di fallback).
3. `sorgenti.json` creato, cresce nel tempo, resta sotto la soglia decisa.

## Rischi e rollback

- **Rischio**: il cambio di hash invalida di colpo il volume → raffica di 404 + eventi in coda (il
  drenatore smaltisce 10 a giro, ogni 10 minuti: 1.000 file = ~17 ore). Per questo si rilascia con 09 e
  con il fallback sul nome vecchio.
- **Rollback**: la versione torna al payload senza token (revert del commit): i file vecchi sono ancora
  lì, il nome tornato è quello di prima.
