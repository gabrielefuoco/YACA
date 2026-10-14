# 20 — I legami curati proiettati sulle bolle

**Status**: `resolved` · **Type**: `task` · **Blocked by**: 09 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/20-curato-sulle-bolle.md) · ✅ la proiezione è costruita: **973 legami fra bolle (96,9%) e 31 dentro la stessa bolla (3,1%)**. Il controllo con bersagli casuali dà **0 legami interni** (contro 31) e 996 coppie distinte (contro 882): la curatela concentra, ma **solo del 12%**. ✅ L'input alla mappa è dichiarato prima di applicarlo: **2 slot di 8** dove arriva, e tocca solo il **12,2%** delle bolle. ⚠️ **Il 98,4% delle coppie curate non è un arco del grafo** — e leggendole, le prime non sono «mondi che il grafo non collega»: sono **lo stesso mondo che la partizione ha diviso in due** (MCU ↔ MCU, anime ↔ anime). È la terza conferma che la struttura è troppo frammentata (con 11 e 05). ⚠️ E il «3.417 legami» di handoff, specifica e ticket 18-19-20 **non è riproducibile**: i legami sono **1.004 di training + 1.002 di test**.

## What to build

I 3.417 legami curati si **proiettano dalle bolle**: da titolo-a-titolo diventano **bolla-a-bolla**.

Nel grafo dei titoli fanno male (wormhole sulla camminata). Sul grafo quoziente delle bolle non toccano
più la camminata sui singoli titoli e diventano un **segnale d'oro per scegliere i mondi affini**: sono
esattamente ciò che un intenditore sa e un algoritmo no.

La proiezione si separa in due casi, che significano cose diverse:
- legami **dentro** la stessa bolla → un segnale di **appartenenza** (che quella bolla ha un filo vero);
- legami **fra** due bolle → un segnale di **adiacenza** (i mondi affini).

## Acceptance criteria

- [ ] la proiezione è costruita, con il numero di legami bolla-bolla **sopravvissuti** dichiarato
- [ ] i legami intra-bolla e inter-bolla sono **separati** e riportati come due numeri diversi
- [ ] la lista dei «mondi affini» è **letta** per 20 bolle: numero dichiarato di quelli plausibili
- [ ] l'effetto sulla mappa è dichiarato **prima** di applicarlo: quanti degli 8 slot per bolla reclamerebbe — non si applica in silenzio
- [ ] il confronto con gli archi trovati dai dati: i mondi affini della curatela coincidono con i vicini forti del grafo? Dove no, la discordanza è riportata (è la parte interessante)
- [ ] **controllo**: la stessa proiezione fatta su legami **casuali** appaiati per popolarità dà un numero molto diverso

## Da dove nasce

Falso negativo 1 dell'handoff, e la terza delle tre vie suggerite dall'esperto per usare la curatela: non
come archi, non come supervisione densa, ma **al livello delle bolle** — dove diventa un segnale di
navigazione e non un disturbo.
