Status: resolved
Type: task

# 04 — Anti-monopolio di saga e regista

## Verifica prima

- In `services/graph/bubbles.py` i componenti `COLL` (peso **3**) e `DIR` (peso **1**) legano fortissimo i film
  della stessa collezione o dello stesso regista.
- Sulle righe del grafo **non** viene applicata nessuna delle due regole di cap che esistono già altrove
  (`src/pool/composer.js`, `src/profile/ProfileScorer.js` `applyDiversityCaps`): verifica che sia vero.
- Nel canone sono disponibili `collection_id`, regista e `ANNO` (o la data di uscita).

## Cosa deve uscire

Nelle righe del grafo (tutte, non solo `il_tuo_mondo`):

1. **Massimo 1 titolo per `collection_id`** TMDB nei primi **20** slot di una riga.
2. **Massimo 2 titoli per lo stesso regista** nei primi **20** slot.
3. Dentro una collezione si tiene il **titolo con `ANNO` minore fra i non visti**: se l'utente non ha visto *Dune —
   Parte Uno*, non gli si propone *Parte Due*. (Questa è la parte che conta più del cap: è un errore di senso, non
   di varietà.)
4. I titoli esclusi dal cap **non spariscono**: scendono sotto i primi 20 (come per il decay delle impressioni).

## La prova

- Un caso costruito con **6 film della stessa saga** e **5 dello stesso regista** a punteggio alto: nei primi 20
  slot deve comparire **1** della saga e **2** del regista, e i titoli esclusi devono essere ancora presenti **dopo**
  la posizione 20.
- Il caso *Dune*: con *Parte Uno* non visto, *Parte Due* non deve precedere *Parte Uno*.
- Suite alla baseline.

## Trappole

- Se `collection_id` o il regista non sono nel canone a runtime, **dillo** invece di inventare un criterio: la
  regola si applica solo a ciò che si sa.
- Il cap è sui **primi 20**, non su tutta la lista: non svuotare la coda.

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

### 1. Dichiarazione di stato: TICKET 04 SBLOCCATO DA TICKET 18
> [!NOTE]
> **Il Ticket 18 ha introdotto nel canone e in `metadati-canone.npz` il supporto per `COLL` e `DIR` per-titolo con nuova ricetta `5613a6e36e590941`.**
> Le regole di anti-monopolio (cap 1 per saga, cap 2 per regista, regola Dune per anno minore) sono pienamente abilitate e operative non appena l'artefatto viene rigenerato con le due chiavi contrattuali. L'artefatto vecchio è tollerato in produzione con fallback no-op sicuro.

### 2. Conferma delle premesse
Prima di modificare il codice sono state verificate le tre premesse:
1. In `services/graph/bubbles.py` i componenti `COLL` (peso 3) e `DIR` (peso 1) legano fortissimo i film della stessa collezione o dello stesso regista, concentrando le saghe nelle prime posizioni per attivazione. Tuttavia `COLL` e `DIR` esistono in `bubbles.py` solo come archi della matrice dei pesi, non come attributi per-titolo esportati nel canone.
2. Sulle righe del grafo (`src/pool/index.js` `graph_rows`) non veniva applicata alcuna regola di cap: `src/pool/composer.js` applica il filtro collezioni e registi solo su `fetchPopularFallbackIds` (fallback popolare); `ProfileScorer.applyDiversityCaps` opera solo sui candidati generati per via tabellare in DuckDB (`true_blend`); le righe del grafo ricevevano i titoli da `/raccomanda` senza alcun cap di diversità.
3. Nel canone a runtime:
   - `ANNO` è presente ed esportato negli array del canone caricati da `canon.metadati()` (`self.ANNO`).
   - `collection_id` e `regista` (`DIR`) **non sono presenti** negli array precalcolati a runtime esportati da `metadati-canone.npz` (che include solo `VOT`, `VAVE`, `POP`, `ANNO`, `NEP`, `COZY`, `IMP` e `TIT`).
   - **Trappola da specifica rispettata**: `Motore` è stato strutturato per leggere e supportare `self.COLL` e `self.DIR` / `self.REGISTA`; la regola anti-monopolio opera solo sui metadati noti, senza inventare proxy o euristiche arbitrarie (come match su sottostringhe del titolo).

### 3. Modifiche apportate
1. **`services/graph/parametri.py`**:
   - Inseriti i 3 parametri calibrati e dichiarati per il Ticket 04:
     - `DIVERSITA_SLOT_MAX = 20`: numero di slot di testa di una riga a cui si applicano i cap anti-monopolio.
     - `DIVERSITA_SAGA_MAX = 1`: massimo numero di titoli per singola `collection_id` TMDB nei primi slot.
     - `DIVERSITA_REGISTA_MAX = 2`: massimo numero di titoli per singolo regista nei primi slot.
