# 17 — La co-visione nel grafo di recupero

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: 01, 03

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
