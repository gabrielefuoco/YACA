# Guida Operativa di Deploy: YACA su Home Server Linux Headless

Questo runbook operativo documenta l'installazione, la configurazione, l'esposizione e la manutenzione di YACA su un home server Linux headless (laptop o mini-PC dedicato, 8 GB RAM, 256 GB SSD), coprendo le fasi B, C e D del piano di migrazione.

---

> **Piattaforme rimosse il 04/10/2026**: Hugging Face Spaces, VPS Hetzner, Render e Cloudflare Worker **non si usano più**. I documenti che li descrivevano (`DEPLOYMENT_OPS.md`, `DEPLOYMENT_VPS_HETZNER.md`) sono stati cancellati, insieme alle variabili `SPACE_HOST` e `RENDER_EXTERNAL_URL` nel codice. Questo è l'unico deploy: se incontri un riferimento a quelle piattaforme o a un reverse proxy Caddy, è un residuo da rimuovere, non una configurazione da ripristinare.

## 0. Cosa ti serve prima di iniziare

- [ ] Chiavetta USB con **Debian 12 netinst** (o Ubuntu Server 24.04) — nessun ambiente grafico
- [ ] I valori dei segreti dal PC di sviluppo (file `secrets.env` del repo): `MONGODB_URI`, `TMDB_API_KEY`, `MISTRAL_API_KEY`, `JWT_SECRET`, `ADMIN_PASS`, eventuali `TRAKT_*`
- [ ] Un account **Tailscale nuovo** (gratis) per la tailnet del server
- [ ] L'ultima GitHub Action **verde**, con l'immagine presente su GHCR (`ghcr.io/gabrielefuoco/yaca:latest`)
- [ ] Nessun dominio richiesto: l'esposizione pubblica passa da Tailscale Funnel

> [!WARNING]
> **I segreti del vecchio Hugging Face Space non esistono più.** Lo Space è morto e i suoi secrets sono andati con lui: `MONGODB_URI`, `TMDB_API_KEY`, `MISTRAL_API_KEY`, `JWT_SECRET` e `ADMIN_PASS` vanno **rigenerati o recuperati** prima della fase C. Non tentare di recuperarli dal server: non ci sono.

Ordine di esecuzione: **§2** installazione + checklist → **§3** file e primo avvio → **§4** Funnel e `HOST_URL` → **§5** cold start (una notte, in background) → **§6** accesso admin → **§7** backup e monitoring (quando vuoi).

---

## 1. Architettura e Budget di Sistema

L'infrastruttura sul server casalingo opera con un tetto massimo di memoria di circa 1.9 GB, lasciando oltre 4 GB di RAM disponibili per l'OS, sessioni SSH e agenti di sviluppo.

```
Internet ──HTTPS──> Tailscale Funnel (*.ts.net) ──> host 127.0.0.1:7860
                                                       ├─> container app (Node+DuckDB, cap 1.5 GB)
                                                       ├─> container redis (cap 300 MB, maxmemory 256 MB)
                                                       ├─> container anime-source (worker, cap 256 MB)
                                                       └─> container watchtower (cap 50 MB)
Atlas M0 (dati utente)  ◄── app, via WAN (TLS)
GitHub main ──Actions──> GHCR ──pull──> Watchtower (aggiornamenti automatici)
Storage locale host:    yaca_tmdb (/data/tmdb, ~200 MB)  |  yaca_badges (/data/badges, GC 7 gg)
```

| Servizio / Componente | Memoria a Regime | Memoria Max Allocata (Cap) | Note |
|---|---|---|---|
| OS + Docker + Tailscale | ~310 MB | — | Linux headless senza desktop |
| `app` (Node + DuckDB) | ~400 MB | 1536 MB | Express + DuckDB in-memory + cold start |
| `redis` (Cache L1/L2) | ~270 MB | 300 MB | LRU eviction, no snapshot su disco |
| `anime-source` (Worker Anime) | ~70 MB | 256 MB | Polling periodico AnimeUnity, popola anime_airing_state |
| `watchtower` | ~20 MB | 50 MB | Polling orario su GHCR con cleanup |
| **Totale Applicativo** | **~1.1 GB** | **~2.2 GB** | Pienamente nei limiti degli 8 GB dell'host |

### 1.1 Job Batch e Produttori Schedulati da Systemd Timer (Zero RAM a Regime)

Oltre ai container permanenti orchestrati da Compose, l'infrastruttura sul server casalingo sfrutta **Systemd Timers + Oneshot Services** sull'host per i carichi di lavoro periodici o batch. Tenere container dedicati sempre allocati per compiti che girano pochi secondi o minuti al giorno sprecherebbe centinaia di megabyte di RAM preziosa:

