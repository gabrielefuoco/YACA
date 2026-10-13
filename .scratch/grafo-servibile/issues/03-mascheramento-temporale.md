# 03 — Il test a tempo T: il mascheramento comportamentale

**Status**: `ready-for-agent` · **Type**: `prototype` · **Blocked by**: nessuno

## What to build

Il protocollo temporale smette di essere ottimista: per ogni utente tagliato al tempo T, **gli archi
comportamentali dei titoli usciti dopo `T − 90 giorni` sono azzerati** (comportamento, co-visione,
co-visione dalle cronologie). Per quei titoli restano attivi solo i componenti noti all'uscita:
pubblico previsto, keyword, regia, cast, produzione. I titoli usciti **dopo la fine della finestra di
test** sono esclusi dal cesto.

Il grafo conosce il futuro perché è costruito su cronologie complete; questo lo rende cieco su ciò che
l'utente non poteva ancora conoscere.

## Acceptance criteria

- [ ] il mascheramento è **verificabile**: un titolo uscito dopo `T − 90 giorni` ha peso comportamentale **zero** e peso strutturale **non zero**
- [ ] la recall sui titoli usciti nella finestra di test è riportata **separatamente** da quella sui titoli stabili
- [ ] i numeri con mascheramento sono confrontati con quelli senza, e la differenza è **dichiarata**
- [ ] controllo di degenerazione: un utente il cui oro è tutto precedente a `T − 90 giorni` ottiene numeri **identici** con e senza mascheramento
- [ ] il costo non esplode: nessuna ricostruzione per utente, solo mascheramento in fase di valutazione

## Cautela dichiarata

Il livello 2 (ticket 04) esiste per verificare questo. Se i due livelli divergono, **non si media**: si
riporta la divergenza.
