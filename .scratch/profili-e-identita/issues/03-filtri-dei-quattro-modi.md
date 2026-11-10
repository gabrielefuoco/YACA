# Cosa significa esattamente Film, Serie, Anime, Bambini

Status: resolved
Type: research
Blocked by: —

## Question

Quattro modalità su cinque sono un filtro. "Solo film" e "solo serie" sono già il `medium` che il grafo accetta. "Anime" ha già una politica (`src/anime/politica.js`: `only`/`exclude`, più il flag `ANIME` del canone). **Bambini** è l'unico che non è definito con precisione: esiste `settings.kidsMode` e il pool passa `filtri.kids` al grafo, ma cosa filtra davvero?

Da accertare leggendo il codice, non a memoria:

1. **Il filtro bambini** — dove si applica: sui semi, sul retrieval, o su entrambi? Che soglia usa, quali certificazioni TMDB considera, se guarda il genere (`Family`, `Kids`, `Animation`) o i voti. Casi di scuola: *Inside Out* (bambini), *Shrek* (bambini), *Invincible* (animazione, non bambini), *Stranger Things* (ragazzi, non bambini), *Il Signore degli Anelli* (non bambini). Dire per ciascuno se oggi passa o no, e se dovrebbe.
2. **La watchlist** — la watchlist di un account contiene titoli di tutti i tipi. In modalità Bambini cosa si mostra: solo i titoli per bambini già in watchlist, o la watchlist intera con i non-bambini nascosti? La differenza è fra "il bambino vede la sua lista" e "il bambino vede che il genitore ha una lista".
3. **Il confine Anime / Bambini** — un film Ghibli è entrambe le cose. La modalità Bambini mostra anime per bambini? La modalità Anime esclude i contenuti per bambini? Regola esplicita, non un caso che emerge dai filtri.
4. **Anime: cosa entra nei semi** — la policy attuale ammette titoli non anime nei semi in modalità Anime? Se no, l'effetto voluto ("usare titoli non anime per camminare meglio") oggi non esiste e va costruito: quanti semi non-anime, con quale peso, e come si evita che un utente con 500 film e 5 anime riceva solo remake di quei 5.
5. **Il retrieval**: ogni modalità deve restituire solo il proprio tipo. Verificare se oggi il filtro si applica dopo il taglio (quindi righe che si svuotano) o prima (righe piene). Un modo che restituisce 8 righe di cui 3 vuote è un modo rotto.

Esito: una tabella modo → (filtro semi, filtro retrieval, cataloghi ammessi) verificata sul codice, con i casi di scuola sopra e i buchi trovati.

---

## Indagine nel codice

### 1. Il filtro bambini: dove e come si applica

- **Sui semi**: **NON si applica**.
  In `src/pool/index.js:245-288` (`convertiSemiPerGrafo`), la funzione accetta solo `{ medium, animePolicy, ultimaVisione, quantiRecenti, tipi, plays }`. `kidsMode` non è nemmeno presente tra i parametri. Qualsiasi seme visto dall'account (anche horror o film per adulti) viene inviato al motore senza alcuna potatura o esclusione.