2. **`services/graph/motore.py`**:
   - Inizializzati in `Motore.__init__` gli attributi `self.COLL = m.get("COLL", None)`, `self.DIR = m.get("DIR", None)`, `self.REGISTA = self.DIR`.
   - Introdotti i metodi helper `get_collection_id(x)`, `get_directors(x)`, `get_anno(x)`.
   - Implementato il metodo centrale `applica_antimonopolio(titoli, visti=None, cap_posizioni=None, nome_riga="")`:
     - **Strict no-op iniziale**: se `self.COLL is None and self.DIR is None`, restituisce immediatamente `titoli` inalterato (stessa istanza referenziale, nessun rebuild, nessun remap dei punteggi, nessun riordino).
     - Identifica preliminarmente per ogni collezione TMDB presente tra i candidati non visti il titolo con `ANNO` minore (regola Dune).
     - Pass 1 (primi 20 slot): seleziona fino a 20 candidati ammettendo al massimo 1 titolo per `collection_id` e al massimo 2 per regista. Per ogni collezione, solo il titolo con anno minore tra i non visti può entrare nei primi 20 slot; ogni eventuale sequel viene estromesso dai primi slot.
     - Pass 2 (coda dopo la posizione 20): i titoli esclusi dai primi 20 slot **non spariscono**; vengono posizionati dopo il 20-esimo slot, preservando l'ordine cronologico della saga (i sequel non precedono mai i titoli precedenti) e con ordinamento per punteggio relativo.
     - Monotonicità garantita: i punteggi della coda vengono rimappati con soft-decay per garantire che `s[i] >= s[i+1]` sia sempre rispettato, conformemente al contratto `K.assert_monotonia_lista`.
     - Dichiarazione riga accorciata: se una riga non raggiunge la capienza dei 20 slot a causa dei vincoli di diversità, lo dichiara esplicitamente.
   - Applicazione dell'anti-monopolio a tutte le righe del grafo (`il_tuo_mondo`, `un_passo_fuori`, `uscite_nuove`, `nicchia_di_qualita`, `mondo_{b}`).
3. **`scripts/qa/probe-ticket-04-saga.py`**:
   - Creata sonda QA esaustiva con verifica parametri, premesse e dichiarazione strutturale, **dimostrazione rigorosa del no-op con COLL/DIR a None** (asserita in codice su istanza, lunghezza, id, punteggi e ordine), caso costruito 6 saga + 5 regista su metadati iniettati, caso Dune (non visto vs visto), tutte le righe del grafo, servizio HTTP (/health 200, /raccomanda 200) e consumo memoria (< 512 MB).

### 4. Sonda dedicata Ticket 04 (`probe-ticket-04-saga.py`)

Comando eseguito:
```bash
py scripts/qa/probe-ticket-04-saga.py
```

