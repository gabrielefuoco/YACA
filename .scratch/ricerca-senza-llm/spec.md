# spec — La ricerca a sintassi esplicita

Decisa il 26/11/2026 dopo la ricognizione e il grilling. Sostituisce la ricerca AI (Mistral) con
una **lingua di ricerca** che l'utente scrive. Niente comprensione del linguaggio naturale: la
sintassi è il contratto, e il parser è deterministico.

## Destination

Una sola ricerca in Stremio e una sola nel form di creazione cataloghi, alimentate dallo stesso
parser e dallo stesso indice DuckDB. Zero chiamate a modelli. Zero cache di risultati. Ogni
risultato spiegabile (`motivi[]`), ogni query riproducibile.

La frase naturale NON è un obiettivo: `film horror anni 80 sulle navi` resta una ricerca vuota.
L'equivalente è `tema horror, navi anno 1980-1989`.

---

## 1. La lingua

Operatori come **parole-prefisso** (niente `KEY:`: i due punti su un telecomando costano quattro
tasti), separati da spazi; la virgola separa i valori dentro un operatore, dove l'operatore può
comparire più volte.

| Operatore | Valore | Intento | Esempio |
|---|---|---|---|
| `simili` | uno o più titoli (virgole ammesse, Stremio compreso) | `simile_a` (lista) | `simili interstellar` · `simili got, bridgerton` |
| `cast` | una o più persone | `persone` | `cast leonardo dicaprio` · `cast nolan, villeneuve` |
| `tema` | genere **o** keyword, anche italiano (genere prima) | `generi` + `concetti` | `tema horror, navi` |
| `generi` | solo i 19 generi TMDB | `generi` | `generi isekai, fantasy` |
| `anno` | `1997` oppure `1990-2000` oppure `80` | `anno: [from, to]` | `anno 1990-2000` |
| `anime` | nessuno (flag) | `anime: true` | `anime tema isekai` |
| `su` | provider/piattaforma | `provider` | `su netflix` |
| `lingua` / `paese` | codice o nome | `lingua` / `paese` | `lingua giapponese` |

Regole:

1. **Ordine libero**, ripetizione libera: `tema navi tema pirati` = `tema navi, pirati`.
2. **Le virgole separano i valori, ovunque** — Stremio e form web si comportano allo stesso modo
   (Stremio passa `extra.search` come stringa libera: niente impedisce `simili got, bridgerton`).
   L'ambiguità con i titoli che *contengono* una virgola («Amici miei, atto II») si risolve
   verificando contro l'indice con la regola del **match più lungo**: si prova il prefisso più lungo
   che il risolutore conosce e si scende. Con «got, bridgerton» nessuna unione risolve e si separa;
   con «amici miei, atto ii» l'unione risolve e resta un titolo solo.
   *Unire solo i frammenti irrisolti non basta*: «Amici miei» è un film vero, quindi il frammento
   si risolverebbe e si sceglierebbe il film sbagliato — l'ha trovato il test, non il ragionamento.
3. **Più valori dello stesso operatore = OR.** `cast nolan, villeneuve` = film con l'uno **o**
   con l'altro; `tema horror, navi` = horror **o** navi. Le eccezioni sono due e sono dichiarate:
   `anno` è sempre un intervallo, e `simili` non è un OR — sono **semi della stessa diffusione**
   (`semi: [X, Y]`), che è come il grafo risponde a «amo GoT ma la mia ragazza Bridgerton».
4. **Testo senza operatori = ricerca sul titolo** (comportamento di oggi: `batman` funziona).
5. **Testo residuo con almeno un operatore = scartato e dichiarato**: `motivi: ['ignorato: horror']`.
6. Case-insensitive; accenti e punteggiatura normalizzati; fuzzy (distanza ≤1) **solo** sui valori
   di `cast`/`tema`/`generi`/`su`/`lingua`, mai sui numeri. Sugli **operatori** niente fuzzy:
   «tema» e «team» distano una lettera, e sbagliare operatore è peggio che non riconoscerlo.
7. **Forme accettate** (flessioni, non sinonimi nuovi): `simili|simile`, `cast|attore|attori`,
   `tema|temi`, `generi|genere`, `anno|anni`, `anime`, `su|piattaforma`, `lingua`,
   `paese|nazione`.
8. **Un intento senza nessuna condizione si dichiara** (`motivi: ['nessuna_condizione']`): chi
   chiama deve poterlo dire, invece di mostrare il catalogo popolare e chiamarlo «risultato».
9. **Ogni valore non risolto è un motivo**, non una ricerca vuota: `tema_non_riconosciuto: X`,
   `titolo_non_risolto: X`, `persona_non_risolto: X`, `genere_degradato_a_tema: X`,
   `ignorato: X`, `anno_non_valido: X`, `valore_mancante: X`, `operatore_ripetuto: X`.

---

## 2. Lo schema degli intenti

