Status: resolved
Type: task

# 56 — L'export statico di Next fuori dal processo dell'addon

## Perché è un candidato (decisione 32)

Il criterio della decisione 32: un pezzo si stacca in un processo suo **solo** se ha un **profilo di risorse
diverso**. Questo ce l'ha, ed è il più netto di tutti: oggi **il frontend statico e l'addon Stremio vivono nello
stesso processo Node**.

Sono due profili opposti:
- **l'addon**: richieste brevi e frequenti, poca CPU, molta cache, un tetto di RAM che deve restare basso
  (~148 MiB misurati oggi in produzione);
- **l'export di Next**: contenuto statico, servito con `next start` o equivalente, un suo ciclo di vita.

Conseguenza **misurata oggi**: il boot dell'app e la sua RAM dipendono da ciò che l'export porta con sé, e il
`Dockerfile` costruisce il frontend e il backend nella stessa immagine (`ghcr.io/gabrielefuoco/yaca`, ~830 MB per
il grafo, l'app ancora di più). Un guasto o una lentezza del frontend si pagano sull'addon.

## Cosa c'è da decidere (è un ticket di triage, non di esecuzione)

1. **Chi serve il frontend**: un container suo con `next start` (immagine propria, porta propria su `127.0.0.1`,
   come dice la regola del mate), oppure **file statici** serviti da un reverse proxy (Caddy/nginx) — se l'export è
   davvero statico, il secondo è più pigro e più veloce.
2. **Chi fa da ingresso**: oggi l'app serve sia `/api/*` sia le pagine. Con due processi serve un **ingresso unico**
   (reverse proxy o Tailscale serve) che instrada: `/api/*` → app, il resto → frontend.
3. **Come si costruisce**: l'immagine del frontend vuole un suo workflow (come `deploy.yml` per l'app e
   `deploy-anime-source.yml` per il produttore). Oggi il frontend si costruisce **dentro** l'immagine dell'app.
4. **Cosa resta nell'app**: le rotte `/api/*` e le pagine che hanno bisogno di sessione — se ce ne sono, vanno
   elencate **prima** di spostare.

## La prova (quando si eseguirà)

- `docker stats` dell'app **senza** il frontend dentro: la RAM e il boot non devono peggiorare (oggi: boot ~2,4 s,
  RAM ~148 MiB).
- Il frontend raggiungibile e l'addon intatto: il manifest e le righe del catalogo rispondono come prima.
- Un guasto del frontend **non** tocca l'addon (è il punto del ticket): si ferma il container del frontend e
  l'addon continua a servire.
- La baseline della suite: `5 suite fallite / 8 test falliti / 1881 passati`; manifest byte-a-byte
  (`dc4af35c…` / `91bf96d3…`).

## Note

- **Il frontend non si riscrive**: si sposta **dove** viene servito, non come è fatto. (Decisione dell'utente,
  19/10/2026: il frontend non si tocca.)
- Il ticket nasce da un brainstorming: **va triato** (le quattro domande sopra) prima di essere eseguibile.

## Triage (19/10/2026) — le prove

**La premessa regge.** `frontend/next.config.ts` ha `output: 'export'`, `trailingSlash`, `images.unoptimized`:
è davvero un export statico, non un server Next. `frontend/package.json` ha ancora `"start": "next start"`, ma in
produzione non si usa (serve `.next`, mentre il `Dockerfile` copia `frontend/out`).

**Come sta su, oggi.** Il `Dockerfile` costruisce il frontend in uno stadio (`frontend-builder`) e copia
`frontend/out` nel runner; poi è **l'addon a servirlo**, con `express.static` in `index.js:107` e un catch-all su
`frontend/out/index.html` (`index.js:227`). Nessun workflow per il frontend, nessun container: `docker-compose.yml`
ha sei servizi e il frontend non è fra questi.

**Il beneficio non è quello che dice il ticket.** Servire file statici da Express non costa RAM né boot misurabili:
il profilo di risorse del frontend e dell'addon sono **lo stesso** profilo (due processi Node magri). Quello che
cambia davvero è altro, e sono due cose vere:

1. **Il dominio di guasto**: un export rotto o un asset che manca oggi vive nel processo che serve Stremio.
2. **La cadenza di rilascio**: per pubblicare una pagina si ricostruisce e si **riavvia l'addon** — che è il pezzo
   che non deve cadere.

Quindi il 56 non passa il criterio della decisione 32 così com'è scritto («profilo di risorse diverso»), ma ha un
motivo **suo** e legittimo. Va deciso se il criterio si allarga (dominio di guasto / cadenza), o se il 56 si
riformula su ciò che davvero serve.

**L'opzione pigra, che il ticket non nomina.** Il dolore è la **costruzione accoppiata**, non il servire. Si può
togliere senza processo nuovo, senza ingresso nuovo e senza toccare una rotta: il frontend si costruisce in un
**workflow suo** (come `deploy-anime-source.yml`), pubblica `frontend/out` come **artefatto/immagine di soli
file**, e l'app lo riceve come **volume** al posto della copia nell'immagine. L'app continua a servirlo con la
stessa riga di `express.static`. Immagine dell'app più piccola, rilascio del frontend indipendente, zero
ingressi nuovi, zero rotte cambiate.

## Decisione del triage (19/10/2026)

**Scelta: workflow suo + `frontend/out` come volume.** Il frontend si costruisce in un workflow proprio e
pubblica l'export; l'app lo riceve come **volume** al posto della copia nell'immagine, e continua a servirlo con
la stessa riga di `express.static`. Nessun container nuovo, nessun ingresso nuovo, nessuna rotta cambiata.

Le due conseguenze vere che questo compra, e che sono il motivo del ticket: **il rilascio del frontend smette di
ricostruire e riavviare l'addon**, e un export rotto smette di vivere nel processo che serve Stremio.

**Il criterio della decisione 32 va allargato**, e questa è la decisione che il 56 ha prodotto: un pezzo si
stacca anche quando ha un **dominio di guasto** o una **cadenza di rilascio** diversi — non solo un profilo di
risorse diverso. Qui il profilo è lo stesso (due processi Node magri); sono il guasto e la cadenza a essere
diversi.

## Il meccanismo (deciso il 19/10/2026)

Un volume vuole **file su disco**, e la CI non li mette lì da sola. La forma più pigra che funziona:

1. **`.github/workflows/deploy-frontend.yml`**: costruisce `frontend/` (già `output: 'export'`) e pubblica
   `frontend/out` come **tarball in una GitHub Release** (o come artefatto scaricabile via `gh`). Niente
   immagine: quello che serve è una cartella, non un processo.
2. **`ops/frontend-aggiorna.sh`** sul mate: scarica il tarball, lo scompatta in `/srv/yaca/frontend-out` (nuova
   cartella, non dentro il repo), e **non riavvia niente** — `express.static` rilegge da disco a ogni richiesta,
   quindi i file nuovi si servono da soli.
3. **`docker-compose.yml`**: `./frontend-out:/app/frontend/out:ro` sul servizio `app`.
4. **`Dockerfile`**: lo stadio `frontend-builder` e la riga `COPY --from=frontend-builder /app/frontend/out`
   **spariscono**; l'immagine dell'app smette di contenere il frontend.