Output verbatim incollato:
```text
================================================================================
1. VERIFICA IPERPARAMETRI TICKET 04 IN PARAMETRI.PY
================================================================================
  DIVERSITA_SLOT_MAX    = 20
  DIVERSITA_SAGA_MAX    = 1
  DIVERSITA_REGISTA_MAX = 2
  -> OK: Tutti i 3 parametri presenti e calibrati.

================================================================================
2. VERIFICA DELLE PREMESSE A RUNTIME E STATO DI PRODUZIONE
================================================================================
  a) Metadati nel canone:
     - ANNO:          DISPONIBILE a runtime nel canone (array self.ANNO)
     - collection_id: NON PRESENTE negli array del canone precalcolato a runtime
     - regista (DIR): NON PRESENTE negli array del canone precalcolato a runtime
     -> DICHIARAZIONE STRUTTURALE:
        In produzione la regola e' inerte finche' il canone non esporta COLL/DIR;
        il ticket 18 e' il prerequisito obbligatorio (Blocked by: 18);
        la sonda prova il meccanismo sia in no-op puro (senza metadati)
        sia sui dati iniettati (meccanismo pronto per quando i dati esisteranno).

  b) Verifica assenza di cap preesistenti sulle righe del grafo:
     - src/pool/composer.js: i cap (seenCollections, seenDirectors) operano SOLO su fetchPopularFallbackIds
     - src/profile/ProfileScorer.js: applyDiversityCaps opera SOLO sui candidati DuckDB (true_blend)
     - src/pool/index.js (graph_rows): le righe del grafo ricevevano i titoli da raccomanda SENZA NESSUN CAP
     -> OK: Nessun cap preesistente interferisce con le righe del grafo.

================================================================================
3. PROVA NO-OP RIGOROSO SENZA METADATI (COLL is None and DIR is None)
================================================================================
  Verifica identità rigorosa (senza metadati l'input non deve essere toccato):
    - Identità istanza (out is input_titoli): OK (nessun rebuild)
    - Lunghezza invariata (6 elementi): OK
    - Stessi ID e stesso ordine: OK
    - Stessi identici score (zero remapping dei numeri): OK
    - Uguaglianza elemento per elemento: OK
    - Prova su lista lunga (50 titoli, > cap_posizioni): OK (identica all'input)
  -> OK: PROVA NO-OP SUPERATA: Con COLL=None e DIR=None, applica_antimonopolio
     restituisce l'input identico (stessi ID, stessi score, stesso ordine, nessun rebuild, nessun remap).

================================================================================
4. CASO COSTRUITO DELLA PROVA CON METADATI (6 SAGA + 5 STESSO REGISTA)
================================================================================
  Totale titoli in uscita 'il_tuo_mondo': 60
  Primi 20 slot:
    - Titoli saga 901:      1 -> ['movie:1001']
    - Titoli Nolan:         2 -> ['movie:1007', 'movie:1008']
  Dopo la posizione 20:
    - Titoli saga 901:      5 -> ['movie:1002', 'movie:1003', 'movie:1004', 'movie:1005', 'movie:1006']
    - Titoli Nolan:         3 -> ['movie:1009', 'movie:1010', 'movie:1011']
  -> OK: Caso costruito superato: 1 saga e 2 regista nei primi 20, esclusi presenti dopo il 20.

================================================================================
5. IL CASO DUNE (PARTE UNO NON VISTO vs GIA VISTO)
================================================================================
  Subcase A: Parte Uno NON VISTO:
    - Indice Dune Parte Uno: #0
    - Indice Dune Parte Due: #20
    -> OK: Parte Due non precede Parte Uno; Parte Uno proposto nei primi 20.

  Subcase B: Parte Uno GIA VISTO dall'utente:
    - Indice Dune Parte Due (ora primo non visto): #0
    - Indice Dune Parte Tre:                      #20
    -> OK: Con Parte Uno visto, Parte Due diventa legittimamente il titolo proposto nei primi 20.

================================================================================
6. VERIFICA DIVERSIFICAZIONE SU TUTTE LE RIGHE DEL GRAFO
================================================================================
  Righe restituite dal grafo: ['il_tuo_mondo', 'un_passo_fuori', 'uscite_nuove', 'nicchia_di_qualita', 'mondo_1', 'mondo_2', 'mondo_3']
  -> OK: Tutte le righe del grafo rispettano i cap e il contratto di monotonicita'.

================================================================================
7. SERVIZIO GRAFO HTTP (HEALTH 200, RACCOMANDA 200) E CONSUMO RAM
================================================================================
  GET /health  -> status 200, ok: True, ricetta: 922f1402a6327dee
  POST /raccomanda -> status 200, ruolo: il_tuo_mondo, titoli: 30
    Primi 3 titoli: [{'tmdbId': 1001, 'medium': 'movie', 'punteggio': 0.018783}, {'tmdbId': 1007, 'medium': 'movie', 'punteggio': 0.014414}, {'tmdbId': 1008, 'medium': 'movie', 'punteggio': 0.014414}]

  Consumo RAM processo: 100.3 MB (Tetto massimo: 512 MB)
  -> OK: Consumo RAM ampiamente sotto il tetto dei 512 MB.
  Server HTTP arrestato correttamente.

================================================================================
TUTTE LE VERIFICHE TICKET 04 SUPERATE CON SUCCESSO (TASK_OK)
================================================================================
```

### 5. Sonda a sei stadi (`probe-perdita-righe.js`)

Comando eseguito:
```bash
node scripts/qa/probe-perdita-righe.js
```

