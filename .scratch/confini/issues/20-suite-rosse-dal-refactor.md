Status: resolved
Type: task

# 20 — Le suite che il refactor ha lasciato rosse

## Perché

La revisione di fine lavori (17/10/2026) ha eseguito **la suite intera** — cosa che nessuno aveva fatto durante la
notte, dove si sono corsi i file singoli. Risultato:

```
Test Suites: 6 failed, 1 skipped, 176 passed, 182 of 183
Tests:       13 failed, 3 skipped, 1797 passed
```

L'handoff del 17/10 dichiarava **4 suite rosse preesistenti**: quindi almeno due sono nostre. E leggendo i
fallimenti, l'attribuzione è questa:

| suite | fallimento | causa | di chi è |
|---|---|---|---|
| `heroPolicyAndTrakt` | `Expected "…heroes_v2_movie_kids"` / `Received "…heroes_v14_movie_kids_a_neutral"` | il test asserisce la **stringa della chiave di cache**, che è cambiata (v2 → v14 + il suffisso dei selettori) | **12 / 38-coda** |
| `heroPolicyAndTrakt` | `TypeError: buildHybridCatalog is not a function` | il builder è diventato una **voce del modulo pool** e non è più esportato | **12** |
| `heroDiversity` | `Expected 6 / Received 7` su `schemaVersion` | `HERO_CACHE_SCHEMA_VERSION` è stato alzato | **38-coda** |
| `heroDiversity` | «deduplica i quattro fallback freddi anche quando i builder falliscono» | il percorso dei fallback freddi è cambiato | **12** |
| `resilienceAuditFixes` | «manifest stream resource declaration includes anime» | **il 05 ha tolto `stream` da `buildManifest`** | **05 — e questa è una DECISIONE, non un test** |
| `heroMovieDateRegression` | 4 fallimenti su `releaseInfo` / pagina non azzerata | da attribuire: l'annotazione degli item è passata per il pool | **12 / 38-coda** (da verificare) |
| `metaHandlerEpisodeIds` | `Expected "1668", "tv", "test-key"` | da attribuire (il meta handler non è stato toccato: potrebbe essere preesistente) | **da verificare** |
| `searchTier2Merge` | ordinamento locale/Tier 2 e «indice assente» | da attribuire (`CatalogRouter` + tier2; il 10 ha toccato `src/api/tmdb.js`) | **da verificare** |

## La domanda vera, prima delle altre

`resilienceAuditFixes` contiene un test che si chiama *«manifest stream resource declaration includes anime»*: cioè
**qualcuno aveva dichiarato la risorsa `stream` nel manifest di proposito**, e il ticket 05 l'ha tolta (su consiglio
della revisione esterna: «se rimuovi `streamHandler`, togli anche la voce dal manifest»).

