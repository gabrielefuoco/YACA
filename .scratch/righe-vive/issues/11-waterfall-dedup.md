Status: resolved
Type: task
Blocked by: 10

# 11 — Waterfall dedup

## Verifica prima

- Le righe del grafo sono `SLUG_ADDITIVI` e **non** usano `claimedIds`: lo stesso titolo può comparire **identico**
  in più righe hero dello stesso feed. Conferma dove (in `motore.py` o in `pool/index.js`) manca l'esclusione.

## Cosa deve uscire

Un set **`gia_assegnati_globali`** costruito **in ordine di specificità**:

1. **Prima le righe a bacino stretto**: nuove uscite, gemme nascoste, classici, punti d'incontro.
2. **Poi** ultime visioni e i micro-cluster.
3. **Infine "il tuo mondo"** — che ha il bacino più grande — riempie i suoi 60–80 slot **escludendo** ciò che è già
   preso, con **al massimo una** sovrapposizione ammessa coi micro-cluster (e va scritto perché).

Risultato dichiarato: l'utente scorre la home e vede **righe con titoli diversi**, e una riga specialistica non
perde il suo titolo migliore perché "il tuo mondo" è arrivato prima.

## La prova

- Un profilo in cui lo stesso titolo (alto per attivazione, di nicchia e recente) sarebbe idoneo a **3 righe**:
  deve comparire **una volta sola**.
- Il conteggio dei doppioni per riga **prima/dopo**, misurato dalla sonda del ticket 01 (estendila se serve).
- Suite alla baseline.

## Trappole

- **L'ordine è la regola**: se "il tuo mondo" pesca per primo, il dedup non serve a niente. La specificità va
  scritta come dato (un campo della lista), non lasciata all'ordine accidentale del codice.
- Il dedup **non** deve svuotare le righe: se togliendo i doppioni una riga scende sotto la soglia minima, lo
  **dichiara**.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo.
- **Ogni riga che non si riesce a riempire lo dichiara**: nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**

---

## Esito (20/10/2026) — ogni titolo in una riga, e il migliore va a chi lo serve

### 1. La premessa, misurata

Con il fixture del cantiere (6 semi, 8 mondi), **senza** il waterfall: `37` titoli in più righe, `61` copie in
eccesso; a `cap=60` la review `spec` ha misurato `39` titoli in **4** righe (il ticket diceva 3). La premessa è
confermata e superata. Non c'era nessuna esclusione fra righe: `pool/index.js` ha `claimedIds` per le vecchie
strategie, ma `graph_rows` è additiva e non li usa.

### 2. La prova

```
$ py scripts/qa/probe-ticket-11-waterfall.py
1. LA SPECIFICITA' E' UN DATO, E L'ORDINE E' QUELLO
  tabella: {'uscite_nuove': 10, 'nicchia_di_qualita': 20, 'classici_imperdibili': 30, 'punti_incontro': 40,
            'ultime_visioni': 50, 'micro_cluster': 60, 'un_passo_fuori': 70, 'il_tuo_mondo': 80, 'mondo': 90}
  sovrapposizioni ammesse col micro-cluster: 1

2. UN TITOLO IDONEO A PIU' RIGHE: NEI POOL PRIMA, IN UNA RIGA SOLA DOPO
  senza waterfall, movie:1030 e' idoneo a 3 righe (nei pool): ['il_tuo_mondo', 'uscite_nuove', 'micro_cluster_1']

2b. IL «DOPO»: CON IL WATERFALL COMPARE UNA VOLTA SOLA
  con waterfall, movie:1030 sta in 1 righe: ['uscite_nuove']

2c. UNA RIGA CHE PERDE TUTTI I TITOLI LO DICHIARA (NON SPARISCE)
  gemma recente movie:1040: uscite=['movie:1040'] · nicchia=0 titoli, copie evitate=1,
  motivo="nicchia_di_qualita: 1 copie gia' in righe piu' specifiche, restano 0/20"

3. COPIE DOPPIE PRIMA / DOPO, MISURATE SULLE DUE RISPOSTE
  prima: 39 titoli in piu' righe (41 copie in eccesso)
  dopo : 1 titoli in piu' righe (1 copie in eccesso)
  copie evitate dichiarate dal waterfall: 78 (non e' il «prima»: conta anche i candidati)
  l'unica sovrapposizione: [('movie:1006', 2)] (il tuo mondo x micro-cluster)

4. LA SPECIFICITA' E' UN DATO, E IL PROPRIETARIO E' LA RIGA PIU' SPECIFICA
  ordine: [('uscite_nuove', 10), ('nicchia_di_qualita', 20), ('classici_imperdibili', 30), ('punti_incontro_1', 40),
           ('ultime_visioni', 50), ('micro_cluster_1', 60), ('un_passo_fuori', 70), ('il_tuo_mondo', 80),
           ('mondo_2', 90), ('mondo_4', 90), ('mondo_6', 90)]
  titoli che prima stavano in piu' righe: 39 · proprietario sbagliato: 0
  il tuo mondo pieno: 20/20

5. IL CONTRATTO PORTA SPECIFICITA' E DOPPIONI
  contratto: [('il_tuo_mondo', 80), ('un_passo_fuori', 70), ('uscite_nuove', 10), ...]

6. LE RIGHE SPECIALISTICHE TENGONO IL LORO TITOLO MIGLIORE
  uscite_nuove: ['movie:1030']

TUTTE LE PROVE SUPERATE — OK
```

