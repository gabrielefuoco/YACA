"""rerank-v5.py — fusione misurata fra ordine del grafo e ordine del reranker.

  py .scratch/distillazione-grafo/rerank-v5.py

score = 1/(20+rango_grafo) + mu * 1/(20+rango_rerank)
mu piccolo -> il grafo resta dominante, il reranker puo' solo spostare.
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
ISTR = {
    'P1 informativo': 'Given a film a user loved, retrieve films the same user would watch next '
                      'and enjoy: comparable craft, ambition and viewing experience.',
    'P2 anti-tema': 'The user has just watched and loved the query film. Judge whether the document '
                    'is a film they would choose next. Ignore mere subject overlap such as the same '
                    'animals, jobs or settings; reward the same level of craft and ambition.',
}
DOC = {'trama': True, 'solo titolo': False}
MU = (0.3, 1.0)

B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']; VOT = B['VOT']; YEAR = B['year']
z = np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
ov = pd.read_parquet('services/graph_dense/data/overview-en.parquet')
overview = {k: (str(o) if isinstance(o, str) else '') for k, o in zip(ov['chiave'], ov['overview'])}

def doc(j, con_trama):
    anno = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    base = f'{T[j]}{anno}.'
    return base + (f' {overview.get(B["keys"][j], "")[:500]}' if con_trama else '')

dev = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f'carico {MODEL} su {dev}...', flush=True)
tok = AutoTokenizer.from_pretrained(MODEL, padding_side='left')
mod = AutoModelForCausalLM.from_pretrained(
    MODEL, torch_dtype=torch.float16 if dev == 'cuda' else torch.float32).to(dev).eval()
id_si = tok.convert_tokens_to_ids('yes'); id_no = tok.convert_tokens_to_ids('no')

def punteggi(istr, query, cand, con_trama):
    testi = [PREFISSO + f'<Instruct>: {istr}\n<Query>: {query}\n<Document>: {doc(j, con_trama)}' + SUFFISSO
             for j in cand]
    out = []
    with torch.no_grad():
        for st in range(0, len(testi), 16):
            b = tok(testi[st:st + 16], return_tensors='pt', padding=True,
                    truncation=True, max_length=1536).to(dev)
            lg = mod(**b).logits[:, -1, :]
            par = torch.stack([lg[:, id_no], lg[:, id_si]], dim=1).float()
            out.append(torch.nn.functional.softmax(par, dim=1)[:, 1].cpu().numpy())
    return np.concatenate(out)

KG = 20
stabilita = {}
for chiave, nome in FILM:
    i = RO[chiave]; r = M.getrow(i)
    cand = [int(j) for j in r.indices[np.argsort(-r.data)][:K] if j != i]
    rg = {j: p for p, j in enumerate(cand)}          # rango grafo 0-based
    print(f'\n{"="*100}\n{nome} — grafo: ' + ' · '.join(T[j] for j in cand[:8]))
    for pnome, istr in ISTR.items():
        for dname, ct in DOC.items():
            sc = punteggi(istr, doc(i, ct), cand, ct)
            rr = {j: p for p, j in enumerate([cand[x] for x in np.argsort(-sc)])}
            for mu in MU:
                comb = sorted(cand, key=lambda j: -(1/(KG+rg[j]) + mu/(KG+rr[j])))
                tenuti = len(set(comb[:8]) & set(cand[:8]))
                stabilita.setdefault((pnome, dname, mu), []).append(tenuti/8)
                if mu == 0.3:
                    print(f'  {pnome:<16} {dname:<12} μ={mu}: ' + ' · '.join(T[j] for j in comb[:6]))
print('\n--- stabilita (quanti degli 8 migliori del grafo restano negli 8 fusi) ---')
for k, v in stabilita.items():
    print(f'  {k[0]:<16} {k[1]:<12} μ={k[2]}: {100*np.mean(v):.0f}%')
