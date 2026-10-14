# 12 — La mappa: otto vicini tipizzati per bolla

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: 10, 11, 23

## What to build

L'adiacenza finale di ogni bolla, non con una soglia fissa ma per **quote bilanciate**:

- **4 slot di continuità canonica**: i vicini con il massimo punteggio combinato sui due assi.
- **2 slot di salto *vibe***: i vicini con il massimo sull'asse comportamentale **fra quelli che hanno
  bassa sovrapposizione di genere e keyword**.
- **2 slot di ponte cross-medium**: se la bolla è a maggioranza film, due slot sono riservati a bolle a
  maggioranza serie (e viceversa), scelti sul legame comportamentale e sulla firma produttiva.

Otto vicini, non mille: la differenza fra una **proposta** e un **elenco**.

## Acceptance criteria

- [ ] ogni bolla ha esattamente 8 vicini tipizzati (o meno, con la ragione dichiarata)
- [ ] ogni bolla ha **≥2 vicini cross-medium** — o il fallimento è contato e dichiarato (e se fallisce, è un risultato, non un dettaglio)
- [ ] nessuna bolla è isolata e nessuna bolla ha uno slot canonico vuoto
- [ ] l'adiacenza è scritta come **documento sfogliabile**: per 30 bolle campionate, gli 8 vicini con il loro tipo
- [ ] la lettura: quante delle adiacenze campionate sono plausibili
- [ ] la quota cross-medium è **garantita dal contenuto**, non dalla speranza: una bolla a maggioranza film con due vicini serie è verificabile a mano

## Da dove nasce

La mediana di 1.103 vicini è ciò che rende oggi il grafo inutilizzabile come mappa. Le otto quote sono la
risposta: quattro per restare nel mondo, due per il salto che vale la pena, due per attraversare il
medium — che è il requisito dichiarato del prodotto e oggi il più debole.
