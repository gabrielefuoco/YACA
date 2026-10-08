# 14 — La verifica finale: le liste servite (rank 10→30)

**Status**: `ready-for-agent` · **Type**: `research` · **Aperto**: 08/10/2026 · **Blocked by**: 10 (consigliato)

## Dove siamo

L'imbuto misura i **candidati**, non le liste. Il recall sui candidati è un passaggio utile ma non è la
metrica di prodotto: quella è **cosa arriva nei primi N posti serviti** dopo punteggio, re-ranking e diversità.

## Cosa fare

Misurare su un campione di profili: (a) quanti titoli *nuovi e pertinenti* entrano in **top 10 / top 30** con
i candidati del grafo rispetto a `fetchSmartAndPool`; (b) l'incremento in **diversità** delle liste (copertura
di titoli distinti, entropia dei generi/cluster); (c) i **costi**: 824 candidati contro 1.851 è un risparmio,
ma il grafo aggiunge una lettura di `.npz` e un k-NN.

## Cosa decide

Se il grafo entra in produzione, e con quale strategia (100% dei candidati, o blend con il pool attuale solo
per le fasce dove vince). È l'ultimo cancello prima del [ticket 15](15-decisione-integrazione.md).
