Status: resolved
Type: research
Punto: P13, P22
Blocked by: —

# 08 — Library, watch history e progress come segnale di gusto

## Domanda

Nuvio può diventare la **fonte** del gusto di YACA — library, watch history, watch progress — senza
passare da Stremio o Trakt? Cosa si può leggere, con quale identità, con quale delta, e cosa YACA può
calcolare dal dato? Serve anche capire cosa non si può fare per privacy/ownership.

## Cosa deve uscire

Una nota in `ricerche/08-library-storia-segnale.md` con:

- **campi disponibili**: library (`content_id`, `content_type`, `name`, `poster`, `genres`,
  `imdb_rating`, `added_at`), watch history (`watched_at`, season/episode), watch progress
  (`position`, `duration`, `last_watched`, `progress_key`).
- **bootstrap + delta**: ordine corretto (cursor → snapshot → delta), paginazione, `event_id`, delete.
- **identità**: `tmdb:`/`tt`/`kitsu:`; cosa serve per mappare su TMDB/IMDb e sui seed YACA.
- **segnale**: quali eventi diventano Love/Like/Watch nel modello YACA; come pesare un episodio vs un
  film; cosa fare con progress incompleto; come evitare di contare due volte.
- **privacy/consenso**: cosa chiedere all’utente, cosa tenere, per quanto, come cancellare; cosa non
  leggere (per esempio watch progress di altri profili).
- **sync**: una tantum, periodico, on-demand; cosa succede se l’utente usa Nuvio e Stremio insieme.
- **cosa YACA può calcolare**: DNA, seed, watchlist; cosa manca rispetto a Stremio/Trakt.

## Fonti primarie

- Nuvio docs v1.3: Library, Watch progress, Watch history, Concepts/Incremental sync.
- NuvioTV: sync services e modelli library/progress/history.
- YACA: `src/library/*`, `src/models/TasteProfile.js`, `src/profile/ProfileBuilder.js`,
  `src/stremio/collection.js` (ingestione Stremio), `src/library/ingestion/*`.
- Kaptain: eventuale uso di library/history (se presente in `nuvio-push.js` o snapshot).

## Come si chiude

La nota è pronta quando:

1. c’è una mappa campo Nuvio → segnale YACA;
2. il flusso bootstrap/delta è scritto e ha i cursori;
3. la questione identità è risolta o dichiarata aperta;
4. privacy/consenso e retention sono espliciti;
5. c’è un go/no-go con i casi in cui non conviene usare Nuvio come fonte.

---

## Esito

**Risolto il 20/10/2026** — nota completa in
[`ricerche/08-library-storia-segnale.md`](../ricerche/08-library-storia-segnale.md).

- **Nuvio è una fonte di fatti, non di preferenze**: library = “l’ho salvato” (peso 1, non un rating),
  history = “l’ho finito”, progress = “ci sono dentro”. Non esiste Love/Like/negative.
- **Il dato più prezioso è la history per episodio**, non la library: va aggregata per titolo (un solo
  `watched`, `episodesWatched` esatto), altrimenti il DNA gonfia. Il progress serve per completamento/
  continue-watching, non come segnale DNA.
- **Identità**: l’id meta grezzo (`tt`/`tmdb:`/`kitsu:`) da risolvere a `tmdbId`; `anilist:`/`mal:`
  mancano nel resolver e `WatchHistory` non ha il tipo nella chiave.
- **Blocchi**: privacy (token account-wide, PIN non applicato dall’API), modello YACA
  (`UserLibraryItem` senza `source`, nessuna provenance per i delete), Nuvio che può essere specchio di
  Trakt/Simkl/MDBList.
- **Verdetto**: **GO condizionato** a un import **read-only, history-first, un solo profilo, una tantum
  o giornaliero**, per utenti Nuvio-only. **NO-GO** per specchi, account condivisi e aspettative di
  Love/Like.

