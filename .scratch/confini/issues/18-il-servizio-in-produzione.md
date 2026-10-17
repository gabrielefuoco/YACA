Status: ready-for-agent
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
