Status: ready-for-agent
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

## Cosa è stato misurato (11/11/2026)

Quattro sonde sul server, ognuna ha scartato un'ipotesi:

| sonda | esito |
|---|---|
| il catalogo è nella configurazione? | **no**: `35935` non compare in nessun punto del documento `config` |
| lo scaffale è nella cache del profilo? | **no**: la chiave `modo_generale::generale` è vuota |
| il grafo lo restituisce? | **sì**: è uno dei 4 «suggerimenti», `fonte: 'grafo'`, `stremioType: 'series'` |
| il pool ha titoli per quell'id? | **sì: 60**. `buildSharedHeroCatalogs({mediaType:'series'})` → `yaca_35935_series: 60`, tutti serie, nessuno anime, nessuno visto |
| il gestore li serve? | **no: 0 metas in 206 ms**, mentre `yaca_94664_series` (anch'esso 60 nel pool) ne serve 20 |

**Quindi il guasto è nel percorso di servizio, non nel grafo e non nei dati.** Il pool, interrogato
come lo interroga l'**elenco**, ha sessanta titoli; il percorso che **serve** il catalogo ne produce
zero, e in 206 ms — cioè senza costruire niente, il che fa pensare a una risposta vuota già in cache.

L'assegnazione del pool è **esclusiva**: ogni titolo finisce in una sola riga, per non ripeterlo. Se le
due chiamate usano argomenti diversi — `typeSelectors`, `modo`, `kids`, `context` — costruiscono
assegnazioni diverse, e una delle due lascia questa riga vuota. È lo stesso difetto che il codice
documenta già a `src/pool/index.js:395`:

> *«Se il pool leggesse i selettori del profilo, chiederebbe al grafo una politica diversa da quella del
> resolver: chiave di cache diversa, scaffali diversi, e i cataloghi che Esplora elenca resterebbero
> senza titoli.»*

## Il passo che serve

Confrontare gli argomenti delle due chiamate a `buildSharedHeroCatalogs` (elenco contro
`CatalogRouter.routeCatalogRequest`) e allinearli. Il sospetto principale è che il percorso di servizio
non passi `modo`/`leve` come li passa l'elenco.

## Perché non è più `needs-info`

Il dato c'è: il guasto è nel percorso di servizio. Resta da trovare **quale** argomento diverge, e
quello è lavoro di codice, non una decisione. Il sospetto è il disallineamento delle leve.
