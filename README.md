# YACA (Yet Another Catalog Addon)
Il catalogo definitivo per Stremio, potenziato da Trakt.tv e dall'intelligenza artificiale di Mistral.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

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
- **Ottimizzato per Render**: Funziona nel piano gratuito (512MB RAM) con gestione intelligente della cache.

## Architettura
YACA utilizza un'architettura **Stateful** basata su **MongoDB**. Il cuore del sistema è il **Taste Profile** globale dell'utente, alimentato continuamente da Stremio e Trakt. Sopra questo profilo, ogni **Profilo** YACA applica un **DNA** (filtro contestuale) per estrarre solo i contenuti rilevanti (es. un profilo "Horror" isolerà solo i segnali horror dal tuo gusto globale).

Per maggiori dettagli tecnici sulle Signature, la logica di scoring e il Deep Sync, consulta la [Documentazione Architetturale](file:///c:/Users/gabri/APP/catalogo/docs/ARCHITECTURE.md).

---

## Deploy in 1 Click su Render

1. Clicca il pulsante **Deploy to Render** qui sopra.
2. Inserisci un nome per il tuo servizio.
3. Configura le variabili d'ambiente nella sezione *Environment* (vedi la guida alle API Keys qui sotto).
4. Una volta avviato, visita l'URL del tuo servizio (es. `https://tuo-addon.onrender.com`) per configurare l'addon.

---

## ⏰ Mantenere l'Addon Sempre Attivo e Veloce

I servizi gratuiti di Render vanno in sospensione (sleep) dopo 15 minuti di inattività. Suggeriamo di usare **UptimeRobot** per mantenere l'addon "sveglio" e permettere il pre-caricamento della cache (warmup):
1. Crea un monitor **HTTP(s)** su [UptimeRobot](https://uptimerobot.com/).
2. URL: `https://tuo-addon.onrender.com/api/cron/warmup`.
3. Intervallo: **14 minuti**.

---

## 🔑 Guida alle API Keys (Variabili d'Ambiente)

### 1. `MONGODB_URI` (Obbligatoria)
- La stringa di connessione al tuo database MongoDB (es. MongoDB Atlas).
- Necessaria per salvare profili e configurazioni.

### 2. `HOST_URL` (Altamente Consigliata)
- L'URL pubblico del tuo servizio (es. `https://tuo-addon.onrender.com`).
- Essenziale per la generazione corretta di poster, badge e manifest.

### 3. The Movie Database (TMDB) - `TMDB_API_KEY` (Obbligatoria*)
- Recuperabile su [themoviedb.org](https://www.themoviedb.org/) (Settings -> API).
- \*Se non definita nel server, gli utenti dovranno inserirla manualmente nella UI.

### 4. Mistral AI - `MISTRAL_API_KEY` (Opzionale*)
- Recuperabile su [console.mistral.ai](https://console.mistral.ai/).
- \*Obbligatoria per attivare il **Creatore AI** e la **Ricerca AI**.

### 5. Trakt.tv - `TRAKT_CLIENT_ID` e `TRAKT_CLIENT_SECRET` (Opzionali)
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

# Avvia il server
npm start
```

Visita `http://localhost:7000` nel browser.

## Elenco Variabili d'Ambiente

|**Variabile**|**Obbligatoria**|**Descrizione**|
|---|---|---|
|`MONGODB_URI`|Sì|Connessione a MongoDB|
|`TMDB_API_KEY`|Sì*|API Key globale TMDB|
|`MISTRAL_API_KEY`|No*|API Key di Mistral per funzioni AI|
|`HOST_URL`|Sì|URL pubblico del server (senza slash finale)|
|`PORT`|No|Porta del server (default: 7000)|
|`TRAKT_CLIENT_ID`|No|Client ID per Trakt.tv|
|`TRAKT_CLIENT_SECRET`|No|Client Secret per Trakt.tv|
|`CORS_ALLOWED_ORIGINS`|No|Origini CORS consentite (es. `*`)|
