Status: resolved
Type: task
Blocked by: 23

# 24 — Un artefatto solo: il frontend dentro l'immagine dell'app

## Il fatto (20/10/2026)

YACA si deploya in tre pezzi, e due si aggiornano da soli (Watchtower guarda le immagini Docker) mentre il
terzo — il frontend statico — vive in una cartella montata e ha bisogno di un passo suo (`ops/frontend-timer.sh`
ogni 5 minuti, dal 20/10). Stasera il passo manuale è stato saltato: i container erano aggiornati, la
dashboard serviva il **JS del giorno prima**, e nessuno se n'è accorto perché la dashboard si disegna dai dati
dell'API.

Il timer chiude il buco operativo, non la **causa**: app e frontend restano due artefatti con due versioni,
e possono divergere in silenzio (ora **misurabile** via `version.json` in `/health`, non impossibile).

## Cosa deve uscire

1. **Un artefatto solo**: il frontend si costruisce **dentro** l'immagine dell'app (`npm ci && npm run
   build` in `frontend/`, copia di `frontend/out` nell'immagine), e si serve da lì. Spariscono: il bind
   mount `./frontend-out:/app/frontend/out:ro`, la release asset `frontend-latest`, `ops/frontend-aggiorna.sh`
   e `ops/frontend-timer.sh` (e le sue unit systemd).
2. **La divergenza non può esistere**: la versione dell'app e quella del frontend sono la stessa build, per
   costruzione.
3. **Zero-downtime**: era il motivo del ticket 56. Va misurato cosa si perde: Watchtower riavvia l'app a
   ogni nuova immagine (≈5-10 s), quindi un cambio di frontend costa quel riavvio invece di zero. Si dichiara
   il numero misurato, e se il riavvio è troppo per l'addon Stremio si valuta un `healthcheck`/`start_period`
   del compose più permissivo — non si torna al passo manuale.
4. **La prova**: un deploy che tocca solo `frontend/**` deve riflettersi nell'interfaccia **senza nessun
   comando sul mate**; `GET /health` deve dire la stessa sha dell'immagine; e il `docker compose` non deve
   più montare `frontend-out`.

## Note

- Il CI già costruisce l'export in un workflow separato: quel passo si sposta nel `Dockerfile` (o in un
  multi-stage) e il workflow `deploy-frontend.yml` si cancella.
- Il `version.json` resta utile: con un artefatto solo diventa una **verifica** (la sha dell'export deve
  coincidere con quella dell'immagine), non un rimedio.
- Se il build del frontend nell'immagine dovesse richiedere variabili d'ambiente, vanno dichiarate come
  `ARG`/`ENV` nel `Dockerfile`: oggi il workflow le costruisce senza, quindi l'export è env-independent.

---

## Esito (20/10/2026)

### 1. Cosa è uscito

- **Il frontend si costruisce nell'immagine**: nuovo stadio `frontend-build` nel `Dockerfile`
  (`npm ci && npm run build`, `output: 'export'`), e `COPY --from=frontend-build /frontend/out ./frontend/out`
  nello stadio finale. `ARG GIT_SHA` dal CI finisce in `out/version.json`.
- **Spariti**: il bind mount `./frontend-out:/app/frontend/out:ro`, la release asset `frontend-latest`,
  `ops/frontend-aggiorna.sh`, `ops/frontend-timer.sh`, le due unit systemd, e il workflow
  `.github/workflows/deploy-frontend.yml` (con il suo build separato che rifaceva l'export a ogni push).
- **`/health` dichiara la versione servita**, presa da `version.json` dentro l'immagine:
  `{"frontend": {"sha": "64cdf1d", "source": "immagine", "built": "..."}}`. Se la sha non è quella attesa,
  si vede subito; se manca, l'immagine non è passata dallo stadio del frontend.
- **`version.json` è ora una verifica, non un rimedio**: app e frontend hanno la stessa build per
  costruzione.

### 2. L'incidente (e il suo rimedio)

Durante il deploy ho rotto `index.js` con una stringa mal escapata (`l'immagine` dentro apici singoli):
l'app è andata in **crash-loop** in produzione. Ripristino in ~2 minuti con l'immagine precedente
(`YACA_TAG=e72250d…`) e il compose col mount, poi correzione e redeploy.

**Il build non se n'era accorto**: un errore di sintassi JS passa il `docker build` e arriva in produzione.
Aggiunto un **cancello**: `RUN node --check index.js && find src -name '*.js' -print0 | xargs -0 -n1 node --check`.
Verificato su tutti e **163** i file di `src/` (0 errori). Da ora un'immagine che non compila non viene
pubblicata, quindi Watchtower non può tirarla su.

### 3. La prova, in produzione

```
GET /health → {"status":"ok","frontend":{"sha":"64cdf1d","source":"immagine","built":"2026-10-20T19:33:51Z"}}
GET /version.json → {"sha":"64cdf1d802…","source":"immagine",…}
chunk servito: _next/static/chunks/8c9e173b7492726b.js → classici_movies: 1
mount del container: 0 riferimenti a frontend (nessun bind mount)
/srv/yaca/frontend-out → rimosso (non era più montato)
unit timer → disabilitate e cancellate
```

### 4. Il costo dichiarato

Una modifica al solo frontend ora costa il **riavvio dell'app** (quello che Watchtower fa comunque a ogni
nuova immagine, ~10 s) e ~3 min di build in più nel CI. Era il prezzo che il ticket 56 non voleva pagare:
il 24 l'ha pagato, e in cambio la divergenza fra app e interfaccia non può più esistere.
