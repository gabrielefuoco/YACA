Status: ready-for-agent
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
