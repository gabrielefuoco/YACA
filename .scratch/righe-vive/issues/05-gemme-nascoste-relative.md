Status: ready-for-agent
Type: task
Blocked by: 04

# 05 — "Gemme nascoste nel tuo mondo": nicchia **relativa**

## Verifica prima

- In `motore.py` la nicchia usa **due tagli statici uguali per tutti**: `POP[x] <= 20.0` e `VAVE[x] >= 7.0`.
- Ordina per `-(VAVE[x] + bonus_liste)`, **buttando via `r[x]`**: cioè il titolo più vicino al profilo non ha alcun
  vantaggio rispetto a uno lontano ma con voto alto.
- `deduci()` calcola già `canone = median(voti)` della storia utente e `VOTMED` per bolla.

## Cosa deve uscire

1. **Bacino**: lo stesso allargato di `il_tuo_mondo` (ticket 03).
2. **Tetto relativo di notorietà**: `VOT[x] <= min(0.35 * V_mondo, 2500)`, dove `V_mondo` è la **mediana dei voti
   del bacino acceso**, pesata per `att_s[b]`. E `POP[x]` sotto il **50° percentile** del bacino.
   (Per chi guarda blockbuster, 1.200 voti sono già "nicchia"; per chi guarda indie, no.)
3. **Pavimento assoluto**: `VOT[x] >= 40` — esistono film con 3 voti e media 9.0.
4. **Voto normalizzato sulla bolla**: `mu_b` = media voto della bolla; tiene `VAVE[x] - mu_b >= +0.4` **e**
   `VAVE[x] >= 6.8`.
5. **Ordine**: `r[x] * (VAVE[x] - mu_b + 1.0) * (1 + 0.15 * (LISTDEG[x] > 0))`.

## La prova

