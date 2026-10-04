# ops/timing — come sono state prese le misure

Tutto quello che c'è qui misura il tempo di risposta **da fuori** e **dentro** il
container, senza toccare il codice in produzione. Nessuno script scrive nel checkout
principale né modifica i dati; i probe dentro il container viaggiano su **stdin**
(`docker exec -i ... node -`) per non lasciare file nel filesystem di produzione.

## Matrice degli strumenti

| script | gira dove | cosa misura | scrive in produzione |
|---|---|---|---|
| `bench-http.sh` | host mate | tempo HTTP per endpoint (mediana/min/max) | no |
| `bench-search.sh` | host mate | ricerca: fredda vs calda, quante card hanno la descrizione | no (riscalda le cache, come una richiesta qualsiasi) |
| `bench-meta.sh` | host mate | scheda a freddo: 1ª vs 2ª richiesta, stagioni/episodi, peso della voce Redis | idem |
| `bench-io.sh` | host mate + container | byte di rete per richiesta (`/proc/net/dev`) | no |
| `probe-runtime.js` | container (stdin) | `fs.statSync` sui poster, PING/GET Redis, `findOne` Mongo reali | solo letture |
| `probe-search.js` | container (stdin) | FTS5 del Tier 2, nomi imparati, GET dei dettagli in cache | solo letture (SQLite in sola lettura) |
| `probe-missing.js` | container (stdin) | quali titoli del Tier 2 non finiscono in cache | solo letture |
| `probe-net.js` | container (stdin) | connessioni TCP aperte durante una richiesta (`/proc/net/tcp`) | no |
| `probe-profile.js` | container (stdin) | profilo CPU V8 del processo **mentre serve una richiesta vera** | no (ispettore chiuso a fine misura) |
| `analyze-profile.js` | locale | tempo proprio/totale per funzione da un `.cpuprofile` | no |
| `analyze-paths.js` | locale | chi chiama axios: il cammino più pesante che passa da un modulo | no |
| `analyze-idle.js` | locale | **a cosa sta aspettando** il main thread, per ultima funzione eseguita | no |

## Istruzioni

```bash
H=ff7084d8-904b-42d9-91f5-ea2b4ae37590        # handle di prova

# 1. tempi HTTP (dal mate, via ssh)
scp ops/timing/bench-http.sh mate:/tmp/ && ssh mate 'bash /tmp/bench-http.sh 7'

# 2. fasi runtime dentro il container (nessun file scritto: tutto via stdin)
scp ops/timing/probe-runtime.js mate:/tmp/
ssh mate 'docker exec -i -e PROBE_UUID='"$H"' yaca-app node -' < ops/timing/probe-runtime.js

# 3. profilo CPU del processo reale
ssh mate 'docker kill -s USR1 yaca-app'                       # apre l'ispettore su 127.0.0.1:9229 (solo interno al container)
ssh mate 'docker exec -i yaca-app node --experimental-websocket - "http://127.0.0.1:7860/'"$H"'/catalog/movie/yaca_preset_preset_top_rated_movies.json" 5 > /tmp/prof.json' < ops/timing/probe-profile.js
scp mate:/tmp/prof.json ./prof.json
node ops/timing/analyze-profile.js ./prof.json
node ops/timing/analyze-idle.js ./prof.json
# il probe chiude l'ispettore da solo (Runtime.evaluate -> require('inspector').close())
```

## Nota sul profilo

`kill -USR1` apre l'ispettore V8 **soltanto sul loopback del container** (la porta 9229
non è pubblicata in `docker-compose.yml`), non tocca codice né dati, e `probe-profile.js`
prova a chiuderlo a fine misura. **Attenzione**: su Node 20 `require('inspector').close()`
NON chiude un ispettore avviato da `SIGUSR1`, quindi la 9229 resta in ascolto dentro il
container fino al prossimo riavvio. È innocua (non è raggiungibile dall'host e non cambia i
tempi di risposta, verificato prima/dopo), ma va saputa.
