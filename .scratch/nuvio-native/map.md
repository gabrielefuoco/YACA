# Mappa: YACA nuvio-native — superfici, contratti, limiti

**Aperta**: 20/10/2026 · **Natura**: ricerca e decisione — **nessun codice**
**Origine**: il brainstorming del 20/10/2026 su come rendere YACA “nativo” dentro Nuvio. La mappa
trasforma quella conversazione in domande verificabili e marca **tutti** i punti emersi.

## Destination

Una **specifica decisionale, validata da ricerca**, che dica:

- quali superfici Nuvio-native YACA deve presidiare — **collections, home layout, profili, poster URL,
  library/watch history** — e quali no;
- con quali **contratti e limiti** (API pubblica, manifest addon, source native vs addon, merge,
  sicurezza, hosting);
- in quale **ordine** affrontarle, cosa è **fuori scope**, e quali **esperimenti** validano la rotta
  prima di scrivere codice.

La mappa è pronta quando la rotta è chiara e non restano decisioni aperte. Ogni ticket è **solo di
ricerca**: nessun ticket modifica il prodotto. Il codice, se e quando si farà, è di un’altra mappa.

## Notes

**Regole di lavoro che valgono per ogni ticket.**

- **Solo ricerca.** Niente modifiche a `src/`, `frontend/`, `services/` o configurazioni. I ticket
  producono note in `.scratch/nuvio-native/ricerche/NN-slug.md`, con path/riga e fonti primarie.
- **Fonti primarie, non riassunti.** Documentazione Nuvio, codice NuvioTV, JS di Kaptain, guida Nuvio di
  Pictorium, config import/export di AIOMetadata. Ogni affermazione va ricondotta alla fonte che la
  possiede.
- **La documentazione originale di Nuvio è la legge.** Il riferimento è
  `https://nuvio.tv/docs/nuvio-public-api.md` (**v1.3, last updated 20/08/2026**), letto il 20/10/2026.
  Il codice client dice cosa fanno davvero le app; le due cose vanno confrontate, non fuse.
- **Il brainstorming è la fonte dei punti P01–P30.** L’inventario qui sotto li traccia tutti. Un punto
  può stare in più ticket; nessun punto sparisce.
- **Un ticket = una domanda di ricerca.** Se la risposta apre una decisione, si crea un ticket nuovo;
  non si decide dentro il ticket di ricerca.
- **Niente over-engineering.** `ponytail` è la lente: la soluzione più pigra che risponde alla domanda.
  `codebase-design` serve solo se un ticket tocca un confine di modulo.
- **Trappole già note, da verificare e non raccontare come verità:** `pageSize` 20 di YACA contro lo
  skip 100 di Nuvio; l’addon risolto per `manifest id`; i full-replace di collections/addons/profiles;
  l’home blob non documentato; l’ID anime Kitsu vs IMDb.
- **Lingua**: italiano. I nomi delle cose Nuvio restano in inglese (`collections`, `folders`, `sources`,
  `poster URL`, `home catalog settings`).

**Riferimenti letti in charting.**

- Nuvio public API v1.3: `https://nuvio.tv/docs/nuvio-public-api.md` (55 KB, letto integralmente).
- NuvioTV: `Collection.kt`, `CollectionsDataStore.kt`, `FolderDetailViewModel.kt`,
  `TmdbCollectionSourceResolver.kt`, `AddonMapper.kt`, `CatalogDescriptorExtensions.kt`.
- Kaptain: `nuvio-push.js`, `addon-core.js`, `collection-merge.js`, `profile-snapshots.js`.
- Pictorium: `docs/discord-nuvio-guide.md` (Poster URL, `{shape}`).
- AIOMetadata: README + `ConfigImportExport` / catalog config surface.
- Nuvio wiki: `settings/collections`, `integrations/addons`, `settings/profiles`.
- Thread Reddit indicati nel brainstorming (via API, perché Reddit blocca il fetch diretto).

