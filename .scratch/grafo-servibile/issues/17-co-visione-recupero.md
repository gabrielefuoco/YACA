# 17 — La co-visione nel grafo di recupero

**Status**: `resolved` · **Type**: `task` · **Blocked by**: 01, 03 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/17-covisione.md) · ✅ **il guadagno più grande e più solido della sessione, e non è contaminazione**: con 5 fold in cui TV è costruito sui 4/5 degli utenti e valutato sull'1/5 mai visto, il catalogo **serie** passa da 2,86% a **5,04%** al @10 (**+77%**), da 16,52% a 24,40% al @100, da 43,82% a 54,08% al @500 — **5 fold su 5**, con delta di deviazione standard ±0,05-0,21. E anche il catalogo **film** migliora (+1,09 al @10). ❌ **Ma il ponte cross-medium NON funziona**: il caso serie→film **peggiora** (−0,15 al @100, −1,43 al @500, 5 fold su 5). Il dato attraversa il confine, l'uso no: mettere TV nel grafo di partenza infittisce quel lato e la camminata resta lì. Il ponte va costruito esplicito. ⚠️ E c'è una discrepanza di banco non risolta: questo script trova **1.535** utenti dove `canone.banco_trakt` ne trova 1.063 — uno dei due conteggi è sbagliato.

## What to build

La co-visione ricavata dalle cronologie Trakt entra nel **grafo di recupero**, per entrambi i cataloghi —
oggi vive solo nel grafo delle bolle.

È il pezzo che risolve la contraddizione strutturale del prodotto: il catalogo film usa solo il
comportamento (che copre i film e **zero** serie), il catalogo serie usa il pubblico previsto e il
`related` (che è **mono-medium**). L'unico ponte fra i due medium nel recupero è oggi una predizione da
metadati — mentre la co-visione è **l'unico segnale comportamentale vero che attraversa il confine
film ↔ serie**.

La validazione si fa con una **cross-validazione a 5 fold** sulle cronologie: quattro quinti costruiscono
il componente, un quinto fa da banco. Perché il segnale non si validi su sé stesso.

## Acceptance criteria

- [ ] il componente entra in **entrambi** i cataloghi e la recall **cross-medium** sale, con il numero dichiarato
- [ ] il protocollo a 5 fold è dichiarato e la **varianza fra i fold** è riportata (un fold solo non è un risultato)
- [ ] la contaminazione è **esclusa per costruzione**: nessuna cronologia del fold di banco ha contribuito al componente
- [ ] il controllo del catalogo film: i numeri si muovono **solo dove il componente arriva**, e la portata è dichiarata
- [ ] il confronto onesto con il grafo delle bolle: il guadagno cross-medium del recupero è confrontato con quello che il componente dà già alle bolle
- [ ] il costo di costruzione è dichiarato e confrontato con gli altri componenti

## Da dove nasce

Falso negativo 2 dell'handoff: le cronologie sono state usate **solo come banco**, mai come segnale di
recupero. E il ticket 12 del filone precedente (il trasferimento alle serie) era il rischio più grosso
rimasto aperto.
