# 20 — I legami curati proiettati sulle bolle

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: 09

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
