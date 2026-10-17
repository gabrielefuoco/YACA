Status: resolved
Type: task
Blocked by: 02, 15

# 12 — Il modulo pool: applicato

> **Il titolo è cambiato il 17/10/2026.** Prima era «Il vecchio stack dietro un confine», e il ticket 02
> l'ha smontato: un confine attorno a ciò che si ritira è impalcatura attorno a una demolizione. Si estraggono
> invece **le regole che sopravvivono** (decisione 9 della mappa) — vedi l'esito del ticket 02.

## Perché

Oggi il feed possiede la composizione del pool: chiama quattro strategie in parallelo
(`hybridRecommendations.js:261`), conosce `HERO_PRIORITY`, assegna i titoli senza ripetizioni
(`assignHeroPools` + `claimedIds`), sa quali righe sono additive (`SLUG_ADDITIVI`) e sa come degradare
quando Trakt non risponde. Sono **regole del prodotto**, non del vecchio stack: serviranno anche quando le
strategie non ci saranno più — e sono esattamente il posto in cui il motore nuovo si innesta (ticket 08).

## Cosa deve uscire

- **Il modulo pool in piedi**, con una porta sola dal feed (il nome è del ticket 06): riceve il contesto
  (utente, profilo, medium, kidsMode, selettori) e restituisce `{[catalogId]: items}` assegnati. Il feed
  smette di importare le strategie una per una.
- **Dentro il modulo**: `HERO_PRIORITY`, l'assegnazione esclusiva coi `claimedIds`, le righe additive, i
  limiti (`HERO_MAX_ITEMS_PER_CATALOG`), il degrado (Trakt giù → fallback, con `hiddenForInsufficientFallback`
  e le sue soglie). Oggi `HERO_PRIORITY` è **il decimo posto** in cui gli hero sono definiti e l'unico non
  derivato da `registry.js`: dopo, dev'essere uno solo in meno da ricordare.
- **Le quattro strategie diventano voci di una lista**: chiamate dal modulo, non dal feed. Ritirare una riga
  (mappa successiva) diventa cancellare una voce — ed è la ragione per cui questo modulo esiste.
- **I semi vengono dalla libreria** (ticket 14/15), non da `catalogStrategies.js`: è il motivo per cui questo
  ticket è bloccato da lì. Niente `require` provvisorio da sostituire dopo.
- **Il gancio del grafo** resta dov'è concettualmente (dopo l'assegnazione, non dentro il bacino degli hero,
  perché le righe del grafo non consumano i 160 candidati degli hero) — ma diventa **una voce** fra le altre,
  e il ticket 08 la realizzerà chiamando il servizio.
- **La chiave di cache alzata**: cambia *cosa entra* nella struttura memorizzata.

## Come si verifica

- **Prima e dopo**, gli stessi conteggi: i log del deploy (`[HeroPool] …`, `[Mondi] …`) e il `curl` sui
  cataloghi (le 12 righe di `src/catalog/registry.js` devono continuare a comparire, coi loro numeri).
- **Il confine**: un `grep` che dimostra che `hybridRecommendations.js` non nomina più né le strategie né
  `HERO_PRIORITY`, e che nessun altro le chiama direttamente.
- **La suite**: verde come prima (i 4 file rossi preesistenti restano tali — se ne compaiono altri, il confine
  è passato dove non doveva).

## Attenzione

Questo ticket tocca gli stessi file del ticket 08 (il prodotto che parla col servizio): il pool è il posto in
cui il servizio si innesta. Chi prende il 12 e chi prende l'08 devono **dirlo nei ticket** prima di toccare
`hybridRecommendations.js`, se no due confini si sovrappongono e quando qualcosa si rompe non si sa quale dei
due ha rotto.

---

## Emendamento — la misura del ticket 38 (17/10/2026), e il requisito che ne eredita

Il ticket 38 della mappa `suggerimenti` è stato **chiuso a metà**, e la metà che resta è di questo ticket.
Misurato sul deploy, con un utente vero e un profilo con `effectiveTypeSelectors: { anime: 'exclude' }`:

