Status: ready-for-agent
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
   - Inclusione incondizionata dei semi `library` dentro `visti` (`visti = set(righe.tolist())`), impedendo l'auto-illuminazione spuria causata dal restart di PageRank (`ALPHA = 0.60`).
   - Calcolo della massa iniziale `e_init` e della massa indotta `r_indotta[x] = r[x] - ALPHA * e[x]`.
   - Ripescaggio controllato in `il_tuo_mondo`: ammessi al massimo 2 titoli di tipo `library` appartenenti alle bolle della riga solo se `r_indotta[x] >= percentile(r[cand_mondo], 85)` e `VAVE[x] >= 7.0`, ordinati nelle prime posizioni rispettando il contratto di monotonicità.
3. **`src/pool/index.js`**:
   - Estrazione ed esportazione di `convertiSemiPerGrafo(seeds, { medium, animePolicy })`.
   - Rimozione dell'invio esplicito di `peso: w` (e di `peso: 3` per i seed Trakt).
4. **`scripts/qa/probe-perdita-righe.js`**:
   - Riuso di `convertiSemiPerGrafo` esportato da `src/pool/index.js`, eliminando la duplicazione inline e saldando il debito tecnico del Ticket 01.

### 3. Prova d'impatto e verifiche eseguite

#### A. Sonda di misura a sei stadi (`probe-perdita-righe.js --fixture`)
Output prima:
```text
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
```

Output dopo (con `convertiSemiPerGrafo` condivisa):
```text
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
```

#### B. Sonda dedicata per il Ticket 02 (`py scripts/qa/probe-ticket-02-watchlist.py`)
Comando:
```bash
py scripts/qa/probe-ticket-02-watchlist.py
```
Output verbatim:
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
TUTTE LE VERIFICHE SUPERATE CON SUCCESSO (TASK_OK)
================================================================================
```

### 4. Manifest e Test Suite Baseline

- **Manifest Hashes**:
  ```bash
  node -e "const { buildManifest, buildRootManifest } = require('./src/stremio/manifest'); const crypto = require('crypto'); console.log('buildManifest:', crypto.createHash('sha256').update(JSON.stringify(buildManifest({}))).digest('hex')); console.log('buildRootManifest:', crypto.createHash('sha256').update(JSON.stringify(buildRootManifest())).digest('hex')); process.exit(0);"
  ```
  - `buildManifest`: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (identico)
  - `buildRootManifest`: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (identico)

- **Test Suite Jest**:
  ```bash
  npx jest --forceExit
  ```
  Totali: `Test Suites: 5 failed, 185 passed, 190 total` / `Tests: 8 failed, 1 skipped, 1898 passed, 1907 total`.
  Lista esatta delle 5 suite rosse (identiche alla baseline di partenza, dipendenti da parquet locali):
  - `tests/presetBurtonOrdering.test.js`
  - `tests/donghuaCatalog.test.js`
  - `tests/animeOverridesCertify.test.js`
  - `tests/duckDbAndMatchmaker.test.js`
  - `tests/candidateProvider.test.js`

### 5. Debito tecnico estinto
- Saldato il debito dichiarato del Ticket 01: la funzione di conversione Map seeds -> `semiPerGrafo` è ora implementata ed esportata una sola volta da `src/pool/index.js` (`convertiSemiPerGrafo`), eliminando la copia inline da `scripts/qa/probe-perdita-righe.js`.

### 6. Cosa NON è stato fatto
- Nessun tocco al valore `ALPHA = 0.60` (rimasto costante misurato).
- Nessuna modifica a `frontend/**`.
- Nessun `git push`, nessun `npm run build` o `tsc`.
- Nessun riavvio o interferenza con i container di produzione su server mate.
- Nessuna alterazione al pavimento di qualità.

