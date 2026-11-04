"""rerank-v3.py — Qwen3-Reranker applicato COL TEMPLATE UFFICIALE.

  py .scratch/distillazione-grafo/rerank-v3.py movie:329 60

Il formato richiesto dal modello e':
  <|im_start|>system
  Judge whether the Document meets the requirements based on the Query and the Instruct provided.
  Note that the answer can only be "yes" or "no".<|im_end|>
  <|im_start|>user
  <Instruct>: {istruzione}
  <Query>: {query}
  <Document>: {documento}<|im_end|>
  <|im_start|>assistant

e si legge la probabilita' di "yes" rispetto a "no" all'ultimo token.
"""
import json
import sys

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from services.graph_dense import data as D

MODEL = 'Qwen/Qwen3-Reranker-0.6B'
chiave = sys.argv[1] if len(sys.argv) > 1 else 'movie:329'
K = int(sys.argv[2]) if len(sys.argv) > 2 else 60

PREFISSO = ('<|im_start|>system\nJudge whether the Document meets the requirements based on the '
            'Query and the Instruct provided. Note that the answer can only be "yes" or "no".'
            '<|im_end|>\n<|im_start|>user\n')
SUFFISSO = '<|im_end|>\n<|im_start|>assistant\n'

ISTRUZIONE_QUALITA = (
    "Valuta se il Document e' una buona PROSSIMA VISIONE per chi ha apprezzato la Query. "
    "Premia i titoli che si guardano davvero dopo: stessa qualita', stessa mano registica, "
    "stessa esperienza. NON premiare la somiglianza di parole o di trama: un film sui dinosauri "
    "non e' un buon suggerimento solo perche' parla di dinosauri. Penalizza remake minori, cloni "
    "a basso budget, compilation, spin-off televisivi e documentari di repertorio."
)
ISTRUZIONE_NEUTRA = "Given a film the user liked, judge whether the document is a good next watch."

B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']; VOT = B['VOT']; YEAR = B['year']
z = np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
ov = pd.read_parquet('services/graph_dense/data/overview-en.parquet')
overview = {k: (str(o) if isinstance(o, str) else '') for k, o in zip(ov['chiave'], ov['overview'])}
attr = {}
for f, pre in (('.cache/tmdb/movies.parquet', 'movie'), ('.cache/tmdb/tv.parquet', 'tv')):
    for row in pd.read_parquet(f).itertuples():
        i = RO.get(f'{pre}:{int(row.id)}')
        if i is None: continue
        def nomi(campo, quanti=3):
            v = getattr(row, campo, None)
            if not isinstance(v, str): return []
            try: lst = json.loads(v)
            except Exception: return []
            return [str(e.get('name')) for e in lst if isinstance(e, dict) and e.get('name')][:quanti]
        attr[i] = dict(gen=nomi('genres', 4), reg=nomi('directors', 2) or nomi('created_by', 2))

i = RO[chiave]
r = M.getrow(i)
cand = [int(j) for j in r.indices[np.argsort(-r.data)][:K] if j != i]

def breve(j):
    anno = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    return f'{T[j]}{anno}. {overview.get(B["keys"][j], "")[:600]}'

def ricco(j):
    a = attr.get(j, {})
    anno = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    return (f'{T[j]}{anno}. Generi: {", ".join(a.get("gen", [])) or "-"}. '
            f'Regia: {", ".join(a.get("reg", [])) or "-"}. Voti: {int(VOT[j])}. '
            f'{overview.get(B["keys"][j], "")[:400]}')

dev = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f'carico {MODEL} su {dev}...', flush=True)
tok = AutoTokenizer.from_pretrained(MODEL, padding_side='left')
mod = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=torch.float16 if dev == 'cuda' else torch.float32).to(dev).eval()
id_si = tok.convert_tokens_to_ids('yes'); id_no = tok.convert_tokens_to_ids('no')
print(f'  token yes={id_si} no={id_no}', flush=True)

def punteggi(istruzione, q, docf, quanti=8):
    testi = [PREFISSO + f'<Instruct>: {istruzione}\n<Query>: {q}\n<Document>: {docf(j)}' + SUFFISSO for j in cand]
    out = []
    with torch.no_grad():
        for st in range(0, len(testi), quanti):
            b = tok(testi[st:st + quanti], return_tensors='pt', padding=True, truncation=True, max_length=2048).to(dev)
            logits = mod(**b).logits[:, -1, :]
            par = torch.stack([logits[:, id_no], logits[:, id_si]], dim=1).float()
            out.append(torch.nn.functional.softmax(par, dim=1)[:, 1].cpu().numpy())
    return np.concatenate(out)

prima = {j: p + 1 for p, j in enumerate(cand)}
q_b = breve(i); q_r = ricco(i)
VAR = {
    'A istruzione neutra + trama': (ISTRUZIONE_NEUTRA, q_b, breve),
    'B istruzione qualità + trama': (ISTRUZIONE_QUALITA, q_b, breve),
    'C istruzione qualità + ricco': (ISTRUZIONE_QUALITA, q_r, ricco),
}
for nome, (istr, q, docf) in VAR.items():
    sc = punteggi(istr, q, docf)
    dopo = [cand[x] for x in np.argsort(-sc)]
    print(f'\n=== {nome} — primi 10 (score) ===')
    for p, j in enumerate(dopo[:10], 1):
        print(f'  {p:>2} (era {prima[j]:>2}) {sc[dopo.index(j)]:.3f} voti {VOT[j]:>7.0f}  {T[j]}')
