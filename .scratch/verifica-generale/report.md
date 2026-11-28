# Verifica generale — YACA

**Data**: 27 novembre 2026 · **Immagine al momento della verifica**: `8116fe23` (`1.1.0+BauPSauk`, app `healthy`) · **Dopo le correzioni**: `6e7c7f94` · **Server**: `matebook`, `http://127.0.0.1:7860`
**Metodo**: 159 chiamate HTTP reali sulla rotta Stremio e sulle API web + 6 sonde locali sui moduli (parser, risolutori, filtri compilati, contenuto del dump, end-to-end). Nessuna scrittura, nessun profilo toccato.

---

## Chiusi lo stesso giorno (deploy `6e7c7f94`)

Tutti i difetti qui sotto sono stati corretti, uno per commit, e verificati **sulla produzione** — non solo in locale. Il giro completo delle 159 prove, dopo il deploy, dà **0 anomalie**.

| # | prima | dopo | commit |
|---|---|---|---|
| D1/D2 | `voto < 7` → `vote_average.gte: 7` (l'opposto) | `voto < 7` → voti **4,1–6,991**; `durata < 90` → durate **0–90** | `efa448e8` |
| D5 | `search=100%` → **500** | **200** con `metas: []` | `f8a3a639` |
| D4 | `genere horror` serie → 0 | **20 titoli** (American Horror Story, Black Mirror, Supernatural); `genere thriller` serie → 20 (MINDHUNTER, Dexter, Breaking Bad) | `605cf946` |
| D3 | `eta 0-6` → 0 senza motivo | **20 titoli**; `eta 21` → motivo `eta_non_valida` | `e48d28af` |
| D7 | `provider netflix` → 0 (ricerca testuale) | **20 titoli**; `crew aaron sorkin` → 12 | `8d349093` |
| D6 | manifest utente inesistente → **400** | **200** con `configurationRequired: true`, 0 catalogs | `cffe15ab` |
| D8 | `regista christopher nolan` serie → `regista_non_risolto` | il nome si risolve; la pagina è vuota perché non ha creato serie | `4ca808fc` |
| — | `skip=-5` → pagina vuota | azzerato: pagina piena | `4ca808fc` |

Suite: **2.167 passati**, 1 saltato, resta solo il timeout noto di `heroMovieDateRegression` sotto carico parallelo (13/13 da solo). Docs della sintassi aggiornati (`6e7c7f94`).

Cosa non è cambiato, di proposito: `Romantico` e `Storia` restano generi condivisi con le serie (40 e 10 titoli nel dump — un fatto dei dati, non un difetto); `crew hans zimmer` resta vuoto perché l'indice ha registi e sceneggiatori, non compositori, ma adesso lo dice con un motivo.

**Durata ignota, chiusa il 28/11.** TMDB risponde `runtime: 0` quando non conosce la durata, e il daemon scriveva quello zero: 653 film indistinguibili da film da zero minuti (`durata < 90` ne pescava 658). Due lati: il filtro in lettura esclude lo zero (`runtime BETWEEN 1 AND N`, come faceva già `shortFilm`), e il daemon ora scrive `null`. Il dato nel file è stato sistemato con `scripts/backfill-runtime-ignoto.js` (653 riletti in 50 s: 6 avevano imparato la durata, 647 sono diventati `null`). Dopo la conversione: `runtime = 0` da 653 a **0**, `null` 652, minima durata nota 1.

---

## Esito in breve

| area | prove | esito |
|---|---|---|
| Manifest e forme delle rotte | 7 | 4 ok · **1 difetto**, 2 mie aspettative sbagliate |
| Cataloghi dichiarati (paginazione, tipi, extra) | 5 | 5 ok, 0 doppioni |
| Bordi del protocollo (skip, encoding, metodi) | 24 | 22 ok · **1 difetto**, 1 da irrobustire |
| Sintassi di ricerca (42 casi × 2 tipi) | 84 | tutte 200 e ben formate · **3 difetti di merito** |
| Meta (`/meta/:type/:id`) | 7 | 7 ok |
| API web (auth, injection, contratti) | 21 | 19 ok · 2 mie aspettative sbagliate |
| Carico concorrente | 5 | 5 ok |
| **Totale** | **159** | **7 anomalie, di cui 5 difetti veri** |

Tempi (misurati dentro il server, quindi senza rete): ricerca p50 **257 ms** · p90 **923 ms** · max **1.993 ms**; cataloghi p50 229 ms; meta p50 155 ms; API web p50 3 ms.
Suite esistente: **2.146 passati**, 1 saltato, 2 timeout noti (`duckDbPresetsValidation`, `heroMovieDateRegression` — passano da soli, cadono solo sotto carico parallelo).

---

## Difetti veri

### D1 — `voto < 7` filtra **≥ 7** (gravità: alta)

Il tokenizzatore butta via il comparatore e interpreta il numero come minimo. Non è un errore visibile: la pagina torna piena, con i titoli sbagliati.

```
voto < 7      →  filtri { "vote_average.gte": 7 }   motivi ["ignorato: <"]     ← l'opposto
voto > 7      →  filtri { "vote_average.gte": 7 }   motivi ["ignorato: >"]     ← giusto per caso
voto 7        →  filtri { "vote_average.gte": 7 }
```

**Correzione**: riconoscere `<`/`>` come parte del valore (`<7` → `[null, 7]`, `>7` → `[7, null]`); un comparatore inatteso deve dare un motivo, non essere ignorato in silenzio. Toccato: `src/ricerca/pianificatore.js` (tokenizzazione dei numerici).

### D2 — `durata < 90` filtra **≥ 90** (gravità: alta, stessa radice di D1)

```
durata < 90   →  filtri { "with_runtime.gte": 90 }  motivi ["ignorato: <"]
durata 90-120 →  filtri { "with_runtime.gte": 90, "with_runtime.lte": 120 }   ← questo è giusto
```

### D3 — `eta` con una fascia non standard restituisce zero, senza dirlo (gravità: media)

`eta` funziona con i valori della tabella interna (`T`, `VM14`, `18+`, `PG-13`, `G`, `R`…):

```
eta T     → 20 titoli      eta vm14 → 20 titoli      eta 18+ → 20 titoli
eta 0-6   →  0 titoli, nessun motivo
```

`0-6` è la scrittura più naturale che esista per un genitore, e viene accettata dal parser (`eta="0-6"`) per poi finire in un confronto esatto: `lower(content_rating) = '0-6'` → zero righe, zero spiegazioni. Il dump ha 34.204 film e 11.170 serie con `content_rating`, quindi i dati ci sono.
**Correzione**: validare contro `ETA_RANK` e mappare le forme a intervallo (`0-6` → `6+`); se proprio non si riconosce, emettere `eta_non_valida` e ignorare il filtro (pagina piena + motivo) invece di una pagina vuota muta.

### D4 — I generi che non esistono nelle serie restituiscono zero (gravità: media-alta)

`Horror` (27) e `Thriller` (53) sono generi **solo cinematografici**: in TMDB le serie non li hanno. Il risolutore restituisce comunque l'id dei film e il filtro cade nel vuoto.

```
genere horror    movie → 20      genere horror    series → 0
genere thriller  movie → 20      genere thriller  series → 0
tema horror      movie → 20      tema horror      series → 0
tema HORROR      movie → 20      tema HORROR      series → 0
```

Nel dump: **0 serie** con genere 27 o 53, ma **362 serie** hanno `horror` fra le keyword e **520** hanno `thriller`. Il ripiego esiste ed è pieno, semplicemente non viene fatto.
Nota: `Romance` (10749, 40 serie) e `History` (36, 10 serie) invece esistono, quindi non vanno toccati: la regola è per tipo di genere, non generale.
**Correzione**: in `src/ricerca/generi.js` marcare i generi assenti dal mondo serie (`soloFilm: true` per 27, 53, 10402) e, nel risolutore, ripiegare sul concetto/keyword omonimo. Effetto misurato atteso: da 0 a qualche centinaio di serie.

### D5 — Un `%` malformato nella ricerca produce **HTTP 500** (gravità: media)

```
search=100%.json      → 500 {"error":"Failed to decode param 'search=100%'"}
search=%zz.json       → 500 {"error":"Failed to decode param 'search=%zz'"}
```

Viola la regola di casa («le porte non sollevano mai»: la rotta Stremio deve sempre rispondere 200 con `metas: []`). Un client che manda un `%` non codificato — o un utente che digita `100%` in un browser — vede un errore di protocollo invece di una lista vuota.
**Correzione**: `decodeURIComponent` dentro `try/catch` in `parseExtra` (`src/infra/helpers.js`); in caso di fallimento si tiene il valore grezzo.

### D6 — Il manifest di un utente inesistente risponde **400** (gravità: bassa)

```
/utente-che-non-esiste/manifest.json → 400 {"error":"Configurazione non valida"}
```

Stremio tratta un 400 come addon non installabile. Un manifest 200 con `behaviorHints.configurationRequired` porterebbe l'utente alla pagina di configurazione invece che a un errore.
**Correzione**: `src/api/stremio.js`, ramo `!userConfig` → manifest radice (come già fa `/manifest.json`).

### D7 — `provider` e `crew` non sono parole accettate (gravità: bassa, ma ingannevole)

Le forme sono `su`/`piattaforma` e `regista`/`autore`/`creatore`: i nomi dei campi dello schema non funzionano come operatori.

```
su netflix        → 20 titoli ✓          provider netflix → 0 (ricerca testuale)
regista nolan     → 16 titoli ✓          crew hans zimmer → 0 (ricerca testuale)
```

Chi legge la documentazione o l'editor prova `provider`/`crew` e ottiene una ricerca testuale che non trova nulla. **Correzione**: aggiungerli alle `forme` in `OPERATORI`, senza togliere le esistenti.

### D8 — `regista` su serie risolve una persona **diversa** (gravità: bassa, comportamento da conoscere)

Nelle serie `regista` significa «creatore» (`created_by`), e la ricerca fra i soli creatori cambia l'omonimo scelto:

```
regista nolan              movie → 525 (Christopher)    series → 527 (Jonathan)
regista christopher nolan  movie → 525 ✓                series → null (motivo: regista_non_risolto)
```

Non è un errore di codice — è la regola «per le serie conta chi ha creato» — ma è una sorpresa: la stessa query indica due persone diverse a seconda del tipo. Da decidere: accettarlo e documentarlo, oppure ripiegare su `director` quando il nome completo non trova creatori (così `christopher nolan` sulle serie darebbe 0 *con* motivo, non null).

### Curiosità (non un difetto)

`search=a?b` restituisce un titolo chiamato `a||b` (`tmdb:625690`) che nel dump non esiste (`/meta` → `null`): una riga dell'indice Tier 2 senza corrispondenza nel catalogo. Compare solo per query senza senso, ma dice che il Tier 2 può proporre id orfani: l'arricchimento li lascia passare senza nome/poster.

---

## Cosa regge (e con quali numeri)

**Paginazione** — 5 cataloghi dichiarati + ricerca, pagina 1 e 2 sempre complementari (**0 doppioni**); `skip` oltre la fine → 200 con lista vuota; `skip` come query string, `skip` prima di `search`, `skip` duplicato → tutti 200.

**Protocollo** — `skip` negativo → 200 vuoto (ma andrebbe azzerato, non passato a DuckDB); `skip` non numerico/decimale → 200; ricerca vuota, di soli spazi, di 600 caratteri, con `&`, `=`, emoji, apostrofo, accenti, null byte → sempre 200. HEAD/OPTIONS innocui. CORS `*`, `Cache-Control: max-age=60`.

**Sicurezza** — `/api/admin/metrics` senza password → **401 JSON** (protetto); SQL (`' OR 1=1--`), XSS (`<script>`), path traversal (`../`, `..%2f`) → nessun effetto, 200 vuoto o 404; prototipo inquinato via query string → nessun effetto.

**Meta** — 7/7: film e serie per id TMDB e IMDB, episodio stile Stremio (`tt…:1:1`), id inesistente e spazzatura → 200 con `meta: null`, mai 500.

**Errori dichiarati** — quando qualcosa non si risolve, il motivo c'è: `regista_non_risolto`, `persona_non_risolto`, `genere_non_riconosciuto`, `tema_non_riconosciuto`, `anno_non_valido: 1999-1990`, `nessuna_condizione`. (Nei log e nell'anteprima del creator; non nella risposta Stremio, che per protocollo ha solo `metas`.)