Il parser produce **sempre** questa forma (una anche quando l'intento è uno):

```json
{
  "intenti": [
    {
      "generi": [27],
      "anno": [1980, 1989],
      "concetti": ["ship"],
      "persone": [6193],
      "provider": "netflix",
      "lingua": "it",
      "anime": null,
      "simile_a": [],
      "testo": null
    }
  ],
  "motivi": ["tema:navi→ship", "espansione:ship→ghost ship"]
}
```

* è **anche** il formato salvato dei nuovi cataloghi (vedi §5);
* `intenti` ha **sempre un elemento**: la lingua non produce due intenti (§1). L'array resta
  perché è il formato salvato e perché un domani potrebbe tornarci utile, non perché sia popolato.
* `simile_a` è una **lista**: «amo GoT ma la mia ragazza Bridgerton» è **un** intento con due semi,
  non due intenti. `POST /raccomanda` accetta `semi: [X, Y]` — è progettato per questo, e una
  diffusione con due semi è meglio del consensus fra due liste.
* `intenti.length > 1` resta possibile (il formato lo prevede), ma la lingua non lo produce: nessun
  operatore si ripete abbastanza da generare due intenti distinti.

---

## 3. I tre risolutori

### 3.1 Concetti (`tema`) — tre strati, in ordine di costo

1. **Fuzzy/normalizzato contro i nomi inglesi** delle keyword (mappa `nameToId` già in RAM,
   `src/indice/keywordIds.js`): `zombie`, `cyberpunk`, `time travel`, `kdrama` funzionano senza
   dizionario.
2. **Dizionario IT curato** (`src/ricerca/lessico_it.js`, 150-250 voci, versionato):
   `navi → ship`, `natalizi → christmas`, `rapine → heist`, `zodiaco → zodiac`.
3. **Espansione dal grafo gerarchico** (`hierarchical_graph.json`, 1382 L1 con `keywords` e
   `L1_adjacency`): ancóra → cluster → keyword sorelle, **cap 5 per concetto** (misurabile: se
   annacqua la pagina, si abbassa).

Un valore non risolto non svuota la ricerca: finisce in `motivi` e viene ignorato.

### 3.2 Persone (`cast`) — `people.db`

SQLite persistente accanto a `titles_fts5.db`, costruito dai parquet (una volta, come il Tier 2):

```
people_fts (FTS5: name_norm, tokenize unicode61 remove_diacritics 2)
  tmdb_id UNINDEXED, ruolo UNINDEXED (actor|director|writer), film_count UNINDEXED
```

Misurato: **483.485** persone nel cast dei film + 73.490 nelle serie, 39.369 registi. Lookup
atteso 1-5 ms contro i **711 ms** della scansione JSON su DuckDB. Filtro `film_count ≥ 2` per
scartare gli omonimi con un solo titolo.

### 3.3 Simili (`simili`) — il grafo, con ripiego

1. ogni valore → `tmdb_id` con la FTS locale (titolo localizzato, originale, inglese; poi i nomi
   appresi), applicando la regola di unione della §1 per le virgole;
2. `POST /raccomanda` al servizio grafo con **tutti i semi insieme** → fino a 60 vicini (PageRank);
3. se il servizio non risponde, o il titolo è fuori canone: colonna `recommendations` del parquet
   per ciascun titolo risolto (il percorso di oggi), e `motivi: ['simile:colonna']`.
   Un titolo non risolto non svuota la ricerca: finisce nei `motivi`.

---

## 4. Cosa si smonta

| Cosa | Azione |
|---|---|
| `generateTmdbFiltersFromPrompt` + `routeLiveStremioSearch` | rimossi |
| `aiAdapter.js` / `richiediComprensioneAI` / `SEARCH_UNDERSTANDING_SYSTEM_PROMPT` | rimossi (erano già senza chiamanti) |
| cache `ai_prompt` (`aiPromptCache`) | rimossa |
| `AiQueryNormalizer.js` | rimane **solo** per i cataloghi salvati in formato vecchio (§5), poi sparisce |
| `executeUniversalPipeline` / `applyAiQualityFilters` | sostituiti dal compilatore di intenti |
| chiave Mistral: UI, validazione, `UserAccount.apiKeys.mistral`, `chiavi.js` (`ricerca_semantica`, `cataloghi_ai`, `fusione_nomi_cataloghi`) | rimossi |
| `deveChiedereAi` / budget AI in `ricercaUnificata` | rimossi (non c'è più niente da decidere) |
| `manifest`: `yaca_search_ai` | rimosso, senza retrocompatibilità |

`cercaUnificata` diventa: **candidati locali (FTS) + parser + compilatore + fusione**. ~150 righe di
parser, ~100 di compilatore.

---

## 5. I cataloghi salvati

* Nuovo formato: `{ testo: "tema horror, navi anno 1980-1989", intenti: [...] }`. Il testo è per
  l'utente (rileggibile, modificabile), gli intenti sono il contratto (stabili se la sintassi
  cambia). Si rilegge sempre dagli `intenti`; se mancano, si ri-parsa il testo.
* Vecchio formato (`queries: [{strategy, with_genres, …}]`): **lettore doppio**, nessuna migrazione
  forzata. Un catalogo vecchio continua a funzionare tramite `AiQueryNormalizer` finché l'utente non
  lo riapre e lo risalva.
* Il form web: un campo di testo + legenda cliccabile + anteprima dei risultati. Il pulsante
  «Genera con AI» diventa «Applica».

---

## 6. Le fette

| # | Cosa | Si vede quando |
|---|---|---|
| 1 | `people.db` + builder dai parquet (FTS5, ruoli, frequenza) | `cast leonardo dicaprio` funziona |
| 2 | Parser della sintassi + schema intenti + `motivi` | `tema horror, navi anno 1980-1989` funziona |
| 3 | Lessico IT (fuzzy) + espansione dal grafo | `tema navi` trova *Fog* e *La nave fantasma* |
| 4 | Compilatore intenti → filtri indice → DuckDB; `cercaUnificata` lo usa | la ricerca Stremio è tutta qui, senza AI |
| 5 | `simili` via `/raccomanda` + ripiego sulla colonna | «film simili a Interstellar» |
| 6 | Form web: testo + legenda + anteprima; salvataggio `{testo, intenti}` | si crea un catalogo senza Mistral |
| 7 | Smontaggio: chiave, UI, cache, AI, `yaca_search_ai` dal manifest | zero riferimenti a Mistral |

Ogni fetta ha il suo collaudo: il parser è puro (test unitari sui casi della tabella §1), il
compilatore si verifica sul DuckDB vero con la sonda già scritta
(`.scratch/ricerca-senza-llm/probe-ricerca.js`), e la fetta 7 si chiude con `rg -i mistral src/` che
non trova più niente.

---

## 7. Aperto (proposte, da confermare)

1. **`applyAiQualityFilters`**: era `vote_count ≥ 75` + whitelist di 7 lingue. Proposta: tenere
   `vote_count ≥ 75` (anti b-movie) e **togliere la whitelist di lingue** — con la sintassi
   l'utente è esplicito, e nascondere il cinema turco non è una decisione che ci spetta.
2. **Discoverability**: in Stremio non c'è dove mettere una legenda. Proposta: il nome del catalogo
   nel manifest diventa `YACA: Ricerca (tema · cast · anno · simili)` — è l'unico posto visibile.
3. **`anime` da solo** (`anime` senza altri valori): flag acceso e niente altro. Un titolo chiamato
   «Anime» diventa irraggiungibile se non scrivendo il titolo intero. Accettabile?
4. **Alias** (`got`, `bb`): non sono in TMDB. Fetta 2-bis: tabella di alias appresi, cresciuta dai
   nomi che gli utenti scrivono dopo `simili`, come `learned_names`.
5. **Un operatore `titolo`** (proposta emersa in fetta 4): senza di esso non si può chiedere «film
   Batman anni 80» — il testo libero esiste solo quando non ci sono operatori. `titolo batman anno
   80` → `testo` + filtri, e il compilatore lo supporta già (`modo: 'filtri'` con
   `text_search`). Costo: una voce nella tabella degli operatori.
6. **Un operatore `regista`** (proposta emersa in fetta 4): `cast nolan` include i documentari *su*
   Nolan, dove compare come attore. Il ruolo è già in `people.db` (`director`, `writer`,
   `creator`): l'operatore costa una riga nella tabella e un filtro `with_crew` (film) — per le
   serie la colonna non esiste (`created_by`), quindi solo film.

---

## 8. Stato: fetta 1 fatta (26/11/2026)

`src/indice/people.js` + `scripts/build-people-index.js` + `tests/peopleIndex.test.js` (16 test) +
aggancio nel daemon (dopo la build del Tier 2 e al boot se il file manca) + `docs/DUCKDB_ARCHITECTURE.md §C-bis`.

**Misure sul dump reale** (621.034 righe, 94 MB, build 14,0 s):

| Query | Prima (scansione JSON) | Ora |
|---|---|---|
| `leonardo dicaprio` | 711 ms | **1 ms** |
| `dicaprio` (solo cognome) | 711 ms | **0-1 ms** |
| `cristopher nolan` (refuso) | 711 ms | **14 ms** |
| `xyzzy nonexistent` | 711 ms | **2 ms** |
| `nolan` con `ruolo: director` | — | **1 ms** |

Due scoperte che valgono per le fette successive:

1. **`LIKE 'non%'` non usa l'indice** in SQLite (serve `case_sensitive_like` o `COLLATE NOCASE`):
   83 ms per 500 candidati. Il range `word >= 'non' AND word < 'noo'` li prende in 1-2 ms.
2. **Il limite si applica alle PERSONE, non alle righe**: le righe sono per (persona, ruolo), quindi
   tagliare a `limit` prima di aggregare perdeva il secondo ruolo e faceva dipendere il conteggio
   dei titoli dalla forma della query («dicaprio» 52 contro «leonardo dicaprio» 53).

Prossimo: **fetta 2**, il parser della sintassi (`simili`, `cast`, `tema`, `generi`, `anno`,
`anime`, `su`, `lingua`) con lo schema `{ intenti: [...] }` e i `motivi`.

---

## 9. Stato: fetta 2 fatta (26/11/2026)

`src/ricerca/generi.js` (i 19 generi in un posto solo, con sinonimi italiani) ·
`src/ricerca/pianificatore.js` (`analizza` puro, `risolvi` con risolutori iniettati, `pianifica`
porta) · `tests/pianificatore.test.js` (37 test) · porta del modulo in `src/ricerca/index.js` ·
`door.js` non tiene più una seconda copia dei generi.

Il parser **non conosce il database**: i risolutori (`genere`, `concetto`, `persona`, `titolo`,
`provider`) sono iniettati. Fetta 2 = grammatica; fetta 3 = i risolutori veri.

Due cose che ha trovato il test, non il ragionamento:

1. **La regola della virgola doveva essere «match più lungo», non «unisci se irrisolto»**:
   «Amici miei» è un film vero, quindi il frammento si risolveva e si sceglieva il film sbagliato
   invece di «Amici miei, atto II».
2. **`generi` e `tema` provano entrambi il genere per primo.** Far vincere il concetto a `tema`
   significava mandare «tema horror» sulle keyword invece che sul genere 27. Differiscono solo nel
   ripiego dichiarato: `generi isekai` → concetto + `genere_degradato_a_tema`.

Casi coperti dai test: forma lunga (`tema horror, navi anno 1980-1989 cast leonardo dicaprio`),
titoli con virgola, refusi non risolti, risolutore che esplode, operatore ripetuto, `anno` in tutte
le forme (`1997`, `1990-2000`, `1990 2000`, `80`, `'80`, `80s`, `80-90`, `1980-89`, `20`, `10`),
`anime` come flag, testo residuo, query vuota, input non-stringa.

Prossima: **fetta 3**, i risolutori veri — `concetto` (fuzzy sui nomi inglesi + dizionario IT +
espansione dal grafo), `persona` (people.db), `titolo` (FTS locale), `provider` (dai parquet).

---

## 10. Stato: fetta 3 fatta (26/11/2026)

`src/ricerca/lessico_it.js` (180 voci italiano→keyword, **tutte validate** contro il dump) ·
`scripts/qa/check-lessico.js` (il controllo) · `src/ricerca/risolutori.js` (i cinque risolutori) ·
`tests/risolutori.test.js` (30 test: puri, grafo, integration sul dump) · `people.db` ora ordina per
popolarità · porta del modulo aggiornata.

**Il lessico è verificabile, non fidato.** `node scripts/qa/check-lessico.js` confronta ogni valore
con la mappa nome↔id dell'indice (38.329 keyword) e stampa i mancanti. Prima esecuzione: 3 su 180
sbagliati (`artificial intelligence` → `artificial intelligence (a.i.)`, `viking` → `vikings
(norsemen)`, `soccer` → `soccer players`). Una voce sbagliata non dà errore: dà una pagina vuota.

**Il grafo espande, non indovina.** `wine` — l'ancora è certa (lessico o nome inglese esatto); le
sorelle del cluster L1 sono un'aggiunta con tetto 4 (`RICERCA_ESPANSIONE_MAX`, `RICERCA_ESPANSIONE=0`
spegne). Misurato: `ship` → *sea voyage, cargo ship, voyage*.