1. **`yaca-doppiaggi.timer` (`services/doppiaggi-source`)**:
   - **Natura**: Produttore batch **pilotato dall'host** (non un container Docker).
   - **Cadenza**: Due volte al giorno (04:00 e 16:00). Durata **misurata** il 19/10/2026: **7 secondi** (`systemctl show yaca-doppiaggi.service -p ExecMainStartTimestamp -p ExecMainExitTimestamp` → 04:01:09 → 04:01:16, stato 0).
   - **Esecuzione**: `ops/yaca-doppiaggi.sh` risolve Node sull'host (inclusi percorsi mise `/home/gabri/.local/share/mise/installs/node/...` o binari di sistema) ed esegue `cli.js` con la propria cache locale (`services/doppiaggi-source/.cache`).
   - **Output e Consumatori**: Accede direttamente al volume catalogo (`yaca_tmdb`) producendo `ita_annotations.jsonl`, `ita_annotations.meta.json` e `ita_annotations.diff.json`. L'app Node legge `ita_annotations.jsonl` via snapshot in RAM (`src/catalog/itaAnnotations.js:31`), mentre il diff viene inoltrato a Redis per notificare i titoli che hanno cambiato doppiaggio. Dettagli completi: [`docs/TIMER_DOPPIAGGI.md`](TIMER_DOPPIAGGI.md).
2. **`yaca-poster-eventi.timer` (`src/posters/drenaCodaPoster.js`)**:
   - **Natura**: Drenatore della coda eventi poster su Redis.
   - **Cadenza**: Ogni 10 minuti. Durata **misurata** il 19/10/2026 a coda vuota: **1 secondo** (`systemctl show yaca-poster-eventi.service` → 15:30:27 → 15:30:28, stato 0). I timestamp di systemd hanno risoluzione di un secondo, quindi non si scende sotto: dire "0,7 secondi" sarebbe precisione inventata.
   - **Esecuzione**: Eseguito tramite `docker exec` dentro il container `yaca-app` (per accedere alla rete Redis e al volume `yaca_erdb_cache`). Dettagli completi: [`docs/TIMER_POSTER.md`](TIMER_POSTER.md).
3. **`yaca-backup.timer` (`ops/yaca-backup.sh`)**:
   - **Natura**: Backup compresso notturno su Cloudflare R2 (vedi §7.1).
   - **Cadenza**: Ogni notte alle 03:30.

### 1.2 Costruttori Offline e Contratti Dati Condivisi

Alcune componenti del repository non sono né container permanenti né timer host, ma **costruttori offline una-tantum**:
- **`services/keyword-graph`**: Costruttore offline del Grafo Gerarchico delle keyword TMDB (`build_graph.py`, Python 3.10, clustering Leiden su embeddings semantici `BAAI/bge-small-en-v1.5`, ~1 GB VRAM). **Correttamente non è nel compose e non ha workflow CI/CD**: è un tool pesante eseguito a mano quando occorre ricalcolare il grafo. Produce **`src/data/hierarchical_graph.json`** (~1.0 MB), che è un **file di dati condiviso residente nell'albero dei sorgenti dell'app** con due consumatori distinti:
  1. Il core Node.js dell'app (`src/indice/HierarchicalGraph.js`), che lo carica in RAM e lo include nell'immagine container;
  2. Il servizio Grafo Python (`services/graph/upstream/spazi-trakt.py:128`), che lo legge direttamente da disco per l'allineamento degli spazi Trakt.
  *(Nota: il vecchio output `graph_data.json` documentato storicamente è stato eliminato dal repository nel commit `482fa3d` e non è più utilizzato).*
- **`scripts/erdb-builder`**: Costruttore offline per la generazione del dataset iniziale di poster pre-composti.

---

## 2. Fase B — Preparazione Server e Checklist Primo Boot

Installare una distribuzione Linux a 64-bit minimale senza ambiente grafico (consigliate **Debian Minimal** o **Ubuntu Server**).

### 2.1 Layout Disco e Partizioni
- **Partizione unica**: Allocare un'unica partizione `ext4` per `/` sull'intero SSD. La cartella predefinita di Docker rimarrà `/var/lib/docker`.
- **Spazio libero raccomandato**: Mantenere costantemente almeno 30 GB di spazio libero sul disco.

### 2.2 Configurazione Swap e zram
Per prevenire crash da Out-Of-Memory (OOM) durante picchi transitori di allocazione:

```bash
# 1. Creazione swapfile da 4 GB su SSD
sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 2. Installazione e attivazione zram (~2 GB compressi in RAM)
sudo apt update && sudo apt install -y zram-tools
sudo tee /etc/default/zramswap << 'EOF'
ALGO=zstd
PERCENT=25
PRIORITY=100
EOF
sudo systemctl restart zramswap
```

**Il governor della CPU — e il fatto che non è persistito.** Su una macchina che fa il server (sempre accesa e alimentata) il risparmio energetico costa caro: con `scaling_governor = powersave` la CPU del mate girava a **1100 MHz su 3400 disponibili** — temperature basse (33-42 °C), quindi non era calore — e ogni lavoro legato alla CPU andava **tre volte più lento**: il rendering dei poster in primo luogo. Sulla rete l'effetto è piccolo (4,35 → 4,75 MB/s).

```bash
# Verifica (powersave = sospetto)
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq

# Impostazione a caldo (vale fino al riavvio)
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

**Attenzione (verificato il 04/10/2026)**: sul mate l'impostazione era stata fatta a mano e **non era persistita da niente** — nessuna unit systemd, nessun cron, nessun `/etc/sysfs.conf`, nessun `rc.local`. Al riavvio la CPU **torna a un terzo** e nessuno se ne accorge, perché tutto continua a funzionare, solo più lento.

Il pacchetto `cpufrequtils` **non esiste più su Debian 13 (trixie)** (nessun candidato da installare): la via stabile è una unit minima, fatta e **provata** il 04/10/2026.

```sh
# /usr/local/bin/cpu-governor.sh
#!/bin/sh
for g in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
  [ -w "$g" ] && echo performance > "$g"
