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

**Attenzione (verificato il 04/10/2026)**: sul mate l'impostazione è stata fatta a mano e **non è persistita da niente** — nessuna unit systemd, nessun cron, nessun `/etc/sysfs.conf`, nessun `rc.local`. Al riavvio la CPU **torna a un terzo** e nessuno se ne accorge, perché tutto continua a funzionare, solo più lento. Per renderla stabile:

```bash
sudo apt install -y cpufrequtils
echo 'GOVERNOR="performance"' | sudo tee /etc/default/cpufrequtils
sudo systemctl enable --now cpufrequtils
```

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
Modulo worker autonomo in background che scansiona periodicamente le serie anime in corso e popola la collezione `anime_airing_state` su MongoDB per i badge di trasmissione.
- **Verifica stato**: `docker compose ps` (deve risultare `healthy`; diventa `unhealthy` se non completa un giro con successo da oltre 12 ore).
- **Health check manuale**: `docker compose exec anime-source node cli.js --health-check` (exit code `0` se recente, `1` se obsoleto o assente).
- **Verifica dati su MongoDB**: verificare che la collezione contenga documenti (`db.anime_airing_state.countDocuments()`).

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

### 7.3 Monitoring Esterno a Zero RAM
Non installare agenti pesanti sul server. Configurare un servizio esterno gratuito (ad esempio **Healthchecks.io** o **UptimeRobot**):
- Tipo controllo: `HTTP GET`
- URL da monitorare: `https://<nome-nodo>.<tailnet>.ts.net/health`
- Frequenza: ogni 5 minuti
- Notifiche: via Email, Telegram o Discord in caso di mancata risposta (blackout, crash o disconnessione internet).

### 7.4 Manutenzione Ordinaria
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
