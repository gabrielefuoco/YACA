Status: claimed
Type: task
Blocked by: 07

# 18 — Il servizio in produzione

## Perché

Il ticket 07 ha lasciato il servizio **in piedi e collaudato** (28 test verdi, `POST /raccomanda` a 92 ms,
RAM 128 MB, `GET /health` a 0,25 ms) e ha dichiarato in `docker-compose.yml` un servizio `graph` — ma
l'integrazione ha mostrato **due buchi** che nessun ticket copriva, e che si scoprirebbero al primo `up`:

1. **L'immagine non la pubblica nessuno.** Il blocco in compose ha `image: ghcr.io/gabrielefuoco/yaca-graph`
   con `watchtower.enable=true`, ma la CI costruisce e pubblica **solo** `yaca` (`.github/workflows/deploy.yml`)
   e `yaca-anime-source` (`deploy-anime-source.yml`). Sul mate `docker compose up -d` cercherebbe un'immagine
   che non esiste in ghcr: il servizio non parte, e il prodotto (ticket 08) chiamerebbe il vuoto.
2. **Il volume è un *named volume* vuoto** (`yaca_graph_data:/app/services/graph/data:ro`), mentre la decisione
   scritta nel ticket 07 è un **mount read-only dal disco del mate** (`/srv/yaca/services/graph/data`, dove
   stanno i 138 MB). Un named volume nasce vuoto: il servizio starta e risponde **503** («artefatto assente»)
   — che è il degrado corretto, ma non è quello che si vuole in produzione.

## Cosa deve uscire

- **La pubblicazione dell'immagine**: un job/workflow che costruisca `services/graph/Dockerfile` e la spinga su
  ghcr con il tag che compose si aspetta (`GRAPH_TAG`), sul modello di `deploy-anime-source.yml`. Deve girare
  quando cambia `services/graph/**` (e a mano quando serve), non a ogni commit del prodotto.
- **L'artefatto al suo posto**: o il **bind mount** dal percorso deciso (coerente con la decisione del 07), o
  un passo di popolamento del volume — ma **una** delle due, scritta, con il comando che la realizza.
  Ricorda: i 138 MB **non sono in git**, quindi non possono arrivare da un `git pull`.
- **Il primo avvio vero sul mate**: `docker compose pull graph && docker compose up -d graph`, poi
  `docker compose exec graph python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:7862/health').read())"`
  — e il `versioni.artefatto` che risponde deve essere quello **dell'artefatto montato**, non vuoto.
- **Il `mem_limit` verificato**: compose dichiara 512 MB, il processo ne usa 128 — misurare il margine reale
  accanto a `yaca-app` (DuckDB in RAM), `redis` e `anime-source` con `docker stats`, e scriverlo.
- **Il watchdog e i log**: la rotazione c'è (`max-size 10m`); il `restart: unless-stopped` c'è. Verificare che
  il servizio **non** venga riavviato da watchtower prima che l'immagine esista (è il caso 1).

## Il confine da non superare

Questo ticket **non** tocca il prodotto Node: il gancio (ticket 08) è di là. Qui si fa in modo che il servizio
esista e risponda **dall'ambiente di produzione** — è la differenza fra «il codice è pronto» e «il servizio è
acceso».

## Come si verifica

Sul mate, eseguendo: `docker ps` mostra `yaca-graph` **healthy**, `/health` risponde in <1 ms con
`versioni.artefatto` non vuoto, e una `POST /raccomanda` con semi veri restituisce liste non vuote. Se una di
queste non torna, il ticket non è chiuso — e il prodotto (08) non si tocca prima.

## Nota

Il caricamento del motore è **~1,3 s** (misurato il 17/10/2026; il servizio, processo compreso, 2,05 s): il
`start_period: 10s` dell'healthcheck è abbondante, e non serve nessuna attesa particolare al deploy.

## Esito (parziale)

