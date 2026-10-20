Status: resolved
Type: task
Blocked by: 02

# 03 — "Il tuo mondo": bacino appiattito + pavimento + score

## Verifica prima

- In `services/graph/motore.py`, `lista()` seleziona le bolle (`bolle`) e prende i titoli **bolla per bolla**
  (`titoli_di`) **senza alcun filtro di qualità o popolarità minima**, poi riordina. Se nella bolla principale sono
  finiti titoli da 10 voti, entrano.
- `diffondi()` calcola già l'attivazione esatta `r` per **ogni** titolo del canone (66.259).
- `deduci()` calcola già `canone = median(voti)` della storia utente.
- Esistono `VOT` (numero voti), `VAVE` (media voto), `POP` (popolarità) e `VICINI` (adiacenza fra bolle).

## Cosa deve uscire

1. **Bacino appiattito** per `il_tuo_mondo`: invece di iterare bolla per bolla, si prende un **set unico** composto
   dalle prime *K* bolle accese (fino a coprire **≥80% della massa**, con un **minimo di 250–300 candidati
   grezzi**) **più** i membri dei primi **2–3 `VICINI`** di ciascuna.
2. **Pavimento di qualità** applicato **prima** del ranking, come maschera vettoriale:
   scarta `VAVE < 6.4` **oppure** `VOT < max(150, 0.08 * canone)`.
3. **Ranking combinato**: `score(x) = r[x] * (bayesian_vote(x) / 7.0) ** 1.5`. Mai `r[x]` puro.
4. **Nessun cambiamento al contratto**: le altre liste restano come sono in questo ticket.

## La prova

- Una sonda o un test che, sullo stesso profilo, mostri **prima/dopo**: quanti candidati nel bacino, quanti
  scartati dal pavimento, e i primi 10 titoli con il loro `VOT` / `VAVE` (devono essere tutti sopra il pavimento).
- Un caso costruito a mano in cui un titolo **con altissima attivazione e 8 voti** stia **sotto** un titolo con
  attivazione minore ma voto solido: con il ranking combinato il secondo deve venire prima.
- Suite alla baseline.

## Trappole

- **Il pavimento è adattivo**: `0.08 * canone` dipende dal profilo. Un profilo mainstream e uno d'essai devono
  ricevere soglie diverse — provalo, non darlo per buono.
- La maschera va applicata **prima** del taglio `[:cap]`: filtrare dopo significa restituire meno di `cap` titoli.
- Non allargare il bacino oltre il necessario: il costo è memoria e latenza, e il tetto di RAM del servizio è 512 MB.

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
Prima di modificare il codice sono state verificate le quattro premesse:
1. In `services/graph/motore.py`, `lista()` selezionava le bolle con `quante = int(slider.get("largo", 4))` e prendeva i titoli con `titoli_di` iterando bolla per bolla senza alcun pavimento minimo su `VAVE` o `VOT`, permettendo l'ingresso di titoli con voti arbitrariamente bassi (es. 8 o 10 voti) o voti mediocri.
2. `diffondi()` calcola già l'attivazione esatta `r` per tutti i 66.259 nodi del canone via `C.ppr` / `C.diffondi`.
3. `deduci()` calcola `canone = float(np.median(voti))` della storia utente.
4. Gli array `VOT`, `VAVE`, `POP` e la lista di adiacenza ordinata `VICINI` sono presenti e istanziati in `Motore`.

