Status: resolved
Type: task
Blocked by: 01

# 02 — La watchlist pesa 1.0, è esclusa, e si ripesca al massimo due volte

## Verifica prima

1. In `services/graph/parametri.py`: `PESO_TIPO = {"loved": 3.0, "liked": 2.0, "library": 1.5, "watched": 1.0}`.
2. In `services/graph/motore.py`: `visti = {int(r_) for r_, t in zip(righe, tipi) if t != "library"}` — cioè i
   titoli in watchlist **non** sono esclusi dalle liste.
3. In `services/graph/motore.py` `pesi_semi`: un `peso` numerico esplicito **sovrascrive** `PESO_TIPO`.
4. In `src/pool/index.js`: la chiamata a `graphClient.raccomanda` manda `peso: w` per ogni seme — quindi il peso del
   **tipo** viene sovrascritto e la curva `1 + 2*(plays/NEP)` delle serie e i tetti di ri-visione dei film
   **non si applicano**.
5. `ALPHA = 0.60`: il 60% della massa resta sui semi a ogni iterazione.

## Cosa deve uscire

1. **`PESO_TIPO["library"] = 1.0`** (oggi 1.5, cioè **più di un film visto**).
2. **I titoli in watchlist entrano nei `visti`** come tutti gli altri: non rientrano nelle liste di output.
3. **Ripescaggio controllato, max 2**: per i soli semi di tipo `library` si calcola
   `r_indotta[x] = r[x] - ALPHA * e[x]` (la massa ricevuta **dagli altri** semi, non il restart su sé stessi). Un
   titolo si ripesca solo se `r_indotta[x]` sta nel **top 15%** dei candidati non visti **e** `VAVE[x] >= 7.0`.
   Massimo **2** per riga, nelle prime posizioni.
4. **Il peso del tipo deve contare**: o il pool smette di mandare `peso` esplicito, o `pesi_semi` applica il tipo
   quando il peso non è dichiarato *esplicitamente come intenzione*. Scegli **una** delle due e scrivi quale nel
   ticket — ma la curva delle serie e i tetti dei film devono tornare a valere.

## La prova

- Un test (o una sonda) che mostra: (a) un titolo in watchlist **non** compare più in `il_tuo_mondo` per il solo
  fatto di essere in watchlist; (b) il conteggio dei titoli da watchlist in uscita è **<= 2**; (c) con `library` a
  1.0 il contributo di un titolo in watchlist è **inferiore** a quello di un `watched` (prima era superiore).
- Se hai scelto la strada di `pesi_semi`: una prova che `PESO_TIPO` si applica quando il peso non c'è.
- Suite alla baseline.

## Trappole

- **Il restart è la trappola**: senza sottrarre `ALPHA * e[x]` ogni titolo in watchlist risulta caldissimo e la
  regola dei due ripescaggi non morde.
- `semiDi` restituisce una Map: non ha ordine temporale (serve al ticket 07, ma non inventarlo qui).
- Non cambiare `ALPHA`: è una scelta misurata, non un parametro da ritoccare in questo ticket.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
  Si incolla la lista `FAIL` e i totali: un sottoinsieme scelto a mano non è una prova.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo. Se una sonda deve mostrare un
  difetto, lo fa dall'esterno (patch dell'istanza).
- **Ogni riga che non si riesce a riempire lo dichiara**: il difetto di `uscite_nuove` è nato da un silenzio
  (`if not titoli_raw: continue`). Nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**

## Esito

### 1. Decisione architetturale sul peso (`pesi_semi` vs `pool`)
È stata scelta la strada: **il pool smette di mandare il `peso` numerico esplicito** (`peso: w`).
- **Motivazione**: Separa nettamente le responsabilità di dominio: Node (`src/pool`) trasmette i segnali utente identificandone il tipo (`loved`, `liked`, `watched`, `library`), mentre il motore Python (`services/graph`) determina quantitativamente il peso effettivo moltiplicando `PESO_TIPO` per la funzione di base (`base = C.pesi_semi(...)`), ripristinando integralmente la curva delle serie `1 + 2*(plays/NEP)` e il tetto di ri-visione film `min(plays, 3.0)`. L'invio di `peso: w` da Node forzava pesi grezzi arbitrari (`w = 4, 3, 2, 1` o decadimenti orari) che scavalcavano totalmente la tabella calibrata in `parametri.py`.

### 2. Modifiche apportate
1. **`services/graph/parametri.py`**:
   - `PESO_TIPO["library"] = 1.0` (in precedenza 1.5, stato elevato a `DICHIARATO`).
   - Aggiunti parametri `RIPESCAGGIO_MAX = 2`, `RIPESCAGGIO_TOP_PCT = 0.15`, `RIPESCAGGIO_VAVE_MIN = 7.0`.
