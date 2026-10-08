# 09 — Il cancello di prodotto: la struttura migliore non arriva alle liste da sola

**Data**: 08/10/2026 · **Banco**: `bench-graph-funnel.js` con `L1_ADJ=` · 75 trial, 5 profili reali

## Cinque bracci, un solo pomello

Avevo verificato prima che l'adiacenza **non entra** nel grafo dei film (le sue feature leggono i nodi
L1/L2/L3 dal JSON): entra nei **vettori del DNA e del profilo**, via `vectorizeKeywords`. Quindi il test
giusto è il banco, con la diffusione iniettata.

| braccio | vicini | 2hop @50 | 2hop @200 | cluster @50 | cluster @200 | POOL @50 | POOL @200 |
|---|---|---|---|---|---|---|---|
| **A** — nessuna (produzione) | 0 | **5,9** | 8,7 | **2,9** | 7,3 | 1,9 | 4,2 |
| **B** — PPMI ricostruita | 10 | **5,9** | 9,2 | 2,8 | 7,8 | 1,9 | 4,9 |
| **C** — **appresa dal teacher** | 10 | 4,9 | **10,7** | 1,3 | 7,0 | 2,2 | **5,9** |
| **D** — appresa, pesi affilati (cubo) | 10 | 4,8 | 10,5 | 1,3 | 7,1 | 1,9 | 5,9 |
| **E** — appresa, **2 vicini** | 2 | 5,5 | 9,1 | 2,6 | 7,4 | 2,1 | 4,3 |

Controllo fisso in ogni braccio: la colonna "solo popolarità" sui **candidati fissi** del 2 hop resta
**4,9** in tutti e cinque → i candidati sono gli stessi, cambia solo l'ordinamento dello scorer.

## Cosa dicono i numeri

1. **È un compromesso monotòno testa/profondità**, e il pomello è il **dosaggio** della diffusione:
   - **0 vicini** → testa massima (5,9 · 2,9), profondità minima (8,7);
   - **10 vicini** → profondità massima (**10,7** · cluster 7,0) e testa minima (4,9 · **1,3**);
   - **2 vicini** → tutto torna vicino al baseline (5,5 · 2,6 · 9,1).
2. **Nessun dosaggio vince su entrambe.** Il contributo marginale dello scorer a @200 sopra la
   popolarità: A 3,8 · B 4,3 · **C 5,8 (+53%)** · E 4,4. Ma a @50 il cluster perde 1,6 punti e il 2 hop 1,0.
3. **Affilare i pesi (D) non cambia niente**: la testa non si perde per la *forma* dei pesi ma per la
   **presenza** dei vicini. L'ipotesi della "sfocatura per forma" è **respinta** dal dato.
4. **Con 2 vicini l'adiacenza appresa non aggiunge nulla di misurabile**: i pesi imparati, a basso
   dosaggio, valgono il baseline. Il vantaggio strutturale (+0,068 di AUC) si trasferisce come
   **pomello di dosaggio**, non come guadagno gratuito.

## L'onestà che serve

**75 trial su 5 profili: differenze di ±1 punto a @50 sono dentro il rumore** e non ho intervalli di
confidenza. L'effetto più solido è il +1,8/+2,0 @200 (C e D, concordi, su un denominatore più grande):
suggestivo, non provato. La statistica forte è il ticket 11, e questo risultato la rende urgente.

## L'idea che nasce da qui (la più forte della giornata)

La testa si perde perché **il profilo** diventa sfocato (più cluster con peso). Ma il guadagno di
profondità serve all'**imbuto**, non alla classifica. Quindi:

> **disaccoppiare il dosaggio**: diffusione piena per **generare i candidati**, diffusione zero (o minima)
> per il **vettore del profilo** che ordina. Si prende la profondità senza pagare la testa.

Oggi il codice non lo permette: `vectorizeKeywords` è chiamata sia per gli item sia per il profilo, e
il dosaggio (0,6 · top-10) è una costante dentro `HierarchicalGraph.js`. È la prova da fare —
piccola, reversibile, e misurabile con lo stesso banco.

## Verdetto sul cancello

**Non passato.** L'adiacenza appresa migliora la *struttura* (validata contro la realtà: 0,699 contro
0,631 a parità di taglia) ma alle liste arriva come compromesso, non come guadagno. La catena
`struttura → prodotto` **non è automatica**: è la lezione che il filone doveva incontrare, e l'ha
incontrata con un numero invece che con un'impressione.

Il prossimo passo utile non è un modello nuovo: è il **disaccoppiamento** qui sopra (testa vs imbuto) e
la **statistica forte** per dire se il +2 @200 è vero.
