Status: ready-for-agent
Type: grilling

# 22 — Il modulo ricerca (e l'AI come modulo a parte)

## Perché

La ricerca oggi è **quattro cose in una**: il dispatch verso le fonti, la comprensione della richiesta (con l'AI
che normalizza), l'indice locale (DuckDB in RAM + FTS5) e la **fusione/ordinamento** dei candidati. La traccia
che nessuno le possiede per intero è una delle suite rosse di stanotte: `tests/searchTier2Merge.test.js`, che
testa **l'ordine fra i locali e il Tier 2** — un comportamento nato dentro il router e senza proprietario.

I fatti: `src/catalog/CatalogRouter.js` importa **sei provider** (Trakt, Hybrid/pool, AI Discovery, AiringState,
DuckDB, Watchlist); l'**AI è usata da sei file** (`api/catalog.js`, `api/configurazione.js`, `CatalogRouter.js`,
`providers/AiDiscoveryProvider.js`, `providers/AiQueryNormalizer.js`, `providers/DuckDbProvider.js`); il Tier 2
sono tre file (`catalog/tier2Enrich.js`, `catalog/tier2Search.js`, `db/tier2Index.js`).

## Deciso in grilling (17/10/2026)

- **La ricerca non contiene l'AI.** Possiede «da una richiesta a una lista ordinata di candidati»: il dispatch
  verso le fonti, la fusione locale/Tier 2, l'ordinamento.
- **L'AI è un modulo a parte**: piccolo, condiviso, e possiede il **meccanismo** (il client/il router verso il
  modello, il budget, i tempi) — **non i prompt**: ogni modulo tiene i suoi (la ricerca i prompt di ricerca, i
  cataloghi i loro). È la regola della libreria applicata ai modelli: *fornisce il meccanismo, non le decisioni*.
- Il collaudo che il modulo eredita è **`searchTier2Merge`**: l'ordine fra locali e Tier 2 è suo, e il test
  rosso è la sua prima verifica.

## Le domande che restano (per il prossimo grilling)

1. **La porta**: `cerca({ q, tipo, contesto, cap }) → items`? E il `tipo` (titolo/genere/keyword/persona) è un
   parametro della ricerca o una **modalità** che cambia il percorso?
2. **`CatalogRouter`**: diventa l'interno del modulo ricerca, o resta il dispatcher e il modulo possiede solo la
   fusione? (La differenza è dove finisce la conoscenza dei sei provider.)
3. **L'AI dentro la ricerca** (quando serve): la ricerca chiama il modulo AI e gli passa **i suoi** prompt — o il
   modulo AI ha anche una «ricerca AI» che i cataloghi usano? (La prima è la lettura della decisione presa.)
4. **L'indice locale** (DuckDB + FTS5 + Tier 2): interni del modulo ricerca, o un modulo «indice» che la ricerca
   interroga? (Oggi `DuckDbProvider` è anche il motore dei cataloghi: se l'indice diventa della ricerca, i
   cataloghi restano senza.)
5. **Il vuoto e il degrado**: ricerca senza risultati, indice non pronto, modello giù — cosa risponde la porta.

## Come si verifica (da completare in grilling)

Minimo: la fusione e l'ordinamento hanno **un proprietario** e il loro test (oggi rosso) diventa verde
*documentando l'ordine atteso*; il modulo non conosce il modello (nessun prompt dentro); e i cataloghi non
cambiano comportamento.