**Tre difetti trovati dai test:**

1. **`nolan` non trovava Christopher Nolan.** Ordinare per numero di titoli premia i doppiatori:
   *Nolan North* (54) batteva *Christopher Nolan* (30). Aggiunta `popolarita` (somma delle
   `popularity` dei titoli) al build: adesso 1721 contro 475, e `villeneuve`/`streep` fanno lo
   stesso. Costo: 100 MB il file (era 94), build sempre 14 s.
2. **Un seme non si sceglie per somiglianza.** `scegliTitolo` accettava il primo risultato se
   *conteneva* la ricerca: «batman» diventava «Batman Begins». Ora vince l'esatto, il prefisso vale
   solo se è unico e ≥5 caratteri («inter» → *Interstellar*), e un prefisso ambiguo resta senza seme.
3. **Il parser era sync e il resolver dei titoli no.** Il primo `await` dimenticato in un punto
   faceva passare una Promise per una lista: `concetti.length` era `undefined`, quindi il tema
   spariva **in silenzio**. Il test l'ha preso subito; ora `risolvi`/`pianifica` sono async e ogni
   chiamata è `await`-ata.

Misure sul dump vero (fetta 3): `risolviConcetto('navi')` → `ship, sea voyage, cargo ship, voyage`;
`risolviPersona('leonardo dicaprio')` → `6193` in 1 ms; `risolviTitolo('interstellar')` → `157336`;
`risolviProvider('netflix')` → `8` (mappa costruita dai parquet, 79 provider, 67 ms la prima volta).

