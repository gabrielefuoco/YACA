Status: ready-for-agent
Type: task

# 30 — Il deploy del giro: in produzione, e le unità del timer sul mate

## Perché

Il refactor dei moduli (ticket 20–28) e i due bug corretti (la chiave della cache, il drenatore che ingoiava i
fallimenti) sono **solo in locale**: 24 commit non pushati. E sul mate c'è una cosa che **non si aggiorna da
sola**: le **unità systemd** che invocano il drenatore dei poster — `ops/yaca-poster-eventi.service` punta al
percorso **nuovo** (`src/posters/drenaCodaPoster.js`) nel repo, ma sul mate `/etc/systemd/system/` ha ancora
quello **vecchio** (che funziona, perché è uno shim: ma è un ponte, e i ponti si tolgono).

## Cosa deve uscire

1. **Il push** di `main` → CI (`.github/workflows/deploy.yml`) → ghcr → watchtower. **Prima**: `git log
   --oneline origin/main..main` per sapere cosa si sta portando, e la suite intera (ticket 29) per sapere in che
   stato si parte.
2. **La verifica in produzione**, che è la prova vera e non la CI verde:
   - `docker ps` → `yaca-app` healthy; e il **boot**: `docker inspect -f '{{.State.StartedAt}}' yaca-app` contro
     i timestamp di `docker logs -t` — deve restare **~1,6 s** al DuckDB (ticket 19), non tornare a 18;
   - le righe del grafo: `curl .../catalog/series/yaca_mondi_series.json` e `yaca_passo_fuori_series.json`, coi
     **conteggi** (e la nota che `il_tuo_mondo` per un profilo `anime: exclude` è **aperto**: è la scelta del
     mondo, ticket 38);
   - `POST /api/profilo` e le rotte di dominio: la superficie nuova risponde (ticket 10/11);
   - `docker stats --no-stream`: la RAM di `yaca-app` deve restare **~284 MiB** (ticket 19), non tornare a 747.
