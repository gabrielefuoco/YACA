Status: resolved
Type: task
Blocked by: 14

# 21 — La taratura del decadimento: l'alpha del giorno e il reset

## La decisione (20/10/2026)

Il decadimento del ticket 14 resta **`0.85^giorni`** (soglia 3 giorni, mai visti). Due aggiunte decise
dall'utente, perché la formula da sola ha due difetti misurati:

1. **senza varietà**: la pagina 1 si rinnova in blocco (a 3 giorni restano 5/20, a 5 giorni 0/20) ma sempre
   nello stesso ordine — chi apre Stremio due volte nello stesso giorno vede la stessa sequenza, e nei primi
   due giorni non cambia **niente**;
2. **senza ritorno**: un titolo che scivola giù resta giù finché non esce dalla finestra di 14 giorni
   (dente di sega: torna al punteggio pieno di colpo, ~11 giorni dopo). «Molti suggerimenti utili
   scompaiono» — ed è vero: il decadimento non ha memoria del fatto che il titolo era buono.

## Cosa deve uscire

1. **Alpha giornaliero deterministico**: un fattore casuale per `(giorno UTC, tmdbId)` in una banda
   dichiarata (es. `1 ± 0.05`), moltiplicato al punteggio **effettivo** (dopo il decadimento), così l'ordine
   delle prime pagine cambia di giorno in giorno. Deterministico = due richieste nello stesso giorno danno
   lo stesso ordine (Stremio non deve vedere la pagina che balla a ogni refresh), e nessun dato da salvare:
   l'hash di `giorno + id` basta. La banda è un parametro in `parametri`-equivalente lato Node, non una
   costante sparsa.
2. **Reset periodico**: un titolo non può restare penalizzato all'infinito. Il conteggio dei giorni si misura
   su una finestra **corta e dichiarata** (es. ultimi 7 giorni, non 14) **oppure** l'esponente si azzera
   dopo `k` giorni consecutivi **fuori** dalla pagina 1. Scegliere una delle due, misurarla e scrivere
   perché l'altra no.
3. **Il pavimento di qualità non si abbassa**: il reset non deve ripescare titoli sotto il pavimento del
   canone — riporta in gioco chi era sopra, non chi era stato scartato.
4. **La prova**: un titolo decaduto da 10 giorni **torna** in pagina 1 dopo il reset; due giorni diversi
   danno ordini diversi (e lo stesso giorno due volte dà lo stesso ordine); nessun titolo esce dalla riga;
   la banda dell'alpha è rispettata (`|alpha - 1| <= banda`).
5. **La misura**: sonda che mostra, su 10 giorni simulati, quanti titoli **diversi** passano dalla pagina 1
   (rotazione) e quanti **tornano** dopo il reset, con e senza le due aggiunte.

## Note

- L'alpha **non è un boost di gusto**: è varietà di presentazione, quindi non deve mai spostare un titolo
  oltre la banda del 5% (o della banda scelta) né cambiare quali titoli sono in riga — solo l'ordine.
- Il reset e l'alpha vanno **dopo** il decadimento e **dopo** la cache (come il 14), e non devono invalidare
  la voce di cache delle righe.

---

## Esito (20/10/2026) — l'alpha del giorno e il reset, con la soglia scelta misurando

### 1. Cosa è uscito

- **Alpha del giorno** (`alphaDelGiorno` in `src/pool/impressioni.js`): `1 ± 0.05`
  (`DECADIMENTO_ALPHA_BANDA`), calcolato con un **hash FNV-1a di `giorno UTC | tmdbId`**. Deterministico
  per costruzione: **due richieste nello stesso giorno danno lo stesso ordine** (Stremio non vede la pagina
  ballare), il giorno dopo l'ordine cambia. Nessuno stato da salvare. L'alpha moltiplica il punteggio
  **effettivo** (dopo il decadimento) di **ogni** titolo: è varietà di presentazione, non un boost di gusto,
  e non cambia **quali** titoli sono in riga.
