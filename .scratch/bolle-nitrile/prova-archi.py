"""prova-archi.py — la verifica che conta: `archi_leiden` (solo triangolo) deve dare ESATTAMENTE
la stessa cosa di `simmetrizza` seguita da `triangolo`. Se non e' cosi', l'ottimizzazione di memoria
ha cambiato il grafo, e tutto il resto non vale.
"""
import pathlib
import sys

import numpy as np
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import bolle as B

rng = np.random.default_rng(0)
n = B.N
righe, cols, vals = [], [], []
# un grafo sparso e ASIMMETRICO, con archi solo in un verso e archi nei due versi
for _ in range(200_000):
    i, j = int(rng.integers(0, n)), int(rng.integers(0, n))
    if i != j:
        righe.append(i)
        cols.append(j)
        vals.append(float(rng.random()))
    if rng.random() < 0.4:                     # circa meta' degli archi e' reciproca
        righe.append(j)
        cols.append(i)
        vals.append(float(rng.random()))
M = sp.csr_matrix((np.array(vals, np.float32), (righe, cols)), shape=(n, n)).tocsr()
M.sum_duplicates()
M.data = np.minimum(M.data, 1.0)
print(f"grafo di prova: {M.nnz:,} archi direzionali")

# --- il modo lungo
S = ((M + M.T) * 0.5).tocsr()
Mm = M.multiply(M.T).sqrt().tocsr()
LUNGO = (S + 2.0 * Mm).tocsr()
r1, c1, v1 = B.triangolo(LUNGO)
R1 = sp.csr_matrix((v1, (r1, c1)), shape=(n, n)).tocsr()

# --- il modo corto (quello che usiamo)
CORTO = B.archi_leiden(M)

diff = (R1 - CORTO)
print(f"lungo (triangolo di simmetrizza): {R1.nnz:,} archi")
print(f"corto (archi_leiden):             {CORTO.nnz:,} archi")
print(f"differenza: nnz {diff.nnz:,} · max |delta| {abs(diff.data).max() if diff.nnz else 0:.3e}")
simmetrico = abs(CORTO - CORTO.T).nnz
print(f"il corto e' triangolare? archi sotto la diagonale: "
      f"{int((CORTO.tocoo().row > CORTO.tocoo().col).sum()):,}")
ok = diff.nnz == 0
print("\n" + ("OK — IDENTICI: l'ottimizzazione non cambia il grafo" if ok
              else "!! DIVERSI: l'ottimizzazione ha cambiato il grafo, NON usarla"))
sys.exit(0 if ok else 1)
