# Internals di Stremio e Workaround Tecnici di YACA

Questo documento descrive le soluzioni tecniche e i workaround ingegneristici implementati in **YACA** per superare i vincoli nativi della piattaforma Stremio, con particolare focus sulla gestione dei profili utente, sul mapping degli ID per gli Anime e sulla gestione della cache dei manifest.

---

## 1. Gestione dei profili utente

I profili YACA sono creati, modificati e selezionati nella configurazione web. Il profilo attivo e i cataloghi personalizzati vengono salvati nella configurazione utente e riflessi nel manifest dinamico.

Il client Stremio non offre un meccanismo nativo per cambiare profilo dall'interno dell'addon. Per questo YACA non espone un controllo di profilo tra i cataloghi e non modifica il profilo attivo in risposta a richieste del client: il cambio profilo va effettuato dalla configurazione web.

---

## 2. Mapping e Idratazione degli Anime (Hybrid Anime Mapping)

### Il Problema
Le piattaforme di streaming collegate a Stremio (come Torrentio o Anime Kitsu) gestiscono i flussi per gli anime unicamente se la richiesta contiene l'ID nativo di Kitsu (formato `kitsu:<kitsuId>:<episode>`). 
Tuttavia, i motori di raccomandazione di YACA e le API di ricerca globale operano prevalentemente su metadati TMDB (formato `tmdb:<tmdbId>`), che forniscono catalogazione, generi e affinità nettamente superiori per l'AI.

> **Misurato il 03/10/2026 — la forma dell'id decide chi risponde.** Lo stesso principio vale per le **serie**, non solo per gli anime. Interrogando Torrentio con due forme dello stesso episodio:
>
> | id richiesto | stream restituiti |
> |---|---|
> | `tt0108778:1:1` | **53** |
> | `tmdb:1668:1:1` | **0** |
>
> La forma `tmdb:` **non è capita** dagli addon di streaming: la convenzione dell'ecosistema è IMDb. Sintomo per l'utente: "mi funziona una sorgente su tre", e cliccando un episodio sembra sempre lo stesso.
>
> **La regola**: gli id dei video (`meta.videos[].id`) vanno costruiti in forma IMDb (`tt…:S:E`) **quando l'id IMDb è noto**, qualunque forma abbia usato la richiesta. L'id della **serie** (`meta.id`) invece resta quello della richiesta — Stremio tiene libreria e stato "visto" sull'id del titolo, e cambiarlo azzera la libreria dell'utente. Cambiano **solo** gli id degli episodi.
>
> Nota: l'id IMDb per un titolo Tier 1 va risolto **dal dump DuckDB** (colonna `imdb_id` di `movies`/`tv`), non con una chiamata a TMDB — è il senso del dump.
>
> La stessa logica vale per gli anime (`kitsu:…:ep`), documentata qui sotto.

### La Soluzione: Traduzione Bidirezionale degli ID tramite Mapping Store
YACA implementa un'architettura ad alta efficienza basata su mapping statici pre-elaborati in [animeMappingStore.js](../src/data/animeMappingStore.js) e sulla regola canonica di rilevamento in [animeIdentity.js](../src/utils/animeIdentity.js):

```mermaid
graph TD
    subgraph Anime Identity & Mapping Store
        A[Risorsa TMDB] --> B{animeIdentity: È Anime?}
        B -->|No| C[Mantieni ID e metadati nativi TMDB]
        B -->|Sì: Store o 16+ja/keyword| D[animeMappingStore: Lookup O(1)]
        D -->|Serie TV| E[Anibridge: Mapping Stagione ed Episodi]
        D -->|Film| F[Fribb: tmdbToKitsuMovie]
        E --> G[Risoluzione Kitsu via Consensus Voting]
        F --> H[ID Video kitsu:kitsuId]
    end
    
    subgraph Detail Hydration
        I[Richiesta Meta Detail Stremio] --> J{Tipo Contenuto?}
        J -->|Anime Serie| K[fetchTmdbEpisodes: scarica griglia episodi TMDB]
        K --> L[applyKitsuMappingToMeta: assegna target kitsu:id:ep]
        J -->|Anime Film| M[applyKitsuMappingToMeta: assegna defaultVideoId kitsu:id]
    end
```

