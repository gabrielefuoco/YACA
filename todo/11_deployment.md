# 11 - Facilitare il Deployment

Consentire alla community open source di fare l'hosting autonomo (self-hosting) di YACA senza attriti o configurazioni dolorose.

## 1. Tooling per il Self Deployment
**Azioni Dettagliate:**
- Fornire un `docker-compose.yml` pulito che orchestri il server Node.js/Python, il database (es. MongoDB/Postgres) e Redis per la cache.
- Redigere un file `.env.example` dettagliato in cui siano spiegati tutti i campi.

## 2. Guide Ufficiali
**Azioni Dettagliate:**
- Scrivere documentazione in Markdown o creare un sito di documentazione (es. VitePress).
- Includere troubleshooting per i problemi più comuni (problemi CORS, porte occupate, mancata connessione al DB).

## 3. Dump del Database per il "Pre-warming" della Cache
**Descrizione:** YACA accumula metadati per funzionare velocemente. Un utente che parte da zero impiegherebbe giorni per popolare la cache tramite scraping e chiamate API.
**Azioni Dettagliate:**
- Creare uno script di esportazione sicura (`db:dump`) che estragga esclusivamente i metadati di sistema, i TMDB info, e le associazioni di copertine.
- Garantire matematicamente che l'export **escluda** ogni dato personale, token, o libreria privata degli utenti.
- Ospitare questo file compressi (es. `metadata.bson.gz`) su un CDN o su GitHub Releases affinché i nuovi deploy lo importino all'avvio.
