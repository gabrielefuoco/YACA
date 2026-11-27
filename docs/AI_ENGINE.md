# La Ricerca

Questo documento descrive come YACA trasforma una richiesta in una pagina di risultati.

Dal **26/11/2026** non c'è più un modello nel percorso: la frase che l'utente scrive è un programma
in una sintassi piccola (§0), un parser deterministico la traduce in **intenti**, e un compilatore li
traduce nei filtri dell'indice. Spariti insieme al modello: il pianificatore Mistral, la cache dei
piani, l'adattatore AI, il secondo catalogo di ricerca (`yaca_search_ai`) e la chiave Mistral dalla
configurazione.

Componenti:

* [src/ricerca/pianificatore.js](../src/ricerca/pianificatore.js): il parser (`analizza` puro,
  `risolvi` con risolutori iniettati, `pianifica` come porta).
* [src/ricerca/risolutori.js](../src/ricerca/risolutori.js): i risolutori veri — lessico italiano,
  grafo gerarchico, `people.db`, FTS dei titoli, provider.
* [src/ricerca/compilatore.js](../src/ricerca/compilatore.js): intenti → filtri dell'indice
  (`compilaIntento`, `eseguiPiano`, `eseguiPiani` con consensus).
* [src/ricerca/ricercaUnificata.js](../src/ricerca/ricercaUnificata.js): il percorso unico.
* [src/ricerca/registry.js](../src/ricerca/registry.js): il registro delle fonti; la ricerca e i
  cataloghi scritti delegano qui.

> [!NOTE]
> La generazione dei cataloghi personalizzati (*True Blend*, *Smart AND*, *Top Genres*) non richiede
> chiamate esterne: è eseguita dal motore SQL in-memory **DuckDB** e dal calcolatore bayesiano
> **VSM** ([catalogStrategies.js](../src/engines/hybrid/catalogStrategies.js)).

---

## 0. La sintassi (l'unico modo per chiedere)

La ricerca non interpreta il linguaggio naturale: **la frase è un programma**, e il parser è
deterministico. Una riga = un'intenzione; nel creator di cataloghi ogni riga è un blocco, e il
consensus le fonde. Le virgole separano i valori; più valori dello stesso operatore sono **OR**,
tranne `anno` (intervallo) e `simili` (semi della stessa diffusione).

| Operatore | Valore | Esempio |
|---|---|---|
| `simili` | uno o più titoli | `simili interstellar, arrival` |
| `titolo` | testo sul titolo | `titolo batman` |
| `generi` | i 19 generi (nomi italiani) | `generi horror, commedia` |
| `tema` | genere o keyword, anche italiano | `tema horror, navi, natalizi` |
| `cast` | una o più persone | `cast leonardo dicaprio` |
| `regista` | una o più persone (film: registi; serie: creatori) | `regista nolan, villeneuve` |
| `anno` | `1997` · `1990-2000` · `80` · `80-90` · `1990-` · `-1999` | `anno 1980-1989` |
| `voto` | `7+` · `7-9` · `-4` · `7.5+` | `voto 7+` |
| `durata` | minuti: `90-120` · `180-` · `-150` | `durata 90-150` |
| `eta` | certificazione per fasce (G, PG, PG-13, R, T, VM14, VM18, 6+/14+/18+) | `eta PG-13` |
| `senza` | genere o tema da escludere (il tipo si ricorda fra le virgole) | `senza genere horror, commedia senza tema splatter` |
| `su` | piattaforma | `su netflix, prime` |
| `lingua` | nome italiano o codice | `lingua giapponese` |
| `paese` | nome italiano o codice | `paese giappone` |
| `anime` | (nessun valore: è un flag) | `anime tema isekai` |
| `ordina` | `popolarita` · `voto` · `data` · `incasso` | `ordina voto` |

Regole che cambiano il risultato:

- **senza operatori = ricerca sul titolo** (`batman` funziona come sempre);
- **con almeno un operatore, il testo che avanza si scarta** e finisce nei `motivi`
  (`motivi: ["ignorato: film"]`);
