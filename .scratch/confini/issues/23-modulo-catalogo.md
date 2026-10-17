Status: resolved
Type: grilling

# 23 — Il modulo catalogo: il tipo e la validazione

## Perché

La *definizione* di un catalogo è la struttura dati centrale del prodotto, ed è oggi **implicita in dieci posti**:
`api/configure/index.js` (che legge `customCatalogs` dal corpo), `api/configure/profileProcessor.js` (che la
interpreta), `src/data/presets.js` (**543 righe** di definizioni), `src/data/filters.js`,
`src/catalog/catalogKind.js`, `src/catalog/catalogSorting.js`, `src/catalog/constants.js`,
`src/catalog/registry.js` (le 12 righe hero), `src/db/queryBuilder.js`, e
`DuckDbProvider.buildPresetFromFilters`. **Nessuno possiede il catalogo: ognuno ne conosce una fetta.**

## Deciso in grilling (17/10/2026)

**Il modulo possiede il tipo e la validazione** — dice **cosa è un catalogo** (kind, mediaSet, anime, filtri,
ordinamento, preset) e sa dire se una definizione è **legittima**. **Non produce titoli.**

**C'è una natura sola di catalogo** (deciso lo stesso giorno): **la riga hero è un preset di sistema**, e il tipo
copre tutto. La conseguenza è più forte di quella di un registro: se la riga hero è una definizione come le
altre, allora il manifest, le impronte, i kind e il `getHeroPoolSpec()` sono **derivati dal tipo** — e la trappola
dei «dieci posti che definiscono una riga hero» non si risolve tenendoli allineati, si risolve perché **c'è un
posto solo da cui tutto discende**. Il tipo deve quindi portare anche i campi che oggi hanno solo le righe di
sistema (priorità, additive, «non modificabile dall'utente»), dichiarati come proprietà di quella specie.

**Il confine, in una riga**: **il catalogo è un tipo, il feed è chi lo serve.** Il *servirlo* resta fuori (il
`CatalogRouter`, i sei provider, gli handler, i formatter).

**La forma è un oggetto dichiarativo, e i preset diventano dati del modulo** (deciso lo stesso giorno): nome,
emoji, `mediaSet`, l'asse anime, i filtri, l'ordinamento, le proprietà di sistema (priorità, additive) — e la
**parte filtri è l'ingresso del compilatore** dell'indice (decisione del ticket 22). `src/data/presets.js` (543
righe) e le 12 righe hero di `registry.js` **migrano alla forma nuova**: una forma sola, due dataset (di sistema
e dell'utente).

**La validazione è l'intersezione di due dichiarazioni** (deciso lo stesso giorno): il tipo dichiara **la lingua**
(i filtri ammessi, i kind, i mediaSet, gli ordinamenti) e **il servire dichiara le sue capacità** — *«questo
filtro lo servo, questo no»* — nel **registro delle fonti** del ticket 22. La validazione le incrocia **senza
dipendere dal servire**: il tipo non importa i provider, consulta ciò che essi dichiarano. Così una definizione
invalida si scopre **prima** di provarla, e l'anteprima può dire anche *perché* è invalida.

**Il contratto dell'anteprima è nel tipo, i numeri nel servire** (deciso lo stesso giorno): il modulo dichiara
*cosa un'anteprima deve rispondere* (le card e la **forma** della diagnosi: candidati, entrati, tagliati per
filtro), e i **conteggi** li produce il servire, che è l'unico che sa *perché* un titolo è stato scartato. La forma
è una sola (nessun consumatore se la inventa), e la verità sui numeri sta dove i numeri nascono.

**L'anteprima è il primo *consumatore* del tipo**, e vive dove vive il servirlo: il modulo possiede il
**contratto** dell'anteprima (cosa deve rispondere: card + diagnosi dei filtri), non la sua esecuzione. Il motivo
per cui è così e non «l'anteprima dentro il modulo»: l'anteprima **deve eseguire il catalogo**, e un tipo che
esegue diventa il feed.

## Tutte le domande decise (17/10/2026)

| domanda | decisione |
|---|---|
| le specie | **una sola**: la riga hero è un **preset di sistema**, e il tipo copre tutto — così manifest, impronte, kind e `getHeroPoolSpec()` sono **derivati dal tipo**, e la trappola dei «dieci posti» non si tiene allineata: **c'è un posto solo da cui tutto discende** |
| la forma | **oggetto dichiarativo** (nome, emoji, `mediaSet`, asse anime, filtri, ordinamento, proprietà di sistema); la parte filtri è l'**ingresso del compilatore** dell'indice; `presets.js` e le 12 righe hero diventano **dati del modulo** (di sistema e dell'utente) |
| la validazione | **intersezione di due dichiarazioni**: la lingua (il tipo) × le capacità (dichiarate dal servire nel **registro delle fonti** del 22) — senza che il tipo importi i provider |
| l'anteprima | **contratto nel tipo, numeri nel servire**: la forma della diagnosi è dichiarata, i conteggi li produce chi sa perché un titolo è stato scartato |
| i consumatori | dentro: tipo, `catalogKind`, `catalogSorting`, `filters.js` e le **derivazioni** (manifest, impronte, `getHeroPoolSpec`). Fuori: il servire (router, provider, handler, formatter) e le rotte |

**Cosa resta**: l'applicazione — e la migrazione dei **due dataset** alla forma nuova (543 righe di preset + 12 righe hero), che è il pezzo delicato: è dato che l'utente vede.

---

## Le domande che restano (per il prossimo grilling)

1. **Ci sono due specie di catalogo, e il tipo deve dirlo**: le righe **hero** (`registry.js`: 12 righe coi loro
   `priority`/`additive`, servite dal feed) e i **preset dell'utente** (`presets.js`, definiti nella
   configurazione). Sono la stessa cosa o due? *(La raccomandazione da discutere: due — la riga hero è una
   *offerta* del prodotto, il preset è una *richiesta* dell'utente — e il tipo copre il secondo, mentre il primo
   resta il registro che già esiste.)*
2. **La forma della definizione**: un oggetto dichiarativo (kind, mediaSet, anime, filtri, sort, query) che
   *sostituisce* `presets.js` o che **riferisce** i preset? E `presets.js` diventa il **dato** del modulo o resta
   un file a parte?
3. **Cosa rende invalida una definizione**: un filtro che il servirlo non sa eseguire, un kind inesistente, un
   preset che non si applica al mediaSet. La validazione deve conoscere i limiti del servirlo — come, senza
   dipendere da lui?
4. **Il contratto dell'anteprima**: cosa deve rispondere (card + diagnosi), e **chi possiede la diagnosi** (i
   conteggi per filtro)? È del tipo o del servirlo?
