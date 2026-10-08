# 20 — Il dosaggio della diffusione: disaccoppiare testa e imbuto

**Status**: `ready-for-agent` · **Type**: `prototype` · **Aperto**: 08/10/2026 · **Blocked by**: 18 (misurato), 11 (consigliato)

## Il fatto misurato

La diffusione laterale L1 è un **compromesso monotòno testa/profondità** (report
[09](../ricerche/09-cancello-prodotto.md)):

| vicini | 2 hop @50 | 2 hop @200 | cluster @50 |
|---|---|---|---|
| 0 | **5,9** | 8,7 | **2,9** |
| 2 | 5,5 | 9,1 | 2,6 |
| 10 (oggi) | 4,9 | **10,7** | 1,3 |

Affilare i pesi non cambia nulla: la testa si perde per la **presenza** dei vicini, non per la forma.

## L'ipotesi da provare

Il profilo diventa sfocato (più cluster con peso) e ordina peggio; ma la profondità serve
all'**imbuto**, non alla classifica. Quindi **disaccoppiare**:

- diffusione **piena** quando si generano i **candidati** (item side);
- diffusione **zero o minima** per il **vettore del profilo** che ordina.

Atteso: la profondità di C (+2 @200) **senza** la perdita di testa.

## Come (senza toccare la produzione)

`HierarchicalGraph.vectorizeKeywords` è chiamata sia per gli item sia per il profilo, e il dosaggio
(0,6 · top-10) è una costante in `HierarchicalGraph.js:122`. Opzioni, in ordine di pulizia:

1. **nel prototipo**: iniettare due adiacenze diverse (piena per gli item, vuota per il profilo) e
   verificare l'effetto sul banco — zero modifiche a `src/`;
2. **se funziona**: parametrizzare il dosaggio come opzione della funzione (una riga, reversibile).

## Cancelli

1. 2 hop @50 **≥ 5,9** *e* @200 **≥ 10,5** nello stesso braccio (è il punto: averli insieme).
2. Il cluster @50 non deve scendere sotto 2,8.
3. Statistica forte o almeno 2-3 profili in più (ticket 11): il ±1 punto è dentro il rumore.
