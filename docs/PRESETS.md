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

*Nota: La Full-Text Search (FTS) è supportata passando l'oggetto `{ _fts: "query" }` nell'array `where`, che innesca automaticamente l'estensione BM25 di DuckDB.*
