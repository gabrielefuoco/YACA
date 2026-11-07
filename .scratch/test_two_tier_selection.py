"""test_two_tier_selection.py — Test two-tier selection and display ordering across all 10 profiles."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

from collections import Counter
import numpy as np
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.interessi import jaccard, Shelf

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
W = I.carica_matrice_affinita()

profs = [
    "sangam456",
    "hammers-lists",
    "sappss",
    "flixinatoor99",
    "moppierhead",
    "castoffcrown",
    "warnok",
    "pepsipex",
    "carverclan",
    "1jacobjohn",
]

def run_two_tier_scaffali(chiavi, righe, plays, eta, n=8):
    return I.scaffali(engine, chiavi, n=n, W_aff=W)

print("Testing with current scaffali (before modifying interessi.py)...")
for p in profs:
    k, r, pl, et = K.storia_trakt(p, ordine="recente")
    shs = I.scaffali(engine, k, n=8, W_aff=W)
    named = [s for s in shs if s.nome_fonte == "tassonomia"]
    unnamed = [s for s in shs if s.nome_fonte == "perche_hai_visto"]
    print(f"{p:<15} | Tot: {len(shs)} | Named: {len(named)} | Unnamed: {len(unnamed)}")