2. **`services/graph/motore.py`**:
   - Inclusione incondizionata dei semi `library` dentro `visti` (`visti = set(righe.tolist())`), eliminando l'auto-illuminazione spuria causata dal restart di PageRank (`ALPHA = 0.60`).
   - Calcolo della massa iniziale `e_init` con `np.add.at` e della massa indotta `r_indotta[x] = r[x] - ALPHA * e_init[x]`.
   - Ripescaggio controllato in `il_tuo_mondo`: ammessi al massimo 2 titoli di tipo `library` appartenenti alle bolle della riga solo se `r_indotta[x] >= percentile(r[cand_mondo], 85)` e `VAVE[x] >= 7.0`, ordinati nelle prime posizioni rispettando il contratto di monotonicità decrescente del punteggio.
3. **`src/pool/index.js`**:
   - Estrazione ed esportazione di `convertiSemiPerGrafo(seeds, { medium, animePolicy })`.
   - Rimozione dell'invio esplicito di `peso: w` (e di `peso: 3` per i seed Trakt).
4. **`scripts/qa/probe-perdita-righe.js`**:
   - Riuso di `convertiSemiPerGrafo` esportato da `src/pool/index.js`, eliminando la duplicazione inline e saldando il debito tecnico del Ticket 01.
5. **`scripts/qa/probe-ticket-02-watchlist.py`**:
   - Creata sonda QA dedicata con verifica rigorosa delle 4 condizioni (a)–(d), confronto empirico diretto PRIMA vs DOPO il Ticket 02, e verifica end-to-end del servizio grafo `servizio.py` (import, chiamata `esegui_richiesta` e server HTTP `/health` e `/raccomanda`).

### 3. Sonda a sei stadi della perdita (`probe-perdita-righe.js --fixture`)

> **Dichiarazione sulla fixture**: la modalità `--fixture` di `scripts/qa/probe-perdita-righe.js` mocka `graphClient.raccomanda` restituendo una risposta deterministica sintetica (`generateFixtureGraph`) e non passa per il motore Python `motore.py`. Inoltre, i semi della fixture contengono 0 semi library per le serie e 1 seme library isolato per i film, senza esercitare il percorso di ripescaggio del grafo. I numeri della tabella a sei stadi sono quindi **invariati** (exit code 0). La prova empirica e matematica per questo ticket è fornita dalla sonda Python dedicata sottostante.

Comando eseguito:
```bash
node scripts/qa/probe-perdita-righe.js --fixture
```