- **un valore non risolto non svuota la ricerca**: è un motivo (`tema_non_riconosciuto: X`,
  `regista_non_risolto: X`, `valore_mancante: anno`, `anno_non_valido: X`, …);
- **i titoli con la virgola restano interi**: si prova il prefisso più lungo che l'indice conosce
  (`amici miei, atto ii` resta un film);
- `eta` confronta per **fasce**, non in ordine alfabetico: il dump mescola sistemi (R, PG-13, T,
  VM14, 14+) e `NR` resta fuori («non sappiamo» non è «va bene»);
- **`tema` espande solo con le sorelle affini**: il cluster L1 del grafo contiene anche keyword
  generiche che sostituiscono il tema invece di allargarlo, e la scelta è precalcolata nel dump
  (`src/data/sorelle-affini.json`, costruito da `scripts/build-sorelle-affini.js`). Tiene una
  sorella solo se almeno il 15% dei suoi titoli ha anche l'ancora (≥3 in assoluto): così `mecha`
  porta `gundam` (97% di sovrapposizione) e `princess` non porta `enchant` (3%, cioè Harry Potter
  dentro «principesse»). Ciò che non è nell'artefatto non si espande.

---

## 1. Il percorso unico

```mermaid
graph TD
    A[Ricerca Stremio: yaca_search_standard] --> B[Parser della sintassi]
    B --> C[Intento: generi, tema, persone, anno, voto, …]
    C --> D{Quale modo?}
    D -->|testo| E[Indice locale: DuckDB FTS + Tier 2 FTS5 + nomi appresi]
    D -->|filtri| F[DuckDB: getDuckDbCatalogFromFilters]
    D -->|semi| G[POST /vicini: i vicini dalla matrice]
    D -->|più righe| H[Una lettura per riga + consensus]
    E --> I[Pagina: CATALOG_PAGE_SIZE titoli (100), Stremio chiede la successiva con skip]
    F --> I
    G --> I
    H --> I
```

Una riga sola in Stremio; più righe (`intenti` multipli) nei cataloghi scritti, dove il consensus
fonde le liste. Ogni passo lascia un **motivo** (`tema_non_riconosciuto`, `ignorato: …`,
`simile:colonna`, `anno_non_valido`, …): in Stremio finiscono nei log, nel creator sono visibili.

## 2. L'indice locale (il modo `testo`)

1. **Tier 1 — DuckDB.** `getDuckDbCatalogFromFilters({ _search: q })`: BM25 come candidato veloce,
   **ogni termine deve comparire** nel titolo (`title`/`original_title`), titolo esatto come primo
   criterio d'ordine ([compiler.js:60-97](../src/indice/compiler.js)).
2. **Tier 2 — SQLite FTS5** ([tier2.js](../src/indice/tier2.js)): 1,48 M titoli del daily export
   TMDB, ultimo token con prefisso `*`. Arrivano grezzi e vengono arricchiti dopo.
3. **Nomi appresi** ([learnedNames.js](../src/ricerca/learnedNames.js)): i titoli italiani già visti
   una volta, massimo 5, in coda.
4. **Arricchimento** ([tier2Enrich.js](../src/ricerca/tier2Enrich.js)): poster e titolo italiano per i
   soli item del Tier 2, concorrenza 5, budget 3500 ms.

## 3. I vicini (`simili X`)

`simili interstellar` (o `simili got, bridgerton`: più semi, una lettura sola) chiede i vicini al
**servizio del grafo** con `POST /vicini`:

```
POST /vicini  { semi: [{ tmdbId: 157336, medium: "movie" }], medium: "movie", cap: 60 }
→ { contratto: 2, versioni: {…}, semi: { n: 1, scartati: 0 },
    vicini: [{ tmdbId: 27205, medium: "movie", punteggio: 3.83 }, …], motivi: [] }
```

