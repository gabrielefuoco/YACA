"""rerank-test.py — reranker vero (Qwen3-Reranker-0.6B) sui top-100 di V14.

  py .scratch/distillazione-grafo/rerank-test.py movie:329 40

Prende i primi N candidati dal grafo, li riordina col cross-encoder usando titolo + trama, e stampa
il confronto: chi sale, chi scende, e dove finiscono gli item di bassa qualita'.
"""
import sys

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch
from sentence_transformers import CrossEncoder

from services.graph_dense import data as D

MODEL = 'Qwen/Qwen3-Reranker-0.6B'
chiave = sys.argv[1] if len(sys.argv) > 1 else 'movie:329'
K = int(sys.argv[2]) if len(sys.argv) > 2 else 40

B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']; VOT = B['VOT']; YEAR = B['year']
z = np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))

ov = pd.read_parquet('services/graph_dense/data/overview-en.parquet')
txt = {k: (str(t), str(o)) for k, t, o in zip(ov['chiave'], ov['titolo'], ov['overview'])}

i = RO[chiave]
r = M.getrow(i)
order = r.indices[np.argsort(-r.data)][:K]
cand = [int(j) for j in order if j != i]

def doc(j):
    key = B['keys'][j]
    t, o = txt.get(key, (T[j], ''))
    return f"{t} ({int(YEAR[j]) if YEAR[j] > 0 else '?'}). {o[:700]}"

q_t, q_o = txt.get(chiave, (T[i], ''))
query = f"{q_t} ({int(YEAR[i]) if YEAR[i] > 0 else '?'}). {q_o[:700]}"

print(f'query: {q_t} · {len(cand)} candidati dal grafo')
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f'carico {MODEL} su {dev}...', flush=True)
ce = CrossEncoder(MODEL, max_length=1024, device=dev,
                  model_kwargs={'torch_dtype': torch.float16} if dev == 'cuda' else {})
print('  caricato', flush=True)

pairs = [[query, doc(j)] for j in cand]
with torch.no_grad():
    scores = ce.predict(pairs, convert_to_numpy=True, batch_size=8, show_progress_bar=False)
scores = 1.0 / (1.0 + np.exp(-scores.astype(np.float64)))    # sigmoide

prima = {j: p + 1 for p, j in enumerate(cand)}
dopo = [cand[x] for x in np.argsort(-scores)]
print(f'\n{"dopo":>5} {"prima":>6} {"rif":>6} {"voti":>8}  titolo')
for p, j in enumerate(dopo[:20], 1):
    rif = f'{prima[j]-p:+d}'
    print(f'{p:>5} {prima[j]:>6} {rif:>6} {VOT[j]:>8.0f}  {T[j]}')
print('\n-- usciti dai primi 20 --')
for j in [x for x in cand[:20] if x not in dopo[:20]]:
    print(f'  (era {prima[j]:>2}°) voti {VOT[j]:>7.0f}  {T[j]}')
print('\n-- entrati nei primi 20 --')
for j in [x for x in dopo[:20] if prima[x] > 20]:
    print(f"  (era {prima[x]:>3}°) voti {VOT[x]:>7.0f}  {T[x]}")