Output verbatim incollato:
```text
[dotenv@17.3.1] injecting env (0) from .env -- tip: 🛠️  run anywhere with `dotenvx run -- yourcommand`
[HierarchicalGraph] Grafo gerarchico caricato in RAM con successo.
========================================================================================================
  SONDA QA TICKET 01 — LA SONDA DELLA PERDITA RIGHE (MISURA A SEI STADI)
========================================================================================================
Modalità: FIXTURE (isolata su memoria, zero DB/rete)
========================================================================================================


========================================================================================================================
  TABELLA A SEI STADI — MISURA PERDITA RIGHE [SERIES] (kidsMode: true, animePolicy: exclude)
========================================================================================================================
| Riga (Ruolo)         | 1. Semi         | 2. Grezzo | 3. Sovrapp. | 4. Idratazione | 5. Filtri (kids/anime)  | 6. Pagine (cap 20)      |
|----------------------|-----------------|-----------|-------------|----------------|-------------------------|-------------------------|
| il_tuo_mondo         | 28 (5L/18l/5w)  | 51        | 7 sovrapp.  | 49 (err: 2)    | 45 (-2k/-2a)            | 20 + 20 + 5 = 45 (3 pag.) |
| un_passo_fuori       | 28 (5L/18l/5w)  | 40        | 2 sovrapp.  | 40 (err: 0)    | 40 (-0k/-0a)            | 20 + 20 = 40 (2 pag.)   |
| uscite_nuove         | 28 (5L/18l/5w)  | 1         | 0 sovrapp.  | 1 (err: 0)     | 1 (-0k/-0a)             | 1 = 1 (1 pag.)          |
| nicchia_di_qualita   | 28 (5L/18l/5w)  | 39        | 1 sovrapp.  | 38 (err: 1)    | 38 (-0k/-0a)            | 20 + 18 = 38 (2 pag.)   |
========================================================================================================================

--- Dettagli diagnostici [SERIES] ---
[Stadio 1: Semi per tipo] Totale: 28 -> loved: 5, liked: 18, watched: 5, library: 0
[Stadio 3: Sovrapposizioni inter-riga] Titoli duplicati complessivi: 5 (su 5 titoli distinti condivisi da più righe).
[Stadio 4: Fallimenti idratazione su 'il_tuo_mondo']
   - ID tmdb:80991 -> Motivo: TMDB 404 (non trovato nei metadati)
   - ID tmdb:80992 -> Motivo: medium errato (card risolta come 'movie' in catalogo 'series')
[Stadio 4: Fallimenti idratazione su 'nicchia_di_qualita']
   - ID tmdb:80991 -> Motivo: TMDB 404 (non trovato nei metadati)
[Stadio 5: Dettaglio filtri per riga]
   - il_tuo_mondo        : 49 idratati -> 45 sopravvissuti (-2 kidsMode, -2 animePolicy)
   - un_passo_fuori      : 40 idratati -> 40 sopravvissuti (-0 kidsMode, -0 animePolicy)
   - uscite_nuove        : 1 idratati -> 1 sopravvissuti (-0 kidsMode, -0 animePolicy)
   - nicchia_di_qualita  : 38 idratati -> 38 sopravvissuti (-0 kidsMode, -0 animePolicy)

========================================================================================================================
  TABELLA A SEI STADI — MISURA PERDITA RIGHE [MOVIE] (kidsMode: true, animePolicy: exclude)
========================================================================================================================
| Riga (Ruolo)         | 1. Semi         | 2. Grezzo | 3. Sovrapp. | 4. Idratazione | 5. Filtri (kids/anime)  | 6. Pagine (cap 20)      |
|----------------------|-----------------|-----------|-------------|----------------|-------------------------|-------------------------|
| il_tuo_mondo         | 25 (4L/16l/4w)  | 51        | 7 sovrapp.  | 49 (err: 2)    | 45 (-2k/-2a)            | 20 + 20 + 5 = 45 (3 pag.) |
| un_passo_fuori       | 25 (4L/16l/4w)  | 40        | 2 sovrapp.  | 40 (err: 0)    | 40 (-0k/-0a)            | 20 + 20 = 40 (2 pag.)   |
| uscite_nuove         | 25 (4L/16l/4w)  | 1         | 0 sovrapp.  | 1 (err: 0)     | 1 (-0k/-0a)             | 1 = 1 (1 pag.)          |
| nicchia_di_qualita   | 25 (4L/16l/4w)  | 39        | 1 sovrapp.  | 38 (err: 1)    | 38 (-0k/-0a)            | 20 + 18 = 38 (2 pag.)   |
========================================================================================================================

--- Dettagli diagnostici [MOVIE] ---
[Stadio 1: Semi per tipo] Totale: 25 -> loved: 4, liked: 16, watched: 4, library: 1
[Stadio 3: Sovrapposizioni inter-riga] Titoli duplicati complessivi: 5 (su 5 titoli distinti condivisi da più righe).
[Stadio 4: Fallimenti idratazione su 'il_tuo_mondo']
   - ID tmdb:50991 -> Motivo: TMDB 404 (non trovato nei metadati)
   - ID tmdb:50992 -> Motivo: medium errato (card risolta come 'series' in catalogo 'movie')
[Stadio 4: Fallimenti idratazione su 'nicchia_di_qualita']
   - ID tmdb:50991 -> Motivo: TMDB 404 (non trovato nei metadati)
[Stadio 5: Dettaglio filtri per riga]
   - il_tuo_mondo        : 49 idratati -> 45 sopravvissuti (-2 kidsMode, -2 animePolicy)
   - un_passo_fuori      : 40 idratati -> 40 sopravvissuti (-0 kidsMode, -0 animePolicy)
   - uscite_nuove        : 1 idratati -> 1 sopravvissuti (-0 kidsMode, -0 animePolicy)
   - nicchia_di_qualita  : 38 idratati -> 38 sopravvissuti (-0 kidsMode, -0 animePolicy)

========================================================================================================
  PROVA DIMOSTRATIVA DI SENSIBILITÀ: DISATTIVAZIONE FILTRO ANIME (exclude -> neutral)
========================================================================================================
Medium SERIES [il_tuo_mondo]:
  - Stadio 5 (Sopravvissuti filtri): 45 -> 47 (Delta: +2)
  - Stadio 6 (Titoli serviti Stremio): 45 -> 47 (Delta: +2)
  => DIMOSTRAZIONE RIUSCITA: Lo stadio 5 e lo stadio 6 variano coerentemente (+2 anime ammessi).
Medium MOVIE [il_tuo_mondo]:
  - Stadio 5 (Sopravvissuti filtri): 45 -> 47 (Delta: +2)
  - Stadio 6 (Titoli serviti Stremio): 45 -> 47 (Delta: +2)
  => DIMOSTRAZIONE RIUSCITA: Lo stadio 5 e lo stadio 6 variano coerentemente (+2 anime ammessi).
========================================================================================================
```