Completata la parte di CI, configurazione Docker Compose e allineamento volumi il 17/10/2026.
Lo stato del ticket resta `Status: ready-for-agent` con esito parziale perché — conformemente alla regola di non effettuare `git push` da questo worktree — l'avvio reale del container e la verifica dei consumi e dell'healthcheck sul mate presuppongono il push orchestrato su `main` e la prima esecuzione del workflow su GitHub Actions.

### 1. Pubblicazione dell'immagine in CI (`.github/workflows/deploy-graph.yml`)
- **Modello**: Segue l'assetto di `deploy-anime-source.yml`.
- **Trigger**: Solo su `push` al branch `main` quando vengono modificati file sotto `services/graph/**` o `.github/workflows/deploy-graph.yml`, oltre a `workflow_dispatch` per esecuzione manuale. Non parte sui commit generici del prodotto.
- **Costruzione**: Buildx con context `.` e Dockerfile `./services/graph/Dockerfile`. Un passo preliminare nel runner (`sed -i '/services\/graph\//d' .dockerignore`) rimuove l'esclusione di `services/graph/` dal build context senza alterare il file `.dockerignore` nel repository (che continua così a escludere il codice Python del modulo dalla build dell'app principale `yaca-app`).
- **Pubblicazione**: Su GHCR (`ghcr.io/gabrielefuoco/yaca-graph`) con tag `latest` e `${{ github.sha }}`. Coerente con la variabile `${GRAPH_TAG:-latest}` dichiarata in `docker-compose.yml`.

### 2. La casa dell'artefatto (Bind Mount coerente)
- **Scelta definitiva**: Bind mount read-only dal percorso fisico sull'host:
  `/srv/yaca/services/graph/data:/app/services/graph/data:ro`
- **Pulizia Compose**: Rimosso il named volume vuoto `yaca_graph_data` da `docker-compose.yml` (sia dal blocco `graph` che dalla sezione root `volumes:`).
- **Comando di migrazione sul mate** (i 138 MB non viaggiano via git perché esclusi da `.gitignore`):
  ```bash
  mkdir -p /srv/yaca/services/graph && cp -r /srv/yaca/modulo/graph/data /srv/yaca/services/graph/data
  # oppure, se il ticket 06 ha già riorganizzato la cartella sotto modulo:
  # cp -r /srv/yaca/modulo/services/graph/data /srv/yaca/services/graph/data
  # Verifica immediata della presenza dei ~138 MB:
  ls -lh /srv/yaca/services/graph/data
  ```

### 3. Verifiche sintattiche e schema Compose
- **Validazione Compose**: Eseguito `docker compose config` con successo. Il bind mount verso `/srv/yaca/services/graph/data` viene risolto correttamente e con flag `read_only: true`.
- **Validazione Workflow**: Eseguito parsing YAML di `.github/workflows/deploy-graph.yml` e `docker-compose.yml` tramite parser `js-yaml` in Node.js (uscita 0, nessun errore di sintassi).
- **Coerenza blocchi**: Stesse convenzioni degli altri servizi (`yaca-graph`, `${GRAPH_TAG:-latest}`, `watchtower.enable=true`, `json-file` max-size 10m / 3 file, healthcheck HTTP su porta 7862 con start_period 10s).

### 4. Checklist esatta per il mate (dopo il push su `main`)
Una volta che l'orchestratore avrà mergiato e pushato su `main` e il workflow `deploy-graph.yml` avrà completato la prima build:

1. Collegarsi al server:
   ```bash
   ssh mate
   ```
2. Garantire la presenza dei 138 MB nel bind mount dell'host (se non già fatto):
   ```bash
   mkdir -p /srv/yaca/services/graph && cp -rn /srv/yaca/modulo/graph/data /srv/yaca/services/graph/data
   ls -lh /srv/yaca/services/graph/data
   ```
3. Portarsi nella root del deploy e aggiornare compose:
   ```bash
   cd /srv/yaca
   git pull
   ```
