# 16 — Il gating condizionato al grado per i titoli nuovi

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: 01, 03, 07

## What to build

Un titolo appena uscito o di nicchia si collega **dodici volte peggio** di uno già noto (2,4% contro
28,5% al @10). Il pubblico previsto da solo porta +0,31 punti: spalma il titolo nuovo su un pubblico
medio che non lo descrive.

Ma i componenti strutturali ci sono già e coprono molto: keyword al 99,6%, cast e regia al 70-95%,
firma produttiva quasi al 100%. Il motivo per cui nell'ablation **facevano male** è che su un titolo
caldo — che ha già ottimi archi comportamentali — aggiungerli introduce rumore rispetto al comportamento
vero.

La soluzione è il **mixing condizionato al grado**: il blocco strutturale pesa per un fattore

```
lambda(i) = tau0 / (tau0 + d_behav(i))
```

dove `d_behav(i)` è il grado del titolo nei componenti comportamentali. Per un classico con centinaia di
archi comportamentali lambda ≈ 0: comanda il comportamento puro, **nessuna degradazione sulla testa**. Per
un titolo appena uscito (grado zero) lambda = 1: il titolo entra nel grafo agganciandosi esattamente ai
film dello stesso regista, dello stesso franchise, degli stessi attori e delle stesse micro-keyword — e
viene collocato nella sua bolla dall'incidenza degli archi, senza bisogno di comportamento.

## Acceptance criteria

- [ ] la recall sui **titoli freddi** sale ben sopra il 2,4% @10 attuale (e il miglioramento è dichiarato su entrambi i banchi del curato, caldo e freddo)
- [ ] i titoli **caldi non degradano**: i numeri della camminata sulla popolazione calda restano invariati entro una tolleranza dichiarata
- [ ] `tau0` è esplorato e si individua il plateau (la scelta non è un punto solo)
- [ ] **la spiegazione è verificata**: si riproduce il danno dei metadati sui nodi caldi, e si mostra che il gating lo rimuove — se non si riproduce, la spiegazione è sbagliata e va scritta così
- [ ] il componente `d_behav` è dichiarato: quali componenti contano come comportamento e quali no
- [ ] il costo non cresce: i parametri liberi restano quelli, `tau0` sostituisce una scelta a mano

## Da dove nasce

Buco 3 dell'handoff. È il ticket che, se funziona, rende la coda del catalogo raggiungibile — cioè metà
del valore dichiarato del prodotto.
