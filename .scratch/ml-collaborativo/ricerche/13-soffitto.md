# 13 — Il soffitto: quanto della posizione collaborativa è riproducibile

**Data**: 08/10/2026 · **Script**: `misura-soffitto.py` · 100.474 utenti per metà, due teacher indipendenti

## Il metodo

Il coseno dello student (0,500) significa qualcosa solo se si sa quanto è raggiungibile. Si spezzano
gli utenti MovieLens in **due metà indipendenti**, si costruiscono **due teacher separati**, e si misura
quanto la posizione dello stesso film è stabile fra i due. Quello che non è stabile è rumore di
campionamento degli utenti: **nessun modello basato sui metadati può prevederlo**.

I due spazi differiscono per una rotazione arbitraria: si allineano con **Procrustes** prima di misurare
(altrimenti il coseno non significa nulla). L'allineamento usa 64×64 = 4.096 parametri su 41.063 film:
ininfluente.

## I numeri

| | coseno |
|---|---|
| fra le due metà indipendenti | **0,422** (mediana 0,402) |
| **affidabilità del teacher INTERO** (Spearman-Brown: 2r/(1+r)) | **0,594** |
| **student sui metadati** | **0,500** |
| vettore medio (il banale) | 0,224 |

## Il rumore non è uniforme (la scoperta più utile)

| popolarità | film | stabilità fra le due metà |
|---|---|---|
| **poveri di voti (<100)** | 22.432 (**55%**) | **0,270** |
| medi (100-1.000) | 14.000 | 0,530 |
| **molto votati (1.000+)** | 4.631 | **0,831** |

## Le tre conseguenze

### 1. Lo student è al **75% del massimo raggiungibile**, non a metà strada

```
(0,500 − 0,224) / (0,594 − 0,224) = 75%
```

Restano **0,094 di coseno** sul tavolo, e lì dentro c'è *tutto* il lavoro di modellazione futuro. Non è
un modello scarso: è un modello che ha quasi finito il suo compito.

### 2. Il buco sui film poco votati non era colpa dello student

Lo student faceva 0,361 su quella fascia e l'avevamo attribuito al teacher. Ora è **quantificato**:
su quei film la posizione collaborativa è stabile solo a **0,270** fra due metà degli utenti. **Il
bersaglio non esiste**: non c'è niente da imparare, c'è rumore. E sono il **55% del catalogo** (22.432
film su 41.063).