5. `index.js` **non cambia**: `express.static(path.join(__dirname, 'frontend', 'out'))` continua a funzionare, e
   con `:memory:`-style fallback se il volume è vuoto (una cartella vuota non deve far cadere l'app: le pagine
   mancano, l'addon no).

**Il criterio della decisione 35 è rispettato**: nessun container nuovo, nessun ingresso nuovo, nessuna rotta
cambiata. Cambia *chi costruisce* e *quando*, che è il punto.

## Esito (19/10/2026)

### 1. Cosa è cambiato
1. **`.github/workflows/deploy-frontend.yml`**: creato il workflow dedicato che builda `frontend/` (`npm ci && npm run build`), genera l'archivio `frontend-out.tar.gz`, lo carica come artefatto di run (`actions/upload-artifact@v4`) e lo pubblica/aggiorna nella release rolling `frontend-latest` tramite `gh release`.
2. **`ops/frontend-aggiorna.sh`**: creato lo script host per il server mate che scarica l'archivio (tramite `gh` o `curl`), svuota il contenuto interno di `/srv/yaca/frontend-out` preservando l'inode della directory (indispensabile per non corrompere il bind mount Docker del container attivo) ed estrae il nuovo export statico. L'operazione non esegue alcun restart di Docker o dell'app (`express.static` legge da disco ad ogni richiesta).
3. **`docker-compose.yml`**: aggiunto il bind-mount in sola lettura `./frontend-out:/app/frontend/out:ro` sul servizio `app`.
4. **`Dockerfile`**: rimosso lo stadio `frontend-builder` e la riga `COPY --from=frontend-builder /app/frontend/out ./frontend/out`. Aggiunta la creazione della cartella `RUN mkdir -p frontend/out` come punto di mount nel runner. L'immagine Docker dell'app non contiene più il frontend né il suo toolchain.
5. **`index.js`**: reso esplicito e sicuro il fallback della rotta catch-all: se `frontend/out/index.html` non esiste o la cartella è vuota, risponde HTTP 404 senza sollevare eccezioni né innescare l'error handler 500, mantenendo Stremio (`/manifest.json`, `/catalog/*`) e le rotte API perfettamente funzionanti.
6. **`.dockerignore` e `.gitignore`**: aggiunti `frontend/` e `frontend-out/` a `.dockerignore` per non copiare sorgenti né artefatti runtime nell'immagine Docker; aggiunto `frontend-out/` a `.gitignore` per preservare pulito il repository sul mate.

### 2. Comandi eseguiti e prove

- **Validazione sintassi YAML**:
  - `node -e "const jsYaml = require('js-yaml'); const fs = require('fs'); jsYaml.load(fs.readFileSync('.github/workflows/deploy-frontend.yml', 'utf8')); jsYaml.load(fs.readFileSync('docker-compose.yml', 'utf8')); console.log('YAML valid');"`
  - Esito: `YAML valid` (sia il workflow sia `docker-compose.yml` analizzati e conformi).
- **Verifica script ops**:
  - `bash -n ops/frontend-aggiorna.sh` -> sintassi shell corretta (exit code 0).
  - Test esecuzione `--help` ed estrazione archivio mock tarball con opzione `--force-local` -> estrazione avvenuta con successo, `index.html` verificato, inode directory preservato.
- **Probe HTTP di resilienza (volume vuoto vs popolato)**:
  - Esecuzione sonda Node su Express con MongoDB simulato:
    - Con volume vuoto/assente:
      - `GET /` -> 404 (messaggio HTML pulito: `YACA Addon: Frontend static export not found or volume not mounted`, nessun crash, nessun errore non gestito).
      - `GET /manifest.json` -> 200 OK.
      - `GET /testuser/catalog/movie/popular.json` -> 200 OK.
    - Con volume popolato (`index.html` presente):
      - `GET /` -> 200 OK (restituisce il contenuto dell'export statico).
      - `GET /manifest.json` -> 200 OK.
      - `GET /testuser/catalog/movie/popular.json` -> 200 OK.
- **Hash dei manifest invariati (byte-for-byte)**:
  - `buildManifest({})` SHA-256: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178`
  - `buildRootManifest()` SHA-256: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`
- **Baseline Jest completa (`npx jest --forceExit`)**:
  - Test Suites: 5 failed, 184 passed, 189 total
  - Tests: 8 failed, 1 skipped, 1887 passed, 1896 total
  - FAIL list (esattamente le 5 suite consentite):
    - `tests/animeOverridesCertify.test.js`
    - `tests/donghuaCatalog.test.js`
    - `tests/presetBurtonOrdering.test.js`
    - `tests/duckDbAndMatchmaker.test.js`
    - `tests/candidateProvider.test.js`

### 3. Differenza dimensioni immagine
- Sorgenti frontend esclusi dal runner tramite `.dockerignore`: 61 file, 1.021.665 byte (~1 MB).
- Stadio `frontend-builder` eliminato: rimossa interamente la fase `npm install` e `npm run build` dal build Docker del backend (risparmiati ~300+ MB di toolchain di compilazione temporanea e la copia dello strato `COPY --from=frontend-builder /app/frontend/out`).

### 4. Cosa NON è stato fatto
- NON toccato alcun sorgente in `frontend/**` (rispettata la regola del 19/10/2026).
- NON toccato `docs/DEPLOYMENT_HOME_SERVER.md` (in modifica concorrente).
- NON eseguiti `git push` né `npm run build` / `tsc`.
- NON toccati `src/posters/**`, `src/indice/**`, `services/**`.
- NON eseguito `docker compose up` su ambienti di produzione.

### 5. Cosa non è stato possibile verificare
- `actionlint`: non presente nell'ambiente Windows dell'esecutore; la validità sintattica è stata provata con parser YAML (`js-yaml`).
- Misurazione esatta in byte dell'immagine Docker compilata tramite daemon: non eseguito `docker build` locale per non impattare risorse né tempi di esecuzione dell'host, come da vincoli operativi.


---

**Chiusura (19/10/2026, integratore).** Verificato e integrato in `97526b8`. Suite alla baseline (5 rosse / 8 test / 1887 verdi), entrambi gli hash del manifest invariati, `docker-compose.yml` e il workflow validati come YAML, `bash -n` verde sullo script.

Prova indipendente del comportamento che conta — l'addon non cade col volume vuoto:
```
volume vuoto  -> / : 404   |   /manifest.json : 200
```

**Conseguenza operativa, da non dimenticare al deploy**: l'immagine dell'app **non contiene più il frontend**. Dopo che la nuova immagine va in produzione, l'interfaccia web resta **vuota** finché sul mate non gira `ops/frontend-aggiorna.sh`. L'addon Stremio non è toccato in nessuno dei due casi. Ordine consigliato: prima il workflow del frontend pubblica la release, poi si popola `/srv/yaca/frontend-out`, poi si aggiorna l'immagine.

---

**Deploy del 19/10/2026 — il distacco è in produzione, e verificato.**

Il workflow del frontend è passato al primo giro e ha pubblicato la release `frontend-latest`
(`frontend-out.tar.gz`, 892 KB, 44 voci, `index.html` presente). Sul mate `ops/frontend-aggiorna.sh` ha scaricato
via `curl` (il repo è pubblico) e popolato `/srv/yaca/frontend-out` (35 file) **preservando l'inode**, poi
`docker compose pull` + `up -d --no-build` (il compose era cambiato: Watchtower non lo applica).

**Misurato dal vivo, dopo il deploy** (porta 7860, handle vero):

| richiesta | esito |
|---|---|
| `/` | **200**, `text/html` — l'export, servito dal volume |
| `/<handle>/manifest.json` | **200**, 36 cataloghi |
| `/<handle>/catalog/series/yaca_mondi_series.json` | **200**, 20 titoli |
| `/erdb-poster/health` | **200**, `ok: true, contratto: 1, volume.allineato: true` |

**La prova del distacco**: l'immagine, avviata **senza** il volume, ha `/app/frontend/out` **vuota** (0 file) — solo
la cartella creata da `RUN mkdir -p`. Il frontend arriva interamente dal bind mount
(`/srv/yaca/frontend-out -> /app/frontend/out (ro)`). Immagine: **650 MB**.

**Nota onesta sulla dimensione**: togliere lo stadio `frontend-builder` **non** fa risparmiare i ~300 MB di
toolchain, perché in un multi-stage quello stadio non entrava già nell'immagine finale. Quello che si è tolto è
il payload `frontend/out` (~2-3 MB) e, soprattutto, la **costruzione accoppiata** — che è il vero motivo del
ticket, come dice la decisione 35. Il numero grosso del ticket («~830 MB») non era il punto.