5. **Chi sono i consumatori**: `catalogKind`, `catalogSorting`, `filters.js` diventano **interni** del modulo;
   `queryBuilder.js` (che traduce la definizione in SQL per DuckDB) è del servirlo o del tipo?

## Come si verifica (da completare in grilling)

Minimo: la definizione ha **un posto** (col `grep` che dimostra che nessuno la interpreta per conto suo), la
validazione **rifiuta** ciò che il servirlo non sa fare (con i test), e il contratto dell'anteprima è dichiarato
nel modulo e implementato fuori — con l'anteprima vera (card + diagnosi) che resta identica.

## Esito (17/10/2026)

Risolto conformemente alle 5 decisioni stabilite:

1. **La forma del Tipo Catalogo (`src/catalog/definition.js`)**:
   - Una natura sola di catalogo: la riga hero di sistema e il preset utente condividono la stessa identica forma dichiarativa:
     - `id`: identificatore univoco del catalogo;
     - `name`: stringa descrittiva utente (max 100 char);
     - `emoji`: icona / emoji del catalogo;
     - `mediaSet`: sottoinsieme non vuoto di `['film', 'serie']` (con derivazione bidirezionale di `type`: `'movie'` | `'series'` | `'both'`);
     - `anime`: asse anime canonico (`'yes'` | `'no'` | `'mixed'` | `'agnostic'`);
     - `filters`: oggetto dichiarativo con `queries[]` (ingresso per il compilatore dell'indice del Ticket 22) e `where` nativo;
     - `sort`: configurazione con `by` (chiave TMDB o Stremio), `orderBy` (SQL), `sortable` (booleano) e `presentation_strategy`;
     - `system`: proprietà di sistema che distinguono offerta di sistema da richiesta utente (`isSystem`, `userModifiable`, `priority`, `additive`, `alwaysVisible`, `strategy`, `uiType`, `idBase`, `label`, `desc`, `category`, `provider`).

2. **I due dataset migrati alla nuova forma**:
   - **Dataset di sistema**: le 12 righe hero di `src/catalog/registry.js` sono state riscritte come istanze dichiarative di `defineCatalog` con proprietà di sistema esplicite (priorità da 1 a 6, additività, strategia, `provider: 'hybrid'`).
   - **Dataset utente**: i 163 preset di `src/data/presets.js` vengono generati attraverso `defineCatalog`, mantenendo piena retrocompatibilità per i consumatori esistenti (`p.queries`, `p.where`, `p.orderBy`, ecc.).
   - *Nota architetturale*: i cataloghi utente memorizzati nel documento MongoDB (`AddonConfig.profiles[].catalogs`) non sono stati migrati qui: come concordato, la migrazione dei dati persistiti è di competenza del Ticket 21.

3. **Invarianza assoluta delle derivazioni (`src/catalog/registry.js`)**:
   - Tutte le proiezioni discendono direttamente dalle definizioni hero di sistema:
     - Manifest Stremio (`getManifestHeroCatalogs()`): esattamente 12 righe;
     - Fingerprint rows (`getHeroCatalogFingerprintRows()`): esattamente 12 righe id/type/name;
     - Kind map (`getHeroCatalogKindMap()`): 12 righe con `mediaSet`, `anime: 'agnostic'`, `alwaysVisible: false`;
     - Pool spec (`getHeroPoolSpec()`): invariante, con `heroPriority` ordinato su 6 slug, `slugAdditivi` (`mondi`, `passo_fuori`), 6 slug e 12 cataloghi;
     - Gruppi UI (`getHeroUiGroups()`): 6 card raggruppate per `idBase`;
     - Prefissi e filtri (`getHeroPrefixes()`, `isHeroCatalogId()`);
     - Hash del registro (`getRegistryHash()`): identico byte per byte a prima (`71354fae575c3d16`).

4. **Validazione: Intersezione tra Lingua e Capacità Servire (`src/catalog/validation.js` e `src/catalog/capabilities.js`)**:
   - `capabilities.js` definisce la forma di una dichiarazione di capacità delle fonti (`id`, `supportedMediaSets`, `supportedAnime`, `supportedFilters`, `supportedSorts`, metodi `canServe*`) e registra le fonti attuali (`duckdb`, `airing_state`, `hybrid`, `watchlist`).
   - `validation.js` incrocia la lingua (validità id, lunghezza nome, mediaSet consentiti, asse anime, intervalli numerici) con le capacità dichiarate della fonte target (senza importare i provider di esecuzione). Rifiuta filtri sconosciuti o non supportati (es. `with_crew` su `airing_state`), ordinamenti vietati e mediaSet incompatibili.
   - Tutti i 12 hero di sistema e tutti i 163 preset utente validano con 0 errori.

5. **Contratto dell'Anteprima (`src/catalog/previewContract.js`)**:
   - `formatPreviewResponse` e `validatePreviewResponse` stabiliscono il contratto pubblico: cap a 20 card, card standardizzate (`id`, `titolo`/`title`, `poster`, `anno`/`year`, `badgeIta`, `durata`/`duration`, `voto`, `type`), e diagnosi strutturata (`candidati`, `entrati`, `tagliati` per criterio `ita`, `kids`, `genere`, `gia_visto`, `qualita`, `collezioni`).
   - La rotta `POST /api/configurazione/anteprima` produce i conteggi e formatta il payload tramite `formatPreviewResponse`.

6. **Cosa resta al Ticket 22**:
   - Il **registro unificato delle fonti** nel servire (di cui questo ticket ha fissato la forma della capacità).
   - Il **compilatore dell'indice** che prende in ingresso i filtri dichiarativi (`catalog.filters`) e genera la query parametrizzata per DuckDB / FTS5.
