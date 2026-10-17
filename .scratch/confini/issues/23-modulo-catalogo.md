Status: ready-for-agent
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

Il confine, in una riga: **il catalogo è un tipo, il feed è chi lo serve.** Il *servirlo* resta fuori (il
`CatalogRouter`, i sei provider, gli handler, i formatter).

**L'anteprima è il primo *consumatore* del tipo**, e vive dove vive il servirlo: il modulo possiede il
**contratto** dell'anteprima (cosa deve rispondere: card + diagnosi dei filtri), non la sua esecuzione. Il motivo
per cui è così e non «l'anteprima dentro il modulo»: l'anteprima **deve eseguire il catalogo**, e un tipo che
esegue diventa il feed.

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
