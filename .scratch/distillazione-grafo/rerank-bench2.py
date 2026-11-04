"""rerank-bench2.py — fusione grafo ⊕ reranker sul banco dei 499 semi, OTTIMIZZATO.

  py .scratch/distillazione-grafo/rerank-bench2.py

Ottimizzazioni: batching globale (tutte le coppie in una lista sola), torch.inference_mode,
attn_implementation='sdpa', max_length=512. Gli score si salvano su disco: se interrompi, riprende.
"""
import json
import os

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from services.graph_dense import data as D

MODEL = 'Qwen/Qwen3-Reranker-0.6B'
KCAND = 20
KG = 20
BATCH = 8
MAXS = 320
SEMI = 120
CACHE = '.cache/rerank-scores.npz'
PREFISSO = ('<|im_start|>system\nJudge whether the Document meets the requirements based on the '
            'Query and the Instruct provided. Note that the answer can only be "yes" or "no".'
            '<|im_end|>\n<|im_start|>user\n')
SUFFISSO = '<|im_end|>\n<|im_start|>assistant\n'
ISTR = ('The user has just watched and loved the query film. Judge whether the document is a film '
        'they would choose next. Ignore mere subject overlap such as the same animals, jobs or '
        'settings.')

B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']; YEAR = B['year']
z = np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
ov = pd.read_parquet('services/graph_dense/data/overview-en.parquet')
ovw = {k: (str(o) if isinstance(o, str) else '') for k, o in zip(ov['chiave'], ov['overview'])}
g = json.load(open('.scratch/ml-collaborativo/gold/cross-merged.json', encoding='utf-8'))
casi = []
for s in g['sources']:
    i = RO.get(s['id'])
    if i is None: continue
    l = [RO[x['id']] for x in s['links'] if x['id'] in RO]
    if l: casi.append((i, l))

def doc(j):
    anno = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    return f'{T[j]}{anno}. {ovw.get(B["keys"][j], "")[:420]}'

# 1) tutti i candidati per seme, e tutti i testi in una lista sola
seeds, cands = [], []
for i, _ in casi:
    r = M.getrow(i)
    c = [int(j) for j in r.indices[np.argsort(-r.data)][:KCAND] if j != i]
    seeds.append(i); cands.append(c)
testi, owner = [], []
for n, (i, c) in enumerate(zip(seeds, cands)):
    q = doc(i)
    for j in c:
        testi.append(PREFISSO + f'<Instruct>: {ISTR}\n<Query>: {q}\n<Document>: {doc(j)}' + SUFFISSO)
        owner.append(n)
del testi
casi = casi[:SEMI]
seeds, cands = seeds[:SEMI], cands[:SEMI]
testi, owner = [], []
for n, (i, c) in enumerate(zip(seeds, cands)):
    q = doc(i)
    for j in c:
        testi.append(PREFISSO + f'<Instruct>: {ISTR}
<Query>: {q}
<Document>: {doc(j)}' + SUFFISSO)
        owner.append(n)
print(f'coppie totali: {len(testi):,} · semi {len(casi)} · batch {BATCH} · max {MAXS} token', flush=True)

if os.path.exists(CACHE):
    d = np.load(CACHE, allow_pickle=True)
    scelti = d['scores']
    print('score ripresi dalla cache', flush=True)
else:
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'carico {MODEL} su {dev} (sdpa)...', flush=True)
    tok = AutoTokenizer.from_pretrained(MODEL, padding_side='left')
    if dev == 'cuda':
        torch.cuda.set_per_process_memory_fraction(0.5, 0)
        torch.cuda.empty_cache()
    mod = AutoModelForCausalLM.from_pretrained(
        MODEL, torch_dtype=torch.float16 if dev == 'cuda' else torch.float32,
        attn_implementation='sdpa').to(dev).eval()
    id_si = tok.convert_tokens_to_ids('yes'); id_no = tok.convert_tokens_to_ids('no')
    scelti = np.zeros(len(testi), np.float32)
    import time
    t0 = time.time()
    with torch.inference_mode():
        for st in range(0, len(testi), BATCH):
            b = tok(testi[st:st + BATCH], return_tensors='pt', padding=True,
                    truncation=True, max_length=MAXS).to(dev)
            lg = mod(**b).logits[:, -1, :]
            par = torch.stack([lg[:, id_no], lg[:, id_si]], dim=1).float()
            scelti[st:st + BATCH] = torch.nn.functional.softmax(par, dim=1)[:, 1].cpu().numpy()
            if dev == 'cuda' and (st // BATCH) % 50 == 0:
                torch.cuda.empty_cache()
            if (st // BATCH) % 20 == 0:
                print(f'  {st + len(b["input_ids"]):,}/{len(testi):,} · {time.time()-t0:.0f}s', flush=True)
    np.savez_compressed(CACHE, scores=scelti)
    print(f'fatto in {time.time()-t0:.0f}s · score mediano {np.median(scelti):.4f}', flush=True)

# 2) ranghi
rank_rer = {}
k = 0
for n, (i, c) in enumerate(zip(seeds, cands)):
    s = scelti[k:k + len(c)]; k += len(c)
    rank_rer[i] = {j: p for p, j in enumerate([c[x] for x in np.argsort(-s)])}
rank_grafo = {}
for i, c in zip(seeds, cands):
    rank_grafo[i] = {j: p for p, j in enumerate(c)}

def val(mu):
    r10 = []; r20 = []
    for i, links in casi:
        rg = rank_grafo[i]; rr = rank_rer[i]
        comb = sorted(rg, key=lambda j: -(1 / (KG + rg[j]) + mu / (KG + rr.get(j, KG + KCAND))))
        pos = {j: p + 1 for p, j in enumerate(comb)}
        r10.append(sum(1 for j in links if pos.get(int(j), 10 ** 9) <= 10) / len(links))
        r20.append(sum(1 for j in links if pos.get(int(j), 10 ** 9) <= 20) / len(links))
    return np.mean(r10), np.mean(r20)

print('\n| mu | R@10 | R@20 |')
print('|---|---:|---:|')
for mu in (0.0, 0.1, 0.2, 0.3, 0.5, 1.0):
    a, b = val(mu); print(f'| {mu} | {a:.3f} | {b:.3f} |', flush=True)