done
```

```ini
# /etc/systemd/system/cpu-governor.service
[Unit]
Description=CPU governor a performance (il mate e' un server sempre acceso)
After=multi-user.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/cpu-governor.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo chmod +x /usr/local/bin/cpu-governor.sh
sudo systemctl daemon-reload
sudo systemctl enable --now cpu-governor.service
```

**Come si prova senza riavviare** (ed è la prova che è stata fatta): si guasta a mano e si fa ripartire la unit —

```bash
echo powersave | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
sudo systemctl restart cpu-governor
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor   # deve dire performance
```

Esito reale: `powersave` → la unit → `performance`. Con `is-enabled` = `enabled` e il symlink in `multi-user.target.wants`, la stessa cosa succede al boot.

**Se il mate sembra lento su qualcosa di CPU, il primo sospetto è il governor.**

### 2.3 Checklist Operativa Headless (Primo Boot)
1. **Autenticazione SSH a chiave**:
   Configurare la chiave pubblica in `~/.ssh/authorized_keys`, quindi disattivare le password in `/etc/ssh/sshd_config`:
   ```bash
   sudo sed -i 's/^#*PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
   sudo systemctl restart ssh
   ```
2. **Gestione coperchio laptop**:
   Se il server è un laptop, evitare la sospensione alla chiusura del coperchio:
   ```bash
   sudo sed -i 's/^#*HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
   sudo systemctl restart systemd-logind
   ```
3. **Disattivazione Wi-Fi Power Management**:
   Evitare che la scheda di rete wireless vada in sospensione:
   ```bash
   sudo tee /etc/NetworkManager/conf.d/default-wifi-powersave-on.conf << 'EOF'
   [connection]
   wifi.powersave = 2
   EOF
   sudo systemctl restart NetworkManager || true
   ```
   *(Consigliato: riservare l'indirizzo IP locale del server tramite DHCP statico sul router di casa).*
4. **Sincronizzazione orario NTP**:
   Il daemon TMDB utilizza timestamp UTC per verificare gli export; un orologio disallineato impedisce il download degli aggiornamenti:
   ```bash
   sudo timedatectl set-ntp true
   timedatectl status
   ```
5. **Aggiornamenti di sicurezza automatici**:
   ```bash
   sudo apt install -y unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```
6. **Firewall (UFW)**:
   Poiché il server accede tramite Tailscale e Funnel con connessioni uscenti, la policy in ingresso deve essere restrittiva:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   # Consenti SSH solo dall'interfaccia Tailscale o LAN di emergenza:
   sudo ufw allow in on tailscale0 to any port 22 proto tcp
   sudo ufw enable
   ```
7. **Installazione Docker e Compose Plugin**:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker "$USER"
   newgrp docker
   ```

---

## 3. Fase C — Primo Deploy di YACA

### 3.1 Preparazione della cartella operativa
Sul server, creare la directory standard del servizio:

```bash
sudo mkdir -p /srv/yaca/ops
sudo chown -R "$USER:$USER" /srv/yaca
```

### 3.2 Copia dei file di configurazione
Dal computer locale di sviluppo, trasferire i file del pacchetto di deploy verso il server:

```bash
# Esempio da PC di lavoro (sostituire user@server-ip con i valori effettivi):
scp docker-compose.yml user@server-ip:/srv/yaca/
scp ops/server.env.example user@server-ip:/srv/yaca/ops/
scp ops/yaca-backup.* user@server-ip:/srv/yaca/ops/
```

### 3.3 Configurazione delle Variabili d'Ambiente
Sul server casalingo, creare il file `.env` basandosi sul modello `ops/server.env.example`:

```bash
cp /srv/yaca/ops/server.env.example /srv/yaca/.env
chmod 600 /srv/yaca/.env
nano /srv/yaca/.env
```

Configurare le variabili minime necessarie:
- `HOST_URL=https://<nome-nodo>.<tailnet>.ts.net` (verrà popolato/verificato dopo l'avvio di Tailscale Funnel)
- `MONGODB_URI=<stringa-di-connessione-atlas>`
- `TMDB_API_KEY=<tua-chiave-api-tmdb>`
- `MISTRAL_API_KEY=<tua-chiave-mistral>`
- `JWT_SECRET=<stringa-casuale-generata-con-openssl-rand-hex-32>`
- `ADMIN_PASS=<password-admin-desiderata>`
- `TRAKT_CLIENT_ID` e `TRAKT_CLIENT_SECRET` (se abilitati)
- `TORRENTIO_URL=https://torrentio.strem.fun`
- `SYSTEM_LOG=console` (log su console Docker invece che su Atlas: è già il default; `SYSTEM_LOG=mongo` riaccende la scrittura su Atlas)

> [!IMPORTANT]
> **`PORT` e `REDIS_URL` nel `.env` non hanno effetto**: sono già presenti in `ops/server.env.example` e sono *sovrascritti* dal blocco `environment:` di `docker-compose.yml`, che è il contratto di deploy. Cambiarli lì non cambia il comportamento (e non è un errore: i valori di default sono quelli giusti). Se serve una porta diversa, si cambia il compose, non il `.env`. Lo stesso vale per `YACA_TAG`: è letto dal compose per scegliere il tag dell'immagine, non dall'app.

Variabili opzionali ma che vale la pena conoscere prima di un problema:

- `MISTRAL_MODEL` — modello del motore di ricerca AI, default `open-mistral-nemo`. **Non hardcodare `mistral-small-latest`**: su alcuni piani ha `limit-req-minute = 0`, ogni chiamata torna 429 e la ricerca AI degrada in silenzio a zero risultati.
- `TMDB_DUMP_CONCURRENCY` (default 8) e `TMDB_DUMP_DELAY_MS` (default 285) — ritmo del cold start, vedi §5.

La cartella dei poster già composti (`ERDB_CACHE_DIR`, default `/data/erdb-cache`, montata come volume `yaca_erdb_cache`) si popola copiandoci dentro i poster prodotti fuori dal server con una build una tantum; la rotta `/erdb-poster/<file>` li serve da lì.

### 3.4 Autenticazione GHCR (se il repository/package è privato)
Se l'immagine container su GitHub Container Registry non è resa pubblica:
```bash
# `sudo` è necessario se poi monti /root/.docker/config.json in Watchtower (v. nota sotto)
echo "<GITHUB_PERSONAL_ACCESS_TOKEN>" | sudo docker login ghcr.io -u <GITHUB_USERNAME> --password-stdin
```
*(Se il package GHCR è impostato su 'Public', il login non è necessario).*

⚠️ **Se il package resta privato, Watchtower non vede quelle credenziali**: `docker login` scrive in `/root/.docker/config.json` sull'host, ma il container non lo vede. Dopo il login, scommenta in `docker-compose.yml` il mount `- /root/.docker/config.json:/config.json:ro` sotto il servizio `watchtower` e rilancia `docker compose up -d watchtower`. In alternativa (più semplice) rendi pubblico il package: Profile → Packages → yaca → Package settings → Change visibility.

### 3.5 Avvio dei container
Posizionarsi nella directory `/srv/yaca` ed eseguire l'avvio in background:

```bash
cd /srv/yaca
docker compose pull
docker compose up -d
```

Verificare che tutti i quattro container siano operativi:
```bash
docker compose ps
```

### 3.6 Verifica di Salute Locale
Eseguire una richiesta HTTP all'endpoint di healthcheck sul loopback dell'host:

```bash
curl -i http://127.0.0.1:7860/health
```

Risposta attesa: `HTTP/1.1 200 OK` con payload JSON indicante stato `ok` o uptime.

### 3.7 Servizio Anime Source (`anime-source`)
Modulo worker autonomo in background che scansiona periodicamente le serie anime in corso e popola la collezione `anime_airing_state` su MongoDB per i badge di trasmissione e per il catalogo "Simulcast (Nuovi Episodi)".
- **Verifica stato**: `docker compose ps` (deve risultare `healthy`; diventa `unhealthy` se non completa un giro con successo da oltre 12 ore).
- **Health check manuale**: `docker compose exec anime-source node cli.js --health-check` (exit code `0` se recente, `1` se obsoleto o assente).
- **Verifica dati su MongoDB**: verificare che la collezione contenga documenti (`db.anime_airing_state.countDocuments()`) e che quelli del catalogo novità abbiano `homeReleases` (`db.anime_airing_state.countDocuments({ homeReleases: { $exists: true } })`).
- **Due cadenze sulla HOME di AnimeUnity** (ticket 52): `--home` (prima pagina, ogni 15 minuti) e `--home-full` (giro paginato fino a coprire le due settimane, una volta al giorno). Il giro completo parte subito all'avvio solo se l'ultimo risale a più di 24 ore. La prima pagina copre ~27 ore di uscite, quindi il check ogni 15 minuti non può perdere un episodio; la cortesia (`_courtesyWait`, 350 ms fra le richieste) è dentro il client.

---

## 4. Esposizione Pubblica con Tailscale Funnel

Tailscale Funnel consente di esporre la porta locale `7860` a chiunque su Internet (compresi client Stremio mobili e smart TV) su connessione HTTPS certificata da Let's Encrypt senza bisogno di acquistare un dominio o aprire porte sul router.

### 4.1 Prerequisiti nella Admin Console di Tailscale
Accedere alla dashboard Tailscale (`https://login.tailscale.com/admin`):
1. **DNS**:
   - Abilitare **MagicDNS**.
   - Abilitare **HTTPS Certificates**.
2. **Access Controls (ACL)**:
   Aggiungere l'attributo `funnel` nella sezione `nodeAttrs`:
   ```json
   "nodeAttrs": [
     {
       "target": ["autogroup:member"],
       "attr": ["funnel"]
     }
   ]
   ```

### 4.2 Attivazione del Funnel sul Server
Sul server casalingo, avviare il demone Funnel in background inoltrando la porta 443 HTTPS verso il loopback locale:

```bash
tailscale funnel --bg --https=443 http://127.0.0.1:7860
```

Verificare lo stato e l'URL pubblico assegnato:
```bash
tailscale funnel status
```

L'URL generato avrà il formato:
`https://<nome-nodo>.<nome-tailnet>.ts.net`

### 4.3 Allineamento HOST_URL
Aggiornare il file `/srv/yaca/.env` inserendo l'URL pubblico ottenuto:
```bash
# In /srv/yaca/.env:
HOST_URL=https://<nome-nodo>.<nome-tailnet>.ts.net
```

Riavviare il container applicativo per caricare il nuovo hostname nei manifest (`restart` NON rilegge il `.env`: serve ricreare il container):
```bash
cd /srv/yaca
docker compose up -d app
```

### 4.4 Verifica Esterna da Rete Terza
Da un dispositivo **non collegato a Tailscale** (ad esempio uno smartphone con connessione dati 4G/5G disattivando il Wi-Fi), aprire il browser o eseguire da terminale:

```bash
curl -s https://<nome-nodo>.<nome-tailnet>.ts.net/manifest.json | jq .
```

Se il manifest JSON risponde correttamente, l'addon è pronto per essere installato su Stremio aggiungendo l'URL `https://<nome-nodo>.<nome-tailnet>.ts.net/manifest.json`.

---

## 5. Cold Start TMDB Daemon (una notte)

### 5.1 Come Funziona
All'avvio del container `app`, se la variabile `TMDB_API_KEY` è valida e i dati completi non sono già presenti nel volume `/data/tmdb`, il processo in background `TmdbDumpDaemon` avvia automaticamente il cold start:
- Scarica l'export giornaliero di TMDB e recupera i dettagli di **tutti i titoli, film e serie** (~533.000 al 2026-10, la conta cresce con TMDB).
- Esegue le richieste in parallelo con `TMDB_DUMP_CONCURRENCY` richieste in volo (default **8**) e una pausa di `TMDB_DUMP_DELAY_MS` ms fra un gruppo e il successivo (default **285**) per non incappare nel rate limit.
- Durata stimata con i default: **~9 ore**. Sequenziale (concurrency 1) la stessa mole sarebbe ~3 giorni.
- Occupazione finale su disco: ordine di **150–200 MB** nel volume Docker `yaca_tmdb`; la conversione JSONL → parquet avviene alla fine e richiede pochi secondi.

Il criterio di completezza non è "i 5 file esistono" ma: **i due JSONL `master_movies.jsonl` e `master_tv.jsonl` esistono e `cursor.json` ha `completed.movies` e `completed.tv` a `true`**. I parquet sono un **derivato**: se esiste un JSONL preesistente, il daemon riconverte al boot anche senza rete (`Pre-existing JSONL detected. Running boot conversion...`) e poi hot-reloada DuckDB. Per questo un parquet assente non fa ripartire il cold start, e un parquet già presente non lo evita.

> [!NOTE]
> Durante il cold start l'addon è **già funzionante** e risponde a Stremio; cataloghi e raccomandazioni si popoleranno progressivamente man mano che il dump avanza. Al termine il daemon passa in `dailySync` e poi cicla ogni ora.

> [!WARNING]
> ~~"Elabora ~87.000 film e ~35.000 serie TV, ~120.000 chiamate, 10-12 ore"~~ — **valido fino al 2026-09-20, obsoleto**: era la stima della ricerca di progetto, basata su un export parziale. Il codice e `ops/server.env.example` parlano di ~533.000 titoli. Alzare `TMDB_DUMP_CONCURRENCY` accelera, ma il limite pratico è TMDB e la banda di casa: una concorrenza troppo alta fa fallire il cold start a metà (il cursore riprende, ma si perde tempo).

### 5.2 Monitoraggio del Cold Start
È possibile monitorare lo stato di avanzamento in tempo reale tramite i log di Docker:

```bash
docker compose logs -f app | grep -E "TMDB|Dump|parquet"
```

Oppure interrogando l'endpoint di stato protetto da credenziali admin:

```bash
curl -s -H "x-admin-pass: <ADMIN_PASS>" http://127.0.0.1:7860/api/admin/tmdb-dump/status | jq .
```

---

## 6. Accesso Admin via Node Sharing

Se il proprio PC di lavoro appartiene a un altro account o tailnet personale/aziendale, non è necessario disconnettersi dal proprio tailnet:
1. Dalla Admin Console Tailscale del tailnet in cui risiede il server casalingo, individuare la macchina del server.
2. Cliccare sul menu `...` del nodo e selezionare **Share machine...** (Node Sharing).
3. Inserire l'indirizzo email del proprio account principale oppure generare l'URL di invito.
4. Dal PC di lavoro, accettare l'invito.
5. Il server diventerà raggiungibile dal PC di lavoro tramite il suo indirizzo IP privato Tailscale (`100.x.y.z`) o il suo FQDN completo, permettendo l'accesso SSH o l'apertura delle pagine di amministrazione dell'addon senza passare per il tunnel pubblico.

---

## 7. Fase D — Dati, Backup e Sorveglianza

### 7.1 Configurazione Backup Notturno su Cloudflare R2

Atlas M0 non include backup automatici; la persistenza dei dati utente viene salvaguardata con dump notturni compressi caricati su un bucket Cloudflare R2 (10 GB gratuiti a vita).

#### 1. Configurazione rclone per Cloudflare R2
Installare rclone sul server casalingo:
```bash
sudo apt install -y rclone
```

Eseguire `sudo rclone config` per creare un remote denominato `r2` (il servizio di backup gira come root, quindi la config deve stare in `/root/.config/rclone/`):
- Type: `s3`
- Provider: `Cloudflare`
- `access_key_id`: la chiave R2 generata nella dashboard Cloudflare
- `secret_access_key`: il secret R2 generato
- `endpoint`: `https://<account_id>.r2.cloudflarestorage.com`

Verificare la connessione creando o listando il bucket:
```bash
rclone lsf r2:yaca-backups
```

#### 2. Installazione del Timer Systemd
Copiare lo script e i file di servizio systemd:

```bash
chmod +x /srv/yaca/ops/yaca-backup.sh
sudo cp /srv/yaca/ops/yaca-backup.service /etc/systemd/system/
sudo cp /srv/yaca/ops/yaca-backup.timer /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now yaca-backup.timer
```

Verificare che il timer sia attivo e schedulato per le 03:30 di ogni notte:
```bash
systemctl list-timers yaca-backup.timer
```

#### 3. Test Manuale del Backup
Verificare che il backup funzioni correttamente eseguendolo una tantum:

```bash
sudo /srv/yaca/ops/yaca-backup.sh
```

Verificare la presenza del file `.archive.gz` su Cloudflare R2:
```bash
rclone lsf r2:yaca-backups
```

### 7.2 Procedura Verificata di Restore
In caso di perdita accidentale o corruzione dei dati su MongoDB Atlas:

```bash
# 1. Elencare i backup disponibili:
rclone lsf r2:yaca-backups

# 2. Scaricare l'archivio desiderato:
rclone copy r2:yaca-backups/yaca-mongo-backup-XXXXXXXX_XXXXXX.archive.gz /tmp/

# 3. Caricare le variabili d'ambiente (in una shell manuale NON sono esportate):
set -a; . /srv/yaca/.env; set +a

# 4. Ripristinare il database su MongoDB Atlas:
# Con mongorestore nativo (se installato):
mongorestore --uri="$MONGODB_URI" --archive=/tmp/yaca-mongo-backup-XXXXXXXX_XXXXXX.archive.gz --gzip --drop

# Oppure tramite container Docker (senza dipendenze sull'host):
docker run --rm -v /tmp:/backup mongo:7 \
  mongorestore --uri="$MONGODB_URI" --archive=/backup/yaca-mongo-backup-XXXXXXXX_XXXXXX.archive.gz --gzip --drop

# 5. Rimuovere il file temporaneo:
rm /tmp/yaca-mongo-backup-XXXXXXXX_XXXXXX.archive.gz
```

### 7.3 Installazione dei Timer Systemd Periodici (Doppiaggi ITA e Drenatore Poster)

I timer batch periodici completano la pipeline di aggiornamento metadati e refresh poster composti direttamente sull'host `mate`:

#### 1. Timer Doppiaggi ITA (`yaca-doppiaggi.timer`)
Scarica gli indici di Antonio Genna, unisce le informazioni AnimeUnity da MongoDB Atlas e rigenera le annotazioni `ita_annotations.jsonl` nel volume `yaca_tmdb` due volte al giorno (04:00 e 16:00), spingendo il diff dei titoli cambiati nella coda Redis:

```bash
# 1. Rendere eseguibile lo script wrapper
chmod +x /srv/yaca/ops/yaca-doppiaggi.sh

# 2. Copiare le unità systemd
sudo cp /srv/yaca/ops/yaca-doppiaggi.service /etc/systemd/system/
sudo cp /srv/yaca/ops/yaca-doppiaggi.timer /etc/systemd/system/

# 3. Ricaricare systemd e attivare il timer
sudo systemctl daemon-reload
sudo systemctl enable --now yaca-doppiaggi.timer

# Verifica stato
systemctl list-timers yaca-doppiaggi.timer
```
Dettagli completi su opzioni CLI, isolamento e troubleshooting: vedi [`docs/TIMER_DOPPIAGGI.md`](TIMER_DOPPIAGGI.md).

#### 2. Timer Drenatore Poster (`yaca-poster-eventi.timer`)
Drena periodicamente la coda Redis dei poster che necessitano rigenerazione grafica (ogni 10 minuti) eseguendosi nel container `yaca-app`:

```bash
sudo cp /srv/yaca/ops/yaca-poster-eventi.service /etc/systemd/system/
sudo cp /srv/yaca/ops/yaca-poster-eventi.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now yaca-poster-eventi.timer

# Verifica stato
systemctl list-timers yaca-poster-eventi.timer
```
Dettagli completi su configurazione e troubleshooting: vedi [`docs/TIMER_POSTER.md`](TIMER_POSTER.md).

### 7.4 Monitoring Esterno a Zero RAM
Non installare agenti pesanti sul server. Configurare un servizio esterno gratuito (ad esempio **Healthchecks.io** o **UptimeRobot**):
- Tipo controllo: `HTTP GET`
- URL da monitorare: `https://<nome-nodo>.<tailnet>.ts.net/health`
- Frequenza: ogni 5 minuti
- Notifiche: via Email, Telegram o Discord in caso di mancata risposta (blackout, crash o disconnessione internet).

### 7.5 Manutenzione Ordinaria

> ⚠️ **Watchtower aggiorna le IMMAGINI, non il `docker-compose.yml`.** Quando un push cambia il compose
> (un volume nuovo, una variabile, un servizio in più), Watchtower scarica la nuova immagine ma **ricrea il
> container con la vecchia configurazione**: il mount e le env nuove non entrano mai, e il container resta
> `healthy` mentre il pezzo nuovo non c'è. È una rottura silenziosa, ed è già costata una diagnosi
> (19/10/2026: il volume dell'artefatto anime montato in un compose che nessuno applicava).
>
> **Dopo ogni push che tocca `docker-compose.yml`**, sul mate:
> ```bash
> ssh matebook
> git -C /srv/yaca pull                          # il compose e ops/ sono nel clone
> cd /srv/yaca && docker compose pull            # le immagini nuove
> docker compose up -d --no-build                # ← questo applica il compose
> docker compose ps                              # tutto healthy?
> ```
> E la verifica che il pezzo nuovo ci sia davvero: `docker inspect <container> --format '{{range .Mounts}}{{.Destination}} {{end}}'`
> deve elencare il volume nuovo, e `docker inspect <container> --format '{{range .Config.Env}}{{println .}}{{end}}' | grep <VARIABILE>`
> deve trovare la variabile nuova. **Senza il `up -d --no-build`, il deploy è a metà e sembra riuscito.**
>
> Il guardiano di questo e di altri silenzi: `node scripts/qa/preflight-deploy.js` (esce 1 se qualcosa non torna).

- **Aggiornamenti automatici app**: Watchtower controlla GHCR ogni 3600 secondi (1 ora). Quando una nuova commit entra su `main`, la GitHub Action compila l'immagine, Watchtower effettua il pull ed esegue il restart a zero downtime dell'app, rimuovendo la vecchia immagine.
  L'immagine di Watchtower **non è `containrrr/watchtower`**: il compose usa il fork mantenuto `ghcr.io/nicholas-fedor/watchtower`. Il progetto originale non è più aggiornato e il suo client parla l'API Docker 1.25 mentre Engine 29 richiede ≥ 1.40, quindi va in crash-loop. Il fork è drop-in: stesse label `com.centurylinklabs.watchtower.enable` e stesse variabili `WATCHTOWER_*`. Non "sostituirlo" con l'upstream.
- **Pulizia spazio disco**: Quando lo spazio libero scende verso i 30 GB, ripulire le cache di build e immagini orfane:
  ```bash
  docker system prune -f
  ```
- **Blackout improvvisi**: Poiché il laptop opera senza batteria, un'interruzione di corrente provocherà uno spegnimento improvviso. All'avvio successivo, Docker riavvierà automaticamente i container grazie alla direttiva `restart: unless-stopped`.

---

## 8. Trappole note e comandi utili

| Sintomo | Causa | Rimedio |
|---|---|---|
| Watchtower non aggiorna mai l'app | package GHCR privato e container senza credenziali | rendi pubblico il package, oppure `sudo docker login ghcr.io` + scommenta in `docker-compose.yml` il mount `/root/.docker/config.json:/config.json:ro` e poi `docker compose up -d watchtower` |
| Watchtower in crash-loop | immagine `containrrr/watchtower` (upstream, non più mantenuto, API Docker 1.25) | tieni il fork `ghcr.io/nicholas-fedor/watchtower` già presente nel compose |
| Poster con URL sbagliati o manifest con host errato | `HOST_URL` non aggiornato dopo il Funnel | correggi `.env` e **`docker compose up -d app`** (`restart` non rilegge il `.env`) |
| Il volume `yaca_tmdb` resta vuoto e il cold start riparte a ogni riavvio | `TmdbDumpStore` sceglie `/data/tmdb` solo se esiste `/data`: senza volume montato scrive silenziosamente in `.cache/tmdb` dentro il container, che sparisce a ogni `docker compose up` | verifica `docker compose config` e `docker volume ls \| grep yaca_tmdb`; il path del container deve contenere `master_movies.jsonl` |
| `ls /data/db` dal nome di qualche documentazione | path fantasma del vecchio Mongo locale | non montarlo: i dati utente stanno su Atlas via `MONGODB_URI`, il resto è rigenerabile |
| Cataloghi vuoti per ore | cold start TMDB in corso, oppure `TMDB_API_KEY` assente | `curl -H "x-admin-pass: <ADMIN_PASS>" http://127.0.0.1:7860/api/admin/tmdb-dump/status` |
| La ricerca AI non restituisce nulla | modello Mistral senza quota (`limit-req-minute = 0`, es. `mistral-small-latest`): ogni chiamata è 429 e il fallback è silenzioso | `MISTRAL_MODEL=open-mistral-nemo` nel `.env` (è il default), poi `docker compose up -d app` |
| Backup notturno mai eseguito | rclone configurato per l'utente, ma il servizio gira come root | `sudo rclone config` (remote `r2`), oppure `User=<utente>` nel unit systemd |
| Dopo un blackout l'app non riparte | spegnimento sporco (batteria rimossa) | riavvia il server; i dati utente sono su Atlas e i parquet si rigenerano — in ultima istanza si reinstalla |

Comandi quotidiani (da `/srv/yaca`):

```bash
docker compose ps                 # stato dei container (app, redis, anime-source, watchtower)
docker compose logs -f app        # log applicativi
docker stats --no-stream          # RAM/CPU reali per container
df -h /                           # spazio libero (tenere ≥ 30 GB)
docker system prune -f            # pulizia immagini e cache orfane
```