- **Nel grafo Python (servizio persistente V45)**: **NON esiste alcun filtro bambini**.
  - In `services/graph/servizio.py:54-263` (`POST /raccomanda`) e `509-839` (`POST /scaffali`), i payload accettano `medium`, `tono`, `complessita`, `cap`, `esclusi`. Il campo `opzioni.filtri.kids` (che il pool Node passava nel blocco legacy a riga 462-468) viene **completamente ignorato**.
  - In `services/graph/runtime/engine.py:620-719` (`raccomanda`) e `services/graph/interessi.py:850-930` (`scaffali`), non esiste alcun parametro o ramo di logica per `kids`.
  - In `services/graph/canon.py:1033, 1109-1118`, viene precalcolato un array booleano `ADULTO` basato esclusivamente su 3 generi (`ADULTO_GENERI = "27,53,80"`, ossia Horror, Thriller, Crime in `services/graph/parametri.py:318`) e 23 keyword TMDB (`ADULTO_KEYWORDS` in `parametri.py:323`). Questo flag era consumato solo da `services/graph/motore.py:636-676` (`filtri_a_monte`), ma come esplicitato in `services/graph/servizio.py:46-48`, `motore.py` (motore denso V10) è codice dismesso/offline non più importato né utilizzato dal servizio HTTP V45.
  - **DATO CRITICO**: Nel canone del grafo (`services/graph/canon.py:1050`) le colonne caricate dai parquet TMDB sono unicamente `["id", "vote_count", "vote_average", "popularity", col, dcol, "genres"]` (più opzionalmente episodi, collection, registi, keywords). **Non esiste alcun campo di certificazione d'età, classificazione o rating TMDB nel canone**. Il grafo è completamente cieco alle fasce d'età.
- **Nel retrieval a valle (Node.js)**:
  Il filtro vive interamente in `src/catalog/kidsModeFilters.js:69-117` (`isItemInappropriateForKids`):
  1. *Certificazioni TMDB* (`isRestrictedCertification`, riga 42-48): blocca `TV-MA`, `NC-17`, `R`, `X` e la regex `/(?:^|[^0-9])(1[4-9])(?:[^0-9]|$)/` (quindi TV-14, VM14, VM18, 16+, 18+). **Non blocca** PG-13, PG, G, TV-PG, TV-Y7.
  2. *Generi adulti* (`ADULT_GENRE_SET`, riga 39): blocca `27` (Horror), `53` (Thriller), `80` (Crime). **Non richiede affatto** generi protetti come `Family` (10751), `Kids` (10762) o `Animation` (16).
  3. *Keywords adulte* (`ADULT_KEYWORD_SET`, riga 40): blocca 23 ID keyword TMDB espliciti (ecchi, hentai, gore, porn, sex, nudity, violence, adult animation, dirty joke, ecc.).
  4. *Voti*: **Nessuna soglia di voti**.
  5. *Fail-closed*: Se mancano sia metadati di genere che di keyword, il titolo viene scartato (riga 116).
  *Nota implementativa*: In `kidsModeFilters.js:80-87`, `genreSource` assume che se `genres` è stringa sia separata da virgole/pipe (`rawGenres.split(/[,|]/)`), non gestendo il formato stringa JSON grezzo di DuckDB (`[{"id":...}]`), quindi record DuckDB non passati prima per `mapDuckDbRowToMeta` attivano erroneamente il fail-closed.

### 2. La watchlist in modalità Bambini

- **Architettura della watchlist**:
  In `src/library/models/UserLibraryItem.js:7-38`, gli elementi della watchlist sono salvati a livello di account (`addonUuid`) con campi `itemId`, `type` (`movie`/`series`/`anime`), `tmdbId`, `state`. **Non esiste alcuna partizione per profilo utente né un flag per bambini nella libreria**.
- **Comportamento in lettura**:
  In `src/stremio/providers/WatchlistProvider.js:122-172`:
  - Viene invocato `leggiWatchlist` (`src/library/reader.js:25-59`), che esegue una query su `UserLibraryItem` con paginazione `.skip(skip).limit(20)`. Viene quindi letta la watchlist **dell'intero account (genitore)**.
  - Se `activeProfileSettings.kidsMode` è vero, i 20 item letti vengono arricchiti con generi/keyword da DuckDB (`enrichWatchlistItemsWithTmdbMetadata`, righe 49-120).
  - A valle, in `src/stremio/catalogHandler.js:157-159`:
    ```javascript
    if (activeProfileSettings?.kidsMode) {
        results = applyKidsMode(results);
    }
    ```
