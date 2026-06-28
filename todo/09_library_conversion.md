# 09 - Conversione Libreria Utente

Gestire il delicatissimo processo di onboarding in cui un utente porta tutta la sua storia su YACA al primo avvio.

## 1. Workflow del Primo Avvio (Onboarding)
**Azioni Dettagliate:**
- Riconoscere il "primo login" dell'utente tramite un flag nel DB.
- Avviare un job in background che gestisca la massiccia importazione dei dati per non bloccare l'interfaccia utente.

## 2. Importazione Libreria Stremio
**Descrizione:** Azione distruttiva (o comunque ad alto impatto) che converte la libreria nativa.
**Azioni Dettagliate:**
- Richiedere le API interne di Stremio per scaricare la libreria.
- Effettuare un mapping complesso: identificare ogni media, risolverlo nei metadati TMDB associati a YACA, e salvarlo nei database di YACA.
- Attenzione: sovrascrivere o manipolare la libreria Stremio dell'utente richiede permessi e garanzie di rollback in caso di errore.

## 3. Conversione Watching List e Sync Trakt
**Azioni Dettagliate:**
- Analizzare la lista degli "in corso di visione" (Watching) e portarla all'interno dei binari di YACA.
- Sincronizzare questo stato con Trakt (controllare l'eventuale codice già esistente, scrivere test per validare che non generi progressi duplicati o fittizi).

## 4. Generazione "Libreria Tematica"
**Descrizione:** Valorizzare immediatamente l'importazione.
**Azioni Dettagliate:**
- Analizzare la libreria appena importata, scorporarla e creare dinamicamente cataloghi dedicati (es. "I tuoi Anime", "Le tue Serie TV preferite").
- Iniettare immediatamente questi nuovi cataloghi nel profilo utente, così che al primo accesso a Stremio trovi già contenuti altamente personalizzati.