Prossima: **fetta 4**, il compilatore `intenti → filtri dell'indice` e il collegamento in
`cercaUnificata` (con le due strade: `testo` = FTS, altrimenti discovery).

---

## 11. Stato: fetta 4 fatta (26/11/2026)

`src/ricerca/compilatore.js` (`compilaIntento`, `eseguiPiano`) · `cercaUnificata` riscritta:
sintassi → intento → piano → indice · `buildPresetFromFilters` ora accetta **provider multipli in
OR** · `tests/compilatore.test.js` (23 test: puri + integrazione sul dump).

**Il giro completo, misurato sul DuckDB vero:**

| query | risultati | tempo |
|---|---|---|
| `batman` (testo) | 20, i Batman in ordine di pertinenza | 381 ms |
| `tema horror, navi anno 1980-1989` | **Fog (1980) · La nave fantasma (1980)** | **56 ms** |
| `tema horror, navi` | Fog · Demeter · Triangle · Godzilla | 151 ms |
| `cast leonardo dicaprio` | Inception · Wolf of Wall Street · Killers of the Flower Moon | 426 ms |
| `su netflix tema natale` | Hot Frosty · Klaus · Carry-On | 374 ms |
| `tema natalizi, romantici` | Piccole donne · C'è post@ per te · Love Actually | 165 ms |
| `anime tema isekai anno 2020-2025` | Mushoku Tensei · Jujutsu Kaisen · Solo Leveling | 65 ms |
| `tema navvi` (refuso) | Odissea · Pirati dei Caraibi · Povere creature | 249 ms |
| `simili interstellar` | i vicini, mai il film stesso | 387 ms |

**Quattro difetti trovati dalle prove, non dal ragionamento:**

1. **Il lessico italiano deve venire PRIMA del nome di keyword esatto.** TMDB ha una keyword che si
   chiama letteralmente `natale` (id 327871, pochi titoli): con l'ordine sbagliato, `tema natale`
   filtrava quella e dava **zero** risultati invece di `christmas`.
2. **Una persona sola, non le prime due.** Restituire due candidati per un cognome metteva in OR
   Christopher Nolan e *Nolan North* (doppiatore): la pagina si riempiva di SpongeBob e Scooby-Doo.
   L'ordinamento per popolarità sceglie bene; per l'omonimo si scrive il nome.
3. **`anno` non deve mangiarsi la frase.** `anni 80 sulle navi` diventava un anno chiamato «80 sulle
   navi» (non valido) e perdeva tutto il resto. Ora l'operatore accetta solo forme d'anno e il resto
   finisce nei `motivi` come `ignorato`.
4. **`nessuna_condizione` arrivava due volte** (parser + compilatore): deduplicato all'unico punto in
   cui i motivi si fondono.

**Conseguenze della sintassi da tenere presenti:**

- `anni` è un operatore: una frase naturale che lo contiene (`film anni 80`) diventa un filtro
  sull'anno e il resto è `ignorato`. È il prezzo dichiarato di «solo sintassi».
- `cast` significa «compare nei crediti come attore»: `cast nolan` restituisce anche i documentari
  *su* Nolan, dove compare. Un operatore `regista` (il ruolo è già in `people.db`) chiuderebbe il
  caso — vedi §7.
- `simili got, bridgerton`: «got» non si risolve (non è un titolo TMDB) e resta un motivo; «bridgerton»
  funziona. La tabella degli alias è la fetta 2-bis.

Prossima: **fetta 5**, i vicini dal grafo (`/raccomanda` con i semi, ripiego sulle `recommendations`).

---

## 12. Stato: fetta 5 fatta (26/11/2026)

`src/ricerca/compilatore.js` → `semiDaGrafo` + `eseguiSemi` rifatti; `eseguiPiano` ora restituisce
`{ items, motivi }`; `docs/AI_ENGINE.md §«I vicini»` e `docs/RECOMMENDATION_GRAPH.md §2.3`
aggiornati; `tests/compilatore.test.js` a 26 test.

**Il percorso è il grafo, con la colonna come ripiego:**

1. `POST /raccomanda` con **tutti i semi insieme** (una diffusione sola, non due liste da fondere);
   si legge `liste[0]` (`il_tuo_mondo`), gli altri ruoli non c'entrano con «simili a X»;
2. i titoli arrivano per id e punteggio, quindi si idratano dal nostro indice **nell'ordine del
   grafo** (`tmdbIds` in `IN (...)`, poi riordino sui punteggi) — rimetterli nell'ordine della query
   sarebbe come non averli ordinati;
3. gli altri vincoli dell'intento si applicano dentro (`simili interstellar anno 2010`), per questo
   si chiedono più vicini di una pagina (`cap: 60`);
4. se il grafo non risponde — servizio giù, semi fuori canone, nessun vicino nel nostro dump — si
   ripiega sulla colonna `recommendations` (una query per seme, poi consensus) e il motivo dichiara
   quale delle due ha risposto: `simile:grafo` o `simile:colonna`. Budget 4000 ms
   (`RICERCA_GRAFO_TIMEOUT_MS`).

**Verifiche:**

- **percorso HTTP vero** (non solo il mock): un grafo finto che parla il contratto su `127.0.0.1:7899`
  ha ricevuto `semi: [{tmdbId: 157336, medium: "movie"}]` e la pagina è uscita nell'ordine del grafo
  (Inception → Matrix → Arrival), motivo `simile:grafo`, 484 ms;
- **percorso di ripiego**: con il servizio assente, `simili interstellar` → 10 titoli dalle
  `recommendations` in 486 ms, motivo `simile:colonna`; due semi → 19 titoli con consensus in 1028 ms;
- il grafo non è ancora in esecuzione su questa macchina (in produzione è il container `graph:7862`),
  quindi entrambe le strade sono state provate: quella vera con un finto, quella di degrado dal vivo.

