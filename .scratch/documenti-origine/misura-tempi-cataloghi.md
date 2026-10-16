# Dove va il tempo di risposta di un catalogo YACA

Misura del 04/10/2026, su `mate`, contro l'addon in produzione
(`http://127.0.0.1:7860`, handle di prova `ff7084d8-…`), senza aver deployato niente:
i file di `ops/timing/` misurano **da fuori** (tempo HTTP, connessioni TCP, byte di rete,
comandi Redis) e **dentro** il processo (profilo CPU V8 su richieste vere), e i probe
girano via `docker exec -i … node -` per non lasciare alcun file nel container.
Nessuna modifica al checkout principale, nessuna modifica alla produzione.

## La risposta in una riga

Un catalogo a regime costa **~110 ms**, e di questi **~98 ms non sono del catalogo**: sono
due `findOne` a MongoDB Atlas fatti **in sequenza** su ogni richiesta, prima ancora di sapere
quale catalogo verrà chiesto. La costruzione è `ms=0-1` perché la cache funziona: il tempo
che mancava da spiegare sta **fuori** dal percorso del catalogo.

| richiesta (7 ripetizioni, mediana) | tempo | dentro al catalogo |
|---|---|---|
| `/manifest.json` **senza** handle (pavimento di Express) | **1,3 ms** | — |
| handle **inesistente**: due `findOne` e basta, catalogo mai costruito | **98,0 ms** | **0 ms** |
| catalogo preset movie, caldo (`cache=hit ms=0-1`) | **109,7 ms** | **~11 ms** |
| catalogo preset serie, caldo | **108,5 ms** | ~11 ms |
| scheda `tmdb:1396`, calda | **106,5 ms** | ~8 ms |

Il handle inesistente è la misura decisivo: risponde `{metas: []}` senza eseguire una riga di
`catalogHandler`, e costa **98 ms**. Il catalogo caldo costa **110 ms**. La differenza — cioè
tutto il lavoro sui 20 titoli, compresi badge, formattazione, `fs.statSync` e serializzazione
— è **~11 ms**, cioè il 10% di quello che l'utente aspetta.

## 1. La risposta di un catalogo: il collo non è il catalogo

Fasi misurate (preset movie caldo, 20 card, 22,5 KB di risposta):

