# 19 — I pesi appresi dai legami curati

**Status**: `resolved` · **Type**: `research` · **Blocked by**: 01, 07 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/19-pesi.md) · ✅ **la curatela come supervisione PAGA**: i pesi appresi battono quelli a mano di **+2,59 al @10, +6,99 al @100, +8,38 al @500** sui 1.002 legami di test **mai visti** dall'apprendimento. 1.004 vincoli su 9 incognite (111 per incognita). I pesi appresi sono quasi **uniformi** (1/9 ciascuno): il guadagno non viene dal pesare, viene dall'**usare quattro componenti che a mano valevano zero** (TV, KW, DIR, CAST) e dal **dimezzare CF** (0,222 → 0,111). ✅ Il controllo con negativi **casuali** conferma che il protocollo conta: perde di 8,68 al @500 e mette tutto il peso su `Kc` (un artefatto). ⚠️ Da fare: la controprova dei **pesi uniformi senza apprendere**, che spiegherebbe quasi tutto il guadagno.

## What to build

I **3.417 legami scritti a mano da un intenditore** sono conoscenza reale. Come **archi nel grafo** fanno
male: la loro distribuzione di grado è artificiale (pochi nodi iper-connessi secondo il gusto
dell'autore) e funzionano da *wormhole* per la camminata, distorcendo le stazionarie e rompendo le bolle.

Ma buttarli via è uno spreco. Si usano per **apprendere i pesi di combinazione dei componenti**: da 8 a 10
pesi scalari **non negativi**, dove la similarità fra due titoli è la somma pesata dei componenti. Si
massimizza il margine fra i legami curati e **negativi appaiati per popolarità** (il banco appaiato
esiste già dal filone precedente).

Il punto è il conteggio: **3.417 vincoli su 8 gradi di libertà non possono andare in overfitting**. Il
contrario di addestrare un embedding denso, che su 3.417 coppie su 60.000 titoli memorizza i nodi dei
legami — cosa già osservata in questa sessione.

## Acceptance criteria

- [ ] i pesi sono appresi e riportati, con un **controllo di tenuta**: una parte dei legami è tenuta fuori dall'apprendimento e il margine si verifica su quelli
- [ ] i pesi appresi sono confrontati con quelli **scelti a mano**: dove discordano? La discordanza è la parte informativa
- [ ] la miscela risultante è validata col giudice automatico delle bolle (06) **e** su entrambi i banchi
- [ ] **il numero di parametri liberi non cresce**: i pesi appresi *sostituiscono* quelli scelti a mano, non si sommano
- [ ] il campionamento dei negativi è dichiarato (appaiato per popolarità) e si esegue un **controllo con negativi casuali**: se i pesi cambiano molto, il segnale appreso è la popolarità
- [ ] il risultato è interpretabile: se un componente esce con peso zero, va detto e va spiegato — è un'informazione sulla ricetta

## Da dove nasce

Falso negativo 1 dell'handoff, e risposta alla domanda 5. Il vincolo «troppo poco per addestrare, troppo
di gusto per generalizzare» è vero per un modello ad alta capacità, e **falso** per otto pesi scalari.
