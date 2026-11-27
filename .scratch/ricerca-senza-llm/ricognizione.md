# La ricerca di YACA e dove entra Mistral

Ricognizione del 26/11/2026. Legge il codice, non i piani: ogni affermazione ha un file:riga.
Serve a decidere *come* togliere Mistral dalla ricerca, non a toglierlo ancora.

---

## 0. La scoperta che cambia la domanda

Nella ricerca «AI», **Mistral non fa la ricerca**: produce solo il *piano* (un JSON di query
strutturate). Tutto quello che segue — retrieval, filtri, scoring, consensus, iniezione del
profilo, arricchimento, formattazione — è **già locale e deterministico**, su DuckDB.

```
[query utente] → Mistral → JSON {queries[]}  →  AiQueryNormalizer (nomi→ID via TMDB)
                                              →  DuckDbProvider (SQL)
                                              →  consensus + profilo
                                              →  pagina Stremio
```

Quindi «rimuovere Mistral dalla ricerca» = **sostituire il parser**, non il motore. Il contratto
`{ queries: [ { strategy, genre_ids, year_from, ... } ] }` è già la cerniera: chi lo produce
oggi è un LLM, chi lo consuma non sa e non deve sapere chi lo ha prodotto.

Questo riduce drasticamente il rischio: nessuna parte del ranking va riscritta, e il percorso
nuovo può convivere col vecchio dietro un interruttore per misurare A/B sullo stesso gold set.

---

## 1. Quattro ricerche diverse (spesso confuse in una parola sola)

| # | Chi la usa | ID / rotta | LLM? | Cosa interroga davvero |
|---|---|---|---|---|
| **A** | Stremio, barra di ricerca | `yaca_search_standard` | **no** | DuckDB FTS (Tier 1) + SQLite FTS5 (Tier 2, 1.485.129 titoli) + nomi appresi |
| **B** | Stremio, catalogo dedicato | `yaca_search_ai` («Deep AI Search») | **sì** | piano Mistral → SQL DuckDB + profilo |
| **C** | Web app (autocomplete creatore) | `GET /api/ricerca` → `door.cerca` | **sì, ma Buttato** | FTS locale + TMDB `/search/multi` |
| **D** | Web app, creazione catalogo | `POST /api/catalog/preview-catalog` | **sì** | prompt → filtri → SQL DuckDB |

Le prime due stanno nel manifest Stremio ([manifest.js:167-170](../src/stremio/manifest.js)),
con la stessa `extra: [{ name: 'search', isRequired: true }]`.

---

## 2. Percorso A — Ricerca Veloce (nessun LLM, ed è già buona)

`CatalogRouter` consulta il registro delle fonti
([CatalogRouter.js:52](../src/stremio/CatalogRouter.js)); per `yaca_search_standard` vince la voce
`duckdb` ([registry.js:71-146](../src/ricerca/registry.js)) che fa tre query e le fonde:

1. **Tier 1 — DuckDB locale.** `getDuckDbCatalogFromFilters({ _search: q })`. Il compilatore
   ([compiler.js:60-97](../src/indice/compiler.js)) costruisce:
   - `fts_main_movies.match_bm25(id, ?)` come candidato veloce;
   - **ma ogni termine deve comparire**, via `ILIKE '%term%'` su
     `concat(coalesce(title,''),' ',coalesce(original_title,''))` — è una AND rigida;
   - ordinamento `exactTitle ASC, bm25 DESC, id ASC`: il titolo esatto è sempre #1.
   Conseguenza dichiarata in [ALGORITHMS.md §6.4](ALGORITHMS.md): una frase naturale dà **0
   risultati**, non falsi positivi. È il limite strutturale che ha fatto nascere la ricerca AI.

2. **Tier 2 — SQLite FTS5** ([tier2.js:...](../src/indice/tier2.js), `Tier2SearchClient`).
   1,48 M titoli del *daily export* TMDB, colonne `id, type, title, original_title, popularity,
   release_date` — **senza poster, senza trama, senza generi**. La query è sanificata
   (`sanitizeFts5Query`): si buttano i non-alfanumerici, ogni token diventa una frase, **l'ultimo
   token ha il prefisso `*`** (così «interstell» trova «Interstellar»). Semantica implicita AND.