## Fatti di charting (dalla documentazione originale)

Non sono decisioni: sono i fatti che hanno dato forma ai ticket. La fonte è
`https://nuvio.tv/docs/nuvio-public-api.md` (**v1.3, last updated 20/08/2026**), letta integralmente il
20/10/2026, più il codice NuvioTV.

- **Base API**: `https://api.nuvio.tv`, stile Supabase; `publishable key` pubblica; auth email/password →
  `access_token` + `refresh_token`; endpoint non elencati = interni e possono cambiare.
- **Profili**: massimo **6**, `profile_index` 1..6; addons, library, watch progress, watch history,
  settings e collections sono **scoped by `profile_id`**; `uses_primary_addons` permette di condividere
  gli addon col profilo 1; il PIN non è gestito dall’API.
- **Sync strategies**: full replace per addons, profili, collections e library legacy; merge
  incrementale per library items; blob upsert atomico per profile settings e home catalog settings;
  merge non distruttivo per watch progress/history. Un payload parziale su un full-replace **cancella**
  ciò che manca.
- **Collections**: blob JSON per profilo; `viewMode` (`TABBED_GRID`, `ROWS`, `FOLLOW_LAYOUT`),
  `tileShape` (`POSTER`, `LANDSCAPE`, `SQUARE`), `pinToTop`, `showAllTab`, folder con artwork e
  `catalogSources` o `sources`.
- **Home catalog settings**: blob JSON **application-defined**; la docs mostra `rows`/`hidden_catalogs`,
  ma la forma reale va verificata nel client (Kaptain usa `items` con `addon_id`, `catalog_id`,
  `is_collection`, `collection_id`).
- **Library/watch**: delta con `event_id` e cursor; library snapshot paginato (500 consigliato); watch
  progress con `progress_key`; watch history con `watched_at`; identità `(content_type, content_id)`.
- **Rate limit**: linea guida client ≤ **100 req/s**, batching via RPC, 429 con backoff.
- **Poster URL**: non è nella docs API; è un settings blob gestito dal client (`custom_poster_url_pattern`,
  `custom_poster_enabled_screens`), osservato in Kaptain e nella guida Nuvio di Pictorium.
- **Notice**: la licenza del progetto open source non concede diritti su nomi, loghi, branding o accesso
  al servizio hosted; la documentazione copre solo gli endpoint pubblici.

## Punti da coprire (inventario)

**Stato**: `evidenza` = una fonte primaria lo tocca già, ma va verificato; `da ricercare` = nessuna
verifica sufficiente; `risolto` = il ticket che lo possiede è chiuso; `fuori scope` = non appartiene a
questa destinazione.