#### 1. Rilevamento Canonico dell'Identità Anime
L'identità anime è unificata nel modulo [animeIdentity.js](../src/utils/animeIdentity.js) (`isAnimeContent`) condiviso da tutti i percorsi dati (DuckDB locale e client TMDB live):
- **Store Match**: Il TMDB ID è presente in `animeMappingStore` (Anibridge / Fribb);
- **Euristica TMDB**: Genere TMDB *16* (Animation) **E** (`original_language === 'ja'` **OPPURE** esiste una keyword TMDB che include la parola `"anime"` case-insensitive, con filtro anti-falsi positivi per escludere animazioni occidentali come "anime-inspired" o "anime-influenced").
- La regola vale in modo identico per **serie TV** e per **film**, includendo donghua cinesi/coreani censiti ed escludendo produzioni occidentali.

#### 2. Risoluzione tramite `animeMappingStore` (Anibridge + Fribb)
Invece di lente chiamate HTTP live verso API esterne, YACA mantiene in memoria due dataset ad alte prestazioni sincronizzati ogni 12 ore con supporto ETag/304:
1. **Anibridge**: Mappature multi-provider (AniDB, AniList, MAL) con offset e range per convertire episodi TMDB in episodi Anime progressivi.
2. **Fribb (`anime-list-mini`)**: Mapping incrociato diretto per Kitsu ID, AniDB, AniList, MAL e TMDB (inclusi film).
3. **Lookup O(1) e Indici RAM**: Lo store popola un `Set` di TMDB ID anime per lookup a tempo costante (`isAnimeTmdbId(tmdbId)`) e aggiorna la tabella in-memory `anime_mappings` di DuckDB per consentire filtri nativi zero-latency (`F.anime`).

#### 3. Idratazione Episodica e Consensus Voting in `metaHandler`
All'interno di [metaHandler.js](../src/handlers/metaHandler.js):
- Per le serie TV anime, YACA scarica la griglia episodi da TMDB (`resolveAnimeEpisodes`) e poi applica `applyKitsuMappingToMeta`:
- Ogni episodio TMDB viene risolto tramite `animeMappingStore.resolveKitsu(tmdbId, season, episode)` applicando un algoritmo di **consensus voting** ponderato tra i provider.
- Se risolto con successo, l'ID dell'episodio per Stremio diventa `kitsu:{kitsuId}:{kitsuEpisode}` (compatibile con i tracker Torrentio/Anime Kitsu). In caso di collisione o assenza di mapping, viene mantenuto l'ID TMDB nativo come fallback di sicurezza.

