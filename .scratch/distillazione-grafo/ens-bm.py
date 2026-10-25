"""Ensemble b10+m1 con pesi variabili. Il coseno = w_b*cos_b + w_m*cos_m."""
import numpy as np
from services.graph_dense import config as C
Zb = np.load(C.DATA / "b10.npz")["Z"].astype(np.float32)
Zm = np.load(C.DATA / "m1.npz")["Z"].astype(np.float32)
Zb /= (np.linalg.norm(Zb, axis=1, keepdims=True) + 1e-9)
Zm /= (np.linalg.norm(Zm, axis=1, keepdims=True) + 1e-9)
for wb in (0.5, 0.6, 0.7, 0.8):
    wm = 1.0 - wb
    Z = np.concatenate([np.sqrt(wb) * Zb, np.sqrt(wm) * Zm], 1).astype(np.float16)
    np.savez_compressed(C.DATA / f"ens{int(wb*100):02d}.npz", Z=Z,
                        mu=np.zeros((2, Z.shape[1]), np.float16), dim=np.array(Z.shape[1]))
    print("ens", wb, wm, Z.shape)