- **Verdetto**: Il bambino **non ha una sua watchlist separata**. Vede la watchlist del genitore a cui vengono nascosti post-fetch i titoli ritenuti inappropriati.
- **Difetto grave (righe vuote/sotto-dimensionate)**: Poiché il taglio `limit(20)` avviene nel database prima del filtraggio, se i primi 20 titoli salvati dal genitore sono film per adulti o thriller, `applyKidsMode` li scarta tutti e 20: Stremio riceve una **pagina vuota (0 risultati)** per la prima schermata della watchlist.

### 3. Il confine Anime / Bambini

- **Regola Anime in Kids Mode**:
  In `src/anime/politica.js:91-93`:
  ```javascript
  if (options?.isKidsMode || profile?.settings?.kidsMode || profile?.kidsMode) {
      return ANIME_POLICY_MODES.NEUTRAL;
  }
  ```
  In assenza di selezione manuale esplicita, `resolveAnimePolicy` forza la politica anime a `neutral` (nessuna esclusione degli anime, nessun boost forzato).
  Inoltre, in `src/catalog/catalogKind.js:25`, il catalogo `yaca_watchlist_anime` ha `alwaysVisible: true`, quindi non viene rimosso dal manifest.
  I titoli anime per bambini (es. film dello Studio Ghibli come *Il mio vicino Totoro* o *Ponyo*) non contengono generi 27/53/80 né keyword vietate, quindi **passano regolarmente e vengono mostrati**.
- **Regola Bambini in Anime Mode**:
  In `src/stremio/catalogHandler.js:166-177` e `src/anime/politica.js:126-148`:
  La modalità Anime (`typeSelectors.anime = 'only'`) filtra esclusivamente che `isItemAnime(item)` sia `true`.
  **Non esiste alcuna regola che escluda i contenuti per bambini dalla modalità Anime**. Un anime per bambini (es. *Doraemon*, *Pokémon*) è pienamente ammesso e promosso.

### 4. Anime: cosa entra nei semi

- **Nel codice**:
  In `src/pool/index.js:254-258` (`convertiSemiPerGrafo`):
  ```javascript
  const filteredSeeds = rawSeeds.filter(([id]) => {
      if (animePolicy === 'exclude') return !isAnimeSeed(id);
      if (animePolicy === 'only') return isAnimeSeed(id);
      return true;
  });
  ```
  E a riga 351-352 sui semi Trakt:
  ```javascript
  if (animePolicy === 'only' && !isAnimeSeed(id)) continue;
  ```
- **Verdetto**: Se `animePolicy === 'only'`, qualsiasi seme non-anime viene **completamente scartato**.
- L'effetto desiderato ("usare titoli non anime per camminare meglio sul grafo") **oggi non esiste nel codice**: se un profilo ha 500 visioni di film/serie occidentali e solo 5 anime, il grafo riceve esclusivamente quei 5 semi anime. Il restante 99% della cronologia dell'utente viene ignorato.

### 5. Il retrieval: prima o dopo il taglio (righe che si svuotano)

- **Filtro Medium (Film vs Serie)**:
  - Nel grafo V45 (`services/graph/runtime/engine.py:674-678`):
    `if medium == "movie": cand[self.is_tv] = -np.inf`
    `elif medium in ("series", "tv"): cand[~self.is_tv] = -np.inf`
    Il mascheramento medium avviene **prima** dell'estrazione dei top-k candidati (`min(cap, len(valid_idx))`, riga 699).
  - In `services/graph/interessi.py:630-660`, gli scaffali vengono ripartiti e popolati con candidati strettamente omogenei per medium prima del taglio.
  - *Difetto nei selettori profilo*: In `src/catalog/catalogKind.js:154-155, 176-180`, i selettori `typeSelectors.film` e `typeSelectors.serie` sono stati disattivati nella valutazione di conformità dei cataloghi nel manifest (`isCatalogConformant` valuta unicamente `typeSelectors.anime`).
