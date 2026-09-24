# YACA 🇮🇹 (Yet Another Catalog Addon)

YACA è un addon stateful avanzato per **Stremio** che unisce un motore analitico SQL in-memory (**DuckDB** su file Parquet), caching distribuito (**Redis**), un motore di raccomandazione bayesiano basato su **Vector Space Model (VSM)** e intelligenza artificiale per generare cataloghi dinamici e personalizzati ad altissime prestazioni.

---

## 📖 Documentazione Completa

Abbiamo creato una documentazione dettagliata e modulare per ogni componente del sistema. **Inizia dall'indice:**

👉 **[INDICE GENERALE DELLA DOCUMENTAZIONE](docs/INDEX.md)**

### Documenti Chiave:
- [🚀 Self-Hosting su Home Server (`mate`)](docs/DEPLOYMENT_HOME_SERVER.md): Guida completa al deploy Docker Compose, Tailscale, Watchtower e GHCR.
- [☁️ Deploy Alternativo VPS Hetzner](docs/DEPLOYMENT_VPS_HETZNER.md): Architettura multi-container con reverse proxy Caddy HTTPS.
- [🦆 Architettura DuckDB In-Memory](docs/DUCKDB_ARCHITECTURE.md): Pre-filtraggio a zero chiamate TMDB tramite dataset Parquet ZSTD.
- [🧬 Algoritmi di Scoring e VSM](docs/ALGORITHMS.md): Taste Profile pesato, Bayesian Rating IMDb e rotazione delle impression.
- [🤖 Motore AI & Live Search Router](docs/AI_ENGINE.md): Mappatura del linguaggio naturale da barra di ricerca Stremio a parametri strutturati.
- [🖥️ Architettura Frontend SPA](docs/FRONTEND.md): Dashboard React 19 + Next.js (Static Export), sessioni cookie e visualizzazione DNA.
- [🔀 Logica Cataloghi](docs/CATALOG_LOGIC.md): Lifecycle delle richieste, caching a due livelli (RAM L1 + Redis L2) e gestione badge ITA.
- [⚙️ Internals Stremio](docs/STREMIO_INTERNALS.md): profili configurabili, manifest dinamici e mapping ibrido Anime (Kitsu/TMDB).
- [🔄 Integrazioni](docs/INTEGRATIONS.md): Device Auth Flow Trakt.tv e sincronizzazione bidirezionale.
- [🧬 Sistema Preset](docs/PRESETS.md): Definizione dei preset ed estrazione filtri SQL.
- [🧪 Testing e Utilities](docs/TESTING_UTILITIES.md): Suite Jest e script operativi di manutenzione.

---

## ⚡ Caratteristiche Principali

- **Cataloghi Istantanei DuckDB**: Pre-filtraggio ed estrazione a zero latenza (<10ms) interrogando in SQL locale i dump TMDB compressi in Parquet. Nessuna dipendenza dall'endpoint `/discover` di TMDB.
- **Cache Distribuita Redis (L2)**: Persistenza distribuita ad alta velocità con TTL dedicati e mitigazione Thundering Herd (SWR Stampede).
- **Taste Profile Pesato & VSM**: Raccoglie in tempo reale l'attività dell'utente (Love x4, Like x3, Watch x2) su Stremio e Trakt.tv, calcolando un vettore DNA multidimensionale (generi, keyword, registi, attori).
- **Profili Multipli Dinamici**: Crea molteplici profili (es. "Cinema d'Autore", "Anime Fan", "Kids Only") con DNA e cataloghi dedicati all'interno della medesima installazione Stremio.
- **Two-Way Trakt Sync**: I voti e le visioni di Stremio si sincronizzano bidirezionalmente con Trakt.tv tramite OAuth Device Code Flow.
- **Badge Dinamici Anime**: Indicatori del numero di episodio e stato del doppiaggio italiano sincronizzati in memoria con le uscite reali.
- **Ricerca Semantica AI (Live Search)**: Interroga la barra di ricerca di Stremio in linguaggio naturale (es. *"film thriller anni 90 ambientati sui treni"*) tramite router Mistral AI.

