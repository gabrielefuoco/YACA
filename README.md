# YACA (Yet Another Catalog Addon)
Il catalogo definitivo per Stremio, potenziato da Trakt.tv e dall'intelligenza artificiale di Mistral.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## Funzionalità
- **Cataloghi Intelligenti**: Genera cataloghi auto-aggiornanti con prompt testuali (es. "Commedie romantiche natalizie").
- **100+ Preset Curati**: Cataloghi pre-configurati per genere, regista, attore, studio, decennio e tematiche.
- **Profili Multipli Stateful**: Organizza i tuoi cataloghi in profili (es. "Film", "Anime", "Serie TV") persistiti su database.
- **Sincronizzazione Addon**: Aggiorna automaticamente l'addon nella tua collezione Stremio senza reinstallazioni manuali.
- **Integrazione Trakt.tv**: Sincronizza Watchlist e Preferiti con supporto al nuovo **Device Auth Flow**.
- **Ricerca AI Live**: Cerca dalla barra di Stremio e l'AI interpreta la tua richiesta.
- **Badge Episodi**: Visualizza il numero dell'episodio direttamente sul poster nei cataloghi "In Corso".
- **Ottimizzato per Render**: Funziona nel piano gratuito (512MB RAM) con gestione intelligente della cache.

## Architettura
YACA è evoluto da un modello stateless a un'architettura **Stateful**. Utilizza **MongoDB** per salvare le configurazioni utente, i profili e le preferenze, garantendo che i tuoi cataloghi siano sempre accessibili e aggiornati su tutti i tuoi dispositivi senza dover gestire stringhe Base64 infinite.

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