- **Filtro Kids e Anime a valle**:
  - *Nei cataloghi Hero / Dynamic Shelves V45*:
    In `src/stremio/hybridServing.js:144` e `src/stremio/idratazione.js:149-169` (`idrataEImpaginaCandidati`), il ciclo consuma blocchi dalla lista dei candidati del grafo fino a raggiungere `limit`. Tuttavia, ogni scaffale del grafo V45 genera al massimo `cap = 60` candidati (`services/graph/interessi.py:853`). Se uno scaffale generato dal grafo è tematicamente adulto (es. thriller/crime scaturito da un cluster di semi non filtrati), tutti i 60 candidati vengono scartati da `cardSurvivesFilters`: lo scaffale diventa **una riga con 0 titoli**.
  - *Nei cataloghi preset/standard e watchlist*:
    In `src/stremio/catalogHandler.js:157-177`:
    `results` viene restituito dal provider già limitato a 20 elementi (`PRESET_PAGE_SIZE = 20`).
    Subito dopo vengono eseguiti `applyKidsMode(results)` e il filtro `animeSelector`. Questo filtraggio è **dopo il taglio**: se di 20 titoli solo 3 sono idonei, la riga serve 3 card; se nessuno è idoneo, la riga è vuota.

---

## Risoluzione

### Tabella dei modi

| Modalità | Filtro sui Semi | Filtro Retrieval (Grafo / Engine) | Filtro Retrieval (Node / Stremio) | Cataloghi Ammessi nel Manifest |
| :--- | :--- | :--- | :--- | :--- |
| **Film** | `convertiSemiPerGrafo` riceve `medium='movie'`; `semiDi` estrae semi film | `engine.py:675`: `cand[is_tv] = -np.inf` applicato **a monte** (prima del cap) | Nessun filtro post-fetch sul tipo, affidato al tipo Stremio della riga | Cataloghi tipo `movie`. (*Nota: `typeSelectors.film` è ignorato da `catalogKind.js`*) |
| **Serie** | `convertiSemiPerGrafo` riceve `medium='series'`; `semiDi` estrae semi tv | `engine.py:677`: `cand[~is_tv] = -np.inf` applicato **a monte** (prima del cap) | Nessun filtro post-fetch sul tipo, affidato al tipo Stremio della riga | Cataloghi tipo `series`. (*Nota: `typeSelectors.serie` è ignorato da `catalogKind.js`*) |
| **Anime** (`only`) | `pool/index.js:256`: **Elimina al 100% i semi non anime**. Zero semi esterni passati al grafo | **Nessun filtro anime** nel grafo V45 (`engine.py` / `interessi.py` non filtrano anime) | `idratazione.js:128` e `catalogHandler.js:172`: `isItemAnime(card) === true` | Cataloghi con `anime: 'yes'` o `anime: 'agnostic'` (scaffali hero/V45 ammessi; preset canonici non anime nascosti) |
| **Bambini** (`kidsMode`) | **Nessun filtro sui semi**. Semi per adulti e violenti passano integri al grafo | **Nessun filtro bambini** nel grafo V45. `ADULTO` in `canon.py` è inerte | `kidsModeFilters.js`: esclude generi 27/53/80, 23 keyword adulte e rating 14+/TV-MA/R | Tutti i cataloghi del profilo restano visibili nel manifest; i contenuti interni vengono falciati post-fetch |

---

### Verdetti sui Casi di Scuola

Dati verificati direttamente contro la base dati TMDB / DuckDB del progetto:

1. **Inside Out** (TMDB movie 150540):
   - *Dati*: Generi `Animation` (16), `Family` (10751), `Adventure` (12), `Drama` (18), `Comedy` (35). Rating: `G` / `Tutti`. Nessuna keyword adulta.
   - *Verdetto oggi*: **PASSA** il filtro bambini (quando correttamente processato con `mapDuckDbRowToMeta`).
   - *Dovrebbe passare?*: **SÌ**, è il prototipo del contenuto per famiglie.
2. **Shrek** (TMDB movie 808):
   - *Dati*: Generi `Animation` (16), `Comedy` (35), `Fantasy` (14), `Adventure` (12), `Family` (10751). Rating: `T` (Tutti / PG). Nessuna keyword adulta.
   - *Verdetto oggi*: **PASSA** il filtro bambini.
   - *Dovrebbe passare?*: **SÌ**, pienamente idoneo ai bambini.
