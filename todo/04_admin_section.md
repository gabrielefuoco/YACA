# 04 - Sezione Admin

YACA necessita di un pannello di controllo per monitorare la salute del sistema senza dover manipolare manualmente il database o accedere al server tramite SSH.

## 1. Sviluppo Dashboard Amministrativa
**Azioni Dettagliate:**
- Creare rotte frontend dedicate (es. `/admin`).
- Fornire un'interfaccia per visualizzare metriche di base: numero utenti attivi, dimensione della cache, conteggio cataloghi, errori API recenti.

## 2. Strumenti Operativi
**Azioni Dettagliate:**
- **Svuotamento Cache:** Pulsante per forzare il clear di Redis o della cache in memoria (sia globale che granulare per catalogo).
- **Trigger Script:** Possibilità di avviare script di manutenzione (es. "Aggiorna Metadati", "Pulizia Cataloghi Vuoti") con un click.

## 3. Integrazione API per Agente AI
**Azioni Dettagliate:**
- Creare endpoint HTTP (es. `POST /api/admin/system/flush`) utilizzabili in modo programmatico.
- Permettere all'Agente AI di richiamare queste API per simulare o eseguire operazioni di manutenzione in autonomia durante i test o lo sviluppo.

## 4. Sicurezza dell'Area Admin
**Azioni Dettagliate:**
- Nessun sistema di registrazione pubblica per questa sezione.
- L'accesso deve essere governato da una master password conservata in modo sicuro nel file `.env` (es. `ADMIN_PASS`).
- Le richieste API verso l'admin panel devono prevedere un middleware di validazione severo (es. verifica header di autorizzazione).
