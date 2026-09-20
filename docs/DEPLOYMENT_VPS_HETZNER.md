# Piano di Migrazione Deploy: Hugging Face Spaces → VPS Hetzner

> **Stato:** BOZZA — piano operativo per il passaggio da HF Spaces a VPS Hetzner.
> **Motivo:** il piano di HF Spaces non è più utilizzabile; siamo in closed beta e serve un'infrastruttura leggera, economica e senza vincoli.
> Questo documento **sostituisce** la sezione deploy di [DEPLOYMENT_OPS.md](./DEPLOYMENT_OPS.md), che resta valido solo per il contesto storico HF.

---

## 1. Scelta della VPS

Per una closed beta (traffico basso, 1-2 utenti attivi in parallelo), il fabbisogno stimato è:

- **Node.js (Express)** — app principale
- **Redis** in-container — cache, limitata a 1 GB LRU (`start.sh`)
- **MongoDB self-hosted** — profili + login + cache di scoring (vedi §4)
- **nginx/Caddy** — reverse proxy + HTTPS

### 🏆 Scelta consigliata: **Hetzner Cloud — CX22**

| Spec | CX22 |
| :--- | :--- |
| vCPU | 2 (shared) |
| RAM | 4 GB |
| Storage | 40 GB NVMe |
| Traffico | 20 TB/mese |
| Prezzo | **~€4,49/mese** (billing orario, senza contratto) |
| Datacenter | Germania (Falkenstein, Norimberga), Finlandia, USA, Singapore |

**Perché:** miglior rapporto prezzo/spec del mercato, nessun vincolo contrattuale, billing orario (se la beta chiude domani hai speso centesimi), 4 GB di RAM bastano per il budget di §4, 20 TB di traffico sono irraggiungibili per una beta.

### Alternative valutate

| Provider | Piano | Spec | Prezzo | Note |
| :--- | :--- | :--- | :--- | :--- |
| OVHcloud | VPS-1 (2027) | 2 vCPU / 4 GB / 40 GB NVMe | ~$4,54/mese | Backup giornaliero incluso, traffico illimitato |
| Contabo | Cloud VPS 4 | 4 vCPU / 8 GB / 100 GB | €5,50/mese (24 mesi) | Prezzo basso solo con vincolo; month-to-month ~€8,99; hardware datato |
| Hostinger | KVM 1 | 1 vCPU / 4 GB / 50 GB | $6,49/mese intro → $11,99 rinnovo | **1 solo vCPU** (troppo poco per duckdb+sharp); prezzo intro = rata su 2 anni anticipati |
| Hostinger | KVM 2 | 2 vCPU / 8 GB / 100 GB | $8,79 intro → $14,99 rinnovo | Adeguato ma il doppio di Hetzner |
| DigitalOcean | Droplet Basic | 1 vCPU / 1 GB | $6/mese | RAM insufficiente per Redis+Node+duckdb |
| Oracle Cloud | Ampere A1 ARM | fino a 4 OCPU / 24 GB | **€0** (Always Free) | Rischi: disponibilità regionale, console complessa, possibile chiusura account; da validare sharp/duckdb su ARM64 |
| Vultr | Cloud Compute | 1 vCPU / 1 GB | $6/mese | Stesso problema RAM di DigitalOcean |

**Scelte per caso d'uso:**
- Priorità a **valore/flessibilità** → **Hetzner CX22** (default)
- Priorità a **backup automatici inclusi** → OVH VPS-1
- Priorità a **assistenza/pannello** → Hostinger KVM 2 (non KVM 1)
- Budget zero → Oracle Always Free (accettando i rischi)

---

## 2. Architettura target

```mermaid
graph TD
    User[Client Stremio / Browser] -->|HTTPS 443| Nginx[Nginx + Certbot]
    Nginx -->|HTTP 127.0.0.1:7000| App[Container YACA - Node.js/Express]
    App --> Redis[(Redis in-container - cache 1GB LRU)]
    App --> Mongo[(Container MongoDB - profili + login)]
    App -->|API esterne| TMDB[TMDB API]
    App -->|API esterne| Mistral[Mistral AI]
    App -->|API esterne| Trakt[Trakt.tv API]
    App -->|manifest/stream| CF[Cloudflare Worker - proxy anti-ban (invariato)]
    App -->|PROXY_ADDON_URL| ICV[Addon stream esterno - invariato]
```

**Rette immutate rispetto a HF:**
- Cloudflare Worker (proxy anti-ban)
- `PROXY_ADDON_URL` (addon stream esterno)
- API esterne (TMDB, Mistral, Trakt)

---

## 3. Modifiche al codice/repo