3. **Invincible** (TMDB tv 95557):
   - *Dati*: Generi `Animation` (16), `Drama` (18), `Sci-Fi & Fantasy` (10765), `Action & Adventure` (10759). Rating TMDB: `TV-MA`. Keywords TMDB: include `gore` (10292) e `adult animation` (161919).
   - *Verdetto oggi*: **NON PASSA** (bloccato sia dalla certificazione `TV-MA` sia dalle keyword `gore` e `adult animation`).
   - *Dovrebbe passare?*: **NO**, è animazione ultra-violenta per adulti, corretto che sia bloccato.
4. **Stranger Things** (TMDB tv 66732):
   - *Dati*: Generi `Action & Adventure` (10759), `Mystery` (9648), `Sci-Fi & Fantasy` (10765). Rating TMDB: `TV-14`.
   - *Verdetto oggi*: **NON PASSA** (bloccato dalla regex certificazione `1[4-9]` su `TV-14`).
   - *Dovrebbe passare?*: **NO**, serie concepita per adolescenti/adulti, non per bambini.
5. **Il Signore degli Anelli: La Compagnia dell'Anello** (TMDB movie 120):
   - *Dati*: Generi `Adventure` (12), `Fantasy` (14), `Action` (28). Rating: `T` in Italia (PG-13 negli USA). Nessun genere tra 27, 53, 80 e nessuna delle 23 keyword vietate.
   - *Verdetto oggi*: **PASSA**!
   - *Dovrebbe passare?*: **NO**. Non è un film per bambini (target 12-13+ con scene spaventose). Passa solo perché l'attuale filtro bambini non richiede generi dedicati all'infanzia (`Family`/`Kids`), ma si limita ad essere un filtro anti-splatter/anti-pornografia.

---

### Mappa dei Gap (Cosa NON esiste oggi e va costruito)

1. **Assenza totale di fasce d'età / certificazioni nel canone del grafo**:
   `services/graph/canon.py` non legge né memorizza le certificazioni TMDB nei metadati (`metadati-canone.npz`). L'intero grafo V45 e il generatore di scaffali dinamici (`services/graph/interessi.py`) operano all'oscuro della dimensione bambini.
2. **Nessun filtro bambini sui semi (contaminazione del gusto)**:
   In `src/pool/index.js`, i semi inviati al grafo da un profilo bambino contengono l'intera cronologia dell'account, inclusi film d'azione o horror. Il grafo genera quindi cluster e scaffali orientati a contenuti per adulti, che poi il layer Node deve censurare svuotando le righe.
3. **Paginazione post-taglio rotta nei cataloghi e nella watchlist**:
   In `src/stremio/catalogHandler.js` e `src/stremio/providers/WatchlistProvider.js`, il taglio di pagina (`limit = 20`) viene eseguito prima di `applyKidsMode` o dei filtri anime. Ciò porta a pagine tronche o righe con 0 elementi nel client Stremio.
4. **Inesistenza dei semi ponte non-anime in Anime Mode**:
   `convertiSemiPerGrafo` (`src/pool/index.js:256`) scarta tutti i semi non-anime con una condizione binaria. Non esiste alcuna logica di pesatura mista (es. 80% anime, 20% non-anime con peso ridotto) per permettere al grafo di sfruttare il gusto cinematografico generale dell'utente.
5. **Assenza di una definizione positiva per Bambini**:
   Il filtro bambini attuale è puramente negativo (esclude 3 generi e 23 keyword). Non richiede la presenza di `Family` (10751) o `Kids` (10762), né verifica la certificazione massima consentita (es. `PG` / `TV-Y7` / `G`), permettendo a pellicole d'azione PG-13 o epiche come *Il Signore degli Anelli* di passare come contenuti per bambini.

