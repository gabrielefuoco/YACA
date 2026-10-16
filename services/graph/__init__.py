"""Il grafo di YACA — il modulo, con una casa sua.

Estratto da `.scratch/` il 15/10/2026, quando il lavoro e' arrivato al punto di dover essere usabile
da qualcuno che non l'ha scritto.

  canon.py        il cuore: i titoli, le matrici, i banchi, i ranghi, i CONTRATTI
  bubbles.py      il costruttore delle bolle: la miscela dei componenti, Leiden, la potatura
  collocator.py   la collocazione di un titolo nuovo: V1 per la bolla, V3 per i vicini, la regola dei voti
  plots.py        gli embedding delle trame via Ollama
  pipeline.py     il comando unico: `python -m graph.pipeline <sottocomando>`

Gli originali in `.scratch/` sono diventati **shim di due righe** che rimandano qui: i 117 script di
misura continuano a funzionare, e la verita' e' una sola.
"""
__version__ = "1.0"
