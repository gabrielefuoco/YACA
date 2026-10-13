# 02 — Il banco curato diviso in caldo e freddo

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: nessuno

## What to build

Il banco di giudizio esperto si divide in **due popolazioni** e non si media mai più.

Le 83 sorgenti **calde** (con grado comportamentale) misurano la qualità della camminata. Le 163
**fredde** (grado comportamentale nullo) sono un banco dedicato al **problema dei titoli nuovi**. Ogni
report riporta la **coppia**, mai la media.

## Acceptance criteria

- [ ] la divisione riproduce le due popolazioni misurate (83 calde / 163 fredde)
- [ ] ogni report stampa `(Curato-Warm @10/@100, Curato-Cold @10/@100)` come numeri **distinti**
- [ ] il **controllo dell'ordine di indice** è stampato per **entrambe** le popolazioni
- [ ] nessun numero aggregato è prodotto da nessuna parte senza le sue due componenti accanto
- [ ] il divario fra le due popolazioni è dichiarato come proprietà del banco, non come risultato di un metodo

## Da dove nasce

Il banco è rotto: due popolazioni che distano 12× (28,5% contro 2,4% al @10). L'aggregato è dominato
dalla popolazione fredda, dove l'artefatto dell'ordine di indice «guadagna» dal nulla.
