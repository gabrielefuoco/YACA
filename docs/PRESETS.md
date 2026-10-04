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
*   `isAnime` *(boolean - opzionale)*: «Questo catalogo è anime». **Non è un filtro SQL**: non finisce in `where`. Serve ai selettori di tipo del profilo (§ 5) e al filtro post-fetch che tiene **solo** gli item anime (§ 5.2). La `category` non dice niente sull'argomento: gli anime per bambini stanno in «Bambini & Famiglia» e i donghua stanno in «Solo Anime» senza essere preset anime.

> [!NOTE]
> Nei preset reali `where` e `orderBy` quasi mai si scrivono a mano: `getPresets()` chiama `buildPresetFromFilters(p.queries[0], p.type)` e ricava il `where` dal blocco query in stile TMDB (`with_genres`, `with_keywords`, `sort_by`, …). Il `where` scritto a mano nel preset **ha la precedenza** e non viene ricostruito.

### 1.1 La Logica AND/OR
La DSL risolve elegantemente il problema dei raggruppamenti logici complessi:
- **OR implicito**: Le funzioni che accettano array (es. `F.genre(28, 12)`) generano una clausola `OR` (`genre_id IN (28, 12)`).
- **AND implicito**: L'array `where` esegue l'intersezione di tutte le clausole.
- **AND tra array interni**: Funzioni specifiche come `F.allGenres(28, 12)` costringono l'intersezione esatta di più ID (il film deve avere *sia* il genere 28 *sia* il 12).

### 1.2 L'unico filtro che resta solo ai film: `with_crew`
Nella tabella `tv` del parquet TMDB ci sono `cast` e `watch_providers_it/us`, ma **non** `directors` e `writers` (le serie usano `created_by`). Per questo `buildPresetFromFilters` lascia `with_crew` (`F.crew`, che cerca su entrambe le colonne) sotto il guard `!isTv`: applicarlo a un preset `series` non dà risultati sbagliati, fa **esplodere DuckDB** con `Referenced column directors not found in FROM clause`.

`with_cast` e `with_watch_providers` invece valgono **anche** per le serie: sono state separate dal gate per quello. Quindi «cercare persone» e «cercare piattaforme» su una serie è legittimo; «cercare il regista» no, e il motivo è di schema, non di policy.

---

## 2. Sync Offline delle Entità (`sync_entities.js`) — script non più nel repo

Nel vecchio sistema, gli ID di TMDB per persone, compagnie e keyword venivano mappati manualmente in pesanti dizionari in testa a `presets.js` (es. `TMDB_PEOPLE`). 
Nel nuovo ecosistema SQL-First, gli ID numerici vengono usati direttamente nei preset (es. `F.crew(525)`).

Per mantenere le interfacce utente parlanti e poter mappare un ID al suo nome testuale reale senza colpire le API di TMDB, era previsto uno script offline, `scripts/sync_entities.js`, che:
1. Leggeva tutti gli ID sparsi in `presets.js`.
2. Interrogava il dump parquet di DuckDB.
3. Generava il file statico `src/data/entities.json` contenente una mappatura istantanea `ID -> Nome`.

> [!CAUTION]
> **`scripts/sync_entities.js` non esiste più**: è stato rimosso il **2026-08-15** nel commit `45bd78f` («purge dead code, scratch and regenerable data»). Sopravvive il **risultato**, non il generatore: `src/data/entities.json` c'è ancora e `filters.js` lo carica all'avvio (`companies`, `people.directors/actors`, `networks`, `keywords`).
>
> Quindi: il file va **rigenerato fuori dal repo** se serve, e nessuno in questo repository può farlo con un comando documentato. Se un ID non ha nome, il sintomo è un'etichetta vuota in dashboard — non un errore.

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
Durante la generazione dei preset da [presets.js](../src/data/presets.js), la funzione `buildPresetFromFilters` analizza il parametro `sort_by` specificato nel blocco query del preset (`p.queries[0].sort_by`) e calcola l'espressione SQL corrispondente invocando [`mapSortBy(s, type)`](../src/catalog/providers/DuckDbProvider.js#L31).

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

