# 03 — Il test a tempo T: il mascheramento comportamentale

**Status**: `resolved` · **Ticket**: [03](../issues/03-mascheramento-temporale.md) · **Script**: `03-mascheramento.py ml` · **Log**: `log/03-mascheramento-ml.log` · **489 s** · **Banco**: prodotto (MovieLens), 997 utenti con split temporale

## Cosa è stato costruito

**Il mascheramento istantaneo**, che è il livello 1 dei due previsti dal ticket: per ogni utente
tagliato al tempo T_u, i titoli usciti dopo `T_u − 90 giorni` **non trasmettono**. La loro riga è
esclusa dalla propagazione; e ogni titolo uscito dopo `T_end` (la fine della finestra di test) è
escluso dal cesto.

Perché sull'istante della camminata e non ricostruendo il grafo: la riga mascherata è
`M.T @ (vivo ⊙ X)`, cioè si azzera la voce di X prima della moltiplicazione. **Una camminata, un
grafo, nessun rifacimento.**

Quanto è grande la maschera, qui: **34.022 titoli ciechi per utente** (mediana) su 49.709 film —
il 68% del catalogo. Non è una rifinitura: è la maggioranza del grafo.

## I controlli — tre, e due su tre valgono

**1. Controllo di partenza**: la camminata non mascherata deve riprodurre il numero temporale
archiviato. **Riprodotto al decimale**: `@10 2,87% · @100 18,21% · @500 46,14% · @2000 77,93%` ✓

**2. Controllo no-op**: `rwr_mascherato` con `vivo` tutto vero contro la `rwr` canonica.
**Identico, matrici e recall** ✓ — l'identità `M.T @ (1 ⊙ X) = M.T @ X` verificata *sui dati*, non
solo sulla carta. ⚠️ *Al primo giro questo controllo era scritto male* (confrontavo un array già
mascherato con uno no) e ha dato «DIVERSO». Era un bug del controllo, non della macchina: l'ho
corretto e ora passa. **Il controllo sbagliato è la cosa che sarebbe passata inosservata.**

**3. Controllo placebo**: la **stessa quantità** di archi tolta **a caso**. Senza questo, «la
mascherata si muove» non distingue «toglie il futuro» da «toglie archi».

## Il risultato: il segno della perdita è invertito

| | @10 | @100 | @500 | @2000 |
|---|---|---|---|---|
| NON mascherata | 2,87% | **18,21%** | **46,14%** | **77,93%** |
| **MASCHERATA** | **2,89%** | **18,94%** | **47,78%** | **78,94%** |
| PLACEBO (casuale, stessa taglia) | 2,64% | 15,98% | 42,03% | 74,46% |

**Differenza dal non mascherato** (negativo = la mascherata è *meglio*):

| | @10 | @100 | @500 | @2000 |
|---|---|---|---|---|
| maschera **vera** (titoli freschi) | −0,02 | **−0,72** | **−1,64** | **−1,01** |
| placebo (titoli a caso) | +0,23 | **+2,24** | **+4,10** | **+3,47** |

Togliere 34.000 titoli **a caso** costa 2,24 punti al @100. Togliere i **34.000 titoli freschi**
ne **guadagna** 0,72. La differenza fra le due manovre è **3,0 punti al @100** e **5,7 al @500**.

## Il meccanismo

I titoli freschi hanno archi comportamentali accumulati **dopo** T_u — da un pubblico che ha
guardato le novità in quella finestra. Quella non è informazione su *questo* utente: è
informazione sull'**audience delle uscite recenti**, che è una popolazione diversa. Usata come
ponte, trascina la camminata verso un gusto che non è quello dell'utente.

Il mascheramento non li rimuove dal catalogo: **possono ancora essere consigliati** (ricevono
punteggio), semplicemente **non fanno più da ponte**. Quello che si toglie è la loro capacità di
*instradare*.

E non è «ignorare il nuovo»: la recall sui titoli d'oro **freschi** migliora anche lei
(3,25% → 3,27% @10; 19,53% → 20,00% @100), **insieme** a quella sui titoli stabili (2,65% → 2,68%).

## Cosa cambia nella mappa — una premessa va corretta

L'handoff (buco 1, e la specifica che ne è nata) diceva: *«il grafo conosce il futuro, quindi i
numeri temporali sono ottimistici: il crollo vero sarebbe peggiore»*.

**Misurato: è falso, nel verso in cui lo dicevamo.** La conoscenza del futuro non gonfia i numeri —
li **abbassa**. Il grafo non "bara a favore": bara a favore di un pubblico che non è quello
dell'utente. I numeri temporali archiviati (2,87 / 18,21 / 46,14 / 77,93) sono quindi **non
ottimistici**; un grafo onesto a tempo T renderebbe **leggermente meglio**, non peggio.

Questo non assolve il protocollo: dice che la perdita che cercavamo (il crollo al 50-64% del @10
rispetto allo split casuale) **non viene dal leakage temporale**, ma dallo split stesso — cioè dal
fatto che il futuro è più popolare del passato. Il collo di bottiglia resta il cesto (ticket 15).

## I criteri del ticket

- [x] il mascheramento è **verificabile**: i titoli freschi hanno peso comportamentale zero e restano raggiungibili
- [x] la recall sui titoli usciti nella finestra di test è riportata **separatamente** (fresche / stabili)
- [x] i numeri con e senza mascheramento sono confrontati, e la differenza è dichiarata
- [ ] ⚠️ **il controllo di degenerazione non è eseguibile come scritto**: il criterio chiede un utente «il cui oro è tutto precedente a T − 90 giorni», ma **nessun utente ha una maschera vuota** (minimo 2.932 titoli ciechi, massimo 45.126). Il controllo più forte che si può fare — `vivo` tutto vero ≡ canonica — è stato fatto ed è identico
- [x] il costo non esplode: nessuna ricostruzione per utente, un solo grafo

## Limiti dichiarati

1. **Il mascheramento è sulla propagazione, non sulla costruzione.** La correzione d'hub resta
   quella calcolata sul grafo intero: ricalcolarla per utente vorrebbe dire un grafo per utente.
   È una semplificazione, e va letta come tale.
2. **I titoli freschi perdono anche gli archi strutturali** (regia, cast, keyword): è **più severo
   del necessario**. La variante fine — struttura viva, comportamento cieco — è il ticket 16.
3. **Non è un grafo ricostruito a tempo T.** CF è ancora costruito su cronologie complete di utenti
   disgiunti: il test misura l'effetto della cecità sui titoli freschi, non l'effetto di un grafo
   costruito solo sul passato. Il livello 2 (ticket 04) è quello che lo verifica.
4. **La parte Trakt non è implementata** in questo script (le date stanno in `last_watched_at` e il
   protocollo è in `temporale.py`): il ticket è chiuso sul banco prodotto. Lo script **rifiuta**
   l'argomento `trakt` con un errore esplicito invece di non fare niente in silenzio.
5. **Le date coprono l'85,9% del catalogo**: un titolo senza data non si maschera mai. È la scelta
   conservativa giusta (una data ignota non è una data futura), ma rende la maschera una stima per
   difetto.

## La lezione che vale più del risultato

Il controllo no-op ha dato «DIVERSO» al primo giro per un errore **nel controllo**, e per un attimo
ha messo in dubbio la macchina. Se non avessi avuto un secondo modo di verificare (riprodurre il
numero temporale al decimale), avrei potuto concludere che il mascheramento distorceva. **Un
controllo sbagliato è più pericoloso di nessun controllo**, perché produce una certezza. È la terza
volta in questa sessione che un artefatto nasce da uno strumento e non dal mondo.
