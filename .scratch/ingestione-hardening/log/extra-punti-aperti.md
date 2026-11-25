# Extra — chiusura dei punti aperti (25 novembre 2026)

Sessione lunga a cavallo di 10 giorni: le onde 1-4 sono state rilasciate fra il 15 e il 16 novembre, questa
parte chiude i sei punti che erano rimasti dichiarati aperti. **Oggi è il 2026-11-25** (l'orologio dell'host
lo dice: `date -u` → `2026-11-25T17:57Z`), ed è la data che rende leggibili molte misure di questo log.

| Punto | Esito |
|---|---|
| 1. GC poster | **timer installato** (`yaca-poster-gc.timer`, ogni giorno alle 05:00) + pulizia dei nomi doppi |
| 2. `homeStale` | **non era un dato vecchio: era un guasto.** Vedi sotto |
| 3. `--resolve-ids` | **eseguito**, 1.312+ identità provate su 2.650 schede esaminate |
| 4. titoli non latini | **era un bug nostro**, non un buco di TMDB → ticket 13 |
| 5. `docs/` | corrette 4 affermazioni sbagliate + 3 file dove erano ripetute |
| 6. watchdog `anime-source` | **costruito e installato**, poi **disattivato** (vedi punto 2) |

## 1. Volume poster: nessun arretrato, e i nomi doppi sono spariti

Misura del 25/11: **205.307 file**, di cui **0 eleggibili** al GC (il TTL è 60 giorni e i file sono di
ottobre), **197.876 hardlink** dalla migrazione del ticket 08, disco **52 GB su 226 (25%)**.

Quindi la raccomandazione "una passata una tantum con cap alto per smaltire 16 GB" **non aveva senso**: non
c'era arretrato da smaltire. Quello che serviva era togliere i nomi vecchi, e l'ho fatto con
`scripts/migra-poster-versione-sorgente.js --prune-old`:

```
esaminati 205.304 · giaOk 99.135 · nomi vecchi rimossi 98.643 · nuovi link 325 · senza token 6.900 · errori 301
```

Volume: **205.304 → 106.989 file**. Gli errori sono file in scrittura concorrente da parte del drenatore
(`unlink`/`link` fallito), non dati persi: i nomi restano e il GC li prenderà col TTL.

> Nota operativa: la rotta `/erdb-poster/:file` **rigenera** un file che non trova, quindi NON va usata per
> verificare che un nome vecchio sia stato cancellato — al primo `curl` lo ricrea (successo davvero, su
> `tmdb-movie-1000058.jpg`).

## 2. `homeStale`: la pipeline anime è ferma dal 16 novembre

Il semaforo diceva `homeInWindow=84, homeStale=54`. La ricognizione ha trovato:

- l'ultimo `homeReleases.checkedAt` reale è **2026-11-16T01:08Z** (9,7 giorni prima di oggi);
- il worker è vivo, ma il log ripete `Passata home incrementale: nessun item letto. Nessuna scrittura.`;
- `www.animeunity.co` risponde **301 → animeunity.cx** (dominio cambiato);
- corretto il dominio (`ANIMEUNITY_BASE_URL=https://animeunity.cx`), ma **la home estrae ancora 0 item**:
  il sito è stato **rifatto** (Laravel + Inertia), `items-json` non esiste più, `/archivio/get-animes` e
  `/info_api/{id}/{dub}` rispondono **404**, `/anime` risponde **405** su GET;
- i dati della home ora stanno nel payload Inertia `data-page` (`latestAnimes`, `latestEpisodes`, …) e in
  quel payload **non ci sono episodi né flag di doppiaggio italiano**.

Dettaglio completo, prove e domande aperte: **ticket 15** (`issues/15-animeunity-riscrittura.md`). Non è una
patch: è una riscrittura dello scraper, e richiede una decisione (riscrivere / fonte alternativa / congelare).

## 3. Resolver `--resolve-ids`: misura e run reale

Prova a budget 300 chiamate: **123 identità provate su 225 schede (54,7%)**, 82 via titolo italiano, 16 via
originale, 25 via titoli alternativi. Estrapolato: ~4.900 chiamate per ~2.000 titoli.

Run reale avviato (in background, `--resolve-ids` senza budget). I numeri finali sono in fondo a questo
log quando il giro chiude; il file di annotazioni viene riscritto **solo** con le identità provate, come da
contratto del resolver.

## 4. Titoli non latini: era la policy, non TMDB

| | titoli con **zero** caratteri latini | di cui con `title_en`/`name_en` già salvato |
|---|---:|---:|
| film | 6.461 su 98.558 | **1.585** |
| serie | 1.794 su 19.856 | **814** |
| totale | 8.255 | **2.399** |

Causa: `resolveIngestTitle` considerava "non italiano" solo il giapponese/cinese (`CJK_REGEX`), quindi un
titolo coreano/hindi/russo/thai veniva tenuto come se fosse italiano, buttando via il titolo inglese già
presente nella stessa riga. Ticket **13** (predicato `isNotLatin` + backfill esteso). Gli altri **5.856** non
hanno nemmeno un titolo inglese: lì serve una traslitterazione, e resta una decisione di prodotto.

## 5. Watchdog `anime-source`

Costruito (`ops/yaca-anime-source-watchdog.{sh,service,timer}`): riavvia il container se non è running, se
`--health-check` fallisce, o se `last-home-run.json` è più vecchio di 6 ore (24 passate incrementali a vuoto
non sono mai legittime).

Installato e **subito disattivato**: con il nuovo health-check (ticket 14) che fallisce correttamente sugli
zero item, e con la pipeline rotta, avrebbe riavviato il container ogni 30 minuti senza risolvere niente.
Da riaccendere quando il ticket 15 è chiuso.

## 6. Note di deploy

- `/srv/yaca` è la seconda copia del codice che conta: i job systemd (`doppiaggi`, `poster`, watchdog)
  girano **sull'host**, quindi un deploy dei container **non** li aggiorna. Serve `git pull` in `/srv/yaca`.
- `node` sull'host è gestito da `mise`: `sudo node` non trova la versione. Per gli script una tantum va usato
  il path assoluto (`mise which node`) oppure `docker run`/`docker exec` con l'immagine.