| Punto | Cosa | Ticket | Stato |
|---|---|---|---|
| **P01** | API pubblica Nuvio: base URL, publishable key, auth, versioning, notice | 01 | risolto |
| **P02** | Sync strategies: full replace, merge non distruttivo, delta incrementale | 01 | risolto |
| **P03** | Collections: schema collection/folder/source, campi artwork, `viewMode`, `tileShape` | 02 | evidenza |
| **P04** | Source native TMDB/Trakt: tipi, filtri, sort, paginazione, chiavi | 07 | risolto |
| **P05** | Source addon: `addonId`, `type`, `catalogId`, `genre`, risoluzione per manifest id | 02 | evidenza |
| **P06** | Home catalog settings: blob, piattaforme, campi unknown, merge | 03 | da ricercare |
| **P07** | Profili 1..6, `uses_primary_addons`, PIN, scope per profilo | 05 | evidenza |
| **P08** | Manifest addon: `pageSize`, `showInHome`, extras, `types`, `idPrefixes`, `meta`, versioning | 04 | evidenza |
| **P09** | ID catalogo: IMDb vs TMDB vs Kitsu, compatibilità con stream addon | 04 | da ricercare |
| **P10** | Poster URL globale: pattern, `{shape}`, schermate, cache | 06 | evidenza |
| **P11** | Community collections: regole, approval, pack 0-addon vs addon | 12 | risolto |
| **P12** | Differenze TV / mobile / desktop: import, poster, settings | 03 | da ricercare |
| **P13** | Library, watch history, watch progress: campi, delta, identità | 08 | evidenza |
| **P14** | Avatar, supporter wall, superfici social | — | fuori scope |
| **P15** | Fusion / widgets (app esterna) | — | fuori scope |
| **P16** | YACA preset → source native TMDB/Trakt: copertura e buchi | 07 | risolto |
| **P17** | YACA row dinamiche (DNA, grafo, AI, watchlist, anime) → collection addon | 09 | da ricercare |
| **P18** | Profili YACA → profili Nuvio o collection: mapping e identità | 05 | da ricercare |
| **P19** | Custom catalog, watchlist, liste Trakt → folder | 09 | da ricercare |
| **P20** | Arte collezioni: cover, backdrop, title logo, focus GIF | 10 | da ricercare |
| **P21** | Poster endpoint: ERDB, badge ITA/episodio, shape, mapping ID | 06 | da ricercare |
| **P22** | Library/storia Nuvio come segnale di gusto per il DNA | 08 | da ricercare |
| **P23** | Manifest Nuvio-ready: catalog-only, conflitto meta, nomi localizzati | 04 | da ricercare |
| **P24** | Merge/update: ID stabili, additivo, edit utente, rollback | 11 | evidenza |
| **P25** | AI Collection Builder / live search dentro Nuvio | 14 | da ricercare |
| **P26** | Pack community e YACA come provider per altri builder | 12 | risolto |
| **P27** | Hosting, CDN, self-hosted vs YACA Cloud | 13 | da ricercare |
| **P28** | Modi di prodotto: Lite / Smart / Sync, funnel, MVP | 14 | da ricercare |
| **P29** | Sicurezza, privacy, termini, consenso, credenziali | 13 | evidenza |
| **P30** | Priorità, esperimenti di validazione, out of scope | 14 | da ricercare |

## Tickets

Tutti aperti, tutti `research`. La colonna “blocked by” usa i numeri dei ticket.

| # | Ticket | Punti | Blocked by |
|---|---|---|---|
| 01 | [L’API pubblica di Nuvio: auth, sync, limiti, notice](issues/01-api-pubblica-nuvio.md) | P01, P02, P13, P29 | — |
| 02 | [Collections: schema, source native/addon, full-replace](issues/02-collections-contratto.md) | P03, P05, P24 | — |
| 03 | [Home layout e matrice piattaforme](issues/03-home-layout-piattaforme.md) | P06, P12 | — |
| 04 | [Compatibilità addon: manifest, paginazione, tipi, ID](issues/04-manifest-addon-compatibilita.md) | P08, P09, P23 | — |
| 05 | [Profili Nuvio e identità dell’addon](issues/05-profili-identita-addon.md) | P07, P18 | 04 |
| 06 | [Poster URL globale: badge YACA su tutte le row](issues/06-poster-url-globale.md) | P10, P21 | 04 |
| 07 | [Source native TMDB/Trakt: cosa coprono davvero](issues/07-source-native-tmdb-trakt.md) | P04, P16 | — |
| 08 | [Library, watch history e progress come segnale di gusto](issues/08-library-storia-segnale.md) | P13, P22 | — |
| 09 | [Da YACA a Nuvio: mapping di preset, row e custom catalog](issues/09-yaca-collection-mapping.md) | P17, P19, P16 | 02 |
| 10 | [Arte delle collezioni: cover, backdrop, logo, focus](issues/10-artwork-collezioni.md) | P20 | 02 |
| 11 | [Merge e update: aggiornare senza distruggere](issues/11-merge-update-engine.md) | P24 | 02 |
| 12 | [Distribuzione: community collections, builder, marketplace](issues/12-distribuzione-builder.md) | P11, P26, P29 | — |
| 13 | [Sicurezza, privacy, termini e hosting](issues/13-sicurezza-privacy-hosting.md) | P27, P29 | — |
| 14 | [Modi di prodotto, AI builder e priorità](issues/14-modi-prodotto-priorita.md) | P25, P28, P30 | 02, 04, 09, 13 |