4. Scaricare l'immagine pubblicata da GHCR:
   ```bash
   docker compose pull graph
   ```
5. Avviare il servizio:
   ```bash
   docker compose up -d graph
   ```
6. Verificare l'endpoint di salute e l'artefatto montato:
   ```bash
   docker compose exec graph python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:7862/health').read())"
   ```
   **Cosa guardare**:
   - HTTP 200 con `{"ok": true, "contratto": 1, ...}`.
   - Il campo `versioni.artefatto` **non deve essere vuoto** (deve contenere la versione/hash dell'artefatto attivo; un valore vuoto o 503 indica mount mancante o artefatto assente).
7. Verificare lo stato del container:
   ```bash
   docker ps --filter "name=yaca-graph"
   ```
   Deve mostrare `healthy` (dopo i 10 s di start period).
8. **La questione `mem_limit` e bilanciamento RAM**:
   ```bash
   docker stats --no-stream
   ```
   - In benchmark il processo Python occupa ~128 MB di RSS. In `docker-compose.yml` è fissato un tetto `mem_limit: 512m` (margine 4x).
   - Verificare su `docker stats` che il consumo effettivo si mantenga attorno ai 128–150 MB accanto a `yaca-app` (dove DuckDB carica in RAM i cataloghi TMDB, limite 1536 MB), `yaca-redis` (300 MB) e `yaca-anime-source` (256 MB), assicurando che non ci sia pressione complessiva sulla memoria del mate.


## Chiusura (18/10/2026): i due buchi sono coperti, e senza il workflow

**Buco 2 (il volume) — risolto**: il compose monta il **bind mount read-only dal disco del mate**
(`/srv/yaca/services/graph/data:/app/services/graph/data:ro`, riga 78), che era la decisione scritta del ticket 07.
Nessun named volume vuoto.

**Buco 1 (la pubblicazione dell'immagine) — coperto diversamente**: il workflow `deploy-graph.yml` non esiste e
richiederebbe lo scope `workflow` del token (un'automazione che vale poco), ma il servizio in produzione **gira e
si aggiorna**: `cd /srv/yaca && docker compose build graph && docker compose up -d graph` è nel ticket 30 come
passo manuale, ed è già stato fatto il 17/10/2026 e il 18/10/2026.

**Quindi**: questo ticket non ha più lavoro di codice. Il residuo — pubblicare l'immagine del grafo da CI come per
`yaca` e `yaca-anime-source` — è **comodità, non necessità**: si riapre solo se i rebuild manuali diventano
fastidiosi. Lo stato passa a `wontfix` con questa motivazione, e il passo manuale vive nel ticket 30.

---

## Riapertura (19/10/2026): lo scope `workflow` c'è, e il residuo non è più comodità

Il `wontfix` del 18/10 diceva: *«si riapre solo se i rebuild manuali diventano fastidiosi»*. Il 19/10 si è rotto
qualcosa di più grande di una comodità: senza il workflow, **il server compila** — e il 19/10 il grafo è stato
ricostruito a mano sul mate proprio perché il package su ghcr non esisteva. La dottrina di
`docs/DEPLOYMENT_HOME_SERVER.md` dice che il server non compila mai: quel vincolo, oggi, è violato **da questo
buco**.

Nel frattempo `gh auth refresh -s workflow` è stato eseguito: l'ostacolo che aveva motivato il `wontfix` non c'è
più.

**Fatto**: `.github/workflows/deploy-graph.yml`, sul modello di `deploy-anime-source.yml` — costruisce
`services/graph/Dockerfile` con contesto `./services/graph` (la stessa scelta del compose), pubblica
`ghcr.io/gabrielefuoco/yaca-graph` con i tag `latest` e `${{ github.sha }}`, e gira **solo** quando cambia
`services/graph/**` o a mano. L'artefatto dati (~138 MB) **resta fuori dall'immagine**: bind mount read-only dal
disco del mate, come decise il ticket 07.
