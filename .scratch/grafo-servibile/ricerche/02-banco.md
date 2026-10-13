# 02 — Il banco curato diviso in caldo e freddo, e le metriche nuove sopra le due popolazioni

**Status**: `resolved` · **Ticket**: [02](../issues/02-banco-caldo-freddo.md) · **Script**: `02-banco.py` · **Log**: `log/02-banco.log` · **265 s**

## Cosa è stato costruito

Una funzione nuova nel modulo canonico, **accanto** a `banco_curato` (che resta intatta):
`banco_curato_split` restituisce le stesse sorgenti, i loro bersagli e la colonna, **più** la
divisione in caldo/freddo.

La definizione è quella diagnosticata nel report 61: una sorgente è **CALDA** se il suo titolo
compare anche come **bersaglio** di un legame di una sorgente di *training* — quindi ha archi di
curatela in entrata nel grafo (che è simmetrico) e **non è cold start**. È **FREDDA** se non ha
nessun arco: è cold start vero, ed è la domanda «un titolo nuovo».

## La divisione riproduce quella misurata

| | sorgenti | legami | mediana legami/sorgente |
|---|---|---|---|
| **CALDE** | **83** | 347 | **4** |
| **FREDDE** | **163** | 655 | **4** |
| *(aggregato che non va più stampato)* | 246 | 1.002 | 4 |

La mediana dei legami è **la stessa** nelle due popolazioni: la differenza non è *quanti* legami
hanno, è *se il mondo curato le tocca*. Tutte le 246 sorgenti sono **serie**, tutti i 1.002
bersagli sono **film** (cross-medium per costruzione).

## I numeri — e questa volta mai mediati

Camminata canonica sui due cataloghi, α 0.70, sorgente mascherata. Fra parentesi il controllo
dell'ordine di indice, che è la cosa che ogni metodo deve battere.

| | CALDE (83) | FREDDE (163) |
|---|---|---|
| camminata @10 | **28,82%** | **2,90%** |
| camminata @100 | 49,57% | 14,81% |
| camminata @500 | 67,72% | 35,11% |
| camminata, **mezzo+coda** @10 | **23,00%** | **3,35%** |
| camminata, auto-informazione (γ=1) @10 | 28,28% | 2,99% |
| popolarità @10 | 0,86% | 0,46% |
| popolarità, **mezzo+coda** @10 | **0,00%** | **0,00%** |
| ordine di indice @10 | 1,73% | 0,76% |
| ordine di indice, **mezzo+coda** @10 | **0,00%** | **0,00%** |
| casuale @10 | **0,00%** | **0,00%** |

**Il divario è una proprietà del banco, non il risultato di un metodo:**

| | @10 | @50 | @100 | @500 |
|---|---|---|---|---|
| rapporto calde/fredde | **9,9×** | 5,8× | 3,3× | **1,9×** |

⚠️ **Fatto nuovo**: il divario **si stringe** con N. A @10 le due popolazioni sono due mondi
diversi; a @500 sono quasi la stessa cosa. Significa che la difficoltà delle sorgenti fredde non è
«non le trovo mai» ma «non le trovo *in testa*» — ed è esattamente lì che il prodotto vive.

## Perché non si media (ed è dimostrato, non affermato)

L'aggregato sui 1.002 legami dà **11,88% / 26,85% / 46,41%**. Non è un numero intermedio qualsiasi:
è **esattamente la media pesata** delle due popolazioni —

```
(347 × 28,82 + 655 × 2,90) / 1.002 = 11,88   ✓
```

— e non descrive **nessuna** delle due. È il numero che il banco ha usato finora.

## I criteri del ticket

- [x] la divisione riproduce le due popolazioni misurate (**83 / 163**) — e anche la mediana dei legami, che è 4 per entrambe
- [x] ogni report stampa le due popolazioni come numeri distinti, in ogni sezione (camminata, popolarità, i due controlli)
- [x] il controllo dell'ordine di indice è stampato per **entrambe** (1,73% e 0,76% @10)
- [x] nessun numero aggregato è prodotto senza le sue due componenti: l'aggregato è stampato **solo** in fondo, etichettato «non va più stampato», come dimostrazione
- [x] il divario è dichiarato come proprietà del banco
- [x] i tre controlli obbligatori ci sono tutti e si comportano come devono: popolarità **0,00%** su mezzo+coda, ordine di indice **0,00%** su mezzo+coda, casuale **0,00%** ovunque

## Quello che questo ticket aggiunge alla mappa

1. **Le metriche nuove funzionano anche qui**: la popolarità e l'ordine di indice fanno *zero* su
   mezzo+coda in entrambe le popolazioni. È la seconda conferma della prova del ticket 01, su un
   banco completamente diverso.
2. **Il divario caldo/freddo non è un artefatto di quantità**: stessa mediana di legami. Il ticket 16
   (gating λ_cold) ha ora il suo banco, e sa che la partita si gioca **in testa**, non a @500.
3. **Il banco curato resta un banco di gusto**: 246 sorgenti di serie, 1.002 bersagli film, scritti
   da un intenditore. Non è un campione, non è una popolazione: è il giudizio di una persona. Va
   usato come **bussola**, mai come arbitro (ticket 21).

## Limiti dichiarati

- La definizione di «calda» è un **proxy**: «compare come bersaglio di un legame di training». È
  verificabile e riproducibile, ma non è la definizione di «titolo che il mondo curato tocca» se non
  nel senso degli archi.
- Le due popolazioni hanno **83 e 163 sorgenti**: il divario a @500 (1,9×) poggia su 655 legami, e
  il suo intervallo di confidenza non è stato calcolato. Un divario piccolo su un campione piccolo
  è un divario che potrebbe non esserci.
- Il controllo dell'ordine di indice è **identico** nelle due popolazioni (1,10% sul banco intero)
  perché è una permutazione fissa: non è una coincidenza, è la definizione di quel controllo.
