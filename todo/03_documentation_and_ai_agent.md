# 03 - Documentazione e AI Agent Skills

Per scalare lo sviluppo, è necessario che l'Agente AI (come me) e i nuovi collaboratori abbiano un contesto perfetto.

## 1. Aggiornamento Documentazione Generale
**Azioni Dettagliate:**
- Mantenere un README e file di architettura aggiornati.
- Documentare i flussi di dati e la struttura del database.

## 2. Skill per l'Agente AI (Coding Assistant)
**Descrizione:** Trasformare l'agente in uno sviluppatore autonomo capace di agire sul progetto a 360 gradi.
**Azioni Dettagliate:**
- Iniettare il file `.env` nell'ambiente dell'agente (es. con chiavi API di test, stringhe di connessione).
- Creare file Markdown (Skill) che spieghino all'agente le regole di business specifiche di YACA.
- Fornire endpoint dedicati e/o script CLI (`npm run test:ai`) per permettere all'agente di validare il proprio lavoro.

## 3. Istruzioni Operative e TTD (Test-Driven Development)
**Regole di Ingaggio:**
- L'agente deve scrivere il test prima di implementare la soluzione.
- Pulizia: rimuovere sempre file scratch o log temporanei dopo aver risolto un bug.
- **Invalidazione Cache:** Questa è una regola aurea. Se uno script aggiorna l'URL di una copertina, l'agente deve chiamare la funzione di flush della cache per propagare il cambiamento agli utenti.
- **Gestione GitHub:** Creare branch dedicati (es. `feature/nuova-ricerca`, `fix/duplicati`), fare commit atomici con messaggi semantici e gestire eventuali conflitti.

## 4. Regole di Analisi dei Cataloghi per l'Agente
Quando l'agente esegue controlli di routine, deve processare una checklist specifica:
1. **Verifica Vuotezza:** Lancio query per contare gli elementi. Se = 0, avvia iterazione di debug.
2. **Coerenza Elementi:** Un catalogo "Anime" non deve contenere Serie TV live-action; l'agente controlla i metadati (es. `type`, `genres`).
3. **Localizzazione Metadati:** Verificare che `title` e `description` siano in lingua corretta (it-IT preferito, fallback en-US), correggendo quelli sbagliati tramite API esterne (TMDB).
