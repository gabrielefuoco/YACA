# tre difetti senza parametri

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 01

I tre difetti che non sono scelte: sono bug. Si correggono e basta.

**D1 — Leiden con `n_iterations` non specificato: solo 2 passate.**
Verificato su leidenalg 0.12.0 installato: *«By default, 2 iterations are run»*. **Ogni partizione di
questa fase e' stata costruita con due passate di raffinamento.** Fix: `n_iterations=-1`
(convergenza). Una riga, zero parametri.

**D2 — `msk = Mc.row < Mc.col` su una matrice ASIMMETRICA** (`07-componenti.py:309`).
`M` esce da `K.normalizza`, che normalizza per riga: `Mij != Mji`. Prendere il triangolo superiore
significa che **un arco da riga 5000 a colonna 100 sparisce, e da 100 a 5000 viene tenuto**, con il
peso della riga 100. **I pesi dipendevano da quale titolo ha l'indice piu' basso in
`spazi-trakt.npz`.** Fix: simmetrizzare davvero.
> Questo difetto l'avevo **gia' trovato**: il commento e' in `05-diagnostiche.py:186`. L'ho corretto
> nella diagnostica e **non l'ho propagato a chi costruisce le bolle**.

**D3 — il coseno L2 senza shrinkage** (`07-componenti.py:46`: `nor = sqrt(sum(A^2)) + 1e-9`).
Un film con **una sola keyword** e un altro con la stessa hanno vettori normalizzati identici:
coseno **1,000 esatto**. `argpartition(-d, 30)` riempie i 30 vicini di film semi-vuoti, scavalcando
due film che condividono 6 keyword su 10. Fix: shrinkage bayesiano sulla norma + minimo di 2 keyword
condivise.

**Criterio di chiusura**
- I tre fix applicati in una variante nuova, e il banco sonda del ticket 01 dice **cosa e' cambiato
  nella lettura**. Se non cambia nulla, va detto: sarebbe il segno che il grafo era sporco per altre
  ragioni.

---

## Esito

D2 (row<col su matrice asimmetrica) e' vero e grave, corretto. D3 (coseno L2) e' vero ma con la soglia 0,12 su CAST lo uccide (mediana del grado 0). D1 (n_iterations) e' vero ma IRRILEVANTE: 2 e 6 passate danno la stessa partizione. La lettura: sacchi meglio, due nicchie rotte (Watamote finisce tra i film horror), intruso NON risolto.
