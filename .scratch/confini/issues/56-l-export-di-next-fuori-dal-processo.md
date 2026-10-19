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