La rotta legge la **matrice precalcolata** `vicini-top100.npz` (top-100 pesati per titolo, costruita
offline): è una lettura di riga — **0,8 ms con tre semi**. La provenienza (`versioni.input`, sha del
triangolo) dice da quale grafo nasce la matrice. Ogni seme versa **1,0 di massa** (normalizzazione
per riga): un titolo co-visto con molti semi sale.

I titoli arrivano per id e punteggio e si **idratano dall'indice conservando l'ordine del grafo**. Gli
altri vincoli dell'intento si applicano dentro (`simili interstellar anno 2010`), per questo si
chiedono più vicini di una pagina.

Come si sceglie il seme di un titolo scritto: vince il **match esatto**; poi un prefisso di almeno
cinque caratteri, se ne identifica uno solo; se ne identifica più d'uno vince il **più visto**
(`vote_count`, poi popolarità) — «hunger game» è *Hunger Games*, non il documentario dietro le
quinte. Un titolo che non si risolve resta un motivo (`titolo_non_risolto: X`) e non svuota la
ricerca: `simili got, X` usa il seme che conosce.

Se il grafo non risponde — servizio giù, semi fuori canone, nessun vicino nel nostro dump — si
ripiega sulla colonna `recommendations` del parquet (una query per seme, poi consensus) e il motivo
dice quale delle due ha risposto: `simile:grafo` o `simile:colonna`. Budget: 4000 ms
(`RICERCA_GRAFO_TIMEOUT_MS`).

## 4. Cache

La ricerca **non ha una cache di risultati**: l'indice risponde in ~250 ms e ogni pagina si ricalcola.
La cache dei piani (`ai_prompt`) è stata rimossa insieme al modello. Restano le cache dei metadati
(`tmdb_details_raw`, che è ciò che rende gratis l'arricchimento) e dei cataloghi (che la ricerca non
usa: `extra.search` la bypassa).

## 5. I cataloghi scritti

Un catalogo personalizzato può essere **scritto in sintassi**: una riga per blocco, salvate come
`testo` più lo snapshot compilato `intenti`. Al serving, `serveCatalogoScritto`
([registry.js](../src/ricerca/registry.js)) passa dal medesimo parser e compilatore della ricerca. I
cataloghi salvati prima del 26/11/2026 (forma `queries`) continuano a funzionare sul percorso
precedente (`executeUniversalPipeline`).

Le **liste manuali** di titoli restano `queries`: un elenco non è una ricerca.

## 6. Degrado dichiarato

Nessuna funzione del percorso solleva: il caso normale è `{ items, motivi }`.

| Guasto | Risposta |
|---|---|
| valore non riconosciuto (`tema`, `cast`, `regista`, `ordine`) | il valore si scarta, il motivo resta (`tema_non_riconosciuto: X`) |
| titolo non trovato per `simili` | nessun seme, motivo `titolo_non_risolto: X`; la ricerca resta valida |
| indice FTS5 assente | si continua sui soli titoli locali (log una volta sola) |
| arricchimento lento | si risponde con quello che è pronto, il resto alla richiesta successiva |
| indice DuckDB non pronto | lista vuota + `motivi`, mai un'eccezione |
| grafo giù | `simili` ripiega sulla colonna del parquet (`simile:colonna`) |

## 7. Variabili d'Ambiente

| Chiave | Scopo | Note |
| :--- | :--- | :--- |
| `TMDB_API_KEY` | Risoluzione dei nomi non ingeriti e metadati | usata in modo residuale: keyword e titoli si risolvono in locale |
| `RICERCA_GRAFO_TIMEOUT_MS` | Budget della chiamata `/vicini` | default `4000` |
| `RICERCA_ESPANSIONE` / `RICERCA_ESPANSIONE_MAX` | Espansione dei concetti con le sorelle affini (artefatto precalcolato) | default attiva, al massimo 4 sorelle; `RICERCA_ESPANSIONE=0` la spegne |
| `MISTRAL_API_KEY` / `MISTRAL_MODEL` | **non più usate** | la ricerca non chiama modelli; la chiave è stata rimossa dalla configurazione |
