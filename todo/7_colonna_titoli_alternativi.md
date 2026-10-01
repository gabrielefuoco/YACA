# Obiettivo: la colonna dei titoli alternativi di TMDB (con backfill progressivo)

Deciso dall'umano il 01/10/2026. **Fuori dalla mappa `doppiaggio-ita`**: non serve al badge (misurato: rende
~6% sulle schede scoperte), serve alla **ricerca** — vedi `todo/6_ricerca_titoli_alternativi.md`, che ne è il
consumatore.

## La strategia decisa

1. **Prima solo ciò che serve**: prendere i titoli alternativi da TMDB per i film e le serie che restano
   **scoperti** (le schede che il match non riesce ad agganciare).
2. **Poi progressivamente tutto il database**: aggiungere la colonna **nel dump**, così la prossima esecuzione
   la prende da sé per i titoli nuovi, e i record vecchi si colmano a poco a poco.
3. **Utile anche alla ricerca**: si potrà cercare sia per titolo sia per titolo alternativo.

## Fatti misurati (01/10/2026)

- Il nostro dump **non li contiene**: `master_movies.jsonl`/`master_tv.jsonl` hanno 35 campi, solo `title` e
  `original_title`. Nessun `alternative_titles`.
- L'API di TMDB li ha: `/{type}/{id}/alternative_titles`, anche come `append_to_response`. La chiave è in `.env`.
- Su **50 schede AG rimaste scoperte** (dopo articolo + fuzzy stretto,
  `tools/test-titoli-alternativi.js` + `tools/analisi-ricerca-tmdb.js`):

| esito | |
|---|---|
| la ricerca TMDB trova qualcosa | 34 / 50 (68%) |
| il **primo** risultato è nel nostro DB | 4 / 50 (8%) |
| **almeno un** risultato è nel nostro DB | 12 / 50 (24%) — di cui **5 su 12 ambigui** |
| il titolo di AG compare fra i **titoli alternativi** del record | 27 / 50 (54%) |
| **confermati** (nel DB **e** alternativo o anno) | **3 / 50 (6%)** |

- **Perché il 24% non è utilizzabile**: la ricerca restituisce anche roba che assomiglia — `Triple Z` →
  *The Six Triple Eight*, `Safari Express` → *Africa Express*, `McCoy` → *Una bionda tutta d'oro*. Senza la
  conferma, 3 su 4 sono l'opera sbagliata.
- **Perché il valore vero è la ricerca**: il **54%** dei titoli che non agganciamo compare fra gli alternativi
  → sono nomi che un utente ha in testa e digita, e che oggi il nostro indice non conosce.

## Cosa fare

- [ ] **Dove vive il dato**: **NON** nella tabella principale del catalogo. I cataloghi girano su una view lazy
      del parquet con **~95 MB di RSS misurati**: decine di titoli alternativi per riga si pagherebbero su
      **ogni query di catalogo**. Serve un **sidecar** per TMDB id (file/tabella a sé), letto dal match e dalla
      ricerca. Decidere la forma **prima** di scrivere codice.
- [ ] **Nel dump**: aggiungere `append_to_response=alternative_titles` alla fetch dei dettagli
      (`src/utils/tmdbDumpDaemon.js` o dove vive la fetch) → **zero chiamate in più**, viaggia col dettaglio che
      scarichiamo già.
- [ ] **Backfill progressivo**: i ~117k record già in casa (e 1,4M col mirror completo) costano **1 chiamata
      ciascuno**. Va fatto **a rate** (budget giornaliero, es. qualche migliaio), **ripartibile e osservabile**
      (contatore, battito), senza mai competere col daily sync. **Non** una passata unica.
- [ ] **Priorità**: prima le schede scoperte e i gruppi omonimi irrisolti (dove il dato potrebbe servire
      adesso), poi il resto.
- [ ] **Nel match**: gli alternativi solo come **conferma**, mai come chiave sola (vedi le trappole sopra).
- [ ] **Coordinamento obbligatorio**: la mappa `ingestione-db` sta lavorando su Tier 2/FTS5 e *Ricerca
      unificata* **sullo stesso dump**. Parlare con quell'effort **prima** di toccare `tmdbDumpDaemon`: il
      titolo alternativo è una colonna FTS naturale e il sidecar tocca gli stessi file. Rischio concreto di
      costruire la stessa cosa due volte.

## Chiude quando

La colonna c'è sui titoli nuovi (dimostrata su un giro reale), il backfill gira con budget e contatore, il
sidecar esiste **senza** appesantire la tabella principale, e c'è una prova che la ricerca trova un titolo
**solo per nome alternativo**. Doc in `docs/` (`DUCKDB_ARCHITECTURE.md` se il sidecar entra nel mirror).