Prossima: **fetta 6**, il form web — `{ testo, intenti }` salvato nei cataloghi, legenda degli
operatori, anteprima con i motivi visibili (dove l'utente li può vedere, al contrario di Stremio).

---

## 13. La v1 del grafo è stata eliminata (26/11/2026)

Su indicazione esplicita: `POST /raccomanda` (v1) **non esiste più**, il grafo serve solo a costruire
la matrice, e i vicini si leggono sempre da lì.

**Cosa è sparito:**
- `servizio.py`: `esegui_richiesta` (il costruttore del payload v1, ~200 righe), i rami HTTP `/` e
  `/raccomanda`, i ruoli `il_tuo_mondo`/`un_passo_fuori` come contratto di risposta;
- `src/clients/graphClient.js`: `raccomanda` (era una funzione **morta**: nessuno la chiamava);
- `services/graph/tests/test_golden_raccomanda.py` (il golden test della v1, cancellato);
- le parti v1 di `test_assi_retrieval.py`, `test_kids.py`, `test_servizio_scaffali.py`;
- documentazione: `ENGINE.md §8`, `INDEX.md` (diagramma), `RECOMMENDATION_GRAPH.md §2.2`,
  `services/graph/README.md`, `AI_ENGINE.md`.

**Cosa è entrato:** `POST /vicini` — `{ semi: [{tmdbId, medium}], medium?, cap? }` →
`{ contratto: 2, versioni: {artefatto, ricetta, input}, semi: {n, scartati}, vicini: [{tmdbId,
medium, punteggio}], motivi }`. Legge `vicini-top100.npz` (righe dei semi, somma dei pesi, semi
esclusi, filtro medium). Misurato: **0,02 ms** per un seme, **0,8 ms** con tre. La ricerca lo usa al
posto di `/raccomanda`; il client Node espone `graphClient.vicini`.

**Allineamento verificato (la parte che avevi chiesto):**

| artefatto | sha dell'input dichiarato |
|---|---|
| `v46/v46-triangolo.npz` | sha256 proprio: `225aa86a…` |
| `v46-transizione/transizione-pota16.npz` | input `v45-triangolo.npz` → `225aa86a…` |
| `v46-vicini100/vicini-top100.npz` | input `v45-triangolo.npz` → `225aa86a…` |

Cioè: **transizione e matrice nascono dallo stesso triangolo v46**, con `canon_len = 76.497` uguale
in tutti e tre. L'artefatto v45-vecchio invece deriva da `bolle-eterogeneo-V45-p1.0-triangolo.npz`
(un'altra sorgente): è un residuo, non la versione servita. Il servizio serve v46 per default, e
`test_vicini.py` confronta gli sha: se il grafo cambia e la matrice no, il test diventa rosso.

## 14. «La matrice per tutte le raccomandazioni»: cosa dicono i numeri

Misurato con 60 semi reali (`storia_trakt("warnok")`) e con 20 semi sintetici:

| | PageRank (`raccomanda_multi`) | Matrice (`top100`) |
|---|---|---|
| tempo | 28,6–31,9 ms | **1,1 ms** |
| sovrapposizione top-20 | — | **6/20** |
| sovrapposizione top-60 | — | 33–41/60 |
| sapore | multi-hop, normalizzato per grado | un salto, somma di pesi grezzi |
| top-5 (profilo warnok) | Avatar 3, M3GAN, Uno Rosso, Babylon 5, Spaceman | Avatar 3, La fine di Oak Street, The Long Walk, Spider-Man BND, F1 |

**Prima correzione — i due artefatti sono lo stesso grafo.** Verificato su Interstellar: la matrice
contiene **tutti** gli archi della transizione (0 archi della transizione mancano dalla matrice), i
top-10 sono identici e nello stesso ordine, e un **1-salto** sulle due matrici dà lo stesso ordine.
Differiscono per come sono costruiti:

| | transizione (PageRank) | matrice vicini |
|---|---|---|
| sorgente | triangolo v46 (`W+W.T`) | **lo stesso** triangolo v46 |
| archi | top-16 per riga, **ri-simmetrizzati** (`D+D.T`) | top-100 per riga, una simmetrizzazione |
| pesi | 1× o 2× il grezzo (ri-simmetrizzazione), poi riga-stocastici | grezzi |
| operatore | PPR iterato | somma a un salto |

**Seconda correzione — non è l'algoritmo.** Decomposizione misurata sugli stessi 60 semi reali:

| confronto | top20 | top60 |
|---|---|---|
| PPR vs 1-salto sulla **transizione** | **18/20** | 58/60 |
| 1-salto transizione vs 1-salto **matrice** | **4/20** | 31/60 |
| PPR vs 1-salto sulla matrice | 6/20 | 33/60 |

Cioè: PPR è quasi indistinguibile da un salto solo (18/20), mentre archi e pesi diversi spostano
tutto (4/20). **La divergenza viene dal top-16 ri-simmetrizzato contro il top-100 grezzo**, non dal
multi-hop — la spiegazione precedente («differenza strutturale: multi-hop + peso dei semi») era
sbagliata.

Terza cosa: **la matrice non è il collo di bottiglia di `/scaffali`**: il PageRank batched costa ~30 ms
su 1.500 ms. Sostituirlo fa risparmiare **~2%**, non 30×. Il costo è la composizione delle 16 righe
(assi, controparti, waterfall, etichette), non la diffusione.

**Corollario per «matrice ovunque»**: per sostituire PPR *fedelmente* servirebbe l'artefatto con i
**pesi della transizione** — cioè la transizione stessa (1,6M archi, 1-salto ≈ 1-2 ms). Fattibile e
fedele (18/20), ma vale il 2%. La matrice top-100 è invece la primitiva giusta per la ricerca, dove
«i vicini di questi titoli» *è* la domanda e la densità non diluisce (pochi semi).

**Quarta risposta — i cataloghi utente non sono sulla matrice.** `POST /scaffali` →
`interessi.scaffali` → `engine.raccomanda_multi` (PPR sulla transizione). La matrice lì serve solo a
`calcola_sim_affinity` (coerenza intra-cluster), in due punti (`interessi.py:532`, `:1013`).

Quindi: la matrice è la primitiva giusta (e l'unica) per la ricerca — dove significa esattamente
«i vicini di questi titoli» — mentre per `/scaffali` è una scelta di prodotto: cambierebbe le righe
del feed, e va fatta con un A/B sulle righe, non a scatola chiusa. Il passo successivo proposto è
misurare dove vanno davvero i 1.500 ms, non sostituire il 2%.

### 14-bis. Quanto sono allineati, in cifre semplici

Su 300 titoli presi a caso, **top-5 di un solo seme**:

| | casi |
|---|---|
| stessi 5 vicini, stesso ordine | **233/300 (78%)** |
| stessi 5 vicini, ordine diverso | 4/300 |
| 5 vicini diversi | 63/300 |

Su **60 semi** (un profilo reale): **4 titoli su 20** in comune fra «1 salto sulla transizione» e
«1 salto sulla matrice».

La causa non è l'algoritmo (PPR ≈ 1 salto: 18/20): è **come sono costruiti i due file** — 16 vicini
per riga ri-simmetrizzati e normalizzati (transizione) contro 100 vicini grezzi (matrice). Con pochi
semi le due lenti vedono quasi la stessa cosa; con molti semi i 100 vicini per titolo si sommano e
diluiscono il profilo.

### 14-ter. L'allineamento vero: un file solo

La proposta è **un artefatto unico, la transizione**, letta a un salto da entrambe le rotte:

| | oggi | proposto |
|---|---|---|
| ricerca `simili X` | legge `vicini-top100` (45 MB) | legge `transizione-pota16` (10 MB) |
| cataloghi | PPR iterato (28 ms) | 1 salto sulla transizione (1-2 ms) |
| allineamento | due file diversi → 4/20 | **stesso file, stesso taglio, stesso peso** |
| costo | — | i cataloghi cambiano in ~2 titoli su 20 (da misurare sulle righe) |
| si cancella | — | `vicini-top100` e il suo passo di build |

Le alternative: (B) tenere la matrice e portare i cataloghi sul top-100 → allineati ma il profilo si
diluisce; (C) due file, ognuno per la sua domanda → non allineati per scelta, dichiarato.

## 15. Quale metodo trova meglio: la misura (26/11/2026)

Domanda: la matrice o PageRank? E se la matrice va rifatta con la ricetta di PageRank?

**Metodo.** 100 profili reali dalla cache Trakt (`.cache/trakt/users`, 2.226 utenti). Per ognuno:
ordino la cronologia, nascondo l'ultimo X%, semino col resto, e conto quanti dei titoli nascosti
compaiono nei primi 60 (recall@60). Ripetuto su **tre split diversi con insiemi disgiunti di
profili**, con test appaiato.

| metodo | split 0,7 | split 0,8 | split 0,9 |
|---|---|---|---|
| PageRank (transizione, iterato) | 0,0672 | 0,0759 | 0,1050 |
| matrice top-100, pesi grezzi | 0,0666 | 0,0873 | 0,1115 |
| **matrice top-100, normalizzata per riga** | **0,0879** | **0,1114** | **0,1488** |
| transizione top-16, normalizzata | 0,0744 | 0,0882 | 0,1242 |

- **La matrice batte PageRank** su due split su tre, e comunque non è mai peggiore.
- **La matrice normalizzata per riga vince sempre e di molto**: +20% / +47% / +42% relativi su
  PageRank, p < 0,0001.
- PageRank e transizione condividono la normalizzazione (righe a somma 1) ma la transizione tiene 16
  vicini invece di 100: **il taglio a 16 costa recall**, la normalizzazione lo recupera.

**Perché la normalizzazione vince.** Normalizzare per riga dà a **ogni seme un voto solo**: un titolo
co-visto con molti semi sale. Con i pesi grezzi, un seme con archi molto forti (o molto densi)
domina sugli altri e la lista segue quel seme invece del profilo. È esattamente la semantica giusta
per «raccomanda dal profilo».

**Cosa è cambiato nel codice**: `esegui_vicini` ora divide il contributo di ogni seme per la somma
della sua riga (`_W_AFF_DEG`, calcolata al caricamento). Sul **singolo** seme l'ordine non cambia
(una costante non riordina una riga); sul multi-seme sì, in meglio. Costo invariato: 0,8 ms con 3
semi.

**Cosa resta**: i cataloghi utente passano ancora da `engine.raccomanda_multi` (PageRank). Per
portarli sulla stessa primitiva serve riprodurre ciò che il motore fa oltre alla diffusione — filtro
per medium, `esclusi`, kids, politica anime e **assi tono/complessità** — e applicarlo al risultato
del salto. La misura dice che non è solo velocità: è **meglio** (recall 0,111 contro 0,076).

**Avvertenza onesta**: il grafo nasce (anche) dalle storie di quegli stessi utenti, quindi il recall
assoluto è ottimistico; il *confronto* è però equo, perché tutti i metodi usano lo stesso grafo. E il
recall non misura la varietà: PageRank potrebbe essere più «avventuroso» pur ritrovando meno di ciò
che l'utente ha davvero guardato dopo.

### 15-bis. Controllo di contaminazione (il grafo contiene quegli stessi utenti)

Il triangolo è costruito da **tutte** le 2.226 storie in `.cache/trakt/users` (`covision.py` legge
`movie-*.json` + `show-*.json`): gli utenti su cui misuro sono **dentro** il grafo, quindi l'hold-out
non è pulito e il vantaggio della matrice più densa potrebbe essere un artefatto.

Controllo: tengo come «oro» solo i titoli futuri visti anche da **≥2 / ≥3 / ≥5 altri utenti** — così
l'arco nel grafo non dipende dall'utente valutato.

| oro corroborato da | PPR | matrice | matrice_norm | transizione | matrice_norm − PPR |
|---|---|---|---|---|---|
| ≥2 altri | 0,0732 | 0,0883 | **0,1142** | 0,0863 | +0,0411 (p<0,0001) |
| ≥3 altri | 0,0738 | 0,0890 | **0,1153** | 0,0870 | +0,0415 (p<0,0001) |
| ≥5 altri | 0,0753 | 0,0906 | **0,1175** | 0,0887 | +0,0422 (p<0,0001) |

La classifica **non cambia**: il vantaggio non è un artefatto della contaminazione.

### 15-ter. Cosa misura e cosa non misura

**Misura**: quanto un metodo ritrova di ciò che l'utente ha guardato *dopo* il taglio. È il proxy più
vicino a «qualità della raccomandazione» disponibile offline.

**Non misura**:
- **varietà / novità**: un metodo può vincere il recall e ripetere sempre gli stessi blockbuster;
- **il singolo seme** (`simili X`): qui si misura un profilo di 20+ semi, ed è lì che la
  normalizzazione conta (su un seme solo non cambia l'ordine);
- **gli assi** (tono/complessità): tutti i metodi girano a 0,0;
- **«guarderebbe» vs «ha guardato»**: un seguito di un seme si ritrova facile;
- il **valore assoluto** (7-15%): l'oro è ampio e il grafo è di co-visione. Conta il confronto.

## 16. La lettura a occhio delle liste (26/11/2026)

La misura di recall non basta: ho generato i top-60 dei quattro metodi per cinque profili a tema
(sci-fi moderno, horror, arthouse, commedia italiana, crime serie), con titolo, anno e generi, e li
ho letti. Sonde: `risolvi-semi.js` (semi per titolo dal DuckDB), `genera-liste.py`, `mostra-liste.js`;
dati in `valutazione-liste.json`.

**Prima cosa, la più importante: le liste sono quasi la stessa lista.** I titoli presenti in *tutti
e quattro* i metodi sono **34-46 su 60** (56-77%). Le differenze vivono nella coda. Esempio,
«arthouse» (Tarkovsky, Bergman, Wong Kar-wai, Lynch):

| metodo | primi 8 |
|---|---|
| PPR | *Shaggy e Scooby-Doo*, *Murder Most Horrid*, L'infanzia di Ivan, Sacrificio, Happy Together, Breaking Bad, 2046, Hong Kong Express |
| matrice | *Murder Most Horrid*, Il posto delle fragole, *Shaggy e Scooby-Doo*, Breaking Bad, La dolce vita, La strada, I 400 colpi, L'infanzia di Ivan |
| matrice_norm | *Murder Most Horrid*, *Shaggy e Scooby-Doo*, L'infanzia di Ivan, Breaking Bad, Il posto delle fragole, Sacrificio, La dolce vita, La strada |
| transizione | *Shaggy e Scooby-Doo*, *Murder Most Horrid*, Sacrificio, L'infanzia di Ivan, *The Ranger*, Happy Together, *A Creature Was Stirring* |

(corsivo = fuori tema)

**Seconda cosa: il difetto è comune a tutti.** In ogni lista 8-12 titoli su 60 sono **hub di
co-visione** che non c'entrano nulla col profilo: *Shaggy e Scooby-Doo*, *Murder Most Horrid*,
*Xiaolin Showdown*, *Squidbillies*, *Dateline*, *The Challenge*, *Lo zoo degli Irwin*, *One Tree
Hill*. Sono titoli che molti utenti hanno visto di sfuggita; con 2.226 storie nel grafo l'arco
"co-visto con tutto" pesa come un arco vero. **Non dipendono dal metodo**: appaiono uguali in tutti.

**Terza cosa: il contenuto.** Tolto il rumore, matrice e matrice_norm danno la lista **migliore** su
arthouse (La strada, I 400 colpi, Scene da un matrimonio, Sussurri e grida, Inland Empire, Velluto
blu, Ladri di biciclette, Amarcord) e matrice_norm ha la testa più coerente su horror (Noi, It Comes
at Night, Madre!, Green Room, The Visit, The Lighthouse, Talk to Me). PPR interleava più rumore in
alto (The Ranger #10, A Creature Was Stirring #13, Deathcember #22).

**Verdetto onesto.** A occhio **nessun metodo è chiaramente migliore**: è quasi la stessa lista, con
lo stesso rumore. La matrice non è peggiore e ha la testa leggermente più pulita, ma il divario che
si vede non giustifica un cambio da solo. Ciò che l'utente *noterebbe* è il rumore, e quello si
corregge nel **grafo** (specificità/lift al posto della co-occorrenza grezza, o un filtro sugli hub),
non nel metodo di lettura. La stessa sonda misura il prima/dopo.

---

## 17. Fetta 6 fatta (26/11/2026): il testo è la forma salvata

**Backend**
- `preview-catalog` (e l'anteprima della configurazione) **non chiamano più Mistral**: `testo` →
  `pianifica` → `compilaIntenti` → `eseguiPiani`. Niente 403 «serve la chiave»; la risposta porta
  `testo`, `intenti`, `queries` (i filtri compilati, per il creator attuale) e **`motivi`**.
- I cataloghi salvati come `testo`/`intenti` sono serviti da `serveCatalogoScritto` nel registro delle
  fonti, attraverso lo stesso compilatore della ricerca. I cataloghi vecchi con `queries` restano sul
  percorso di prima (lettore doppio).
- `AddonConfig.catalogSchema` dichiara `testo` e `intenti`: senza, mongoose strict li scartava in
  silenzio al salvataggio.
- `pianifica` divide su **una riga = una intenzione**; `compilaIntenti`/`eseguiPiani` eseguono N piani
  con il consensus (era il comportamento multi-blocco).

**La lingua è stata estesa di 7 operatori** (erano le uniche dimensioni del block editor che non
sapeva esprimere): `titolo`, `regista`, `voto`, `durata`, `eta`, `senza`, `ordina`. Tutti su filtri
che l'indice già conosceva, tranne due aggiunte vere: `F.creator`/`with_created_by` (le serie non
hanno `directors`, hanno `created_by`) e `F.ratingMax` (le fasce di età: il dump mescola R, PG-13, T,
VM14, 14+, e un confronto alfabetico non ha senso).

**Frontend**
- il blocco «AI» è diventato un campo di **sintassi** con legenda e i motivi visibili; il pulsante
  `Applica` compila e riempie i blocchi (`queries` compilate) — così l'editor resta e vede cosa ha
  capito il parser;
- al salvataggio il catalogo porta `testo` (una riga per blocco): il testo scritto a mano in un
  blocco vince, altrimenti la riga si genera dai controlli (`testoDaBlocco`);
- le **liste manuali** restano `queries` (un elenco di titoli non è una ricerca);
- `CatalogItem` mostra il `testo` come descrizione del catalogo.

**Verifiche**: `regista nolan voto 7+ durata 100-150 ordina voto` → Il cavaliere oscuro, Interstellar,
Inception, The Prestige · `regista nolan` su serie → Person of Interest, Westworld (creators) ·
`genere animazione eta PG anno 1990-2005` → La sposa cadavere, Nightmare Before Christmas, Howl ·
un catalogo salvato con `testo: "tema horror, navi anno 1980-1989"` → Fog, La nave fantasma · un
catalogo vecchio con `queries` continua a servire 20 titoli.

Test: 78 sul parser+compilatore (11 nuovi sugli operatori), 16 sulla porta di ricerca, 0 errori `tsc`.

---

## 18. Fetta 7 fatta (26/11/2026): Mistral non esiste più

**Cancellati**: `src/ai/` (client), `src/ricerca/router.js` (pianificatore + cache dei piani),
`src/ricerca/aiAdapter.js`, `src/ricerca/prompts.js`, `src/stremio/providers/AiQueryNormalizer.js`,
`executeCombinedSearch` + `injectProfilePreferences` (la ricerca AI), `deveChiedereAi` /
`eseguiConBudget` / `AI_BUDGET_MS` (non c'è più un modello a cui escalare), le cache `ai_prompt` e
`ai_discovery`, l'endpoint `/api/tmdb/validate-mistral-key`, la verifica della chiave in
`/api/configurazione/verifica`, la dipendenza `@mistralai/mistralai`.

**Configurazione**: `SERVIZI.MISTRAL` non esiste più; `chiaveGlobale('mistral')` restituisce `null`;
`UserAccount.apiKeys.mistral` è fuori dallo schema; `DIPENDENZE_SERVIZI` non ha più
`ricerca_semantica`/`cataloghi_ai`/`fusione_nomi_cataloghi`; la chiave è sparita da UI (settings,
login) e dagli esempi `.env`.

**Manifest**: un solo catalogo di ricerca, `yaca_search_standard`, chiamato
**«YACA: Ricerca (tema · cast · anno · simili)»** — in Stremio il nome è l'unico posto visibile dove
si può suggerire la sintassi. `yaca_search_ai` è sparito dal manifest e da `catalogKind`.

**Cosa resta (ed è giusto che resti)**: `executeUniversalPipeline` + `executeComplexStrategy` servono
i **cataloghi salvati prima** (forma `queries`); `AiDiscoveryProvider.js` conserva il nome del file ma
non contiene più niente di AI — solo il compilatore dei cataloghi vecchi.

**Test aggiornati**: cancellati `aiSearch.test.js`, `aiSearchLexicalFallback.test.js`,
`aiSearchFilterNormalization.test.js`, `diag.recommender.h9.injectProfile.test.js`; riscritta la
sezione Stremio di `ricercaUnificata.test.js` (niente escalation); aggiornati baseline del manifest
(`modi_senza_modo_baseline.json`, conteggi in `manifestShelves`), `ticket14`, `catalogKindAndSelectors`,
`configurazione`, `robustness`, `ricercaDoor`, `configureGlobalProfile`, `profileDuplicates`.

**Esito**: `rg -i mistral src frontend/src` → **zero risultati** (a parte i commenti storici in
`ricercaUnificata.js`/`AI_ENGINE.md` che spiegano cosa è stato rimosso). Suite: 2103 test Node
passati (restano le 2 suite da timeout preesistenti), 111 Python, `tsc` 0 errori.

---

## 19. Code review pre-commit (26/11/2026): cosa è stato corretto

Due revisori in parallelo (assi Standard e Spec). **Bug trovati e corretti:**

1. **L'anteprima da testo passava da `formatPreviewResponse`**, che scarta `motivi`/`testo`/`intenti`/
   `queries` e normalizza `series`→`tv`: il pulsante «Applica» non riempiva i blocchi e i motivi non si
   vedevano mai. Ora la rotta risponde con la sua forma (il contratto delle card resta per l'altro
   percorso).
2. **`intenti` stantii al salvataggio**: il client li ripassava dalla versione precedente e il serving
   li preferiva al testo nuovo. Il client non li manda più: si ri-parsa `testo`.
3. **`vote_average.lte` e `with_runtime.lte` erano ignorati** dall'indice (filtri silenziosamente
   persi): aggiunti `F.maxScore`/`F.maxRuntime`.
4. **`with_crew` non spezzava la lista**: `regista nolan, villeneuve` dava zero film. Ora `F.crew(...)`
   è variadico e OR.
5. **Consensus multi-riga e paginazione** (classe H5): la pagina 2 chiedeva `skip..` a ogni riga, i
   bonus cambiavano e i titoli tornavano. Ora finestra identica per ogni pagina, taglio dopo il
   consensus.
6. **Liste manuali perse**: `handleSave` salvava solo `testo`, che non sa esprimere un elenco di
   titoli. Ora un catalogo con `manual_list` resta su `queries`.
7. **Confine dei moduli**: le due rotte di anteprima importavano gli interni di `src/ricerca` e i
   risolutori quelli dell'indice. Aggiunta `compilaTesto()` alla porta della ricerca (una sola pipeline
   per entrambe le rotte) e `keywordIds`/`grafoGerarchico` alla porta dell'indice.
8. **Copertura persa**: `tests/ricercaDoor.test.js` aveva perso la sezione «Il Registro delle Sei
   Fonti» insieme al blocco AI — ripristinata.

**Gap di spec chiusi:** codici ISO per `lingua`/`paese` (`lingua ja`, `paese JP`), `minTitoli ≥ 2` per
le persone, `yaca_search_ai` tolto anche dal `catalogKind` del frontend, legenda **cliccabile** con
`paese` (mancava), fuzzy sui generi (`horor` → 27).

**Pulizia (ponytail):** una sola `normalizza` in `src/infra/testo.js` (era in tre file) e una sola
`distanza` (era duplicata fra persone e risolutori); tolti `SOGLIA_LOCALE_SUFFICIENTE`,
`unificaRisultati`, `haTitoloEsatto`, `normalizzaTesto` (residui della fusione AI), `limitePersone`
(middle man) e l'handler `handleAiGenerateBlock` (ora `handleApplicaTesto`).

**Non corretto, dichiarato:** i due cicli gemelli di `risolvi` (generi/tema) e i due di
`compilatore` (concetti/esclusi) restano: differiscono nei motivi e unificarli renderebbe il codice
meno leggibile di quanto guadagni. `aiDiscoverySourceEntry` mantiene il nome storico (rinominare l'id
del registro tocca manifest, capabilities e test) — aggiunto un commento.

Esito: 2107 test Node (l'unica suite rossa è `heroMovieDateRegression`, timeout sotto carico
parallelo: da sola passa 13/13), 111 Python, `tsc` 0 errori, 0 errori di lint sui file toccati.