### 2. Modifiche apportate
1. **`services/graph/parametri.py`**:
   - Inseriti i 10 parametri calibrati e dichiarati per il Ticket 03:
     - `IL_TUO_MONDO_MASSA_TARGET = 0.80`: quota minima di massa accumulata per le prime K bolle accese.
     - `IL_TUO_MONDO_MIN_CANDIDATI = 250`: minimo candidati grezzi non visti prima di chiudere la selezione delle bolle K.
     - `IL_TUO_MONDO_VICINI_PER_BOLLA = 3`: numero di vicini per ciascuna delle K bolle accese.
     - `PAVIMENTO_VAVE_MIN = 6.4`: voto medio minimo TMDB richiesto.
     - `PAVIMENTO_VOT_MIN = 150`: soglia minima assoluta di valutazioni TMDB.
     - `PAVIMENTO_VOT_FATTORE_CANONE = 0.08`: moltiplicatore adattivo della mediana voti della storia utente (`max(150, 0.08 * canone)`).
     - `BAYESIAN_M = 300.0`, `BAYESIAN_C = 6.5`: parametri IMDb per il voto bayesiano (allineati a `src/config.js`).
     - `RANKING_BAYES_BASE = 7.0`, `RANKING_BAYES_EXP = 1.5`: formula di ranking combinato `score = r * (bayes / 7.0) ** 1.5`.
2. **`services/graph/motore.py`**:
   - Aggiunto metodo `voto_bayesiano(x)` a `Motore`.
   - Invocazione diretta di `self.voto_bayesiano(...)` in entrambi i siti di ranking (`cand_sopravvissuti` e `ripescati_mondo`), eliminando la duplicazione inline della formula (Fix 1).
   - Riscritto il bacino di «il tuo mondo»: selezione delle top K bolle per massa accesa (>= 80% e >= 250 candidati grezzi) unite ai loro primi 3 vicini (`bacino_bolle_set`).
   - Raccolta dei candidati in un unico set appiattito (`cand_bacino`), eliminando l'iterazione bolla per bolla e le relative duplicazioni.
   - Pavimento di qualità applicato a monte del ranking come maschera vettoriale: scartati `VAVE < 6.4` o `VOT < max(150, 0.08 * canone)`.
   - Ranking combinato `score(x) = r[x] * (bayesian_vote(x) / 7.0) ** 1.5` per tutti i candidati sopravvissuti e per i semi ripescati dalla watchlist.
   - Integrazione col ripescaggio controllato Ticket 02: i ripescati ricevono lo score combinato e si ordinano monotonicamente in testa.
   - Aggiornato il commento obsoleto sui mondi accesi (Fix 3): la selezione delle bolle alimenta esclusivamente le liste successive (`uscite_nuove`, `cinema_invisibile`).
3. **`scripts/qa/probe-ticket-03-mondo.py`**:
   - Creata sonda QA esaustiva con verifica parametri, floor adattivo mainstream vs essai, confronto diretto prima/dopo, caso costruito a 8 voti, maschera prima del cap e servizio HTTP/RAM.
   - Nella sezione 4, rimossi i valori hard-coded `7.0`, `1.5`, `150`, `6.4` e sostituiti con le costanti simboliche `P.RANKING_BAYES_BASE`, `P.RANKING_BAYES_EXP`, `P.PAVIMENTO_VOT_MIN`, `P.PAVIMENTO_VAVE_MIN` (Fix 2).

### 3. Sonda dedicata Ticket 03 (`probe-ticket-03-mondo.py`)

Comando eseguito:
```bash
py scripts/qa/probe-ticket-03-mondo.py
```

