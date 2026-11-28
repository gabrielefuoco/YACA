"""Package di produzione del grafo YACA.

`servizio.py` e `runtime/` sono il servizio: camminata sparsa su V45.
La build offline V45 e' in `graph.build` (non gira nel container di serving):

  PYTHONPATH=services py -m graph.build --check
  PYTHONPATH=services py -m graph.build --build --version v45-replay

Il rollback non e' piu' il V10: e' la release precedente.
"""
__version__ = "1.1"
