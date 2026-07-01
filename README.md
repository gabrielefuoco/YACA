---
title: YACA
emoji: 🚀
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# YACA 🇮🇹 (Yet Another Catalog Addon)

YACA è un addon per Stremio che porta la potenza dell'intelligenza artificiale e la personalizzazione estrema nel tuo mediacenter preferito.

## 📖 Documentazione Completa

Abbiamo creato una documentazione dettagliata per ogni aspetto del progetto. **Inizia da qui:**

👉 **[INDICE DELLA DOCUMENTAZIONE](docs/INDEX.md)**

### Quick Links:
- [🚀 Guida al Deployment](docs/DEPLOYMENT_OPS.md)
- [🧬 Algoritmi di Scoring](docs/ALGORITHMS.md)
- [🤖 Motore AI (Mistral)](docs/AI_ENGINE.md)
- [🖥️ Architettura Frontend](docs/FRONTEND.md)
- [Logica Cataloghi](docs/CATALOG_LOGIC.md): Lifecycle delle richieste, Merging e Interleaving.
- [Internals Stremio](docs/STREMIO_INTERNALS.md): Workaround per i profili e mapping Anime ibrido.
- [Integrazioni](docs/INTEGRATIONS.md): Sync Stremio/Trakt, Fallback Blur e Failover.
- [🧬 Sistema Preset](docs/PRESETS.md): Definizione dei preset ed utilizzo degli script CLI.
- [🧪 Testing e Utilities](docs/TESTING_UTILITIES.md): Guida a Jest e agli script di validazione/amministrazione.

