# Sistema di Preset Curati (Cataloghi Pre-Configurati)

Il sistema di preset curati di YACA consente di definire e servire cataloghi pre-configurati stabili, rapidi e ottimizzati, elaborati localmente dal motore analitico **DuckDB**. Questo approccio assicura risultati a latenza zero per tutti i cataloghi standard, sollevando la pipeline da fetch remoti o logiche AI.

I preset sono definiti centralmente nel file [presets.js](../src/data/presets.js) e consumati direttamente dal `CatalogRouter` per essere esposti come cataloghi nativi su Stremio.

---

## 1. Architettura SQL-First e DSL (`filters.js`)

A partire dall'aggiornamento SQL-First, i preset non utilizzano più la vecchia sintassi di interrogazione API TMDB (es. `with_genres: '28|12'`), ma si basano su una **Domain Specific Language (DSL)** nativa esposta in [filters.js](../src/data/filters.js).
Questo permette di creare condizioni `WHERE` SQL tramite funzioni di utilità modulari, fortemente tipizzate e flessibili.

Un preset tipico è strutturato in questo modo:

```javascript
const { F, S } = require('./filters');

{
    id: 'preset_nolan',
    name: 'Regia: Christopher Nolan',
    emoji: '⏳',
    category: "🎬 Cinema d'Autore & Registi",
    type: 'movie',
    where: [
        F.crew(525),           // ID di Christopher Nolan
        F.minVotes(200)        // Soglia minima di voti
    ],
    orderBy: S.TOP_RATED
}
```

### Dettaglio dei Campi del Preset

*   `id` *(string - richiesto)*: Identificativo univoco del catalogo (es. `preset_pop_movies`).
*   `name` *(string - richiesto)*: Titolo del catalogo visualizzato in Stremio.
*   `emoji` *(string - opzionale)*: Emoji associata per la UI della Dashboard.
*   `category` *(string - richiesto)*: Categoria di raggruppamento (es. `🔥 Top & Trend`).
*   `type` *(string - richiesto)*: `movie` o `series`.
*   `where` *(array - richiesto)*: Un array di espressioni SQL o chiamate a `F.*`. **Gli elementi nell'array sono uniti con `AND`.**
*   `orderBy` *(string - opzionale)*: L'espressione di ordinamento SQL, spesso definita dalle costanti `S.*` (es. `S.POPULAR`, `S.TOP_RATED`, `S.BAYESIAN`).

### 1.1 La Logica AND/OR
La DSL risolve elegantemente il problema dei raggruppamenti logici complessi:
- **OR implicito**: Le funzioni che accettano array (es. `F.genre(28, 12)`) generano una clausola `OR` (`genre_id IN (28, 12)`).
- **AND implicito**: L'array `where` esegue l'intersezione di tutte le clausole.
- **AND tra array interni**: Funzioni specifiche come `F.allGenres(28, 12)` costringono l'intersezione esatta di più ID (il film deve avere *sia* il genere 28 *sia* il 12).

---

## 2. Sync Offline delle Entità (`sync_entities.js`)

Nel vecchio sistema, gli ID di TMDB per persone, compagnie e keyword venivano mappati manualmente in pesanti dizionari in testa a `presets.js` (es. `TMDB_PEOPLE`). 
Nel nuovo ecosistema SQL-First, gli ID numerici vengono usati direttamente nei preset (es. `F.crew(525)`).

Per mantenere le interfacce utente parlanti e poter mappare un ID al suo nome testuale reale senza colpire le API di TMDB, viene eseguito offline lo script `scripts/sync_entities.js`.
Questo script:
1. Legge tutti gli ID sparsi in `presets.js`.
2. Interroga il dump parquet di DuckDB.
3. Genera il file statico `src/data/entities.json` contenente una mappatura istantanea `ID -> Nome`.

---

## 3. Risoluzione dei Cataloghi e Routing

Il flusso dei preset è gestito in modalità 100% offline:

1. Stremio richiede il catalogo `yaca_preset_nolan`.
2. Il `CatalogRouter` individua il preset.
3. Trovando la chiave `where`, la richiesta viene delegata al [DuckDbProvider](../src/catalog/providers/DuckDbProvider.js).
4. Il provider converte le chiamate `F.*` in un'unica stringa SQL grazie al `queryBuilder.js`.
5. DuckDB esegue la query in memoria (tempo tipico: < 15ms) e ritorna il result-set.
6. Il result-set viene convertito nel formato compatto LightMeta e passato allo `StremioFormatter`.

7. *Nota: La Full-Text Search (FTS) è supportata passando l'oggetto `{ _fts: "query" }` nell'array `where`, che innesca automaticamente l'estensione BM25 di DuckDB.*

---

## 4. Ordinamento e Gestione `orderBy` / `sortBy`

### 4.1 Default Curato per Ogni Preset
Ogni catalogo preset definisce un proprio ordinamento predefinito e curato, identificato dalla proprietà `orderBy`.
Durante la generazione dei preset da [presets.js](../src/data/presets.js), la funzione `buildPresetFromFilters` analizza il parametro `sort_by` specificato nel blocco query del preset (`p.queries[0].sort_by`) e calcola l'espressione SQL corrispondente invocando [`mapSortBy(s, type)`](../src/catalog/providers/DuckDbProvider.js#L14).

Se un preset definisce già un `orderBy` esplicito a livello di radice, questo ha la precedenza (`orderBy: p.orderBy || duck.orderBy`).

