# 17 — La co-visione nel grafo di recupero, con la cross-validazione a 5 fold

**Status**: `resolved` · **Ticket**: [17](../issues/17-co-visione-recupero.md) · **Script**: `17-covisione.py` · **Log**: `log/17-covisione.log` · **1.218 s**

## Perché la cross-validazione era obbligatoria

Il componente TV è costruito dalle cronologie degli utenti Trakt — **che sono gli stessi utenti del banco**. Un guadagno misurato così non dice «la co-visione serve»: dice «la co-visione sa già cosa ha visto quell'utente».

Quindi **5 fold**: TV si costruisce sui 4/5 degli utenti (1.275-1.336 utenti per fold) e si valuta sull'1/5 tenuto fuori (277-339 utenti del banco). **Nessuna cronologia del fold di banco ha contribuito al componente che lo valuta.**

**Tre casi, non due** — perché il cross-medium è il punto del ticket:

- **film**: semi film → catalogo film (grafo `CF`, e `CF+TV` col componente)
- **serie**: semi serie → catalogo serie (grafo `CFst+B`, e `CFst+B+TV`)
- **cross**: semi **serie** → catalogo **film** (il ponte che oggi non esiste)

## I risultati

Media sui 5 fold (deviazione standard fra i fold):

| catalogo | senza TV | con TV | differenza |
|---|---|---|---|
| **film** | 4,23±0,14 · 20,10±0,43 · 42,81±0,63 | 5,32±0,12 · 23,42±0,38 · 46,19±0,63 | **+1,09±0,08 · +3,33±0,06 · +3,38±0,16** |
| **serie** | 2,86±0,05 · 16,52±0,28 · 43,82±0,47 | **5,04±0,12 · 24,40±0,28 · 54,08±0,49** | **+2,19±0,14 · +7,88±0,21 · +10,27±0,21** |
| **cross** | 0,36±0,04 · 2,19±0,08 · 7,34±0,18 | 0,39±0,04 · 2,03±0,08 · 5,90±0,14 | +0,03±0,02 · **−0,15±0,05** · **−1,43±0,07** |

**5 fold su 5 migliorano** sui cataloghi film e serie a ogni soglia. Le deviazioni standard dei delta sono **±0,05-0,21** — la varianza fra i fold è minuscola, e questo rende il risultato il più solido della sessione.

### ✅ La co-visione è il guadagno più grande trovato finora, e non è contaminazione

**Catalogo serie: da 2,86% a 5,04% al @10 (+77%), da 16,52% a 24,40% al @100 (+48%), da 43,82% a 54,08% al @500 (+23%).**

È **l'unico risultato di questa sessione che sopravvive a un protocollo che esclude per costruzione** la fonte del segnale dall'utente valutato. Con il banco a split casuale la conclusione era già nota (report 58: la fusione col teacher serie); qui è **verificata su utenti che il componente non ha mai visto**, che è la differenza fra una speranza e un fatto.

E **anche il catalogo film ne beneficia** (+1,09 al @10, +26%): le cronologie Trakt contengono film, e la co-visione li collega meglio di quanto faccia il solo comportamento MovieLens. Il ticket 02 aveva mostrato che i componenti essenziali dei due cataloghi sono **disgiunti**; questo dice che **la co-visione è la prima eccezione a quella regola**.

### ❌ Ma il ponte cross-medium NON funziona — ed era la motivazione del ticket

Il ticket diceva: «TV è l'unico segnale comportamentale vero che attraversa il confine film ↔ serie». **Misurato: il caso cross è l'unico che peggiora** — −0,15 al @100 e **−1,43 al @500** (con 5 fold su 5 che peggiorano).

Il meccanismo: nel caso cross la camminata parte dalle serie e deve arrivare ai film. Aggiungere TV **infittisce il lato serie** del grafo, e la camminata resta lì invece di attraversare. Il @10 si muove di +0,03 (impercettibile), il @500 perde 1,43: **il ponte non c'è, e la densità in più lo rende più difficile.**