[Deploy to Hugging Face Spaces](https://huggingface.co/spaces/Gabriele-fuoco/YACA?duplicate=true)

## Funzionalità
- **Cataloghi Intelligenti**: Genera cataloghi auto-aggiornanti con prompt testuali (es. "Commedie romantiche natalizie").
- **100+ Preset Curati**: Cataloghi pre-configurati per genere, regista, attore, studio, decennio e tematiche.
- **Profili Multipli & Profile DNA**: Organizza cataloghi in profili (es. "Anime", "Serie TV"). Ogni profilo ha un **DNA** unico (generi e keyword) che filtra e dà priorità ai suggerimenti in base al contesto.
- **Stremio Deep Sync**: Sincronizzazione profonda di **Libreria, Cronologia, Like e Love** direttamente dal tuo account Stremio al tuo Taste Profile globale.
- **Two-Way Trakt Sync**: I Like/Love di Stremio vengono inviati a Trakt come rating (10/8), mantenendo i due ecosistemi perfettamente allineati.
- **Taste Profile Pesato**: Un motore di raccomandazione che pesa le tue azioni (Love x4, Like x3, Watch x2) per suggerimenti estremamente precisi.
- **Sincronizzazione Background**: Throttling intelligente (ogni 8h ± 2h) gestito automaticamente tramite cron jobs.
- **Integrazione Trakt.tv**: Supporto completo a Watchlist, Preferiti e Raccomandazioni tramite Device Auth Flow.
- **Ricerca AI Live**: Cerca dalla barra di Stremio e l'AI interpreta la tua richiesta.
- **Badge Episodi**: Visualizza il numero dell&apos;episodio direttamente sul poster nei cataloghi "In Corso".
- **Ottimizzato per Hugging Face**: Funziona su Spaces (Docker) con gestione intelligente della cache.

## 🆕 Recenti Novità
- **Fix Badge Episodi Kitsu**: La logica di generazione dei badge è stata ottimizzata. YACA ora gestisce perfettamente gli *episodi fantasma* (non ancora trasmessi) di Kitsu, importando fedelmente le date di messa in onda da TMDB. Questo previene il conteggio errato degli episodi "già usciti" sulle serie divise in più cour o con stagioni miste (es. "Ascendance of a Bookworm S4").
- **Script Unificati**: Introdotto `scripts/fetch_catalogs.js` per scaricare e debbuggare lo stato dei cataloghi in locale sia in JSON minimizzato che in formato tabellare leggibile.

## Architettura
YACA utilizza un'architettura **Stateful** basata su **MongoDB**. Il cuore del sistema è il **Taste Profile** globale dell'utente, alimentato continuamente da Stremio e Trakt. Sopra questo profilo, ogni **Profilo** YACA applica un **DNA** (filtro contestuale) per estrarre solo i contenuti rilevanti.

---

## 🚀 Deploy su Hugging Face Spaces

1. Clicca il link **Deploy to Hugging Face Spaces** qui sopra.
2. Inserisci il tuo **HF_TOKEN** (con permessi di scrittura) e le altre API Key.
3. Lo spazio si avvierà automaticamente usando il `Dockerfile` incluso.
4. Una volta avviato, visita l'URL del tuo spazio (es. `https://<il-tuo-space>.hf.space`) per configurare l'addon.

---

## ⏰ Mantenere l'Addon Sempre Attivo (Keep-Alive)

I servizi gratuiti di Hugging Face vanno in sospensione (sleep) dopo un periodo di inattività. Usa **UptimeRobot** per mantenerlo attivo:
1. Crea un monitor **HTTP(s)** su [UptimeRobot](https://uptimerobot.com/).
2. URL: `https://<il-tuo-space>.hf.space/api/cron/warmup`.
3. Intervallo: **10 minuti** (consigliato) o **14 minuti**.

---

## 🔑 Guida alle API Keys (Variabili d'Ambiente)

### 1. `MONGODB_URI` (Obbligatoria)
- La stringa di connessione al tuo database MongoDB (es. MongoDB Atlas).
- Necessaria per salvare profili e configurazioni.

### 2. `HOST_URL` (Altamente Consigliata)
- L'URL pubblico del tuo servizio (es. `https://<il-tuo-space>.hf.space`).
- Essenziale per la generazione corretta di poster, badge e manifest.

### 3. `JWT_SECRET` (Consigliata)
- Chiave segreta per autenticare la dashboard di configurazione tramite cookie HttpOnly.
- **Se non configurata**: Il server ne genererà una casuale ad ogni avvio. Questo significa che l'app funzionerà comunque, ma le sessioni degli utenti scadranno (sarà necessario rieffettuare il login) ogni volta che il server si riavvia o va in sospensione su Hugging Face.
- Generabile con: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.

### 4. The Movie Database (TMDB) - `TMDB_API_KEY` (Obbligatoria*)
- Recuperabile su [themoviedb.org](https://www.themoviedb.org/) (Settings -> API).
- \*Se non definita nel server, gli utenti dovranno inserirla manualmente nella UI.

### 5. Mistral AI - `MISTRAL_API_KEY` (Opzionale*)
- Recuperabile su [console.mistral.ai](https://console.mistral.ai/).
- \*Obbligatoria per attivare il **Creatore AI** e la **Ricerca AI**.

### 6. Trakt.tv - `TRAKT_CLIENT_ID` e `TRAKT_CLIENT_SECRET` (Opzionali)
- Per sincronizzare watchlist e cronologia.
- Crea un'app su [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications).
- Assicurati di abilitare il flow **`/device/code`**.

---

## Setup Locale

Prerequisiti: Node.js installato e un'istanza MongoDB locale o remota.

```bash
# Installa dipendenze backend
npm ci

# Installa dipendenze frontend
cd frontend
npm ci

# Torna alla root e compila il frontend
cd ..
npm run build

# Avvia le dipendenze locali o il server
npm start
```

Visita `http://localhost:7000` nel browser.

## Elenco Variabili d'Ambiente

|**Variabile**|**Obbligatoria**|**Descrizione**|
|---|---|---|
|`MONGODB_URI`|Sì|Connessione a MongoDB|
|`TMDB_API_KEY`|Sì*|API Key globale TMDB|
|`MISTRAL_API_KEY`|No*|API Key di Mistral per funzioni AI|
|`JWT_SECRET`|No|Consigliata. Chiave di sessione (genera fallback casuale al riavvio)|
|`HOST_URL`|Sì|URL pubblico del server (es. `https://<il-tuo-space>.hf.space`)|
|`PORT`|No|Porta del server (Hugging Face usa 7860)|
|`TRAKT_CLIENT_ID`|No|Client ID per Trakt.tv|
|`TRAKT_CLIENT_SECRET`|No|Client Secret per Trakt.tv|
|`CORS_ALLOWED_ORIGINS`|No|Origini CORS consentite (es. `*`)|
