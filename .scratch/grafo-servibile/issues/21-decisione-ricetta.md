# 21 — La decisione di ricetta: invarianza cross-dominio e minimax

**Status**: `resolved` · **Type**: `research` · **Blocked by**: 04, 15, 16, 17, 18, 19 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/21-decisione.md) · **la ricetta è R1: film = CF + TV(0,5), serie = CFst + B + TV(0,5), k=30 · β=0,25 · α=0,30 — QUATTRO parametri liberi, senza curatela.** ✅ **L'invarianza cross-dominio è soddisfatta e verificata ora per la prima volta**: TV, estratta dalle cronologie **Trakt**, migliora il banco **MovieLens** di **+0,39 al @10 e +1,21 al @100** — ed è il primo componente della sessione che migliora **entrambi** i banchi. ✅ Le liste (R2) **non entrano**: +0,20 al @100 non paga una regressione di **−1,34 su mezzo+coda** e l'effetto sul banco Trakt non è mai stato misurato. Il decadimento (+0,13) e il gating (+0,25) restano fuori: sotto il rumore e con un parametro in più ciascuno. I pesi appresi restano fuori: misurati su **un** banco solo. ⚠️ **Il minimax rigoroso non è applicabile**: i tre banchi usano protocolli diversi, quindi la regola 2 è stata applicata dentro ciascun banco e la scelta è ricaduta sulla regola 1, che è l'unica che attraversa i banchi in modo sensato.

## What to build

Il conflitto fra i banchi non si risolve, si governa. Ogni banco premia i componenti nati dalla propria
origine — è **autocorrelazione del campionamento**, non un errore: il banco nato dalle cronologie Trakt
premia la co-visione e la curatela (che sono Trakt), il banco nato dal comportamento MovieLens premia il
comportamento (che è MovieLens).

Due regole, per decidere senza scegliere il banco che ci dà ragione.

1. **Invarianza cross-dominio.** Un componente estratto da una sorgente si valida se migliora o **non
   degrada** il banco dell'altra sorgente. Un componente di comportamento si valida sul banco
   comportamentale di origine opposta.
2. **Minimax normalizzato.** Poiché le scale assolute dei due banchi differiscono, si misura la
   **percentuale del tetto** di ciascuno (o il guadagno relativo alla baseline di popolarità di **quel**
   banco) e si sceglie la ricetta che massimizza il **minimo** dei due guadagni.

## Acceptance criteria

- [ ] la regola è scritta e **datata prima** di produrre i numeri — la data del documento è la prova
- [ ] le ricette candidate sono **enumerate prima**, non cercate dopo aver visto i risultati
- [ ] la ricetta scelta è riportata col **guadagno minimo** e col **banco perdente dichiarato**
- [ ] la ricetta non ha più parametri liberi di quella di oggi (quattro)
- [ ] **un negativo dichiarato è un risultato ammesso**: se nessuna ricetta vince sul minimo, il documento lo dice invece di eleggere un vincitore
- [ ] il micro-banco (ticket 22) **non esiste**, per decisione del 13/10/2026 (`wontfix`): la decisione lo **dichiara** nel suo esito, e non si inventa una terza opinione che non c'è

## Da dove nasce

Domanda 4 dell'handoff (buco 6): il conflitto fra i banchi sul catalogo film. È la decisione che chiude
la fase, e l'unico modo onesto di prenderla è fissare la regola prima di conoscere la risposta.
