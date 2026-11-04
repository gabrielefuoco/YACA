"""rerank-v4.py — solo titolo + trama, template ufficiale, su piu' film.

  py .scratch/distillazione-grafo/rerank-v4.py
"""
import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from services.graph_dense import data as D

MODEL = 'Qwen/Qwen3-Reranker-0.6B'
K = 60
FILM = [('movie:329', 'Jurassic Park'), ('movie:496243', 'Parasite'), ('movie:807', 'Se7en'),
        ('movie:422', '8 e mezzo'), ('movie:157336', 'Interstellar')]

PREFISSO = ('<|im_start|>system\nJudge whether the Document meets the requirements based on the '
            'Query and the Instruct provided. Note that the answer can only be "yes" or "no".'
            '<|im_end|>\n<|im_start|>user\n')
SUFFISSO = '<|im_end|>\n<|im_start|>assistant\n'
ISTR = ('Given a film the user liked, judge whether the document is a film they would enjoy '
        'watching next: same quality and viewing experience, not merely the same subject.')

B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']; VOT = B['VOT']; YEAR = B['year']
z = np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
ov = pd.read_parquet('services/graph_dense/data/overview-en.parquet')
overview = {k: (str(o) if isinstance(o, str) else '') for k, o in zip(ov['chiave'], ov['overview'])}

def doc(j):
    anno = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    return f'{T[j]}{anno}. {overview.get(B["keys"][j], "")[:500]}'

dev = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f'carico {MODEL} su {dev}...', flush=True)
tok = AutoTokenizer.from_pretrained(MODEL, padding_side='left')
mod = AutoModelForCausalLM.from_pretrained(
    MODEL, torch_dtype=torch.float16 if dev == 'cuda' else torch.float32).to(dev).eval()
id_si = tok.convert_tokens_to_ids('yes'); id_no = tok.convert_tokens_to_ids('no')

def punteggi(query, cand, quanti=8):
    testi = [PREFISSO + f'<Instruct>: {ISTR}\n<Query>: {query}\n<Document>: {doc(j)}' + SUFFISSO
             for j in cand]
    out = []
    with torch.no_grad():
        for st in range(0, len(testi), quanti):
            b = tok(testi[st:st + quanti], return_tensors='pt', padding=True,
                    truncation=True, max_length=2048).to(dev)
            lg = mod(**b).logits[:, -1, :]
            par = torch.stack([lg[:, id_no], lg[:, id_si]], dim=1).float()
            out.append(torch.nn.functional.softmax(par, dim=1)[:, 1].cpu().numpy())
    return np.concatenate(out)

for chiave, nome in FILM:
    i = RO[chiave]
    r = M.getrow(i)
    cand = [int(j) for j in r.indices[np.argsort(-r.data)][:K] if j != i]
    sc = punteggi(doc(i), cand)
    dopo = [cand[x] for x in np.argsort(-sc)]
    prima = {j: p + 1 for p, j in enumerate(cand)}
    print(f'\n{"="*100}\n{nome} · {len(cand)} candidati · score max {sc.max():.3f} · '
          f'mediana {np.median(sc):.3f}')
    print(f'  {"prima":>5} → {"dopo":>4}  voti    titolo')
    for p, j in enumerate(dopo[:8], 1):
        print(f'  {prima[j]:>5} → {p:>4}  {VOT[j]:>7.0f}  {T[j]}')
    usciti = [j for j in cand[:8] if j not in dopo[:8]]
    if usciti:
        print('  usciti: ' + ' · '.join(str(T[j]) for j in usciti))
