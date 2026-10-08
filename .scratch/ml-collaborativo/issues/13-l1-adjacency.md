# 13 — `L1_adjacency`: scritto dal builder, assente dal JSON di produzione

**Status**: `needs-triage` · **Type**: `research` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno

## Il fatto

`offline_graph_builder/build_graph.py:512` **scrive** `L1_adjacency` — i collegamenti fra i macro-gruppi L1 —
ma il JSON consumato in produzione **non la contiene**. Conseguenza: la **diffusione fra L1 non parte mai**,
e il livello gerarchico, pur connesso per il 91% degli item, pesa una **mediana dello 0,1%** sul punteggio
tematico ([report](../../livello-latente/ricerche/02-dosaggio.md)).

## Perché sta qui e non nel filone del DNA

Perché è il **collegamento fra i due filoni**: la mappa dei nodi e le loro adiacenze è esattamente la base su
cui poggia l'idea degli embedding appresi ([ticket 09](09-embedding-appresi.md)). Non è un dettaglio di pulizia:
è infrastruttura che esiste già da una parte e manca dall'altra.

## Cosa fare (da decidere)

1. Verificare se l'assenza è voluta (peso) o una dimenticanza del build di produzione.
2. Se è una dimenticanza: ricostruire il JSON e **misurare** l'effetto del dosaggio
   ([ticket 02 di `livello-latente`](../../livello-latente/issues/02-peso-livelli-alti.md)).
3. **Tocca `src/` e la produzione**: richiede decisione esplicita dell'utente, non è un esperimento.