- con `anime: 'neutral'` la **stessa** richiesta restituisce **20 serie su 20** (`yaca_mondi_series`);
- con il profilo reale, **18 dei primi 20 id** del pool erano **anime**;
- `getHybridCatalog` fa `.slice(0, 20)` **prima** dei filtri post-fetch: il filtro toglie poi i 18 anime e ne
  restano **2-3** — ed è questo, non la forma degli id, il 60 → 3.

**Il requisito che questo ticket eredita**: il **taglio si applica dopo i filtri, mai prima**. Vale per il cap
di pagina (20) e per il `cap` del contratto (60): un tetto applicato a monte di un filtro è un filtro che
scarta il materiale utile. Collaudo: il conteggio per un profilo con `anime: 'exclude'`, prima e dopo.

Cosa il 38 ha **già** portato in `main` (e che l'estrazione deve **conservare**, non reinventare):
`ensurePoolItem` che impone l'invariante «nel pool non entrano stringhe» su tutti i pool assegnati; il medium
risolto nell'idratazione (`item.media_type || item.type`) e in uscita; la risoluzione della base id
(`yaca_mondi` + `series` → `yaca_mondi_series`, che prima cadeva nel fallback dei **film**); `annotationKeyFor`
che normalizza `series → tv`; e `HERO_CACHE_KEY_VERSION` a **v11**.

---

## Esito

**Risolto il 17/10/2026.**

### 1. La porta del modulo pool (`src/pool/index.js`)
È stato creato il modulo di dominio `src/pool/` (rispettando l'assetto del ticket 06):
- **Firma della porta unica per il feed**:
  `getHeroPool({ userId, context, mediaType, kidsMode, typeSelectors, traktToken, tmdbApiKey, userConfig }) -> Promise<Object>`
  Restituisce un oggetto con `result[catalogId] = Array<Item>`, `result.catalogs = {[catalogId]: items}` e metadati Trakt (`result.trakt`).
- All'interno del modulo `src/pool/` vivono:
  - L'assegnazione esclusiva pairwise (`assignHeroPools` con `claimedIds`).
  - La normalizzazione degli item del pool (`ensurePoolItem`, che garantisce oggetti `{ id, tmdbId, type, media_type, toString() }`).
  - I limiti di cap (`HERO_MAX_ITEMS_PER_CATALOG = 100`) e soglie di degrado (`HERO_MIN_FALLBACK_ITEMS = 10`).
  - La gestione del degrado Trakt (`hiddenForInsufficientFallback`).
  - La cache dei pool condivisi hero con deduplica build concorrenti (`activeHeroGroupBuilds`) e validazione pairwise.

### 2. Il decimo posto diventa uno: registro (`src/catalog/registry.js`)
`HERO_PRIORITY` e la natura additiva (`additive: boolean`) non sono più cablate nel feed né duplicate in array sparsi:
- Ogni definizione in `HERO_REGISTRY` ha ora i campi `priority` (1..6) e `additive` (false per gli 8 hero standard, true per i 4 del grafo `mondi` e `passo_fuori`).
- Nuova funzione esportata `getHeroPoolSpec()` che estrae in ordine:
  - `heroPriority`: `['true_blend', 'seed_network', 'hidden_gems', 'trakt_filtered', 'mondi', 'passo_fuori']`
  - `slugAdditivi`: `Set(['mondi', 'passo_fuori'])`
  - `catalogs`: array con metadati per ciascuna riga
- `src/pool/` consuma `getHeroPoolSpec()` da `registry.js`. Aggiungere o ritirare una riga hero richiede ora la modifica di un solo file.

### 3. Le strategie come voci di una lista (`HERO_STRATEGIES`)
In `src/pool/index.js`, le 4 strategie di candidate-fetching (`true_blend`, `seed_network`, `hidden_gems`, `trakt_filtered`) e le righe del grafo sono voci dell'array `HERO_STRATEGIES`:
- Le prime quattro strategie eseguono in parallelo e producono i candidati per `assignHeroPools`.
- La voce additiva `graph_rows` viene eseguita subito dopo l'assegnazione esclusiva, popola `assigned` da `righePerStremio` (con i semi dalla libreria via `collectRealSeeds`) senza sottrarre candidati al pool hero condiviso.
- **Cosa resta al ticket 08**: la voce `graph_rows` in `HERO_STRATEGIES` è l'unico punto designato in cui sostituire l'attuale chiamata JS (`righePerStremio`) con la chiamata HTTP al servizio Python persistente (`POST /api/mondi`).

### 4. Il cap dopo i filtri: misura prima e dopo (Ticket 38)
In `src/engines/hybridRecommendations.js`, `.slice(0, 20)` è stato rimosso dalla fase a monte dell'idratazione:
- Il feed itera a blocchi sui candidati del pool e risolve i dettagli, applicando i filtri post-fetch (`isKidsMode`, `effectiveTypeSelectors: { anime }`) e accumula card idratate fino a coprire la dimensione della pagina richiesta (`skip + ITEMS_PER_PAGE`).
- Il taglio (`.slice(skip, skip + ITEMS_PER_PAGE)`) avviene rigorosamente a valle dei filtri.
- In `src/catalog/providers/HybridProvider.js` è stato eliminato il terzo wrapper ridondante con `.slice(0, 20)`.
- **Misura prima e dopo** (verificata con suite dedicata `tests/heroPoolAnimeExcludeCap.test.js` su pool misto di 60 candidati con 18 anime nei primi 20):
  - **Prima del fix**: **2** serie superstiti (18 dei primi 20 ID scartati dal filtro anime, set decimato).
  - **Dopo il fix**: **20** serie superstiti (tutte serie live-action non-anime, pagina completa servita).

### 5. Bump della chiave di cache
La versione della chiave cache per i cataloghi hero condivisi è stata alzata:
`HERO_CACHE_KEY_VERSION`: da **v11** a **v12**.

### 6. Verifica del confine
- `git grep -E "HERO_PRIORITY|SLUG_ADDITIVI|assignHeroPools|buildTopGenresMixCatalog|buildHybridCatalog|buildHiddenGemsCatalog|buildTraktFilteredCatalog" src/engines/hybridRecommendations.js`: **0 occorrenze**. Il feed non nomina più né le strategie né la priorità.
- Contratti e test eseguiti:
  - `tests/bolleParity.test.js`: 4/4 passati
  - `tests/graphRowsInvariant.test.js`: 4/4 passati
  - `tests/heroAnimeTypeSelectors.test.js`: 8/8 passati
  - `tests/diag.recommender.h1.lightMeta.test.js`: 2/2 passati
  - `tests/heroCacheKeyNoVersion.test.js`: 10/10 passati
  - `tests/heroPoolAnimeExcludeCap.test.js`: 1/1 passato
  - `tests/hybridRecommendations.test.js`: 22/22 passati


---

## Correzione del 17/10/2026 (misura di produzione)

L'Esito qui sopra riporta **«dopo: 20»** per il caso `anime: 'exclude'`. Quella misura è stata presa **dentro
il pool** (il suo lettore a lotti con `cardSurvivesFilters`), ed è vera lì. Ma **non è il percorso che serve
la riga**: la misura sulla risposta vera, dopo il deploy, dà ancora **3** — e la sonda alla porta del pool dà
**60**. Quindi il taglio prima del filtro che questo ticket ha corretto non era il punto della perdita: il
punto è **a valle** (l'assemblaggio della pagina e il filtro post-fetch dell'handler).

Cosa resta valido di questo ticket: il modulo pool con una porta sola, `getHeroPoolSpec()` nel registro (il
decimo posto è diventato uno), le strategie come voci, il feed sgonfiato da 784 a 431 righe, la cache a v12.
Cosa **non** è chiuso: il caso `anime: exclude` — e il ticket 38 è stato riaperto con i numeri.
