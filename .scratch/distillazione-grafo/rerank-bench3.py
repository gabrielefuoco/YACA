"""rerank-bench3.py — fusione grafo ⊕ reranker, versione LEGGERA.

  py .scratch/distillazione-grafo/rerank-bench3.py

Tetti pensati per una GPU condivisa col desktop: 120 semi × 20 candidati = 2.400 coppie,
batch 8, max 320 token, VRAM limitata al 50% (un eccesso da' eccezione invece di far crashare).
"""
import json
import os
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from services.graph_dense import data as D

MODEL = 'Qwen/Qwen3-Reranker-0.6B'
SEMI = 499
KCAND = 40
KG = 20
BATCH = 6
MAXS = 320
CACHE = '.cache/rerank-scores.npz'

NL = chr(10)
PREFISSO = ('<|im_start|>system' + NL +
            'Judge whether the Document meets the requirements based on the Query and the Instruct '
            'provided. Note that the answer can only be "yes" or "no".<|im_end|>' + NL +
            '<|im_start|>user' + NL)
SUFFISSO = '<|im_end|>' + NL + '<|im_start|>assistant' + NL
ISTR = ('The user has just watched and loved the query film. Judge whether the document is a film '
        'they would choose next. Ignore mere subject overlap such as the same animals, jobs or '
        'settings.')

B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']; YEAR = B['year']
z = np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))
del z
ov = pd.read_parquet('services/graph_dense/data/overview-en.parquet')
ovw = {k: (str(o) if isinstance(o, str) else '') for k, o in zip(ov['chiave'], ov['overview'])}
del ov
g = json.load(open('.scratch/ml-collaborativo/gold/cross-merged.json', encoding='utf-8'))
casi = []
for s in g['sources']:
    i = RO.get(s['id'])
    if i is None: continue
    l = [RO[x['id']] for x in s['links'] if x['id'] in RO]
    if l: casi.append((i, l))
casi = casi[:SEMI]
print(f'semi: {len(casi)}', flush=True)


def doc(j):
    anno = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    return f'{T[j]}{anno}. {ovw.get(B["keys"][j], "")[:420]}'


seeds, cands = [], []
for i, _ in casi:
    r = M.getrow(i)
    c = [int(j) for j in r.indices[np.argsort(-r.data)][:KCAND] if j != i]
    seeds.append(i); cands.append(c)

testi = []
for i, c in zip(seeds, cands):
    q = doc(i)
    for j in c:
        testi.append(PREFISSO + '<Instruct>: ' + ISTR + NL + '<Query>: ' + q + NL +
                     '<Document>: ' + doc(j) + SUFFISSO)
print(f'coppie: {len(testi):,} · batch {BATCH} · max {MAXS} token', flush=True)

if os.path.exists(CACHE):
    scelti = np.load(CACHE)['scores']
    print('score dalla cache', flush=True)
else:
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    if dev == 'cuda':
        torch.cuda.set_per_process_memory_fraction(0.5, 0)
        torch.cuda.empty_cache()
    tok = AutoTokenizer.from_pretrained(MODEL, padding_side='left')
    mod = AutoModelForCausalLM.from_pretrained(
        MODEL, dtype=torch.float16 if dev == 'cuda' else torch.float32,
        attn_implementation='sdpa').to(dev).eval()
    id_si = tok.convert_tokens_to_ids('yes'); id_no = tok.convert_tokens_to_ids('no')
    print(f'modello su {dev} · token yes={id_si} no={id_no}', flush=True)
    scelti = np.zeros(len(testi), np.float32)
    t0 = time.time()
    with torch.inference_mode():
        for st in range(0, len(testi), BATCH):
            b = tok(testi[st:st + BATCH], return_tensors='pt', padding=True,
                    truncation=True, max_length=MAXS).to(dev)
            lg = mod(**b, logits_to_keep=1).logits[:, -1, :]
            par = torch.stack([lg[:, id_no], lg[:, id_si]], dim=1).float()
            scelti[st:st + BATCH] = torch.nn.functional.softmax(par, dim=1)[:, 1].cpu().numpy()
            if (st // BATCH) % 20 == 0:
                print(f'  {st:,}/{len(testi):,} · {time.time()-t0:.0f}s', flush=True)
    np.savez_compressed(CACHE, scores=scelti)
    print(f'fatto in {time.time()-t0:.0f}s · mediana {np.median(scelti):.4f}', flush=True)

rank_rer = {}; k = 0
for i, c in zip(seeds, cands):
    s = scelti[k:k + len(c)]; k += len(c)
    rank_rer[i] = {j: p for p, j in enumerate([c[x] for x in np.argsort(-s)])}
rank_grafo = {i: {j: p for p, j in enumerate(c)} for i, c in zip(seeds, cands)}

print()
print('| mu | R@10 | R@20 |')
print('|---|---:|---:|')
for mu in (0.0, 0.1, 0.2, 0.3, 0.5, 1.0):
    r10 = []; r20 = []
    for i, links in casi:
        rg = rank_grafo[i]; rr = rank_rer[i]
        comb = sorted(rg, key=lambda j: -(1 / (KG + rg[j]) + mu / (KG + rr.get(j, KG + KCAND))))
        pos = {j: p + 1 for p, j in enumerate(comb)}
        r10.append(sum(1 for j in links if pos.get(int(j), 10 ** 9) <= 10) / len(links))
        r20.append(sum(1 for j in links if pos.get(int(j), 10 ** 9) <= 20) / len(links))
    print(f'| {mu} | {np.mean(r10):.3f} | {np.mean(r20):.3f} |', flush=True)