> [!NOTE]
> L'unica eccezione ai cataloghi basati su clausole SQL `where` e `orderBy` è rappresentata dai cataloghi guidati da stato esterno, come `preset_anime_simulcast` (`_provider: 'airing_state'`). In questo caso l'ordine è intrinsecamente temporale (data di uscita dell'episodio) ed è gestito direttamente dal reader dello stato `anime_airing_state`.

### 4.2 Tabella di Mappatura `sort_by` → `orderBy` (`mapSortBy`)

La funzione `mapSortBy(sort_by, type)` traduce i criteri di ordinamento stile TMDB nelle corrispondenti clausole SQL native per DuckDB, tenendo conto delle differenze semantiche tra film (`movie`) e serie televisive (`series` / `tv`):

| `sort_by` (TMDB Style) | Tipo | Espressione SQL `orderBy` | Costante DSL `S.*` | Note |
|---|---|---|---|---|
| `popularity.desc` | movie, series | `"popularity" DESC NULLS LAST` | `S.POPULAR` | Ordinamento predefinito per popolarità generale |
| `vote_average.desc` | movie, series | `"vote_average" DESC, "vote_count" DESC` | `S.TOP_RATED` | Ordina per voto medio e penalizza titoli con pochi voti |
| `revenue.desc` | movie | `"revenue" DESC NULLS LAST` | `S.REVENUE` | Box office e incassi al botteghino |
| `revenue.desc` | series, tv | `"popularity" DESC NULLS LAST` | `S.POPULAR` | Fallback: TMDB non traccia incassi box office per le serie TV |
| `primary_release_date.desc`<br>`first_air_date.desc`<br>`release_date.desc` | movie | `"release_date" DESC NULLS LAST` | `S.NEWEST_MOVIE` | Nuove uscite cinematografiche |
| `primary_release_date.desc`<br>`first_air_date.desc`<br>`release_date.desc` | series, tv | `"first_air_date" DESC NULLS LAST` | `S.NEWEST_TV` | Nuove uscite televisive (prima messa in onda) |
| `primary_release_date.asc`<br>`first_air_date.asc`<br>`release_date.asc` | movie | `"release_date" ASC NULLS LAST` | — | Uscite storiche (dai più vecchi ai più recenti) |
| `primary_release_date.asc`<br>`first_air_date.asc`<br>`release_date.asc` | series, tv | `"first_air_date" ASC NULLS LAST` | — | Prime messe in onda storiche |
| *(null / undefined / vuoto)* | movie, series | `"popularity" DESC NULLS LAST` | `S.POPULAR` | Fallback di sicurezza standard |

I valori supportati sono enumerati in `SUPPORTED_SORT_BY` e verificati da una suite di test di copertura che fallisce se viene introdotto un nuovo preset con un `sort_by` non gestito.

### 4.3 Extra `sortBy` di Stremio (`stremio.js`)

Stremio supporta l'esposizione di controlli di ordinamento tramite l'array `extra` del manifesto:

```javascript
const SORT_OPTIONS = ['Popolarità', 'Voto Medio', 'Data di Uscita', 'Incassi'];
const presetExtra = [{ name: 'sortBy', isRequired: false, options: SORT_OPTIONS }, { name: 'skip' }];
```

#### Regola di Esposizione nel Manifest
* **Solo sui Preset Utente**: Il selettore `sortBy` è esposto **esclusivamente sui cataloghi dei preset utente** (`profile.catalogs` e `customCatalogs`) definiti dall'utente o derivati dai template di profilo ([stremio.js:52,68](../src/api/stremio.js)).
* **Non sugli Hero Catalogs**: I cataloghi Hero (`yaca_true_blend_*`, `yaca_seed_network_*`, `yaca_hidden_gems_*`, `yaca_trakt_filtered_*`) e la Watchlist (`yaca_watchlist_*`) usano esclusivamente `extra: [{ name: 'skip' }]`. Il loro ordinamento è algoritmico, basato sul DNA dell'utente o sull'ordine di aggiunta alla libreria, e non deve essere alterato dal client.
* **Non sui cataloghi non ordinabili (Simulcast)**: Cataloghi come `preset_anime_simulcast` dichiarano `_provider === 'airing_state'` e `sortable: false`. Per essi la funzione helper `getCatalogExtra()` ritorna `[{ name: 'skip' }]`, rimuovendo il selettore `sortBy` dal manifesto di Stremio ed evitando che l'utente veda opzioni che la route ignorerebbe.

#### Comportamento a Runtime
1. **Navigazione Normale**: Quando un utente apre un catalogo preset su Stremio senza selezionare alcun filtro di ordinamento, la richiesta non include `sortBy`. Il backend esegue la query SQL utilizzando il default curato `catalogMeta.orderBy`.
2. **Selezione Utente**: Se l'utente seleziona una voce nel menu a tendina di Stremio (es. "Voto Medio"):
   - L'endpoint estrae `extra.sortBy` e lo traduce in formato TMDB tramite `getSortByValue()` (`stremio.js:60`).
   - Il [CatalogRouter](../src/catalog/CatalogRouter.js#L83-L86) rileva `sortBy` e sovrascrive temporaneamente l'ordinamento:
     ```javascript
     if (sortBy) {
         const { mapSortBy } = require('./providers/DuckDbProvider');
         presetToRun = { ...catalogMeta, orderBy: mapSortBy(sortBy, catalogMeta.type || type) };
     }
     ```
   - DuckDB esegue la query con il nuovo `orderBy` e restituisce i risultati ordinati secondo la preferenza temporanea dell'utente.