**Una dichiarazione nel manifest è un contratto con Stremio**: togliendola, i client smettono di vedere la risorsa.
La rotta c'è ancora (tre righe inline, `res.json({ streams: [] })`), quindi il gesto non rompe i client che hanno il
manifest in cache — ma **i nuovi client non chiederanno più gli stream**, e per un addon questo è un cambio di
superficie. Va deciso: o si **rimette** la dichiarazione (la rotta c'è, e risponde vuoto), o si **accetta** di non
esporre la risorsa e si aggiorna il test spiegando perché.

**Questa decisione è già in produzione** (il 05 è stato pushato alle 07:20): quindi non è teoria.

## Cosa deve uscire

1. **La decisione sulla risorsa `stream`**, presa e scritta (con il perché), e il test allineato di conseguenza.
2. **Le altre suite**: ognuna sistemata nella direzione giusta — e la direzione giusta è *aggiornare il test quando
   asserisce un dettaglio che il refactor ha cambiato di proposito*, oppure *sistemare il codice quando il test
   asserisce un comportamento che doveva restare*. La differenza va detta caso per caso, non decisa in blocco.
3. **L'attribuzione delle due «da verificare»**: eseguire i due file sul commit `03b14c0` (prima della notte) e
   dire se erano rossi anche lì. Se lo erano, sono preesistenti e si dichiarano tali; se no, sono nostre.
4. **Il numero finale**: la suite intera deve tornare a **4 suite rosse preesistenti** (o meno, se qualcuna delle
   quattro era già stata sistemata). Il comando è `npx jest --forceExit --silent` (~2 min 35 s), e va eseguito
   **prima e dopo**.

## Come si verifica

Il conteggio della suite intera prima e dopo (non i file singoli: è proprio la corsa per-file che ha lasciato
passare queste), e per ogni suite toccata il fallimento citato **con la sua riga** nel ticket.

## Nota di metodo

Questo ticket esiste perché la revisione di fine lavori ha fatto la cosa che l'anello veloce non fa: **la suite
intera**. Le prove per-file sono giuste per lavorare e insufficienti per chiudere: dieci ticket integrati in fila
si vedono solo insieme.

---

## La domanda sulla risorsa `stream`: RISOLTA (17/10/2026) — non è una decisione da riprendere

Verificata col proprietario e **con la documentazione della repo stessa**:

- `docs/STREMIO_INTERNALS.md:80` → *«**YACA non fa più da proxy ai flussi** (commit `6443a87`). `streamHandler.js` è
  oggi un guscio di 31 righe che ritorna `{ streams: [] }`»*. La dichiarazione `{ name: 'stream', types:
  ['movie','series','anime','other'], idPrefixes: ['tt','tmdb:','kitsu:'] }` è **il residuo di quell'epoca**: quei
  prefissi servivano a far arrivare al proxy le richieste di flusso in tutte le forme che sapeva leggere;
- **non serve agli anime**: il routing dei metadati anime passa dal **`meta`** (dichiarato con `anime`/`other` e il
  prefisso `kitsu:`, `docs/STREMIO_INTERNALS.md:139`), e gli stream anime li servono **altri addon** (Anime Kitsu,
  Torrentio) sulle loro richieste, coi prefissi del provider (`§2`). La risposta di YACA è vuota per costruzione;
- il test che la difendeva è una **regex sul testo del sorgente**, aggiunta in `6a614e6` (*«snapshot del lavoro in
  corso prima del merge dei fix»*): fotografa com'era, non dice perché.

**Quindi**: il ticket 05 ha fatto bene, non c'è niente da rimettere, e il lavoro di questo ticket su quella voce è
**allineare il test** citando `6443a87` e `docs/STREMIO_INTERNALS.md:80` — altrimenti il prossimo che lo legge crede
che sia stata tolta una cosa viva. La rotta resta (tre righe inline, `{streams: []}`): è la regola della doc,
*payload vuoto con 200, mai un errore*.

---

## Triage e Classificazione Post-Merge (17/10/2026)

Integrati i 5 refactor sbarcati su `main` (commit `5a9c789`):
- Ticket 21: Modulo Profilo (`src/profile/`, anagrafica profili, `contestoDi`, `selettoriEffettivi`)
- Ticket 22 (prima metà): Indice di ricerca e compilatore parametrizzato (`src/indice/`, `buildCatalogQuery`)
- Ticket 23: Tipo Catalogo (`src/catalog/`)
- Ticket 24: Modulo Cache (`src/cache/`, derivazione chiavi da descrizione)
- Ticket 25: Modulo Poster (`src/posters/`, ERDB, coda eventi, drenatore)

### 1. Riepilogo suite allineate e verificate verdi (8 suite)

| Suite | Tipo allineamento | Riferimento refactor / ticket |
|---|---|---|
| `tests/heroMovieDateRegression.test.js` | Confermato verde (13/13) | Integrato pulito con Ticket 23 e 24 |
| `tests/resilienceAuditFixes.test.js` | Allineato manifest stream e Mongoose mock (14/14 verde singolo) | Ticket 05 (`docs/STREMIO_INTERNALS.md:80`) e Ticket 21 |
| `tests/heroPolicyAndTrakt.test.js` | Allineato a cache da descrizione (`v14_...`) e profilo `kidsMode` (9/9) | Ticket 21 e Ticket 24 |
| `tests/heroDiversity.test.js` | Aggiunti mock `UserAccount` e `AddonConfig` per `contestoDi` (7/7) | Ticket 21 (evita timeout buffering Mongoose) |
| `tests/heroAnimeTypeSelectors.test.js` | Mock `AddonConfig.findOne` reso dinamico per `liveaction_user` / `anime: 'exclude'` (8/8) | Ticket 21 (risoluzione contesto profilo) |
| `tests/heroPoolAnimeExcludeCap.test.js` | Mock `UserAccount` e `AddonConfig.profiles` forniti a `contestoDi` (1/1) | Ticket 21. **Verificato**: la misura del Ticket 38 è integra (cap 20 post-filtri) |
| `tests/staticPostersCoda.test.js` | Mock aggiornato su `src/posters/codaEventi` (10/10) | Ticket 25 (coda spostata da `cache` a `posters`) |
| `tests/stremioProtocolFixes.test.js` | Asserzione `querySpy` allineata a query parametrizzata `LIMIT ? OFFSET ?` (6/6) | Ticket 22 prima metà (compilatore parametrizzato) |

---

### 2. Risoluzione delle due attribuzioni dubbie

1. **`tests/metaHandlerEpisodeIds.test.js` — Preesistente (04/10/2026)**:
   - Fallisce su riga 175 (`resolveImdbId` network spy mai chiamato) e riga 201 (`tt0108778:1:1` invece di `tmdb:1668:1:1`).
   - **Causa**: Commit `947163b` (*«L'id IMDb si legge dal dump e gli speciali vanno in fondo alla lista»*, 04/10/2026). `metaHandler` risolve l'ID IMDb interrogando localmente il dump DuckDB (`resolveImdbIdFromDump`). La funzione di rete `resolveImdbId` non viene mai chiamata quando l'ID è nel dump (Friends: 1668 è presente), e il dump trova sempre `tt0108778`. Il test era rimasto a verificare la vecchia implementazione di rete.
   - **Attribuzione**: Preesistente al lavoro notturno, risalente al 4 ottobre 2026.

2. **`tests/searchTier2Merge.test.js` — Verde / Ambientale (17/10/2026)**:
   - In ambiente pulito/isolato (`LEARNED_NAMES_DB` su file temporaneo): **24 passed su 24 (100% verde)**.
   - **Causa del rosso locale**: Sul worktree locale esiste il file SQLite `.cache/tmdb/learned_names.db` contenente il record appreso `"Batman: Maschera del Fantasma"` (tmdbId 414906). Quando il router di catalogo esegue la ricerca standard per `"batman"`, interroga anche `searchLearnedTitles`, che estrae il record dal disco e lo appende (41 item invece dei 40 attesi dal test).
   - **Attribuzione**: L'algoritmo del Ticket 22 è corretto; il fallimento è dovuto unicamente all'inquinamento dello stato su disco locale.

---

### 3. Triage delle 11 suite rosse rimanenti (`npx jest --forceExit --silent`)

Risultato suite completa post-allineamenti:
```
Test Suites: 11 failed, 1 skipped, 176 passed, 187 of 188 total
Tests:       71 failed, 3 skipped, 1811 passed, 1885 total
```

| Suite | Categoria | Dettaglio fallimento e Causa |
|---|---|---|
| `tests/drenaPoster.test.js` | **Comportamentale** | Riga 331, test *«scrittura che fallisce: nessun .tmp residuo»*. In `src/posters/drenaPoster.js:206-208` (introdotto nel Ticket 25, commit `757a85e`), `scrivi()` intercetta `err.code === 'EPERM' \|\| err.code === 'EBUSY'` e ritorna silenziosamente se `fs.existsSync(target)` è true. Su Windows un rename atomico verso una directory preesistente solleva `EPERM`; `scrivi()` ingoia l'errore e chiude l'evento con `done` anziché `fail` (`resi: 1, falliti: 0`). **Difetto comportamentale nel codice di produzione**. |
| `tests/metaHandlerEpisodeIds.test.js` | **Strutturale (Preesistente)** | Righe 175 e 201: `resolveImdbId` non chiamato via rete perché `resolveImdbIdFromDump` trova l'ID nel dump locale. Preesistente da commit `947163b` (04/10/2026). |
| `tests/retireTmdbScoringData.test.js` | **Ambientale / Rete** | Riga 128: Describe 3 invoca `metaHandler` con chiave fittizia senza mock di rete TMDB, fallendo con HTTP 401. Preesistente da commit `419676d` (20/09/2026). Describe 1 e 2 (parquet senza Mongo) passano al 100%. |
| `tests/searchTier2Merge.test.js` | **Ambientale** | 2 fallimenti dovuti al database locale `.cache/tmdb/learned_names.db`. 100% verde (24/24) se eseguito in ambiente pulito. |
| `tests/duckDbPresetsValidation.test.js` | **Ambientale (Concorrenza Windows)** | `catalog.duckdb.tmp` bloccato in I/O da processi concorrenti durante l'esecuzione parallela multi-worker. Eseguito singolarmente è 100% verde (4/4, 17.7s). |
| `tests/animeOverridesCertify.test.js` | **Ambientale (Concorrenza Windows)** | Collisione DuckDB durante la corsa multi-worker. Eseguito singolarmente è 100% verde (3/3). |
| `tests/duckDbAndMatchmaker.test.js` | **Ambientale (Concorrenza Windows)** | Collisione DuckDB su `catalog.duckdb.tmp`. Eseguito singolarmente è 100% verde (23/23). |
| `tests/ticket14TitlePolicy.test.js` | **Ambientale (Concorrenza Windows)** | Collisione DuckDB multi-worker. Eseguito singolarmente è 100% verde (12/12). |
| `tests/presetBurtonOrdering.test.js` | **Ambientale (Concorrenza Windows)** | Collisione DuckDB multi-worker. Eseguito singolarmente è 100% verde (1/1). |
| `tests/donghuaCatalog.test.js` | **Ambientale (Concorrenza Windows)** | Collisione DuckDB multi-worker. Eseguito singolarmente è 100% verde (4/4). |
| `tests/sottosogliaVisibility.test.js` | **Ambientale (Concorrenza Windows)** | Collisione e corruzione temporanea schema DuckDB durante i test concorrenti. Eseguito singolarmente su database pulito è 100% verde (24/24). |

## Aggiornamento (18/10/2026) — la suite è verde, e la preesistente è risolta

Dopo i merge dei ticket 27, 28, 29, 32 (entrambi i lati), 35, 36, 38, 39 e `t39`, la suite intera dà:

```
Test Suites: 1 skipped, 189 passed, 189 of 190
Tests:       4 skipped, 1915 passed, 1919 total
```

**Zero fallimenti.** E `metaHandlerEpisodeIds` — l'unica rossa dichiarata *preesistente* (04/10, commit
`947163b`) e segnata «da verificare» nella tabella qui sopra — **passa 5/5**: l'ha risolta il modulo anime
(`48fa30a`), che ha cambiato la forma con cui gli id degli episodi vengono normalizzati. Non è uno skip: è una
risoluzione, verificata eseguendola.

Le uniche escluse sono le 4 che dipendono dalla rete (`retireTmdbScoringData` e le sue), dichiarate tali dal
ticket 29.
