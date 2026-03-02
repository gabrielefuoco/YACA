# YACA (Yet Another Catalog Addon)
Il catalogo definitivo per Stremio, potenziato da Trakt.tv e dall'intelligenza artificiale di Mistral.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## Funzionalità
- **Cataloghi Intelligenti**: Genera cataloghi auto-aggiornanti con prompt testuali. (es. "Commedie romantiche natalizie").
- **100+ Preset Curati**: Cataloghi pre-configurati per genere, regista, attore, studio, decennio e tematiche.
- **Profili Multipli**: Organizza i tuoi cataloghi in profili (es. "Film", "Anime", "Serie TV") e passa da uno all'altro.
- **Integrazione Trakt.tv**: Sincronizza Watchlist e Preferiti dal tuo account Trakt.
- **Ricerca AI Live**: Cerca dalla barra di Stremio e l'AI interpreta la tua richiesta.
- **Architettura Stateless**: Nessun database richiesto. La configurazione è codificata nell'URL.
- **Ottimizzato per Render**: Funziona nel piano gratuito (512MB RAM) senza problemi.

## Deploy in 1 Click su Render

1. Clicca il pulsante **Deploy to Render** qui sopra.
2. Inserisci un nome per il tuo servizio.
3. Configura le variabili d'ambiente nella sezione *Environment* (vedi la guida alle API Keys qui sotto).
4. Una volta avviato, visita l'URL del tuo servizio (es. `https://tuo-addon.onrender.com`) per configurare l'addon.

---

## ⏰ Mantenere l'Addon Sempre Attivo e Veloce (Piano Render Gratuito)

I servizi gratuiti di Render vanno in sospensione (sleep) dopo 15 minuti di inattività, rallentando il primo caricamento di Stremio. Inoltre, mantenere l'addon "sveglio" permette a YACA di pre-caricare i cataloghi (warmup della cache).

Per evitare la sospensione e mantenere la cache sempre pronta, puoi usare un servizio gratuito come **UptimeRobot**:
1. Crea un account su [UptimeRobot](https://uptimerobot.com/).
2. Clicca su **Add New Monitor**.
3. Scegli **Monitor Type**: `HTTP(s)`.
4. Inserisci un nome (es. `YACA Warmup`).
5. Nel campo **URL (or IP)** inserisci l'endpoint dedicato al warmup: `https://tuo-addon.onrender.com/api/cron/warmup` *(sostituisci con il tuo URL corretto)*.
6. Imposta il **Monitoring Interval** a **10 o 14 minuti** (non superare i 14 minuti o Render andrà in sleep).
7. Salva il monitor. In questo modo il tuo addon risponderà istantaneamente e i cataloghi principali saranno sempre pre-caricati!

---

## 🔑 Guida alle API Keys (Variabili d'Ambiente)

Per far funzionare al meglio YACA e sfruttare tutte le sue capacità, dovrai inserire alcune chiavi API come variabili d'ambiente su Render. Ecco come ottenerle:

### 1. `HOST_URL` (Obbligatoria per l'hosting)
- Indica l'URL pubblico del tuo servizio (generato da Render o il tuo dominio personalizzato). È essenziale per la generazione corretta delle grafiche e dei metadati.
- Inserisci il tuo URL, ad esempio: `https://tuo-addon.onrender.com` *(assicurati di inserirla **senza** lo slash `/` finale).*

### 2. The Movie Database (TMDB) - `TMDB_API_KEY`
Necessaria per recuperare poster, trame, id e metadati di film e serie TV.
1. Crea un account gratuito su [themoviedb.org](https://www.themoviedb.org/).
2. Clicca sul tuo profilo in alto a destra -> **Impostazioni** (Settings) -> **API**.
3. Clicca su "Create" o "Richiedi una chiave API" (scegli il profilo "Developer").
4. Compila i campi richiesti (puoi inserire l'URL del tuo progetto o dei dati fittizi se è per uso personale).
5. Copia il valore della **API Key (v3 auth)** e inseriscilo in `TMDB_API_KEY` su Render.

### 3. Mistral AI - `MISTRAL_API_KEY` (Opzionale ma raccomandata)
Necessaria per far funzionare i cataloghi intelligenti generati tramite prompt testuale (Creatore AI).
1. Vai su [console.mistral.ai](https://console.mistral.ai/) e crea un account.
2. Le API di Mistral offrono un tier gratuito generoso, perfetto per le necessità di questo addon, senza alcun costo.
3. Naviga nella sezione **API Keys** e clicca su "Create new key".
4. Copia la chiave generata e inseriscila in `MISTRAL_API_KEY`.

### 4. Trakt.tv - `TRAKT_CLIENT_ID` e `TRAKT_CLIENT_SECRET` (Opzionali)
Necessarie **solo** se vuoi sincronizzare la Watchlist, i preferiti, i consigliati e la cronologia di Trakt in Stremio.
1. Accedi al tuo account su [Trakt.tv](https://trakt.tv).
2. Vai alla pagina di creazione app: [trakt.tv/oauth/applications/new](https://trakt.tv/oauth/applications/new).
3. Compila il modulo in questo modo:
   - **Name**: `YACA Addon` (o il nome che preferisci).
   - **Redirect URI**: Questo valore è fondamentale per l'autenticazione. Inserisci: `urn:ietf:wg:oauth:2.0:oob` (Manda a capo e se vuoi aggiungi anche l'URL del tuo addon, es. `https://tuo-addon.onrender.com/`).
   - **Javascript (CORS) origins**: L'URL base del tuo addon, es. `https://tuo-addon.onrender.com`
   - **Checkboxes**: Assicurati di mettere la spunta sulla casella **`/device/code`** (Autorizzazione dispositivo).
4. Salva l'applicazione.
5. Trakt ti mostrerà le chiavi appena create: copiale e incollale rispettivamente nei campi `TRAKT_CLIENT_ID` e `TRAKT_CLIENT_SECRET` su Render.

---

## Setup Locale

```bash
npm install
npm start
````

Visita `http://localhost:7000` nel browser per configurare il tuo addon e ottenere il link personalizzato!

## Come Funziona

Questo addon è **completamente stateless** — non richiede database. La configurazione utente viene codificata in Base64 e inserita direttamente nell'URL dell'addon:



```
[https://tuo-addon.onrender.com/](https://tuo-addon.onrender.com/)<STRINGA_BASE64>/manifest.json
```

Quando modifichi la configurazione, il frontend genera un nuovo URL Base64. Con la funzione "Sincronizza Stremio", l'addon si aggiorna automaticamente nel tuo account senza reinstallazione.

## Elenco Completo Variabili d'Ambiente

|**Variabile**|**Obbligatoria**|**Descrizione**|
|---|---|---|
|`PORT`|No|Porta del server (default: 7000)|
|`HOST_URL`|Consigliata|URL pubblico del server (es. `https://tuo-addon.onrender.com`)|
|`TMDB_API_KEY`|Sì*|API Key globale (*Se non inserita, gli utenti dovranno mettere la loro tramite UI)|
|`MISTRAL_API_KEY`|No*|API Key di Mistral (*Obbligatoria per le funzioni del Creatore AI)|
|`TRAKT_CLIENT_ID`|No|Client ID per integrazione Trakt.tv|
|`TRAKT_CLIENT_SECRET`|No|Client Secret per integrazione Trakt.tv|
|`CORS_ALLOWED_ORIGINS`|No|Origini CORS consentite, separate da virgola|
