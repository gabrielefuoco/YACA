# 01 — Campagna QC cataloghi (preset + hero)

**Stato**: `eseguito` 06/10/2026 · **Aperto**: solo 20 e 21 (il resto è chiuso; il deploy attende il motore hero)
**Tipo**: enhancement (qualità/QA, one-off con artefatti permanenti)

## Problem Statement

YACA serve **161 preset curati** e **8 cataloghi hero** come se fossero tutti di qualità editoriale
garantita: sono presentati con nomi che promettono qualcosa («Studio Ghibli», «Cult Anni '80»,
«Nordic Noir», «Gemme Nascoste», «Scelti per Te») e l'utente Stremio si fida di quella promessa.

In realtà nessuno ha mai aperto i cataloghi uno per uno a guardare *cosa c'è dentro*. Gli strumenti
esistenti misurano altro:

- `scripts/qa/catalog-audit.js` verifica **soglie meccaniche** (score mediano, overlap J@40, keyword
  morte, vuotezza) su query DuckDB identiche a quelle di produzione;
- `scripts/qa/simulate.js` verifica **struttura e contratti** delle risposte live (conteggi, overlap
  hero, badge, policy anime), ma i verdetti di pertinenza restano compilati a mano e non esistono.

Il risultato: il proprietario del progetto non sa dire quali cataloghi sono imbarazzanti, ridondanti,
semi-vuoti, mal localizzati o semplicemente sbagliati — né quando un hero sta servendo in realtà il
fallback «Film Popolari» per un degrado silenzioso (documentato in `docs/ALGORITHMS.md` §6.5).

## Solution

