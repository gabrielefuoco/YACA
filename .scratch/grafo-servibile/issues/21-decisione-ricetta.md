# 21 — La decisione di ricetta: invarianza cross-dominio e minimax

**Status**: `ready-for-agent` · **Type**: `research` · **Blocked by**: 04, 15, 16, 17, 18, 19

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
- [ ] il micro-banco (ticket 22), se esiste, entra come **terza opinione** e non come arbitro

## Da dove nasce

Domanda 4 dell'handoff (buco 6): il conflitto fra i banchi sul catalogo film. È la decisione che chiude
la fase, e l'unico modo onesto di prenderla è fissare la regola prima di conoscere la risposta.
