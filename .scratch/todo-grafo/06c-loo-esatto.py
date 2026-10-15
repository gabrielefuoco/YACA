"""SHIM — lo script vive in `graph/measure/loo_esatto.py`.

E' un ARBITRO: misura la qualita' del sistema. Gli arbitri stanno nel modulo, non nell'archivio.
"""
import pathlib, sys, runpy
_radice = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_radice))
runpy.run_path(str(_radice / "graph" / "measure" / "loo_esatto.py"), run_name="__main__")
