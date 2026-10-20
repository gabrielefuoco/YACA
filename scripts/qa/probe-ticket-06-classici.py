"""probe-ticket-06-classici.py — Sonda minimal per Ticket 06 (Classici imperdibili del tuo mondo)."""
import pathlib
import sys
import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
ROOT = QUI.parents[1]
sys.path.insert(0, str(ROOT / "services"))

from graph import parametri as P
from graph import motore as MO
from graph import bubbles as B
from graph import canon as K

exec(open(QUI / "probe-ticket-05-gemme.py").read().split("def test_due_profili_opposti")[0])

def main():
    m = build_dual_world_graph()
    storia = [("movie:1000", 1, "watched", None)]
    res = m.lista(storia, cap=20, medium="movie")
    liste = res["liste"]
    tipi = [l["tipo"] for l in liste]
    print("Tipi righe:", tipi)
    assert "classici_imperdibili" in tipi, "riga classici_imperdibili assente"
    cls = next(l for l in liste if l["tipo"] == "classici_imperdibili")
    print("classici titoli:", [t[0] for t in cls["titoli"][:5]])
    print("corta:", cls.get("corta"), "target:", cls.get("target_dimensione"))
    print("OK")
    sys.exit(0)

if __name__ == "__main__":
    main()
