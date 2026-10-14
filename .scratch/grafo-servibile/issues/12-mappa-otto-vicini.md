# 12 — La mappa: otto vicini tipizzati per bolla

**Status**: `resolved` · **Type**: `task` · **Blocked by**: 10, 11, 23 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/12-mappa.md) · ✅ la base è **1 sola componente connessa** (62.214 archi) e **tutte le 5.297 bolle hanno 8 slot tipizzati** (min 8, max 8), zero isolate. ✅ Le sei adjacency verificate del ticket 09 sono **tutte nella mappa** con il tipo giusto. ✅ **La lettura è ottima**: Fassbinder ha **7 slot su 8** di cinema tedesco/europeo d'autore (il tamburo di latta, la satira di Berlino, *Possession* come salto vibe), i mostri anni '50 **8 su 8** (fino a *Il mostro della laguna nera*), e la bolla di commedie polacche riceve come slot cross-medium **una serie polacca** ✓✓ — la promessa del prodotto realizzata dentro il grafo. ⚠️ **Ma il ponte cross-medium non si può garantire per tutte**: solo il **19,4%** delle bolle ha ≥2 slot cross-medium e il **59,8%** ne ha zero, perché ci sono 4.385 bolle film contro 912 serie. Il ponte va garantito nel catalogo servito, non nel grafo.

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
