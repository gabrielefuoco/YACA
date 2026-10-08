
# 22 — Dove sta davvero la verità: il taglio era mio

**Data**: 08/10/2026 · 60 account · BFS sui vicini del grafo (fino a 5 salti)

## La correzione

Avevo detto: "il 77% di ciò che gli utenti guardano dopo non è nemmeno fra i candidati, il collo di
bottiglia è la generazione". **Era in gran parte un artefatto del mio strumento**: l'export tagliava il
2 hop a **1.200 titoli**, e il **46% della verità stava a distanza 1-2 dal profilo, dentro quel taglio**.

Dove sta la verità (10.659 titoli in 60 account):

| dove | quota |
|---|---|
| nell'universo (così com'era) | 17,7% |
| **a distanza 1-2 ma TAGLIATA dal cap** | **~46%** |
| a distanza 3 | ~29% |
| a distanza 4 | ~6% |
| oltre 4 | ~0,5% |
| fuori dal grafo | **0,05%** (1 titolo su 10.659) |

Il grafo **contiene praticamente tutta la verità**. Non è un problema di copertura: è di *distanza*.

E i titoli mancanti sono **di nicchia**: 199 voti mediani contro 4.872 dei trovati (24×). Anno mediano
identico (1999 contro 2000): non è un problema di titoli recenti.

## Quanto costa allargare (e cosa guadagna la popolarità)

| insieme di candidati | candidati (mediana) | verità raggiungibile | popolarità @50 | @200 |
|---|---|---|---|---|
| pool proxy (18k) | 17.000 | **66,9%** | 3,9% | 13,4% |
| **pool + 2 hop** | 22.301 | **89,2%** | 3,9% | 13,4% |
| pool + 2-3 hop | 48.741 | 97,7% | 3,9% | 13,4% |
| pool + grafo intero | 87.769 | 100,0% | 3,9% | 13,4% |

**La popolarità dà lo stesso risultato in tutti e quattro i casi.** Non è un caso: ordinando per
popolarità, i titoli aggiunti (tutti meno popolari dei primi 200) non entrano mai in lista. **La
popolarità è satura**: mostra sempre gli stessi titoli famosi e non può raggiungere la nicchia, che è
esattamente dove sta la verità mancante.

## Cosa significa

1. **Il soffitto vero, con i candidati giusti, è l'89,2%**, non il 22,8% che avevo misurato: il pool da
   solo prende il 66,9%, il 2 hop del grafo aggiunge 22 punti.
2. **Allargare oltre il 2 hop costa moltissimo e rende poco**: dal 2 hop al 3 hop i candidati passano da
   22k a 49k (2,2×) per +8,5 punti di soffitto. Il 2 hop è il punto giusto.
3. **La popolarità non è un avversario da battere con più candidati**: è satura per costruzione. La nicchia
   si raggiunge solo con un ordinamento **personalizzato** — il ranker o la posizione collaborativa.
4. Quindi la domanda vera non è più "quanti candidati": è **"il ranker tiene la sua precisione su 22k
   candidati invece che su 4k?"**. Con il vecchio universo (4k, soffitto 22,8%) il ranker prendeva il 78%
   del raggiungibile. Con il soffitto all'89,2% c'è molto più da prendere — e molto più difficile da
   trovare.
