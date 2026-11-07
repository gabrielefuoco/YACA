"""test_carverclan_split.py — Analisi dettagliata di carverclan con separazione rigida del medium."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

from graph.runtime import Engine
from graph import canon as K, interessi as I

def main():
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    chiavi, _, _, _ = K.storia_trakt("carverclan", ordine="recente")
    print(f"carverclan semi ({len(chiavi)}):", chiavi)

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")
    for k in chiavi:
        r = engine.row_of[k]
        print(f"  - {k:15} {titles[r]} ({int(years[r])})")

if __name__ == "__main__":
    main()