Output verbatim incollato:
```text
================================================================================
1. VERIFICA IPERPARAMETRI TICKET 03 IN PARAMETRI.PY
================================================================================
  IL_TUO_MONDO_MASSA_TARGET     = 0.8
  IL_TUO_MONDO_MIN_CANDIDATI    = 250
  IL_TUO_MONDO_VICINI_PER_BOLLA = 3
  PAVIMENTO_VAVE_MIN            = 6.4
  PAVIMENTO_VOT_MIN             = 150
  PAVIMENTO_VOT_FATTORE_CANONE  = 0.08
  BAYESIAN_M                    = 300.0
  BAYESIAN_C                    = 6.5
  RANKING_BAYES_BASE            = 7.0
  RANKING_BAYES_EXP             = 1.5
  -> OK: Tutti i 10 parametri presenti e calibrati.

================================================================================
2. TRAPPOLA FLOOR ADATTIVO: MAINSTREAM VS D'ESSAI
================================================================================
  Profilo Mainstream: canone = 12500 voti -> Soglia VOT = max(150, 0.08 * 12500) = 1000.0 voti
  Profilo D'Essai:    canone = 500 voti -> Soglia VOT = max(150, 0.08 * 500) = 150.0 voti
  Titolo 'movie:1010' (VOT = 400):
    - In Mainstream: SCARTATO (corretto: 400 < 1000)
    - In D'Essai:    PRESENTE (corretto: 400 >= 150)
  -> OK: Il pavimento si adatta matematicamente alla storia e impedisce la degenerazione.

================================================================================
3. CONFRONTO PRIMA vs DOPO SULLO STESSO PROFILO
================================================================================
BACINO APPIATTITO:
  - Dimensione bacino grezzo non visti : 349 titoli (>= 250-300 attesi)
  - Scartati dal pavimento di qualita' : 5 titoli
      * per VAVE < 6.4           : 2 titoli
      * per VOT  < 150          : 3 titoli
  - Sopravvissuti al pavimento         : 344 titoli

PRIMA DEL FIX (Bolla per bolla, NO floor, r puro):
Pos  Titolo       VOT      VAVE     r grezzo   Anomalia riscontrata
-----------------------------------------------------------------
#1   movie:1001   1200     7.2      0.02174    
#2   movie:1002   1200     7.2      0.01719    
#3   movie:1003   1200     7.2      0.01673    
#4   movie:1004   1200     7.2      0.01669    
#5   movie:1005   8        8.5      0.01668    INTRUSO! Solo 8 voti!
#6   movie:1006   15       8.2      0.01668    INTRUSO! Solo 15 voti!
#7   movie:1007   45       7.9      0.01668    INTRUSO! Solo 45 voti!
#8   movie:1008   2500     5.6      0.01668    INTRUSO! Voto mediocre (5.6)!
#9   movie:1009   1800     6.1      0.01668    INTRUSO! Voto mediocre (6.1)!
#10  movie:1010   5000     8.4      0.01668    

DOPO IL FIX (Bacino appiattito, Maschera pavimento, Ranking combinato):
Pos  Titolo       VOT      VAVE     Bayes    Score Combinato  Stato Pavimento
---------------------------------------------------------------------------
#1   movie:1001   1200     7.2      7.06     0.022019         OK (VOT >= 150, VAVE >= 6.4)
#2   movie:1010   5000     8.4      8.29     0.021511         OK (VOT >= 150, VAVE >= 6.4)
#3   movie:1011   4200     8.1      7.99     0.020357         OK (VOT >= 150, VAVE >= 6.4)
#4   movie:1012   3100     7.8      7.69     0.019192         OK (VOT >= 150, VAVE >= 6.4)
#5   movie:1002   1200     7.2      7.06     0.017415         OK (VOT >= 150, VAVE >= 6.4)
#6   movie:1003   1200     7.2      7.06     0.016950         OK (VOT >= 150, VAVE >= 6.4)
#7   movie:1004   1200     7.2      7.06     0.016903         OK (VOT >= 150, VAVE >= 6.4)
#8   movie:1013   1200     7.2      7.06     0.016898         OK (VOT >= 150, VAVE >= 6.4)
#9   movie:1014   1200     7.2      7.06     0.016898         OK (VOT >= 150, VAVE >= 6.4)
#10  movie:1015   1200     7.2      7.06     0.016898         OK (VOT >= 150, VAVE >= 6.4)

  -> OK: Tutti i primi 10 titoli in uscita superano rigorosamente il pavimento di qualita'.

================================================================================
4. CASO COSTRUITO A MANO: ALTA ATTIVAZIONE + 8 VOTI vs ATTIVAZIONE MINORE + VOTO SOLIDO
================================================================================
  Ranking puro r[x]:
    - Titolo A (movie:1001, VOT=8):    r = 0.2200
    - Titolo B (movie:1002, VOT=3000): r = 0.1800
    => Nel ranking puro il Titolo A scavalca ingiustamente il Titolo B.

  Ranking combinato score = r * (bayes / 7.0) ** 1.5:
    - Titolo A: bayes = 6.518 -> score = 0.19768 (penalizzato dalla formula bayesiana)
    - Titolo B: bayes = 8.227 -> score = 0.22936 (premiato per qualita' solida)
    => OK: Nel ranking combinato il Titolo B scavalca il Titolo A!

  Pavimento di Qualita' (VOT >= 150, VAVE >= 6.4):
    - Titolo A: VOT = 8 -> Supera pavimento: False (ELIMINATO)
    - Titolo B: VOT = 3000 -> Supera pavimento: True (QUALIFICATO)
    => OK: Titolo A con 8 voti viene totalmente estromesso a monte dal pavimento.

================================================================================
5. VERIFICA MASCHERA PRIMA DEL TAGLIO [:CAP]
================================================================================
  Cap richiesto: 10
  Titoli restituiti in 'il_tuo_mondo': 10
  -> OK: La riga e' piena (cap 10) e tutti i titoli rispettano il pavimento.

================================================================================
6. SERVIZIO GRAFO HTTP (HEALTH 200, RACCOMANDA 200) E CONSUMO RAM
================================================================================
  GET /health  -> status 200, ok: True, ricetta: 7d10b3b543f45f76
  POST /raccomanda -> status 200, ruolo: il_tuo_mondo, titoli: 10
    Primi 3 titoli: [{'tmdbId': 1001, 'medium': 'movie', 'punteggio': 0.022019}, {'tmdbId': 1002, 'medium': 'movie', 'punteggio': 0.017415}, {'tmdbId': 1003, 'medium': 'movie', 'punteggio': 0.01695}]

  Consumo RAM processo: 100.7 MB (Tetto massimo: 512 MB)
  -> OK: Consumo RAM ampiamente sotto il tetto dei 512 MB.
  Server HTTP arrestato correttamente.

================================================================================
TUTTE LE VERIFICHE TICKET 03 SUPERATE CON SUCCESSO (TASK_OK)
================================================================================
```

