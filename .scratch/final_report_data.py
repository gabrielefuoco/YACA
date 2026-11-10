import time
import json
import statistics
import sys
import psutil
import numpy as np

sys.path.insert(0, "services")
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
import graph.servizio as S
from graph import parametri as P

def get_rss():
    return psutil.Process().memory_info().rss / 1e6

e = Engine.carica_transizione()
w_aff = I.carica_matrice_affinita()
TrT = e.TrT
n = TrT.shape[0]
B = 24

# 1. Per-iteration cost measurement
R64 = np.ones((n, B), dtype=np.float64)
R32 = np.ones((n, B), dtype=np.float32)

# float64 TrT @ R
t0 = time.perf_counter()
for _ in range(50):
    Y64 = TrT @ R64
cost_f64_matmul = (time.perf_counter() - t0) / 50 * 1000

# float32 TrT @ R
t0 = time.perf_counter()
for _ in range(50):
    Y32 = TrT @ R32
cost_f32_matmul = (time.perf_counter() - t0) / 50 * 1000

# Full float32 iteration (matmul + fused update + diff)
alpha_val = np.float32(0.85)
beta_val = np.float32(0.15)
E32 = np.ones((n, B), dtype=np.float32) / n
alpha_E = alpha_val * E32
diff = np.empty_like(R32)
active = np.ones(B, dtype=bool)
R_work = E32.copy()

t0 = time.perf_counter()
for _ in range(50):
    R_next = TrT @ R_work
    R_next *= beta_val
    R_next += alpha_E
    np.subtract(R_next, R_work, out=diff)
    np.abs(diff, out=diff)
    deltas = np.sum(diff, axis=0)
    R_work[:, active] = R_next[:, active]
cost_f32_full_iter = (time.perf_counter() - t0) / 50 * 1000

# 2. Scaffali timing, breakdown, iteration counts for warnok & pepsipex
profiles = ["warnok", "pepsipex", "carverclan", "sangam456"]
profile_data = {}

for u in profiles:
    c, _, p, et = K.storia_trakt(u, ordine="recente")
    semi = [{"key": str(k), "plays": float(pl), "eta_giorni": float(e_)} for k, pl, e_ in zip(c, p, et)]
    
    # Warmup
    S.esegui_scaffali({"semi": semi}, e)
    
    # Measure total scaffali p50 over 7 runs
    times_scaffali = []
    for _ in range(7):
        t0 = time.perf_counter()
        S.esegui_scaffali({"semi": semi}, e)
        times_scaffali.append((time.perf_counter() - t0) * 1000)
    
    # Measure breakdown
    t_clust_start = time.perf_counter()
    # Clustering part of scaffali
    shs = I.scaffali(engine=e, semi=semi, n=8, W_aff=w_aff)
    
    # Iteration count of the batched walk for this profile
    # Let's intercept ppr_multi to record U and iters
    iter_info = {}
    from graph import camminata as _cam
    orig_multi = _cam.ppr_multi
    def capture_multi(Tr, E, *args, **kwargs):
        iter_info["U"] = E.shape[1]
        t_walk_start = time.perf_counter()
        res = orig_multi(Tr, E, *args, **kwargs)
        iter_info["walk_ms"] = (time.perf_counter() - t_walk_start) * 1000
        return res
    _cam.ppr_multi = capture_multi
    I.scaffali(engine=e, semi=semi, n=8, W_aff=w_aff)
    _cam.ppr_multi = orig_multi

    profile_data[u] = {
        "p50_ms": round(statistics.median(times_scaffali), 1),
        "min_ms": round(min(times_scaffali), 1),
        "max_ms": round(max(times_scaffali), 1),
        "U_unique_seeds": iter_info.get("U", 0),
        "walk_ms": round(iter_info.get("walk_ms", 0), 1),
        "total_seeds": len(semi),
        "shelves_count": len(shs),
    }

# Peak RSS
rss_peak = round(get_rss(), 1)

report = {
    "cost_f64_matmul_ms": round(cost_f64_matmul, 2),
    "cost_f32_matmul_ms": round(cost_f32_matmul, 2),
    "cost_f32_full_iter_ms": round(cost_f32_full_iter, 2),
    "rss_peak_mb": rss_peak,
    "profile_data": profile_data,
}

print(json.dumps(report, indent=2))
