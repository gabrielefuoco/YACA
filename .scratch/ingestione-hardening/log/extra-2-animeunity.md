# Extra 2 — AnimeUnity riscritta sull'API nuova (ticket 15)

**Data**: 2026-11-25 · **Commit**: `44d2861f` (rewrite) + `00f9f908` (fix) · **Deploy**: immagine `yaca-anime-source`

## Come è finita

La pipeline anime **è ripartita**. Misure dopo il primo ciclo in produzione:

| Prima | Dopo |
|---|---|
| `last-home-run: {items: 0, zeroItems: true}` dal 16/11 | **`{items: 20, zeroItems: false}`** (100 al giro completo) |
| `--health-check` → **exit 1** | **exit 0** ("Ultimo giro riuscito 0.0 ore fa") |
| 9 risposte **429** in un ciclo | **0** |
| `homeInWindow = 0`, `homeStale = 138` | **`homeInWindow = 78`, `homeStale = 62`** |
| ~174-522 chiamate `/episodes` per giro (retry della vecchia API) | **0**: i conteggi arrivano da `variants[]` dell'archivio |

78 documenti hanno `homeReleases.checkedAt` nell'ultima ora. Gli altri 62 sono titoli usciti dalla finestra
o non più in home: si allineeranno (o resteranno vecchi per scelta) nei prossimi giri.

## Cosa è cambiato nel worker

| Prima (sito vecchio) | Adesso (API JSON) |
|---|---|
| attributo HTML `items-json` nella home | `GET /api/home/latest-episodes` (max 5 pagine = 100 episodi) |
| `POST /archivio/get-animes` + CSRF token | `GET /api/archive?status=ongoing` (90 serie) + `GET /api/archive?language=ita` |
| `GET /info_api/{id}/{dub}?start_range=&end_range=` | `GET /api/anime/{id}/episodes` (solo quando serve) + `variants[].episodes_count` |
| doppiaggio dedotto dal canale (`dub=1`) | **`videos[].language === 'ita'`**, per singolo episodio |
| `airedAt` da `created_at` (con 2-6 tentativi) | **osservazione**: prima volta che la coppia `(anime, episodio, lingua)` compare |

Il codice della vecchia API (`resolveAiredAt`, `AIRED_AT_WINDOW`, la token dance CSRF) è stato **cancellato**,
non adattato: era la fonte di 2-6 chiamate inutili per anime e delle righe `l'API riporta 1 episodi`.

> `ponytail:` su `airedAt`: accuratezza = un giro di polling (15 min). Upgrade path: leggere una data vera se
> l'API un giorno la espone.

## Il rate limit è stretto, e ora è gestito

Misurato a mano: **429 dopo 9 richieste in un secondo**. Il worker ora mantiene i 350 ms di cortesia e su 429
ritenta **una volta** con pausa crescente (2 s, poi 5 s), loggando `warn` al retry ed `error` solo se anche
il secondo tentativo fallisce. Nessuna coda, nessun token bucket.

## Watchdog: riacceso

`yaca-anime-source-watchdog.timer` è **attivo** (ogni 30 minuti). Primo giro reale:

```
[watchdog] OK (yaca-anime-source): HealthCheck OK ...; home aggiornata 0.0h fa
```

Da adesso una rottura come quella del 16-25 novembre si vede entro **6 ore** (soglia sulla freschezza della
home, non solo sul battito) e il container viene riavviato da solo.

## Cosa resta

- **Ticket 13**, backfill dei 2.399 titoli con titolo illeggibile (codice pronto, ~2.400 chiamate TMDB): non
  lanciato.
- Valori storici in `anime_airing_state` che vengono da nove giorni di cache: si assestano da soli, ma qualche
  `sub.episode`/`dub.episode` può essere più alto del reale finché il merge non li riconfronta.