- **Reset** (`DECADIMENTO_RESET_GIORNI_FUORI`): il decadimento vale **solo se il titolo è ancora in home**.
  Il lettore ora consegna, per ogni titolo, `{ giorni, ultimo }`; se `oggi - ultimo >= 4` giorni il
  decadimento è **azzerato** e il titolo torna al punteggio pieno (più l'alpha). `statistiche.riposati`
  dice quanti titoli sono stati riposati.
- **Il pavimento di qualità non si tocca**: il reset non aggiunge titoli alla riga, cambia solo il loro
  punteggio; chi era stato scartato dal canone resta scartato.
- **La cache delle righe non si invalida**: come per il 14, il tutto avviene **dopo** la lettura della cache
  e su copie (la voce di cache non viene mutata). La sequenza di test lo prova ancora.

### 2. La soglia del reset: scelta misurando, non a occhio

Con una soglia di **2 giorni** il reset produce un **pendolo**: un titolo torna a punteggio pieno, resta in
home 3 giorni, decade, esce 2 giorni, si azzera, torna… Misurato (10 giornate simulate, sonda
`scripts/qa/probe-ticket-21-taratura.js`):

```
== la soglia del reset (giorni fuori prima di azzerare) ==
soglia  diversi in pagina 1  rientri  restano da ieri
   2          40/60              92     7.6/20
   3          50/60              67     9.2/20
   4          51/60              53     10.7/20
   5          51/60              54     10.6/20
   6          51/60              54     10.6/20
```

**Scelta: 4 giorni** (da 4 in poi i numeri sono piatti, e 4 è il minimo che toglie il pendolo). Con 2 la
pagina cambia troppo (solo 7,6/20 restano da ieri), con 4 si torna in gioco **e** si tiene la continuità.

### 3. La prova (sonda, 10 giornate simulate su 60 titoli)

```
$ node scripts/qa/probe-ticket-21-taratura.js
== Ticket 21: taratura del decadimento (10 giornate simulate) ==
riga 60 titoli · pagina 1 = 20 · rampa dei punteggi SINTETICA

A. solo decadimento (14)     diversi in pagina 1: 50/60 · rientrati dopo un'uscita: 29 (rientri 50) · restano da ieri: 11.1/20
B. + alpha del giorno        diversi in pagina 1: 51/60 · rientrati dopo un'uscita: 30 (rientri 54) · restano da ieri: 10.6/20
C. + reset (in vigore)       diversi in pagina 1: 51/60 · rientrati dopo un'uscita: 33 (rientri 53) · restano da ieri: 10.7/20
```

Lettura: **A** non cambia quasi mai pagina finché il decadimento non scatta, poi la rinnova a blocchi; **B**
muove l'ordine ogni giorno dentro la banda; **C** (la configurazione in vigore) aggiunge il ritorno: i
titoli che escono **rientrano** (33 su 51, contro 29-30 delle altre due, che ci tornano per caso) senza
perdere continuità (10,7/20 restano da ieri). Nessun titolo esce dalla riga in nessuna delle tre.

**La provenienza dei numeri**: la rampa dei punteggi della sonda è **sintetica** (`1 - 0.012·i`). La
conclusione non dipende dalla scala: l'alpha è una banda relativa (±5%) e il reset è una condizione sul
tempo, non sul punteggio.

### 4. Test

`tests/impressioniTaratura.test.js` (8 test): l'alpha sta nella banda e non è mai negativo; stesso giorno →
stesso ordine, giorno dopo → ordine diverso; non cambia **quali** titoli (e nessuno sparisce); il punteggio
resta nella banda anche senza impressioni; il reset riporta al punteggio pieno chi non è in home da 5 giorni;
chi è ancora in home **decade**; il confine esatto (`RESET_GIORNI_FUORI`); il reset **non** ripesca chi non
ha mai superato la soglia. I test del 14 sono stati aggiornati al nuovo contratto del lettore
(`{giorni, ultimo}`) e a `alphaBanda: 0` dove provano il solo decadimento — dichiarato qui, non nascosto.

### 5. Suite

```
$ npx jest --silent 2>&1 | grep -E "^FAIL|^(Test Suites|Tests):" | sort -u
FAIL tests/animeOverridesCertify.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/duckDbAndMatchmaker.test.js
FAIL tests/presetBurtonOrdering.test.js
Test Suites: 5 failed, 191 passed, 196 total
Tests:       8 failed, 1 skipped, 1951 passed, 1960 total
```

### 6. Residui

1. **L'alpha cambia l'ordine ma non i punteggi del grafo**: chi legge `punteggio` da un item di riga hero
   ora vede anche il fattore del giorno (`alpha_giorno` lo dichiara). Se un domani servisse il punteggio
   "puro", è in `punteggio_grafo`.
2. **La finestra del lettore resta 14 giorni**: il reset lavora su `ultimo`, quindi la finestra corta non
   serve — ma un titolo mostrato 20 giorni fa non è più conteggiato, ed è giusto così.
3. **La taratura è una scelta di prodotto registrata** (4 giorni, ±5%): se il prodotto vuole più/meno
   varietà, sono due costanti dichiarate in `src/pool/impressioni.js`, non numeri sparsi.

---

## Fix delle due review (20/10/2026) — la review aveva ragione su due cose gravi

### 1. Il reset durava **un giorno**: era un cameo, non un ritorno (must fix, spec+std)

`giorni` era il **totale** dei giorni nella finestra e restava invariato: il giorno dopo il reset lo stesso
titolo tornava a decadere con l'esponente **vecchio e più grande** (`0.85^(n+1)`). «Torna al punteggio pieno»
era vero per ventiquattr'ore.

**Fix**: l'esponente non è più il totale, è la **serie in corso** (`serieInCorso`): i giorni consecutivi che
arrivano a oggi, interrotti da un buco ≥ `RESET_GIORNI_FUORI`. Un titolo che è fuori da 4 giorni ha serie
**0** (niente decadimento); quando torna riparte da **1** e torna a decadere solo dopo 3 giorni consecutivi
in home. Test: «il giorno DOPO il reset non si torna a decadere con l'esponente vecchio».

### 2. L'alpha era uno spostamento a blocchi, non un rimescolamento (must fix, std)

FNV-1a senza avalanche finale, con l'id in fondo alla stringa: **correlazione misurata 0,953** fra id
vicini (`603`/`604`, `701`/`702`). Franchise e seguiti si muovevano insieme, e in certi giorni l'alpha era
un offset quasi costante per tutta la riga (nessun riordino).

**Fix**: aggiunta la coda di avalanche (murmur3 finalizer). Correlazione misurata dopo il fix: **0,009**.
Test: «id vicini non hanno lo stesso alpha (niente spostamenti a blocchi)», con soglia 0,3.

### 3. Gli altri, presi

- **Log onesto** (`src/pool/index.js`): prima si stampava solo con `titoli > 0` e si attribuivano all'alpha
  i movimenti del decadimento. Ora si logga quando **qualcosa** si è mosso, e la riga dice
  `N titoli scesi`, `R tornati al punteggio pieno`, `M cambi di posizione (decadimento + alpha)`.
- **`righeNonOrdinate`** ora conta anche il caso nuovo (una riga con un titolo senza punteggio viene saltata
  del tutto, alpha compreso: applicarlo a metà lascerebbe punteggi in disaccordo con l'ordine).
- **Banda di default provata attraverso la porta** (`getHeroPool`): `alpha_giorno` dentro ±5% e
  `punteggio !== punteggio_grafo` per ogni titolo — con `alphaBanda: 0` quel test sarebbe verde.
- **Test non più deperibili**: il «stesso giorno → stesso ordine» pinna `ultimo` al giorno della prova;
  l'asserzione sulla banda confronta ogni titolo col **proprio** `punteggio_grafo` (prima la riga era
  riordinata e si confrontavano titoli diversi).
- **Difese**: `oggi` validato (`YYYY-MM-DD`, altrimenti si ricade su oggi); un `ultimo` nel futuro non vale
  come «in home»; `riposati` conta solo chi aveva davvero accumulato giorni; `punteggio_grafo` non si
  sovrascrive su una seconda passata; l'alpha si ricorda per `(giorno, id)` (un hash per titolo al giorno,
  non per richiesta).

