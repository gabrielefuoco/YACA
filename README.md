# YACA (Yet Another Catalog Addon)
Il catalogo definitivo per Stremio, potenziato dall'intelligenza artificiale di Mistral.

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
2. Configura le variabili d'ambiente opzionali (`HOST_URL`, `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET`).
3. Una volta avviato, visita l'URL del tuo servizio per configurare l'addon.

## Setup Locale

```bash
npm install
npm start
```

Visita `http://localhost:7000` nel browser per configurare il tuo addon e ottenere il link personalizzato!

## Come Funziona

Questo addon è **completamente stateless** — non richiede database. La configurazione utente viene codificata in Base64 e inserita direttamente nell'URL dell'addon:

```
https://tuo-addon.onrender.com/<STRINGA_BASE64>/manifest.json
```

Quando modifichi la configurazione, il frontend genera un nuovo URL Base64. Con la funzione "Sincronizza Stremio", l'addon si aggiorna automaticamente nel tuo account senza reinstallazione.

## Variabili d'Ambiente

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `PORT` | No | Porta del server (default: 7000) |
| `HOST_URL` | Consigliata | URL pubblico del server (es. `https://tuo-addon.onrender.com`) |
| `TRAKT_CLIENT_ID` | No | Client ID per integrazione Trakt.tv |
| `TRAKT_CLIENT_SECRET` | No | Client Secret per integrazione Trakt.tv |
| `CORS_ALLOWED_ORIGINS` | No | Origini CORS consentite, separate da virgola |
