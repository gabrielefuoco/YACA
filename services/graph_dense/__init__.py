"""Compatibilità temporanea per gli script di ricerca archiviati.

Il codice di produzione V45 vive in `graph.build`; gli esperimenti storici sono in
`.scratch/graph_dense-archive`. Questo namespace mantiene import e CLI legacy durante la migrazione.
La directory `data/` è soltanto cache locale e non contiene più l'implementazione del motore.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SERVICES = ROOT / 'services'
ARCHIVE = ROOT / '.scratch' / 'graph_dense-archive'
if str(SERVICES) not in sys.path:
    sys.path.insert(0, str(SERVICES))
if str(ARCHIVE) not in __path__:
    __path__.append(str(ARCHIVE))

__version__ = 'legacy-compat'
