"""SHIM — il codice vive in `graph/canon.py`. Questo file rimanda li' per non rompere i 117 script
che lo importano. Modificare `graph/canon.py`, non qui: dal 15/10/2026 questo file e' generato.
"""
import pathlib, sys
_radice = pathlib.Path(__file__).resolve().parents[2]
if str(_radice) not in sys.path:
    sys.path.insert(0, str(_radice))
from graph.canon import *          # noqa: F401,F403
from graph.canon import ML, ROOT   # noqa: F401