3. **Le unità sul mate** (la checklist del ticket 25):
   ```bash
   ssh mate
   cd /srv/yaca && git pull
   sudo cp ops/yaca-poster-eventi.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl restart yaca-poster-eventi.timer
   systemctl list-timers | grep yaca-poster      # il prossimo giro, e l'ExecStart nuovo
   ```
   E la verifica che il drenatore **dal percorso nuovo** esca 0 quando Redis o ERDB sono giù (il contratto
   dell'unità: *«Redis o ERDB giù NON sono un guasto di questa unità»*) e **1** solo quando manca la
   configurazione (base ERDB assente) — il caso misurato il 17/10/2026.
4. **Gli shim**: dopo questo deploy gli shim possono sparire (ticket 28) — ma **prima** le unità, se no il timer
   chiama un percorso che non esiste.

## Come si verifica

Le misure qui sopra, **lette dai log e dai contatori**, non dall'impressione. Se una non torna, il deploy si
annulla (revert + push) e si dice cosa non tornava: il rollback è a portata di mano, ma va **deciso in un minuto**,
non discusso per un'ora con la produzione a metà.

## Nota

Il **ticket 18** resta aperto per la sua parte: il workflow che pubblica l'immagine del servizio aspetta lo
**scope `workflow`** del token (`gh auth refresh -s workflow`). Fino ad allora `yaca-graph` si aggiorna con
`docker compose build graph` sul mate — che funziona (fatto il 17/10/2026).

## ⚠️ Verificato sul mate il 18/10/2026 — PRIMA del push serve un cambio al compose

**Il buco**: l'app **non monta** il volume dell'anime-source, ma il modulo anime legge l'artefatto da lì
(`src/anime/mapping.js`: `ANIME_MAPPING_PATH` / `ANIME_MAPPING_DIR`, default `.cache/anime-mappings.json`).
Il produttore lo scrive in `yaca_anime_source_cache:/app/.cache` (10,4 MB, verificato), e quel volume è montato
**solo** nel servizio. In produzione l'app non troverebbe l'artefatto → insiemi anime vuoti → `non-lo-so` su tutto
→ l'euristica decide → **i cataloghi anime si rompono in silenzio**.

**Da fare nello stesso push** (una riga di compose + una di ambiente):
```yaml
  app:
    volumes:
      - yaca_anime_source_cache:/data/anime-source:ro   # ← l'artefatto, in sola lettura
    environment:
      - ANIME_MAPPING_PATH=/data/anime-source/anime-mappings.json
```
E la verifica, dopo il deploy: `docker exec yaca-app ls -la /data/anime-source/` → il file c'è, e
`docker logs yaca-app | grep -i "artefatto assente"` → **nessuna** riga.

**Gli altri passi, verificati adesso**:
- `deploy.yml` (l'app) scatta a ogni push; `deploy-anime-source.yml` scatta se cambia `services/anime-source/**`
  — e i nostri commit lo cambiano ✓ quindi il **produttore** si aggiorna da sé.
- **`yaca-graph` va ricostruito a mano** sul mate (`cd /srv/yaca && docker compose build graph && docker compose up -d graph`):
  il suo workflow è bloccato dal ticket 18 (manca lo scope `workflow`), e `services/graph/parametri.py` è cambiato
  (ticket 39: `DELTA_FASCIA` misurato).
- **Il timer dei poster NON è un problema**: l'unità sul mate fa
  `docker exec --workdir /app … yaca-app node scripts/drena-coda-poster.js` — gira **dentro il container**, non
  sull'host, e lo script esiste ancora (il ticket 28 l'ha tenuto apposta). Ripuntarlo a
  `src/posters/drenaCodaPoster.js` è **opzionale**, non necessario.
- **La verifica che conta**: boot ~1,6 s, RAM ~284 MiB a freddo, i conteggi delle righe del grafo, e il file
  dell'artefatto dentro l'app (sopra). Più `docker stats`: l'app non deve fare il giro del daemon (ticket 34).

## Passo aggiunto (18/10/2026): la migrazione dell'ordine libreria

La rotta `PUT /api/profilo/libreria/ordine` scriveva il **solo** posto vecchio
(`AddonConfig.profiles[].raw_ui_state.libraryOrder`), bypassando il writer della libreria: la migrazione del
ticket 21 era **ferma** — `UserLibraryOrder` non veniva mai popolato e il ripiego in lettura si attivava sempre.
Ora la rotta chiama `salvaOrdineLibreria`, che scrive **primariamente** il modello nuovo **e** mantiene lo
specchio di transizione.

**Dopo il deploy, una volta**: `ssh mate` → `docker exec --workdir /app yaca-app node scripts/migrate_library_order.js --apply`
(il copione esce **1** se fallisce: il ticket 27 gli ha tolto il `process.exit(0)` nel `finally`). Poi si verifica:

```bash
docker exec yaca-app node -e "require('/app/src/models/UserLibraryOrder')" # il modello esiste
# e nei log dell'app: nessuna riga di fallback su raw_ui_state.libraryOrder durante un riordino
```

## Decisione (18/10/2026): si aspetta, un solo deploy

**Niente push finché il ticket 41 (il sostituto della catena ibrida) non è finito.** Motivo: 101 commit in attesa
significano un deploy solo, con tutto dentro — refactor, moduli, fix e motore nuovo — invece di due deploy e due
finestre di rischio. Il costo accettato è che la produzione resta su `338d7d4` (pre-refactor) più a lungo.

**L'ordine deciso**: fetta del 41 → **code review indipendente** (due revisori, uno sugli standard e uno sulla
specifica) → resto del 41 → push (eseguito dall'integratore, non da uno slave, con i numeri prima e dopo).

La checklist qui sopra resta valida: va eseguita **al momento del push**, non prima.

---

## La procedura, in ordine (riscritta il 19/10/2026, dopo il preflight)

Il deploy del 19/10 è partito con **242 commit** (`338d7d4` → `94c738e`). Questa è la sequenza che
**funziona davvero**, con la verifica di ogni passo. Nasce da tre rotture silenziose trovate *mentre* si
preparava — nessuna delle quali avrebbe fatto cadere un container:

### Le tre rotture silenziose (e cosa è stato corretto nel repo)

1. **Il compose puntava a un artefatto che nessuno produceva.** `ANIME_MAPPING_PATH` cercava
   `anime-mappings.json` nel volume condiviso, ma **l'immagine del produttore era del 5 ottobre** e non
   conteneva il codice che lo pubblica (`caa4267` era fra i commit non pushati). Il mount c'era, il file no:
   l'app avrebbe degradato i cataloghi anime loggando *«File artefatto assente»* e nient'altro.
   → **corretto dal push** (il workflow `deploy-anime-source.yml` ricostruisce l'immagine: `paths: services/anime-source/**`).
   Il consumatore ha **TTL 60 s**, quindi si riprende da sé appena l'artefatto appare: **non serve riavviare l'app**.
2. **Due scrittori sullo stesso volume.** Il ticket 34 aveva aggiunto **sia** il container `tmdb-daemon`
   **sia** due unità systemd che lanciavano lo stesso cli dentro `yaca-app`, entrambi su `yaca_tmdb`.
   Il README del servizio dice esplicitamente *«Perché Container e non Unità Systemd»*.
   → **rimosse** `ops/yaca-tmdb-daemon.service` e `.timer`.
3. **Watchtower non applica il `docker-compose.yml`.** Aggiorna le immagini e ricrea il container con la
   configurazione **vecchia**: mount e variabili nuovi non entrano mai, e il container resta `healthy`.
   → **regola scritta** in `docs/DEPLOYMENT_HOME_SERVER.md` §7.4, e **guardiano committato**:
   `node scripts/qa/preflight-deploy.js` (esce **1** se una di queste cose non torna).

### La sequenza

```bash
# 0. il guardiano: PRIMA di toccare la produzione
node scripts/qa/preflight-deploy.js          # esce 0 = si può deployare

# 1. push → due workflow (app e produttore anime)
git push origin main
gh run list --limit 3                        # attendere entrambi verdi

# 2. sul mate: compose applicato, non solo immagine aggiornata
ssh matebook
git -C /srv/yaca pull
cd /srv/yaca && docker compose pull
docker compose up -d --no-build              # ← il passo che Watchtower non fa
docker compose ps                            # yaca-app, yaca-graph, yaca-tmdb-daemon healthy

# 3. le unità che il mate deve avere (i poster: sono nel clone, non nel container)
sudo cp /srv/yaca/ops/yaca-poster-eventi.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart yaca-poster-eventi.timer
systemctl list-timers | grep yaca-poster     # il prossimo giro

# 4. l'artefatto anime: il produttore lo pubblica al primo ciclo (TTL app 60 s)
docker exec yaca-anime-source ls -la /app/.cache/anime-mappings.json
docker exec yaca-app ls -la /data/anime-source/anime-mappings.json
docker logs yaca-app 2>&1 | grep -i "artefatto assente" | tail -3   # NESSUNA riga

# 5. il grafo: `services/graph` è cambiato e il suo workflow non esiste (ticket 18)
cd /srv/yaca && docker compose build graph && docker compose up -d graph

# 6. le migrazioni, UNA VOLTA, dopo il deploy
docker exec --workdir /app yaca-app node scripts/migrate_library_order.js --apply
docker exec --workdir /app yaca-app node scripts/migrate_hero_presets.js --apply
```

### I numeri da leggere (la prova vera, non la CI verde)

| cosa | atteso | comando |
|---|---|---|
| boot | **~1,6 s** al DuckDB, non 18 | `docker inspect -f '{{.State.StartedAt}}' yaca-app` contro `docker logs -t` |
| RAM | **~284 MiB** a freddo, non 747 | `docker stats --no-stream yaca-app` |
| righe del grafo | conteggi > 0 | `curl .../catalog/series/yaca_mondi_series.json` e `yaca_passo_fuori_series.json` |
| superficie | risponde | `POST /api/profilo`, `GET /api/dashboard` |
| artefatto anime | presente e letto | `docker exec yaca-app ls -la /data/anime-source/` + nessun *«artefatto assente»* |

**Rollback**: l'immagine precedente è `ghcr.io/gabrielefuoco/yaca@sha256:85e01dd9…`; si torna lì con un
`docker compose up -d` col tag vecchio. Se una misura non torna, **si decide in un minuto**.
