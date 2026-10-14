# 04 — Lo snapshot globale a T_cut (livello 2)

**Status**: `resolved` · **Ticket**: [04](../issues/04-snapshot-globale.md) · **Script**: `04-snapshot.py` · **Log**: `log/04-snapshot.log` · **233 s**
**Dipendenze**: ticket 03 (il livello 1). **Protocollo**: banco prodotto, split temporale, mascheramento.

## Cosa è stato fatto

**Una sola** data di taglio e **una sola** ricostruzione, come il ticket chiedeva:

| | |
|---|---|
| interazioni di training (utenti disgiunti dai 2.000 di valutazione) | 29.593.755 |
| **T_cut = 75° percentile dei timestamp** | **2019-02-23** |
| interazioni prima di T_cut | 22.195.316 (75,0%) |
| **CF ricostruito sul solo passato** | 128 dimensioni · **29.854 film con un vettore** |
| grafo FILM a T_cut | 1.377.946 archi |
| utenti con oro dopo T_cut | **230 su 997** |

## ⚠️ I due livelli DIVERGONO, e va riportato senza mediare

| | @10 | @100 | @500 | @2000 |
|---|---|---|---|---|
| **grafo a T_cut** (CF dal solo passato) | 1,93% | 12,09% | 33,95% | 61,76% |
| grafo COMPLETO (conosce il futuro) + mascheramento | **2,09%** | **13,69%** | **37,29%** | **67,18%** |
| **differenza** | **−0,16** | **−1,59** | **−3,34** | **−5,42** |

**Il grafo ricostruito sul solo passato va PEGGIO del grafo completo.** Quindi la conoscenza del futuro **aiuta**, e i numeri temporali archiviati **sono ottimistici** — che è la premessa con cui questa fase è nata, e che il ticket 03 sembrava aver ribaltato.

### Cosa dicono insieme, allora, i due livelli

| | misura | esito |
|---|---|---|
| **03 — mascheramento** (livello 1) | azzerare la propagazione dei titoli usciti dopo T−90 | **la mascherata va MEGLIO** (+0,72 al @100) |
| **04 — ricostruzione** (livello 2) | costruire CF sul solo passato | **il grafo completo va MEGLIO** (−1,59 al @100) |

**Non sono in contraddizione: misurano due cose diverse.**

- Il **livello 1** toglie la capacità dei titoli freschi di *fare da ponte*: e si scopre che i loro archi portavano il gusto dell'audience delle uscite recenti, che non è quello dell'utente. Toglierli **aiuta**.
- Il **livello 2** toglie **un terzo degli archi del grafo** (da 49.041 film con un vettore a 29.854) e chiede agli utenti di essere serviti da una struttura più povera. **Peggiora**.

**La cosa onesta da dire**: il livello 1 misura l'effetto di una *maschera*, il livello 2 misura l'effetto di un *grafo più povero*. Nessuno dei due è «il grafo a tempo T» — quello sarebbe un grafo costruito sul passato **con la stessa copertura**, e non è stato possibile costruirlo.

## ⚠️ Il confondente che impedisce la conclusione netta

**Il grafo a T_cut copre 29.854 film con un vettore, quello completo 49.041.** Il 39% del catalogo che il grafo a T_cut non conosce è esattamente quello con meno comportamento — cioè la coda, che è la parte che conta per il prodotto.

Quindi il −5,42 al @2000 è in parte **copertura** e in parte **conoscenza del futuro**, e questo esperimento non li separa. Per separarli servirebbe un grafo a T_cut **riempito** sui film scoperti con gli stessi metodi del grafo completo (il pubblico previsto, che è condizionato al metadato e non al tempo).

## Un numero che ho stampato e che non significa niente

```
confronto coi vettori completi: coseno mediano -0,023
```

Il coseno mediano fra i vettori a T_cut e quelli completi è **≈ 0** — e l'ho stampato come se fosse un'informazione. **Non lo è**: un SVD ha una base determinata a meno di rotazioni e di segno, quindi due decomposizioni di dati diversi danno basi non allineate e coseni riga-per-riga distribuiti intorno a zero **anche se i due spazi sono quasi identici**. Servirebbe un allineamento (Procrustes) o un confronto fra similarità indotte, non fra vettori. **Lo dico perché è il tipo di numero che si finisce per citare.**

## I criteri del ticket

- [x] **un solo rebuild** produce lo spazio, con la copertura dichiarata (**29.854 film**, il 60% del grafo completo)
- [x] gli utenti dopo T_cut sono validati (**230**) e i numeri confrontati col mascheramento (livello 1)
- [x] la domanda è esplicita e ha una risposta: **i due livelli NON concordano in direzione** (uno dice «la mascherata va meglio», l'altro «il completo va meglio»)
- [x] **la divergenza è riportata, non lisciata** — con l'interpretazione che la spiega (maschera contro grafo più povero)
- [x] il costo è dichiarato: **233 s** (di cui ~60 s per il rebuild dell'SVD), contro i ~5 min del mascheramento istantaneo

## Limiti dichiarati

1. **230 utenti** con oro dopo T_cut: è il 23% del banco, e un campione piccolo. Le differenze al @10 (−0,16) sono dentro il rumore; quelle a @500 e @2000 (−3,34 e −5,42) no.
2. **Il confondente della copertura non è controllato** (sopra): è il limite più serio, e impedisce di attribuire il peggioramento alla conoscenza del futuro invece che alla povertà del grafo.
3. **Il livello 2 non ha il mascheramento applicato al grafo completo per il confronto a parità**: il grafo completo qui **è** mascherato (VIVO) ✓, quindi il confronto è fra «T_cut + mascheramento» e «completo + mascheramento» ✓ — il che è giusto, ma significa che la differenza misura **solo** il contributo degli archi futuri **che il mascheramento non copre**.
4. **Un solo T_cut** (il 75° percentile): un taglio più alto darebbe un grafo più povero e uno più basso un grafo più vicino al completo. La conclusione «il futuro aiuta» è robusta in direzione, non in ampiezza.
5. **T_cut = 2019** è dentro la finestra di MovieLens ma il catalogo TMDB arriva al 2026: gli archi «futuri» includono sette anni di uscite, molto più della finestra di test di un utente tipico. È una scelta severa, non neutra.
