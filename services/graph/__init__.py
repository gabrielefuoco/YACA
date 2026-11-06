"""Package di produzione del grafo YACA.

`motore.py`/`servizio.py` mantengono il runtime bubble V10 come percorso di rollback durante la
migrazione. La build offline V45 e' in `graph.build` (non gira nel container di serving):

  PYTHONPATH=services py -m graph.build --check
  PYTHONPATH=services py -m graph.build --build --version v45-replay

La pipeline legacy `graph.pipeline` e' mantenuta temporaneamente per gli artefatti bubble.
"""
__version__ = "1.1"
