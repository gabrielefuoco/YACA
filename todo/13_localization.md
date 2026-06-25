# 13 - Localizzazione (i18n)

Abbandonare l'approccio monolitico (solo italiano) per abbracciare un'utenza internazionale, pur mantenendo un focus eccellente sull'Italia.

## 1. Traduzione Interfaccia
**Azioni Dettagliate:**
- Integrare un sistema i18n (es. `i18next` o `vue-i18n`/`react-i18next` a seconda del framework frontend).
- Estrarre tutte le stringhe di testo hardcodate nei file e posizionarle in file JSON separati (es. `it.json`, `en.json`).
- Completare una traduzione accurata in lingua **Inglese** per l'intera UI Web e per l'Addon.

## 2. Configurazione Lingua Utente
**Azioni Dettagliate:**
- Aggiungere un'impostazione "Lingua Preferita" nel pannello di controllo dell'utente.
- Persistere questa scelta nel Database e nei Token/Cookies per applicarla in ogni successiva richiesta.

## 3. Cataloghi Localizzati Dinamicamente
**Azioni Dettagliate:**
- Attualmente i cataloghi potrebbero essere puramente italiani. Modificare la logica di fetching dal DB/API (TMDB) in modo che passi il parametro lingua corretto (es. `language=it-IT` o `en-US`).
- Implementare meccanismi di Fallback: se la trama non esiste nella lingua richiesta dall'utente, mostrare l'inglese di default, anziché lasciare il campo vuoto.
