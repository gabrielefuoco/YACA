Status: resolved
Type: task

# 57 — I poster: da percorso interno a servizio con un contratto

## Perché è un candidato (decisione 32)

Il criterio: **profilo di risorse diverso**. I poster ce l'hanno, e sono già **quasi** un servizio:
- ERDB (l'istanza patchata per i badge `ITA`) è **un'altra immagine**, con un suo tetto di RAM e una sua rete;
- la composizione dei poster è **rete pesante e lenta** (il giro grosso è una passata una tantum da ~2 ore);
- il **drenatore** è già pilotato da un **timer di sistema** (`yaca-poster-eventi.timer`), cioè da fuori dal
  processo dell'app.

Ma il confine è tracciato a metà: il modulo `src/posters/` vive nell'app, e i **poster composti** arrivano all'app
da un **volume** (`yaca_erdb_cache:/data/erdb-cache`), senza contratto né versione. È la stessa forma della rottura
silenziosa trovata il 19/10/2026 sull'artefatto anime: *un volume come interfaccia, e nessuno che verifichi il
formato*.

## Cosa c'è da decidere

1. **Cosa diventa servizio**: il **drenatore** (già quasi: gira da un timer) o **anche la risoluzione/composizione**
   (`src/posters/posterResolver.js`, `src/posters/erdb/build.js`)?
2. **Il contratto**: oggi il confine è «un file in una cartella con un nome concordato» (la convenzione dei nomi
   la produce `scripts/erdb-builder/build.js` e la chiede la rotta `/erdb-poster/:file`: **un nome inventato
   produce poster invisibili, zero errori**). Serve una **versione** e una verifica, come il grafo fa con
   `versioni`.
3. **Chi legge il volume**: l'app continua a servire i file statici, o è il servizio a servirli?
4. **Il drenatore**: resta un timer di sistema (come ora) o diventa un loop del servizio?

## La prova (quando si eseguirà)

- I poster serviti **come prima**: una scheda con poster composto risponde con lo stesso file (byte-a-byte o
  almeno stessa dimensione).
- Il drenatore dal percorso nuovo esce **0** quando ERDB o Redis sono giù (è il contratto già scritto nella unità:
  *«Redis o ERDB giù NON sono un guasto di questa unità»*) e **1** solo quando manca la configurazione.
- La baseline della suite e i due hash del manifest, come per ogni ticket di questa mappa.

## Note

- Nasce da un brainstorming: **va triato** prima di essere eseguibile.
- Il ticket 28 (gli shim) e il 30 (il deploy) hanno già toccato questo terreno: leggere i loro Esiti prima.

## Triage (19/10/2026) — le prove, e due premesse da correggere

**ERDB è davvero un'altra cosa** ✓ — ma non sta nel compose principale: ha un suo deployment in
`ops/erdb-legion/` (README, `compose.yml`, le due patch, `costruisci.js`). Il ticket dice il vero sul profilo.

**La premessa «senza versione» è vecchia.** `posterFileName` (`src/posters/erdb/build.js`) **deriva la versione
da sé** con `calcolaVersionePoster({erdbId, badge})`, e `docs/EPISODE_BADGES.md:123` lo dice: *«da qui deriva la
versione da sé: chi costruisce un nome ottiene quello giusto, e i due lati non possono divergere per
costruzione»*. Il difetto non è l'assenza di versione: è che **nessuno verifica** che il volume contenga ciò che
il nome promette.

**La premessa che rompe il ticket: `src/posters/` non è un modulo ai margini, è dentro la logica dell'app.**
Lo usano `library/ingestion/LibraryConverterService`, `library/ingestion/LibrarySyncService`,
`api/profilo.js`, e `stremio/formatters/StremioFormatter` (che prende `posterFileName` da `erdb/build.js`).
`posterResolver` è una funzione **pura** chiamata dall'ingestione della libreria: spostarla dietro un servizio
vuol dire mettere una chiamata di rete dentro il percorso di ingestione, cioè **rompere** un confine per
crearne un altro.

**Conclusione del triage.** La parte che vale di questo ticket non è la separazione del processo: è il
**contratto sul volume** — la stessa forma della rottura silenziosa dell'artefatto anime. Il drenatore è già
fuori dal processo (timer di sistema), e va bene così.

## Decisione del triage (19/10/2026)

**Scelta: non si separa. Si aggiunge il contratto sul volume.** Il processo resta com'è — il drenatore è già
fuori dal processo dell'app, pilotato da un timer di sistema — e il lavoro diventa:

1. **una versione dichiarata del volume** `yaca_erdb_cache`, come il grafo fa con `versioni`;
2. **una verifica** che dica se il volume contiene ciò che i nomi promettono: oggi un nome che non corrisponde a
   un file produce **un poster invisibile e zero errori**, che è la stessa forma della rottura silenziosa trovata
   sull'artefatto anime.

Separare `posterResolver` e `erdb/build.js` è stato **escluso**: sono funzioni **pure** chiamate dall'ingestione
della libreria e dal formattatore Stremio, e spostarle dietro un servizio metterebbe una chiamata di rete dentro
il percorso di ingestione — rompere un confine per crearne un altro.

## Esito (19/10/2026)

### 1. Il contratto sul volume (`versioni.json`)
Il contratto sul volume `yaca_erdb_cache:/data/erdb-cache` è formalizzato in `src/posters/volumeContract.js`:
- **File di versione sul volume**: `versioni.json`, contenente:
  ```json
  {
    "contratto": 1,
    "schemaVersion": 1,
    "versioni": {
      "disegno": "<BADGE_IMG_VERSION>",
      "convenzione": "calcolaVersionePoster"
    },
    "produttore": "erdb-builder" | "drena-coda-poster",
    "aggiornatoIl": "2026-10-19T..."
  }
  ```
- **Chi scrive**: il generatore del dump offline `scripts/erdb-builder/build.js` (in `run()` dopo `report.json`) e il drenatore `src/posters/drenaCodaPoster.js` (in `gira()` aggiorna `versioni.json` se presente nel volume). La scrittura è atomica (file temporaneo `.tmp` + `rename`).
- **Chi legge**: l'app tramite `leggiVersioniVolume(dir)` e `getStatoVolume(dir)`.

### 2. Dove vive la verifica e osservabilità del caso silenzioso
- In `src/posters/volumeContract.js`:
  - `leggiVersioniVolume(dir)`: valida se il volume esiste e se `versioni.disegno` corrisponde a `BADGE_IMG_VERSION`.
  - `registraRichiestaPoster({ fileName, trovato, cacheDir })`: tiene traccia in memoria di `richieste`, `trovati`, `mancanti` e dei record in `ultimiMancanti` (buffer circolare di 50 elementi). Su `trovato: false`, emette il warning strutturato:
    `[StaticPosters] ANOMALIA: poster richiesto non presente nel volume: <fileName>`
  - `verificaPresenzaPoster(fileName, dir)`: verifica sincrona se il file è fisicamente presente e il volume è allineato.
  - `getStatoVolume(dir)`: stato di salute del volume con flag `ok`, versioni attese, stato del volume e contatori statistici.
  - `volumeObserver`: seam disaccoppiato e patchabile dall'esterno (Decisione 34: la sonda disabilita la verifica dall'istanza per dimostrare il fallimento, senza interruttori nel prodotto).