**Carico** — 15 ricerche concorrenti: 1.204 ms totali, 80 ms/richiesta, 15/15 corrette. 10 cataloghi concorrenti: 566 ms totali, 57 ms/richiesta, 10/10. Catalogo inesistente e utente simulato (`sim-uuid-yaca`) → 200.

**Filtri principali, tutti verificati vivi**: `tema` (semplice, composto, con virgole, con `:` e `;`), `genere`, `anno` (secco e intervallo), `voto`, `durata`, `eta` (fasce standard), `cast` (anche con refuso), `regista`, `su netflix` (film e serie), `lingua`, `paese`, `anime`, `simili` (uno e due semi), `senza`, `ordina`, multi-intento su più righe, refusi (`matrx` → 1), titoli attaccati (`spiderman`), senza accenti (`la citta incantata` → 1), apostrofi (`schindlers list` → 1).

---

## Prestazioni per famiglia

| famiglia | p50 | p90 | max | note |
|---|---|---|---|---|
| Filtri (genere, anno, cast, tema) | 10–100 ms | 300 ms | 900 ms | solo indice, nessuna rete |
| Testo (Tier 1 + Tier 2 + arricchimento) | 200–800 ms | 1.500 ms | **3.275 ms** | il costo è TMDB; `ENRICH_BUDGET_MS` 3.500 fa da tetto |
| `simili` | ~1.000 ms | — | 1.300 ms | grafo in produzione |
| Cataloghi | 229 ms | 1.268 ms | 1.268 ms | watchlist anime/serie le più lente |
| Meta | 155 ms | 479 ms | 479 ms | |
| API web | 3 ms | 5 ms | 8 ms | nessuna arricchita |

