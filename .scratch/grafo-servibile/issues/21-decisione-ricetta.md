# 21 — La decisione di ricetta: invarianza cross-dominio e minimax

**Status**: `resolved` · **Type**: `research` · **Blocked by**: 04, 15, 16, 17, 18, 19 · **Chiuso**: 13/10/2026

> ### ⚠️ VERDETTO CORRETTO IL 13/10/2026 — LA DECISIONE E' RIBALTATA
>
> Il ticket `21-bis-coda.py` ha misurato le tre metriche insieme, e **TV peggiora la coda**:
>
> | R1 − R0 | @10 | @100 | @500 |
> |---|---|---|---|
> | GLOBALE | +0,385 | +1,210 | +1,173 |
> | **MEZZO+CODA** | **−0,151** | **−0,994** | **−1,834** |
>
> **La ricetta è stata scelta sulla recall globale, ma il prodotto vuole la coda.** La decisione
> presa qui sotto **non vale**, e va rifatta: [ticket 24](24-ricetta-sulla-coda.md). E' il quarto
> parametro di fila che migliora la testa e peggiora la coda (liste, TV, gating; il decadimento è
> l'unica eccezione).

**Esito originale (superato)**: [report](../ricerche/21-decisione.md) · la ricetta era R1: film = CF + TV(0,5), serie = CFst + B + TV(0,5), k=30 · β=0,25 · α=0,30 — quattro parametri liberi, senza curatela. L'invarianza cross-dominio era soddisfatta (TV da Trakt migliora MovieLens). Ma la scelta è stata fatta **sulla metrica sbagliata**.

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
