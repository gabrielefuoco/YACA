# 10 — Il banco appaiato per popolarità: quanto vantaggio resta dopo aver tolto la fama?

**Status**: `ready-for-agent` · **Type**: `research` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno

## Il buco, dichiarato

Nell'imbuto il grafo 2 hop fa 5,9% @50 e il rank **per sola popolarità** dentro quegli stessi candidati ne
spiega **4,9**. E il pool di produzione, ordinato per popolarità, fa 0,9%. Quindi buona parte del vantaggio
potrebbe essere «il grafo pesca titoli più popolari del pool», non «il grafo capisce il gusto».

## Cosa fare

Confronto **appaiato**: per ogni trial si confrontano grafo e pool **dentro la stessa fascia di voti**
(0-50, 50-200, 200-1.000, 1.000+), e si riporta il vantaggio **per fascia**. In più: la distribuzione dei voti
dei candidati dei due bracci (già nota: 63 mediani contro 22) accanto al recall.

## Cosa decide

- Se il vantaggio **sopravvive nelle fasce basse** → il grafo porta gusto, non fama, e questo diventa un
  argomento forte per la produzione.
- Se **scompare** → il vantaggio è (in buona parte) un effetto di popolarità, e va detto: cambia il valore del
  filone e va corretto il modo di scegliere i semi (normalizzare per popolarità).