**Frontiera iniziale (20/10/2026):** 01, 02, 04, 07, 12. Le ricerche sono state avviate in background;
le note arriveranno in `ricerche/`. Gli altri ticket restano bloccati finché la loro dipendenza non è
risolta.

**Ricerche completate:** 01, 07, 12. **Frontiera attuale:** 02, 03, 04, 08, 13.

## Decisions so far

### 1. Le source native coprono il 78,5% dei preset, non le hero

**Risolto il 20/10/2026** — ticket [07 — Source native TMDB/Trakt: cosa coprono davvero](issues/07-source-native-tmdb-trakt.md).
Dettaglio in [`ricerche/07-source-native-tmdb-trakt.md`](ricerche/07-source-native-tmdb-trakt.md).

- **128/163 preset (78,5%)** sono native-izzabili dall’editor TMDB; **133/163 (81,6%)** accettando
  `sortBy=revenue.desc` via JSON. Ma sul totale delle **190 righe permanenti** la copertura è **67,4%**:
  hero, search e watchlist non hanno equivalente nativo.
- I tipi nativi sono sette; solo `COMPANY`/`NETWORK`/`DISCOVER` leggono i `filters`, gli altri ordinano in
  memoria. Mancano runtime, status libero, stagioni/episodi, certification, collection multiple,
  cast/crew multipli, `permissive_recent`, `air_date` episodio, union multi-query e scoring bayesiano.
- **Trakt nativo è solo liste pubbliche**: YACA oggi legge watchlist/history/ratings/favorites ma **non
  crea liste**. I dati personali restano addon.
- **Scoperta da mettere agli atti**: la API v1.3 documenta solo `folders[].catalogSources` con
  `addonId`; `folders[].sources` con `provider`/`tmdbSourceType`/`filters` esiste nel client
  (`CollectionsDataStore.kt`) ma **non è contrattualizzato**. Il pack 0-addon dipende da uno schema non
  documentato: va verificato con il round-trip (ticket 02/11).
- **Regola**: native se è una singola query `discover` con filtri/sort nel set nativo e risultato
  impersonale; addon se serve DNA, ITA, anime, rotazione, dati personali, episodi o unione multi-query.

**Nessun’altra decisione operativa: charting iniziale.** La destinazione è fissata sopra; gli altri
ticket sono ancora di ricerca.

### 2. L’API è un client di sync, non un servizio: full replace e 6 profili

**Risolto il 20/10/2026** — ticket [01 — L’API pubblica di Nuvio: auth, sync, limiti, notice](issues/01-api-pubblica-nuvio.md).
Dettaglio in [`ricerche/01-api-pubblica-nuvio.md`](ricerche/01-api-pubblica-nuvio.md).

- **Quattro strategie**: full replace (profili, addons, collections, library legacy), mutazioni
  incrementali (library nuova), blob atomico (settings/home), merge non distruttivo (progress/history).
- **`sync_push_profiles` senza `p_client_max_profiles` torna a 4 slot e cancella i profili 5–6.** YACA
  deve sempre mandare `6`; Kaptain non lo fa, NuvioTV sì.
- **Home catalog**: la docs descrive `{rows, hidden_catalogs}`/`tv`, ma i client usano
  `{hide_unreleased_content, items[]}`/`home_catalog_shared`; senza `p_platform` può rispondere 300.
- **Identità**: addon dedotti per `md5(url)` grezza; `progress_key` calcolato dal server; `event_id` è
  un cursore per profilo e risorsa.
- **Auth/limiti**: token dichiarati 3600s ma osservati ~7 giorni (da testare); gateway ~900 req/s contro
  la linea guida di 100; 429/`Retry-After` da gestire.
