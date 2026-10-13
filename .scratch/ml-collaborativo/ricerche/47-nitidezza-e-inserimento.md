# 47 — A · Cosa fa brillare un item in cima · B · Dove si mette un titolo nuovo

**Le due vie in parallelo.** A è la porta di tutto (la "nitidezza" che nessuno aveva misurato); B è la capacità che serve al prodotto (inserire senza curatela).

Script: `.scratch/ml-collaborativo/nitidezza.py`, `riordino.py`, `verifica-nitidezza.py`, `inserimento.py`.

---

# A · LA NITIDEZZA

## A.1 Il numero che cambia le cose: la testa è la parte PEGGIORE della lista

1.500 utenti MovieLens reali, split 60/40, attivazione dai film del profilo sul grafo di retrieval.
Tasso di colpi **per posizione** (frazione del top-N che è nell'oro dell'utente):

| posizione | colpi |
|---|---|
| **0-10** | **1,69%** |
| 10-50 | 7,61% |
| **50-100** | **9,67%** ← il massimo |
| 100-250 | 6,57% |
| 250-500 | 3,65% |

**La testa non è debole: è la parte peggiore.** Il tasso *sale* scendendo, tocca il massimo a 50-100, poi cala. Un ordinamento che mettesse in cima la fascia 50-100 triplicherebbe il risultato.

Lettura del meccanismo: il top-10 della random walk è ciò che sta **più vicino** ai semi — cioè "ancora la stessa cosa". Il film che l'utente guarderà dopo non è il più vicino, è quello a distanza giusta.

## A.2 Cosa ordina meglio, misurato sui suoi stessi candidati

Si prende la lista di 500 candidati dell'attivazione (base: **5,40%** di colpi) e la si riordina con **una sola caratteristica**. Non è un modello: è un riordino.

| riordino | @10 | @50 | @100 |
|---|---|---|---|
| attivazione (riferimento) | 1,69% | 6,43% | 8,05% |
| **popolarità discendente** | **21,02%** | 14,57% | 11,76% |
| popolarità ascendente | 0,37% | 0,64% | 0,96% |
| **cos col profilo discendente** | **16,90%** | 12,36% | 10,56% |
| cos col profilo ascendente | 0,10% | 0,43% | 1,05% |
| pochi legami curati prima | 19,07% | 12,04% | 9,17% |
| anno più vicino prima | 13,45% | 10,72% | 9,60% |
| il profilo tocca la foglia | 13,00% | 7,75% | 6,95% |
| coerenza-foglia (più tipico) | 1,91% | 2,54% | 3,04% |
| grado discendente | 6,28% | 6,12% | 6,41% |
| dimensione foglia (grande prima) | 7,35% | 5,61% | 5,52% |

**La popolarità, applicata alla lista già recuperata, porta il top-10 da 1,69% a 21,02%: 12 volte.** E la combinazione `z(popolarità) + z(cos col profilo)` fa 20,87% — **non meglio della popolarità sola**.

## A.3 Cosa significa, esattamente

