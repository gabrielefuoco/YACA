Status: needs-triage
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
