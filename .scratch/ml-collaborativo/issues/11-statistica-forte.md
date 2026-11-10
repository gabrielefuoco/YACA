# 11 — La statistica forte: utenti MovieLens tenuti fuori

**Status**: `wontfix` · **Type**: `research` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno

## Il problema

Tutte le misure dell'imbuto poggiano su **5 profili reali e 75 trial**. È una statistica debole: basta che un
profilo sia atipico e il 3,1× cambia. In più i profili sono nostri, costruiti da cronologie Stremio dove
l'80% è serie — il terreno dove il teacher è cieco.

## Cosa fare

Gli utenti MovieLens hanno **32M di voti veri e tenuti fuori**: si usa una parte dei voti per costruire il
profilo, i restanti come verità (leave-out). Si passa da 5 profili a **migliaia**, con intervalli di confidenza.

Attenzione al disegno: separare gli utenti usati per costruire il **teacher** da quelli usati per **valutarlo**
(altrimenti il teacher ha già visto quei gusti, ed è una forma di leakage).

## Cosa decide

È il numero che rende difendibile (o no) tutto il filone davanti a una decisione di prodotto. Senza, ogni
confronto resta «5 profili hanno detto 3,1×».

## Chiusura

Chiuso con la mappa il 10/11/2026, per decisione esplicita. La mappa era già chiusa come ricerca il 13/10/2026 e l'esito è nel V45 servito oggi; i ticket rimasti erano la coda da «passare in rassegna». Restano scritti qui: se una domanda tornerà utile, si riparte da questo testo invece che da zero.
