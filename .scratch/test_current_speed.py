import time
import sys
import numpy as np

sys.path.insert(0, "services")
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
import graph.servizio as S

e = Engine.carica_transizione()
TrT = e.TrT
n, _ = TrT.shape
B = 24

chiavi, _, plays, eta = K.storia_trakt("warnok", ordine="recente")
semi = [{"key": str(k), "plays": float(pl), "eta_giorni": float(et)} for k, pl, et in zip(chiavi, plays, eta)]

# Warmup
S.esegui_scaffali({"semi": semi[:20]}, e)

# Measure scaffali warnok
tempi = []
for _ in range(5):
    t0 = time.perf_counter()
    S.esegui_scaffali({"semi": semi}, e)
    tempi.append((time.perf_counter() - t0) * 1000)

print(f"Current /scaffali warnok p50: {np.median(tempi):.1f} ms, min: {min(tempi):.1f} ms, max: {max(tempi):.1f} ms")
