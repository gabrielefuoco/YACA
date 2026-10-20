Status: resolved
Type: task
Blocked by: 11

# 22 — La guardia del waterfall: deduplica solo fra le righe che qualcuno mostra

## Il fatto (riapertura del ticket 11)

Il waterfall del ticket 11 è **fedele al §9.1**: ogni titolo va alla riga più **specifica** che lo
contiene. Sul fixture, però, `il_tuo_mondo` perde **59/60** titoli (tutta la top-10) verso
`micro_cluster_1`, che nessun catalogo Stremio mostrava prima del ticket 13 — e anche dopo il 13 un
micro-cluster può essere **spento** nel profilo. Risultato: la deduplica toglie titoli a righe visibili per
riempire righe invisibili.

## Decisione (20/10/2026)

**Guardia**: la deduplica considera solo i ruoli che **hanno un catalogo servito** per quel profilo/media.
Le righe non servite non partecipano al waterfall (non rubano titoli), e questo si dichiara nel payload
(`doppioni_tolti` resta la copia evitata; si aggiunge chi non ha partecipato).

## Cosa deve uscire

1. **Il set dei ruoli partecipanti** è un ingresso esplicito del waterfall (dal registro + selezione del
   profilo), non una costante: se domani un ruolo diventa un catalogo, partecipa senza toccare il motore.
2. **Nessuna riga sparisce** e nessuna riga servita resta vuota *per colpa della deduplica*: se una riga
   perde titoli verso righe non servite, il waterfall non deve averglieli tolti.
3. **La misura**: sul fixture del 11, `il_tuo_mondo` deve tenere la sua top-10 quando i micro-cluster non
   sono serviti, e tornare a perdere 59/60 quando lo sono (la specificità resta quella).
4. **Nessuna regressione sul §9.1** quando **tutte** le righe sono servite: stessi conteggi del ticket 11.

## Note

- Il ticket 11 resta `resolved`: questo è il suo seguito in produzione, non una correzione dell'algoritmo.
- Il caso «riga servita ma spenta nel profilo» è il più frequente prima del 20: la guardia deve guardare la
  **selezione**, non il registro.

---

## Esito (20/10/2026) — il waterfall non ruba più titoli alle righe che nessuno mostra

### 0. Una nota di igiene

Il codice Python di questo ticket (`services/graph/motore.py`, `servizio.py`) è finito dentro il commit del
ticket 21 per un `git add -A`: **non riscrivo la storia**, lo dichiaro qui. La sostanza è quella sotto.

### 1. Cosa è uscito

- **Il set dei partecipanti è un ingresso esplicito** del waterfall (`waterfall_righe(..., partecipanti)`),
  non una costante: `None` = tutte le righe (il §9.1 puro), una lista = solo quelle. Una riga fuori non
  pesca, non ruba, **resta** nella risposta con i suoi titoli e `waterfall_partecipa: false`, e si
  **dichiara**: log `[waterfall] fuori dal dedup (nessun catalogo servito): [...]` e campo
  `waterfall.fuori` nella risposta.
- **Il contratto del motore** (`POST /raccomanda`) accetta `opzioni.righe_servite` (lista di stringhe,
  validata: 400 se non lo è).
- **Il pool** calcola i ruoli accesi dal profilo (`righeServiteDelProfilo`): traduce gli id dei cataloghi
  nella **terminologia del motore** (`yaca_mondi_movies` → `il_tuo_mondo`, i tre ponti sono una riga sola) e
  lo manda al motore. Nessuna selezione, o nessuna riga di quel medium → `null` (comportamento normale).
- **La chiave di cache include l'insieme servito** (`_rs_<hash8>`): il motore ora deduce in funzione di
  quell'insieme, e senza il pezzo di chiave il profilo A erediterebbe le righe del profilo B.
- **Il confine dei documenti**: `src/pool/index.js` entra nell'allowlist di `proprietaDocumenti` con la
  motivazione (legge `selectedPresets`, come fa `manifest.js`; non scrive configurazione).

### 2. La prova (sonda `scripts/qa/probe-ticket-22-guardia.py`)

Fixture del ticket 11: il mondo ha 60 titoli, il micro-cluster contiene **i primi 30** (i migliori del
mondo). Metrica giusta: quanti dei **10 titoli migliori del mondo** restano serviti nel mondo — la lunghezza
della riga non cambia, cambia la qualità.

```
$ py scripts/qa/probe-ticket-22-guardia.py
== Ticket 22: la guardia del waterfall ==
fixture: il mondo ha 60 titoli; il micro-cluster contiene i primi 30 (i migliori del mondo)

A. nessuna guardia (tutte le righe partecipano)      top-10 del mondo servita: 1/10 · riga 10/10 · copie evitate 9
B. guardia: solo le righe servite (micro-cluster spento) top-10 del mondo servita: 10/10 · riga 10/10 · copie evitate 0
C. guardia ma tutte servite (identico a A)           top-10 del mondo servita: 1/10 · riga 10/10 · copie evitate 9
```

`A`: la riga visibile perde **9 dei suoi 10 titoli migliori** verso una riga che nessuno mostra, e viene
servita con i titoli 31-40 (stessa lunghezza, qualità peggiore). `B`: la guardia li tiene tutti. `C`: quando
tutte le righe sono servite, il comportamento è **identico** al §9.1 (la specificità non è stata toccata).

### 3. Test

`tests/waterfallGuardia.test.js` (7 test): la traduzione id→ruolo (compreso `mondi` → `il_tuo_mondo`), i tre
ponti come una riga sola, `null` senza selezione o senza righe di quel medium; la chiave di cache che cambia
con l'insieme e **non** con l'ordine; il pool che manda `righe_servite` al motore con una selezione parziale e
che **non** manda niente senza selezione.

### 4. Suite

```
$ npx jest --silent 2>&1 | grep -E "^FAIL|^(Test Suites|Tests):" | sort -u
FAIL tests/animeOverridesCertify.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/presetBurtonOrdering.test.js
Test Suites: 5 failed, 192 passed, 197 total
Tests:       8 failed, 1 skipped, 1960 passed, 1969 total
```

### 5. Residui

1. **La cache si frammenta per insieme servito**: ogni combinazione di righe accese è una voce in più. In
   pratica i profili hanno quasi sempre tutte le righe accese (dal ticket 20), quindi il caso «parziale» è
   raro; se diventasse comune, la leva è aggregare le righe in famiglie, non togliere il pezzo di chiave.
2. **Le righe fuori dal dedup possono sovrapporsi** alle servite: è voluto (non rubano niente), ma significa
   che lo stesso titolo può comparire in due righe **quando una delle due non è visibile**.
3. **La guardia guarda la selezione, non ciò che Stremio serve davvero**: se un catalogo è acceso ma Stremio
   non lo mostra (filtri a valle), la guardia non lo sa. Serve il ticket 12 per chiudere anche quel giro.
