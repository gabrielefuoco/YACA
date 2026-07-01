# YACA AI Agent Global Rules

Queste regole si applicano a tutto il progetto YACA e definiscono il comportamento dell'agente. YACA è un progetto Node.js avanzato basato su Stremio, TMDB, Kitsu e un motore di raccomandazione bayesiano (VSM).

## 1. Analisi Architetturale Prima di Agire (Root Cause Analysis)
- Non applicare "workaround" o fix superficiali. Se un catalogo o un badge non si comporta correttamente, l'agente DEVE ispezionare l'intera pipeline:
  - `src/data/presets.js` (Filtri di origine)
  - `src/catalog/providers/AiDiscoveryProvider.js` (Fetch e merging)
  - `src/profile/ProfileScorer.js` (Affinità VSM e Bayesian Scoring)
  - `src/catalog/formatters/StremioFormatter.js` (Generazione metadati e logica visiva)
- **Quirks API TMDB**: L'endpoint `Discover` di TMDB ignora parametri negativi come `without_original_language`. Per escludere lingue (es. asiatiche) usa un approccio a whitelist positiva (`with_original_language: 'en|it|es|fr|de|pt'`). Attenzione anche a keyword troppo restrittive che azzerano i risultati scatenando i fallback.
- Controlla la cronologia Git (`git log`, `git diff`) per rintracciare quando e come un bug è stato introdotto in specifiche pipeline (es. fusione Kitsu/Anilist).

## 2. Test-Driven Development (TDD) e Validazione
- Ogni modifica a logiche di base DEVE essere verificata. L'agente deve sfruttare gli script di utilità nativi di YACA:
  - Usa `npm test` per validare le regressioni.
  - Usa `node scripts/test_relevance_all_presets.js` per validare i cataloghi.
  - **Tool MCP e Database**: Essendo l'app stateful, usa gli strumenti MCP di MongoDB (es. `mongodb-mcp-server/count`, `mongodb-mcp-server/find`) per interrogare il database Atlas in tempo reale durante il debugging, specialmente per controllare se i profili o i cataloghi sono duplicati o vuoti.
  - **Localizzazione**: YACA preferisce l'italiano. Qualsiasi correzione ai metadati deve dare priorità a `it-IT` come lingua per i `title` e le `description` (fallback su `en-US`).

## 3. Gestione e Invalidazione Cache
- **REGOLA AUREA**: YACA utilizza una cache L1 (RAM) e L2 (MongoDB `CacheEntry`). Se uno script aggiorna l'URL di una copertina, parametri di preset o configurazioni, usa `node scripts/clear_caches.js` per propagare immediatamente i cambiamenti.

## 4. Gestione Repository (GitHub) e Pulizia
- **Branch e Commit**: Creare branch dedicati per le lavorazioni (es. `feature/nome-feature`, `fix/nome-bug`) ed effettuare commit atomici con messaggi semantici.
- **Root Folder e File Temporanei**: Mantieni la root del progetto sempre pulita. Non lasciare script di test sparsi nella root; usa la cartella `scripts/` per le utilità permanenti o `.agents/scratch/` per i file usa-e-getta.
- **Documentazione**: Quando documenti nuove funzionalità, non inquinare il `README.md` o file generici di changelog. Crea file markdown specifici e modulari all'interno della cartella `docs/` (es. `docs/BADGES.md`, `docs/MAPPING.md`).

## 5. Comunicazione Interattiva (Slash Commands)
- In caso di decisioni di design complesse o ambigue, l'agente deve consigliare e incoraggiare l'utilizzo di comandi come `/grill-me` (intervista e Q&A) per allineare la visione tecnica prima di scrivere codice massivo.
- L'agente sa che l'utente preferisce tool flessibili da riga di comando (CLI) con argomenti opzionali, e che utilizza ampiamente output in JSON per lo sviluppo.

## 6. Ambiente e Deployment (Hugging Face & MongoDB)
- **Architettura**: YACA gira come container Docker su Hugging Face Spaces (Porta `7860`, con `--expose-gc` per gestire la memoria).
- **Cloudflare Worker Obsoleto**: Tutta la logica legata a Cloudflare Worker è stata rimossa dal progetto. Qualsiasi script (es. `npm run deploy:worker`) o implementazione proxy deve essere gestita nativamente tramite `axios` o `fetch` aggirando i blocchi IPv6.
- **Gestione Segreti**: Usa sempre il database stateful su **MongoDB Atlas** per salvare le configurazioni utente (`UserAccount`, `AddonConfig`).

## 7. Filosofia di Sviluppo (KISS e Ottimizzazione)
- **Semplicità e Soluzioni Native**: Evita di introdurre troppa complessità (es. filtraggi complessi degli array post-fetch). Cerca sempre la soluzione più nativa e intelligente (es. capire come usare correttamente i parametri delle API originali).
- **Minimizzare le Chiamate di Rete**: Qualsiasi soluzione progettata deve ridurre al minimo le chiamate verso servizi esterni (TMDB, Kitsu, ecc.). Sfrutta i caching layer già esistenti e prediligi la pre-elaborazione (es. preset statici esatti) rispetto al fetch iterativo.
- **Consultazione Documentazione**: Quando non sei sicuro di un comportamento di un'API (es. parametri validi per TMDB), usa SEMPRE lo strumento MCP `context7` per consultare la documentazione ufficiale prima di tentare soluzioni workaround.

## 8. Note Architetturali Chiave (VSM & Cache)
- **Vector Space Model (VSM) DNA**: Il sistema di raccomandazioni genera vettori per ogni utente (`TasteProfile`). Le chiavi hanno prefissi semantici: `g:` (Genere), `k:` (Keyword TMDB), `d:` (Regista), `a:` (Attore). Il profilo finale viene calcolato unendo lo storico pregresso e quello dinamico: `(V_static + V_active) / N° Interazioni = V_final`.
- **Ciclo di Vita della Cache**: Non esistono cronjob di pulizia manuale per la cache MongoDB (`CacheEntry`). La collection fa affidamento esclusivamente sugli **Indici TTL (Time-To-Live)** nativi di MongoDB, che distruggono autonomamente i documenti scaduti in background. Quando modifichi le impostazioni di caching, verifica sempre che il TTL index sia configurato correttamente.
