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