### 3.1 Dockerfile — rimuovere il retaggio HF

File: `Dockerfile`

```dockerfile
# DA RIMUOVERE:
# Hugging Face Spaces richiede la porta 7860
ENV PORT=7860
```

Il codice in `index.js` fa già `process.env.PORT || 7000`, quindi basta rimuovere l'ENV (o impostare `ENV PORT=7000`). Il commento sul Garbage Collector (`--expose-gc`) può restare: non danneggia su VPS.

### 3.2 Nuovo file `docker-compose.yml` (da creare)

```yaml
services:
  app:
    build: .
    container_name: yaca-app
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:7000:7000"   # esposto solo in locale; nginx fa da proxy
    depends_on:
      - mongo
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:7000/api/health').catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3

  mongo:
    image: mongo:7
    container_name: yaca-mongo
    restart: unless-stopped
    command: mongod --wiredTigerCacheSizeGB 0.5
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.runCommand('ping').ok"]
      interval: 30s
      timeout: 5s
      retries: 5

volumes:
  mongo-data:
```

> Redis resta **dentro** il container app (lo avvia `start.sh`) — nessun servizio extra necessario.

### 3.3 File `.env` sul server (da creare da `.env.example`)

| Variabile | Obbligatoria | Valore su VPS |
| :--- | :--- | :--- |
| `MONGODB_URI` | ✅ | `mongodb://mongo:27017/yaca` |
| `HOST_URL` | ✅ | `https://yaca.tuodominio.it` (il tuo dominio) |
| `JWT_SECRET` | ✅ | stringa da `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `TMDB_API_KEY` | ✅ | invariata |
| `MISTRAL_API_KEY` | no | invariata |
| `TRAKT_CLIENT_ID` / `TRAKT_CLIENT_SECRET` | no | invariati |
| `CORS_ALLOWED_ORIGINS` | no | lista domini consentiti |
| `ERDB_CONFIG` | no | invariata |

**Nota `SPACE_HOST`:** era compilata automaticamente da HF; su VPS resta vuota. Non è un problema: `HOST_URL` ha priorità in `src/utils/helpers.js` e `src/utils/stremioAddon.js`.

### 3.4 Reverse proxy — nginx + Certbot

Configurazione nginx (`/etc/nginx/sites-available/yaca`):

```nginx
server {
    listen 80;
    server_name yaca.tuodominio.it;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    server_name yaca.tuodominio.it;

    ssl_certificate     /etc/letsencrypt/live/yaca.tuodominio.it/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yaca.tuodominio.it/privkey.pem;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:7000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Certificato: `sudo certbot --nginx -d yaca.tuodominio.it`

> `app.set('trust proxy', 1)` è già presente in `index.js` → i rate limit e i redirect vedono l'IP reale del client. ✅

### 3.5 DNS

- Record **A**: `yaca.tuodominio.it` → `<IP pubblico Hetzner>`
- (Opzionale) record AAAA se usi IPv6

### 3.6 Firewall Hetzner

Nel pannello Hetzner Cloud (o `ufw` sul server) aprire **solo**:
- `22` (SSH)
- `80` (HTTP, per Certbot)
- `443` (HTTPS)

La porta 7000 resta chiusa verso l'esterno (nginx è l'unico ingresso).

### 3.7 Pipeline di deploy — da HF push a SSH deploy

Il workflow attuale `.github/workflows/deploy.yml` pusha su HF Space. Nuova pipeline (GitHub Actions):

```yaml
name: 🚀 Deploy YACA su Hetzner

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/yaca
            git pull origin main
            docker compose build app
            docker compose up -d app
```

Secrets GitHub da impostare: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Il CF Worker resta gestito dal workflow (passo separato invariato).

> **Alternativa più semplice:** deploy manuale con `rsync -avz --exclude node_modules --exclude .git ./ utente@ip:/opt/yaca/` + `docker compose up -d --build` via SSH. Niente secrets GitHub da gestire.

---

## 4. Database interno: rimozione di MongoDB Atlas

### Decisione: **mongod self-hosted nel container**

Rispetto a riscrivere tutto su SQLite (refactor di 11 modelli con feature mongoose come `Map`, `Mixed`, TTL index, OCC, `$inc`, `bulkWrite` — costo stimato 1-2 giorni + regressione), il self-hosting di mongod è:

- **Zero modifiche al codice** (cambia solo `MONGODB_URI`)
- **Stesso comportamento** dei modelli attuali
- **RAM contenuta** se si limita la WiredTiger cache

### Budget RAM su CX22 (4 GB)