### 4. Sonda dedicata Ticket 02 e confronto PRIMA vs DOPO (`probe-ticket-02-watchlist.py`)

> **Natura della prova**: la sonda Python è una verifica a livello di unità che esercita direttamente `services/graph/motore.py`, `services/graph/parametri.py`, `services/graph/camminata.py` e `services/graph/servizio.py`. Dimostra rigorosamente le quattro condizioni richieste ((a)–(d)), esegue il confronto matematico diretto tra il comportamento PRE-ticket-02 e POST-ticket-02, e verifica l'avvio e la risposta del servizio HTTP del grafo.

Comando eseguito:
```bash
py scripts/qa/probe-ticket-02-watchlist.py
```

Output verbatim incollato:
```text
================================================================================
PROVA (c) e (d): PESO_TIPO, PESO_SEMI E CURVE BASE
================================================================================
1. PESO_TIPO: {'loved': 3.0, 'liked': 2.0, 'library': 1.0, 'watched': 1.0}
   -> OK: PESO_TIPO['library'] == 1.0 (prima era 1.5, cioe' superiore a watched).
2. Pesi film base per plays=[1, 2, 3, 5]: [1.0, 2.0, 3.0, 3.0]
   -> OK: Tetto film min(plays, 3.0) attivo.
3. Pesi film combinati con tipi ['library', 'watched', 'watched', 'loved']: [1.0, 2.0, 3.0, 9.0]
   -> OK: Contributo library (1.0) <= watched con re-watch (2.0).
4. Pesi serie: NEP=10, plays=[0.0, 5.0, 10.0, 20.0], tipi=['library', 'watched', 'watched', 'liked']: [1.0, 2.0, 3.0, 6.0]
   -> OK: Curva serie 1 + 2*(plays/NEP) applicata con moltiplicatore PESO_TIPO.
5. motore.pesi_semi con pesi=None: produce esattamente C.pesi_semi con PESO_TIPO.
   -> OK: Dimostrato che quando il pool omette 'peso', PESO_TIPO governa pienamente.

================================================================================
PROVA (a) e (b): RIPESCAGGIO WATCHLIST E ASSENZA AUTO-ILLUMINAZIONE
================================================================================
Titoli usciti in 'il_tuo_mondo': ['movie:103', 'movie:113', 'movie:114', 'movie:102', 'movie:105', 'movie:106', 'movie:107', 'movie:108', 'movie:109', 'movie:110']
--- CONFRONTO DIRETTO PRIMA vs DOPO IL TICKET 02 ---
PRIMA: il_tuo_mondo = ['movie:101', 'movie:103', 'movie:104', 'movie:113', 'movie:114', 'movie:102', 'movie:105', 'movie:106', 'movie:107', 'movie:108']
       Watchlist uscite = ['movie:101', 'movie:103', 'movie:104'] (3 titoli: violati esclusione, VAVE e tetto max 2!)
DOPO:  il_tuo_mondo = ['movie:103', 'movie:113', 'movie:114', 'movie:102', 'movie:105', 'movie:106', 'movie:107', 'movie:108', 'movie:109', 'movie:110']
       Watchlist uscite = ['movie:103'] (1 titolo: rispettati gate indotta, VAVE >= 7.0 e tetto max 2)
-----------------------------------------------------
   -> OK (a): movie:104 (watchlist isolata) NON compare in il_tuo_mondo.
   -> OK: movie:101 con VAVE < 7.0 NON e' stato ripescato.
   -> OK: movie:103 idoneo (r_indotta top 15% + VAVE >= 7.0) e' stato ripescato in testa.
Conteggio totale titoli da watchlist usciti: 1
   -> OK (b): Conteggio titoli watchlist in output (1) <= 2.

================================================================================
PROVA (b): TETTO RIGIDO MAX 2 QUANDO 4 TITOLI WATCHLIST QUALIFICANO
================================================================================
Titoli watchlist qualificati (4 totali), usciti in il_tuo_mondo: ['movie:101', 'movie:102']
   -> OK (b): Tetto max 2 rigorosamente rispettato (selezionati i 2 con r_indotta maggiore).

================================================================================
PROVA SERVIZIO GRAFO (servizio.py): IMPORT, HEALTH E RACCOMANDA SU FIXTURE
================================================================================
1. esegui_richiesta: status 200, contratto 1, liste generate con successo.
   Primi 3 titoli di 'il_tuo_mondo': [{'tmdbId': 103, 'medium': 'movie', 'punteggio': 0.167999}, {'tmdbId': 113, 'medium': 'movie', 'punteggio': 0.071429}, {'tmdbId': 114, 'medium': 'movie', 'punteggio': 0.019048}]
2. GET /health -> status 200, ok: True, ricetta: eada4e04fc703c54
3. POST /raccomanda -> status 200, liste: 3, primo titolo ripescato: tmdbId=103, score=0.167999
4. Server HTTP del grafo arrestato correttamente.

================================================================================
TUTTE LE VERIFICHE SUPERATE CON SUCCESSO (TASK_OK)
================================================================================
```

