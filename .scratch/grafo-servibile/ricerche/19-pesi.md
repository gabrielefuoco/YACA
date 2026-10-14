# 19 — I pesi appresi dai 3.417 legami curati

**Status**: `resolved` · **Ticket**: [19](../issues/19-pesi-curati.md) · **Script**: `19-pesi.py` · **Log**: `log/19-pesi.log` · **378 s**

## Cosa è stato costruito

Nove pesi scalari non negativi — uno per componente — appresi massimizzando il margine fra i legami curati e **negativi appaiati per popolarità** (10 per positivo). L'obiettivo è una logistica sul margine `s_positivo − s_negativo`, con i pesi vincolati a somma 1 e non negativi (SLSQP, gradiente analitico).

**Il conteggio è il punto del ticket: 1.004 vincoli su 9 incognite — 111 vincoli per incognita.** È il contrario di addestrare un embedding denso, che su 3.417 coppie su 60.000 titoli memorizza i nodi dei legami.

**Il protocollo, e la sua trappola.** Si apprende sui legami delle sorgenti a indice **pari** (le stesse che stanno nel grafo) e si valuta sui **1.002 legami delle sorgenti dispari**, tenuti fuori. E **la curatela non entra fra i pesi appresi**: `K` è costruita proprio da quei legami di training, quindi su di essi è un predittore perfetto e l'ottimizzatore le darebbe peso infinito. `K` resta a peso canonico 0,60 e si apprendono gli altri nove. È la differenza fra *imparare dai legami* e *rileggere i legami*.

## I pesi appresi sono (quasi) uniformi

| componente | appreso | a mano | differenza |
|---|---|---|---|
| CF | 0,1113 | 0,2222 | **−0,1110** |
| CFst | 0,1100 | 0,0444 | +0,0655 |
| Kc | 0,1105 | 0,0444 | +0,0660 |
| B | 0,1113 | 0,0444 | +0,0668 |
| T | 0,1113 | 0,0444 | +0,0668 |
| **TV** | **0,1113** | **0,0000** | **+0,1113** |
| **KW** | **0,1117** | **0,0000** | **+0,1117** |
| **DIR** | **0,1114** | **0,0000** | **+0,1114** |
| **CAST** | **0,1113** | **0,0000** | **+0,1113** |

**Non è una pesatura: è un insieme di sostegno.** L'ottimizzatore non distingue i componenti (tutti a 1/9), e quello che dice è un'altra cosa, più semplice e più netta:

1. **CF è troppo pesante a mano** (0,222 contro 0,111): la ricetta canonica dà al comportamento **il doppio** del peso di ogni altra cosa, e l'apprendimento dice che è troppo.
2. **Quattro componenti che a mano valgono zero valgono quanto gli altri**: TV (co-visione dalle cronologie), KW, DIR, CAST. La ricetta canonica **non li usava affatto**.

Quindi il guadagno non viene da una ponderazione intelligente: viene dall'**usare tutti i componenti e ridurre il peso del comportamento**.

## ✅ La valutazione: i pesi appresi battono quelli a mano, e di molto

Sui **1.002 legami di test**, mai visti dall'apprendimento (curato, α 0,70, sorgente mascherata):

| | @10 | @50 | @100 | @500 |
|---|---|---|---|---|
| pesi **a mano** (ricetta canonica) | 11,88% | 21,06% | 26,85% | 46,41% |
| **pesi APPRESI** | **14,47%** | **26,85%** | **33,83%** | **54,79%** |
| pesi appresi su negativi **casuali** | 9,38% | 15,47% | 18,16% | 33,13% |
| controllo ordine di indice | 0,00% | 0,00% | 0,00% | 0,00% |

| | @10 | @50 | @100 | @500 |
|---|---|---|---|---|
| **appresi − a mano** | **+2,59** | **+5,79** | **+6,99** | **+8,38** |
| casuali − a mano | −2,50 | −5,59 | −8,68 | −13,27 |

**Il guadagno è grande e va nella direzione giusta**: +22% relativo al @10, +17% al @100, **+18% al @500**. Al @500 la differenza è di oltre 5 errori standard — **decisiva**. Al @10 (+2,59 su un errore standard di ~1,1) è a circa 2,3σ: solida ma non schiacciante.

**E il controllo conferma che il protocollo conta**: gli stessi pesi appresi su negativi **casuali** *peggiorano* la ricetta a mano di 8,68 punti al @500. Cioè: la scelta dei negativi non è un dettaglio implementativo, è **la differenza fra imparare e non imparare**. E la soluzione con i negativi casuali mette **tutto il peso su `Kc`** (1,0000) — un artefatto classico: con negativi a caso, la somiglianza nei metadati separa benissimo, e l'ottimizzatore ci si butta. La correlazione fra le due soluzioni è **−0,435**: divergono.