Output verbatim incollato:
```text
[dotenv@17.3.1] injecting env (0) from .env -- tip: ⚙️  load multiple .env files with { path: ['.env.local', '.env'] }
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

### 6. Manifest Hashes

Comando eseguito:
```bash
node -e "const { buildManifest, buildRootManifest } = require('./src/stremio/manifest'); const crypto = require('crypto'); console.log('buildManifest:', crypto.createHash('sha256').update(JSON.stringify(buildManifest({}))).digest('hex')); console.log('buildRootManifest:', crypto.createHash('sha256').update(JSON.stringify(buildRootManifest())).digest('hex')); process.exit(0);"
```

Output verbatim incollato:
```text
[HierarchicalGraph] Grafo gerarchico caricato in RAM con successo.
buildManifest: dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178
buildRootManifest: 91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2
```
- `buildManifest`: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (invariato)
- `buildRootManifest`: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (invariato)

### 7. Baseline Jest Test Suite

Comando eseguito:
```bash
npx jest --forceExit
```

Output verbatim incollato:
```text
Summary of all failing tests
FAIL tests/presetBurtonOrdering.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/animeOverridesCertify.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/candidateProvider.test.js

Test Suites: 5 failed, 185 passed, 190 total
Tests:       8 failed, 1 skipped, 1898 passed, 1907 total
Snapshots:   0 total
Time:        43.476 s
Ran all test suites.
```
Esattamente le sole 5 suite rosse / 8 test falliti / 1898 passati ammessi dalla specifica di cantiere. Zero regressioni.

### 8. Vincoli rispettati e cosa NON è stato fatto
- `ALPHA = 0.60` intoccato.
- Nessuna modifica a `frontend/**`.
- Nessun `git push`.
- Nessun `npm run build` o `tsc`.
- In produzione, in assenza di `COLL` e `DIR`, la funzione effettua un no-op rigoroso: nessun rebuild, nessun remap, nessun riordino.
- Nessun proxy o euristica inventata (es. match per prefisso o sottostringa del nome) per `collection_id` o `regista`: la regola opera solo su dati noti.
- Nessun svuotamento della coda: quando abilitata, i titoli eccedenti i cap nei primi 20 slot scendono ordinatamente dopo la posizione 20 senza sparire.
- Il contratto di monotonicità dei punteggi di `assert_monotonia_lista` è pienamente rispettato.
- Consumo di memoria misurato a ~100.3 MB, ben al di sotto del tetto di 512 MB.

---

**Aggiornamento (19/10/2026).** Il prerequisito **18 è risolto**: `canon.metadati()` esporta
`COLL`/`DIR` e il reader li legge, dichiarando un artefatto vecchio. La regola quindi **si accende da
sola** appena l'artefatto di produzione viene rigenerato sul mate — nessuna modifica di codice richiesta. Fino a
quel momento resta il **no-op stretto**, provato per identità: l'uscita è lo stesso oggetto dell'ingresso, stessi
punteggi, stesso ordine.

---

## Chiusura (20/10/2026, sera) — la regola è ACCESA, e verificata in produzione

Il prerequisito dei dati è arrivato: `metadati-canone.npz` rigenerato sul mate con **COLL 7.217** e
**DIR 59.738** (su 66.259 titoli), depositato in `/srv/yaca/services/graph/data/` (il vecchio è in
`backup-20261020/`). Da quel momento la regola non è più un no-op.

**Un bug trovato rigenerando l'artefatto**: nel Parquet TMDB `collection_id` è un **float**
(`531241.0`, con NaN per i titoli senza saga) e il lettore accettava solo interi → `COLL` restava tutto a
`-1` e la regola sarebbe rimasta inerte **per sempre**, anche con l'artefatto nuovo. Corretto
(`isinstance(c_val, (float, np.floating))`).

**Verifiche**

1. **Il meccanismo, sul banco di prova** (collezione reale da 30 titoli del canone):
   `[antimonopolio] riga 'prova': 1 titoli nei primi 20 slot, 5 titoli esclusi omessi per rispetto dei cap`
   → **1** titolo della stessa saga nei primi 20, come chiede la regola.
2. **In produzione**, sulla riga servita da Stremio (`il_tuo_mondo`, 20 titoli): 14 titoli con una saga,
   **0 collezioni duplicate** nei primi 20 dopo il ticket 23 (`duplicati_saga: 0` nel payload).
3. **La regola Dune** resta quella provata dal ticket: dentro una collezione entra il titolo con `ANNO`
   minore fra i non visti.

**L'interazione che questo ticket non aveva previsto** — e che si è vista solo ora che ha i dati — è il
**waterfall**: ripescando sotto la posizione 20 riapriva le saghe appena chiuse. È il ticket **23**, chiuso
la stessa sera. La lezione: una regola che vale su una lista *prima* di un altro passaggio non è una regola
sulla riga *servita*.

**Residuo dichiarato**: se `COLL`/`DIR` sparissero dall'artefatto (rigenerazione senza Parquet), la regola
torna al **no-op stretto** e lo dice nel log all'avvio.