| fase | ms | come è stata misurata |
|---|---|---|
| Express, rotta, `res.json` | **1,3 ms** | `GET /manifest.json` senza handle |
| `UserConfig.resolveUserConfig` → `AddonConfig.findOne` | **65-113 ms** | `findOne` reale dal container, 5 prove |
| `UserConfig.resolveUserConfig` → `UserAccount.findOne` | **50-76 ms** | idem (somma 118-183 ms; il probe è un processo separato e sovrasterstima un po' rispetto ai 98 ms misurati dentro la richiesta) |
| cache del catalogo (Redis) | **0,2 ms** | `PING` 0,18 ms · `GET` 0,22 ms |
| `applyPostCacheBadges` + `sanitizeCatalogMeta` + `JSON.stringify` + scrittura HTTP | **~10 ms** | differenza risposta − (Express + Mongo) |
| costruzione del catalogo (`[CatalogTiming]`) | **0-1 ms** in cache, **9-24 ms** in build | log già in produzione |

Il profilo CPU del processo mentre serviva 5 richieste vere di catalogo (sampling 100 µs)
conferma la forma: **86,8% del tempo è idle** (attesa di rete), e il grosso dell'attesa sono
blocchi da **~100 ms** con dentro lo stack del driver MongoDB (`writeCommand`, `sendWire`).
Il lavoro applicativo del profilo è ≈32 ms per richiesta, di cui 6 ms di deserializzazione
BSON delle due risposte Mongo.

**Punto esatto del tempo perso:** `src/api/stremio.js:411` — `await UserConfig.resolveUserConfig(req.params.userHandle)`
è la **prima** riga di ogni rotta (`manifest:387`, `catalog:411`, `meta:445`, `stream:484`) e va
in `src/models/UserConfig.js:301`, dove `AddonConfig.findOne({uuid})` e poi `UserAccount.findOne({addonUuid})`
vengono eseguiti **uno dopo l'altro** (`UserConfig.js:305` e `:307`). Sono due round trip
serializzati verso `atlascluster.dtgloub.mongodb.net`, a una regione lontana dal mate: 50-113 ms ciascuno
(il tetto di ~98 ms per richiesta è la somma delle due misurata *dentro* la richiesta reale).

Le quattro sospette del ticket 06 sono **misurate e sfatate**:

* **`fs.statSync` per poster** (`StremioFormatter.js:154`, `esistePosterInCache`): **0,008-0,019 ms per poster**,
  cioè **0,92 ms per una pagina di 100 poster** (misurati 200 `stat` singoli + 20 pagine da 100 dentro il container).
  Non è un collo di bottiglia, è un rumore di fondo.
* **badge post-cache / `imdbMap` / serializzazione**: tutto dentro quei ~10 ms residui. Nel profilo
  non compare nessuna funzione di `applyPostCacheBadges` sopra 1 ms.
* **lettura delle annotazioni ITA** (`itaAnnotations.js:131`, `readFile` di `ita_annotations.jsonl`,
  0,82 MB / 24.139 righe): **20 ms ma una volta ogni 60 s** (`CACHE_TTL_MS`, `itaAnnotations.js:26`), non a ogni richiesta.
* **stato anime**: stessa forma (TTL 60 s, `animeAiringState.js:28`).

Cosa significa per il ticket: **«il tempo di risposta non sta nella costruzione» era giusto ma
per la ragione sbagliata**. Non sta nella costruzione *e non sta nemmeno nella risposta del
catalogo*: sta in due query a un database che sta a 6.000 km, prima di guardare la richiesta.
Il `[CatalogTiming]` diceva la verità (`ms=0`), semplicemente misurava una fetta piccola.

## 2. La ricerca: non è l'FTS5, è l'arricchimento che rifà le stesse chiamate a ogni ricerca

`yaca_search_standard` non usa la cache (`catalogHandler.js`, ramo `extra?.search` → `fetchCatalog()`
diretto), quindi il suo tempo è quasi tutto *build*. Confronto per termine, stesso handler:

| termine | card | `[CatalogTiming] build` | tempo HTTP totale |
|---|---|---|---|
| `azzzqqq` (nessun risultato) | 0 | 33-43 ms | 138-234 ms |
| `gattopardo` | 1 | 36-50 ms | 145-209 ms |
| `breaking bad` | 2 | 144-148 ms | 251-305 ms |
| `the bear` | 29 | **449-586 ms** | 590-820 ms |
| `the bear`, **prima** ricerca del termine | 29 | 2.446 ms | 2,4 s |

Dentro quei 450-580 ms di build, fase per fase (misurate dentro il container con i moduli dell'app):

| fase | ms | nota |
|---|---|---|
| `resolveUserConfig` (Mongo) | **~98 ms** | come sopra, è nel totale ma fuori dalla build |
| **FTS5 del Tier 2** (1.485.985 titoli, SQLite in sola lettura) | **8,6 ms** (max 15,8) | 7 query, `search@src/db/tier2Index.js:482` |
| nomi imparati (`LIKE` senza indice, 172 righe) | **0,08 ms** | `learnedNames.js:214` |
| ricerca locale su DuckDB + mappatura righe | **~10-35 ms** | dedotta dal caso «0 risultati» (build 33-43 ms) |
| letture dei dettagli dalla cache (Redis) | **1,5 ms** | `INFO commandstats`: **0 GET e 0 SET** per ricerca → tutto arriva dalla L1 in RAM |
| **arricchimento: chiamate a TMDB non cachate** | **~400-450 ms** | **15 connessioni HTTPS nuove verso `api.themoviedb.org` per ricerca** |
| badge post-cache + formattazione + JSON | ~10-30 ms | totale − build − Mongo |

La riga che chiude il conto è la penultima, misurata tre modi diversi che concordano:

1. **Connessioni TCP** campionate ogni 15 ms dentro `/proc/net/tcp` durante la richiesta:
   un **catalogo** di controllo apre **0** connessioni HTTPS; `breaking bad` (2 card) ne apre **1**;
   `the bear` (14 titoli arricchiti) ne apre **15**, picco 7 contemporanee, 4 IP diversi di
   `api.themoviedb.org` (108.139.210.13/27/66/128).
2. **Redis**: 0 `GET` e 0 `SET` per ricerca. Quindi i dettagli **sono** in cache: non è un
   cache-miss che richiede il download, è una **seconda chiamata di rete fatta a ogni ricerca**.
3. **Modello** che regge: `build ≈ 35 ms + ceil(titoli_arricchiti / 5) × ~200 ms`.
   Con 1 titolo arricchito dà 144 ms (misurati 144-148); con 14 dà 462-482 ms (misurati 449-586).

**Punto esatto del tempo perso:** `src/clients/tmdb.js:653` — `if (titleNeedsFallback || overviewNeedsFallback)`.
Quando il titolo o l'overview italiani mancano (o sono troppo corti), `getTmdbMetaDetails` rifà
**una o due `client.get` sull'endpoint già chiamato** (`tmdb.js:654` con `language: 'en-US'`,
`tmdb.js:663` con la lingua originale) **anche quando i dettagli sono già arrivati dalla cache**,
e **non cacha mai la risposta di quei fallback**. Per `the bear` la pagina da 29 card contiene i
20 titoli di FTS5 e 9 del catalogo locale: `mergeLocalWithTier2` tiene il locale e scarta il
Tier 2 omonimo, e infatti 6 dei 20 id di FTS5 non hanno voce nella cache dei dettagli
(`probe-missing.js`: sono quelli già presenti in DuckDB). Restano **~14 titoli da arricchire**,
tutti con overview italiana mancante → ~15 chiamate a TMDB a ogni ricerca, ~450 ms di attesa pura.

Da notare che l'indice **non è** il problema: FTS5 su 1,5 milioni di titoli risponde in 8,6 ms,
e i nomi imparati in 0,08 ms. Il ticket 06 sospettava `enrichTier2Items`; la chiave è che il
collo non è il *primo* arricchimento (quello è in cache e costa 1,5 ms) ma il **risucchio di
traduzione dentro** `getTmdbMetaDetails`, fuori dal budget da 3.500 ms e fuori da ogni cache.

## 3. La scheda a freddo: una chiamata TMDB per ogni stagione, più 200 ms di attesa per ognuna

Scheda calda = 150-190 ms (di cui ~98 Mongo). Scheda mai aperta, misurata su 10 titoli
(`final_meta_cache` vuota → prima richiesta davvero a freddo; ho usato `EXISTS` su Redis per
scegliere i titoli mai aperti):

| titolo | stagioni | episodi | **freddo** | caldo | oltre il caldo | `tmdb_episodes` in Redis |
|---|---|---|---|---|---|---|
| tmdb:94605 Arcane | 3 | 43 | 798 ms | 150 ms | **+648 ms** | 14,8 KB |
| tmdb:66732 Stranger Things | 5 | 42 | 865 ms | 152 ms | **+713 ms** | 15,2 KB |
| tmdb:1864 Road Tasted | 1 | 16 | 1.496 ms | 193 ms | **+1.303 ms** | — |
| tmdb:1438 The Wire | 6 | 67 | 1.078 ms | 154 ms | **+924 ms** | — |
| tmdb:1002 Bizarre | 6 | 60 | 2.144 ms | 154 ms | **+1.990 ms** | — |
| tmdb:60625 Rick and Morty | 10 | 128 | 1.814 ms | 150 ms | **+1.664 ms** | 41,2 KB |
| tmdb:456 I Simpson | 39 | 888 | **6.400 ms** | 160 ms | **+6.240 ms** | **327,9 KB** |
| tmdb:5123 Masterminds | 0 | 0 | 598 ms | 189 ms | +409 ms | — |
| tmdb:10059 Hour of Power | 0 | 0 | 861 ms | 212 ms | +649 ms | — |

Le connessioni HTTPS aperte durante la prima richiesta (campionamento ogni 15 ms, quindi
**limite inferiore**: una connessione più corta del campione sfugge) danno il conto delle
chiamate: `5123` ~2, `1864` ~5, `1002` ~10, `1438` ~2; la seconda richiesta (calda) **0**.
Per I Simpson il tempo è coerente con le chiamate che il suo numero di stagioni implica.

Quante chiamate fa, e quante potrebbe evitare (`src/clients/tmdb.js:434` `fetchTmdbEpisodes`):

1. `ceil((stagioni+1)/20)` chiamate con `append_to_response=season/N` (`tmdb.js:462`, 20 stagioni per
   chiamata): **1-2** per titolo. Servono e sono irrinunciabili.
2. **Una chiamata `/tv/<id>/season/<n>?language=en-US` per ogni stagione in cui almeno un
   episodio non ha l'overview italiana** (`tmdb.js:518-523`), e una seconda nella lingua
   originale quando questa non è `it`/`en`. Per I Simpson è il grosso: fino a 39-78 chiamate
   per aprire una scheda. Il `append_to_response` precedente contiene già quelle stagioni:
   la chiamata esiste solo per riempire un'overview vuota.
3. `resolveImdbIdPerEpisodi` (`metaHandler.js:289`) può aggiungere **1** chiamata `/external_ids`
   quando il titolo non è nel dump — e quella, quella sì, viene cachata.

E il tempo non è la rete: è **un sonno di 200 ms per ogni stagione elaborate**, insieme.
`src/utils/rateLimiter.js:39` addormenta **dopo ogni elemento**, non dopo ogni lotto, quindi
con `batchSize: 3` a 3 stagioni in parallelo (`tmdb.js:517` e `:547`) la parete è
`ceil(stagioni/3) × (200 ms + RTM)`: per I Simpson ≈ 13 × 450 ms ≈ 5,9 s, contro i **6.240 ms**
misurati oltre il caldo; per `Bizarre` (6 stagioni, quasi tutte senza overview italiana)
≈ 2 × 450 = 0,9 s + il resto delle chiamate ≈ 2,0 s misurati. Il modello regge.

**Punto esatto del tempo perso:** `src/handlers/metaHandler.js:496` — `await fetchTmdbEpisodes(...)`
è **sulla strada della risposta**: la scheda non parte finché tutte le stagioni non sono
scaricate e rimappate. Le due righe da toccare sarebbero `src/clients/tmdb.js:518-523`
(la chiamata di fallback per stagione) e `src/utils/rateLimiter.js:39` (il sonno per elemento).

## Cosa fare, in ordine di rendita (niente di tutto questo è stato applicato: servono cambi in produzione)

1. **`UserConfig.resolveUserConfig`: una query invece di due, e una cache.** È il 90% di ogni
   risposta, cataloghi compresi. Le due `findOne` sono in sequenza (`UserConfig.js:305,307`) e
   la seconda dipende dalla prima; Atlas è lontano. Il minimo è accorciarle a una
   `aggregate`/`$lookup`, il meglio è tenere la config risolta in RAM con TTL breve e
   invalidazione al salvataggio (il frontend già chiama `/api/configure` quando cambia un
   profilo). Con un solo round trip la risposta scende sotto ~60 ms; con la cache, sotto ~15 ms.
   *Non l'ho fatto perché richiede deploy.*
2. **Non ripetere il fallback di traduzione a ogni ricerca** (`tmdb.js:653`): o si cacha la
   risposta di `en-US`/`original_language` (stessa chiave, TTL breve), o si fa una volta e si
   considera definitivo finché il dettaglio non cambia. Sparirebbero ~450 ms dalla ricerca da
   29 risultati e ~15 chiamate TMDB per ricerca.
3. **Spostare `fetchTmdbEpisodes` fuori dalla strada della risposta** (`metaHandler.js:496`):
   rispondere con la scheda e completare `videos` dopo (SWR), come già fa il ramo `stale`
   (`metaHandler.js:560`). Le 200 ms per stagione (`rateLimiter.js:39`) si possono tagliare
   insieme: TMDB regge ben 50 richieste/s, e il limite serve a lui, non a noi.
4. **Coda lunga della ricerca**: con il punto 2 fatto, la ricerca torna a ~150 ms e il FTS5
   (8,6 ms) smette di essere anche l'unico candidato.

## Cosa NON è il problema (misurato, non stimato)

* `fs.statSync` per poster: 0,008-0,019 ms per file, 0,92 ms per pagina da 100.
* Redis: 0,18 ms per `PING`, 0,22 ms per `GET`, 0 `GET` per ricerca.
* FTS5 su 1.485.985 titoli: 8,6 ms. Nomi imparati: 0,08 ms.
* La cache dei cataloghi: `ms=0-1` in hit. Funziona.
* `ita_annotations.jsonl` (0,82 MB) e lo stato anime: 20 ms **una volta ogni 60 s**, non a ogni richiesta.

## Come riprodurre

```bash
H=ff7084d8-904b-42d9-91f5-ea2b4ae37590
scp ops/timing/bench-http.sh mate:/tmp/ && ssh mate 'bash /tmp/bench-http.sh 7'      # la tabella dei tempi
ssh mate 'docker exec -i -e PROBE_UUID='"$H"' yaca-app node -' < ops/timing/probe-runtime.js   # statSync/Redis/Mongo
ssh mate 'docker exec -i yaca-app node - "the bear" series' < ops/timing/probe-search.js       # FTS5 + cache
ssh mate 'docker exec -i yaca-app node - "$B/$H/catalog/series/yaca_search_standard.json?search=the%20bear" 2 15" < ops/timing/probe-net.js
ssh mate 'docker kill -s USR1 yaca-app' && ssh mate 'docker exec -i yaca-app node --experimental-websocket - <url> 5 > /tmp/p.json' < ops/timing/probe-profile.js
node ops/timing/analyze-profile.js /tmp/p.json ; node ops/timing/analyze-idle.js /tmp/p.json
```

`ops/timing/README.md` spiega ogni strumento. Il profilo si chiude da solo
(`Runtime.evaluate → require('inspector').close()`): l'ispettore era aperto solo sul loopback
del container e per pochi secondi.

### Residuo dichiarato

`require('inspector').close()` **non** chiude un ispettore aperto con `SIGUSR1` (su Node 20 è
un no-op in quel caso): dopo l'ultimo profilo la porta 9229 resta in ascolto **solo sul
loopback del container**, che non è pubblicato in `docker-compose.yml` (dal mate
`curl 127.0.0.1:9229` non risponde, e 9229 non compare fra le porte in ascolto dell'host).
Non è raggiungibile da fuori e non cambia le risposte: prima e dopo il profiling i tempi sono
identici (catalogo caldo 108-110 ms, health 200 in ~1 ms). Si chiude al prossimo riavvio del
container, che è l'unica cosa che servirebbe fare — e che **non** ho fatto per non deployare.