3. **Nomi appresi** ([learnedNames.js](../src/ricerca/learnedNames.js)): i titoli italiani dei
   titoli Tier 2 già visti una volta, scritti in un SQLite dedicato (`learned_names.db`, tetto
   20.000 righe). Si cercano in coda, max 5.

Fusione: i locali vincono, il Tier 2 duplicato si scarta
([fusione.js:50-70](../src/ricerca/fusione.js)). Poi **arricchimento** dei soli item Tier 2
([tier2Enrich.js](../src/ricerca/tier2Enrich.js)): `getTmdbMetaDetails` (cache `tmdb_details_raw`),
concorrenza 5, **budget 3500 ms** — scaduto il budget si risponde con quello che è pronto, il
resto si completa alla richiesta dopo. Il nome italiano imparato viene scritto fire-and-forget.

Paginazione: 20 ([registry.js:88-92](../src/ricerca/registry.js), `PRESET_PAGE_SIZE`).

> **Il punto da tenere**: A è veloce, deterministico, spiegabile e — sulle **ricerche per titolo** —
> migliore di B. È debole solo sulla **frase naturale**. Non va sostituito: va esteso.

---

## 3. Percorso B — «Deep AI Search» (dove sta Mistral)

`AiDiscoveryProvider.executeCombinedSearch`
([AiDiscoveryProvider.js:282](../src/stremio/providers/AiDiscoveryProvider.js)):

```js
if (mistralKey) {
    const routing = await routeLiveStremioSearch(search, mistralKey);   // ← Mistral
    if (routing.filters.strategy === 'static_list') { ...risolve i titoli... }
    plannedQueries = routing.filters.queries.filter(...);
}
if (plannedQueries.length > 0) plannedQueries = await normalizeAiDiscoveryQueries(...); // TMDB /search/keyword + /search/person
if (plannedQueries.length === 0) {                    // ← il buco
    usingLexicalFallback = true;
    plannedQueries = [{ strategy: 'lexical_search', text_search: search }];
}
```

Catena a monte (`routeLiveStremioSearch` → `generateTmdbFiltersFromPrompt`,
[router.js:157-233](../src/ricerca/router.js)):

- modello `process.env.MISTRAL_MODEL || 'open-mistral-nemo'` — il commento a
  [router.js:183](../src/ricerca/router.js) dice che `mistral-small-latest` sui piani gratuiti ha
  `limit-req-minute = 0` e quindi **ogni chiamata torna 429**;
- `temperature 0.1`, `response_format: json_object`, timeout **25 s**;
- **cache Redis** `ai_prompt` (versione 1, chiave = prompt+taskType+kidsMode) — si mette in cache
  solo se `strategy !== 'multi_search'`;
- sanitizzazione a whitelist (`ALLOWED_AI_FIELDS`, `sanitizeSingleQuery`) e fallback a
  `multi_search` su JSON rotto.

Poi, a valle ([AiDiscoveryProvider.js:20-22](../src/stremio/providers/AiDiscoveryProvider.js)),
una **politica nascosta** che nessuno ha chiesto all'utente ma che il risultato usa:
`vote_count.gte = 75` e `original_language ∈ {en,it,es,fr,de,ja,ko}` su ogni discovery.

Infine il pezzo che *fa* l'AI senza sembrarlo: `injectProfilePreferences` prende i **top-3 keyword**
e **top-2 generi** del `V_final` e li accoda in OR — con una guardia esplicita: se c'è già un
vincolo tematico esplicito (`_keywordNames`, `with_keywords`, `with_cast`) non si accoda nulla,
altrimenti «superhero» diventerebbe «qualsiasi film del DNA».

**Cosa risponde oggi senza chiave Mistral**: una `lexical_search` sul titolo. Cioè, senza LLM,
«Deep AI Search» è *peggiore* della Ricerca Veloce (non ha Tier 2, non ha nomi appresi). Questo è
il buco da chiudere — non un dettaglio.

---

