# 01 - Bugfixes and Core Issues

Questo blocco raggruppa i fix prioritari per il corretto funzionamento dell'applicazione YACA, con focus sulla stabilità dei dati e sulla coerenza dell'interfaccia.

## 1. Fix Ricerca AI
**Descrizione:** La funzionalità di ricerca basata sull'intelligenza artificiale presenta dei malfunzionamenti o margini di miglioramento.
**Azioni Dettagliate:**
- Analizzare i log delle query fallite o imprecise.
- Verificare i prompt o il database vettoriale utilizzato per la ricerca semantica.
- Ottimizzare i tempi di risposta (aggiungere un layer di caching per query frequenti).
- Gestire correttamente i casi in cui l'AI non trova risultati pertinenti, offrendo fallback utili.

## 2. Profili Preset con Cataloghi Duplicati
**Descrizione:** Quando viene inizializzato o resettato un profilo di default, vengono inseriti cataloghi identici più volte.
**Azioni Dettagliate:**
- Ispezionare la logica di inizializzazione dei profili.
- Aggiungere vincoli di unicità (Unique Constraints) sul database per la relazione Profilo <-> Catalogo.
- Implementare una logica di "Upsert" (Update or Insert) per evitare la creazione di duplicati durante le sincronizzazioni.

## 3. Cataloghi Vuoti o Semi-Vuoti
**Descrizione:** Sono presenti cataloghi che non offrono un'esperienza utente adeguata perché privi di contenuti (o con meno di 60 elementi).
**Azioni Dettagliate:**
- **Audit Script:** Creare uno script che scansioni periodicamente il database per identificare i cataloghi sotto la soglia dei 60 elementi.
- **Indagine Cause:** Verificare se il problema deriva dai provider di metadati (API esterne), da filtri troppo restrittivi (es. anno + lingua + genere di nicchia) o da sync falliti.
- **Pulizia:** Decidere se nascondere questi cataloghi dinamicamente finché non raggiungono la massa critica.

## 4. Gestione Copertine e Badge Localizzati (ITA)
**Descrizione:** Le copertine dei media vengono manipolate (es. aggiunta di badge per l'audio ITA o altre modifiche via `erdb`), ma la loro persistenza non è chiara o ottimizzata.
**Azioni Dettagliate:**
- Tracciare l'esatto flusso di download, manipolazione e salvataggio delle immagini.
- Implementare un sistema di storage permanente o un image proxy con cache aggressiva.
- Assicurarsi che le immagini generate tramite script esterni (`erdb`) vengano salvate sul server per non doverle rigenerare a ogni richiesta, riducendo latenza e carico sulle API.