### 4. Sonda regressione Ticket 02 (`probe-ticket-02-watchlist.py`)

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
   Primi 3 titoli di 'il_tuo_mondo': [{'tmdbId': 103, 'medium': 'movie', 'punteggio': 0.197899}, {'tmdbId': 113, 'medium': 'movie', 'punteggio': 0.072018}, {'tmdbId': 114, 'medium': 'movie', 'punteggio': 0.019205}]
2. GET /health -> status 200, ok: True, ricetta: 7d10b3b543f45f76
3. POST /raccomanda -> status 200, liste: 3, primo titolo ripescato: tmdbId=103, score=0.197899
4. Server HTTP del grafo arrestato correttamente.

================================================================================
TUTTE LE VERIFICHE SUPERATE CON SUCCESSO (TASK_OK)
================================================================================
```

### 5. Sonda perdita righe sei stadi (`probe-perdita-righe.js --fixture`)

Comando eseguito:
```bash
node scripts/qa/probe-perdita-righe.js --fixture
```

Output verbatim incollato:
```text
[dotenv@17.3.1] injecting env (0) from .env -- tip: 🔐 prevent building .env in docker: https://dotenvx.com/prebuild
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
FAIL tests/animeOverridesCertify.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/duckDbAndMatchmaker.test.js

Test Suites: 5 failed, 185 passed, 190 total
Tests:       8 failed, 1 skipped, 1898 passed, 1907 total
Snapshots:   0 total
Time:        43.402 s
Ran all test suites.
```
Esattamente le sole 5 suite rosse / 8 test falliti / 1898 passati ammessi dalla specifica di cantiere. Zero regressioni.

### 8. Vincoli rispettati e cosa NON è stato fatto
- `ALPHA = 0.60` rigorosamente intoccato.
- Nessuna modifica a `frontend/**`.
- Nessun `git push`.
- Nessun `npm run build` o `tsc`.
- Nessun abbassamento del pavimento di qualità per riempire la riga.
- Nessun cambiamento al contratto JSON delle liste o delle altre righe (`un_passo_fuori`, `uscite_nuove`, `nicchia_di_qualita`, `mondo_{b}`).
- Consumo di memoria misurato a ~100 MB, ben al di sotto del tetto di 512 MB.