| Componente | Uso stimato |
| :--- | :--- |
| Node app | ~400 MB |
| Redis (LRU, max 1 GB) | fino a ~1 GB (si comprime sotto pressione) |
| mongod (cache 512 MB) | ~700 MB |
| OS + nginx | ~300 MB |
| **Totale picco** | **~2,4 GB** ✅ (margine ~1,6 GB) |

### Migrazione dati da Atlas

```bash
# 1. Sulla macchina locale / CI — export da Atlas
mongodump --uri="$MONGODB_URI_ATLAS" --out=./yaca_dump

# 2. Copia il dump sul VPS
rsync -avz ./yaca_dump utente@ip:/opt/yaca_dump/

# 3. Sul VPS — import nel mongo locale (una volta che il compose è su)
docker compose exec mongo mongorestore /dump  # o: mongorestore --uri=mongodb://127.0.0.1:27017/yaca /opt/yaca_dump
```

> Prima di dismettere Atlas: verificare che login e profili risultino correttamente migrati (test di accettazione in §5).

### Backup (perdita da coprire: Atlas li forniva, ora no)

1. **Snapshots Hetzner** (livello VM, ~€0,01/GB/mese): snapshot settimanale dal pannello
2. **mongodump cron** (livello dati):
   ```cron
   0 3 * * 0 docker compose -f /opt/yaca/docker-compose.yml exec -T mongo mongodump --archive --gzip > /opt/backups/mongo-$(date +\%F).archive.gz
   ```
   + retention a 30 giorni + upload opzionale su storage esterno (Hetzner Object Storage o S3).

---

## 5. Checklist operativa (ordine di esecuzione)

- [ ] 1. Creare account Hetzner e il server CX22 (Ubuntu 24.04 LTS, datacenter preferibilmente Falkenstein/Norimberga per l'Italia)
- [ ] 2. Aggiungere chiave SSH e configurare il firewall (22/80/443)
- [ ] 3. Installare Docker + Docker Compose plugin sul VPS
- [ ] 4. Puntare il record A del dominio all'IP del VPS
- [ ] 5. Modificare il `Dockerfile` (rimozione `ENV PORT=7860`)
- [ ] 6. Creare `docker-compose.yml` (app + mongo)
- [ ] 7. Creare `.env` sul server con `MONGODB_URI=mongodb://mongo:27017/yaca`, `HOST_URL`, `JWT_SECRET`, chiavi API
- [ ] 8. `docker compose up -d --build` e verificare l'avvio di app + mongo
- [ ] 9. Configurare nginx + Certbot (HTTPS sul dominio)
- [ ] 10. Migrare i dati da Atlas (mongodump → mongorestore)
- [ ] 11. **Test di accettazione:**
      - [ ] Login con credenziali esistenti (profilo + configurazione presenti)
      - [ ] Manifest Stremio accessibile da `https://yaca.tuodominio.it/manifest.json`
      - [ ] Generazione poster con badge episodio (verifica `HOST_URL`)
      - [ ] Streaming end-to-end via Stremio (CF Worker + PROXY_ADDON_URL invariati)
      - [ ] Riavvio container: i dati sopravvivono (volume `mongo-data`)
- [ ] 12. Configurare i backup (snapshot settimanale + mongodump cron)
- [ ] 13. Aggiornare il workflow GitHub Actions (deploy SSH) e i secrets (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`)
- [ ] 14. Dismettere lo Space HF e **solo dopo** il cluster Atlas (o tenerlo 1 settimana come backup di sicurezza)

---

## 6. Rischi e contromisure

| Rischio | Impatto | Contromisura |
| :--- | :--- | :--- |
| Server non gestito (manutenzione a carico nostro) | Medio | Playbook in questo doc; snapshots settimanali per rollback veloce |
| Perdita dati DB (prima su Atlas) | Alto | mongodump cron + snapshots Hetzner; doppio livello |
| Porta 7000 esposta per errore | Alto | Firewall Hetzner + bind `127.0.0.1` nel compose |
| Certificato SSL scaduto | Basso | Certbot auto-rinnovo (`certbot renew --dry-run` di test) |
| Traffico oltre 20 TB/mese (improbabile in beta) | Basso | Monitoraggio nel pannello Hetzner; upgrade piano in un click |
| Attacco al rate-limited login | Medio | `express-rate-limit` già attivo; HTTPS obbligatorio |

---

## 7. Costi stimati

| Voce | Costo/mese |
| :--- | :--- |
| Hetzner CX22 | ~€4,49 |
| Dominio | ~€10-15/anno (se non già posseduto) |
| Snapshot settimanale (~10 GB) | ~€0,10 |
| MongoDB self-hosted | €0 (prima: €0 su Atlas free tier, ma senza controllo) |
| **Totale** | **~€5/mese + dominio** |
