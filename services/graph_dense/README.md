# `graph_dense` — compatibilità per dati e ricerca storica

Il codice di produzione del grafo V45 è stato trasferito in [`services/graph`](../graph/). La CLI
ufficiale è:

```bash
PYTHONPATH=services py -m graph.build --check
PYTHONPATH=services py -m graph.build --build --version v45-replay
```

Questo package non contiene più l'implementazione del builder V45. I moduli rimasti qui sono shim
per gli script di ricerca storici; gli esperimenti sono archiviati in
`.scratch/graph_dense-archive/` e il namespace aggiunge quella cartella per mantenere gli import
storici durante la transizione.

## Dati locali conservati

`data/` contiene cache derivate ancora richieste dalla build: canone/TF-IDF V10, embedding trama,
lo studente V45 congelato e embedding riusabili. Sono dati, non codice attivo del recommender; non
scaricarli né eliminarli senza aver verificato il lock V45.

Per la ricetta canonica, gli hash congelati, i tre tipi sorgente stabilizzati e i criteri di replay,
vedi [`services/graph/V45.md`](../graph/V45.md) e
[`services/graph/recipes/V45.lock.json`](../graph/recipes/V45.lock.json).
