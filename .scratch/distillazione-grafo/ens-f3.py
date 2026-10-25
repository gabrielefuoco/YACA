"""Ensemble a inferenza: concat dei Z normalizzati (b10, m1, f3) con pesi uniformi.
Il coseno dell'ensemble = media dei coseni dei membri. Nessun training."""
import numpy as np
from services.graph_dense import config as C
MODS = ["b10", "m1", "f3"]
Z = {}
for n in MODS:
    z = np.load(C.DATA / f"{n}.npz")["Z"].astype(np.float32)
    z /= (np.linalg.norm(z, axis=1, keepdims=True) + 1e-9)
    Z[n] = z
w = {n: 1.0 / len(MODS) for n in MODS}
Zs = np.concatenate([np.sqrt(w[n]) * Z[n] for n in MODS], 1).astype(np.float16)
mu = np.zeros((2, Zs.shape[1]), np.float16)
np.savez_compressed(C.DATA / "ens.npz", Z=Zs, mu=mu, dim=np.array(Zs.shape[1]))
print("ens", Zs.shape, "membri", MODS)
