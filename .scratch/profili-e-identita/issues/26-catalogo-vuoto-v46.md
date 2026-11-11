Status: needs-info
Type: task
Blocked by: —

# V46: un catalogo dichiarato e vuoto (`yaca_35935_series`)

## Il fatto

Dopo la promozione di V46, la sonda sui cataloghi serviti dà **170 cataloghi, 1 vuoto**:

```
yaca_35935_series [series] -> 0 (HTTP 200)
```

Con V45 erano 170 e zero vuoti. Non è un guasto del deploy: health `ok`, i percorsi puntano a
`data/v46-*`, gli altri 169 cataloghi hanno titoli.

## Cosa si è già escluso

| ipotesi | verifica |
|---|---|
| il catalogo è nella configurazione del profilo | **no**: la stringa `35935` non compare in nessun punto del documento `config` |
| lo scaffale è nella cache degli scaffali | **no**: la chiave `modo_generale::generale` è **vuota**; la lista viene risolta dal vivo |

Quindi il nome nasce dalla risoluzione live degli scaffali: il grafo lo restituisce, e il percorso del
catalogo (`catalog/series/yaca_35935_series.json`) non trova titoli.

## Le due cause candidate

1. **lo scaffale ha titoli quando si elenca, e zero quando si serve** — due risoluzioni con leve
   diverse (la lezione già pagata nel pool: se le leve del pool e quelle del resolver non coincidono,
   «i cataloghi che Esplora elenca resterebbero senza titoli», `src/pool/index.js:395`);
2. **lo scaffale è stato svuotato da un filtro** (medium, anime, bambini) e il percorso di elenco non
   applica la regola «uno scaffale senza titoli non si dichiara», che invece il servizio applica
   (`servizio.esegui_scaffali`: `if not titoli_out: continue`).

## Il passo che serve

Instrumentare **la stessa id** nei due percorsi e confrontare:
`contestoEsplora(...)` → definizioni, contro `catalogHandler` → titoli. Con i `console.log` già
presenti (`[Scaffali] ... serviti N scaffali dinamici`, `[Esplora] ... non servibili/non elencati`) si
dovrebbe vedere subito se lo scaffale c'è in una fase e non nell'altra.

## Perché `needs-info`

Non so ancora quale delle due sia: il dato manca, non la decisione. Se è la 2, la correzione è nella
regola di elenco (una riga); se è la 1, è il disallineamento delle leve, che è un bug più serio e vale
la pena di essere trovato ora che i modi sono cinque e le leve si derivano.