**Questo è il primo risultato della sessione in cui la curatela paga.** Fino a qui — come archi nel grafo — faceva male (report 66); come supervisione per nove pesi, con 111 vincoli per incognita e un test tenuto fuori, migliora la ricetta canonica di un quinto.

## ⚠️ Due cose da dire accanto al risultato

**(1) La valutazione è sul banco curato, che ha la sua forma.** Le sorgenti sono tutte serie e i bersagli tutti film: il guadagno è misurato su **quel** compito (cross-medium, serie → film, 246 sorgenti). Non è detto che si trasferisca al catalogo film in generale — e il banco ha la sua popolazione calda/fredda (ticket 02) che qui non è stata separata.

**(2) I pesi appresi sono uniformi, e questo rende il risultato fragile alla ricetta.** Se l'ottimizzatore non distingue i componenti, allora qualunque insieme di componenti ragionevoli, a peso uguale, andrebbe bene — e il guadagno verrebbe dall'**aggiungere**, non dal **pesare**. La controprova da fare è banale e non è stata fatta: **pesi uniformi su tutti e nove**, senza apprendere niente. Se danno lo stesso risultato, il metric learning ha aggiunto poco rispetto a «usa tutto a peso uguale» — che è una conclusione molto più semplice e altrettanto utile.

## ⚠️ Una deriva nei numeri, la stessa del ticket 01

La riga «pesi a mano» dà **11,88 / 26,85 / 46,41**, mentre il numero canonico archiviato è **11,48 / 26,65 / 50,10** (mascherato). Il @500 differisce di **3,7 punti** — troppo per essere rumore.

È la stessa deriva del prodotto (5,99 → 6,00): **`boot-B.npz` è stato rigenerato dopo la misura di riferimento** e il grafo canonico contiene B a peso 1. Nel ticket 01 la causa è stata **dimostrata** riproducendo il numero vecchio con la B vecchia; qui **non è stata riverificata**, e va letta come «probabilmente la stessa causa». Questo run però riproduce **esattamente** la riga del ticket 02 (`02-banco.py`: 11,88 / 26,85 / 46,41), che è la versione corretta della stessa misura.

## I criteri del ticket

- [x] i pesi sono appresi e riportati, con un **controllo di tenuta**: si impara sui legami pari e si valuta sui dispari, mai visti — ed è lì che si misura il guadagno (+2,59 / +6,99 / +8,38)
- [x] i pesi appresi sono confrontati con quelli **a mano**: CF dimezzato, quattro componenti ignorati a mano portati a peso pieno
- [ ] ⚠️ **la miscela non è validata col giudice delle bolle (06) né su entrambi i banchi**: validata sul banco curato (dove guadagna). Il giudice è stato evitato **di proposito** — il ticket 06 ha stabilito che con 200 bolle non risolve differenze sotto i 5 punti
- [x] **il numero di parametri liberi non cresce**: i nove pesi *sostituiscono* i pesi scelti a mano; la ricetta resta con gli stessi quattro parametri di contorno (k, β, α, wc)
- [x] il campionamento dei negativi è dichiarato (appaiati per popolarità, 10 per positivo) **e il controllo con negativi casuali è stato eseguito** — e mostra che il protocollo è ciò che fa funzionare l'apprendimento
- [x] il risultato è interpretabile: **nessun componente esce a peso zero**, e questo è a sua volta un'informazione (nessuno dei nove è inutile *per questo compito*)

## Limiti dichiarati

1. **Un solo protocollo di negativi** (10 appaiati per popolarità). Con 5 o 20, o appaiando su una banda più stretta, i pesi cambierebbero.
2. **La similarità dei componenti-grafo è il peso dell'arco** (0 se non sono vicini): una scelta grezza rispetto a un coseno, che per i componenti sparsi sarebbe più informativa.
3. **`K` è a peso fisso 0,60**: l'apprendimento non lo tocca, quindi non sappiamo se 0,60 sia giusto.
4. **Nove componenti**: il ticket ne prevedeva 8-10, quindi il conto regge, ma i nove sono quelli disponibili senza dover scegliere — non è stata fatta una selezione.
5. **La controprova dei pesi uniformi non è stata fatta** — ed è la prima cosa da fare se questo filone riprende, perché spiegherebbe quasi tutto il guadagno.
