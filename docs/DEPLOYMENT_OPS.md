# Deployment & Ops - YACA

YACA è progettato per essere facilmente deployabile su piattaforme cloud moderne o server privati.

## Opzioni di Deployment

### 1. Docker (Consigliato)
L'addon è completamente containerizzato. Il `Dockerfile` alla root gestisce:
- Installazione delle dipendenze Node.js.
- Copia del codice sorgente.
- Esposizione della porta (default 7000).

### 2. Render.com
Il file `render.yaml` permette un deployment "Blueprint" su Render:
- Gestisce automaticamente il build del frontend.
- Avvia il servizio web backend.
- Configura le variabili d'ambiente necessarie.

---

## Variabili d'Ambiente Obbligatorie

Per funzionare correttamente, il sistema richiede un file `.env` con:

| Variabile | Descrizione |
| :--- | :--- |
| `PORT` | Porta su cui gira il server (es. 7000). |
| `MONGODB_URI` | Stringa di connessione a MongoDB. |
| `TMDB_API_KEY` | Chiave API di TheMovieDB (principale). |
| `MISTRAL_API_KEY` | Chiave API per le funzionalità AI. |
| `TRAKT_CLIENT_ID` | ID cliente per l'integrazione Trakt. |
| `TRAKT_CLIENT_SECRET` | Secret per l'integrazione Trakt. |
| `REDIS_URL` | (Opzionale) URL per il caching Redis. |

---

## Pipeline CI/CD (GitHub Actions)

Il progetto include workflow in `.github/workflows/` per:
- **Linting**: Verifica la conformità del codice (ESLint).
- **Testing**: Esegue la suite di test Jest.
- **Auto-Deploy**: Se configurato, effettua il push automatico su Render o Hugging Face Spaces al commit sul branch `main`.

---

## Manutenzione: I Cron Job

YACA si affida a dei ping esterni (es. UptimeRobot) sull'endpoint `/api/cron/warmup` per:
1.  **Sincronizzare i dati** degli utenti che non aprono l'app da tempo.
2.  **Scaldare le cache** dei cataloghi globali.
3.  **Pulire i dati orfani** nel database.

### Nota operativa warmup

L'endpoint `/api/cron/warmup` risponde sempre velocemente con `200 OK` (keep-alive), ma il warmup reale è protetto da semaforo interno:
- se un warmup è già in corso, non ne avvia un altro;
- se l'ultimo warmup è avvenuto nelle ultime **6 ore**, non avvia nuove chiamate esterne;
- oltre la finestra di 6 ore, riattiva il warmup in background.