- Due profili **opposti** (uno mainstream, uno d'essai) sui stessi dati: la soglia di notorietà che ne esce deve
  essere **diversa**, e le due righe non devono coincidere. Questo è il cuore della ticket: se le due righe
  coincidono, la soglia non è relativa.
- Un titolo con `VOT` altissimo ma `r[x]` basso **non** deve entrare; un titolo con `r[x]` alto e `VOT` nel tetto sì.
- Suite alla baseline.

## Trappole

- Il "tuo mondo" di un profilo d'essai ha già voti bassi: **non** riusare `0.35 * V_mondo` senza il tetto assoluto
  di 2.500, o si apre a tutto.
- I voti delle **serie** su TMDB sono gonfiati di `0.3 rispetto ai film: se applichi la stessa soglia ai due
  medium, le serie vincono sempre.

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

### 1. Conferma delle premesse
Prima di modificare il codice sono state verificate ed eseguite le tre premesse di "Verifica prima":
1. In `services/graph/motore.py`, la riga `nicchia_di_qualita` applicava tagli statici universali `POP[x] <= 20.0` e `VAVE[x] >= 7.0` identici per qualsiasi profilo utente.
2. L'ordinamento era `-(VAVE[x] + bonus_liste)`, scartando completamente l'attivazione `r[x]` calcolata dalla diffusione: un titolo tematicamente lontanissimo ma con voto medio alto scavalcava qualsiasi gemma vicina ai gusti dell'utente.
3. `deduci()` calcola già `canone = median(voti)` della storia utente e `self.VOTMED` per ciascuna bolla, ora riutilizzati per il calcolo pesato di `V_mondo`.

### 2. Modifiche apportate
1. **`services/graph/parametri.py`**:
   - Registrati in `SCHEDA` i 10 parametri calibrati per la nicchia relativa (Ticket 05):
     - `NICCHIA_FATTORE_V_MONDO = 0.35`: fattore moltiplicativo per il tetto relativo dei voti (`0.35 * V_mondo`).
     - `NICCHIA_TETTO_VOT_MAX = 2500`: tetto massimo assoluto per i voti nella nicchia (evita che per profili blockbuster la nicchia degeneri in film mainstream).
     - `NICCHIA_POP_PERCENTILE = 50.0`: percentile massimo di popolarità ammesso nel bacino (50° percentile).
     - `NICCHIA_PAVIMENTO_VOT_MIN = 40`: pavimento assoluto di voti TMDB (elimina opere con 3 voti e media 9.0).
     - `NICCHIA_DELTA_VAVE_MU = 0.4`: distacco minimo richiesto dal voto medio della bolla (`VAVE[x] - mu_b >= +0.4`).
     - `NICCHIA_VAVE_MIN_FILM = 6.8`: voto medio minimo TMDB per film.
     - `NICCHIA_SERIE_OFFSET_VOTO = 0.3`: offset sistematico dei voti TMDB delle serie rispetto ai film.
     - `NICCHIA_VAVE_MIN_SERIE = 7.1`: voto medio minimo TMDB per serie tv (`6.8 + 0.3 = 7.1`), neutralizzando l'inflazione strutturale di TMDB.
     - `NICCHIA_BONUS_LISTE = 0.15`: bonus moltiplicativo per presenza nelle liste Trakt (`1 + 0.15 * (LISTDEG > 0)`).
     - `NICCHIA_V_MONDO_FALLBACK = 1000.0`: fallback sicuro di `V_mondo` per bacini privi di peso.
   - Nuova impronta ricetta: `ddf8214965a0bbf3`.

2. **`services/graph/motore.py`**:
   - In `Motore.__init__`: precalcolata la media voti `self.VAVEMEAN` per ogni bolla (escludendo i titoli privi di voto `VAVE <= 0`).
   - Aggiunti i metodi helper `media_voto_bolla(b)` e `calcola_v_mondo(bolle_set, att_s)` per la mediana pesata del bacino acceso:
     `V_mondo` è calcolato ordinando i voti mediani delle bolle del bacino e individuando il valore al 50% della massa cumulativa di attivazione `att_s[b]`.
   - Riscritto il blocco di `nicchia_di_qualita`:
     - Riuso diretto del bacino appiattito `cand_bacino` e `bacino_bolle_set` del Ticket 03 (nessuna duplicazione logica).
     - Tetto relativo di notorietà: `VOT[x] <= min(0.35 * V_mondo, 2500)` e `POP[x] <= percentile(POP, 50)`.
     - Pavimento assoluto: `VOT[x] >= 40`.
     - Normalizzazione di qualità sulla bolla: `VAVE[x] - mu_b >= 0.4` con pavimento assoluto `VAVE >= 6.8` (film) e `VAVE >= 7.1` (serie tv).
     - Ranking combinato: `score(x) = r[x] * (VAVE[x] - mu_b + 1.0) * (1 + 0.15 * (LISTDEG[x] > 0))`.
     - Contratto di monotonicità esteso a tutte le liste: rimossa l'esenzione di `nicchia_di_qualita`, che ora esporta il punteggio relativo combinato rigorosamente monotono decrescente.

3. **`scripts/qa/probe-ticket-05-gemme.py`**:
   - Creata sonda QA esaustiva con verifica parametri, confronto diretto Mainstream vs D'Essai su stessi dati, filtri selettivi, formula ranking + bonus liste, trappola cap 2500, trappola serie tv e server HTTP/RAM.

### 3. Sonda dedicata Ticket 05 (`probe-ticket-05-gemme.py`)

Comando eseguito:
```bash
py scripts/qa/probe-ticket-05-gemme.py
```

Output verbatim incollato:
```text
================================================================================
1. VERIFICA IPERPARAMETRI TICKET 05 IN PARAMETRI.PY
================================================================================
  NICCHIA_FATTORE_V_MONDO    = 0.35
  NICCHIA_TETTO_VOT_MAX      = 2500
  NICCHIA_POP_PERCENTILE     = 50.0
  NICCHIA_PAVIMENTO_VOT_MIN  = 40
  NICCHIA_DELTA_VAVE_MU      = 0.4
  NICCHIA_VAVE_MIN_FILM      = 6.8
  NICCHIA_SERIE_OFFSET_VOTO  = 0.3
  NICCHIA_VAVE_MIN_SERIE     = 7.1
  NICCHIA_BONUS_LISTE        = 0.15
  NICCHIA_V_MONDO_FALLBACK   = 1000.0
  -> OK: Tutti i 10 parametri presenti e calibrati.

================================================================================
2. LA PROVA CHE CONTA PIU' DI TUTTE: DUE PROFILI OPPOSTI SUI STESSI DATI
================================================================================
CONFRONTO SOGLIE DI NOTORIETÀ:
  Parametro                      Profilo Mainstream     Profilo D'Essai       
  --------------------------------------------------------------------------
  V_mondo (mediana pesata bacino) 7250.0                 290.0                 
  Tetto voti min(0.35*V, 2500)   2500.0                 101.5                 
  Soglia popolarità p50          92.5                   11.0                  
  Pavimento assoluto VOT         40                     40                    
  Titoli in nicchia              1                      1                     

CONFRONTO OUTPUT 'nicchia_di_qualita':
  Primi 3 titoli Mainstream: ['movie:1010']
  Primi 3 titoli D'Essai:    ['movie:1110']
  -> OK: Le soglie divergono radicalmente e le righe NON coincidono (CUORE DELLA TICKET SUPERATO).

================================================================================
3. VERIFICA FILTRI: VOT ALTISSIMO, VOT BASSO, VAVE SU BOLLA, PAVIMENTO 40
================================================================================
  - Titolo Blockbuster (movie:1101, VOT=8000, r alto) : ESCLUSO (Corretto: VOT > tetto)
  - Titolo Gemma (movie:1102, VOT=75, VAVE=7.8)            : PRESENTE (Corretto)
  - Titolo Falso Cult (movie:1103, VOT=3, VAVE=9.0)    : ESCLUSO (Corretto: VOT < 40)
  - Titolo Mediocre (movie:1104, VAVE=6.6 < 6.8)         : ESCLUSO (Corretto: VAVE < 6.8)
  - Titolo Delta Basso (movie:1105, delta=+0.2 < 0.4) : ESCLUSO (Corretto: delta < 0.4)
  -> OK: Tutti i filtri selettivi funzionano come da specifica.

================================================================================
4. VERIFICA ORDINAMENTO r * (VAVE - mu_b + 1.0) * (1 + 0.15 * (LISTDEG > 0))
================================================================================
  Punteggi calcolati:
    - Titolo A (LISTDEG = 0)  : 0.021582794116401825
    - Titolo B (LISTDEG = 5)  : 0.024820213214099773
    - Titolo C (VAVE = 8.4)   : 0.029323170699344286
  Ratio Titolo B / Titolo A: 1.1500 (atteso: ~1.15)
  -> OK: Formula di ranking e bonus liste verificati con precisione matematica.

================================================================================
5. VERIFICA TRAPPOLE: TETTO 2500 ASSOLUTO E INFLAZIONE SERIE +0.3
================================================================================
  Trappola 1: V_mondo = 15000 -> 0.35 * V = 5250
              Tetto effettivo = min(0.35 * V, 2500) = 2500.0
  -> OK: Il tetto di 2500 protegge rigorosamente dall'apertura a tutto.

  Trappola 2: Serie tv con inflazione TMDB (~0.3):
    - Serie con VAVE = 6.95 (delta +0.45, < 7.1) : ESCLUSA (Corretto: VAVE < 7.1)
    - Serie con VAVE = 7.30 (delta +0.80, >= 7.1): PRESENTE (Corretto)
  -> OK: La soglia maggiorata per serie (7.1 vs 6.8) neutralizza l'inflazione di TMDB.

================================================================================
6. VERIFICA CONTRATTO DI MONOTONIA SU 'nicchia_di_qualita'
================================================================================
  Titoli restituiti in nicchia: 14
  Punteggi decrescenti: [0.02774, 0.02604, 0.02522, 0.02448, 0.02374] ...
  -> OK: Monotonicita' verificata e pienamente integrata nel contratto.

================================================================================
7. SERVIZIO GRAFO HTTP (HEALTH 200, RACCOMANDA 200) E CONSUMO RAM
================================================================================
  GET /health      -> status 200, ok: True, ricetta: ddf8214965a0bbf3
  POST /raccomanda -> status 200, ruolo: nicchia_di_qualita, titoli: 9
    Primi 3 titoli: [{'tmdbId': 1001, 'medium': 'movie', 'punteggio': 0.027737}, {'tmdbId': 1003, 'medium': 'movie', 'punteggio': 0.022646}, {'tmdbId': 1002, 'medium': 'movie', 'punteggio': 0.022603}]

  Consumo RAM processo: 100.9 MB (Tetto massimo: 512 MB)
  -> OK: Consumo RAM ampiamente sotto il tetto dei 512 MB.
  Server HTTP arrestato correttamente.

================================================================================
TUTTE LE VERIFICHE TICKET 05 SUPERATE CON SUCCESSO (TASK_OK)
================================================================================
```

### 4. Manifest Hashes

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

### 5. Baseline Jest Test Suite

Comando eseguito:
```bash
npx jest --forceExit
```

Output verbatim incollato:
```text
FAIL tests/presetBurtonOrdering.test.js
FAIL tests/animeOverridesCertify.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/candidateProvider.test.js

Test Suites: 5 failed, 185 passed, 190 total
Tests:       8 failed, 1 skipped, 1898 passed, 1907 total
Snapshots:   0 total
Time:        43.55 s
Ran all test suites.
```
Esattamente le sole 5 suite rosse / 8 test falliti / 1898 passati ammessi dalla specifica di cantiere. Zero regressioni.

### 6. Vincoli rispettati e cosa NON è stato fatto
- `ALPHA = 0.60` intoccato.
- Nessuna modifica a `frontend/**`.
- Nessun `git push`.
- Nessun `npm run build` o `tsc`.
- Nessun abbassamento del pavimento di qualità per riempire la riga.
- Nessuna duplicazione della logica del bacino: `cand_bacino` e `bacino_bolle_set` del Ticket 03 sono stati integralmente riutilizzati per alimentare la selezione.
- Consumo di memoria misurato a ~101 MB, ampiamente sotto il limite dei 512 MB.

## Esito (completamento finale)

### Fix applicati
1. `tetto_voti = max(NICCHIA_PAVIMENTO_VOT_MIN, min(0.35 * V_mondo, NICCHIA_TETTO_VOT_MAX))` in `services/graph/motore.py` (prima `min` solo): intervallo `[40, ceiling]` mai vuoto. Caso `V_mondo = 100`: ceiling = 40, almeno un titolo sopravvive.
2. `services/graph/servizio.py`: rimosso il silenzio `if not titoli_raw: continue`. Una lista vuota viene ora restituita con `vuota: true`, `motivo`, `totale_sopravvissuti: 0`; una lista corta dichiara `corta`, `target_dimensione`, `totale_sopravvissuti`.
3. Offset serie `NICCHIA_SERIE_OFFSET_VOTO` confermato uso (non commento) su pavimento assoluto, delta bolla e ranking (`vave_eff`).

### Ricetta
`fa5771594b2ad0c4` (probe /health).

### Manifest hashes (invariati)
- `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178`
- `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`

### Baseline Jest
FAIL tests/presetBurtonOrdering.test.js
FAIL tests/animeOverridesCertify.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/candidateProvider.test.js
Test Suites: 5 failed, 185 passed, 190 total
Tests: 8 failed, 1 skipped, 1898 passed, 1907 total

### Cosa NON è stato fatto
- Nessun abbassamento del pavimento di qualità.
- Nessuna modifica a frontend.
- Nessun push / build / tsc.
