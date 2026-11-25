Status: needs-info
Type: research
Priorità: P1 (la pipeline anime è ferma: nessun dato nuovo dal 16 novembre)
Blocked by: nessuno (ma richiede una decisione di prodotto: riscrittura, fonte alternativa, o feature congelata)

# 15 — AnimeUnity ha rifatto il sito: lo scraper va riscritto

**Riferimento**: anomalia scoperta il 2026-11-25 durante la chiusura dei punti aperti. Contesto e misure in
[`../log/extra-punti-aperti.md`](../log/extra-punti-aperti.md). Originale temporaneo del handoff:
`C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Cosa è successo

1. Il 16 novembre alle 01:08 il worker `yaca-anime-source` scrive l'ultimo dato reale. Da lì in poi ogni
   passata home registra `[AnimeSource] Passata home incrementale: nessun item letto. Nessuna scrittura.`
2. Il **dominio** è cambiato: `www.animeunity.co` → **301** → `animeunity.cx` (trovato e corretto in
   produzione con `ANIMEUNITY_BASE_URL=https://animeunity.cx`).
3. Ma il dominio era solo la superficie: il sito è stato **rifatto** come applicazione Laravel + Inertia.
   Le vecchie API non esistono più:

| Endpoint vecchio | Risposta oggi |
|---|---|
| `POST /archivio/get-animes` | `404 {"message":"The route archivio/get-animes could not be found."}` |
| `GET /archivio` | `404` |
| `GET /info_api/{id}/{dub}` | `404` |
| attributo HTML `items-json="…"` nella home | **non esiste più** |
| `GET /anime` | `405` (la rotta esiste, il metodo GET no) |
| `GET /anime/{id}/{slug}` | `404` |
| `/animes`, `/catalogo`, `/esplora`, `/anime/in-corso` | `404` |

4. La home serve un payload **Inertia** nell'attributo `data-page` (189.871 caratteri di JSON). Chiavi in
   `props`: `carouselAnimes`, `latestAnimes`, `upcomingAnimes`, `latestEpisodes`, `topAnimes`, `watchList`,
   `calendarEntries`, `calendarSeason`, più `ziggy` (le rotte Laravel), `scws_url`, `cdn_url`.
5. Forma di un elemento `latestAnimes` (osservata): `{id, slug, title, title_ja, title_it, type, season,
   year, total_episodes, episode_runtime, default_status, score, views, members, favorites, poster_color,
   images{poster,banner,cover,logo}, image_variants{poster{160,240,…}}}`.
   **Nessun episodio e nessun flag di doppiaggio** in questo payload.
6. `latestEpisodes` era un oggetto (non un array) nella home osservata: va ispezionato.

## Perché è una riscrittura e non una patch

Lo scraper attuale (`services/anime-source/src/animeunity.js`) è costruito su tre pilastri che oggi non
esistono più:

- **home**: estrae `items-json` dall'HTML → ora i dati stanno nel payload Inertia;
- **archivio "In corso"**: `POST /archivio/get-animes` con token CSRF e paginazione → rotta sparita;
- **episodi**: `GET /info_api/{animeId}/{dub}?start_range=…` per contare gli episodi e ricavare `created_at`
  → rotta sparita.

E il dato che serve a YACA (quale episodio è uscito, e se è uscito **doppiato in italiano**) nel nuovo
payload della home non c'è: va trovato altrove (pagina di dettaglio? endpoint `scws_url`? un'API JSON
dedicata?).

## Domande da chiudere prima di scrivere codice

1. **Dove sono gli episodi** nel sito nuovo? Candidati: un endpoint JSON dietro `scws_url`, la pagina di
   dettaglio (route da scoprire — `/anime/{id}/{slug}` è 404, quindi la forma è un'altra), o un endpoint
   `POST /anime` (la rotta `/anime` risponde 405 su GET, quindi esiste con un altro metodo).
2. **Dov'è l'elenco delle serie "In corso"** con paginazione? La vecchia rotta non c'è; le rotte vere sono
   nel payload `ziggy` (script separato) — estrarle è il primo passo concreto.
3. **Il flag doppiaggio italiano** esiste ancora? Era il dato più prezioso (unione con le annotazioni AG).
4. **Il rate/ToS**: il sito è dietro Cloudflare (`cloudflare` presente nell'HTML). Basta un UA da browser?
   Serve un delay diverso? (Nota: il probe con UA da browser ha funzionato, quindi niente challenge.)

## Cosa resta da decidere (prodotto, non tecnico)

- **(a) Riscrivere lo scraper** sul nuovo sito: 2-4 giorni di lavoro fra ricognizione delle rotte, nuovo
  parser, fixture, test. Mantiene il simulcast e il badge ITA degli anime.
- **(b) Fonte alternativa** per l'airing (AniList ha il calendario di uscita, ma **non** il doppiaggio
  italiano). Il badge "ITA n" andrebbe perso o dedotto diversamente.
- **(c) Congelare la feature**: lasciare i dati attuali in Mongo, il semaforo giallo/rosso come promemoria,
  e il watchdog spento. Il catalogo simulcast si svuota da solo man mano che `homeReleases` invecchia.

## Stato attuale in produzione (per non peggiorare)

- `ANIMEUNITY_BASE_URL=https://animeunity.cx` impostato (era il dominio giusto, ma non basta).
- **Watchdog disattivato** (`systemctl disable --now yaca-anime-source-watchdog.timer`): con il nuovo
  health-check che fallisce sugli zero item, riavvierebbe il container ogni 30 minuti senza risolvere
  niente. Va riacceso **dopo** il fix.
- Il health-check ora **dice la verità**: `FAIL: Ultima passata home ha estratto 0 item`.
- L'archivio continua a "scrivere documenti", ma sta ri-scrivendo la cache di `airing-series.json` del 16
  novembre: non è dato nuovo.
