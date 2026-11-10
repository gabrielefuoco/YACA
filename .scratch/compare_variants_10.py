import json
import math
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, "services")
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
import graph.camminata as _cam

golden_file = Path(".scratch/golden_10_profiles.json")
golden = json.loads(golden_file.read_text(encoding="utf-8"))

engine = Engine.carica_transizione()
w_aff = I.carica_matrice_affinita()

users = [
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

def evaluate_variant(name, ppr_func):
    _cam.ppr_multi = ppr_func
    total_shelves = 0
    total_titles = 0
    max_rel = 0.0
    max_abs = 0.0
    order_mismatches = 0

    for u in users:
        chiavi, _, plays, eta = K.storia_trakt(u, ordine="recente")
        semi = [{"key": str(k), "plays": float(pl), "eta_giorni": float(et)} for k, pl, et in zip(chiavi, plays, eta)]
        shelves = I.scaffali(engine=engine, semi=semi, n=8, W_aff=w_aff)

        gold_shelves = golden[u]["shelves"]
        for sh, g_sh in zip(shelves, gold_shelves):
            total_shelves += 1
            for t_idx, (t, gt) in enumerate(zip(sh.titoli, g_sh["titoli"])):
                total_titles += 1
                if t["key"] != gt["key"]:
                    order_mismatches += 1
                s_score = float(t["punteggio"])
                g_score = float(gt["punteggio"])
                abs_d = abs(s_score - g_score)
                rel_d = abs_d / max(g_score, 1e-12)
                if abs_d > max_abs:
                    max_abs = abs_d
                if rel_d > max_rel:
                    max_rel = rel_d

    print(f"=== {name} ===")
    print(f"  Shelves: {total_shelves}, Titles: {total_titles}")
    print(f"  Order mismatches: {order_mismatches}")
    print(f"  Max absolute diff: {max_abs:.3e}")
    print(f"  Max relative diff: {max_rel:.3e}")

# Variant 1: Pure float32 (current)
from graph import parametri as P

def ppr_pure_f32(Tr, E, alpha=None, iters=None, normalizza=False, tol=None, TrT=None):
    alpha = P.ALPHA if alpha is None else float(alpha)
    max_iters = P.ITER if iters is None else min(int(iters), P.ITER)
    tol_val = getattr(P, "PPR_TOL", 1e-5) if tol is None else float(tol)

    dtype = Tr.dtype
    if E.dtype != dtype:
        E = E.astype(dtype, copy=False)
    if TrT is None:
        TrT = Tr.T.tocsr()
    elif TrT.dtype != dtype:
        TrT = TrT.astype(dtype, copy=False)

    B = E.shape[1]
    if B == 0:
        return E.copy()

    alpha_val = dtype.type(alpha)
    beta_val = dtype.type(1.0 - alpha)
    alpha_E = alpha_val * E

    R = E.copy()
    if tol_val > 0.0:
        active = np.ones(B, dtype=bool)
        diff = np.empty_like(R)
        for _ in range(max_iters):
            R_next = TrT @ R
            R_next *= beta_val
            R_next += alpha_E

            np.subtract(R_next, R, out=diff)
            np.abs(diff, out=diff)
            deltas = np.sum(diff, axis=0)

            R[:, active] = R_next[:, active]
            active[active] = deltas[active] >= tol_val
            if not active.any():
                break
    else:
        for _ in range(max_iters):
            R_next = TrT @ R
            R_next *= beta_val
            R_next += alpha_E
            R = R_next

    if normalizza:
        col_sums = R.sum(axis=0)
        col_sums[col_sums < 1e-12] = dtype.type(1.0)
        R /= col_sums

    return R

# Variant 2: Float32 for early iters, float64 for last iters when delta < 1e-4
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
        # Run float32 until coarse convergence (delta < 1e-4)
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

evaluate_variant("Pure float32", ppr_pure_f32)
evaluate_variant("Hybrid float32 + float64 tail", ppr_hybrid_f64_tail)