Il caso più lento visto: `amelie` **3.275 ms** (accenti → Tier 2 → arricchimento) e la ricerca su tipo `series` **2.648 ms**. Non sono rotture, sono il tetto di idratazione.

---

## Cosa **non** ho provato (e perché)

- **Mutazioni**: creazione/eliminazione profili, libreria, watchlist, sincronizzazione, `POST /api/configurazione`. Rischio di sporcare il profilo vero senza un utente di prova dedicato alle scritture.
- **Autenticazione**: flussi Stremio (`/stremio-auth`, `check-user`) e Trakt (`device/code`), rate limit sotto abuso, sessioni scadute.
- **Servizio grafo spento**: `simili` e i cataloghi «vicini» degradano? Da provare abbattendo il container in una finestra concordata.
- **Primo avvio / rollback**: build di `people.db`, cold start del dump, riavvio con volumi vuoti, Watchtower che aggiorna a metà richiesta.
- **Client reale**: oltre ai log `[StremioSearch]`, il comportamento di Stremio su pagine lunghe e su cache del manifest.

---

## Priorità consigliate

| # | difetto | gravità | intervento |
|---|---|---|---|
| 1 | `voto <` / `durata <` invertiti (D1, D2) | alta | parser: comparatori come parte del valore |
| 2 | 500 su `%` malformato (D5) | media | `try/catch` in `parseExtra` |
| 3 | generi solo-film sulle serie → 0 (D4) | media-alta | `soloFilm` in `generi.js` + ripiego su keyword |
| 4 | `eta 0-6` → 0 muto (D3) | media | validazione contro `ETA_RANK` |
| 5 | `provider`/`crew` non riconosciuti (D7) | bassa | aggiungere le forme |
| 6 | manifest utente inesistente → 400 (D6) | bassa | manifest radice 200 |
| 7 | `regista` su serie: persona diversa (D8) | bassa | decidere e documentare |

I primi quattro sono un pomeriggio di lavoro con i test che già ci sono (`pianificatore.test.js`, `risolutori.test.js`, `duckDbProvider` e i test di rotta). Il resto è rifinitura.

---

### Riproducibilità

Sonde in `.scratch/verifica-generale/`:

| file | cosa fa |
|---|---|
| `probe-generale.js` | le 159 prove HTTP (BASE=… per puntare altrove), scrive `esiti.json` |
| `probe-filtri.js` | i filtri compilati per i casi sospetti (`voto <`, `eta 0-6`, `genere horror` serie) |
| `probe-risolutori.js` | concetto/persona/crew per film e serie |
| `probe-dati.js` | generi presenti nelle due tabelle, `content_rating`, `watch_providers_it` |
| `probe-e2e.js` | giro locale end-to-end su 20 query |
| `probe-piano-tipi.js` | come la stessa query si risolve per film e per serie |

`esiti-server.json` è l'esito integrale delle 159 prove.
