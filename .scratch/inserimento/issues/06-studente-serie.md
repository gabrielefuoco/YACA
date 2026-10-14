# studente per le serie

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 04

Lo studente `metadati -> Cf` non ha serie (`Cf` viene da MovieLens, che non ha serie). Qui si fa lo stesso lavoro del ticket 01 con un target che le serie ce l'hanno: una **SVD(128) di `B`**, la co-visione Trakt.

---

## Esito

**Fatto, e ha smontato due cose.** Report in `ricerche/06-studente-serie.md`.

- Il modello `FX -> B_svd` è addestrato in **3 secondi** su 14.723 serie e salvato in `inserimento-modello-serie.npz`.
- **Non migliora la collocazione**: 1,3% di bolle esatte contro il 2,2% dello studente dei film (differenza dentro il rumore su 600 campioni). Migliora invece il caso peggiore: 0,2% di bolle non collegate contro 1,8% (124x meglio del caso contro 11x).
- **Il criterio «adiacente» non discrimina**: la mappa ha il 79,4% di coppie adiacenti, quindi il «100% nel quartiere giusto» del ticket 04 era gonfiato. Il criterio forte è la propria bolla.
- **Il fallimento delle serie nel ticket 04 era un artefatto mio** (la maschera `ha` azzerava le righe delle serie e il ranking cadeva sui pareggi). Il ticket 04 è stato corretto.

**Conseguenza**: la collocazione delle serie è debole con **entrambi** gli studenti. La strada migliore rimasta è l'**appoggio film** (ticket 03-bis), che esiste nel 58,7% dei casi.
