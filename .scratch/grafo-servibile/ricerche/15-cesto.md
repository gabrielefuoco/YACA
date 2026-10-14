# 15 — Il cesto: semi con decadimento e allocazione multi-bolla

**Status**: `resolved` · **Ticket**: [15](../issues/15-cesto.md) · **Script**: `15-cesto.py` · `15-controlli.py` · **Log**: `log/15-cesto.log` · **368 s**
**Protocollo**: banco prodotto, **split temporale** (profilo = il 60% più vecchio, oro = il 40% più recente), **con il mascheramento del ticket 03**. 997 utenti.

## Cosa è stato costruito

**Due rimedi, misurati separatamente e poi insieme.**

**(a) Decadimento sui semi.** Ogni titolo del profilo pesa `2^(−(T_u − t_i)/τ)` invece di 1, con emivita τ fra 180 e 365 giorni: quello che l'utente guardava *adesso* conta più di quello che guardava quattro anni fa.

**(b) Allocazione a quote multi-bolla.** Il cesto di 2.000 si riempie a quote proporzionali alla massa **recente** dell'utente in ogni bolla, invece che prendendo i primi 2.000 per punteggio (che è la quota implicita «vince chi ha più punteggio»).

## I numeri

Formato: `@N globale / mezzo+coda / auto-informazione` — le tre metriche del ticket 01.

| configurazione | @10 | @100 | @500 |
|---|---|---|---|
| **RIF** uniforme, cesto piatto | 2,89 / 1,36 / 2,62 | 18,94 / 10,94 / 17,58 | 47,78 / 33,26 / 45,42 |
| **D365** | 2,88 / 1,38 / 2,62 | **19,07 / 11,11 / 17,72** | **48,22 / 33,69 / 45,87** |
| **D180** | 2,87 / 1,37 / 2,61 | 19,02 / 11,13 / 17,68 | 48,06 / 33,69 / 45,73 |
| **QUOTA** | 2,89 / 1,37 / 2,63 | 18,58 / 10,89 / 17,28 | 43,86 / 31,45 / 41,87 |
| **D365+QUOTA** | 2,88 / 1,40 / 2,62 | 18,72 / 11,05 / 17,42 | 44,21 / 31,79 / 42,22 |

**Differenza dalla configurazione di riferimento:**

| | @10 | @100 | @500 |
|---|---|---|---|
| **decadimento 365** | −0,00 | **+0,13** | **+0,44** |
| decadimento 180 | −0,02 | +0,08 | +0,28 |
| **quote multi-bolla** | +0,00 | **−0,35** | **−3,92** |
| entrambi | −0,01 | −0,22 | −3,57 |

### Il decadimento aiuta, ma di pochissimo

**+0,13 punti al @100 e +0,44 al @500. Al @10: niente.** L'attesa dell'esperto — «recupera subito una quota consistente del crollo temporale» — **non è confermata**: si guadagna un decimo di punto, non una quota del crollo (che è di 50-64 punti al @10 fra casuale e temporale).

Il segno è coerente su tutte e tre le metriche e su entrambe le emivite (il 365 fa meglio del 180, e una memoria più lunga che batte una più corta è la direzione attesa) — quindi il segnale c'è. Ma è **piccolo**, e chi lo adotta per il guadagno resterà deluso. τ=365 è il valore da tenere.

### Le quote multi-bolla sono dannose

**−0,35 al @100, −3,92 al @500.** Togliere il 96% dei titoli dal cesto (2.000 su 49.709) e riempirlo a quote costa caro, e il costo cresce con N: a @500 si perdono quasi 4 punti pieni.

## ⚠️ Il motivo: la premessa delle quote non regge su QUESTA partizione

La quota esiste perché «un utente ha 3-5 filoni d'interesse distinti», e una camminata unica premierebbe i ponti generici a metà strada fra loro. **Misurato: la quota dei primi 10 che cade nel filone dominante dell'utente è del 2,6%** — e le quote la portano al 2,1%.

| | primi 10 nel filone dominante | primi 100 |
|---|---|---|
| RIF | 2,6% | 1,5% |
| QUOTA | 2,1% | 1,4% |
| D365+QUOTA | 2,1% | 1,4% |

**Il filone dominante non domina niente**: con **5.297 bolle** un profilo di ~100 titoli tocca qualche decina di bolle, e nessuna supera il 3% del profilo. La partizione è **molto più fine** di quella che il rimedio presupponeva (3-5 filoni): il problema che le quote dovevano risolvere — la monocromia del cesto — **non esiste a questa granularità**. Il rimedio combatte un nemico che non c'è, e nel farlo esclude 47.000 titoli che servivano.

**Conseguenza**: se un giorno servisse davvero la diversificazione per filone, andrebbe fatta sulle **costellazioni L2** (300-400, ticket 11) o sui **macro-mondi L1** (25-35), non sulle bolle atomiche. Ed è una decisione da prendere **dopo** che la gerarchia esiste.

## I controlli (e i due bug che ho fatto per arrivarci)

**Controlli corretti**, con l'esclusione del profilo (la stessa che applica la camminata):

| | @10 | @100 | @500 |
|---|---|---|---|
| **popolarità** (profilo escluso) | 1,47% | 9,23% | 27,70% |
| popolarità (profilo non escluso) | 0,94% | 7,36% | 25,03% |
| ordine di indice (profilo escluso) | 0,74% | 7,04% | 21,63% |
| **camminata mascherata** (RIF) | **2,89%** | **18,94%** | **47,78%** |