- In `src/api/staticPosters.js`:
  - `GET /erdb-poster/health`: risponde HTTP 200 con `{ ok: true, contratto: 1, versioni: {...}, volume: {...}, statistiche: {...} }` se il volume è presente e allineato; risponde HTTP 503 se il volume è assente o disallineato.
  - `GET /erdb-poster/versioni`: espone contratto e versioni dichiarate del volume.
  - `GET /erdb-poster/:file`: su cache miss non recuperato da ERDB, chiama `registraRichiestaPoster({ fileName, trovato: false })` prima di reindirizzare a fallback (302) o dare 404: il caso silenzioso adesso genera un'anomalia osservabile. Su hit, registra `trovato: true` e serve i file byte-per-byte identici a prima.

### 3. Sonda QA (`scripts/qa/probe-poster-volume.js`)
Creata la sonda dedicata per collaudare il volume e dimostrare il caso silenzioso.

**Esecuzione normale (`node scripts/qa/probe-poster-volume.js`):**
```
=======================================================
[SONDA QA] Contratto Volume Poster & Verifica Caso Silenzioso (Ticket 57)
Modalità: VERIFICA NORMALE (Verifica Attiva)
=======================================================

--- (a) Materializzazione del volume con versione dichiarata (versioni.json) ---
[Probe] File versioni.json presente: true, valido: true, disegno: 317f3d4a
[Probe] Server HTTP attivo su http://127.0.0.1:62167
[Probe] /erdb-poster/health status: 200, ok: true, contratto: 1

--- (b) Servire un file presente nel volume (invarianza) ---
[Probe] Richiesta "tmdb-movie-27205-460b8042_ITA.jpg": HTTP 200, trovati: 1, mancanti: 0

--- (c) Caso critico: richiesta di un nome che non corrisponde a nessun file ---
[StaticPosters] ANOMALIA: poster richiesto non presente nel volume: tmdb-movie-9999999-deadbeef_ITA.jpg
[Probe] Richiesta "tmdb-movie-9999999-deadbeef_ITA.jpg": HTTP 302 (redirect verso fallback: https://image.tmdb.org/t/p/w500/fallback-sample.jpg)
[Probe] Statistiche post-richiesta: mancanti=1, logANOMALIA=EMESSO
[Probe] /erdb-poster/health dopo miss: mancanti=1

=======================================================
[Probe] SUCCESSO:
  - Il nome richiesto che non corrisponde a nessun file (tmdb-movie-9999999-deadbeef_ITA.jpg) è stato rilevato.
  - Log strutturato emesso e intercettato.
  - Contatore anomalie incrementato a 1.
  - File registrato in ultimiMancanti.
  - Endpoint /erdb-poster/health allineato.
Esito Sonda: SUCCESSO (exit code 0)
=======================================================
```