---

## 🏛️ Architettura di Sistema

```
Internet ──HTTPS──> Tailscale Funnel / Caddy ──> 127.0.0.1:7860
                                                    ├─> container app (Node.js + DuckDB, RAM cap 1.5 GB)
                                                    ├─> container redis (Cache L2, cap 300 MB)
                                                    ├─> container anime-source (Worker sincronizzazione)
                                                    └─> container watchtower (Auto-update continuo da GHCR)
MongoDB Atlas M0 (Configurazioni & Profili)  ◄──────┘
GitHub Actions main ──> GHCR (ghcr.io/gabrielefuoco/yaca:latest) ──> Watchtower pull
```

---

## 🚀 Deployment in Produzione (Self-Hosting Docker)

La configurazione di riferimento di YACA è un deploy headless su Home Server (`mate`) o VPS tramite Docker Compose:

1. **Clona la configurazione o crea il `docker-compose.yml`**:
   Configura i servizi `app`, `redis`, `anime-source` e `watchtower` come dettagliato in [docs/DEPLOYMENT_HOME_SERVER.md](docs/DEPLOYMENT_HOME_SERVER.md).

2. **Configura le variabili d'ambiente (`.env`)**:
   ```bash
   MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/yaca?retryWrites=true&w=majority
   REDIS_URL=redis://redis:6379
   TMDB_API_KEY=la_tua_tmdb_api_key
   MISTRAL_API_KEY=la_tua_mistral_api_key
   JWT_SECRET=genera_con_crypto_randomBytes
   HOST_URL=https://mate.taild24589.ts.net
   PORT=7860
   ```

3. **Avvia lo stack**:
   ```bash
   docker compose up -d
   ```

4. **Esposizione Pubblica**:
   - Tramite **Tailscale Funnel**: `tailscale funnel 7860 on`
   - O tramite **Reverse Proxy Caddy** con certificato HTTPS Let's Encrypt automatico.

5. **Aggiornamenti Automatici**:
   Watchtower controlla periodicamente il registro GHCR (`ghcr.io/gabrielefuoco/yaca:latest`) e riavvia il container senza interruzione di servizio.

---

## 💻 Setup di Sviluppo Locale

Prerequisiti: Node.js (v20+), Redis e un'istanza MongoDB locale o MongoDB Atlas.

```bash
# 1. Installa le dipendenze backend
npm ci

# 2. Installa le dipendenze e compila il frontend (Next.js export)
cd frontend
npm ci
cd ..
npm run build

# 3. Avvia il server YACA
npm start
```

Il server sarà accessibile all'indirizzo `http://127.0.0.1:7860`.

Per eseguire l'intera suite di test automatizzati:
```bash
npm test
```

---

## 🔑 Variabili d'Ambiente

| **Variabile** | **Obbligatoria** | **Descrizione** |
|---|---|---|
| `MONGODB_URI` | **Sì** | Stringa di connessione a MongoDB Atlas per profili e account utente. |
| `REDIS_URL` | No | URL del server Redis per la cache L2 (default: `redis://127.0.0.1:6379`). |
| `TMDB_API_KEY` | **Sì*** | API Key globale di TMDB per metadati estesi. |
| `MISTRAL_API_KEY` | No | API Key Mistral AI per abilitare la ricerca semantica Live Search. |
| `JWT_SECRET` | No | Chiave di firma token sessione dashboard (fallback random ad ogni avvio se assente). |
| `HOST_URL` | **Sì** | URL pubblico del server per locandine, badge e manifest Stremio. |
| `PORT` | No | Porta di ascolto HTTP (default `7860`). |
| `TRAKT_CLIENT_ID` | No | Client ID di Trakt.tv per la sincronizzazione libreria e cronologia. |
| `TRAKT_CLIENT_SECRET` | No | Client Secret di Trakt.tv per il flusso OAuth. |
| `CORS_ALLOWED_ORIGINS` | No | Origini CORS consentite per API pubbliche (default `*`). |
