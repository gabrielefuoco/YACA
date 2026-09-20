# Guida Operativa di Deploy: YACA su Home Server Linux Headless

Questo runbook operativo documenta l'installazione, la configurazione, l'esposizione e la manutenzione di YACA su un home server Linux headless (laptop o mini-PC dedicato, 8 GB RAM, 256 GB SSD), coprendo le fasi B, C e D del piano di migrazione.

---

## 1. Architettura e Budget di Sistema

L'infrastruttura sul server casalingo opera con un tetto massimo di memoria di circa 1.9 GB, lasciando oltre 4 GB di RAM disponibili per l'OS, sessioni SSH e agenti di sviluppo.

```
Internet ──HTTPS──> Tailscale Funnel (*.ts.net) ──> host 127.0.0.1:7860
                                                       ├─> container app (Node+DuckDB, cap 1.5 GB)
                                                       ├─> container redis (cap 300 MB, maxmemory 256 MB)
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
| `watchtower` | ~20 MB | 50 MB | Polling orario su GHCR con cleanup |
| **Totale Applicativo** | **~1.0 GB** | **~1.9 GB** | Pienamente nei limiti degli 8 GB dell'host |

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
- `PORT=7860`
- `HOST_URL=https://<nome-nodo>.<tailnet>.ts.net` (verrà popolato/verificato dopo l'avvio di Tailscale Funnel)
- `REDIS_URL=redis://redis:6379`
- `MONGODB_URI=<stringa-di-connessione-atlas>`
- `TMDB_API_KEY=<tua-chiave-api-tmdb>`
- `MISTRAL_API_KEY=<tua-chiave-mistral>`
- `JWT_SECRET=<stringa-casuale-generata-con-openssl-rand-hex-32>`
- `ADMIN_PASS=<password-admin-desiderata>`
- `TRAKT_CLIENT_ID` e `TRAKT_CLIENT_SECRET` (se abilitati)
- `TORRENTIO_URL=https://torrentio.strem.fun`
- `SYSTEM_LOG=console` (log su console Docker invece che su Atlas: è già il default)

### 3.4 Autenticazione GHCR (se il repository/package è privato)
Se l'immagine container su GitHub Container Registry non è resa pubblica:
```bash
echo "<GITHUB_PERSONAL_ACCESS_TOKEN>" | docker login ghcr.io -u <GITHUB_USERNAME> --password-stdin
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

Verificare che tutti e tre i container siano operativi:
```bash
docker compose ps
```

### 3.6 Verifica di Salute Locale
Eseguire una richiesta HTTP all'endpoint di healthcheck sul loopback dell'host:

```bash
curl -i http://127.0.0.1:7860/health
```

Risposta attesa: `HTTP/1.1 200 OK` con payload JSON indicante stato `ok` o uptime.

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

Riavviare il container applicativo per caricare il nuovo hostname nei manifest:
```bash
cd /srv/yaca
docker compose restart app
```

### 4.4 Verifica Esterna da Rete Terza
Da un dispositivo **non collegato a Tailscale** (ad esempio uno smartphone con connessione dati 4G/5G disattivando il Wi-Fi), aprire il browser o eseguire da terminale:

```bash
curl -s https://<nome-nodo>.<nome-tailnet>.ts.net/manifest.json | jq .
```

Se il manifest JSON risponde correttamente, l'addon è pronto per essere installato su Stremio aggiungendo l'URL `https://<nome-nodo>.<nome-tailnet>.ts.net/manifest.json`.

---

## 5. Cold Start TMDB Daemon (10–12 Ore)

### 5.1 Come Funziona
All'avvio del container `app`, se la variabile `TMDB_API_KEY` è valida e il volume `/data/tmdb` non contiene ancora i 5 file completi (`movies.parquet`, `tv.parquet`, `master_movies.jsonl`, `master_tv.jsonl`, `cursor.json`), il processo in background `TmdbDumpDaemon` avvia automaticamente il cold start:
- Elabora ~87.000 film e ~35.000 serie TV.
- Esegue richieste API TMDB con una pausa prudenziale di 285 ms per evitare rate limiting.
- Durata stimata: **dalle 10 alle 12 ore**.
- Occupazione finale su disco: **~150–200 MB** memorizzati nel volume Docker `yaca_tmdb`.

> [!NOTE]
> Durante queste 10–12 ore, l'addon è già funzionante e risponde a Stremio; i cataloghi e le raccomandazioni si popoleranno progressivamente man mano che il dump avanza.

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

Eseguire `rclone config` per creare un remote denominato `r2`:
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

# 3. Ripristinare il database su MongoDB Atlas:
# Con mongorestore nativo (se installato):
mongorestore --uri="$MONGODB_URI" --archive=/tmp/yaca-mongo-backup-XXXXXXXX_XXXXXX.archive.gz --gzip --drop

# Oppure tramite container Docker (senza dipendenze sull'host):
docker run --rm -v /tmp:/backup mongo:7 \
  mongorestore --uri="$MONGODB_URI" --archive=/backup/yaca-mongo-backup-XXXXXXXX_XXXXXX.archive.gz --gzip --drop

# 4. Rimuovere il file temporaneo:
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
- **Pulizia spazio disco**: Quando lo spazio libero scende verso i 30 GB, ripulire le cache di build e immagini orfane:
  ```bash
  docker system prune -f
  ```
- **Blackout improvvisi**: Poiché il laptop opera senza batteria, un'interruzione di corrente provocherà uno spegnimento improvviso. All'avvio successivo, Docker riavvierà automaticamente i container grazie alla direttiva `restart: unless-stopped`.
