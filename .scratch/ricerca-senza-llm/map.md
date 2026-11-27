# ricerca-senza-llm — togliere Mistral dalla ricerca

Aperta il 26/11/2026. La ricognizione sta in [ricognizione.md](ricognizione.md): leggerla prima di
qualsiasi decisione, perché contiene il fatto che cambia la domanda (§0).

## Destination

La ricerca di YACA — sia la «Ricerca Veloce» (`yaca_search_standard`) sia la «Deep AI Search»
(`yaca_search_ai`) — deve capire una frase italiana naturale **senza chiamare un LLM a runtime**,
restando veloce, deterministica e spiegabile (`motivi[]`), e senza perdere qualità sulle ricerche
che oggi funzionano.

Non è «staccare una chiave»: è dimostrare che un pianificatore locale batte — o pareggia — il piano
di Mistral sul gold set, e solo allora spegnere il percorso LLM della ricerca.

Il motore di retrieval non si tocca: Mistral produce **solo il piano** (JSON di query), tutto il
resto è già DuckDB + profilo + consensus (§0 della ricognizione).

## Decisioni prese

| | |
|---|---|
| **26/11 — la ricerca è UNA** | `yaca_search_standard` e `yaca_search_ai` passano da `cercaUnificata`: locale sempre, piano AI solo se il locale non basta (2+ parole, nessun titolo esatto, <12 risultati, prima pagina, chiave presente) |
| **26/11 — cache solo dei successi** | il piano entra in cache solo se ha estratto un vincolo reale; i ripieghi (anche quelli con `strategy: 'multi_search'` a un livello più basso) non si salvano più. Le risoluzioni nome→id non cachano i miss |
| **26/11 — la pagina la compone la ricerca** | la sorgente restituisce 20, non la fusione intera: altrimenti i risultati dell'AI finirebbero in coda a 40 titoli già tagliati dal `catalogHandler` |
| **26/11 — mistral resta, ottimizzato per DuckDB** | una lettura sola per query (non tre pagine), `similar_to` risolto sull'indice locale, keyword risolte dal dizionario locale, budget 8 s (anche timeout del client) |
| **Sostituire il parser, non il motore** | il contratto `{ queries: [...] }` è la cerniera: `AiQueryNormalizer`, `executeUniversalPipeline`, consensus e iniezione profilo restano identici |
| **Il pianificatore locale è deterministico e spiegabile** | ogni estrazione lascia un motivo; niente modelli, niente embeddings in prima battuta (restano un'opzione B da valutare *dopo* la misura) |
| **La lista statica si elimina, non si replica** | «i 10 film horror più spaventosi» → discovery + `sort_by vote_average.desc`: l'LLM che nomina titoli allucina, e non c'è ragione di riprodurre quel difetto |
| **La FTS del Tier 1 è la leva vera** | le trame nel parquet sono **italiane** e oggi fuori dall'indice: cercare «navi» nella trama non richiede tradurre niente |
| **Un indice nuovo, non un indice modificato** | `fts_main_*` resta com'è (i preset ci si appoggiano); la ricerca per frase userà una FTS5 dedicata sul Tier 1 con `title + overview + keywords` |
| **Flag, non big-bang** | `RICERCA_AI_BUDGET_MS` per il budget; l'A/B si fa sulle stesse query |
| **26/11 — il testo è la forma salvata** | il block editor resta e **genera la sintassi** (`testoDaBlocco`); una riga = un blocco; le liste manuali restano `queries` |
| **26/11 — la lingua si estende per l'editor** | sette operatori nuovi (`titolo`, `regista`, `voto`, `durata`, `eta`, `senza`, `ordina`): erano le uniche dimensioni dell'editor che la sintassi non esprimeva |
| **26/11 — Mistral non esiste più** | rimossi modello, cache dei piani, adattatore, chiave, UI, endpoint di verifica e il catalogo `yaca_search_ai`; la ricerca è `parser → compilatore → indice` |

## Fatto il 26/11/2026

* `src/ricerca/ricercaUnificata.js` — un percorso solo, con `deveChiedereAi`, `unificaRisultati`,
  `cercaUnificata`; entrambi gli id di ricerca delegano lì.
* Sonda end-to-end sul DuckDB vero: `.scratch/ricerca-senza-llm/probe-ricerca.js` (locale, ~250 ms) e
  `probe-piano-finto.js` (piano iniettato → SQL → risultati). La chiave Mistral in `.env` risponde
  **402 («no api budget»)**: il ramo reale non è verificabile da qui, il ramo di degrado sì.
* 138 test verdi sulle suite di ricerca; `duckDbPresetsValidation` e `heroMovieDateRegression`
  scadono i 30 s *anche sull'albero pulito* (preesistenti, non toccati).

## Fatto: le sette fette

`people.db` · parser della sintassi · risolutori (lessico+grafo+persone+titoli+provider) ·
compilatore + ricerca unificata · vicini da `/vicini` · form web con catalogo scritto in sintassi ·
**Mistral eliminato**. Dettagli e misure in `spec.md` §8-18.

## Parcheggiato (26/11/2026, decisione esplicita)

**Il lavoro sul grafo.** Misurato e deciso di fermarsi qui:

- la matrice top-100 **normalizzata per riga** batte PageRank sul recall@60 (0,111 vs 0,076, p<0,0001,
  confermato su 3 split e col controllo di contaminazione) — ma **a occhio le liste sono la stessa
  lista al 56-77%**, con lo stesso rumore;
- il difetto visibile è **8-12 hub di co-visione su 60** (*Shaggy e Scooby-Doo*, *Dateline*,
  *Xiaolin Showdown*…) che compaiono identici in tutti i metodi: è un problema del **grafo**, non
  dell'algoritmo di lettura;
- quindi: nessun cambio ai cataloghi. La ricerca usa `/vicini` (matrice, normalizzata) perché per
  «simili X» è la primitiva giusta e costa 0,02-0,8 ms; i cataloghi restano su PageRank.

Dettagli e numeri in `spec.md` §14-16. Riprendere da lì se e quando si vuole attaccare il rumore
(specificità/lift al posto della co-occorrenza grezza, o filtro sugli hub).

## Non ancora specificato

- **Il multi-intento** («amo GoT ma la mia ragazza Bridgerton»): split euristico, o lasciarlo
  all'LLM come unica eccezione dichiarata, o rinunciarci. È l'unico compito in cui un LLM batte una
  regola.
- **Il lessico concetti→keyword**: scritto a mano (~40 coppie già in `prompts.js`), estratto dal
  grafo gerarchico, o **costruito una volta offline** con un LLM (chiamata a build-time, zero a
  runtime). La terza opzione è la più promettente e la meno decisa.
- **`applyAiQualityFilters`** (`vote_count.gte: 75`, whitelist 7 lingue): è una decisione editoriale
  nascosta nel provider. Va promossa a parte del piano, o documentata come tale. Chi decide?
- **Le persone**: lessico locale dal parquet (nome→id) o si continua a chiamare `/search/person`?
  Il primo toglie l'ultima dipendenza TMDB dalla ricerca, il secondo è una riga.
- **Che fine fa la chiave Mistral** per chi oggi la fornisce per cercare: sparisce dalla UI, resta
  solo per la creazione cataloghi, o resta con un avviso «non più necessaria per la ricerca»?
- **La creazione cataloghi** (percorso D) resta su Mistral in questa fase. Se il pianificatore locale
  si dimostra buono, la stessa sostituzione si applica lì: è la stessa funzione.

## Fuori scope

- La creazione di cataloghi con un prompt: si tocca **dopo**, e solo se il pianificatore locale vince
  la misura sulla ricerca.
- Il ranking dei cataloghi, il VSM, il DNA, gli hero: nessuna modifica. Se il piano è identico, i
  risultati sono identici.
- Embeddings / vettori / modelli locali: opzione B, non prima fetta. Da valutare solo se la FTS su
  trama+keyword non basta, e solo con numeri alla mano.
- La Ricerca Veloce per titolo: oggi è già senza LLM e già buona. Si estende, non si riscrive.