Una campagna di QC **una tantum ma riproducibile**: per ogni catalogo si legge la **top 50** (quello che
l'utente vede davvero) e un giudice (agente `agy`) assegna un punteggio 0–100 su cinque dimensioni, un
verdetto **P/B/N** e 3–5 titoli di evidenza. In testa:

- **preset**: 160 su 161 (il simulcast è escluso, non passa dal parquet) — giudicati offline, su Parquet
  di produzione copiati in locale, con la stessa query SQL del router;
- **hero**: 8 cataloghi × i profili sim (di cui 1 freddo) — giudicati live su produzione, perché senza
  DNA/seed/Trakt non esistono offline.

Il prodotto finale è un **report con ranking** (`ricerche/01-report-qc-cataloghi.md` + `report.json`)
e **ticket di bonifica raggruppati per causa**. Chi implementa i fix non riparte dalla campagna:
nel report trova il catalogo, il difetto, la posizione del titolo che lo prova e l'ancora di
punteggio che l'ha penalizzato.

## User Stories

1. Come proprietario di YACA, voglio sapere quali dei 161 preset mostrano titoli fuori tema nei primi 50, così che io possa decidere se correggere il filtro o cancellare il catalogo.
2. Come proprietario di YACA, voglio un punteggio di qualità 0–100 per ogni catalogo, così che io possa ordinare il lavoro di bonifica invece di scegliere a intuito.
3. Come proprietario di YACA, voglio un verdetto P/B/N per ogni catalogo, così che io possa distinguere «da tenere», «da limare» e «da rifare» a colpo d'occhio.
4. Come proprietario di YACA, voglio che ogni giudizio porti 3–5 titoli di evidenza con la loro posizione, così che io possa verificare a mano il verdetto senza rifare la campagna.
5. Come proprietario di YACA, voglio sapere quali catalòghi sono cloni di altri (stessa top 50), così che io possa accorparli o differenziarli.
6. Come proprietario di YACA, voglio vedere la **promessa** di ogni catalogo (nome + filtri in chiaro) accanto ai titoli che restituisce, così che il giudizio sia sugli scostamenti reali, non sull'idea che ho del catalogo.
7. Come proprietario di YACA, voglio sapere quali coppie di cataloghi condividono più titoli, così che io possa decidere se il doppione è voluto (movie/series) o un errore di filtri.
8. Come proprietario di YACA, voglio sapere quali cataloghi hanno meno di 60 titoli o keyword morte, così che io possa capire se il problema è il filtro o il dump TMDB.
9. Come proprietario di YACA, voglio che l'ordinamento dei primi 10 titoli sia confrontato con la strategia dichiarata del preset, così che io possa scoprire ordinamenti incoerenti senza aprire Stremio.
10. Come proprietario di YACA, voglio che i 161 preset siano coperti **tutti** (nessuno escluso in silenzio), così che il report non mi dia un falso senso di copertura.
11. Come proprietario di YACA, voglio che gli esclusi siano dichiarati con il motivo (il simulcast), così che la lacuna sia nota invece che invisibile.
12. Come proprietario di YACA, voglio giudicare gli 8 hero sul **percorso reale** con un profilo con DNA, così che io possa verificare che «Scelti per Te» non sia «Film Popolari» travestito.
13. Come proprietario di YACA, voglio giudicare gli hero anche su un profilo **freddo**, così che io possa vedere se il degrado è elegante (fallback dichiarato o catalogo nascosto) o se serve spazzatura.
14. Come proprietario di YACA, voglio verificare che i 4 hero dello stesso tipo non condividano titoli, così che il profilo non mostri quattro volte lo stesso film.
15. Come proprietario di YACA, voglio che il degrado verso il fallback (quando `trakt_filtered` non ha token) sia visibile nel report, così che io sappia quale parte dell'esperienza non è mai stata verificata davvero.
16. Come proprietario di YACA, voglio un giudizio per un profilo «Solo Anime», così che io possa verificare la quota anime nei hero dopo il ticket 17.
17. Come proprietario di YACA, voglio sapere se nei cataloghi non-anime compaiono anime e viceversa, così che io possa correggere le esclusioni (`210024`, lingue originali).
18. Come proprietario di YACA, voglio che i verdetti siano resistenti al giudice: ancore di punteggio dichiarate e verifica a campione, così che il ranking non sia rumore di due scale diverse.
19. Come proprietario di YACA, voglio poter rieseguire la campagna in un'altra data e confrontare i punteggi, così che io possa misurare se la bonifica ha funzionato.
20. Come proprietario di YACA, voglio che il report finale sia distillato (ranking + cause), non 200 tabelle, così che io possa leggerlo in dieci minuti.
21. Come agente che implementa i fix, voglio ticket raggruppati per causa con i cataloghi elencati e l'evidenza citata, così che io possa correggere cinque cataloghi con un ticket invece di cinque ticket.
22. Come manutentore futuro, voglio che i dump grezzi stiano in `runs/` (che può essere cancellata e rigenerata) e i verdetti nel report versionato, così che la campagna resti leggibile fra mesi.
23. Come manutentore futuro, voglio che lo script `top50-dump.js` resti nel repo accanto agli altri tool di `scripts/qa/`, così che la campagna sia ripetibile con un comando.
24. Come manutentore futuro, voglio che il dump usi la stessa query e lo stesso `orderBy` del router di produzione, così che la top 50 che giudico sia la top 50 che l'utente vede.
25. Come utente Stremio, voglio che i cataloghi che apro mantengano la promessa del titolo, così che io possa fidarmi dei nomi e non debba controllare ogni riga.
26. Come utente Stremio, voglio che i cataloghi non siano semi-vuoti quando li apro, così che la scoperta non finisca dopo mezza pagina.
27. Come utente Stremio, voglio che i suggerimenti personali sembrino personali, così che io non veda gli stessi titoli popolari di tutti.
28. Come utente Stremio, voglio che catalogo e tipo di contenuto coincidano (niente anime in «Cult Anni '80», niente documentari in «Blockbusters»), così che la navigazione resti prevedibile.
29. Come revisore del report, voglio che ogni verdetto N citi la posizione e il titolo responsabile, così che io possa contestare il punteggio puntando a una riga specifica.
30. Come revisore del report, voglio che i verdetti a bassa fiducia dichiarino la loro incertezza, così che io sappia quali vanno riletti a mano prima di aprire un ticket.
31. Come proprietario di YACA, voglio che la campagna non tocchi i dati di produzione oltre il necessario (nessuna scrittura sui cataloghi, nessun flushdb, teardown dei profili sim), così che il QC non diventi un incidente.
32. Come proprietario di YACA, voglio sapere quanto la campagna dipende da scelte mie (rubrica, soglie) e quanto dai dati TMDB, così che io possa distinguere un difetto di YACA da un difetto del dump.
33. Come proprietario di YACA, voglio infine una lista di cause ricorrenti con la stima dello sforzo per ciascuna, così che io possa decidere cosa bonificare prima di una release.

## Implementation Decisions

### D1 — Seam dei preset: DuckDB offline sui Parquet di produzione

- I Parquet (`movies.parquet`, `tv.parquet`) si copiano dal volume `yaca_tmdb` del server `mate` in
  `.cache/tmdb/` (quest'ultimo è già il path risolto da `src/db/duckDbStore.js` fuori dal container).
  I dump sono già copiati in questa sessione e verificati (byte-identici: 59.460.766 e 9.292.473).
- La lettura usa `src/db/duckDbStore.js` + `src/catalog/providers/DuckDbProvider.js`: **la stessa query
  e lo stesso `orderBy`** che il router usa in produzione, con `LIMIT 50`. Nessuna reinterpetrazione dei
  filtri, nessuna chiamata TMDB.
- I Parquet **non entrano in git** (`*.parquet` è già in `.gitignore`): la campagna dichiara nel report
  la data di estrazione del dump, e la riesecuzione riparte dalla copia fresca.

### D2 — Strumento nuovo: `scripts/qa/top50-dump.js`

Un CLI accanto agli altri (`catalog-audit.js`, `simulate.js`), stesso stile: legge i preset canonici da
`src/data/presets.js`, interroga DuckDB, scrive artefatti. Due responsabilità sole:

1. **dump per catalogo** — per ogni preset con `where` (esclusi quelli con `_provider` non-SQL), esegue
   la query con `LIMIT 50` ed emette:
   - `top50/<preset_id>.json` — macchina: `{ id, name, category, type, isAnime, promessa,
     pool, msQuery, items[] }`, con `items[] = { pos, tmdbId, title, year, score, votes, popularity,
     runtime, originalLanguage, genres[], isAnime }`;
   - `by-category/<NN>-<slug>.md` — leggibile: per ogni catalogo una tabella
     `pos | titolo (anno) | voto | voti | generi | lingua` preceduta da una riga di promessa
     (`name`, `category`, filtri in chiaro, `orderBy`, `pool`);
   - `index.json` — elenco cataloghi con categoria, pool, `msQuery`, esclusi con motivo.
2. **contesto meccanico** — `--audit <audit.json>` fonde nel dump i numeri già prodotti da
   `catalog-audit.js` per lo stesso catalogo (percentili di score, quota sotto 6.0, coppie con
   J@40 ≥ 0.5, keyword morte), così il giudice non li ricalcola e non li inventa.

La **promessa** è la traduzione in chiaro di `queries[0]` + `where` + `orderBy`, con gli ID risolti dai
nomi di `src/data/entities.json` (persone, compagnie, network, keyword). Se un ID non ha nome, si emette
l'ID nudo: l'etichetta vuota è un dato, non un errore.

### D3 — Contesto meccanico: `catalog-audit.js` gira per primo

`node scripts/qa/catalog-audit.js --preset all --out-dir .scratch/qc-cataloghi/runs/<ts>/audit` produce
`audit.json`/`audit.md` con finding blocking/warning, overlap J@40, keyword morte e i pool di ciascun
preset. È la **baseline** che il report confronta con il giudizio manuale: le divergenze fra soglia e
lettura (catalogo che passa tutto ed è brutto, o che fallisce una soglia ed è ottimo) sono materiale del
report, non rumore.

### D4 — Hero: live su produzione, via `simulate.js`

- `node scripts/qa/simulate.js profiles` materializza gli 8 profili `sim_*` in Atlas (cloni di DNA
  reale; il Freddo senza `TasteProfile`). Scrive solo documenti `sim_*`; il teardown finale li rimuove.
- `... fetch --pages 3` scarica manifest + cataloghi (top 50-60 per catalogo) nella run dir della
  campagna; `... review` produce gli artefatti strutturali per profilo×catalogo.
- **Giudizio manuale su 4 profili rappresentativi** — Cinefilo, Otaku, Famiglia, Freddo — per tutti gli
  8 hero. Gli altri 4 profili (diagnostici film/serie/no-anime) restano coperti dalla sola parte
  strutturale: il loro scopo è il contratto dei selettori, non la qualità editoriale.
- Il profilo sim **non ha token Trakt**: `trakt_filtered` va giudicato come *percorso di degrado*. Il
  percorso reale è una lacuna dichiarata (vedi Fuori ambito) e va ripetuta nel report.
- `teardown` a fine campagna: nessun documento `sim_*`, nessuna chiave Redis del profilo di test, e
  verifica che il profilo reale sia intatto.

### D5 — Rubrica a cinque dimensioni (vincolante, stessa scala per tutti i lotti)

| Dimensione | Peso | Cosa guarda | Ancore 100 / 80 / 60 / 40 / 0 |
|---|---|---|---|
| **Pertinenza** | 35 | quanti dei primi 50 appartengono alla promessa | tutti / ≥ 45 con 5 discutibili / ~ 40 / ~ 25 / promessa non mantenuta |
| **Qualità** | 20 | mediana voto, quota < 6.0, trash percepibile | mediana ≥ 7.5 e nessuno < 5.5 / mediana ≥ 7.0 / 6.5–7.0 o trash isolato / < 6.5 o trash diffuso / prevalenza trash |
| **Distintività** | 15 | overlap J@40 con i fratelli + titoli condivisi | J < 0.20 con tutti / < 0.35 / 0.35–0.50 con uno / ≥ 0.50 con uno / ≥ 0.70 (clone) |
| **Coerenza** | 15 | l'ordine rispetta la strategia dichiarata; niente stantio nei primi 10 | ordine spiegabile e fresco / lievi scostamenti / 2–3 fuori posto / ordine incomprensibile / ordine opposto alla promessa |
| **Completezza** | 15 | pool, semi-vuotezza, keyword morte | pool ≥ 300 / 60–150 / 25–60 / < 25 / 0–5 o vuoto |

`score = round(0.35·P + 0.20·Q + 0.15·D + 0.15·C + 0.15·K)`; verdetto **P ≥ 80**, **B 60–79**,
**N < 60**. Le ancore sono pubblicate nel brief di ogni giudice: lotti con scale diverse produrrebbero un
ranking inutilizzabile.

### D6 — Interfaccia di output del giudice (schema fisso)

Ogni giudice restituisce, per catalogo, un oggetto JSON con questa forma (nomi dei campi in italiano per
coerenza col report; testo libero in italiano):

```
{ id, promessaBreve, verdetto: "P|B|N", score, dimensioni: { pertinenza, qualita, distintivita, coerenza, completezza },
  itemGiudicati, errori: [ { pos, titolo, anno, tipo: "fuori-promessa|trash|duplicato|stantio|ordine-rotto|vuoto", nota } ],
  motivo, evidenza: ["Titolo (anno)", ...], fiducia: "alta|media|bassa" }
```

`errori` è la parte che rende il verdetto contestabile: senza `pos` + titolo, un N non è verificabile.
`fiducia: bassa` è ammessa e va usata quando il dump è ambiguo (titoli omonimi, pool corto, metadata
incompleti): il report aggrega separatamente i verdetti a bassa fiducia.

### D7 — Lotti e delega

- **Preset**: ~10 lotti tematici da 15 ± 5 cataloghi (le 13 categorie raggruppate per affinità, mai
  spezzando una categoria); un agente `agy` per lotto, brief in inglese, output in italiano, schema D6.
- **Hero**: 4 lotti, uno per profilo rappresentativo (8 hero ciascuno, con i 4 hero dello stesso tipo
  giudicati insieme per poter valutare l'overlap).
- **Aggregazione** (orchestratore): merge dei JSON, controllo di copertura, ordinamento, cluster delle
  cause. Nessuna riscrittura dei verdetti in aggregazione: le correzioni passano solo dalla verifica D8.
- **Verifica D8** (orchestratore): rilettura di **tutti gli N** e di un campione ≥ 10% dei P/B contro i
  dump; ogni correzione è annotata nel report con il motivo (`scoreCorrettoDa`). Divergenza media
  > 15 punti su un lotto ⇒ il lotto si ri-giudica (secondo giudice) prima di pubblicare il ranking.

### D9 — Artefatti e dove vivono

```
.scratch/qc-cataloghi/
  map.md                          mappa (versionata)
  issues/01-campagna-qc-cataloghi.md  questa spec (versionata)
  ricerche/01-report-qc-cataloghi.md  report distillato: ranking, cause, ticket proposti (versionato)
  ricerche/report.json            verdetti aggregati + copertura + audit dei lotti (versionato)
  review/<lotto>.md               verdetti per catalogo con evidenza (versionato)
  runs/<ts>/                      dump top50, audit.json, run hero, batch (gitignorato, rigenerabile)
```

`runs/` è già in `.gitignore`: i dump sono derivati ricostruibili, i verdetti no — la separazione è
deliberata (lezione del 06/10/2026 sulla cancellazione di `.scratch/`).

### D10 — Vincoli di sicurezza

Sola lettura su produzione: nessuna modifica ai preset, nessun `flushdb` (l'audit offline non tocca
Redis), nessuna scrittura su Atlas oltre i documenti `sim_*`, teardown finale obbligatorio.

## Testing Decisions

- **Cos'è un test buono qui**: solo il comportamento esterno. Per i preset, la query SQL che il router
  esegue in produzione (`where` + `orderBy`, `LIMIT 50`) letta dai Parquet di produzione: se il dump
  diverge da ciò che Stremio riceve, il test è falso. Per gli hero, la risposta HTTP reale del server
  (`/catalog/...`), non un mock interno.
- **Dove si testa** (seam più alto disponibile):
  1. `scripts/qa/top50-dump.js` — determinismo: due esecuzioni sugli stessi Parquet e con la stessa data
     di riferimento producono lo stesso dump; copertura: `index.json` contiene 160 preset attesi + 1
     escluso dichiarato, e nessun catalogo senza `items` o `pool`;
  2. ammissione della rubrica: per 3 cataloghi noti *a mano* (uno buono, uno clonato, uno vuoto) lo score
     calcolato dalle ancore D5 cade nella banda attesa — è il test che impedisce scale divergenti;
  3. `scripts/qa/simulate.js review` — struttura dei payload hero (conteggi, overlap zero fra hero dello
     stesso tipo, badge) come già fa oggi; la campagna non lo sostituisce, lo cita;
  4. verifica dell'orchestratore (D8) — il campione riletto non deve divergere oltre 15 punti; gli N
     sono riletti tutti.
- **Prior art**: `scripts/qa/catalog-audit.js` (audit offline deterministico su Parquet, run dir + JSON
  + MD, date congelate), `scripts/qa/simulate.js` + `scripts/qa/lib/*` (harness profili, fetch live,
  review strutturale, teardown), `scripts/fetch_catalogs.js` (paginazione e formato dei payload).
  Nessun mock nuovo: si riusano i seam esistenti.

## Out of Scope

- **Fix dei cataloghi**: filtro, keyword, soglie, ordinamenti. La campagna produce ticket, non patch.
- **Percorso Trakt autenticato**: i profili sim non hanno token. Il report dichiara la lacuna; colmarla
  (fetch sul profilo reale) è una decisione di una campagna successiva, non un ripiego da inventare qui.
- **`preset_anime_simulcast`** e qualunque catalogo con `_provider` non-SQL: escluso con motivo scritto
  nel report.
- **Cataloghi non-preset e non-hero**: `yaca_search_standard`, `yaca_search_ai`, le tre watchlist, custom
  e Matchmaker legacy.
- **Qualità di poster/badge** (badge ITA, poster composti, ERDB): l'oggetto è il contenuto, non la card.
- **Prestazioni e cache**: latenze, hit rate, memoria non sono oggetto della rubrica.
- **TMDB/tassonomie**: un titolo mancante dal dump è un dato da annotare, non un fix da fare qui.
- **Automazione futura**: nessuna pipeline CI, nessun gate; la campagna è un comando eseguito a mano.

## Further Notes

- **Data di riferimento congelata**: come `catalog-audit.js`, la campagna fissa `referenceDate` e la
  scrive nel report: due run in date diverse producono numeri non confrontabili sulle dimensioni
  Freschezza/Completezza, ed è la ragione per cui il report dichiara sempre la data.
- **Rumore del giudice**: la variabilità dell'agente è il rischio principale del ranking. Le ancore D5 e
  la verifica D8 esistono per questo; se il riesame mostra divergenze grosse, si pubblica il riscontro
  invece di un ranking più preciso di quanto i dati meritino.
- **Costo**: ~14 lotti su `agy`. Ogni giudice legge un file da qualche centinaio di righe e scrive un
  JSON: nessun lotto ha bisogno di rete.
- **Confronto nel tempo**: `report.json` mantiene un campo di versione e la data; una seconda campagna
  può calcolare il delta per catalogo (programmato ma non implementato qui).
- **Vocabolario**: nel report si usa il linguaggio del progetto — *preset*, *hero*, *promessa*, *pool*,
  *foglio* (le categorie della dashboard), *P/B/N*. «Catalogo sporco» non è un termine: si dice *fuori
  promessa* o *trash*.
