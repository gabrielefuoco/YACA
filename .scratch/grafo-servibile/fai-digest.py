"""Costruisce un digest unico: le mappe + i 24 ticket + il codice della fase + l'handoff.

Esclude di proposito: i 24 report (`ricerche/`, 208 KB), i log, e tutto il resto di YACA.
Uso: lo interprete di gitingest, cosi' non serve installare niente.
"""
import pathlib
from gitingest import ingest

INCLUDE = [
    ".scratch/grafo-servibile/handoff-senior-2.md",      # il documento per il collega
    ".scratch/grafo-servibile/map.md",                   # la mappa della fase
    ".scratch/grafo-servibile/spec.md",                  # la specifica
    ".scratch/ml-collaborativo/map.md",                  # la mappa della fase precedente
    ".scratch/grafo-servibile/issues/*",                 # i 24 ticket
    ".scratch/grafo-servibile/*.py",                     # gli script della fase
    ".scratch/ml-collaborativo/canone.py",               # il modulo canonico del grafo
]

summary, tree, content = ingest(".", include_patterns=INCLUDE, output="digest.txt")
print(summary)
print("--- albero, prime righe ---")
print("\n".join(tree.splitlines()[:28]))
d = pathlib.Path("digest.txt")
print(f"\nfile: {d.resolve()} · {d.stat().st_size/1024:.0f} KB")