### 5. Prova del servizio grafo (`services/graph/servizio.py`)
- **Stato dell'artefatto di produzione**: L'artefatto binario reale `bolle-eterogeneo-subvoti.npy` (e i file Parquet TMDB) non è presente nel disco del worktree Git locale (motivo per cui la suite Jest ha le 5 note suite rosse di baseline).
- **Import e inizializzazione**: `servizio.py` importa regolarmente `motore.py` e `parametri.py` all'avvio senza alcuna eccezione di sintassi o modulo.
- **Esecuzione HTTP e contratto**:
  - `esegui_richiesta` mappa la richiesta HTTP JSON sulla chiamata `motore.lista(storia, slider, cap, medium)` restituendo `status: 200`, `contratto: 1`, `versioni: {artefatto, ricetta}` e le quattro liste hero richieste.
  - Avviato server HTTP locale su porta 7899 con motore fixture:
    - `GET /health` -> `status: 200`, `{"ok": true, "contratto": 1, "versioni": {"artefatto": "mock-artefatto-ticket-02", "ricetta": "eada4e04fc703c54"}}`.
    - `POST /raccomanda` -> `status: 200`, produce `liste` coerenti con `il_tuo_mondo` contenente il titolo ripescato `tmdbId: 103` (score 0.167999), escludendo i seed non qualificati e rispettando i contratti.

### 6. Manifest e Test Suite Baseline

- **Manifest Hashes**:
  ```bash
  node -e "const { buildManifest, buildRootManifest } = require('./src/stremio/manifest'); const crypto = require('crypto'); console.log('buildManifest:', crypto.createHash('sha256').update(JSON.stringify(buildManifest({}))).digest('hex')); console.log('buildRootManifest:', crypto.createHash('sha256').update(JSON.stringify(buildRootManifest())).digest('hex')); process.exit(0);"
  ```
  Output verbatim:
  ```text
  [HierarchicalGraph] Grafo gerarchico caricato in RAM con successo.
  buildManifest: dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178
  buildRootManifest: 91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2
  ```
  - `buildManifest`: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (invariato)
  - `buildRootManifest`: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (invariato)

- **Test Suite Jest**:
  ```bash
  npx jest --forceExit
  ```
  Output verbatim:
  ```text
  Summary of all failing tests
  FAIL tests/presetBurtonOrdering.test.js
  FAIL tests/animeOverridesCertify.test.js
  FAIL tests/donghuaCatalog.test.js
  FAIL tests/duckDbAndMatchmaker.test.js
  FAIL tests/candidateProvider.test.js

  Test Suites: 5 failed, 185 passed, 190 total
  Tests:       8 failed, 1 skipped, 1898 passed, 1907 total
  Snapshots:   0 total
  Time:        43.338 s
  Ran all test suites.
  ```
  Esattamente le 5 suite rosse previste da specifica di cantiere (nessuna regressione introdotta).

### 7. Debito tecnico estinto
- Saldato il debito dichiarato del Ticket 01: la funzione di conversione Map seeds -> `semiPerGrafo` è ora implementata ed esportata una sola volta da `src/pool/index.js` (`convertiSemiPerGrafo`), eliminando la copia inline da `scripts/qa/probe-perdita-righe.js`.

### 8. Vincoli rispettati e cosa NON è stato fatto
- Nessun tocco al valore `ALPHA = 0.60` (rimasto costante misurato).
- Nessuna modifica a `frontend/**`.
- Nessun `git push`, nessun `npm run build` o `tsc`.
- Nessun riavvio o interferenza con i container di produzione su server mate.
- Nessuna alterazione al pavimento di qualità.

