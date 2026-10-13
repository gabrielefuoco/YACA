# 01 — La recall stratificata e pesata per auto-informazione

**Status**: `resolved` · **Type**: `task` · **Blocked by**: nessuno · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/01-recall.md) · le metriche funzionano e la popolarità fa **0,00%** su mezzo+coda (la prova che la stratificazione isola il segnale). ⚠️ Il numero canonico **non si riproduce** (29,56 contro 29,61): la causa è dimostrata — `boot-B.npz` è stato rigenerato dopo la misura di riferimento. ⚠️ E l'effetto della rarità è **2×**, non 8-15× come stimava l'esperto.

## What to build

Il modulo delle misure riporta, accanto alla recall globale, **due metriche nuove** — su entrambi i
cataloghi e dentro il protocollo temporale.

**Recall stratificata**: l'oro di test si divide in tre fasce per quantili di popolarità globale del
catalogo (testa = top 5%; mezzo = 5-25%; coda = sotto il 25%), e si riporta la fascia **mezzo+coda**
separatamente.

**Recall pesata per auto-informazione**: ogni successo pesa `(-log2 P_pop)^gamma` invece di 1, con
gamma configurabile.

La recall globale **resta** — come numero di sanità, non come strumento di decisione.

## Acceptance criteria

- [ ] la recall globale esistente è **identica al decimale** prima e dopo (le metriche si aggiungono, non sostituiscono)
- [ ] la baseline di popolarità fa ~100% dei suoi punti sulla testa e ~0% su mezzo+coda, **stampato come prova** che la stratificazione isola il segnale
- [ ] ogni misura stampa i tre numeri insieme: globale / mezzo+coda / auto-informazione
- [ ] gamma è configurabile e vengono riportati sia 0,5 sia 1,0 (il numero cambia, e di quanto)
- [ ] un'etichetta chiara: i numeri presi con lo split casuale sono marcati **legacy** nell'output
- [ ] il controllo del catalogo film: aggiungendo le metriche, i numeri del catalogo film non si muovono

## Da dove nasce

Domanda 1 dell'handoff all'esperto. La recall grezza misura per l'80% «quanto bene indovini la classifica
globale», ed è strutturalmente inadatta a un requisito che chiede il *non* ovvio.