### 4. La misura, rifatta dopo il fix

```
$ node scripts/qa/probe-ticket-21-taratura.js
A. solo decadimento (14)     diversi in pagina 1: 50/60 · rientrati dopo un'uscita: 29 (rientri 50) · restano da ieri: 11.1/20 · permanenza media: 2 giorni (54% <= 2 giorni)
B. + alpha del giorno        diversi in pagina 1: 50/60 · rientrati dopo un'uscita: 29 (rientri 49) · restano da ieri: 11.2/20 · permanenza media: 2.02 giorni (57% <= 2 giorni)
C. + reset (in vigore)       diversi in pagina 1: 43/60 · rientrati dopo un'uscita: 34 (rientri 40) · restano da ieri: 13/20 · permanenza media: 2.41 giorni (37% <= 2 giorni)

== la soglia del reset (giorni fuori prima di azzerare) ==
soglia  diversi in pagina 1  rientri  restano da ieri
   2          35/60              54     12.3/20
   3          38/60              40     13.6/20
   4          43/60              40     13/20
   5          50/60              45     11.7/20
   6          50/60              49     11.2/20
```

Con la serie in corso il pendolo **non c'è più** (non dipende più dalla soglia): la soglia ora governa solo
quanto ruota la pagina. 3 dà la continuità massima (13,6/20), 5 la rotazione massima (50/60). **Resta 4**:
continuità 13/20 e 43 titoli diversi, il punto in mezzo. Le differenze fra 3 e 5 sono ±1,5 titoli su 20.

**La soglia scelta è una scelta, non una verità**: con il fix della serie, «2 giorni» non fa più il pendolo —
il numero 4 resta perché è il valore misurato e dichiarato, e spostarlo è un cambio di prodotto, non un bug.

### 5. Suite dopo il fix

```
Test Suites: 5 failed, 191 passed, 196 total
Tests:       8 failed, 1 skipped, 1953 passed, 1962 total
```
