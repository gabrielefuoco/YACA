Status: open
Type: research
Punto: P10, P21
Blocked by: 04

# 06 — Poster URL globale: badge YACA su tutte le row

## Domanda

YACA può diventare il **poster provider globale** di Nuvio, così che i badge ITA/episodio compaiano su
tutte le row — anche su source native TMDB e su cataloghi di altri addon? Servono: pattern esatto del
Poster URL, placeholder (`{type}`, `{tmdb_id}`, `{imdb_id}`, `{shape}`), chiavi del settings blob,
schermate coperte, comportamento della cache, costo di un endpoint immagini.

## Cosa deve uscire

Una nota in `ricerche/06-poster-url-globale.md` con:

- **contratto Nuvio**: pattern `custom_poster_url_pattern`, `custom_poster_enabled_screens`, piattaforme
  (`tv`, `mobile`, `desktop`), schermate (`home,continue_watching,collections,library,details,search`),
  cosa sostituisce Nuvio e cosa no.
- **shape**: quali valori arrivano (`poster`, `landscape`, `square`), come YACA li rende, cosa fa per
  `square` se non ha un canvas dedicato.
- **mapping ID**: `tmdb`, `imdb`, `kitsu`; come risolvere un `tt` a TMDB e viceversa; cosa serve per
  anime e serie.
- **badge**: ITA, episodio, S/E, eventualmente rating; quali dati YACA ha già e quali mancano; cosa
  succede se il badge non è disponibile.
- **cache**: `Cache-Control`, ETag/Last-Modified, revalidation, CDN/edge, invalidazione quando cambia
  un badge; costo per un’istanza self-hosted.
- **fallback**: cosa restituisce YACA se l’ID non è noto o l’immagine non è disponibile; come non
  rompere il poster originale.
- **compatibilità**: build Nuvio senza Poster URL; differenze TV/mobile/desktop; rischi.

## Fonti primarie

- Pictorium: `docs/discord-nuvio-guide.md` (Poster URL, `{shape}`, `live=1`, cache caveats).
- Kaptain: `nuvio-push.js` (`custom_poster_url_pattern`, `custom_poster_enabled_screens`,
  `POSTER_PLATFORMS`, `POSTER_SCREENS_ALL`, `applyCustomPosterSource`).
- YACA: `src/api/stremio.js` (`/erdb-poster/:file`, `/images/poster/...`),
  `src/stremio/formatters/StremioFormatter.js`, `src/stremio/badges.js`, `src/posters/*`.
- NuvioTV: settings data store / UI per il campo Poster URL, se presente nel codice.
- Nuvio wiki: UI/customization e poster.

## Come si chiude

La nota è pronta quando:

1. il pattern e le chiavi del settings blob sono confermati da almeno due fonti;
2. i tre shape hanno un comportamento dichiarato;
3. il mapping ID e i badge hanno un contratto;
4. cache/CDN e fallback sono dimensionati, non vaghi;
5. c’è un go/no-go con i motivi.