**Conclusione**: la co-visione è un **ottimo segnale per i due cataloghi separati** e **non è** il ponte che il ticket cercava. La frase «è l'unico segnale che attraversa il confine» è vera del **dato** (le cronologie contengono film e serie) e falsa dell'**uso** (metterlo nel grafo del catalogo di partenza non fa attraversare niente).

Il ponte va costruito **esplicito**: una componente che colleghi direttamente serie e film (per esempio la co-occorrenza *nella stessa cronologia* fra un film e una serie, che è un dato che abbiamo e non abbiamo usato in questa forma), non un componente che vive da un lato e spera di passare.

## ⚠️ Una discrepanza sul banco, non risolta

Il banco di questo script ha **1.535 utenti**, mentre `canone.banco_trakt` ne restituisce **1.063** con la stessa soglia (≥20 film e ≥10 serie). Ho riscritto il banco per avere l'identità dell'utente (senza, il fold non si assegna) seguendo la stessa logica, lo stesso seme e la stessa soglia — **quindi uno dei due conteggi è sbagliato e non ho stabilito quale.**

Un indizio: **1.535 ≈ i 1.534 del banco temporale del report 68** (`temporale.py`), che usa lo stesso filtro. Il numero anomalo è quindi **1.063**, e non è escluso che il banco del ticket 02 e delle misure sul catalogo serie sia più piccolo di quello che i dati contengono oggi (una raccolta successiva ha aggiunto file?). **Va chiarito prima di usare i numeri del lato serie come riferimento assoluto.**

## I criteri del ticket

- [x] **il componente entra in entrambi i cataloghi e la recall sale**: film **+1,09 / +3,33 / +3,38**, serie **+2,19 / +7,88 / +10,27** — numeri dichiarati
- [x] **il protocollo a 5 fold è dichiarato e la varianza riportata**: delta con deviazione standard **±0,05-0,21**, e 5/5 fold concordi sui due cataloghi
- [x] **la contaminazione è esclusa per costruzione**: TV del fold *f* è costruito dai 4/5 di utenti che **non** contengono nessuno degli utenti valutati in *f*
- [x] **il controllo del catalogo film**: il film **non** è un controllo neutro — la co-visione lo migliora (+1,09), quindi «si muove dove il componente arriva» ed è dichiarato
- [ ] ⚠️ **il confronto onesto con il grafo delle bolle**: non fatto. TV è già nel grafo delle bolle (report 72-74), e il confronto «quanto dà alle bolle contro quanto dà al recupero» non è stato misurato
- [x] il costo è dichiarato: **1.218 s** per 5 fold (5 SVD + 20 costruzioni di grafo + 30 camminate in lotti)

## Limiti dichiarati

1. **Il protocollo è a split casuale** (`dividi` con seme 13, 60/40), non temporale: i numeri assoluti sono gonfiati di 2-3× come tutti quelli presi così (report 68). **Il confronto fra le due colonne regge**, perché è lo stesso protocollo per entrambe — ma i valori assoluti non vanno citati fuori da qui.
2. **TV è costruito dall'SVD della matrice utente × titolo** (128 componenti), non dalla co-occorrenza diretta: una scelta che il report 70 ha già mostrato essere il collo di bottiglia (raddoppiare le serie coperte non aveva cambiato niente).
3. **La soglia dei fold è sul pool di 1.643 utenti con almeno 10 titoli**, non sui soli 1.535 del banco: un utente del banco è nel fold del suo indice nel pool ordinato.
4. **Il caso cross usa il grafo del catalogo serie**: altre scelte (un grafo unico, o un componente di ponte esplicito) darebbero altri numeri, e il −1,43 va letto come «questo modo di usare TV non fa da ponte», non come «il ponte non esiste».
5. **`CFst` è già nel grafo serie**: parte del guadagno della co-visione potrebbe essere ridondanza con il pubblico previsto, che ha la stessa formula (predire il comportamento dai metadati) e un'altra fonte (MovieLens).