- **Conseguenza**: YACA Sync è un **client autorizzato dall’utente**, non un servizio server-to-server.
  Lettura library/history è sicura; scrittura richiede `pull → merge → push → verify` (ticket 11).

### 3. Il primo canale è YACA Lite, non YACA Smart

**Risolto il 20/10/2026** — ticket [12 — Distribuzione: community collections, builder, marketplace](issues/12-distribuzione-builder.md).
Dettaglio in [`ricerche/12-distribuzione-builder.md`](ricerche/12-distribuzione-builder.md).

- **Unico canale first-party**: Nuvio community collections. **YACA Lite** (0 addon) è GO; **YACA
  Smart** è CONDITIONAL, perché senza un manifest pubblico a catalogs fisse rischia `catalog_missing`.
- **Kaptain marketplace non è una submission** (è il feed Stremio); **Xperience** è import privato;
  **Ultra MAX** è chiuso; **AIOMetadata** è un artefatto di supporto.
- **Reddit**: un post in r/Nuvio è GO; r/nuvioaddons è NO-GO per il lancio.
- **Sito/GitHub/QR** è l’unico canale posseduto e misurabile; la pagina community è `noindex`, senza API.
- **Regola**: nessun pack senza test su un profilo Nuvio pulito, con manifest installato e catalogs
  richieste presenti.

**Nessun’altra decisione operativa.** La destinazione è fissata sopra; gli altri ticket sono ancora di
ricerca.

## Not yet specified

Queste sono le nebbie che non si possono ancora tagliare in ticket: dipendono da risposte che non
abbiamo. Restano in scope, ma non sono abbastanza nitide per una domanda precisa.

- **Il confine del modulo `src/nuvio/`** — se e come nascerà, e quali porte esporrà. Dipende da 09, 11 e
  10: prima di nominare i moduli bisogna sapere quali oggetti Nuvio possiede YACA.
- **La lineup dei pack** — quali pack verticali (Cinema italiano, Autori, Anime, Kids, A24/Nolan) e con
  quale naming. Dipende da 12 e 14: prima la distribuzione, poi il catalogo.
- **YACA Cloud vs self-hosted** — se il poster endpoint e i pack richiedono un’istanza pubblica gestita
  da noi, o se basta il reverse proxy dell’utente. Dipende da 13 e 14.
- **Il sistema di arte** — stile, quanti set, se generato o curato, se usare Pictorium o Sharp. Dipende
  da 10.
- **Il multi-profilo** — se la collisione di manifest id si risolve con ID per profilo, con un’istanza
  attiva server-side, o con un solo profilo Nuvio. Dipende da 05.
- **La sequenza di go-to-market** — pack community prima o dopo il push account; quale metrica decide.
  Dipende da 12 e 14.
- **La priorità finale** — Lite/Smart/Sync e l’ordine di costruzione. Dipende da 14.

## Out of scope

- **Stream, debrid, scraper, plugin, playback.** YACA resta catalogo/metadato/artwork. Le regole della
  community Nuvio vietano discussioni su acquisizione contenuti; non ci entriamo.
- **Un client Nuvio o un fork.** Non costruiamo una UI alternativa: usiamo le superfici di Nuvio.
- **Avatar e supporter wall (P14).** Non sono catalogo/collezione; non servono alla destinazione.
- **Fusion / widgets (P15).** È un’app esterna, non Nuvio. Se un giorno la destinazione cambia, torna
  come mappa nuova, non come resumption di questa.
- **Scrivere watch progress/history dentro Nuvio.** In questa mappa Nuvio è **fonte** di gusto (08),
  non destinazione di scrittura.
- **Cambiare il motore di raccomandazione o la matematica del DNA.** La mappa studia come *esporlo*,
  non come riscriverlo.
- **Moderazione/approvazione delle community collections.** La ricerca studia le regole (12); la
  gestione operativa è fuori.
- **Qualsiasi modifica al codice.** Questa mappa produce una specifica, non un deploy.
