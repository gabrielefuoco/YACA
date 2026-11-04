"""rerank-v2.py — tre prompt a confronto sullo stesso film.

  py .scratch/distillazione-grafo/rerank-v2.py movie:329 60

A: titolo + trama (quello di prima)
B: istruzione di qualita' + titolo + trama
C: istruzione di qualita' + documento arricchito (generi, regia, voti, trama breve)
"""
import json
import sys

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch
from sentence_transformers import CrossEncoder

from services.graph_dense import data as D

MODEL = 'Qwen/Qwen3-Reranker-0.6B'
chiave = sys.argv[1] if len(sys.argv) > 1 else 'movie:329'
K = int(sys.argv[2]) if len(sys.argv) > 2 else 60

ISTRUZIONE = (
    "Valuta se il Document e' una buona PROSSIMA VISIONE per chi ha apprezzato la Query. "
    "Premia i titoli che si guardano davvero dopo: stessa qualita', stessa mano registica, "
    "stessa esperienza di visione. NON premiare la somiglianza di parole o di trama: "
    "un film sui dinosauri non e' un buon suggerimento solo perche' parla di dinosauri. "
    "Penalizza remake minori, cloni a basso budget, compilation, spin-off televisivi e "
    "documentari di repertorio. Rispondi tenendo conto del giudizio di un appassionato."
)

B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']; VOT = B['VOT']; YEAR = B['year']
z = np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))

ov = pd.read_parquet('services/graph_dense/data/overview-en.parquet')
overview = {k: (str(o) if isinstance(o, str) else '') for k, o in zip(ov['chiave'], ov['overview'])}
attr = {}
for f, pre in (('.cache/tmdb/movies.parquet', 'movie'), ('.cache/tmdb/tv.parquet', 'tv')):
    d = pd.read_parquet(f)
    for row in d.itertuples():
        i = RO.get(f'{pre}:{int(row.id)}')
        if i is None: continue
        def nomi(campo, quanti=3):
            v = getattr(row, campo, None)
            if not isinstance(v, str): return []
            try: lst = json.loads(v)
            except Exception: return []
            return [str(e.get('name')) for e in lst if isinstance(e, dict) and e.get('name')][:quanti]
        attr[i] = dict(gen=nomi('genres', 4), reg=nomi('directors', 2) or nomi('created_by', 2),
                       prod=nomi('production_companies', 2))
print(f'attributi per {len(attr):,} titoli', flush=True)

i = RO[chiave]
r = M.getrow(i)
cand = [int(j) for j in r.indices[np.argsort(-r.data)][:K] if j != i]

def testa(j, breve=False):
    t = str(T[j]); a = attr.get(j, {})
    anno = f" ({int(YEAR[j])})" if YEAR[j] > 0 else ''
    o = overview.get(B['keys'][j], '')
    return f'{t}{anno}. {o[:250 if breve else 700]}'

def ricco(j):
    t = str(T[j]); a = attr.get(j, {})
    anno = f" ({int(YEAR[j])})" if YEAR[j] > 0 else ''
    gen = ', '.join(a.get('gen', [])) or '-'
    reg = ', '.join(a.get('reg', [])) or '-'
    o = overview.get(B['keys'][j], '')
    return (f'{t}{anno}. Generi: {gen}. Regia/creazione: {reg}. '
            f'Voti TMDB: {int(VOT[j])}. Trama: {o[:400]}')

q_breve = testa(i, breve=True)
q_ricco = ricco(i)
VAR = {
    'A titolo+trama': (q_breve, lambda j: testa(j)),
    'B istruzione+trama': (f'<Instruct>: {ISTRUZIONE}\n<Query>: {q_breve}', lambda j: testa(j)),
    'C istruzione+ricco': (f'<Instruct>: {ISTRUZIONE}\n<Query>: {q_ricco}', ricco),
}

dev = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f'carico {MODEL} su {dev}...', flush=True)
ce = CrossEncoder(MODEL, max_length=2048, device=dev,
                  model_kwargs={'torch_dtype': torch.float16} if dev == 'cuda' else {})

prima = {j: p + 1 for p, j in enumerate(cand)}
for nome, (q, docf) in VAR.items():
    pairs = [[q, docf(j)] for j in cand]
    with torch.no_grad():
        sc = ce.predict(pairs, convert_to_numpy=True, batch_size=8, show_progress_bar=False)
    sc = 1.0 / (1.0 + np.exp(-sc.astype(np.float64)))
    dopo = [cand[x] for x in np.argsort(-sc)]
    print(f'\n=== {nome} — nuovi primi 10 ===')
    for p, j in enumerate(dopo[:10], 1):
        print(f'  {p:>2} (era {prima[j]:>2}) voti {VOT[j]:>7.0f}  {T[j]}')
