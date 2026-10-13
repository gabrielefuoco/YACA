# 15 — Il cesto: semi con decadimento e allocazione multi-bolla

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: 01, 03

## What to build

Il collo di bottiglia non è l'ordinamento, è il **cesto**: il tetto raggiungibile è al **12%** al @10 e il
modello ne prende già il 29%. Nell'88% dei casi il titolo che l'utente guarderà non è nemmeno fra i
candidati. Due cause, due rimedi.

1. **Aggregazione piatta del profilo.** Se la camminata parte da tutti i titoli dello storico con peso
   uniforme, i gusti di quattro anni fa diluiscono ciò che l'utente stava guardando **adesso**. Rimedio:
   ogni seme pesa per la sua azione e per un **decadimento esponenziale** sulla distanza dalla data di
   taglio, con emivita fra 180 e 365 giorni.
2. **Monocromia del cesto.** Un utente ha 3-5 filoni distinti (anime, crime nordico, commedia italiana).
   Una camminata unica premia i **ponti generici a metà strada** fra i filoni invece dei vertici di
   ciascuno. Rimedio: i candidati si distribuiscono in **quote proporzionali ai cluster recentemente
   attivi** dell'utente.

## Acceptance criteria

- [ ] il tetto del cesto al @10 **sale sopra il 12% misurato**, con il miglioramento dichiarato
- [ ] le due modifiche sono misurate **separatamente** prima di essere combinate (quale delle due porta il guadagno?)
- [ ] il guadagno **sopravvive al protocollo temporale con mascheramento**, non solo allo split casuale
- [ ] la **baseline di popolarità sale meno** del metodo (altrimenti è popolarità travestita)
- [ ] la recall su mezzo+coda (ticket 01) sale
- [ ] l'allocazione multi-cluster non affama l'interesse principale: il cluster dominante conserva una quota dichiarata
- [ ] il cesto non esplode in dimensione: la taglia del cesto è dichiarata e confrontata con quella attuale

## Da dove nasce

La misura del ticket 03 (mascheramento) è quella che ha rivelato il crollo: con lo split temporale la
camminata perde il 50-64% al @10 mentre la popolarità non si muove. Il punto in cui si perde è il cesto.