#### 5. Doppia Query in Parallelo e De-duplicazione dei Flussi (Stream Proxying)
Nel proxy dei flussi ([streamHandler.js](../src/handlers/streamHandler.js)), sorge un problema analogo a livello di tracker torrent (es. Torrentio o il Corsaro Viola):
- **Problema dei flussi Kitsu:** I torrent italiani (con doppiaggio o sub ITA) vengono caricati e associati dagli indexer quasi esclusivamente sotto l'ID IMDb della serie (es. `tt4508902`). Interrogando il proxy esclusivamente con l'ID Kitsu (`kitsu:10740:1`), si ottenevano pochissimi risultati internazionali sub-eng e zero risultati italiani, causando il mancato badge **ITA** (falso negativo salvato in cache).
- **Risoluzione parallela:** Quando YACA riceve una richiesta di stream per un ID Kitsu (`kitsu:id:season:episode`), traduce preventivamente l'ID Kitsu nel rispettivo ID IMDb (ricavando la stagione e l'episodio TMDB corrispondenti) e avvia due richieste asincrone parallele al proxy: una per l'ID Kitsu e una per l'ID IMDb.
- **Fusione e De-duplicazione:** I flussi restituiti da entrambe le query vengono fusi in RAM ed eliminati i duplicati basandosi sull'identificatore univoco del torrent (`infoHash`) o sul link (`url` / `externalUrl`). Questa unione garantisce il massimo assortimento di flussi (sia le release subbate specifiche per anime indicizzate su Kitsu, sia i doppiaggi italiani tradizionali indicizzati su IMDb) e permette a YACA di applicare correttamente il badge **ITA** sui cataloghi anime in base alla presenza reale di tracce italiane.
- **Badge ITA: una sola fonte, letta in RAM.** Il badge ITA non nasce più da una scansione torrent: la fonte è la **colonna `ita`** del catalogo, popolata dalle annotazioni de *Il Mondo dei Doppiatori* che produce il modulo `services/doppiaggi-source`. Ha **tre stati** — `true` (doppiato), `null` (indecisione da omonimia), `false` (nessuna traccia) — e il badge si applica solo sul `true`. Il badge legge uno **snapshot in RAM** del file delle annotazioni (`src/data/itaAnnotations.js`, TTL ~60s) invece della colonna del parquet, così copre anche i cataloghi che non passano dal parquet (Trakt, hero, watchlist, simulcast); la colonna resta per i filtri SQL. Degrado deciso: file assente → snapshot vuoto, nessun badge, nessuna eccezione. Dettagli in [EPISODE_BADGES.md](EPISODE_BADGES.md) e [CATALOG_LOGIC.md](CATALOG_LOGIC.md#5-il-sistema-dei-badge-ita-anime--stato-episodi).


---

## 3. Workaround per le Limitazioni di Stremio

### A. Paginazione Dinamica (Skip e Lookahead)
Stremio richiede i cataloghi in blocchi paginati trasmettendo il parametro `skip`. La **pagina canonica del client è 100** (`CATALOG_PAGE_SIZE` in `stremio-core/src/constants.rs`, letto da fonte primaria il 20/09/2026) e vale una regola che spiega metà dei comportamenti surprising di YACA: **una risposta con meno di 100 elementi è letta come "catalogo finito"** e Stremio smette di chiedere.

YACA invece ragiona su una pagina di **20** (`ITEMS_PER_PAGE` in [src/config.js](../src/config.js), `PRESET_PAGE_SIZE` in [CatalogRouter.js](../src/catalog/CatalogRouter.js), `WATCHLIST_PAGE_SIZE`, `PAGE_SIZE` della Universal Pipeline). Tradotto: sui cataloghi che rispondono 20 — preset, hero, watchlist, ricerca, simulcast — `skip` non viene mai esercitato, perché Stremio considera finita la pagina alla prima. Solo il percorso DuckDB «non preset», che passa `limit = 100` ([CatalogRouter.js](../src/catalog/CatalogRouter.js#L84)), può effettivamente scorrere. Non è un bug da correggere d'ufficcio: la pagina restituita è già il prodotto finito del motore, ed è la scelta che tiene la cache L1 utile. Ma se un giorno un catalogo deve scorrere, il numero da allineare è **100**, non 20.

Le API di TMDB richiedono invece il parametro `page` (base 1, 20 elementi per pagina).
- **Problema**: L'interleaving e il consensus scoring richiedono i dati di più query contemporaneamente. Se richiedessimo una sola pagina per ciascuna query, l'intersezione o l'alternazione potrebbe non produrre abbastanza elementi univoci per riempire la pagina da 20 elementi richiesta da Stremio, provocando cataloghi "troncati" o vuoti.
- **Soluzione**: Quando `skip === 0` (caricamento iniziale della prima pagina), YACA attiva il **Lookahead** nella Universal Pipeline, scaricando in parallelo fino a **3 pagine TMDB** (valore definito da `PAGES_PER_REQUEST` in [src/config.js](../src/config.js)) per ogni query attiva. I risultati vengono fusi, ordinati e solo i primi 20 elementi finali vengono ritornati a Stremio. Per le pagine successive (`skip > 0`), viene scaricata una sola pagina per query per minimizzare la latenza.

### B. Protezione e Controllo dell'URL di Installazione
Stremio apre l'interfaccia di configurazione cliccando sull'icona dell'ingranaggio dell'addon installato inviando una chiamata a `/:userHandle/configure`. 
Per evitare leak del token dell'utente (UUID) nei log o nei referral del browser, l'endpoint `/:userHandle/configure` in [stremio.js](../src/api/stremio.js) intercetta la chiamata e reindirizza immediatamente l'utente all'interfaccia frontend protetta (`FRONTEND_URL`), dove la sessione viene convalidata in modo sicuro tramite JWT (JSON Web Token).

### C. Il tetto di 8 KB del manifest — l'unico limite che YACA non presidia

Il protocollo ha un tetto rigido: **il manifest serializzato non può superare 8192 byte**. L'SDK ufficiale (`stremio-addon-sdk/src/builder.js`) lo controlla e *lancia* un errore. Il tetto esiste anche lato backend Stremio, ed è quello che morde davvero: `updateStremioAddonCollection` chiama `POST /api/addonCollectionSet` ([src/utils/stremioAddon.js](../src/utils/stremioAddon.js#L124)) e se il descriptor eccede la quota riceve `{"error":"Max descriptor size reached"}` — l'addon semplicemente **non viene salvato** nell'account, senza alcun messaggio utile lato YACA.

YACA non usa l'SDK (Express nativo), quindi **non esiste nessun guard**: oggi il tetto si scopre solo quando il sync dell'account fallisce. I pesi reali misurati il 20/09/2026 (`JSON.stringify` + `Buffer.byteLength` sul manifest simulato di `src/api/stremio.js`):

| Voce | Byte |
|---|---|
| boilerplate del manifest, 0 cataloghi | 654 |
| catalogo base con `extra: [{name:'skip'}]` | ~95 |
| catalogo preset con selettore di ordinamento + `skip` | ~204 |

| Preset attivi | Cataloghi | Byte | Oltre 8192? |
|---|---|---|---|
| 7 (**default YACA**) | 23 | 3.936 | no |
| 20 | 36 | 6.680 | no |
| 27 | 43 | 8.181 | no |
| **28** | 44 | **8.382** | **sì** |
| 160 (tutti) | 176 | 37.049 | sì |

(I conteggi includono la base di 16 cataloghi di allora: oggi la base fissa è 7 — 2 ricerca TMDB, 2 ricerca AI, 3 watchlist — più fino a 8 hero, quindi ~100 byte in meno.)

La regola operativa: **oltre ~25 preset selezionati il manifest va tenuto sotto il tetto con un guard esplicito**, non sperando che l'utente non arrivedi. Il default (7 preset, 3,9 KB) sta a metà strada: c'è margine per il caso normale, nessuno per «ho selezionato tutto».

### D. Mai un 4xx su una risorsa: le risposte vuote sono HTTP 200

Un catalogo, un meta o uno stream senza risultati si rispondono **sempre con 200** e il payload vuoto (`{metas: []}`, `{meta: null}`, `{streams: []}`). Un 4xx/5xx viene interpretato dal client come *addon rotto* e mostra un banner rosso, disaccoppiando l'addon per qualche tempo.

YACA è conforme: `handle` sconosciuto, contenuto assente ed eccezione runtime producono tutti 200 con payload vuoto ([stremio.js](../src/api/stremio.js#L413), `:447`, `:486`, e il `catch` del catalogo). L'unica risposta non-200 del protocollo è il **manifest** con handle sconosciuto (400, `stremio.js:389`).

Lo stesso vale per la cache: i valori di `Cache-Control` sono in **secondi** (`max-age=60` = un minuto), e `stale-while-revalidate` / `stale-if-error` **non vengono mai emessi**: lo SWR di YACA è interamente interno (L1 RAM + L2 Redis), il client e i proxy davanti non lo vedono.

### E. `anime` e `other`: tipi legali ma assenti dal TypeScript ufficiale

`manifest.types` è un `Vec<String]` in `stremio-core` e l'esempio del doctest ufficiale è `["anime","series","movies"]`; il linter non controlla l'appartenenza a un set chiuso. Non compaiono però nell'union `ContentType` del pacchetto npm, quindi un addon che li dichiara è formalmente "fuori standard" e funziona: [stremio.js](../src/api/stremio.js#L373) dichiara `['movie','series','anime','other']` senza problemi.

La conseguenza pratica va ricordata quando si aggiunge un tipo: **Cinemeta risponde solo a `movie` e `series`**, quindi per `anime`/`other` i metadati devono arrivare da YACA; e per lo streaming i prefissi sono quelli del provider (`kitsu:`, `tt`), non `tmdb:` — vedi §2.

### F. Il manifest dinamico e la sua riconciliazione all'avvio

Stremio conserva il manifest che ha scaricato quando l'addon è stato installato: cambiare i preset non aggiorna nulla finché **l'URL di installazione non cambia**. Ecco perché l'URL è `${HOST_URL}/{userId}/{configVersion}/manifest.json` e `configVersion` è un `nanoid(8)` ([configure/index.js](../src/api/configure/index.js#L127)) usato come cache-buster puro.

Il bump non è affidato a chi salva: all'avvio `reconcileManifests()` ([manifestReconciler.js](../src/utils/manifestReconciler.js)) confronta l'impronta salvata con quella di adesso e, se differisce, rigenera `configVersion`, mette `pendingStremioResync = true` e chiama `updateStremioAddonCollection`. L'impronta ([manifestFingerprint.js](../src/utils/manifestFingerprint.js)) copre solo ciò che cambia il manifest pubblico — `activeProfileId`, i profili proiettati su (id, nome, `selectedPresets`, ordine cataloghi, cataloghi con `id/name/type/isAnime/mergedFrom`, `typeSelectors`, `kidsMode`), i custom e una **firma delle definizioni** (id/nome/tipo di hero e preset). Segreti, DNA, pesi di scoring e filtri dei cataloghi sono esclusi apposta: non cambiano il manifest e non devono invalidare nulla.

Tre conseguenze pratiche:

1. **Rinominare un preset o un hero invalida il manifest di tutti gli utenti** (cambia la `definitionsSignature`), non solo del proprio. È il prezzo dell'automazione: senza, il rename resterebbe invisibile fino a un salvataggio manuale.
2. **L'ordine degli array conta, l'ordine delle chiavi no**: `catalogOrder` e `selectedPresets` sono preservati, `Object.keys` sono ordinati in canonico.
3. **Il resync è ritentato, non perso**: se `updateStremioAddonCollection` fallisce il flag resta `true` e si riprova al prossimo avvio. Tutto il percorso è mai-fatale e si disattiva con `DISABLE_MANIFEST_RECONCILE=1`.

Contratti coperti da [manifestFingerprint.test.js](../tests/manifestFingerprint.test.js) e [manifestReconciler.test.js](../tests/manifestReconciler.test.js).

### G. Chi è `userHandle`: due tabelle, un solo handle

Ogni route di protocollo è `/:userHandle/...` e `resolveUserConfig(handle)` ([UserConfig.js](../src/models/UserConfig.js#L301-L319)) accetta **due identificatori diversi** per la stessa persona, in quest'ordine:

1. **`addonUuid`** — UUID v4 dell'`AddonConfig`, il documento **anonimo** che contiene profili, cataloghi, DNA e scelte UI (e non contiene `userId`);
2. **`userId`** — NanoID dell'`UserAccount`, che porta le credenziali private (authKey Stremio, token Trakt, chiavi TMDB/Mistral) e un puntatore `addonUuid`.

È la separazione *Two-Table Split*: il manifest e i cataloghi si possono servire da una tabella che non contiene nessun segreto, mentre le chiavi restano nell'altra. Due conseguenze pratiche: un `/:userHandle/manifest.json` può essere messo in cache o condiviso senza esporre credenziali, e l'URL d'installazione può cambiare forma (`/{userId}/{configVersion}/manifest.json`) senza toccare l'anonimato dell'`AddonConfig`.

---

## 4. Variabili d'Ambiente Coinvolte nei Workaround

*   `HOST_URL`: L'URL pubblico in cui è ospitato l'addon. Viene usato per generare gli URL del manifest e per costruire i link di configurazione.
*   `FRONTEND_URL`: L'URL dell'applicazione frontend di YACA (Next.js/React) utilizzato per i redirect sicuri dalla schermata di configurazione di Stremio.
*   `TMDB_API_KEY`: Necessaria per richiedere gli External ID e convertire gli ID in Kitsu.
*   `ERDB_CONFIG`: Stringa di configurazione di Easy Ratings DB, utilizzata per arricchire i certificati dell'età (ad es. per il Kids Mode).

---

## 5. Ottimizzazione Payload: Cataloghi vs Dettagli Meta (BSON Constraint)

### Il Problema
Stremio utilizza lo stesso formato per la visualizzazione delle locandine in griglia (Catalogo) e per la pagina dedicata del singolo film/serie (Meta). Tuttavia, i dati restituiti da TMDB sono estremamente voluminosi (es. cast completo, keyword, decine di episodi in `videos`, deep link a YouTube o IMDB). 
In passato, l'uso indiscriminato dello spread operator (`...item`) per generare gli elementi del catalogo causava la serializzazione di interi oggetti TMDB raw nella cache MongoDB (`catalogRequestCache`). Questo portava rapidamente a documenti BSON giganteschi e, nei casi limite, allo sforamento del limite di 16MB di MongoDB, oltre a sprecare una quantità enorme di RAM.

### La Soluzione: `isMetaDetail`
YACA implementa una divisione netta del payload inviato a Stremio tramite la funzione `sanitizeCatalogMeta` (situata in `StremioFormatter.js`):

- **Per i Cataloghi**: Il formatter esegue uno strict-mapping. Conserva solo lo stretto necessario (ID, nome, locandina visiva e poche altre info chiave). Tutti gli array voluminosi (come `videos` o `links`) e gli oggetti raw (es. `rawTMDB`) vengono intenzionalmente scartati.
- **Per i Dettagli (Meta)**: Quando l'utente clicca su una specifica locandina, l'endpoint `/meta/` di `stremio.js` richiama il formatter passando il flag `isMetaDetail: true`. Questo flag "sblocca" l'inclusione controllata di campi pesanti: `videos` (essenziale per mostrare le stagioni e gli episodi), `behaviorHints`, `links`, e `trailers`.

Questo approccio ibrido garantisce che i cataloghi siano "iper-digeribili" dal database e velocissimi da scorrere, pur restituendo i dati completi (inclusi i badge ITA o Kitsu applicati) quando l'utente si aspetta di guardare gli episodi o cliccare su un trailer.
