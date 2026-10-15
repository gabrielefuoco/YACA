"""SHIM — lo script vive in `graph/upstream/contaminazione.py`.

Serve a rigenerare gli input del modulo (le partizioni di keyword, le co-visioni Trakt, gli spazi CF).
`.scratch/` e' l'archivio di cio' che non usiamo: questo si usa, quindi sta nel modulo.
"""
import pathlib, sys, runpy
_radice = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_radice))
runpy.run_path(str(_radice / "graph" / "upstream" / "contaminazione.py"), run_name="__main__")