Il «prima» **non è dedotto**: si misura sullo stesso fixture con `waterfall_righe` sostituito da un'identità
(patch dell'istanza, niente flag nel prodotto). Il «dopo» è la stessa fixture col waterfall vero. La sezione 4
verifica la proprietà vera — **ogni titolo va alla famiglia a specificità minima fra quelle che lo avevano** —
e non l'espressione che il codice ha appena calcolato: 0 violazioni su 39 titoli.

### 3. La misura della premessa, prima/dopo (stesso fixture)

```
prima (50493a5): 61 copie in eccesso su 37 titoli in piu righe
dopo  (HEAD)   :  1 copie in eccesso su  1 titoli in piu righe
```

La copia che resta è **l'unica ammessa**: `il_tuo_mondo` × `micro_cluster`, e su 39 titoli condivisi il
proprietario è sempre la riga più specifica. **Deviazione dichiarata**: il ticket chiedeva il conteggio «dalla
sonda del ticket 01» (`probe-perdita-righe.js`, che parla col servizio e con Mongo); la misura è stata fatta
sulla sonda Python del motore, con lo stesso fixture e due esecuzioni. Il consumatore Node non cambia nulla
finché non c'è il `13`.

### 4. Suite e ricetta

```
$ npx jest --silent 2>&1 | grep -E "^FAIL|^(Test Suites|Tests):" | sort -u
FAIL tests/animeOverridesCertify.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/presetBurtonOrdering.test.js
Test Suites: 5 failed, 187 passed, 192 total
Tests:       8 failed, 1 skipped, 1910 passed, 1919 total

$ py -c "import sys; sys.path.insert(0,'services'); from graph import parametri as P; print(P.impronta())"
78fb0c52ad477cfc
```

Baseline `1910`/`192` (quella del `08`): zero regressioni. Produzione `fa5771594b2ad0c4`; con questa immagine
`78fb0c52ad477cfc`, artefatto invariato.

### 5. Le due review, e cosa hanno cambiato

**`spec`** ha misurato le cose che il ticket chiede e ha trovato tre difetti veri:

1. **Il «prima» era gonfiato**: `doppioni_tolti` conta le **copie evitate** (quante volte il pool incontra un
   titolo già assegnato), non i titoli persi — `tolti + rimasti` dava 79 dove le copie in eccesso erano 41 (e
   290 contro 159 a `cap=60`). Ora la sonda misura due esecuzioni (identità vs waterfall) e il campo è
   documentato per quello che è.
2. **La prova non aveva materia**: il titolo scelto era idoneo a **una** riga, e l'assert passava anche col
   waterfall spento. Ora il «prima» legge i **pool** dell'esecuzione senza dedup (3 righe per `movie:1030`) e il
   «dopo» legge le righe servite (1).
3. **La sovrapposizione non era dichiarata nel payload** e la doc diceva «un titolo in una riga sola» e poi
   ammetteva l'eccezione: ora il testo dice «ogni titolo alla riga più specifica, con una sola eccezione
   dichiarata».

**`standards`** ha trovato:

1. **Conteggio vecchio nel motivo** su una riga già corta (diceva 2/20 e ne mostrava 1) e **motivo sostanziale
   sovrascritto** (le uscite perdevano «cache assente, solo il canone storico»): ora il conteggio si riscrive e un
   motivo sostanziale si **appende**, mai si butta.
2. **`SPECIFICITA` era un dizionario nel motore**: cambiarla non cambiava la ricetta, e una famiglia nuova
   finiva ultima **in silenzio**. Ora è in `parametri.SCHEDA` (con `SPECIFICITA_DEFAULT`), e il motore
   **stampa un avviso** per una famiglia senza voce.
3. **Il pool era tagliato a `2×cap`**, e una riga che perdeva più di così dichiarava un "dedup" che era fame di
   fetch: ora `4×cap` (o `cap+60`) e il docstring lo dice.
4. **`_pool` era una seconda fonte di verità** di `titoli`: ora c'è un assert che fallisce se divergono; e una
   riga **senza** `_pool` non viene più saltata in silenzio (i suoi titoli entrano comunque fra gli assegnati).
5. `totale_sopravvissuti` non si azzera più sulle righe vuote; il log dice «dopo il dedup»; l'eccezione
   `il_tuo_mondo` × micro-cluster è una coppia dichiarata (`SOVRAPPOSIZIONE_FAMIGLIE`).

### 6. L'effetto in produzione — il punto da leggere prima di deployare

Il waterfall è **fedele al §9.1**, e il §9.1 presuppone che tutte le righe siano hero della **stessa home**.
Oggi **non lo sono**: `src/pool/index.js` e il registro Stremio servono solo `il_tuo_mondo`, `un_passo_fuori`,
`uscite_nuove`, `nicchia_di_qualita`. Misurato sul fixture a `cap=60`:

```
il_tuo_mondo   perde 59/60 · dest: micro_cluster_1 59 · dei primi 10, 10 non sono piu' suoi
un_passo_fuori perde 39/60 · dest: micro_cluster_1 39
mondo_*        57/60 (erano 60/60)
```

Cioè: la riga di punta **si riempie** (60/60 dal bacino), ma **perde i suoi titoli migliori verso righe che
Stremio non mostra** finché non c'è il `13`. Non è una regressione viva (la produzione non ha nessuno di questi
ticket), ma è una **decisione di ordine di deploy**: quest'immagine va messa insieme al `13`, oppure con una
guardia che limiti il waterfall alle righe servite. **Proposta, non applicata** — il ticket dice l'ordine, e
cambiarlo qui sarebbe una decisione di prodotto presa di nascosto. Scritto anche nella mappa.

### 7. Residui dichiarati

1. **Ordine di deploy** (sopra): fino al `13`, deduplicare `il_tuo_mondo` contro righe non servite toglie valore
   alla home. Il `13` è il ticket che rende il waterfall un guadagno.
2. **Il contratto cresce** per `un_passo_fuori` e `mondo_*` (`corta`, `target_dimensione`,
   `totale_sopravvissuti`, `motivo`, `specificita`, `doppioni_tolti`): additivo, il Node di oggi lo ignora — ma
   il `13` deve saperlo.
3. **`totale_sopravvissuti` ora significa «quanti candidati nel pool prima del taglio»** (era già `len(div)` per
   la maggior parte delle righe), non «quanti ne restano dopo il dedup»: il numero dei tolti sta in
   `doppioni_tolti`, e i due campi non vanno confusi.
4. **Le sonde 07 e 08 sono state adattate** perché il dedup cambia le righe: la 07 ora prova che ogni differenza
   è spiegata dal waterfall (e che la diffusione non cambia); la 08 ricalcola la camminata unica sul fixture.
   Non sono state indebolite per farle passare, ma la 08 non prova più la riga di prodotto — quella la prova il
   `11`.
5. **Nessun test pytest** per il waterfall: la prova è la sonda.