Il valore con il **profilo non escluso** riproduce **esattamente** il numero archiviato del report 68 (0,94 / 7,36 / 25,04) ✓ — il che verifica due cose in una: che il banco è lo stesso, e che la baseline di popolarità archiviata era **corretta**.

**Il margine sopra la popolarità, in questo protocollo: 2,0× al @10, 2,1× al @100, 1,7× al @500.** Sopra l'ordine di indice: 3,9× / 2,7× / 2,2×.

### I due bug — vale la pena scriverli

1. **In `15-cesto.py` il controllo di popolarità passava `ranghi_popolare(...)` a una funzione che ci applica `K.ranghi` sopra.** Ma `ranghi_popolare` restituisce un **rango** (0 = il più votato) e `K.ranghi` rimescola per **punteggio decrescente**: la popolarità veniva **invertita**, e il controllo dava 0,00% dove il numero vero è 0,94%.
2. **La mia prima correzione ha negato i voti** (`Rp = -voti`), introducendo la stessa inversione al contrario. Il secondo run dava ancora 0,00%.

Il bug l'ho trovato perché **due strade indipendenti davano due numeri diversi** (0,00% da una parte, 1,47% dall'altra) e il numero archiviato ne indicava una terza. **La discrepanza fra due strumenti è la diagnostica che funziona**: se avessi avuto un solo strumento, avrei archiviato 0,00% come un fatto.

E una **falsa pista**, che va dichiarata perché l'ho inseguita: ho sospettato che `temporale.py` costruisse la popolarità al contrario (`argsort(argsort(votes))` dà il rango *ascendente*, quindi 0 = il meno votato). **Falso**: la catena `ranghi(tile(pop))` fa la doppia inversione e restituisce la popolarità giusta. `verifica-popolare.py` nasce da quel sospetto e la sua premessa è sbagliata; il numero archiviato è **confermato**.

## ⚠️ Una cautela sul catalogo serie, non risolta

Lo stesso sospetto si è rivelato **non verificabile** sul lato serie: ricostruendo il banco temporale Trakt (1.534 utenti) e applicando il metodo archiviato, la «popolarità» dà **0,05 / 1,28 / 9,98**, mentre il report 69 riporta **2,13 / 12,51 / 33,27**. Le due cose non coincidono, quindi **i due banchi non sono lo stesso banco** (diversa soglia di storia? diversa definizione di oro?), e **non ho stabilito quale sia giusto**.

Conseguenza da tenere presente: **il claim «sul catalogo serie il grafo non batte la popolarità al @10» non è verificato**. Sul banco che riesco a ricostruire la popolarità fa 0,05% al @10 contro la camminata a 2,07% — cioè il grafo vincerebbe di 40×. Il claim è in [spec.md](../spec.md) (Problem Statement) e va **marcato come dubbio** finché qualcuno non ricostruisce il banco di `ordine-serie-temporale.py`.

## Il tetto del cesto — perché non c'è un numero da confrontare col 12%

L'analisi diceva: «tetto raggiungibile al 12% al @10, il modello ne prende il 29%». **Quel 12% viene dal catalogo serie**, dove la pipeline ha due stadi (un retriever e un ranker): lì il tetto del cesto è la frazione d'oro che entra nel cesto, e il ranker può solo pescarci dentro — quindi il numero ha senso.

Nel prodotto a **uno stadio** la camminata *è* l'ordinamento, e il tetto del cesto al @K è **per definizione** la recall al @K: il numero sarebbe circolare. Qui il cesto è una scelta imposta (i primi 2.000 per punteggio) e la domanda non circolare è se le due mosse lo rendono **più denso d'oro nella testa** — che è quello che la tabella sopra misura.

## I criteri del ticket

- [ ] ❌ **il tetto del cesto non sale sopra il 12%**: quel riferimento appartiene alla pipeline a due stadi del catalogo serie, e non esiste un numero equivalente per il prodotto a uno stadio (spiegato sopra)
- [x] le due modifiche sono misurate **separatamente** prima di essere combinate
- [x] il test è sul **protocollo temporale con mascheramento**, non sullo split casuale
- [x] i controlli (popolarità, ordine di indice) sono misurati con la stessa esclusione, e la popolarità **sale meno** del metodo (1,47 contro 2,89 al @10)
- [x] la recall su **mezzo+coda** è misurata insieme alle altre due e sale con il decadimento (+0,17 al @100)
- [x] l'allocazione non affama l'interesse principale — ma **non perché funziona**: perché il filone dominante pesa già il 2,6% e non c'è niente da affamare

## Limiti dichiarati

1. **Il decadimento è misurato solo sul catalogo film** (il banco prodotto). Il lato serie non è stato toccato.
2. **Il miglioramento è piccolo e senza intervallo di confidenza**: +0,13 punti al @100 su 997 utenti e 62.322 titoli d'oro. Non ho calcolato se è distinguibile dal rumore — con numeri di questa taglia, **probabilmente non lo è**. Va trattato come una direzione, non come un guadagno dimostrato.
3. **Le quote sono misurate su una sola forma**: cesto di 2.000, quote proporzionali alla massa recente. Altre forme (cesto più grande, quote con un pavimento per bolla) non sono state provate: il verdetto negativo vale per **questa** forma.
4. **La partizione usata è `bolle2-E`**, non una delle nuove del ticket 07: la conclusione «il filone dominante pesa il 2,6%» va riverificata se la partizione cambia.
5. **La finestra di esclusione dal cesto** (`uscita > T_end`) resta quella del ticket 03, con le stesse cautele.
