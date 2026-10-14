"""fai-digest.py — un digest unico: le mappe, i ticket e il codice dei due effort nuovi.

Aggiornato il 14/10/2026 per il TERZO handoff: `bolle-nitrile` e `inserimento`, piu' i documenti che
li spiegano. Esclude di proposito i report (l'evidenza, non la struttura) e i log.

Uso: lo interprete di gitingest, cosi' non serve installare niente.
"""
import pathlib
from gitingest import ingest

INCLUDE = [
    # --- il documento per il collega, per primo
    ".scratch/inserimento/handoff-senior-3.md",
    ".scratch/grafo-servibile/handoff-senior-2.md",
    # --- le mappe e le specifiche
    ".scratch/bolle-nitrile/map.md",
    ".scratch/inserimento/map.md",
    ".scratch/grafo-servibile/map.md",
    ".scratch/grafo-servibile/spec.md",
    ".scratch/ml-collaborativo/map.md",
    # --- i ticket (16 nuovi + i 24 della fase precedente)
    ".scratch/bolle-nitrile/issues/*",
    ".scratch/inserimento/issues/*",
    # --- il codice
    ".scratch/bolle-nitrile/*.py",
    ".scratch/inserimento/*.py",
    ".scratch/ml-collaborativo/canone.py",
]

summary, tree, content = ingest(".", include_patterns=INCLUDE, output="digest.txt")
print(summary)
print("--- albero, intestazioni ---")
print("\n".join(tree.splitlines()[:14]))
d = pathlib.Path("digest.txt")
print(f"\nfile: {d.resolve()} · {d.stat().st_size/1024:.0f} KB")