## 4. Percorso C — `/api/ricerca` (e una chiamata a Mistral dal risultato buttato)

`door.cerca` ([door.js:78-265](../src/ricerca/door.js)) è la porta unica: `{ q, tipo, contesto, cap }`
→ `{ items, motivi[] }`, mai un errore. La usa l'autocomplete del creatore
([api.ts:192-199](../frontend/src/lib/api.ts)).

Ma alle righe [173-181](../src/ricerca/door.js):

```js
const isNaturalQuery = query.split(/\s+/).length > 3;
if (isNaturalQuery) {
    const aiResult = await richiediComprensioneAI({ query, mistralKey, context: contesto });
    if (aiResult.degraded) motivi.push(aiResult.reason);
}
```

`aiResult.comprensione` **non viene mai letta**. È una chiamata al modello (fino a 25 s, con
`mistral-small-latest` hardcoded a [aiAdapter.js:56](../src/ricerca/aiAdapter.js)) il cui unico
effetto è eventualmente aggiungere una stringa a `motivi`. Sprecata, e **rallenta l'autocomplete di
una query lunga fino a 25 secondi**.

Non è teorico: `/api/ricerca` non passa `mistralKey` ([api/ricerca.js:44-51](../src/api/ricerca.js)),
ma `richiediComprensioneAI` ricade su `chiaveEffettiva({ servizio: 'mistral' })` che legge
`process.env.MISTRAL_API_KEY` ([chiavi.js:72-73](../src/configurazione/chiavi.js)). **Con una chiave
globale configurata sul server, ogni ricerca web di più di 3 parole brucia una chiamata.**

---

## 5. Percorso D — Creazione cataloghi con un prompt

Due punti d'ingresso, stesso parser:

- `POST /api/catalog/preview-catalog` ([catalog.js:96](../src/api/catalog.js)) — il pannello
  «Genera con AI» del creatore ([CreatorPanel.tsx:263](../frontend/src/components/dashboard/CreatorPanel.tsx));
- `POST /api/configurazione/...preview` ([configurazione.js:168](../src/api/configurazione.js)).

Qui Mistral produce i filtri del catalogo *e* — con `strategy: 'static_list'` — **i titoli** di una
lista («i 10 migliori film horror»). Nel secondo caso ogni titolo viene poi risolto su TMDB
(`getTmdbIdByName` + dettagli): se il modello allucina un titolo, il titolo semplicemente non esiste
e sparisce dalla lista. È l'unico punto dove Mistral ha un ruolo *creativo* (nominare opere), ed è
anche quello in cui sbaglia di più.

---

## 6. Inventario completo delle chiamate a Mistral

| Dove | File:riga | Funzione | Nota |
|---|---|---|---|
| Ricerca AI Stremio | `src/ricerca/router.js:157` | `generateTmdbFiltersFromPrompt` | 25 s, cache Redis, `open-mistral-nemo` |
| Rotte live | `src/ricerca/router.js:224` | `routeLiveStremioSearch` | wrapper a `multi_query` |
| Door web | `src/ricerca/door.js:175` | `richiediComprensioneAI` | **risultato buttato**, `mistral-small-latest` |
| Adattatore | `src/ricerca/aiAdapter.js:44-52` | client | modello hardcoded, diverso dal router |
| Client | `src/ai/client.js:13` | `createAiClient` | unico punto che istanzia l'SDK |
| Preview catalogo | `src/api/catalog.js:96` | filtri da prompt | richiede chiave personale (403 senza) |
| Preview configurazione | `src/api/configurazione.js:168` | filtri da prompt | idem |
| Validazione chiave | `src/api/tmdb.js:124`, `src/api/configurazione.js:301` | ping | fuori dalla ricerca |
| `processProfiles` | `src/api/configure/profileProcessor.js:31` | **parametro `mistralKey` mai usato** | residuo morto: la firma promette una sintesi AI che non c'è |

Mappa delle dipendenze dichiarata in [chiavi.js:24-27](../src/configurazione/chiavi.js):
`ricerca_semantica`, `cataloghi_ai`, `fusione_nomi_cataloghi` → tutti `mistral`. Le prime due sono
reali; `fusione_nomi_cataloghi` non ha consumatori (`motivoDegradoFeature` è esportata e non
chiamata).

