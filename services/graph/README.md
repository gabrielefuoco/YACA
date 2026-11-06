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
- `runtime/` contiene il motore sparse V45 (`Engine`, PageRank personalizzato) e il banco di misura.
- Il contratto di scaffali e i cluster per profilo non sono ancora implementati: la migrazione
  end-to-end, per Stremio e API web, è tracciata in `.scratch/v45-raccomandazioni-yaca/map.md`.
- L'immagine Docker è runtime-only: `.dockerignore` esclude `build/`; gli artefatti si promuovono
  offline e il volume dati resta read-only.

### Transizione potata: l'unico percorso adatto al container

Caricare il triangolo V45 e simmetrizzarlo a runtime costa **~1.435 MiB di picco RSS** con qualunque
valore di potatura (misurato: `pota=16` 1.434,9 MiB, `pota=None` 1.434,7 MiB), quindi non entra nei
512 MiB del container. La transizione va precalcolata offline una volta:

```bash
PYTHONPATH=services py -m graph.runtime.prepara --pota 16
# scrive services/graph/data/v45-transizione/transizione-pota16.npz (10 MB, prov tracciata)
PYTHONPATH=services py -m graph.runtime.bench   # la tabella memoria/latenza
```

```python
from graph.runtime import Engine
engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
engine.raccomanda([("movie:603", None, "loved")], cap=60, medium="movie", esclusi=esclusi)
```

Misurato sulla transizione precalcolata: **190,7 MiB** di picco, **1,05 s** di avvio, **134 ms** per
richiesta (p95 147 ms). `Engine.carica()` resta un percorso di laboratorio, non di servizio.
L'artefatto è generato e quindi gitignored: si rigenera con il comando qui sopra, e `prepara` rifiuta
di scrivere dentro `data/v45/` per non toccare il grafo congelato.

## Compatibilità storica

`services/graph_dense/` contiene i dati cache e shim temporanei per script di ricerca; i moduli
sperimentali sono archiviati in `.scratch/graph_dense-archive/`. Il prodotto importa il builder da
`graph.build`, non da `graph_dense` e non da `.scratch`.
