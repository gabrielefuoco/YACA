# `services/graph` — package di produzione del grafo YACA

`services/graph` è la casa canonica del codice che costruisce e serve il grafo. La build V45 è offline
ed è distinta dal runtime HTTP: il container non scarica dati, non addestra lo studente e non compila
artefatti.

## Build V45

```bash
PYTHONPATH=services py -m graph.build --check
PYTHONPATH=services py -m graph.build --build --version v45-replay
```

Il lock congelato è [`recipes/V45.lock.json`](recipes/V45.lock.json); la ricetta, le impronte e il
protocollo di replay sono in [`V45.md`](V45.md). Il build legge le cache locali e riusa il nuovo
studente; CAST/DIR/PROD sono matrici sorgente congelate per garantire il replay byte-identico. Gli
input densi e gli embedding già materializzati rimangono nella cache locale
`services/graph_dense/data/`; questa è una directory di dati, non un'import dal vecchio package.

## Runtime

- `servizio.py` mantiene per ora l'API `/raccomanda` e il runtime bubble V10: è la versione servita
  mentre si progetta e valida il cutover.
- Il runtime sparse V45 e il suo contratto di scaffali non sono ancora implementati. La migrazione
  end-to-end, per Stremio e API web, è tracciata in `.scratch/v45-raccomandazioni-yaca/map.md`.
- L'immagine Docker è runtime-only: `.dockerignore` esclude `build/`; gli artefatti si promuovono
  offline e il volume dati resta read-only.

## Compatibilità storica

`services/graph_dense/` contiene i dati cache e shim temporanei per script di ricerca; i moduli
sperimentali sono archiviati in `.scratch/graph_dense-archive/`. Il prodotto importa il builder da
`graph.build`, non da `graph_dense` e non da `.scratch`.