> [!NOTE]
> **Perché un extra con un nome non standard funziona.** Il client non ha una lista chiusa di nomi ammessi: in `stremio-core` ogni `extra` con `options` non vuole viene impacchettato in un selettore (l'unica esclusione è `skip`, che il core forzato a `options: []`), e `stremio-web` lo renderizza come dropdown con l'etichetta derivata dal nome (`sortBy` → «SortBy»). Per questo `sortBy` è legale anche se il protocollo non lo documenta. Il rovescio della medaglia: le opzioni sono **stringhe libere**, non validate dal client — se `getSortByValue()` non riconosce una voce, la richiesta arriva comunque e va gestita lato server ([STREMIO_INTERNALS.md §3.C](STREMIO_INTERNALS.md#c-il-tetto-di-8-kb-del-manifest--lunico-limite-che-yaca-non-presidia) per il vincolo di dimensione che questi `options` aggiungono al manifest).

#### Regola di Esposizione nel Manifest
* **Solo sui Preset Utente**: Il selettore `sortBy` è esposto **esclusivamente sui cataloghi dei preset utente** (`profile.catalogs` e `customCatalogs`) definiti dall'utente o derivati dai template di profilo ([stremio.js:54,71](../src/api/stremio.js)). La scelta è **data-driven**, non cablata sugli id: `getCatalogExtra(cat)` restituisce `[{ name: 'skip' }]` quando il catalogo dichiara `sortable === false` o `_provider === 'airing_state'` (anche risolvendo il preset canonico in `presets.js`, se il salvato in profilo è vecchio), e `presetExtra` in tutti gli altri casi.
* **Non sugli Hero Catalogs**: I cataloghi Hero (`yaca_true_blend_*`, `yaca_seed_network_*`, `yaca_hidden_gems_*`, `yaca_trakt_filtered_*`) e la Watchlist (`yaca_watchlist_movies|series|anime`) usano esclusivamente `extra: [{ name: 'skip' }]`. Il loro ordinamento è algoritmico, basato sul DNA dell'utente o sull'ordine di aggiunta alla libreria, e non deve essere alterato dal client.
* **Non sulle ricerche**: `yaca_search_standard` e `yaca_search_ai` espongono `searchExtra` (`[{ name: 'search', isRequired: true }]`): l'unico controllo utile è il testo cercato.
* **Non sui cataloghi non ordinabili (Simulcast)**: `preset_anime_simulcast` dichiara `_provider: 'airing_state'` e `sortable: false`. Per essi `getCatalogExtra()` ritorna `[{ name: 'skip' }]`, rimuovendo il selettore `sortBy` dal manifesto di Stremio ed evitando che l'utente veda opzioni che la route ignorerebbe. Il flag `sortable` viene conservato in `profileProcessor` quando il preset viene salvato nel profilo: senza quella propagazione la regola si perderebbe alla prima sincronizzazione dei template.

> [!NOTE]
> `anilist_simulcast` resta accettato come **marker legacy** dello stesso percorso (AniList è stata eliminata, l'id del preset no): chi ha la configurazione già installata continua a funzionare senza dover migrare nulla.

#### Comportamento a Runtime
1. **Navigazione Normale**: Quando un utente apre un catalogo preset su Stremio senza selezionare alcun filtro di ordinamento, la richiesta non include `sortBy`. Il backend esegue la query SQL utilizzando il default curato `catalogMeta.orderBy`.
2. **Selezione Utente**: Se l'utente seleziona una voce nel menu a tendina di Stremio (es. "Voto Medio"):
   - L'endpoint estrae `extra.sortBy` e lo traduce in formato TMDB tramite `getSortByValue()` (`stremio.js:62`, chiamata a riga 427).
   - Il [CatalogRouter](../src/catalog/CatalogRouter.js#L79-L82) rileva `sortBy` e sovrascrive temporaneamente l'ordinamento:
     ```javascript
     if (sortBy) {
         const { mapSortBy } = require('./providers/DuckDbProvider');
         presetToRun = { ...catalogMeta, orderBy: mapSortBy(sortBy, catalogMeta.type || type) };
     }
     ```
   - DuckDB esegue la query con il nuovo `orderBy` e restituisce i risultati ordinati secondo la preferenza temporanea dell'utente.
3. **Cataloghi merged**: sul percorso della Universal Pipeline non c'è un `orderBy` da sovrascrivere — l'override finisce nel `sort_by` di **ogni** query che compone il merge ([CatalogRouter.js:126-129](../src/catalog/CatalogRouter.js)), così tutte le sorgente rispettano la scelta dell'utente invece di una sola.

---

## 5. I Preset e i Selettori di Tipo del Profilo

Un profilo può dichiarare tre selettori, in `profile.settings.typeSelectors`:

```javascript
{
    film:  false,                    // Solo Film
    serie: false,                   // Solo Serie
    anime: 'only' | 'exclude' | null // Solo Anime | No Anime | nessun vincolo
}
```

**Campo assente = nessun vincolo**: un profilo senza selettori si comporta esattamente come prima. Sono due gruppi **ortogonali** e la combinazione conta (`Solo Serie` + `Solo Anime` = solo anime serie, `Solo Anime` da solo = anime film **e** anime serie): l'anime è un modificatore, non una partizione dei media.

### 5.1 L'identità di un catalogo: `kind`

La conformità di un preset non si deduce da `category` (gli anime per bambini stanno in «Bambini & Famiglia», i donghua nella categoria «Solo Anime» ma **non** sono preset anime) né dal nome. L'unico helper è [catalogKind.js](../src/catalog/catalogKind.js):

```
kind = { mediaSet: ['film' | 'serie'], anime: 'yes' | 'no' | 'mixed' }
```

- **preset** → `type` + il flag `isAnime` di radice;
- **8 hero e cataloghi fissi** → registry esplicito nel modulo (suffisso `_movies`/`_series`);
- **custom / Matchmaker** → `type` dichiarato (`anime` → `anime: 'yes'`);
- **merged** → **unione** delle sorgenti: né tutte anime né tutte non-anime → `anime: 'mixed'`.

La regola di conformità è `mediaSet ⊆ media ammessi` **E** (`only` → `anime === 'yes'`, `exclude` → `anime === 'no'`); `mixed` e gli ignoti sono conformi solo senza vincolo anime. Conservativa nelle due direzioni: meglio un catalogo in più nel manifest che uno che l'utente crede di vedere e non vede.

### 5.2 Dove il vincolo agisce (e dove no)

1. **Manifest** — un preset non conforme non viene dichiarato. È la garanzia primaria, e vale anche per gli 8 hero.
2. **Guardia nel backend** — `catalogHandler` risponde `{ metas: [] }` a una richiesta diretta di un catalogo non conforme: copre la finestra in cui Stremio ha ancora il manifest vecchio. Nessun errore, degradazione.
3. **Contenuti** — con `anime: 'exclude'` spariscono gli item `_isAnime`, con `'only'` restano **solo** quelli. Il perimetro è l'unico choke point del post-processing, quindi vale per preset, hero e custom/merged, **non** per ricerche e watchlist (che restano sempre raggiungibili con qualsiasi combinazione di selettori).
4. **Dashboard** — i non conformi restano visibili ma spenti, con il motivo; chi sono attivi e nascosti si possono comunque riordinare e rimuovere. `/api/configure` non rifiuta e non cancella nulla: il profilo conserva quello che l'utente aveva scelto.

Tre avvertenze operative:
- `typeSelectors` finisce **nella chiave di cache** della richiesta: senza, due profili con selettori diversi si risponderebbero a vicenda lo stesso catalogo.
- Il filtro item è **fail-open**: un item senza marker resta. Una lista più corta è accettata, un refill no.
- I template di profilo sono allineati alla regola: i 3 omogenei (`tpl_movies`, `tpl_series`, `tpl_otaku`) preimpostano i selettori, i 13 misti li azzerano. Applicare un template «riallinea» il profilo invece di lasciare lo stato del template precedente.