**Implicazione grossa**: il grafo costruito sul teacher è *significativo solo per la metà ben votata*
del catalogo. Per l'altra metà il teacher non ha un'opinione — e servono altre fonti (TMDB, keyword,
il comportamento dell'utente stesso).

### 3. Il punteggio 0-100 si rilegge

| asse | prima | **ora** | perché |
|---|---|---|---|
| predire la posizione | 60 | **75** | è al 75% del soffitto, non al 60% di un massimo ignoto |
| struttura | 70 | 70 | invariato (0,699 contro 0,631) |
| prodotto | 35 | 35 | il ranker perde ancora contro la popolarità |
| copertura (serie) | 20 | 20 | teacher cieco, TMDB proxy debole |

**La conclusione cambia di segno**: non siamo lontani da un modello migliore — **il modello è quasi
arrivato**. Siamo lontani sugli assi che toccano l'utente: l'ordine delle liste (prodotto) e le serie
(copertura). Ogni ora spesa a migliorare lo student vale poco; ogni ora spesa sul ranker vale molto.

## Nota di metodo

Il soffitto misurato così è **conservativo**: ogni metà ha metà utenti, quindi è più rumorosa del
teacher intero — ed è per questo che si corregge con Spearman-Brown. Se il teacher intero fosse
*perfettamente* affidabile, il soffitto sarebbe 1,0 e lo student starebbe al 35%. Con la correzione,
il numero difendibile è 0,594.

---

## Correzione (08/10/2026) — il soffitto è la RADICE dell'affidabilità, non l'affidabilità

**Errore mio, trovato grazie a una domanda dell'utente.** Se il bersaglio è `segnale + rumore`, il coseno
di una predizione *perfetta* col bersaglio rumoroso non è l'affidabilità: è **√(affidabilità)**. Il rumore
attenua il coseno anche contro una predizione esatta.

| | split-half | teacher intero (2r/(1+r)) | **soffitto = √** | studente | **quota del massimo** |
|---|---|---|---|---|---|
| **aggregato** | 0,422 | 0,594 | **0,771** | 0,500 | **50%** |
| <100 voti | 0,270 | 0,425 | 0,652 | 0,468 | 57% |
| 100-1k | 0,530 | 0,693 | 0,833 | 0,566 | 56% |
| **1k+ voti** | 0,831 | 0,908 | **0,953** | 0,507 | **39%** |

**Il "75%" era sbagliato: il modello è al 50% del massimo raggiungibile.** E la distribuzione si
ribalta: **il margine più grande è sui film dove il bersaglio è BUONO** (1k+: 39%), non su quelli
rumorosi. Perché sui film ben votati il bersaglio è preciso, e una predizione dai soli metadati resta
generica; sui film poco votati il bersaglio è sfocato e la predizione generica gli somiglia di più.

## L'esperimento che conferma la diagnosi (stesso giorno)

Peso della perdita per l'affidabilità misurata, e un MLP per testare la capacità (previsione dichiarata
prima: il peso aiuta sul sottoinsieme affidabile, l'MLP non batte il Ridge):

| modello | held-out | <100 | 100-1k | **1k+** | in-sample |
|---|---|---|---|---|---|
| Ridge alpha 30 (oggi) | **0,500** | 0,468 | 0,566 | 0,507 | 0,581 |
| **+ peso per affidabilità** | 0,494 | 0,452 | 0,568 | **0,541** | 0,553 |
| + peso, alpha 100 | 0,484 | 0,443 | 0,557 | 0,525 | 0,522 |
| **MLP 256 (capacità)** | 0,496 | 0,464 | 0,562 | 0,501 | **0,646** |

1. **Il peso funziona dove previsto**: 1k+ passa da 0,507 a **0,541 (+0,034)**, e l'aggregato lo
   nascondeva (0,500 → 0,494) — perché il costo cade sulla fascia rumorosa, che è la maggioranza.
   **Conferma la diagnosi: il modello stava imparando rumore.**
2. **L'MLP non batte il Ridge** (0,496) e allarga il gap (in-sample 0,646): più capacità = più
   memorizzazione. La previsione regge.

## La conseguenza che l'utente ha visto prima di me

**«Film con pochi voti» e «serie» sono la stessa classe di problema**: generalizzare dove il segnale
collaborativo è debole o assente. Non è un problema di capacità — è di **trasferimento**. E indica tre
mosse:

1. **Bersaglio denoised**: esistono DUE teacher indipendenti (dalla misura dello split-half). Addestrare
   sulla loro **media** (meno rumore) e validare sull'altro — o addestrare su A e validare su B: misura
   esattamente il segnale trasferibile.
2. **Valutazione cold-start costruita sui film**: tenere fuori dall'addestramento i film a basso segnale
   (o interi franchise/persone) e misurare lì. **È l'analogo su film del caso serie**, e ha la verità
   di riferimento: risolve il «non possiamo validare sulle serie».
3. **Levigatezza**: ridurre le feature ad alta cardinalità a embedding (node2vec, ticket 09) — un modello
   liscio nei metadati trasferisce, uno con un peso enorme su una singola persona no.

---

## Il protocollo giusto: bersaglio denoised e cold-start (08/10/2026)

Le due mosse che l'osservazione dell'utente ha reso evidenti, misurate.

### 1. Addestrare su una metà degli utenti, validare sull'altra

I rumori delle due metà sono **indipendenti**: memorizzare il rumore di A non aiuta a predire B, quindi
quello che resta nella misura è **solo il segnale trasferibile**. Il soffitto di questo confronto è
`√(0,422) = 0,650`.

| addestrato su | validato su | coseno | **quota del soffitto** |
|---|---|---|---|
| metà A | metà B | **0,362** | **56%** |
| metà B | metà A | 0,357 | 55% |
| media A+B (in-sample, riferimento) | — | 0,542 | — |

**Il modello cattura il 56% del segnale trasferibile.** E i due giri sono concordi (56% e 55%), quindi
non è un artefatto di una direzione. Nota: questo protocollo è **immune alla memorizzazione dei film**
(il rumore di A non predice B) — è la misura più pulita che abbiamo.

**Coerente con il resto**: il 0,500 contro il teacher intero era il **50%** del suo soffitto (0,771);
qui, con un protocollo indipendente, è il **56%**. Due strade, stessa risposta: **siamo a metà del
massimo, non al 75%.**

### 2. Cold-start per regista: l'analogo su film del caso serie

Si tengono fuori **tutti i film di un regista** (708 registi su 7.081 con ≥3 film, 3.296 film) e si
misura lì. Controllo: un hold-out **casuale** della stessa taglia — per separare "cold-start" da "meno
dati".

| | film | coseno |
|---|---|---|
| **COLD-START (regista mai visto)** | 3.296 | **0,494** |
| controllo: hold-out casuale | 3.296 | 0,507 |

**Il divario è 1,3 punti (2,5% relativo): tenere fuori un'entità intera costa quasi nulla.** Il modello
**non dipende dal memorizzare persone o franchise**: generalizza a entità mai viste. È l'evidenza
migliore che possiamo avere sulle serie — dove il teacher non esiste e non possiamo misurare nulla.

### La cautela che resta

Un regista tenuto fuori ha comunque film **dentro la distribuzione** dei metadati (stessi generi, stessa
epoca, stesso tipo di cast). Le serie sono un salto più grande: tipo diverso, durate diverse, stagioni,
niente budget. E il probe film→serie di stamattina diceva che quel ponte **non è gratis** (0% nel grafo,
nessuna vittoria netta in miscela). Quindi: **condizione necessaria, non sufficiente.**

### Gli errori di questo giro (per il catalogo)

1. **Il primo run ha dato −0,031**, un coseno *negativo* per un modello addestrato: **numero impossibile**.
   Causa: i due spazi SVD differiscono per una **rotazione arbitraria** e non li avevo allineati — la
   stessa cosa che avevo gestito con Procrustes nella misura del soffitto e poi dimenticato. Corretto con
   Procrustes + un controllo dell'allineamento (coseno fra i due teacher dopo l'allineamento = 0,422 ✓).
2. Lezione: **un numero impossibile va trattato come un bug, non come un risultato.** Il coseno negativo
   non era "il modello non impara": era la mia rotazione.