**Esecuzione con verifica disabilitata (`node scripts/qa/probe-poster-volume.js --disable-verification`):**
```
=======================================================
[SONDA QA] Contratto Volume Poster & Verifica Caso Silenzioso (Ticket 57)
Modalità: DIMOSTRAZIONE FALLIMENTO (Verifica Disattivata)
=======================================================

--- (a) Materializzazione del volume con versione dichiarata (versioni.json) ---
[Probe] File versioni.json presente: true, valido: true, disegno: 317f3d4a
[Probe] Server HTTP attivo su http://127.0.0.1:62170
[Probe] /erdb-poster/health status: 200, ok: true, contratto: 1

--- (b) Servire un file presente nel volume (invarianza) ---
[Probe] Richiesta "tmdb-movie-27205-460b8042_ITA.jpg": HTTP 200, trovati: 1, mancanti: 0

--- (c) Caso critico: richiesta di un nome che non corrisponde a nessun file ---
[Probe] Observer disabilitato tramite patch esterna della sonda.
[Probe] Richiesta "tmdb-movie-9999999-deadbeef_ITA.jpg": HTTP 302 (redirect verso fallback: https://image.tmdb.org/t/p/w500/fallback-sample.jpg)
[Probe] Statistiche post-richiesta: mancanti=0, logANOMALIA=NON EMESSO

=======================================================
[Probe] ANOMALIA DIMOSTRATA CON SUCCESSO:
  - Con verifica disabilitata, la richiesta di "tmdb-movie-9999999-deadbeef_ITA.jpg" è passata in totale silenzio.
  - Mancanti contati: 0
  - Nessun log di anomalia emesso.
  - Il volume non conteneva ciò che il nome prometteva, e nessuno se ne è accorto.
Esito Sonda: FALLIMENTO DIMOSTRATIVO ACCERTATO (exit code 1)
=======================================================
```

### 4. Contratto del drenatore verificato
- Manca configurazione (`node scripts/drena-coda-poster.js`): esce **1** con messaggio `CONFIGURAZIONE: manca la base dell'istanza ERDB locale`.
- Redis giù (`node scripts/drena-coda-poster.js --base http://127.0.0.1:9999/Tk-fake --attesa-redis=500`): esce **0** con messaggio `[Drena] Redis NON pronto dopo 500 ms: questo giro NON ha drenato niente (...) Nessun file scritto e nessun allarme: il timer riproverà al giro dopo.`

### 5. Invarianza manifest e Sonda Eroi
- Manifest SHA256:
  - `buildManifest({})`: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (invariato)
  - `buildRootManifest()`: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (invariato)
- Sonda Eroi (`node scripts/qa/probe-hero-counts.js --fixture`):
  - Film : 9 titoli (Disgiunti: true)
  - Serie: 9 titoli (Disgiunti: true)

### 6. Totali Suite e Lista FAIL
Comando: `npx jest --forceExit`
Totale suite: `Test Suites: 5 failed, 185 passed, 190 total`
Totale test: `Tests: 8 failed, 1 skipped, 1898 passed, 1907 total`

Lista FAIL (esattamente le sole 5 suite preesistenti dovute all'assenza di parquet locali):
- `FAIL tests/presetBurtonOrdering.test.js`
- `FAIL tests/animeOverridesCertify.test.js`
- `FAIL tests/donghuaCatalog.test.js`
- `FAIL tests/candidateProvider.test.js`
- `FAIL tests/duckDbAndMatchmaker.test.js`

### 7. Cosa NON è stato fatto
- `posterResolver` ed `erdb/build.js` NON sono stati spostati dietro un servizio di rete (scelta esclusa dal triage per evitare overhead e rotture nel percorso di ingestione).
- Non sono stati toccati `docker-compose.yml`, `Dockerfile`, `.github/workflows/**`, `docs/DEPLOYMENT_HOME_SERVER.md`.
- Non sono stati modificati `frontend/**`, `src/indice/**`, `services/**`.
- Nessun flag di test (`simulate*`) aggiunto al codice di produzione (Decisione 34).
- Nessun `git push`, nessun `npm run build` o `tsc`.

---

**Chiusura (19/10/2026, integratore).** Verificato e integrato in `98c1f24`. Suite **5 rosse / 8 test / 1898 verdi** (190 suite: +11 test, +1 suite), nessuna regressione, entrambi gli hash del manifest invariati, sonda verde e **fallisce con `--disable-verification`** (exit 1) — un guardiano vero.

Verificato da me: le rotte `health` e `versioni` sono registrate **prima** di `/erdb-poster/:file`, quindi non vengono ombreggiate; il seam è un **oggetto patchabile dall'esterno**, non un flag nel prodotto (decisione 34 rispettata).

**Smell dichiarato, non bloccante**: `leggiVersioniVolume` ripete sei ritorni quasi identici (la forma completa dello stato per ogni modo di fallimento). È verboso, non sbagliato: se cresce ancora, si estrae un costruttore di stato.

**Al primo avvio in produzione** `/erdb-poster/health` risponderà **503** finché il volume non contiene `versioni.json` — è il segnale onesto che il volume non dichiara ancora la sua convenzione. Il prossimo giro del drenatore o del builder lo scrive.
