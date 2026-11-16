# Onda 4 — tagli (11) e chiusura

**Branch**: `hardening/onda-4` · **Deploy**: 2026-11-16, immagine `01f8a929`

| Cut | Commit | Cosa | Righe |
|---|---|---|---|
| 1 | `83e822da` | `coda.push` ritorna `'added'/'duplicate'/'error'`; via `verificatoreInCoda` (2.000 eventi scaricati per un dubbio) | −34 |
| 2 | `dda94d5f` | un solo `aspettaRedis` in `codaEventi`, una sola `take` per giro | −29 |
| 3 | `a653fcd4` | via il giro a vuoto `eventoDaErdbId → nomeFileDaEvento → erdbIdDaEvento` | −16 |
| 4 | `c38b9673` | via `scriviVersioniVolumeSync` e `volumeObserver` | −47 |
| 5 | `60672c88` | via il path cablato `C:/Users/gabri/...` e la cache legacy del resolver | −14 |
| 6 | — | già fatto dal ticket 07 (130 righe di parser duplicato) | — |

Totale: **15 file, +240/−307**, di cui **−179 righe di produzione** e +112 di test nuovi.
Test: jest **199 suite / 1985**, servizi **132/132**. Verificati da me dopo il merge, non solo dal report.

Due scostamenti accettati e motivati dall'agente:
- `nomeFileDaEvento`/`urlDaEvento` restano in `posterDaEvento.js` perché altre suite li usano; è stato tolto solo il round-trip interno.
- `scripts/qa/probe-poster-volume.js` usava `volumeObserver`: ora fa `mock` di `registraRichiestaPoster`.

## Verifica in produzione (2026-11-16, dopo il deploy)

| Cosa | Esito |
|---|---|
| container | `yaca-app` e `yaca-tmdb-daemon` **healthy**, `/health` 200 |
| `sorgenti.json` | mtime **2026-11-15T19:52** = quello della migrazione: **non viene riscritto dal percorso caldo** (la correzione del ticket 08 regge in produzione) |
| coda eventi | **0** in attesa, drenatore a 0/0/0 (svuotata) |
| semaforo | `yellow` con un solo motivo: `anime_airing: homeInWindow=84, homeStale=54` |

## Cosa resta aperto (dichiarato, non dimenticato)

1. **GC poster non installato**: codice e unità systemd pronte (`ops/yaca-poster-gc.{service,timer}`). Con `maxDelete 500` tiene la crescita a zero; i **16 GB** di arretrato richiedono una passata una tantum a cap alto, da decidere con i numeri del dry-run.
2. **`homeStale=54`**: 54 documenti anime con conferma più vecchia di 3 giorni. Il worker è vivo (ultimo giro ok, 24 titoli scritti): è dato vecchio, non guasto. Fuori perimetro, ora visibile.
3. **`--resolve-ids` mai schedulato** (A2): ~3.684 schede AG senza candidato restano senza annotazione.
4. **Titoli non latini** (~10.264): strutturalmente non matchabili, nessuna traslitterazione.
5. **`docs/` obsoleta**: esclusa dai digest, mai corretta.
6. **`anime-source` senza watchdog**: Docker non riavvia un container unhealthy; il semaforo lo rende visibile, non lo ripara.
