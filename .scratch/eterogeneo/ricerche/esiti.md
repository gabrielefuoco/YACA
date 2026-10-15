# La trama come arco del grafo — esiti

`15/10/2026` · effort `.scratch/eterogeneo/` · ticket 01-04

**Il verdetto in una riga: la trama come *tipo di arco* funziona e migliora la coerenza delle bolle
(+0,15); la trama come *voto di collocazione* peggiora la collocazione (−6 punti).** Le due cose sono
coerenti fra loro, e la distinzione decide dove va usata.

---

## 1. Il componente (ticket 01)

Dagli embedding agli archi del grafo: k-NN a blocchi, top-30 per nodo, soglia 0,30, simmetrizzazione
`(M + Mᵀ)/2`. **13 secondi, 1.648.356 archi, grado mediano 30** — la stessa forma di CAST, quindi in
linea con gli altri componenti della miscela.

`Toy Story → Toy Story 3 (0,858) · Toy Story 2 (0,843) · Toy Story 4 (0,754)` — **la saga, in ordine**.
`Il silenzio degli innocenti → Hannibal (0,609) · Red Dragon (0,597)`. Il payload «titolo + trama» è
quello che rende possibile il primo caso: con la sola trama il modello non vedeva la saga.

**Limite dichiarato**: copre il **54,1%** del canone (chi ha una trama), quindi non può essere l'unico
arco. Entra in una miscela dove gli altri cinque coprono il resto.

## 2. V10, la partizione col componente (ticket 02)

Stessa ricetta di V8 (miscela, chiusura, consenso, RB 100, potatura) con `TRAMA` a peso 1,0.
**503 secondi.**

| | V8 | **V10** |
|---|---|---|
| bolle | 1.625 | **1.783** |
| mediana | 33 | 29 |
| la più grossa | 552 | 543 |
| triangolo | 4.960.331 | — |

## 3. L'arbitro che conta: la coerenza intra-cluster (ticket 03)

La domanda numero uno dell'architettura: *in una bolla ci stanno titoli davvero simili?* Si misura con
l'indice di chimera — la PMI mediana fra i 5 token tematici di testa di ogni bolla, coi soli `kw:`/`ge:`
e `df ≥ 30`, **calcolato con la stessa funzione su entrambe le partizioni** (la prima versione
mescolava i tipi e confrontava numeri non comparabili).

| | V8 | **V10** |
|---|---|---|
| **PMI mediana (coerenza)** | **+0,653** | **+0,803** |
| bolle a PMI negativa | 294 su 1.467 | **286** su 1.596 |

**Le bolle diventano nettamente più coerenti: +0,15, un guadagno del 23%.** È il risultato che
l'architettura cercava, ed è confermato.

E la frammentazione (N_eff) è **mista**:

| tropo | V8 | V10 |
|---|---|---|
| `kw:spaghetti western` | 11,39 | **6,32** ✓ |
| `kw:psychological thriller` | 101,78 | **92,53** ✓ |
| `kw:true crime` | 8,32 | 8,22 ✓ |
| `kw:superhero` | 46,33 | 46,12 ✓ |
| `kw:film noir` | 35,35 | 36,11 ✗ |
| `kw:cyberpunk` | 44,32 | 47,33 ✗ |
| `kw:slasher` | 88,07 | 90,91 ✗ |
| **`kw:iyashikei`** | **7,81** | **10,10** ✗ |

Lo **spaghetti western quasi dimezza** la frammentazione — il mondo si ricompatta — ma l'**iyashikei**
peggiora. E va detto che N_eff **sale per costruzione** con più bolle (1.783 contro 1.625): una parte
dell'aumento è meccanica, e i due miglioramenti sono il segnale vero.

## 4. La collocazione col voto della trama (ticket 04)

`score(i, b) = cos_centroide(i, b) + w · trama(i, b)`, con **entrambi normalizzati** — sommarli grezzi
farebbe vincere la trama per costruzione, che è il difetto in cui sono caduto tre volte oggi.

| peso della trama | propria bolla | sui 334 misurabili |
|---|---|---|
| **0 — solo centroide** | **378/600 (63,0%)** | **62,0%** |
| 0,10 | 329 (54,8%) | 54,2% |
| 0,25 | 336 (56,0%) | 56,3% |
| 0,50 | 339 (56,5%) | 57,2% |
| 1,00 | 342 (57,0%) | 58,1% |
| 2,00 | 338 (56,3%) | 56,9% |

**Il voto della trama peggiora la collocazione di 6 punti**, e non è un artefatto di copertura: il
confronto è sugli stessi 334 casi, quelli che hanno una trama **e** che il banco può giudicare.

## 5. Perché i due risultati non si contraddicono

Sono **coerenti**, e la ragione è la stessa che ha governato tutta questa sessione:

- il **banco** chiede «il titolo atterra nella bolla che la **co-visione** gli aveva assegnato?» — una
  domanda sul comportamento, che si può fare **solo** sui titoli che nel grafo ci sono già;
- la **coerenza** chiede «i titoli dentro una bolla si somigliano?» — una domanda sul significato.

Il voto della trama **sposta** i titoli verso la bolla semanticamente più vicina ✗ rispetto a quella
comportamentale, quindi:
- **le bolle diventano più coerenti** ✓ (+0,15, misurato ✓);
- **il banco peggiora** ✗ (−6 punti, misurato ✓) — perché misura l'altra cosa.

È **esattamente** il disaccordo V1/V3 di ieri, alla stessa distanza e per la stessa ragione.

## 6. Cosa fare, quindi

**Nella partizione: sì.** Il componente di trama va dentro il grafo (V10) — la coerenza intra-cluster
migliora del 23%, che è l'obiettivo dichiarato dell'architettura.

**Nella collocazione: solo per i titoli senza comportamento.** Il banco non può misurare quelli — non
hanno una bolla comportamentale — ed è **esattamente** il caso che l'utente descrive («aiutano a
discriminare meglio i film senza suggerimenti di visione»). Per i titoli che hanno già una storia di
visione, il voto della trama **sposta nella direzione sbagliata** e va spento.

**Il test che lo verifica** esiste già ed è quello del ticket 04 di `inserimento`: le uscite 2026, che
di comportamento non ne hanno. Lì il voto della trama va misurato contro l'occhio — perché il banco non
può dire niente, e l'occhio è stato l'arbitro migliore per tre volte oggi.

## 7. Cosa non è stato fatto

- **Il peso del componente**: provato solo a 1,0. Con 0,5 e 2,0 la coerenza cambierebbe, e va misurato
  prima di congelare V10.
- **L'aggiornamento incrementale**: gli archi del titolo nuovo si aggiungono subito (28 ms), la
  partizione si rinfresca di notte — il job notturno esiste già.
- **Il ricalcolo del vicinato** quando arriva un titolo nuovo (il punto «da valutare» dell'utente):
  non provato. Richiede di ripartizionare, quindi appartiene al ciclo notturno.
