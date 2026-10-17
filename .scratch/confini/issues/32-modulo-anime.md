Status: needs-triage
Type: research

# 32 — La logica anime: due metà, tre cartelle, un confine attraversato

## La domanda

«La logica anime è complessa: c'è il mapping, c'è il pezzo che decide se un elemento è anime, c'è il pezzo che
prende il catalogo simulcast da AnimeUnity. Questi dovrebbero stare insieme in un modulo separato.»
Verificato: **è vero**, e la ricognizione dice esattamente dove tagliare.

## Com'è oggi, misurato

**Metà A — chi *produce* i dati: già un servizio** (`services/anime-source/`, container, ciclo suo, volume suo).
**3.133 righe** in 8 file: `aggregate.js` (671) · `identity.js` (756) · `animeunity.js` (589, **lo scraper del
simulcast**) · `discovery.js` (465) · `tmdbFallback.js` (295) · `store.js` (128, **scrive su Mongo
`anime_airing_state`**) · `tvdbBridge.js` (122) · `overrides.js` (107) + `data/anime-overrides.json`.
Esiste anche `services/doppiaggi-source/` (la stessa forma, per le annotazioni italiane).

**Metà B — chi *legge e decide*: dentro l'app, in TRE cartelle.** **1.865 righe**:
| file | righe | cosa fa | dove dovrebbe stare |
|---|---|---|---|
| `src/data/animeMappingStore.js` | 688 | scarica da sé i dump Anibridge+Fribb (ogni 12 h), tiene gli id anime, li dà all'SQL | modulo anime |
| `src/data/animeAiringState.js` | 746 | legge lo snapshot Mongo `anime_airing_state` (L1 60 s, non lancia mai) | modulo anime |
| `src/utils/animeIdentity.js` | 280 | marcatori, id, `isAnimeContent`, `normalizeTipoAnime` | modulo anime |
| `src/engines/hybrid/animePolicy.js` | 151 | **la decisione**: ONLY / FAVORED / EXCLUDE, moltiplicatori di punteggio | modulo anime |

**Chi li usa (12 file, in ogni modulo):** `catalog/providers/{AiringStateProvider,DuckDbProvider}.js`,
`catalog/formatters/StremioFormatter.js`, `clients/tmdb.js`, `db/duckDbStore.js` (gli id anime **dentro l'SQL**),
`profile/{ProfileScorer,selettoriEffettivi}.js`, `data/filters.js`, `pool/index.js`,
`handlers/catalogHandler.js`, `engines/hybrid/catalogStrategies.js`.
Totale della materia: **~5.000 righe** (13% del codice) per **una dimensione del catalogo**.

## I tre difetti che questa ricognizione ha trovato

1. ⚠️ **La decisione anime vive dentro il blocco da cancellare.** `animePolicy.js` sta in `src/engines/hybrid/` —
   cioè fra le **6.278 righe del vecchio stack** che la mappa vuole cancellare — mentre è chiamata dai moduli
   **nuovi** (`profile`, `catalog`, `pool`). Chi cancella il vecchio stack senza spostarla prima **cancella la
   decisione anime** e il guasto non è un errore: è un comportamento diverso che nessun test copre.
2. ⚠️ **L'app entra nella cartella del servizio con un `require`**, non con un contratto:
   `src/data/animeMappingStore.js:10-18` fa `require('../../services/anime-source/src/overrides')`, con un
   secondo tentativo e **un ripiego silenzioso** (`() => ({ version: 1, identities: [], certify: [] })`).
   Funziona solo perché il Dockerfile fa `COPY . .` e il `.dockerignore` esclude `services/graph/` ma **non**
   `services/anime-source/`. Aggiungere `services/` al `.dockerignore` — cosa che sembra ovvia — spegne gli
   override anime **senza un errore, senza un log**. È il confine attraversato nella direzione sbagliata.
3. **Il mapping è fatto due volte.** L'app scarica Anibridge + Fribb da sé; il servizio ha `identity.js` (756),
   `tvdbBridge.js`, `tmdbFallback.js`. Due implementazioni di «che cos'è questo anime» che possono divergere, e
   nessuno sa quale delle due ha ragione quando divergono.

## La proposta: un modulo `src/anime/`, una porta sola

**Dentro l'app**, un modulo che possiede la materia: identità (marcatori, id, `isAnimeContent`) + decisione
(policy, punteggi) + i due store (mapping, airing). Una porta sola; i 12 consumatori smettono di entrare in
`data/`, `utils/` e `engines/hybrid/`.
**Fuori**, il servizio resta chi **produce**: scrapa AnimeUnity, risolve le identità, scrive lo snapshot.
**La cucitura è già un contratto vero**: MongoDB `anime_airing_state` (schema version 1) — il servizio scrive, il
modulo legge, e non si toccano per `require`.

**Il vincolo che decide la forma della cucitura**: gli id anime finiscono **dentro l'SQL**
(`db/duckDbStore.js:276-279` costruisce le liste da `animeTmdbIdsMovie/Show`). Quindi il *mapping* deve essere
**locale al processo** — un file o una tabella letta all'avvio, **non** una chiamata HTTP al servizio. Chi
progettasse «l'app chiede il mapping al servizio» romperebbe la query.

## Le domande aperte (da grigliare prima di implementare)

1. **Chi possiede «che cos'è un anime»**: l'app (280 righe) o il servizio (756)? O è un pacchetto condiviso?
   Se restano due, va scritto **quale vince** quando divergono.
2. **Il mapping (Anibridge/Fribb) lo scarica ancora l'app** o diventa un artefatto del servizio? Il vincolo sopra
   dice che deve restare locale: la scelta è *chi lo produce*, non *dove vive*.
3. **Gli override** (`data/anime-overrides.json` + `overrides.js`): artefatto su Mongo, file copiato
   deliberatamente nell'immagine, o pacchetto? Oggi sono un `require` attraverso il confine con un ripiego muto.
4. **`animeAiringState` legge Mongo direttamente** con `mongoose.connection.db` senza un model: nel modulo anime
   va tenuto così (niente model) o diventa un documento con lo schema dichiarato?

## Ordine e verifica

**Ordine**: il modulo anime si fa **prima** di cancellare il vecchio stack (difetto 1) e **dopo** il ticket 28
(che sposta `duckDbStore.js`, consumatore degli id anime). **Verifica**: nessun `require` di `services/` da
`src/`; nessun file anime fuori da `src/anime/`; i 12 consumatori ripuntati; e le suite che coprono anime e
cataloghi verdi una alla volta.
