import time
import sys
import statistics
import numpy as np

sys.path.insert(0, "services")
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
import graph.camminata as _cam
import graph.servizio as S
from graph import parametri as P

e = Engine.carica_transizione()
w_aff = I.carica_matrice_affinita()

def ppr_hybrid_f64_tail(Tr, E, alpha=None, iters=None, normalizza=False, tol=None, TrT=None):
    alpha = P.ALPHA if alpha is None else float(alpha)
    max_iters = P.ITER if iters is None else min(int(iters), P.ITER)
    tol_val = getattr(P, "PPR_TOL", 1e-5) if tol is None else float(tol)

    if TrT is None:
        TrT = Tr.T.tocsr()

    B = E.shape[1]
    if B == 0:
        return E.copy()

    dtype32 = np.float32
    E32 = E.astype(dtype32, copy=False)
    alpha_val32 = dtype32(alpha)
    beta_val32 = dtype32(1.0 - alpha)
    alpha_E32 = alpha_val32 * E32
    R32 = E32.copy()

    if tol_val > 0.0:
        active32 = np.ones(B, dtype=bool)
        diff32 = np.empty_like(R32)
        # Run float32 while deltas >= 1e-4
        for it in range(max_iters):
            R_next = TrT @ R32
            R_next *= beta_val32
            R_next += alpha_E32

            np.subtract(R_next, R32, out=diff32)
            np.abs(diff32, out=diff32)
            deltas = np.sum(diff32, axis=0)

            R32[:, active32] = R_next[:, active32]
            active32[active32] = deltas[active32] >= 1e-4
            if not active32.any():
                break

        # Refine in float64 for final convergence (delta < tol_val = 1e-5)
        E64 = E.astype(np.float64, copy=False)
        alpha_val64 = float(alpha)
        beta_val64 = float(1.0 - alpha)
        alpha_E64 = alpha_val64 * E64
        R64 = R32.astype(np.float64)
        active64 = np.ones(B, dtype=bool)
        diff64 = np.empty_like(R64)

        for it in range(max_iters):
            R_next = TrT @ R64
            R_next *= beta_val64
            R_next += alpha_E64

            np.subtract(R_next, R64, out=diff64)
            np.abs(diff64, out=diff64)
            deltas = np.sum(diff64, axis=0)

            R64[:, active64] = R_next[:, active64]
            active64[active64] = deltas[active64] >= tol_val
            if not active64.any():
                break

        if normalizza:
            col_sums = R64.sum(axis=0)
            col_sums[col_sums < 1e-12] = 1.0
            R64 /= col_sums
        return R64

_cam.ppr_multi = ppr_hybrid_f64_tail

# Warmup
for u in ['warnok', 'pepsipex']:
    c, _, p, et = K.storia_trakt(u, ordine='recente')
    semi = [{'key': str(k), 'plays': float(pl), 'eta_giorni': float(e_)} for k, pl, e_ in zip(c, p, et)]
    S.esegui_scaffali({'semi': semi}, e)

for u in ['warnok', 'pepsipex']:
    c, _, p, et = K.storia_trakt(u, ordine='recente')
    semi = [{'key': str(k), 'plays': float(pl), 'eta_giorni': float(e_)} for k, pl, e_ in zip(c, p, et)]
    tempi = []
    for _ in range(5):
        t0 = time.perf_counter()
        S.esegui_scaffali({'semi': semi}, e)
        tempi.append((time.perf_counter() - t0) * 1000)
    print(f'HYBRID {u}: p50={statistics.median(tempi):.1f} ms, min={min(tempi):.1f} ms, max={max(tempi):.1f} ms')