1. **Il recupero funziona.** I 500 candidati dell'attivazione contengono il 5,40% di colpi, cioè **41% di recall a 500**. È la parte buona del sistema.
2. **L'ordinamento è rotto, e di molto.** Riordinare la stessa lista con una caratteristica banale la migliora di 12 volte. Non serve un modello, non serve informazione nuova: serve **ordinare**.
3. **"Cosa deve brillare" ha una risposta netta: il noto e il simile.** Non il sorprendente. Le due caratteristiche che funzionano sono popolarità e vicinanza al profilo; le due che il sistema implicitamente privilegia — tipicità nella foglia e vicinanza nella camminata — sono le peggiori.
4. **Il risultato è coerente con il report 34** (il GBM impara `voti_cand`, importanza +0,417) e con il report 45 (la popolarità batte l'attivazione sulla testa). Tre strade diverse, la stessa risposta.
5. **La combinazione recupero + popolarità batte la popolarità pura**: 21,02% contro l'1,70% della lista globale dei più noti (report 45). Il contenuto serve — a **generare i candidati**, non a ordinarli. È la frase del report 41 («il contenuto va usato come generatore di candidati, non come ranker») che finalmente ha un numero.

## A.4 La trappola che ho preso (e il controllo che l'ha intercettata)

La prima stesura di `riordino.py` aveva le **etichette scambiate**: `sort_values(..., ascending=False)` è *discendente* (i più grandi prima), e io avevo etichettato quella riga "ascendente (meno noto prima)". Ho riportato per un momento che "i meno popolari prima" facevano 21% — cioè l'inverso del vero.

Non l'ha intercettato il codice: l'ha intercettato il fatto che **il numero era troppo bello**. La verifica indipendente (`verifica-nitidezza.py`, con `nlargest`/`nsmallest` che non ammettono ambiguità) ha dato: i 10 più popolari 20,18%, i 10 meno popolari 0,38%, i 10 dell'attivazione 1,32%.

**È la terza volta in questa sessione che il segno rovesciato produce un risultato plausibile ma falso.** Le altre due: `~is_tv[v] != is_tv[u]` nel medio (report 43) e la copertura del pool.

---

# B · L'INSERIMENTO

## B.1 La premessa che cambia il test

Il grafo attuale **è già** il risultato di un inserimento via metadati per il 96% del catalogo: solo 2.378 nodi su 66.259 hanno un legame scritto a mano. La capacità quindi esiste — la domanda è **quanto è buona e quale regola la fa meglio**.

Test: 2.000 titoli nascosti (1.490 film, 510 serie) trattati come nuovi — nessuna curatela, nessuna co-visione, **solo metadati**. Cinque regole di collocazione, due riferimenti (una foglia a caso e la foglia che l'albero aveva davvero dato).

Misura di "ci sta bene": il coseno del titolo col centroide della foglia, in **percentile** rispetto ai membri già presenti. 50° = un membro tipico. Sotto il 10° = corpo estraneo.

## B.2 I risultati

| regola | 50° | 25° | <10° (estraneo) | =foglia dell'oracolo | foglia mista |
|---|---|---|---|---|---|
| vicino più stretto (k=1) | 39° | 15° | 16,2% | 41,6% | 37,5% |
| pluralità dei 10 vicini di contenuto | 40° | 17° | 15,4% | 51,3% | 31,6% |
| **centroide più vicino** | **47°** | **21°** | **13,2%** | **59,8%** | 27,9% |
| pluralità contenuto + temi | 39° | 15° | 18,1% | 57,5% | **44,9%** |
| NULLO (foglia a caso) | 0° | 0° | **94,3%** | 0,0% | 52,4% |
| **ORACOLO (foglia dell'albero)** | **50°** | **25°** | 11,2% | 100,0% | 36,9% |

**Il nullo conferma che lo strumento misura qualcosa**: una foglia a caso è un corpo estraneo nel 94,3% dei casi e sta allo 0° percentile.

**La regola migliore è il centroide più vicino**, e la notizia è quanto è vicina all'oracolo:
- il titolo nuovo sta al **47° percentile** (l'oracolo: 50°)
- è un corpo estraneo nel **13,2%** dei casi (l'oracolo: 11,2%)
- azzecca la foglia dell'oracolo nel **59,8%**

Cioè: **un titolo che l'albero non ha mai visto si colloca quasi come se l'albero lo avesse visto.** La differenza fra "inserito" e "nativo" è di 3 punti di percentile.

## B.3 E per le serie, che sono la metà senza segnale comportamentale

| regola | serie: 50° | serie: foglia mista | film: 50° |
|---|---|---|---|
| **centroide più vicino** | **51°** | 56,3% | 47° |
| pluralità contenuto + temi | 41° | **68,6%** | 38° |
| pluralità dei 10 vicini di contenuto | 42° | 59,8% | 39° |
| NULLO | 0° | 91,4% | 0° |
| ORACOLO | 52° | 60,4% | 50° |

**Per una serie il centroide fa 51°, meglio dell'oracolo (52°).** E aggiungendo i temi si arriva al **68,6% di foglie miste** (con film dentro), contro il 60,4% dell'oracolo.

## B.4 Cosa ne segue

1. **L'inserimento funziona, e si sa quanto costa**: ~3 punti di percentile rispetto a un titolo nativo. Non serve ricostruire il grafo per un titolo nuovo.
2. **La regola è una sola riga**: prendere il centroide della foglia più vicino. Batte la pluralità dei vicini (47° contro 40°), che è quello che fa `bootstrap-test.py`.
3. **Per far entrare una serie in una foglia mista** (l'agnosticismo dal medium che serve) si aggiungono i temi: 68,6% contro 56,3%, al prezzo di 10 punti di aderenza.
4. **Il limite dichiarato**: l'albero è una partizione **fissa**. Un titolo nuovo va in una foglia esistente e quella foglia non cresce. Se il catalogo cambia molto, serve una soglia di ricostruzione — non misurata qui.

## B.5 Errori miei in B

- `vs @ vs.T` sull'intera matrice: 32 GB. Corretto calcolando solo la riga del titolo.
- `int(is_tv[hold]).sum()` invece di `int(is_tv[hold].sum())` in una f-string.
- Il primo diagnostico delle foglie grandi dichiarava "155 apribili, possibile bug" perché non controllava il quarto criterio (la modularità) — il bug non c'era.

---

# Cosa dicono A e B insieme

**B è chiuso positivamente**: il sistema sa inserire un titolo nuovo e metterlo quasi al posto giusto, senza curatela. Non è più un buco.

**A ha una risposta sola e vale più di tutte le altre**: *il recupero funziona, l'ordinamento è rotto, e riordinare la lista già recuperata per popolarità la migliora di 12 volte.* Il che vuol dire che la strada non è un modello nuovo, né più dati, né più curatela: è **mettere in fila** quello che già abbiamo.
