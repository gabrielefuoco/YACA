# Ricognizione 15 — l'API nuova di AnimeUnity

**Data**: 2026-11-25 · **Metodo**: rotte estratte dal payload Ziggy della home (86 rotte), poi provate una
per una dal container `yaca-anime-source`.

Il sito nuovo espone un'**API JSON sotto `/api/`**, tutta in **GET** e senza CSRF (la vecchia richiedeva
token CSRF e POST per l'archivio).

## Mappa endpoint → dato che serve a YACA

| Serve per | Endpoint | Forma osservata |
|---|---|---|
| Uscite recenti (sostituisce l'attributo `items-json`) | `GET /api/home/latest-episodes` | paginato (`current_page`, `data`, `total: 180`, `next_page_url`, …). Item: `{id, language: 'jpn'\|'ita', runtime, scws_id, is_hidden, episode: {id, number: '8', seq_number_start, seq_number_end, is_filler, anime: {id, slug, title, title_ja, title_it, type, season, year, total_episodes, default_status, score, views, members, favorites, images, image_variants}}}` |
| Episodi di un anime (sostituisce `/info_api/{id}/{dub}`) | `GET /api/anime/{animeId}/episodes` | `{episodes: [{id, number, seq_number_start, seq_number_end, is_filler, videos: [{id, language, runtime, scws_id, has_timestamps}], notices}], start, tab_size, total, offset}` |
| Serie in corso (sostituisce `POST /archivio/get-animes`) | `GET /api/archive?status=ongoing` | paginato, `total: 90`, `last_page: 210` senza filtro |
| Ricerca | `GET /api/search?q=…` | `{data, count, hasMore}` |
| Top | `GET /api/top-anime` | paginato |
| Dettaglio (non serve al worker) | `GET /anime/{id}-{slug}` | pagina Inertia; **`/anime/{id}/{slug}` è 404** |

Altri valori provati per `status` (`in_corso`, `In corso`, `in corso`, `airing`) → **422**: l'unico valido è
`ongoing`.

## Il doppiaggio italiano: c'è, ed è più preciso di prima

Ogni episodio ha `videos[]` con `language` (`ita` / `jpn`). Verificato su **Black Clover (id 112)**:
120 episodi con **entrambe** le lingue, ognuno con video distinti (`ita#107514` + `jpn#10242`).

Nella home (`latest-episodes`, 20 item): `jpn` 16, `ita` 4 — quindi la home riporta anche le uscite
doppiate, con il numero di episodio.

## Gli id sono stabili

`Black Clover = 112`, `Dandadan = 5660`: sono gli stessi id del sito vecchio, quelli già dentro
`anime_airing_state`. I documenti vanno **aggiornati**, non ricreati.

## Vincoli per l'implementazione

1. **Schema Mongo invariato**: l'app legge `homeReleases.{sub,dub}.{episode,airedAt}`,
   `homeReleases.checkedAt`, `sub/dub.episode`, `listSeenAt`, `orderIndex`. Qualsiasi cambio di forma rompe
   catalogo simulcast e badge.
2. **`airedAt`**: l'API nuova **non dà la data di uscita**. Il valore si ricava dall'**osservazione** — la
   prima volta che una coppia `(anime, episodio, lingua)` compare, `airedAt = now` (accuratezza = il giro,
   15 minuti). Da annotare con un `ponytail:`.
3. **Finestra**: la vecchia regola dei 14 giorni non ha più una data su cui appoggiarsi. Diventa "le prime
   N pagine di `latest-episodes`" (5 pagine = 100 episodi per giro) + memoria delle coppie già viste.
4. **Cortesia**: delay 350 ms e UA dichiarato restano. Il sito è dietro Cloudflare ma risponde senza
   challenge con UA da browser (verificato più volte oggi).
5. **Niente più CSRF**: tutte GET, quindi sparisce la token dance di `/archivio`.