---

## 7. Cosa fa davvero il LLM (e cosa costa)

Nove compiti, tutti traducibili in regole tranne due:

| # | Compito | Difficoltà senza LLM |
|---|---|---|
| 1 | genere (anche multiplo) da sinonimi italiani («horror», «poliziesco») | banale — 19 generi, dizionario già scritto in `prompts.js` |
| 2 | concetto → keyword TMDB inglese («balene»→whale, «viaggi nel tempo»→time travel) | banale — ~40 coppie già in `prompts.js`, estendibili |
| 3 | decennio/anno («anni 80», «del '99») | banale — regex |
| 4 | lingua/paese («americani»→en, «in italiano»→it-IT) | banale — mappa |
| 5 | persona («con Brad Pitt») | media — oggi TMDB `/search/person`; **il parquet ha già `cast`/`directors` con nome** |
| 6 | provider («su Netflix») | banale — mappa su `watch_providers_it` |
| 7 | `similar_to` («tipo Interstellar») | banale — FTS sul titolo + colonna `recommendations` già usata dal compilatore |
| 8 | decomposizione multi-intento («amo GoT ma la mia ragazza Bridgerton») | **difficile** — split su congiunzioni + euristica, oppure si rinuncia |
| 9 | liste statiche («i 10 film horror più spaventosi») | **meglio non farla**: discovery + `sort_by vote_average`, zero allucinazioni |

Il compito 8 è l'unico in cui un LLM batte una regola; ed è anche quello che quasi nessuno scrive
nella barra di ricerca. Da decidere, non da assumere.

---

## 8. I mattoni che ci sono già (e che nessuno usa per la ricerca)

1. **Il parquet è in italiano.** Il daemon interroga TMDB con `language: 'it-IT'`
   ([tmdbDumpClient.js:290,311](../../services/tmdb-daemon/tmdbDumpClient.js)) con fallback
   it→en→originale. Quindi `overview` e `title` sono **trame italiane** per tutti i ~117k titoli del
   Tier 1. Oggi la FTS di DuckDB indicizza **solo** `title` e `original_title`
   ([duckDbStore.js:530,538](../src/indice/duckDbStore.js)): `overview` e `keywords` sono nel
   database e **fuori dall'indice**. «film horror anni 80 sulle navi» potrebbe trovare `ship` nelle
   keyword e «navi» nella trama, senza tradurre niente.
2. **Mappa nome↔id delle keyword, già in RAM.** `buildDfCache`
   ([duckDbStore.js:942-985](../src/indice/duckDbStore.js)) legge tutte le keyword dei parquet e
   costruisce `idToName`/`nameToId` + il document frequency. Conseguenza: `keywordStr` in
   [filters.js:31-38](../src/indice/filters.js) sa filtrare **per nome** (`keywords ILIKE '%"time
   travel"%'`) senza passare da TMDB. Oggi la ricerca AI risolve i nomi con `/search/keyword`
   (rete, [AiQueryNormalizer.js:139-150](../src/stremio/providers/AiQueryNormalizer.js)).
3. **Persone nel parquet.** `cast` è `[{id,name,character,order}]`
   (fixture: `tests/tier1Promotion.test.js:20`), `directors`/`writers` per i film, `created_by` per
   le serie. Un lessico persone (nome→id) è precalcolabile con una query, esattamente come si fa
   per le keyword.
4. **Il grafo gerarchico L1→L5.** `src/data/hierarchical_graph.json`: 1382 micro-cluster L1, 469
   L2, 131 L3, 70 L4, 5 L5, con `medoid`, `top_keywords`, `children_*`, `L1_adjacency`,
   `inferred_genres` e `genre_distribution`. È un'ontologia di concetti **già costruita**: «navi»
   → L1 *ship* → L2/L3 → espansione di keyword. Oggi serve solo a vettorizzare il DNA, mai a
   interpretare una query.
5. **`recommendations` precalcolate** nel parquet: il compilatore le legge già per `_similar`
   ([compiler.js:100-130](../src/indice/compiler.js)).
6. **VSM del profilo** (`dnaEngine`, `ProfileScorer`) e **consensus scoring**: già usati dopo il
   piano, non richiedono il piano.
7. **Il banco di misura esiste come pattern**: `scripts/qa/*`, `scripts/test_relevance_all_presets.js`,
   `scripts/relevance_validation_report.json`. Manca un gold set di *query*.

---

## 9. Proposta: un pianificatore locale deterministico

Un modulo nuovo in `src/ricerca/` — `pianificatore.js` — che espone **la stessa forma** di
`generateTmdbFiltersFromPrompt`:

```js
pianifica({ q, tipo, contesto }) -> { strategy, queries: [ { strategy, genre_ids, with_keywords, … } ], motivi: [] }
```

Passi, tutti locali, nessuna rete:

1. **Normalizza** la query (minuscole, accenti, stopword italiane, numeri/decenni → `year_from/to`).
2. **Estrai** con dizionari: generi, concetti→keyword, lingua/paese, provider, persona, runtime,
   «voto alto» → `vote_average.gte`. Ogni estrazione lascia un `motivo` (spiegabilità).
3. **Risolvi i concetti** in keyword ID con `keywordIds` (mappa locale) o, se manca, in nome con
   `keywordStr`: **zero chiamate TMDB**.
4. **Espandi** con il grafo L1-L2 quando il concetto è astratto («navi» → L1 ship → keyword sorelle).
5. **`similar_to`**: FTS sul titolo → `{ _similar: id }` (percorso già esistente).
6. **Residuo**: se dopo 1-5 resta testo non consumato, quel testo va **in OR come ricerca full-text**,
   non in AND: è l'unico modo di non rispondere 0. Il candidato ideale è una **FTS5 dedicata sul
   Tier 1** con `(title, overview, keywords)` — stesso schema di `titles_fts5.db`, ricostruita dai
   parquet.
7. **Nessun `static_list`**: «i 10 film horror più spaventosi» diventa
   `{ strategy: discovery, genre_ids: [27], sort_by: 'vote_average.desc', vote_count.gte: 500 }`.

Il contratto JSON resta identico ⇒ `AiQueryNormalizer`, `executeUniversalPipeline`,
`applyAiQualityFilters`, `injectProfilePreferences` e il consensus **non si toccano**. Il percorso
nuovo è dietro un flag (`RICERCA_PLANNER=locale|mistral`) per l'A/B sullo stesso gold set.

### Le fette, in ordine di rischio crescente

| Fetta | Cosa | Rischio | Guadagno |
|---|---|---|---|
| 0 | togliere la chiamata morta in `door.js:173-181`; allineare `mistral-small-latest`/`open-mistral-nemo` | nullo | latenza web: −25 s sul caso peggiore |
| 1 | dizionari + decenni + lingua + provider; `pianifica()` per i casi «semplici» (genere+anno+concetto) | basso | la maggioranza delle query reali |
| 2 | `similar_to` locale + `keywordIds` invece di `/search/keyword` | basso | meno rete, più velocità |
| 3 | FTS sul Tier 1 estesa a `overview`+`keywords` (indice separato, non toccare `fts_main_*`) | medio | il salto vero: la frase naturale |
| 4 | lessico persone dal parquet (via `/search/person`) | medio | ultimo pezzo di TMDB tolto dalla ricerca |
| 5 | espansione dal grafo gerarchico | medio-alto | i concetti astratti; da misurare, non da credere |
| 6 | multi-intento (split) | alto | caso raro; si può lasciare a Mistral o rinunciare |

---

## 10. Buchi e trappole da non dimenticare

- **La cache Redis maschera il degrado**: `ai_prompt` mette in cache i piani riusciti; se Mistral
  comincia a dare 429 si continua a servire piani vecchi (stessi prompt → stesso piano, va bene) ma
  i prompt nuovi degradano in silenzio. Con un pianificatore locale la cache diventa inutile (è
  deterministica): va spenta, non raddoppiata.
- **`applyAiQualityFilters` è una decisione editoriale nascosta** (`vote_count.gte: 75`, whitelist di
  7 lingue). Se il pianificatore locale non la replica, i risultati cambiano *anche a piano
  identico*. Va portata fuori dal provider, o documentata come parte del piano.
- **`injectProfilePreferences` accoda top-3 keyword in OR.** Su una discovery già stretta va bene;
  sul fallback lessicale è disattivata per scelta (e c'è un test che lo pretende). Il pianificatore
  locale deve dichiarare *quando* il profilo entra, non ereditarlo per caso.
- **`normalizeAiQuery` scarta l'intera query** se nessun nome è risolvibile
  ([AiQueryNormalizer.js:196-202](../src/stremio/providers/AiQueryNormalizer.js)) — è una buona
  regola, e il pianificatore locale deve poterla soddisfare, o la query sparisce.
- **La FTS del Tier 2 non ha metadati** (niente poster, niente trama): se la frase naturale trova lì
  i suoi risultati, servono i 3500 ms di arricchimento. La FTS sul Tier 1 no: poster e trama ci
  sono già.
- **`yaca_search_ai` restituisce 20 item** (`slice(0, 20)` fisso) e ignora la paginazione: se un
  giorno si vuole «cercare meglio», il primo limite è la pagina singola.

---

## 11. Come misurarlo (prima di scrivere codice)

Un gold set di ~120 query italiane, ognuna con: intento atteso (generi/anno/concetto/persona),
esito atteso (titoli accettabili: sì/no per item, come il banco dei profili), e classe
(titolo esatto / frase naturale / persona / provider / multi-intento).

Metriche, per tre configurazioni (Oggi-AI, Locale, Oggi-lessicale):
`precision@20` giudicata a mano, **% di query con 0 risultati**, latenza p50/p95, % di query in cui
l'intento è stato estratto per intero, % di piani che hanno richiesto fallback.

Senza questo, «ottimizzare la ricerca» è un'opinione: è esattamente l'errore che il banco dei
profili ha già evitato una volta.

---

## 12. Cosa è stato fatto il 26/11/2026 (prima del grilling)

1. **Un percorso solo.** `src/ricerca/ricercaUnificata.js`: locale → decisione → piano AI → fusione.
   Entrambi gli id (`yaca_search_standard`, `yaca_search_ai`) delegano lì. La decisione
   (`deveChiedereAi`) è: 2+ parole, nessun titolo esatto, meno di 12 risultati locali, prima pagina,
   chiave presente.
2. **Cache dei piani: solo i successi.** `pianoUtilizzabile()` + versione 2. Il difetto vero era che
   il ripiego di un task `multi_query` non ha `strategy` al livello superiore e quindi **veniva
   cachato**. Ora un ripiego ha sempre `motivi` e non entra.
3. **Nessuna cache dei miss** in `getTmdbIdByName` e in `AiQueryNormalizer`.
4. **Ottimizzazioni per DuckDB.** Una lettura sola per query (prima tre pagine da 20), `similar_to`
   risolto sull'indice locale prima che su TMDB, keyword risolte con la mappa nome↔id che l'indice
   ha già in RAM, budget 8 s usato anche come timeout del client.
5. **Rimossa la chiamata morta** di `richiediComprensioneAI` in `door.js` (risultato mai letto,
   fino a 25 s su un autocomplete).
6. **Verifica.** 138 test verdi; sonda reale sul DuckDB locale (`probe-ricerca.js`, ~250 ms a
   ricerca) e sonda del ramo AI con piano iniettato (`probe-piano-finto.js`: «horror anni 80 sulle
   navi» → *Fog* e *La nave fantasma*; «tipo Interstellar» → simili dalle `recommendations`).
   La chiave Mistral in `.env` risponde 402: il cervello vero non è verificabile, il degrado sì.

Restano aperti — e sono le domande del grilling: la forma esterna (uno o due cataloghi nel
manifest), la soglia di escalation, il multi-intento, il lessico concetti→keyword, la promozione di
`applyAiQualityFilters` a decisione esplicita, e che fine fa la chiave Mistral per chi la fornisce.
